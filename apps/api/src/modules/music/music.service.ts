import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { waitUntil } from "@vercel/functions";
import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import type { SongMode } from "../../common/domain/plans";
import { DbService } from "../../common/db/db.service";
import { MiniMaxApiError, MiniMaxService, type MiniMaxCoverResult } from "../../common/minimax/minimax.service";
import { getPlatformSettings } from "../../common/settings/platform-settings";
import { StorageService } from "../../common/storage/storage.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { CreateMvTaskDto } from "./dto/create-mv-task.dto";
import { GenerateMusicDto } from "./dto/generate-music.dto";
import { PublishSongDto } from "./dto/publish-song.dto";
import { ToggleCommentLikeDto } from "./dto/toggle-comment-like.dto";

const MINIMAX_MUSIC_ENDPOINT = "/v1/music_generation";
const MINIMAX_IMAGE_ENDPOINT = "/v1/image_generation";
const MINIMAX_VIDEO_ENDPOINT = "/v1/video_generation";
const MINIMAX_VIDEO_QUERY_ENDPOINT = "/v1/query/video_generation";
const MINIMAX_VIDEO_FILE_ENDPOINT = "/v1/files/retrieve";
const DEFAULT_STALE_GENERATION_MS = 7 * 60 * 1000;

interface MusicTaskRow {
  id: string;
  status: string;
  title: string | null;
  prompt: string;
  style: string;
  mood: string;
  lyrics: string | null;
  mode: SongMode;
  lyrics_optimizer: boolean;
  error_code: string | null;
  error_message: string | null;
  quota_refunded: boolean;
  song_id: string | null;
  audio_url: string | null;
  cover_url: string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SongRow {
  id: string;
  task_id: string | null;
  user_id: string;
  title: string;
  theme: string;
  style: string;
  mood: string;
  lyrics: string | null;
  audio_url: string;
  cover_url: string | null;
  duration_seconds: number | null;
  mode: SongMode;
  visibility: string;
  likes_count: number;
  favorites_count: number;
  view_count: number;
  play_count: number;
  comments_count: number;
  created_at: Date | string;
  published_at: Date | string | null;
  updated_at: Date | string;
}

interface MvTaskRow {
  id: string;
  user_id: string;
  song_id: string;
  status: string;
  prompt: string;
  image_count: number;
  image_names: unknown;
  video_url: string | null;
  video_storage_key: string | null;
  minimax_model: string;
  minimax_task_id: string | null;
  minimax_file_id: string | null;
  minimax_status_code: number | null;
  estimated_cost_cents: number;
  error_code: string | null;
  error_message: string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  song_title?: string | null;
  song_cover_url?: string | null;
}

interface MvSourceSongRow {
  id: string;
  user_id: string;
  title: string;
  theme: string;
  style: string;
  mood: string;
  cover_url: string | null;
}

interface CommentRow {
  id: string;
  body: string;
  likes_count: number;
  liked_by_me: boolean;
  created_at: Date | string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface PublishSongRow {
  id: string;
  user_id: string;
  visibility: string;
}

interface BalanceRow {
  points_balance: number;
}

interface MiniMaxFailure {
  message: string;
  statusCode?: number;
  errorCode?: string;
  requestPayload: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
  durationMs?: number;
}

interface UploadedCover {
  coverUrl: string | null;
  coverStorageKey: string | null;
  estimatedCostCents: number;
}

@Injectable()
export class MusicService {
  constructor(
    private readonly db: DbService,
    private readonly minimax: MiniMaxService,
    private readonly storage: StorageService
  ) {}

