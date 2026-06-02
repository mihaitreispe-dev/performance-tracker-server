import { Module, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cors from 'cors';
import { json, type NextFunction, type Request, type Response, urlencoded } from 'express';
import basicAuth from 'express-basic-auth';
import helmet from 'helmet';
import { uploadsDir } from 'src/lib/fs/dirs';
import { RootLogger } from 'src/lib/log/RootLogger';
import { ApiV1Module } from 'src/modules/api/v1/api-v1.module';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { DatabaseModule } from 'src/modules/database/database.module';
import { GoogleTtsModule } from 'src/modules/google-tts/google-tts.module';

@Module({
  imports: [
    AppConfigModule.forRoot(),
    DatabaseModule.forRoot(),
    MulterModule.register({
      dest: uploadsDir(),
    }),
    // @Global TTS service so exercise voice-over (and future
    // course/snack hooks) can inject GoogleTtsService without
    // re-importing per feature module.
    GoogleTtsModule,
    ApiV1Module,
  ],
})
export class ApiV1AppModule {}

export async function bootstrap(opts?: { port: number }) {
  const { port = 5100 } = opts ?? {};
  const app = await NestFactory.create(ApiV1AppModule, {
    bodyParser: false,
    logger: new RootLogger({ prefix: 'APIV1', logLevels: ['debug', 'error', 'log', 'verbose', 'warn'] }),
  });
  const configService: AppConfigService = app.get(AppConfigService);

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: ['1'] });

  const rawBodyBuffer = (req: any, _: any, buffer: any, encoding: any) => {
    if (!req.headers['stripe-signature']) {
      return;
    }

    if (buffer && buffer.length) {
      req.rawBody = buffer.toString(encoding || 'utf8');
    }
  };
  // Security headers: X-Frame-Options, X-Content-Type-Options, HSTS, CSP, etc.
  // Swagger UI pulls its own CDN assets, so loosen the CSP only for the docs
  // route; everything else runs with helmet's restrictive defaults.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/docs/')) {
      helmet({ contentSecurityPolicy: false })(req, res, next);
    } else {
      helmet()(req, res, next);
    }
  });

  app.use(urlencoded({ verify: rawBodyBuffer, limit: '50mb', extended: true }));
  app.use(json({ verify: rawBodyBuffer, limit: '50mb' }));

  // Configure CORS with restricted origins from environment
  const corsOrigins = configService.corsOrigins;
  if (corsOrigins.length > 0) {
    app.use(
      cors({
        origin: corsOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      }),
    );
  } else if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
    // Allow all origins in development mode only
    app.use(cors());
  } else {
    // Production with no CORS_ORIGINS set - restrict to same origin
    app.use(
      cors({
        origin: false,
        credentials: true,
      }),
    );
  }

  const docsRoute = '/docs/api-explorer';
  const swaggerUsername = configService.swaggerUsername;
  const swaggerPassword = configService.swaggerPassword;
  if (swaggerUsername && swaggerPassword) {
    const builder = new DocumentBuilder()
      .setTitle('Younison API Specification')
      .setDescription('Younison API')
      .setVersion('1.0');
    const apiUrl = configService.apiV1URL;
    if (process.env.DEBUG) {
      builder.addServer(`http://localhost:${port}`);
    }
    builder.addServer(apiUrl);
    builder.addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT');
    const options = builder.build();
    const document = SwaggerModule.createDocument(app, options, {
      deepScanRoutes: true,
      operationIdFactory,
    });
    app.use(
      docsRoute,
      basicAuth({
        challenge: true,
        users: { [swaggerUsername]: swaggerPassword },
      }),
    );
    SwaggerModule.setup(docsRoute, app, document, {
      swaggerOptions: {
        displayRequestDuration: true,
        persistAuthorization: true,
        apisSorter: 'alpha',
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
      customCss: `
        .swagger-ui .topbar { display: none; }
        .swagger-ui .opblock .opblock-summary-method { background: black !important; }
        .swagger-ui .btn.authorize { color: black; border-color: black; }
        .swagger-ui .btn.authorize svg { fill: black; }
      `,
    });
  }
  await app.listen(port);
}

const operationIdFactory = (_: string, methodKey: string) => `${methodKey}`;
