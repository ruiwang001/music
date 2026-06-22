import { Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DbService } from "../../common/db/db.service";

type Reaction = "like" | "favorite";

interface FeedRow {
  id: string;
  user_id: string;
  title: string;
  theme: string;
  style: string;
  mood: string;
  lyrics: string | null;
  audio_url: string;
  cover_url: string | null;
  visibility: "public" | "private";
  likes_count: number;
  favorites_count: number;
  view_count: number;
  play_count: number;
  comments_count: number;
  created_at: Date | string;
  published_at: Date | string | null;
  creator_name: string;
  liked_by_me: boolean;
  favorited_by_me: boolean;
}

interface CreatorRow {
  id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  followers_count: number;
  following_count: number;
  songs_count: number;
  total_play_count: number;
  total_view_count: number;
  followed_by_me: boolean;
}

@Injectable()
export class FeedService {
  constructor(private readonly db: DbService) {}

  async getFeed(userId: string) {
    await this.db.ensureUser(userId);

    const rows = await this.db.query<FeedRow>(
      `select
         s.id, s.user_id, s.title, s.theme, s.style, s.mood, s.lyrics, s.audio_url,
         s.cover_url, s.visibility, s.likes_count, s.favorites_count, s.view_count,
         s.play_count, s.comments_count, s.created_at, s.published_at, u.display_name as creator_name,
         exists(select 1 from likes l where l.song_id = s.id and l.user_id = $1) as liked_by_me,
         exists(select 1 from favorites f where f.song_id = s.id and f.user_id = $1) as favorited_by_me
       from songs s
       join users u on u.id = s.user_id
       where s.visibility = 'public'
       order by s.published_at desc nulls last, s.created_at desc
       limit 50`,
      [userId]
    );

    return rows.map(mapFeedItem);
  }

  async toggleReaction(userId: string, songId: string, reaction: Reaction, enabled: boolean) {
    await this.db.ensureUser(userId);

    return this.db.transaction(async (client) => {
      const exists = await client.query<{ id: string }>(
        `select id from songs where id = $1 and visibility = 'public'`,
        [songId]
      );

      if (!exists.rows[0]) {
        throw new NotFoundException("公开作品不存在或已下架");
      }

      if (reaction === "like") {
        await toggleJoinRow(client, "likes", userId, songId, enabled);
        await recalculateCounter(client, "likes_count", "likes", songId);
      } else {
        await toggleJoinRow(client, "favorites", userId, songId, enabled);
        await recalculateCounter(client, "favorites_count", "favorites", songId);
      }

      const row = await this.getFeedItem(client, userId, songId);
      if (!row) {
        throw new NotFoundException("公开作品不存在或已下架");
      }

      return mapFeedItem(row);
    });
  }

  async getCreatorProfile(userId: string, creatorId: string) {
    await this.db.ensureUser(userId);

    const creator = await this.db.one<CreatorRow>(
      `select
         u.id,
         u.display_name,
         u.email,
         u.avatar_url,
         (select count(*)::integer from follows f where f.following_id = u.id) as followers_count,
         (select count(*)::integer from follows f where f.follower_id = u.id) as following_count,
         (select count(*)::integer from songs s where s.user_id = u.id and s.visibility = 'public') as songs_count,
         coalesce((select sum(s.play_count)::integer from songs s where s.user_id = u.id and s.visibility = 'public'), 0) as total_play_count,
         coalesce((select sum(s.view_count)::integer from songs s where s.user_id = u.id and s.visibility = 'public'), 0) as total_view_count,
         exists(select 1 from follows f where f.follower_id = $1 and f.following_id = u.id) as followed_by_me
       from users u
       where u.id = $2`,
      [userId, creatorId]
    );

    if (!creator) {
      throw new NotFoundException("创作者不存在");
    }

    const songs = await this.db.query<FeedRow>(
      `select
         s.id, s.user_id, s.title, s.theme, s.style, s.mood, s.lyrics, s.audio_url,
         s.cover_url, s.visibility, s.likes_count, s.favorites_count, s.view_count,
         s.play_count, s.comments_count, s.created_at, s.published_at, u.display_name as creator_name,
         exists(select 1 from likes l where l.song_id = s.id and l.user_id = $1) as liked_by_me,
         exists(select 1 from favorites f where f.song_id = s.id and f.user_id = $1) as favorited_by_me
       from songs s
       join users u on u.id = s.user_id
       where s.user_id = $2 and s.visibility = 'public'
       order by s.published_at desc nulls last, s.created_at desc
       limit 100`,
      [userId, creatorId]
    );

    return {
      creator: mapCreator(creator),
      songs: songs.map(mapFeedItem)
    };
  }

