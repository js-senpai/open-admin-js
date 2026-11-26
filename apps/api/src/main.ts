import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.use((_req:Request,res:Response,next:NextFunction)=>{res.setHeader("x-request-id",randomUUID());next();});
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useBodyParser("json", { limit: "15mb" });
  app.use(cookieParser());
  app.use(helmet());
  const prodOrigins = (process.env.ADMIN_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin:
      process.env.NODE_ENV === "production"
        ? prodOrigins.length
          ? prodOrigins
          : false
        : true,
    credentials: true
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  // Flush DB connections / queues on SIGTERM/SIGINT so restarts are clean.
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle("OpenAdminJS API")
    .setDescription("Generic admin API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  if (process.env.NODE_ENV !== "production" || process.env.OPENADMIN_SWAGGER === "1") SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, config));

  await app.listen(Number(process.env.API_PORT ?? 4000));
}

bootstrap();
