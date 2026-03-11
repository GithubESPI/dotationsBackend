import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import session from 'express-session';
import { AuthExceptionFilter } from './auth/filters/auth-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Faire confiance au reverse proxy (nginx) pour lire le bon protocole (https)
  // Sans cela, req.protocol retourne 'http' au lieu de 'https' → mismatch URL OAuth
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Configuration des sessions (requis pour passport-azure-ad)
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',
      resave: true,              // Forcer la sauvegarde à chaque requête
      saveUninitialized: true,   // Créer la session immédiatement (crucial pour OAuth)
      proxy: true,               // Faire confiance au proxy nginx pour les cookies Secure
      cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS en production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 heures
        sameSite: 'lax',             // Requis pour les redirects OAuth cross-domain
      },
    }),
  );

  // Configuration CORS améliorée
  const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(url => url.trim());
  // Ajout manuel de localhost pour être sûr
  if (!allowedOrigins.includes('http://localhost:3001')) {
    allowedOrigins.push('http://localhost:3001');
  }

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : 'http://localhost:3001',
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });


  // Validation globale
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Filtre d'exception global pour l'authentification
  app.useGlobalFilters(new AuthExceptionFilter());

  // Configuration Swagger
  const config = new DocumentBuilder()
    .setTitle('API Dotation Backend')
    .setDescription('API complète avec authentification Azure AD')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Entrez le token JWT',
        in: 'header',
      },
      'JWT-auth', // Ce nom est utilisé pour @ApiBearerAuth() dans les contrôleurs
    )
    .addOAuth2(
      {
        type: 'oauth2',
        flows: {
          authorizationCode: {
            authorizationUrl: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID || 'common'}/oauth2/v2.0/authorize`,
            tokenUrl: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID || 'common'}/oauth2/v2.0/token`,
            scopes: {
              'openid': 'OpenID Connect',
              'profile': 'Profil utilisateur',
              'email': 'Email',
            },
          },
        },
      },
      'AzureAD', // Ce nom est utilisé pour @ApiOAuth2() dans les contrôleurs
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Application démarrée sur http://localhost:${port}`);
  console.log(`📚 Documentation Swagger disponible sur http://localhost:${port}/api`);
}

bootstrap();