  async toggleFollow(userId: string, creatorId: string, following: boolean) {
    await this.db.ensureUser(userId);

    if (userId === creatorId) {
      throw new NotFoundException("不能关注自己");
    }

    const exists = await this.db.one<{ id: string }>("select id from users where id = $1", [creatorId]);
    if (!exists) {
      throw new NotFoundException("创作者不存在");
    }

    if (following) {
      await this.db.query(
        `insert into follows (follower_id, following_id)
         values ($1, $2)
         on conflict do nothing`,
        [userId, creatorId]
      );
    } else {
      await this.db.query(
        `delete from follows
         where follower_id = $1 and following_id = $2`,
        [userId, creatorId]
      );
    }

    return this.getCreatorProfile(userId, creatorId);
  }

  private async getFeedItem(client: PoolClient, userId: string, songId: string): Promise<FeedRow | null> {
    const result = await client.query<FeedRow>(
      `select
         s.id, s.user_id, s.title, s.theme, s.style, s.mood, s.lyrics, s.audio_url,
         s.cover_url, s.visibility, s.likes_count, s.favorites_count, s.view_count,
         s.play_count, s.comments_count, s.created_at, s.published_at, u.display_name as creator_name,
         exists(select 1 from likes l where l.song_id = s.id and l.user_id = $1) as liked_by_me,
         exists(select 1 from favorites f where f.song_id = s.id and f.user_id = $1) as favorited_by_me
       from songs s
       join users u on u.id = s.user_id
       where s.id = $2 and s.visibility = 'public'`,
      [userId, songId]
    );

    return result.rows[0] ?? null;
  }
}

async function toggleJoinRow(client: PoolClient, table: "likes" | "favorites", userId: string, songId: string, enabled: boolean) {
  if (enabled) {
    await client.query(
      `insert into ${table} (user_id, song_id)
       values ($1, $2)
       on conflict do nothing`,
      [userId, songId]
    );
  } else {
    await client.query(
      `delete from ${table}
       where user_id = $1 and song_id = $2`,
      [userId, songId]
    );
  }
}

async function recalculateCounter(client: PoolClient, column: "likes_count" | "favorites_count", table: "likes" | "favorites", songId: string) {
  await client.query(
    `update songs
     set ${column} = (select count(*)::integer from ${table} where song_id = $1)
     where id = $1`,
    [songId]
  );
}

function mapFeedItem(row: FeedRow) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    theme: row.theme,
    style: row.style,
    mood: row.mood,
    lyrics: row.lyrics,
    audioUrl: row.audio_url,
    coverUrl: row.cover_url,
    visibility: row.visibility,
    likesCount: row.likes_count,
    favoritesCount: row.favorites_count,
    viewCount: row.view_count,
    playCount: row.play_count,
    commentsCount: row.comments_count,
    createdAt: toIso(row.created_at),
    publishedAt: row.published_at ? toIso(row.published_at) : null,
    creatorName: row.creator_name,
    likedByMe: row.liked_by_me,
    favoritedByMe: row.favorited_by_me
  };
}

function mapCreator(row: CreatorRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    followersCount: row.followers_count,
    followingCount: row.following_count,
    songsCount: row.songs_count,
    totalPlayCount: row.total_play_count,
    totalViewCount: row.total_view_count,
    followedByMe: row.followed_by_me
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