  async generate(userId: string, dto: GenerateMusicDto) {
    if (dto.referenceAudioUrl?.trim()) {
      throw new BadRequestException("暂不支持上传参考音乐");
    }

    const lyricsOptimizer = dto.lyricsOptimizer ?? true;
    if (dto.mode === "vocal" && !dto.lyrics?.trim() && !lyricsOptimizer) {
      throw new BadRequestException("人声歌曲需要填写歌词，或开启歌词智能优化");
    }

    await this.db.ensureUser(userId);
    await this.assertGenerationQuota(userId);

    const task = await this.db.one<MusicTaskRow>(
      `insert into music_tasks (
         user_id, status, title, prompt, style, mood, lyrics, mode, lyrics_optimizer,
         minimax_model, started_at
       )
       values ($1, 'queued', $2, $3, $4, $5, $6, $7, $8, $9, null)
       returning
         id, status, title, prompt, style, mood, lyrics, mode, lyrics_optimizer, error_code, error_message,
         quota_refunded, null::uuid as song_id, null::text as audio_url, null::text as cover_url,
         started_at, completed_at, created_at, updated_at`,
      [
        userId,
        normalizedTitle(dto.title),
        dto.theme.trim(),
        dto.style.trim(),
        dto.mood.trim(),
        emptyToNull(dto.lyrics),
        dto.mode,
        lyricsOptimizer,
        this.minimax.modelName
      ]
    );

    if (!task) {
      throw new BadGatewayException("无法创建音乐生成任务");
    }

    if (shouldRunGenerationInline()) {
      await this.runGenerationTask(userId, task.id, dto, lyricsOptimizer);
      return {
        task: await this.getTask(userId, task.id),
        song: null
      };
    }

    if (!shouldRunGenerationOnPoll()) {
      runInBackground(`music-task:${task.id}`, () => this.runGenerationTask(userId, task.id, dto, lyricsOptimizer));
    }

    return {
      task: mapTask(task),
      song: null
    };
  }

  private async runGenerationTask(userId: string, taskId: string, dto: GenerateMusicDto, lyricsOptimizer: boolean): Promise<void> {
    let miniMaxLogWritten = false;

    try {
      const claimed = await this.db.one<{ id: string }>(
        `update music_tasks
         set status = 'generating',
             started_at = now(),
             error_code = null,
             error_message = null
         where id = $1
           and user_id = $2
           and status in ('queued', 'generating')
         returning id`,
        [taskId, userId]
      );
      if (!claimed) {
        return;
      }

      const result = await this.minimax.generateMusic({
        prompt: buildMiniMaxPrompt(dto),
        lyrics: emptyToNull(dto.lyrics) ?? undefined,
        isInstrumental: dto.mode === "instrumental",
        lyricsOptimizer
      });

      await this.writeMiniMaxLog({
        taskId,
        endpoint: MINIMAX_MUSIC_ENDPOINT,
        model: stringFromPayload(result.requestPayload, "model") ?? this.minimax.modelName,
        requestPayload: result.requestPayload,
        responsePayload: result.responsePayload,
        statusCode: result.statusCode,
        estimatedCostCents: result.estimatedCostCents,
        durationMs: result.durationMs
      });
      miniMaxLogWritten = true;

      const audioExtension = result.contentType === "audio/wav" ? "wav" : "mp3";
      const audioStorageKey = `music/${userId}/${taskId}/${randomUUID()}.${audioExtension}`;
      const audioUrl = await this.storage.uploadBuffer(audioStorageKey, result.audioBuffer, result.contentType ?? "audio/mpeg");
      const cover = await this.createAndUploadCover(userId, taskId, dto);
      const totalEstimatedCostCents = result.estimatedCostCents + cover.estimatedCostCents;
      await this.db.one<SongRow>(
        `insert into songs (
           task_id, user_id, title, theme, style, mood, lyrics, audio_url, audio_storage_key,
           cover_url, cover_storage_key, duration_seconds, mode, visibility
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'private')
         on conflict (task_id) do update
         set title = excluded.title,
             theme = excluded.theme,
             style = excluded.style,
             mood = excluded.mood,
             lyrics = excluded.lyrics,
             audio_url = excluded.audio_url,
             audio_storage_key = excluded.audio_storage_key,
             cover_url = excluded.cover_url,
             cover_storage_key = excluded.cover_storage_key,
             duration_seconds = excluded.duration_seconds,
             mode = excluded.mode,
             updated_at = now()
         returning *`,
        [
          taskId,
          userId,
          normalizedTitle(dto.title),
          dto.theme.trim(),
          dto.style.trim(),
          dto.mood.trim(),
          emptyToNull(dto.lyrics),
          audioUrl,
          audioStorageKey,
          cover.coverUrl,
          cover.coverStorageKey,
          result.durationSeconds ?? null,
          dto.mode
        ]
      );

      await this.db.query(
        `update music_tasks
         set status = 'succeeded',
             minimax_trace_id = $2,
             minimax_request_id = $3,
             minimax_status_code = $4,
             estimated_cost_cents = $5,
             completed_at = now(),
             error_code = null,
             error_message = null
         where id = $1`,
        [
          taskId,
          result.traceId ?? null,
          stringFromPayload(result.responsePayload, "request_id"),
          result.statusCode,
          totalEstimatedCostCents
        ]
      );
    } catch (error) {
      const failure = normalizeMiniMaxFailure(error);

      if (!miniMaxLogWritten) {
        await this.writeMiniMaxLog({
          taskId,
          endpoint: MINIMAX_MUSIC_ENDPOINT,
          model: this.minimax.modelName,
          requestPayload: failure.requestPayload,
          responsePayload: failure.responsePayload,
          statusCode: failure.statusCode,
          estimatedCostCents: 0,
          errorCode: failure.errorCode,
          errorMessage: failure.message,
          durationMs: failure.durationMs
        });
      }

      await this.db.query(
        `update music_tasks
         set status = 'failed',
             minimax_status_code = $2,
             error_code = $3,
             error_message = $4,
             quota_refunded = true,
             completed_at = now()
         where id = $1`,
        [taskId, failure.statusCode ?? null, failure.errorCode ?? "generation_failed", failure.message]
      );
    }
  }

