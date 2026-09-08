import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // Create an application context without starting the HTTP server
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  
  // Structured logging
  app.useLogger(app.get(Logger));

  // Enable graceful shutdown for worker processes
  app.enableShutdownHooks();
  
  const logger = app.get(Logger);
  logger.log('Worker process started and waiting for jobs...');
}
bootstrap();
