# Guide d'utilisation de Microsoft Graph Explorer avec l'API

Ce guide explique comment utiliser Microsoft Graph Explorer pour tester et utiliser les connexions utilisateur avec l'API.

## 📚 Qu'est-ce que Microsoft Graph Explorer ?

[Microsoft Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer) est un outil en ligne qui permet de tester les appels à l'API Microsoft Graph. Il vous permet de :

- Tester les endpoints Graph API
- Obtenir des tokens d'accès Azure AD
- Explorer les données utilisateur, groupes, calendriers, etc.

## 🔐 Méthode 1 : Utilisation via Graph Explorer (Recommandé)

### Étape 1 : Obtenir un token depuis Graph Explorer

1. **Allez sur** [Microsoft Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer)

2. **Connectez-vous** avec votre compte Azure AD :
   - Email : `dev@groupe-espi.fr`
   - Mot de passe : `espi2077*`

3. **Sélectionnez les permissions** nécessaires :
   - `User.Read` (lecture du profil utilisateur)
   - `User.Read.All` (lecture de tous les profils)
   - `Group.Read.All` (lecture des groupes)
   - `offline_access` (pour obtenir un refresh token)

4. **Copiez le token d'accès** :
   - Cliquez sur "Access token" dans le panneau de droite
   - Copiez le token (il commence par `eyJ...`)

### Étape 2 : Utiliser le token avec l'API

#### Option A : Via l'endpoint Graph Explorer de l'API

```bash
POST http://localhost:3000/auth/graph/explorer
Content-Type: application/json

{
  "token": "VOTRE_TOKEN_DE_GRAPH_EXPLORER",
  "endpoint": "/me"
}
```

**Endpoints disponibles** :
- `/me` - Profil de l'utilisateur connecté
- `/me/memberOf` - Groupes de l'utilisateur
- `/me/photo` - Photo de profil
- `/me/messages` - Messages (si permissions accordées)
- `/users` - Liste des utilisateurs
- Etc.

#### Option B : Utiliser directement les endpoints Graph de l'API

```bash
# Récupérer le profil depuis Graph
GET http://localhost:3000/auth/graph/profile?token=VOTRE_TOKEN

# Récupérer la photo
GET http://localhost:3000/auth/graph/photo?token=VOTRE_TOKEN

# Récupérer les groupes
GET http://localhost:3000/auth/graph/groups?token=VOTRE_TOKEN
```

## 🔄 Méthode 2 : Connexion via l'API (Flux complet)

### Étape 1 : Initier la connexion

```bash
GET http://localhost:3000/auth/azure-ad
```

Cela vous redirige vers Azure AD pour vous connecter.

### Étape 2 : Après la connexion

Vous recevrez une réponse avec :
```json
{
  "access_token": "eyJ...", // Token JWT pour l'API
  "azure_access_token": "eyJ...", // Token Azure AD pour Graph API
  "user": {
    "id": "...",
    "email": "dev@groupe-espi.fr",
    "name": "...",
    "graphData": {
      // Données complètes depuis Microsoft Graph
      "id": "...",
      "displayName": "...",
      "mail": "dev@groupe-espi.fr",
      "photo": "data:image/jpeg;base64,...",
      "groups": ["Groupe 1", "Groupe 2"]
    }
  }
}
```

### Étape 3 : Utiliser le token Azure AD

Copiez le `azure_access_token` et utilisez-le pour appeler Graph API :

```bash
# Via l'endpoint Graph Explorer
POST http://localhost:3000/auth/graph/explorer
{
  "token": "VOTRE_AZURE_ACCESS_TOKEN",
  "endpoint": "/me/memberOf"
}

# Ou directement via les endpoints Graph
GET http://localhost:3000/auth/graph/profile?token=VOTRE_AZURE_ACCESS_TOKEN
```

## 📋 Endpoints disponibles

### Authentification

| Méthode | Endpoint | Description |
|---------|----------|------------|
| GET | `/auth/azure-ad` | Initier la connexion Azure AD |
| POST | `/auth/azure-ad/callback` | Callback après authentification |
| GET | `/auth/profile` | Profil utilisateur (JWT requis) |
| POST | `/auth/logout` | Déconnexion |

### Microsoft Graph

