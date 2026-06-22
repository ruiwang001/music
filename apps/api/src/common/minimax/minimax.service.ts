import { BadRequestException, Injectable } from "@nestjs/common";
import { deflateSync } from "zlib";

type MiniMaxSongMode = "instrumental" | "vocal";

export interface MiniMaxMusicInput {
  prompt: string;
  lyrics?: string;
  isInstrumental: boolean;
  lyricsOptimizer: boolean;
}

export interface MiniMaxCoverInput {
  title: string;
  theme: string;
  style: string;
  mood: string;
  mode: MiniMaxSongMode;
  lyrics?: string | null;
}

export interface MiniMaxMusicResult {
  audioBuffer: Buffer;
  contentType?: string;
  traceId?: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  statusCode: number;
  estimatedCostCents: number;
  durationMs: number;
  durationSeconds?: number;
}

export interface MiniMaxCoverResult {
  imageBuffer: Buffer;
  contentType: string;
  traceId?: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  statusCode: number;
  estimatedCostCents: number;
  durationMs: number;
}

export interface MiniMaxVideoInput {
  prompt: string;
  songTitle: string;
  songTheme: string;
  songStyle: string;
  songMood: string;
  coverUrl?: string | null;
  imageCount?: number;
}

export interface MiniMaxVideoTaskResult {
  minimaxTaskId: string;
  status: "queued" | "generating" | "succeeded" | "failed";
  fileId?: string;
  videoUrl?: string;
  traceId?: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  statusCode: number;
  estimatedCostCents: number;
  durationMs: number;
}

export interface MiniMaxVideoStatusResult {
  status: "queued" | "generating" | "succeeded" | "failed";
  fileId?: string;
  videoUrl?: string;
  traceId?: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  statusCode: number;
  estimatedCostCents: number;
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
}

export class MiniMaxApiError extends Error {
  constructor(
    message: string,
    readonly details: {
      requestPayload: Record<string, unknown>;
      responsePayload?: Record<string, unknown>;
      statusCode?: number;
      errorCode?: string;
      durationMs: number;
    }
  ) {
    super(message);
  }
}

@Injectable()
export class MiniMaxService {
  private readonly baseUrl = process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io";
  private readonly musicModel = process.env.MINIMAX_MUSIC_MODEL ?? "music-2.6";
  private readonly imageModel = process.env.MINIMAX_IMAGE_MODEL ?? "image-01";
  private readonly videoModel = process.env.MINIMAX_VIDEO_MODEL ?? "MiniMax-Hailuo-02";
  private readonly musicEstimatedCostCents = Number(process.env.MINIMAX_COST_CENTS_PER_SONG ?? 8);
  private readonly imageEstimatedCostCents = Number(process.env.MINIMAX_IMAGE_COST_CENTS_PER_COVER ?? 2);
  private readonly videoEstimatedCostCents = Number(process.env.MINIMAX_VIDEO_COST_CENTS_PER_MV ?? 80);
  private readonly requestTimeoutMs = positiveNumber(process.env.MINIMAX_REQUEST_TIMEOUT_MS, 300000);

  get modelName(): string {
    return this.musicModel;
  }

  get imageModelName(): string {
    return this.imageModel;
  }

  get videoModelName(): string {
    return this.videoModel;
  }

