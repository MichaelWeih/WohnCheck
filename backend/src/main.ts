import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Needed so the job worker can release its jobs and abort running handlers on SIGTERM / SIGINT.
  app.enableShutdownHooks();

  // Behind a reverse proxy the client IP (used for rate limiting) comes from X-Forwarded-For.
  // Set TRUST_PROXY to the number of trusted proxy hops (e.g. "1") or an Express trust-proxy value.
  const trustProxy = process.env.TRUST_PROXY;

  if (trustProxy) {
    app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  }

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