  async getTask(userId: string, taskId: string) {
    let task = await this.findTask(userId, taskId);

    if (!task) {
      throw new NotFoundException("生成任务不存在");
    }

    if (shouldRunGenerationOnPoll() && task.status === "queued") {
      await this.runGenerationTask(userId, task.id, dtoFromTask(task), task.lyrics_optimizer);
      task = await this.findTask(userId, taskId);
    } else if (isStaleGenerationTask(task)) {
      if (shouldRunGenerationOnPoll()) {
        await this.runGenerationTask(userId, task.id, dtoFromTask(task), task.lyrics_optimizer);
        task = await this.findTask(userId, taskId);
      } else {
        const staleTask = task;
        runInBackground(`music-task-recover:${staleTask.id}`, () =>
          this.runGenerationTask(userId, staleTask.id, dtoFromTask(staleTask), staleTask.lyrics_optimizer)
        );
      }
    }

    if (!task) {
      throw new NotFoundException("生成任务不存在");
    }

    return mapTask(task);
  }

  async getMyTasks(userId: string) {
    await this.db.ensureUser(userId);

    const rows = await this.db.query<MusicTaskRow>(
      `select
         mt.id, mt.status, mt.title, mt.prompt, mt.style, mt.mood, mt.lyrics, mt.mode,
         mt.lyrics_optimizer,
         mt.error_code, mt.error_message, mt.quota_refunded,
         s.id as song_id, s.audio_url, s.cover_url, mt.started_at, mt.completed_at, mt.created_at, mt.updated_at
       from music_tasks mt
       left join songs s on s.task_id = mt.id
       where mt.user_id = $1
       order by mt.created_at desc
       limit 100`,
      [userId]
    );

    return rows.map(mapTask);
  }

  private findTask(userId: string, taskId: string) {
    return this.db.one<MusicTaskRow>(
      `select
         mt.id, mt.status, mt.title, mt.prompt, mt.style, mt.mood, mt.lyrics, mt.mode,
         mt.lyrics_optimizer,
         mt.error_code, mt.error_message, mt.quota_refunded,
         s.id as song_id, s.audio_url, s.cover_url, mt.started_at, mt.completed_at, mt.created_at, mt.updated_at
       from music_tasks mt
       left join songs s on s.task_id = mt.id
       where mt.id = $1 and mt.user_id = $2`,
      [taskId, userId]
    );
  }

  async getMySongs(userId: string) {
    await this.db.ensureUser(userId);

    const rows = await this.db.query<SongRow>(
      `select *
       from songs
       where user_id = $1
       order by created_at desc
       limit 100`,
      [userId]
    );

    return rows.map(mapSong);
  }

  async createMvTask(userId: string, dto: CreateMvTaskDto) {
    if (!isMvFeatureEnabled()) {
      throw new BadRequestException("MV 制作功能暂未开放。");
    }

    await this.db.ensureUser(userId);

    const song = await this.db.one<MvSourceSongRow>(
      `select id, user_id, title, theme, style, mood, cover_url
       from songs
       where id = $1 and user_id = $2`,
      [dto.songId, userId]
    );

    if (!song) {
      throw new NotFoundException("作品不存在或已下架");
    }

    const imageNames = normalizeImageNames(dto.imageNames);
    const prompt = buildMvPrompt(song, dto);
    const task = await this.db.one<MvTaskRow>(
      `insert into mv_tasks (
         user_id, song_id, status, prompt, image_count, image_names, minimax_model
       )
       values ($1, $2, 'queued', $3, $4, $5::jsonb, $6)
       returning *`,
      [
        userId,
        song.id,
        prompt,
        Math.max(dto.imageCount ?? imageNames.length, imageNames.length),
        JSON.stringify(imageNames),
        this.minimax.videoModelName
      ]
    );

    if (!task) {
      throw new BadGatewayException("无法创建 MV 制作任务");
    }

    if (shouldRunGenerationInline()) {
      await this.runMvTask(userId, task.id, song);
      return {
        task: await this.getMvTask(userId, task.id)
      };
    }

    runInBackground(`mv-task:${task.id}`, () => this.runMvTask(userId, task.id, song));
    return {
      task: mapMvTask({ ...task, song_title: song.title, song_cover_url: song.cover_url })
    };
  }