  async generateMusic(input: MiniMaxMusicInput): Promise<MiniMaxMusicResult> {
    if (!input.isInstrumental && !input.lyrics && !input.lyricsOptimizer) {
      throw new BadRequestException("人声歌曲需要填写歌词，或开启歌词智能优化");
    }

    const requestPayload = this.buildMusicRequestPayload(input);

    if (!this.hasApiKey() || process.env.ALLOW_MINIMAX_MOCK === "true") {
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_MINIMAX_MOCK !== "true") {
        throw new MiniMaxApiError("MINIMAX_API_KEY is not configured", {
          requestPayload,
          statusCode: 500,
          errorCode: "missing_minimax_api_key",
          durationMs: 0
        });
      }

      const startedAt = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 700));
      const traceId = `local-music-${Date.now()}`;
      return {
        audioBuffer: createTinyWav(),
        traceId,
        requestPayload,
        responsePayload: {
          base_resp: { status_code: 0, status_msg: "local development mock" },
          data: { status: 2, audio: "[mocked locally]" },
          trace_id: traceId
        },
        statusCode: 200,
        estimatedCostCents: 0,
        durationMs: Date.now() - startedAt,
        durationSeconds: 4,
        contentType: "audio/wav"
      };
    }

    const result = await this.postJson("/v1/music_generation", requestPayload);
    const baseResp = baseResponse(result.responsePayload);
    const data = objectValue(result.responsePayload.data);
    const audioHex = stringValue(data?.audio);

    if (!result.ok || isFailedBaseResp(baseResp) || !audioHex) {
      throw new MiniMaxApiError(baseResp?.status_msg ?? `MiniMax request failed with ${result.statusCode}`, {
        requestPayload,
        responsePayload: result.responsePayload,
        statusCode: result.statusCode,
        errorCode: String(baseResp?.status_code ?? result.statusCode),
        durationMs: result.durationMs
      });
    }

    const extraInfo = objectValue(result.responsePayload.extra_info);
    const durationMs = numberValue(extraInfo?.music_duration);
    return {
      audioBuffer: Buffer.from(audioHex, "hex"),
      contentType: "audio/mpeg",
      traceId: extractTraceId(result.responsePayload),
      requestPayload,
      responsePayload: result.responsePayload,
      statusCode: result.statusCode,
      estimatedCostCents: this.musicEstimatedCostCents,
      durationMs: result.durationMs,
      durationSeconds: durationMs ? Math.round(durationMs / 1000) : undefined
    };
  }

  async generateCover(input: MiniMaxCoverInput): Promise<MiniMaxCoverResult> {
    const requestPayload = this.buildCoverRequestPayload(input);

    if (!this.hasApiKey() || process.env.ALLOW_MINIMAX_MOCK === "true") {
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_MINIMAX_MOCK !== "true") {
        throw new MiniMaxApiError("MINIMAX_API_KEY is not configured", {
          requestPayload,
          statusCode: 500,
          errorCode: "missing_minimax_api_key",
          durationMs: 0
        });
      }

      return this.createFallbackCover(input, "local development cover mock");
    }

    const result = await this.postJson("/v1/image_generation", requestPayload);
    const baseResp = baseResponse(result.responsePayload);

    if (!result.ok || isFailedBaseResp(baseResp)) {
      throw new MiniMaxApiError(baseResp?.status_msg ?? `MiniMax image request failed with ${result.statusCode}`, {
        requestPayload,
        responsePayload: result.responsePayload,
        statusCode: result.statusCode,
        errorCode: String(baseResp?.status_code ?? result.statusCode),
        durationMs: result.durationMs
      });
    }

    const image = await this.extractImage(result.responsePayload, requestPayload, result.durationMs);
    return {
      imageBuffer: image.buffer,
      contentType: image.contentType,
      traceId: extractTraceId(result.responsePayload),
      requestPayload,
      responsePayload: result.responsePayload,
      statusCode: result.statusCode,
      estimatedCostCents: this.imageEstimatedCostCents,
      durationMs: result.durationMs
    };
  }

  createFallbackCover(input: MiniMaxCoverInput, statusMessage = "generated local fallback cover"): MiniMaxCoverResult {
    const requestPayload = this.buildCoverRequestPayload(input);
    const startedAt = Date.now();
    const traceId = `local-cover-${Date.now()}`;

    return {
      imageBuffer: createAuroraCoverPng(input),
      contentType: "image/png",
      traceId,
      requestPayload,
      responsePayload: {
        base_resp: { status_code: 0, status_msg: statusMessage },
        data: { image: "[generated locally]" },
        trace_id: traceId
      },
      statusCode: 200,
      estimatedCostCents: 0,
      durationMs: Date.now() - startedAt
    };
  }

  async createVideoGenerationTask(input: MiniMaxVideoInput): Promise<MiniMaxVideoTaskResult> {
    const requestPayload = this.buildVideoRequestPayload(input);

    if (!this.hasApiKey() || process.env.ALLOW_MINIMAX_MOCK === "true") {
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_MINIMAX_MOCK !== "true") {
        throw new MiniMaxApiError("MINIMAX_API_KEY is not configured", {
          requestPayload,
          statusCode: 500,
          errorCode: "missing_minimax_api_key",
          durationMs: 0
        });
      }

      const startedAt = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const traceId = `local-video-${Date.now()}`;
      return {
        minimaxTaskId: traceId,
        status: "succeeded",
        fileId: `${traceId}-file`,
        videoUrl: createMockVideoUrl(input),
        traceId,
        requestPayload,
        responsePayload: {
          base_resp: { status_code: 0, status_msg: "local development video mock" },
          task_id: traceId,
          status: "Success",
          file_id: `${traceId}-file`,
          file: { download_url: "[generated locally]" },
          trace_id: traceId
        },
        statusCode: 200,
        estimatedCostCents: 0,
        durationMs: Date.now() - startedAt
      };
    }

    const result = await this.postJson("/v1/video_generation", requestPayload);
    const baseResp = baseResponse(result.responsePayload);
    const data = objectValue(result.responsePayload.data);
    const taskId = firstString(data?.task_id) ?? firstString(result.responsePayload.task_id) ?? firstString(result.responsePayload.id);

    if (!result.ok || isFailedBaseResp(baseResp) || !taskId) {
      throw new MiniMaxApiError(baseResp?.status_msg ?? `MiniMax video task failed with ${result.statusCode}`, {
        requestPayload,
        responsePayload: result.responsePayload,
        statusCode: result.statusCode,
        errorCode: String(baseResp?.status_code ?? result.statusCode),
        durationMs: result.durationMs
      });
    }

    return {
      minimaxTaskId: taskId,
      status: statusFromMiniMaxPayload(result.responsePayload),
      fileId: firstString(data?.file_id) ?? firstString(result.responsePayload.file_id),
      videoUrl: firstString(data?.video_url) ?? firstString(result.responsePayload.video_url),
      traceId: extractTraceId(result.responsePayload),
      requestPayload,
      responsePayload: result.responsePayload,
      statusCode: result.statusCode,
      estimatedCostCents: this.videoEstimatedCostCents,
      durationMs: result.durationMs
    };
  }

  async getVideoGenerationStatus(taskId: string): Promise<MiniMaxVideoStatusResult> {
    const requestPayload = { task_id: taskId };

    if (taskId.startsWith("local-video-") || process.env.ALLOW_MINIMAX_MOCK === "true") {
      const startedAt = Date.now();
      return {
        status: "succeeded",
        fileId: `${taskId}-file`,
        traceId: taskId,
        requestPayload,
        responsePayload: {
          base_resp: { status_code: 0, status_msg: "local development video mock" },
          task_id: taskId,
          status: "Success",
          file_id: `${taskId}-file`,
          trace_id: taskId
        },
        statusCode: 200,
        estimatedCostCents: 0,
        durationMs: Date.now() - startedAt
      };
    }

    const result = await this.getJson(`/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`);
    const baseResp = baseResponse(result.responsePayload);
    if (!result.ok || isFailedBaseResp(baseResp)) {
      throw new MiniMaxApiError(baseResp?.status_msg ?? `MiniMax video status failed with ${result.statusCode}`, {
        requestPayload,
        responsePayload: result.responsePayload,
        statusCode: result.statusCode,
        errorCode: String(baseResp?.status_code ?? result.statusCode),
        durationMs: result.durationMs
      });
    }

    const data = objectValue(result.responsePayload.data) ?? result.responsePayload;
    const status = statusFromMiniMaxPayload(data);
    return {
      status,
      fileId: firstString(data.file_id) ?? firstString(result.responsePayload.file_id),
      videoUrl: firstString(data.video_url) ?? firstString(data.download_url) ?? firstString(result.responsePayload.video_url),
      traceId: extractTraceId(result.responsePayload),
      requestPayload,
      responsePayload: result.responsePayload,
      statusCode: result.statusCode,
      estimatedCostCents: status === "succeeded" ? this.videoEstimatedCostCents : 0,
      durationMs: result.durationMs,
      errorCode: status === "failed" ? firstString(data.error_code) ?? "video_generation_failed" : undefined,
      errorMessage: status === "failed" ? firstString(data.error_message) ?? firstString(data.fail_reason) ?? "MiniMax MV 生成失败" : undefined
    };
  }

  async retrieveVideoFile(fileId: string): Promise<MiniMaxVideoStatusResult> {
    const requestPayload = { file_id: fileId };

    if (fileId.startsWith("local-video-") || process.env.ALLOW_MINIMAX_MOCK === "true") {
      const startedAt = Date.now();
      return {
        status: "succeeded",
        fileId,
        requestPayload,
        responsePayload: {
          base_resp: { status_code: 0, status_msg: "local development video mock" },
          file: { download_url: "[generated locally]" }
        },
        statusCode: 200,
        estimatedCostCents: 0,
        durationMs: Date.now() - startedAt
      };
    }

    const result = await this.getJson(`/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`);
    const baseResp = baseResponse(result.responsePayload);
    if (!result.ok || isFailedBaseResp(baseResp)) {
      throw new MiniMaxApiError(baseResp?.status_msg ?? `MiniMax video file retrieval failed with ${result.statusCode}`, {
        requestPayload,
        responsePayload: result.responsePayload,
        statusCode: result.statusCode,
        errorCode: String(baseResp?.status_code ?? result.statusCode),
        durationMs: result.durationMs
      });
    }

    const data = objectValue(result.responsePayload.file) ?? objectValue(result.responsePayload.data) ?? result.responsePayload;
    return {
      status: "succeeded",
      fileId,
      videoUrl: firstString(data.download_url) ?? firstString(data.url) ?? firstString(result.responsePayload.download_url),
      traceId: extractTraceId(result.responsePayload),
      requestPayload,
      responsePayload: result.responsePayload,
      statusCode: result.statusCode,
      estimatedCostCents: 0,
      durationMs: result.durationMs
    };
  }

  private buildMusicRequestPayload(input: MiniMaxMusicInput): Record<string, unknown> {
    return {
      model: this.musicModel,
      prompt: input.prompt,
      lyrics: input.isInstrumental ? undefined : input.lyrics,
      lyrics_optimizer: input.lyricsOptimizer,
      is_instrumental: input.isInstrumental,
      output_format: "hex",
      audio_setting: {
        sample_rate: 44100,
        bitrate: 256000,
        format: "mp3"
      }
    };
  }

  private buildCoverRequestPayload(input: MiniMaxCoverInput): Record<string, unknown> {
    return {
      model: this.imageModel,
      prompt: buildCoverPrompt(input),
      aspect_ratio: "1:1",
      response_format: "base64",
      n: 1,
      prompt_optimizer: true
    };
  }

  private buildVideoRequestPayload(input: MiniMaxVideoInput): Record<string, unknown> {
    return {
      model: this.videoModel,
      prompt: [
        input.prompt.trim(),
        `Song title: ${input.songTitle}.`,
        `Song theme: ${input.songTheme}.`,
        `Style: ${input.songStyle}. Mood: ${input.songMood}.`,
        "Visual language: Green Sonic Aurora, premium music-video poster, soft green aurora, glass reflections, cinematic camera movement, elegant and young.",
        input.imageCount ? `Use ${input.imageCount} uploaded reference photo(s) as character and mood references.` : "",
        "No watermarks, no readable logos, no copyrighted artist names."
      ]
        .filter(Boolean)
        .join(" "),
      first_frame_image: input.coverUrl ?? undefined,
      duration: 6,
      resolution: "768P",
      prompt_optimizer: true
    };
  }

  private async postJson(endpoint: string, payload: Record<string, unknown>) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.MINIMAX_API_KEY ?? ""}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify(payload)
      });

      const rawBody = await response.text();
      return {
        ok: response.ok,
        statusCode: response.status,
        responsePayload: safeJson(rawBody),
        durationMs: Date.now() - startedAt
      };
    } catch (error) {
      const timedOut = isAbortError(error);
      throw new MiniMaxApiError(
        timedOut ? `MiniMax request timed out after ${this.requestTimeoutMs}ms` : error instanceof Error ? error.message : "MiniMax request failed",
        {
          requestPayload: payload,
          errorCode: timedOut ? "minimax_timeout" : "minimax_network_error",
          durationMs: Date.now() - startedAt
        }
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getJson(endpoint: string) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${endpoint}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.MINIMAX_API_KEY ?? ""}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal
      });

      const rawBody = await response.text();
      return {
        ok: response.ok,
        statusCode: response.status,
        responsePayload: safeJson(rawBody),
        durationMs: Date.now() - startedAt
      };
    } catch (error) {
      const timedOut = isAbortError(error);
      throw new MiniMaxApiError(
        timedOut ? `MiniMax request timed out after ${this.requestTimeoutMs}ms` : error instanceof Error ? error.message : "MiniMax request failed",
        {
          requestPayload: { endpoint },
          errorCode: timedOut ? "minimax_timeout" : "minimax_network_error",
          durationMs: Date.now() - startedAt
        }
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async downloadImage(
    imageUrl: string,
    requestPayload: Record<string, unknown>,
    responsePayload: Record<string, unknown>,
    priorDurationMs: number
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(imageUrl, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`image download failed with ${response.status}`);
      }

      const contentType = response.headers.get("content-type") ?? "image/jpeg";
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        buffer,
        contentType: imageContentType(buffer) ?? contentType
      };
    } catch (error) {
      const timedOut = isAbortError(error);
      throw new MiniMaxApiError(timedOut ? `MiniMax image download timed out after ${this.requestTimeoutMs}ms` : error instanceof Error ? error.message : "MiniMax image download failed", {
        requestPayload,
        responsePayload,
        statusCode: 200,
        errorCode: timedOut ? "image_download_timeout" : "image_download_failed",
        durationMs: priorDurationMs + Date.now() - startedAt
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async extractImage(
    responsePayload: Record<string, unknown>,
    requestPayload: Record<string, unknown>,
    durationMs: number
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const data = objectValue(responsePayload.data) ?? responsePayload;
    const base64Image =
      firstString(data.image_base64) ??
      firstString(data.image) ??
      firstString(data.images) ??
      firstString(responsePayload.image_base64) ??
      firstString(responsePayload.images);

    if (base64Image) {
      const parsed = bufferFromBase64Image(base64Image);
      if (parsed) {
        return parsed;
      }
    }

    const imageUrl =
      firstString(data.image_urls) ??
      firstString(data.image_url) ??
      firstString(data.url) ??
      firstString(responsePayload.image_urls) ??
      firstString(responsePayload.image_url);

    if (imageUrl) {
      return this.downloadImage(imageUrl, requestPayload, responsePayload, durationMs);
    }

    throw new MiniMaxApiError("MiniMax image response did not include image data", {
      requestPayload,
      responsePayload,
      statusCode: 200,
      errorCode: "missing_image_data",
      durationMs
    });
  }

  private hasApiKey(): boolean {
    const apiKey = process.env.MINIMAX_API_KEY?.trim();
    return Boolean(apiKey && apiKey !== "change-me");
  }
}

function createTinyWav(): Buffer {
  const sampleRate = 8000;
  const seconds = 4;
  const samples = sampleRate * seconds;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.sin((Math.PI * index) / samples);
    const tone = Math.sin((2 * Math.PI * 330 * index) / sampleRate) * 0.22 * envelope;
    buffer.writeInt16LE(Math.round(tone * 32767), 44 + index * 2);
  }

  return buffer;
}

function createAuroraCoverPng(input: MiniMaxCoverInput): Buffer {
  const size = 512;
  const hash = hashString(`${input.title}|${input.theme}|${input.style}|${input.mood}`);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const palette = [
    [4, 26, 21],
    [7, 54, 42],
    [89, 255, 200],
    [168, 255, 216],
    [255, 216, 122]
  ];
  const accentShift = (hash % 47) / 47;

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    raw[rowOffset] = 0;

    for (let x = 0; x < size; x += 1) {
      const nx = x / size;
      const ny = y / size;
      const wave = Math.sin((nx * 5.8 + accentShift) * Math.PI) * 0.5 + 0.5;
      const aurora = Math.sin((ny * 7.2 + wave * 1.6 + accentShift) * Math.PI) * 0.5 + 0.5;
      const dx = nx - 0.5;
      const dy = ny - 0.46;
      const radial = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 1.75);
      const grain = ((hashString(`${hash}:${x}:${y}`) % 100) / 100 - 0.5) * 10;
      const glow = Math.max(aurora * 0.55, radial * 0.9);
      const gold = Math.max(0, 1 - Math.abs(nx - 0.72) * 5 - Math.abs(ny - 0.28) * 3) * 0.22;
      const index = rowOffset + 1 + x * 4;

      raw[index] = clamp(palette[0][0] + palette[2][0] * glow * 0.42 + palette[4][0] * gold + grain);
      raw[index + 1] = clamp(palette[0][1] + palette[2][1] * glow * 0.46 + palette[4][1] * gold + grain);
      raw[index + 2] = clamp(palette[0][2] + palette[3][2] * glow * 0.34 + palette[4][2] * gold + grain);
      raw[index + 3] = 255;
    }
  }

  return pngBuffer(size, size, raw);
}

