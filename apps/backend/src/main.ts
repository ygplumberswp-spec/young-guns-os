import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { TransformInterceptor } from './interceptors/transform.interceptor';
import { LoggingInterceptor } from './interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(helmet());
  app.use(compression());

  app.enableCors({
    origin: configService.get<string>('CORS_ORIGINS')?.split(',') || [],
    credentials: true,
  });

  app.setGlobalPrefix(configService.get<string>('API_PREFIX') || 'api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Young Guns OS API')
    .setDescription('AI Operating System for Young Guns Plumbing')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management')
    .addTag('customers', 'Customer CRM')
    .addTag('jobs', 'Job management')
    .addTag('bookings', 'Booking engine')
    .addTag('dispatch', 'Dispatch engine')
    .addTag('fleet', 'Fleet & GPS tracking')
    .addTag('inventory', 'Inventory management')
    .addTag('quotes', 'Quoting engine')
    .addTag('invoices', 'Invoice engine')
    .addTag('ai', 'AI agents')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port);

  console.log(`YGOS API running on port ${port}`);
  console.log(`Swagger docs: http://localhost:${port}/docs`);
}

bootstrap();