  async getMvTask(userId: string, mvTaskId: string) {
    await this.db.ensureUser(userId);

    const task = await this.findMvTask(userId, mvTaskId);
    if (!task) {
      throw new NotFoundException("MV 制作任务不存在");
    }

    if ((task.status === "queued" || task.status === "generating") && task.minimax_task_id) {
      await this.refreshMvTaskFromMiniMax(task).catch((error) => {
        console.error(`[mv-refresh:${task.id}]`, error);
      });
      const refreshed = await this.findMvTask(userId, mvTaskId);
      return mapMvTask(refreshed ?? task);
    }

    return mapMvTask(task);
  }

  async getMyMvTasks(userId: string) {
    await this.db.ensureUser(userId);

    const rows = await this.db.query<MvTaskRow>(
      `select mt.*, s.title as song_title, s.cover_url as song_cover_url
       from mv_tasks mt
       join songs s on s.id = mt.song_id
       where mt.user_id = $1
       order by mt.created_at desc
       limit 100`,
      [userId]
    );

    return rows.map(mapMvTask);
  }

  async getSong(userId: string, songId: string) {
    await this.db.ensureUser(userId);

    const row = await this.db.one<SongRow>(
      `select *
       from songs
       where id = $1
         and (visibility = 'public' or user_id = $2)`,
      [songId, userId]
    );

    if (!row) {
      throw new NotFoundException("作品不存在或已下架");
    }

    return mapSong(row);
  }

  async publish(userId: string, dto: PublishSongDto) {
    await this.db.ensureUser(userId);
    const platformSettings = await getPlatformSettings(this.db);

    return this.db.transaction(async (client) => {
      const songResult = await client.query<PublishSongRow>(
        `select id, user_id, visibility
         from songs
         where id = $1 and user_id = $2
         for update`,
        [dto.songId, userId]
      );
      const song = songResult.rows[0];

      if (!song) {
        throw new NotFoundException("作品不存在或已下架");
      }

      const firstPublish = song.visibility !== "public";
      const updatedSongResult = await client.query<SongRow>(
        `update songs
         set visibility = 'public',
             published_at = coalesce(published_at, now())
         where id = $1
         returning *`,
        [dto.songId]
      );
      const updatedSong = updatedSongResult.rows[0];

      let awardedPoints = 0;
      if (firstPublish) {
        awardedPoints = platformSettings.publishRewardPoints;
        const balance = await addAvailablePoints(client, userId, awardedPoints);
        await client.query(
          `insert into points_ledger (user_id, source, source_id, delta, balance_after, status, metadata)
           values ($1, 'publish_song', $2, $3, $4, 'available', $5::jsonb)`,
          [
            userId,
            dto.songId,
            awardedPoints,
            balance,
            JSON.stringify({ reason: "song_published" })
          ]
        );
      }

      return {
        song: mapSong(updatedSong),
        awardedPoints
      };
    });
  }

  async recordView(userId: string, songId: string) {
    return this.incrementSongCounter(userId, songId, "view_count");
  }

  async recordPlay(userId: string, songId: string) {
    return this.incrementSongCounter(userId, songId, "play_count");
  }

  async getComments(userId: string, songId: string) {
    await this.assertSongVisibleToUser(songId, userId);

    const comments = await this.db.query<CommentRow>(
      `select
         c.id, c.body, c.likes_count, c.created_at, u.id as user_id, u.display_name, u.avatar_url,
         exists(select 1 from comment_likes cl where cl.comment_id = c.id and cl.user_id = $2) as liked_by_me
       from comments c
       join users u on u.id = c.user_id
       where c.song_id = $1
       order by c.created_at asc
       limit 100`,
      [songId, userId]
    );

    return { comments: comments.map(mapComment) };
  }