function pngBuffer(width: number, height: number, rawRgbaRows: Buffer): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(rawRgbaRows)), pngChunk("IEND", Buffer.alloc(0))]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function buildCoverPrompt(input: MiniMaxCoverInput): string {
  return [
    "Square premium album cover for an AI-generated song.",
    `Title: ${input.title}.`,
    `Theme: ${input.theme}.`,
    `Style: ${input.style}.`,
    `Mood: ${input.mood}.`,
    `Mode: ${input.mode}.`,
    "Visual language: Green Sonic Aurora, floating glass, organic sound waves, deep soft green background, luminous mint highlights, warm gold accent, Apple Music editorial quality.",
    "No readable text, no logos, no QR codes, no artist names.",
    input.lyrics ? `Subtle lyric imagery: ${truncate(input.lyrics.replace(/\s+/g, " "), 240)}.` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function createMockVideoUrl(input: MiniMaxVideoInput): string {
  const title = escapeSvg(input.songTitle || "Green Sonic MV");
  const mood = escapeSvg(`${input.songStyle} · ${input.songMood}`);
  const prompt = escapeSvg(truncate(input.prompt || input.songTheme, 120));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs>
    <radialGradient id="g1" cx="32%" cy="34%" r="58%"><stop offset="0" stop-color="#59ffc8" stop-opacity=".65"/><stop offset=".5" stop-color="#123728"/><stop offset="1" stop-color="#02110d"/></radialGradient>
    <linearGradient id="g2" x1="0" x2="1"><stop stop-color="#a8ffd8"/><stop offset="1" stop-color="#ffd87a"/></linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="960" height="540" fill="#02110d"/>
  <circle cx="240" cy="180" r="250" fill="url(#g1)" filter="url(#blur)"/>
  <path d="M120 350 C250 250 360 455 500 320 S760 290 850 180" fill="none" stroke="url(#g2)" stroke-width="14" stroke-linecap="round" opacity=".8"/>
  <g transform="translate(110 112)">
    <rect width="740" height="316" rx="42" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.18)"/>
    <circle cx="135" cy="150" r="86" fill="rgba(89,255,200,.17)" stroke="rgba(168,255,216,.28)"/>
    <circle cx="135" cy="150" r="48" fill="#041a15"/>
    <circle cx="135" cy="150" r="16" fill="#ffd87a"/>
    <text x="265" y="126" fill="#f4f1e8" font-family="Inter, Arial, sans-serif" font-size="48" font-weight="800">${title}</text>
    <text x="267" y="176" fill="#ffd87a" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800">${mood}</text>
    <text x="267" y="230" fill="#bfe8c5" font-family="Inter, Arial, sans-serif" font-size="24">${prompt}</text>
    <text x="267" y="284" fill="#59ffc8" font-family="Inter, Arial, sans-serif" font-size="20">MV 分镜任务已生成，可接入 MiniMax 视频后输出成片</text>
  </g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function statusFromMiniMaxPayload(payload: Record<string, unknown>): "queued" | "generating" | "succeeded" | "failed" {
  const raw = [
    stringValue(payload.status),
    stringValue(payload.task_status),
    stringValue(payload.state),
    stringValue(payload.status_msg)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (raw.includes("success") || raw.includes("succeed") || raw.includes("finished") || raw.includes("done")) {
    return "succeeded";
  }

  if (raw.includes("fail") || raw.includes("error") || raw.includes("cancel")) {
    return "failed";
  }

  if (raw.includes("queue") || raw.includes("pending") || raw.includes("wait")) {
    return "queued";
  }

  return "generating";
}

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeJson(body: string): Record<string, unknown> {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { raw: body };
  }
}

function baseResponse(payload: Record<string, unknown>): { status_code?: number; status_msg?: string } | undefined {
  const value = objectValue(payload.base_resp);
  if (!value) {
    return undefined;
  }

  return {
    status_code: numberValue(value.status_code),
    status_msg: stringValue(value.status_msg)
  };
}

function isFailedBaseResp(baseResp: { status_code?: number } | undefined): boolean {
  return baseResp?.status_code !== undefined && baseResp.status_code !== 0;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = firstString(item);
      if (nested) {
        return nested;
      }
    }
  }

  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return (
      firstString(object.image_base64) ??
      firstString(object.base64) ??
      firstString(object.b64_json) ??
      firstString(object.image_url) ??
      firstString(object.url)
    );
  }

  return undefined;
}

function bufferFromBase64Image(value: string): { buffer: Buffer; contentType: string } | undefined {
  const dataUrl = value.match(/^data:([^;]+);base64,(.*)$/);
  const contentType = dataUrl?.[1] ?? "image/jpeg";
  const base64 = dataUrl?.[2] ?? value;
  const buffer = Buffer.from(base64, "base64");

  if (buffer.length === 0) {
    return undefined;
  }

  return {
    buffer,
    contentType: imageContentType(buffer) ?? contentType
  };
}

function imageContentType(buffer: Buffer): string | undefined {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "image/jpeg";
  }

  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }

  return undefined;
}

function extractTraceId(payload: Record<string, unknown>): string | undefined {
  return stringValue(payload.trace_id) ?? stringValue(payload.request_id) ?? stringValue(payload.id);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function positiveNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
