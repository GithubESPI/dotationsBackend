import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import session from 'express-session';
import { AuthExceptionFilter } from './auth/filters/auth-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Faire confiance au reverse proxy (nginx) pour lire le bon protocole
  // Sans cela, req.protocol retourne 'http' au lieu de 'https' → mismatch URL OAuth
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  // Configuration des sessions (requis pour passport-azure-ad)
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',
      resave: true,              // Forcer la sauvegarde à chaque requête
      saveUninitialized: true,   // Créer la session immédiatement (crucial pour OAuth)
      proxy: true,               // Faire confiance au proxy nginx pour les cookies Secure
      cookie: {
        // En production avec trust proxy:true, secure:true est requis pour que 
        // les navigateurs acceptent le cookie provenant d'une redirection Azure
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 heures
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' requis pour cross-site avec secure:true
      },
    }),
  );

  // Configuration CORS améliorée
  const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(url => url.trim()).filter(Boolean);
  // Origines toujours autorisées
  const defaultOrigins = [
    'http://localhost:3001',
    'https://dotation.groupe-espi.fr',
  ];
  for (const origin of defaultOrigins) {
    if (!allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
    }
  }

  app.enableCors({
    origin: allowedOrigins,
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
