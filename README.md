# Backend Dotation - API avec Authentification Azure AD

Backend complet développé avec NestJS, incluant l'authentification Azure AD et la documentation Swagger.

## 🚀 Fonctionnalités

- ✅ Authentification Azure AD (OAuth 2.0)
- ✅ JWT pour les tokens d'accès
- ✅ Documentation Swagger/OpenAPI complète
- ✅ Guards et stratégies d'authentification
- ✅ Validation des données
- ✅ CORS configuré
- ✅ Structure modulaire et scalable

## 📋 Prérequis

- Node.js (v18 ou supérieur)
- pnpm (ou npm/yarn)
- Un compte Azure AD avec une application enregistrée

## 🔧 Installation

1. **Cloner le projet** (si nécessaire)
```bash
cd dotation-backend
```

2. **Installer les dépendances**
```bash
pnpm install
```

3. **Configurer les variables d'environnement**

Copiez le fichier `env.example` vers `.env` :
```bash
cp env.example .env
```

Puis modifiez `.env` avec vos valeurs Azure AD :

```env
PORT=3000
FRONTEND_URL=http://localhost:3001

# Configuration Azure AD
AZURE_AD_CLIENT_ID=votre-client-id
AZURE_AD_CLIENT_SECRET=votre-client-secret
AZURE_AD_TENANT_ID=votre-tenant-id
AZURE_AD_REDIRECT_URI=http://localhost:3000/auth/azure-ad/callback

# Configuration JWT
JWT_SECRET=votre-secret-jwt-super-securise
JWT_EXPIRES_IN=1h

NODE_ENV=development
```

## 🔐 Configuration Azure AD

### Étape 1 : Créer une application dans Azure Portal

1. Allez sur [Azure Portal](https://portal.azure.com/)
2. Recherchez "Microsoft Entra ID" (anciennement Azure Active Directory)
3. Dans le menu de gauche, allez dans "App registrations"
4. Cliquez sur "New registration"
5. Configurez :
   - **Name** : Nom de votre application
   - **Supported account types** : Choisissez selon vos besoins
   - **Redirect URI** : 
     - Type : Web
     - URI : `http://localhost:3000/auth/azure-ad/callback` (dev) ou votre URL de production

### Étape 2 : Récupérer les identifiants

1. Une fois l'application créée, notez :
   - **Application (client) ID**
   - **Directory (tenant) ID**

2. Créez un **Client secret** :
   - Allez dans "Certificates & secrets"
   - Cliquez sur "New client secret"
   - Notez la **Value** (elle ne sera affichée qu'une seule fois !)

3. Configurez les **API permissions** si nécessaire :
   - Allez dans "API permissions"
   - Ajoutez les permissions nécessaires (ex: `openid`, `profile`, `email`)

### Étape 3 : Mettre à jour le fichier .env

Copiez les valeurs dans votre fichier `.env` :
```env
AZURE_AD_CLIENT_ID=<Application (client) ID>
AZURE_AD_CLIENT_SECRET=<Client secret value>
AZURE_AD_TENANT_ID=<Directory (tenant) ID>
```

## 🏃 Démarrage

### Mode développement
```bash
pnpm run start:dev
```

### Mode production
```bash
pnpm run build
pnpm run start:prod
```

L'application sera accessible sur :
- **API** : http://localhost:3000
- **Swagger** : http://localhost:3000/api

## 📚 Documentation API (Swagger)

Une fois l'application démarrée, accédez à la documentation Swagger interactive :
```
http://localhost:3000/api
```

La documentation inclut :
- Tous les endpoints disponibles
- Les schémas de requête/réponse
- La possibilité de tester les endpoints directement
- L'authentification OAuth2 et Bearer Token

## 🔑 Endpoints d'authentification

### Initier la connexion Azure AD
```
GET /auth/azure-ad
```
Redirige vers la page de connexion Azure AD.

### Callback Azure AD
```
POST /auth/azure-ad/callback
```
Endpoint de callback après authentification Azure AD. Retourne un token JWT.

### Obtenir le profil utilisateur
```
GET /auth/profile
```
Headers requis : `Authorization: Bearer <token>`

### Déconnexion
```
POST /auth/logout
```
Headers requis : `Authorization: Bearer <token>`

## 🛡️ Protection des routes

Pour protéger une route, utilisez le guard `JwtAuthGuard` :

```typescript
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('example')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ExampleController {
  // Routes protégées
}
```

Pour rendre une route publique, utilisez le décorateur `@Public()` :

```typescript
import { Public } from './auth/decorators/public.decorator';

@Get('public')
@Public()
getPublicData() {
  return { message: 'Données publiques' };
}
```

Pour obtenir l'utilisateur connecté dans un contrôleur :

```typescript
import { CurrentUser } from './auth/decorators/current-user.decorator';
import type { UserPayload } from './auth/auth.service';

@Get('me')
getMe(@CurrentUser() user: UserPayload) {
  return user;
}
```

## 📁 Structure du projet

```
src/
├── auth/                    # Module d'authentification
│   ├── decorators/         # Décorateurs personnalisés
│   ├── guards/             # Guards d'authentification
│   ├── strategies/         # Stratégies Passport
│   ├── auth.controller.ts  # Contrôleur d'authentification
│   ├── auth.module.ts      # Module d'authentification
│   └── auth.service.ts     # Service d'authentification
├── users/                   # Module utilisateurs
│   ├── users.controller.ts
│   ├── users.module.ts
│   └── users.service.ts
├── app.controller.ts        # Contrôleur principal
├── app.module.ts           # Module principal
└── main.ts                 # Point d'entrée
```

## 🧪 Tests

```bash
# Tests unitaires
pnpm run test

# Tests e2e
pnpm run test:e2e

# Couverture de code
pnpm run test:cov
```

## 🔒 Sécurité

- ✅ Validation des entrées avec `class-validator`
- ✅ Protection CSRF (à configurer pour la production)
- ✅ Tokens JWT avec expiration
- ✅ CORS configuré
- ✅ Variables d'environnement pour les secrets

### Recommandations pour la production

1. Utilisez un `JWT_SECRET` fort et unique
2. Configurez HTTPS
3. Activez la validation CSRF
4. Limitez les origines CORS
5. Utilisez un gestionnaire de secrets (Azure Key Vault, etc.)
6. Activez le rate limiting
7. Configurez les logs et monitoring

## 📝 Notes

- Le package `passport-azure-ad` est déprécié mais fonctionne toujours. Pour une solution plus moderne, considérez l'utilisation de `@azure/msal-node` ou `passport-oauth2` avec une configuration personnalisée.
- Les tokens JWT sont signés avec le secret configuré dans `JWT_SECRET`
- Le profil Azure AD est converti en format utilisateur standardisé

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

## 📄 Licence

Ce projet est sous licence MIT.