  async createComment(userId: string, dto: CreateCommentDto) {
    await this.db.ensureUser(userId);
    await this.assertSongVisibleToUser(dto.songId, userId);

    return this.db.transaction(async (client) => {
      const commentResult = await client.query<CommentRow>(
        `insert into comments (user_id, song_id, body)
         values ($1, $2, $3)
         returning
           id,
           body,
           likes_count,
           false as liked_by_me,
           created_at,
           user_id,
           (select display_name from users where id = $1) as display_name,
           (select avatar_url from users where id = $1) as avatar_url`,
        [userId, dto.songId, dto.body.trim()]
      );

      const songResult = await client.query<{ comments_count: number }>(
        `update songs
         set comments_count = comments_count + 1
         where id = $1
         returning comments_count`,
        [dto.songId]
      );

      return {
        comment: mapComment(commentResult.rows[0]),
        commentsCount: songResult.rows[0]?.comments_count ?? 0
      };
    });
  }

  async toggleCommentLike(userId: string, commentId: string, dto: ToggleCommentLikeDto) {
    await this.db.ensureUser(userId);

    return this.db.transaction(async (client) => {
      const commentResult = await client.query<{ id: string; song_id: string }>(
        `select id, song_id
         from comments
         where id = $1`,
        [commentId]
      );
      const comment = commentResult.rows[0];

      if (!comment) {
        throw new NotFoundException("评论不存在");
      }

      const visibleResult = await client.query<{ id: string }>(
        `select id
         from songs
         where id = $1
           and (visibility = 'public' or user_id = $2)`,
        [comment.song_id, userId]
      );

      if (!visibleResult.rows[0]) {
        throw new NotFoundException("作品不存在或已下架");
      }

      const liked = dto.liked ?? true;
      if (liked) {
        await client.query(
          `insert into comment_likes (user_id, comment_id)
           values ($1, $2)
           on conflict do nothing`,
          [userId, commentId]
        );
      } else {
        await client.query(
          `delete from comment_likes
           where user_id = $1 and comment_id = $2`,
          [userId, commentId]
        );
      }

      const updatedResult = await client.query<CommentRow>(
        `update comments
         set likes_count = (select count(*)::integer from comment_likes where comment_id = $1)
         where id = $1
         returning
           id,
           body,
           likes_count,
           $2::boolean as liked_by_me,
           created_at,
           user_id,
           (select display_name from users where id = comments.user_id) as display_name,
           (select avatar_url from users where id = comments.user_id) as avatar_url`,
        [commentId, liked]
      );

      return { comment: mapComment(updatedResult.rows[0]) };
    });
  }

  private async assertGenerationQuota(_userId: string): Promise<void> {
    // Temporarily open unlimited generation while the MVP is being tested.
    return;
  }

  private async assertSongVisibleToUser(songId: string, userId: string): Promise<void> {
    const song = await this.db.one<{ id: string }>(
      `select id
       from songs
       where id = $1
         and (visibility = 'public' or user_id = $2)`,
      [songId, userId]
    );

    if (!song) {
      throw new NotFoundException("作品不存在或已下架");
    }
  }

  private async incrementSongCounter(userId: string, songId: string, column: "view_count" | "play_count") {
    await this.db.ensureUser(userId);

    const eventTable = column === "view_count" ? "song_view_events" : "song_play_events";
    const song = await this.db.transaction(async (client) => {
      const visible = await client.query<{ id: string }>(
        `select id
         from songs
         where id = $1
           and (visibility = 'public' or user_id = $2)`,
        [songId, userId]
      );

      if (!visible.rows[0]) {
        throw new NotFoundException("作品不存在或已下架");
      }

      const event = await client.query<{ song_id: string }>(
        `insert into ${eventTable} (user_id, song_id)
         values ($1, $2)
         on conflict do nothing
         returning song_id`,
        [userId, songId]
      );

      if (event.rows[0]) {
        const updated = await client.query<SongRow>(
          `update songs
           set ${column} = ${column} + 1
           where id = $1
           returning *`,
          [songId]
        );
        return updated.rows[0] ?? null;
      }

      const current = await client.query<SongRow>("select * from songs where id = $1", [songId]);
      return current.rows[0] ?? null;
    });

    if (!song) {
      throw new NotFoundException("作品不存在或已下架");
    }

    return mapSong(song);
  }

