import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";

const express = require("express");
const { AppModule } = require("../apps/api/dist/app.module");

let serverPromise: Promise<any> | undefined;

async function createServer() {
  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger: ["error", "warn", "log"]
  });

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: true,
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );

  await app.init();
  return server;
}

export default async function handleNestRequest(req: any, res: any) {
  serverPromise ??= createServer();
  const server = await serverPromise;
  req.url = normalizeApiUrl(req.url);
  return server(req, res);
}

function normalizeApiUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== "string") {
    return "/api";
  }

  const parsed = new URL(rawUrl, "https://green-sonic.local");
  const gatewayPath = parsed.searchParams.get("path");

  if (gatewayPath) {
    parsed.searchParams.delete("path");
    const normalizedPath = gatewayPath.startsWith("/") ? gatewayPath : `/${gatewayPath}`;
    const apiPath = normalizedPath === "/api" || normalizedPath.startsWith("/api/") ? normalizedPath : `/api${normalizedPath}`;
    const search = parsed.searchParams.toString();
    return `${apiPath}${search ? `?${search}` : ""}`;
  }

  if (parsed.pathname === "/api" || parsed.pathname.startsWith("/api/")) {
    return `${parsed.pathname}${parsed.search}`;
  }

  return `/api${parsed.pathname}${parsed.search}`;
}
