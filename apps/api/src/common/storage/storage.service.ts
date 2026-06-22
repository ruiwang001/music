import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

@Injectable()
export class StorageService {
  private readonly bucket = process.env.S3_BUCKET ?? "";
  private readonly publicBaseUrl = process.env.S3_PUBLIC_BASE_URL ?? "";
  private readonly accessKeyId = process.env.S3_ACCESS_KEY_ID ?? "";
  private readonly secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? "";
  private readonly client = new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials:
      this.accessKeyId && this.secretAccessKey
        ? {
            accessKeyId: this.accessKeyId,
            secretAccessKey: this.secretAccessKey
          }
        : undefined
  });

  async uploadBuffer(key: string, body: Buffer, contentType: string): Promise<string> {
    if (!this.isConfigured()) {
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_DATA_URL_STORAGE !== "true") {
        throw new InternalServerErrorException("S3/R2 storage is not configured");
      }

      return `data:${contentType};base64,${body.toString("base64")}`;
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable"
      })
    );

    return this.publicUrl(key);
  }

  publicUrl(key: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    }

    return `s3://${this.bucket}/${key}`;
  }

  private isConfigured(): boolean {
    return (
      Boolean(this.bucket) &&
      Boolean(this.accessKeyId) &&
      Boolean(this.secretAccessKey) &&
      !isPlaceholder(process.env.S3_ENDPOINT) &&
      !isPlaceholder(this.bucket) &&
      !isPlaceholder(this.accessKeyId) &&
      !isPlaceholder(this.secretAccessKey) &&
      !isPlaceholder(this.publicBaseUrl)
    );
  }
}

function isPlaceholder(value?: string): boolean {
  if (!value) {
    return false;
  }

  return value.includes("change-me") || value.includes("<") || value.includes("example.com");
}