  private async runMvTask(userId: string, mvTaskId: string, song: MvSourceSongRow): Promise<void> {
    const current = await this.findMvTask(userId, mvTaskId);
    if (!current) {
      return;
    }

    try {
      await this.db.query(
        `update mv_tasks
         set status = 'generating',
             started_at = now(),
             error_code = null,
             error_message = null
         where id = $1`,
        [mvTaskId]
      );

      const result = await this.minimax.createVideoGenerationTask({
        prompt: current.prompt,
        songTitle: song.title,
        songTheme: song.theme,
        songStyle: song.style,
        songMood: song.mood,
        coverUrl: song.cover_url,
        imageCount: current.image_count
      });

      await this.writeMiniMaxLog({
        mvTaskId,
        endpoint: MINIMAX_VIDEO_ENDPOINT,
        model: this.minimax.videoModelName,
        requestPayload: result.requestPayload,
        responsePayload: result.responsePayload,
        statusCode: result.statusCode,
        estimatedCostCents: result.estimatedCostCents,
        durationMs: result.durationMs
      });

      const status = result.status === "queued" ? "generating" : result.status;
      await this.db.query(
        `update mv_tasks
         set status = $2::task_status,
             video_url = $3,
             minimax_task_id = $4,
             minimax_file_id = $5,
             minimax_status_code = $6,
             estimated_cost_cents = $7,
             error_code = null,
             error_message = null,
             completed_at = case when $2::task_status in ('succeeded', 'failed') then now() else completed_at end
         where id = $1`,
        [
          mvTaskId,
          status,
          result.videoUrl ?? null,
          result.minimaxTaskId,
          result.fileId ?? null,
          result.statusCode,
          result.estimatedCostCents
        ]
      );
    } catch (error) {
      const failure = normalizeMiniMaxFailure(error);
      await this.writeMiniMaxLog({
        mvTaskId,
        endpoint: MINIMAX_VIDEO_ENDPOINT,
        model: this.minimax.videoModelName,
        requestPayload: failure.requestPayload,
        responsePayload: failure.responsePayload,
        statusCode: failure.statusCode,
        estimatedCostCents: 0,
        errorCode: failure.errorCode,
        errorMessage: failure.message,
        durationMs: failure.durationMs
      });

      await this.db.query(
        `update mv_tasks
         set status = 'failed',
             minimax_status_code = $2,
             error_code = $3,
             error_message = $4,
             completed_at = now()
         where id = $1`,
        [mvTaskId, failure.statusCode ?? null, failure.errorCode ?? "video_generation_failed", failure.message]
      );
    }
  }

  private async findMvTask(userId: string, mvTaskId: string): Promise<MvTaskRow | null> {
    return this.db.one<MvTaskRow>(
      `select mt.*, s.title as song_title, s.cover_url as song_cover_url
       from mv_tasks mt
       join songs s on s.id = mt.song_id
       where mt.id = $1 and mt.user_id = $2`,
      [mvTaskId, userId]
    );
  }

  private async refreshMvTaskFromMiniMax(task: MvTaskRow): Promise<void> {
    if (!task.minimax_task_id) {
      return;
    }

    const status = await this.minimax.getVideoGenerationStatus(task.minimax_task_id);
    await this.writeMiniMaxLog({
      mvTaskId: task.id,
      endpoint: MINIMAX_VIDEO_QUERY_ENDPOINT,
      model: task.minimax_model,
      requestPayload: status.requestPayload,
      responsePayload: status.responsePayload,
      statusCode: status.statusCode,
      estimatedCostCents: status.estimatedCostCents,
      errorCode: status.errorCode,
      errorMessage: status.errorMessage,
      durationMs: status.durationMs
    });

    let videoUrl = status.videoUrl ?? task.video_url;
    let fileId = status.fileId ?? task.minimax_file_id;

    if (status.status === "succeeded" && fileId && !videoUrl) {
      const file = await this.minimax.retrieveVideoFile(fileId);
      await this.writeMiniMaxLog({
        mvTaskId: task.id,
        endpoint: MINIMAX_VIDEO_FILE_ENDPOINT,
        model: task.minimax_model,
        requestPayload: file.requestPayload,
        responsePayload: file.responsePayload,
        statusCode: file.statusCode,
        estimatedCostCents: file.estimatedCostCents,
        durationMs: file.durationMs
      });
      videoUrl = file.videoUrl ?? videoUrl;
      fileId = file.fileId ?? fileId;
    }

    const nextStatus = status.status === "queued" ? "generating" : status.status;
    await this.db.query(
      `update mv_tasks
       set status = $2::task_status,
           video_url = $3,
           minimax_file_id = $4,
           minimax_status_code = $5,
           estimated_cost_cents = greatest(estimated_cost_cents, $6),
           error_code = $7,
           error_message = $8,
           completed_at = case when $2::task_status in ('succeeded', 'failed') then coalesce(completed_at, now()) else completed_at end
       where id = $1`,
      [
        task.id,
        nextStatus,
        videoUrl ?? null,
        fileId ?? null,
        status.statusCode,
        status.estimatedCostCents,
        status.errorCode ?? null,
        status.errorMessage ?? null
      ]
    );
  }