| Méthode | Endpoint | Description |
|---------|----------|------------|
| GET | `/auth/graph/profile` | Profil depuis Graph API |
| GET | `/auth/graph/photo` | Photo de profil depuis Graph |
| GET | `/auth/graph/groups` | Groupes de l'utilisateur |
| POST | `/auth/graph/explorer` | Tester n'importe quel endpoint Graph |

## 🧪 Exemples d'utilisation

### Exemple 1 : Récupérer le profil complet

```bash
curl -X POST http://localhost:3000/auth/graph/explorer \
  -H "Content-Type: application/json" \
  -d '{
    "token": "VOTRE_TOKEN",
    "endpoint": "/me"
  }'
```

### Exemple 2 : Récupérer les groupes

```bash
curl -X POST http://localhost:3000/auth/graph/explorer \
  -H "Content-Type: application/json" \
  -d '{
    "token": "VOTRE_TOKEN",
    "endpoint": "/me/memberOf"
  }'
```

### Exemple 3 : Récupérer les messages (si permissions accordées)

```bash
curl -X POST http://localhost:3000/auth/graph/explorer \
  -H "Content-Type: application/json" \
  -d '{
    "token": "VOTRE_TOKEN",
    "endpoint": "/me/messages"
  }'
```

### Exemple 4 : Lister tous les utilisateurs (nécessite User.Read.All)

```bash
curl -X POST http://localhost:3000/auth/graph/explorer \
  -H "Content-Type: application/json" \
  -d '{
    "token": "VOTRE_TOKEN",
    "endpoint": "/users"
  }'
```

## 🔑 Permissions Microsoft Graph

Pour utiliser certaines fonctionnalités, vous devez demander les permissions appropriées dans Azure Portal :

| Permission | Description |
|------------|-------------|
| `User.Read` | Lire le profil de l'utilisateur connecté |
| `User.Read.All` | Lire tous les profils utilisateur |
| `Group.Read.All` | Lire tous les groupes |
| `Mail.Read` | Lire les emails |
| `Calendars.Read` | Lire les calendriers |
| `Files.Read.All` | Lire les fichiers |

**Note** : Certaines permissions nécessitent le consentement de l'administrateur.

## 🛠️ Configuration dans Azure Portal

1. **Allez dans** Azure Portal → Microsoft Entra ID → App registrations

2. **Sélectionnez votre application**

3. **API permissions** → **Add a permission** → **Microsoft Graph**

4. **Sélectionnez les permissions** nécessaires :
   - Delegated permissions : `User.Read`, `Group.Read.All`, etc.

5. **Grant admin consent** si nécessaire

6. **Mettez à jour les scopes** dans `.env` :
   ```env
   # Les scopes sont déjà configurés dans la stratégie Azure AD
   # scope: ['openid', 'profile', 'email', 'User.Read', 'offline_access']
   ```

## 📊 Utilisation avec Swagger

1. **Accédez à** `http://localhost:3000/api`

2. **Testez l'endpoint** `/auth/graph/explorer` :
   - Cliquez sur "Try it out"
   - Entrez votre token Azure AD
   - Spécifiez l'endpoint Graph (ex: `/me`)
   - Cliquez sur "Execute"

3. **Visualisez la réponse** directement dans Swagger

## 🔒 Sécurité

- ⚠️ **Ne partagez jamais vos tokens** publiquement
- ⚠️ Les tokens expirent après un certain temps (généralement 1 heure)
- ⚠️ Utilisez `offline_access` pour obtenir un refresh token
- ⚠️ En production, utilisez HTTPS pour toutes les communications

## 📝 Notes importantes

1. **Token expiration** : Les tokens Azure AD expirent généralement après 1 heure. Vous devrez vous reconnecter ou utiliser un refresh token.

2. **Permissions** : Assurez-vous que les permissions nécessaires sont accordées dans Azure Portal.

3. **Tenant ID** : Pour limiter l'accès aux utilisateurs de votre tenant, configurez `AZURE_AD_TENANT_ID` dans `.env`.

4. **Graph Explorer** : L'outil Graph Explorer est idéal pour tester et explorer les endpoints disponibles dans Microsoft Graph API.

## 🔗 Ressources

- [Microsoft Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer)
- [Documentation Microsoft Graph API](https://docs.microsoft.com/en-us/graph/overview)
- [Référence des permissions Graph](https://docs.microsoft.com/en-us/graph/permissions-reference)
- [Guide de démarrage rapide Graph API](https://docs.microsoft.com/en-us/graph/quick-start)