  private async createAndUploadCover(userId: string, taskId: string, dto: GenerateMusicDto): Promise<UploadedCover> {
    const coverInput = {
      title: normalizedTitle(dto.title),
      theme: dto.theme.trim(),
      style: dto.style.trim(),
      mood: dto.mood.trim(),
      mode: dto.mode,
      lyrics: emptyToNull(dto.lyrics)
    };

    let coverResult: MiniMaxCoverResult;

    try {
      coverResult = await this.minimax.generateCover(coverInput);
      await this.writeMiniMaxLog({
        taskId,
        endpoint: MINIMAX_IMAGE_ENDPOINT,
        model: this.minimax.imageModelName,
        requestPayload: coverResult.requestPayload,
        responsePayload: coverResult.responsePayload,
        statusCode: coverResult.statusCode,
        estimatedCostCents: coverResult.estimatedCostCents,
        durationMs: coverResult.durationMs
      });
    } catch (error) {
      const failure = normalizeMiniMaxFailure(error);
      await this.writeMiniMaxLog({
        taskId,
        endpoint: MINIMAX_IMAGE_ENDPOINT,
        model: this.minimax.imageModelName,
        requestPayload: failure.requestPayload,
        responsePayload: failure.responsePayload,
        statusCode: failure.statusCode,
        estimatedCostCents: 0,
        errorCode: failure.errorCode,
        errorMessage: failure.message,
        durationMs: failure.durationMs
      });
      coverResult = this.minimax.createFallbackCover(coverInput, "fallback after MiniMax cover generation failure");
    }

    try {
      const coverExtension = imageExtension(coverResult.contentType);
      const coverStorageKey = `covers/${userId}/${taskId}/${randomUUID()}.${coverExtension}`;
      const coverUrl = await this.storage.uploadBuffer(coverStorageKey, coverResult.imageBuffer, coverResult.contentType);

      return {
        coverUrl,
        coverStorageKey,
        estimatedCostCents: coverResult.estimatedCostCents
      };
    } catch {
      return {
        coverUrl: null,
        coverStorageKey: null,
        estimatedCostCents: coverResult.estimatedCostCents
      };
    }
  }

  private async writeMiniMaxLog(input: {
    taskId?: string;
    mvTaskId?: string;
    endpoint: string;
    model: string;
    requestPayload: Record<string, unknown>;
    responsePayload?: Record<string, unknown>;
    statusCode?: number;
    estimatedCostCents: number;
    errorCode?: string;
    errorMessage?: string;
    durationMs?: number;
  }): Promise<void> {
    await this.db.query(
      `insert into minimax_api_logs (
         task_id, mv_task_id, endpoint, model, request_payload, response_payload, status_code,
         estimated_cost_cents, error_code, error_message, duration_ms
       )
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11)`,
      [
        input.taskId ?? null,
        input.mvTaskId ?? null,
        input.endpoint,
        input.model,
        JSON.stringify(input.requestPayload),
        input.responsePayload ? JSON.stringify(input.responsePayload) : null,
        input.statusCode ?? null,
        input.estimatedCostCents,
        input.errorCode ?? null,
        input.errorMessage ?? null,
        input.durationMs ?? null
      ]
    );
  }
}

async function addAvailablePoints(client: PoolClient, userId: string, delta: number): Promise<number> {
  const result = await client.query<BalanceRow>(
    `update users
     set points_balance = points_balance + $2
     where id = $1
     returning points_balance`,
    [userId, delta]
  );

  return result.rows[0]?.points_balance ?? 0;
}

function buildMiniMaxPrompt(dto: GenerateMusicDto): string {
  return [`Theme: ${dto.theme.trim()}`, `Style: ${dto.style.trim()}`, `Mood: ${dto.mood.trim()}`].join("\n");
}

function buildMvPrompt(song: MvSourceSongRow, dto: CreateMvTaskDto): string {
  const prompt = dto.prompt?.trim();
  if (prompt) {
    return prompt;
  }

  return [
    `为《${song.title}》制作 6 秒短 MV。`,
    `歌曲主题：${song.theme}`,
    `音乐风格：${song.style}`,
    `情绪：${song.mood}`,
    "画面方向：绿色声波极光、玻璃质感、慢镜头、适合短视频平台发布。"
  ].join("\n");
}

function normalizeImageNames(value?: string[]): string[] {
  return (value ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizedTitle(title?: string): string {
  return title?.trim() || "Untitled Track";
}

function emptyToNull(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function stringFromPayload(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function normalizeMiniMaxFailure(error: unknown): MiniMaxFailure {
  if (error instanceof MiniMaxApiError) {
    return {
      message: error.message,
      statusCode: error.details.statusCode,
      errorCode: error.details.errorCode,
      requestPayload: error.details.requestPayload,
      responsePayload: error.details.responsePayload,
      durationMs: error.details.durationMs
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      errorCode: "generation_failed",
      requestPayload: {}
    };
  }

  return {
    message: "生成失败",
    errorCode: "generation_failed",
    requestPayload: {}
  };
}

function mapTask(row: MusicTaskRow) {
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    prompt: row.prompt,
    theme: row.prompt,
    style: row.style,
    mood: row.mood,
    mode: row.mode,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    quotaRefunded: row.quota_refunded,
    songId: row.song_id,
    audioUrl: row.audio_url,
    coverUrl: row.cover_url,
    lyrics: row.lyrics,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapMvTask(row: MvTaskRow) {
  return {
    id: row.id,
    userId: row.user_id,
    songId: row.song_id,
    songTitle: row.song_title ?? null,
    songCoverUrl: row.song_cover_url ?? null,
    status: row.status,
    prompt: row.prompt,
    imageCount: row.image_count,
    imageNames: imageNamesFromJson(row.image_names),
    videoUrl: row.video_url,
    minimaxTaskId: row.minimax_task_id,
    minimaxFileId: row.minimax_file_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    estimatedCostCents: row.estimated_cost_cents,
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapSong(row: SongRow) {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    title: row.title,
    theme: row.theme,
    style: row.style,
    mood: row.mood,
    lyrics: row.lyrics,
    audioUrl: row.audio_url,
    coverUrl: row.cover_url,
    durationSeconds: row.duration_seconds,
    mode: row.mode,
    visibility: row.visibility,
    likesCount: row.likes_count,
    favoritesCount: row.favorites_count,
    viewCount: row.view_count,
    playCount: row.play_count,
    commentsCount: row.comments_count,
    createdAt: toIso(row.created_at),
    publishedAt: row.published_at ? toIso(row.published_at) : null,
    updatedAt: toIso(row.updated_at)
  };
}

function imageNamesFromJson(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  return [];
}

function mapComment(row: CommentRow) {
  return {
    id: row.id,
    body: row.body,
    likesCount: row.likes_count,
    likedByMe: row.liked_by_me,
    createdAt: toIso(row.created_at),
    user: {
      id: row.user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url
    }
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function dtoFromTask(row: MusicTaskRow): GenerateMusicDto {
  return {
    title: row.title ?? undefined,
    theme: row.prompt,
    style: row.style,
    mood: row.mood,
    lyrics: row.lyrics ?? undefined,
    mode: row.mode,
    lyricsOptimizer: row.lyrics_optimizer
  };
}

function isStaleGenerationTask(row: MusicTaskRow): boolean {
  if (row.status !== "queued" && row.status !== "generating") {
    return false;
  }

  const referenceTime = row.started_at ?? row.updated_at ?? row.created_at;
  const ageMs = Date.now() - new Date(referenceTime).getTime();
  return Number.isFinite(ageMs) && ageMs > generationStaleAfterMs();
}

function generationStaleAfterMs(): number {
  const configured = Number(process.env.GENERATION_STALE_AFTER_MS);
  return Number.isFinite(configured) && configured >= 60_000 ? configured : DEFAULT_STALE_GENERATION_MS;
}

function imageExtension(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
    case "image/jpg":
    default:
      return "jpg";
  }
}

function runInBackground(label: string, handler: () => Promise<void>): void {
  const work = Promise.resolve()
    .then(handler)
    .catch((error) => {
      console.error(`[background:${label}]`, error);
    });

  try {
    waitUntil(work);
  } catch {
    // Outside Vercel, keeping the promise alive is enough for the local/API server.
  }
}

function shouldRunGenerationInline(): boolean {
  return process.env.RUN_GENERATION_INLINE === "true" && !shouldRunGenerationOnPoll();
}

function isMvFeatureEnabled(): boolean {
  return process.env.ENABLE_MV_FEATURE === "true";
}

function shouldRunGenerationOnPoll(): boolean {
  const configured = process.env.RUN_GENERATION_ON_POLL?.trim().toLowerCase();
  if (configured) {
    return configured !== "false" && configured !== "0";
  }

  return process.env.NODE_ENV === "production";
}
