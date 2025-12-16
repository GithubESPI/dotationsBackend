# Guide de test de connexion

Ce guide explique comment tester la connexion Azure AD avec les scripts fournis.

## 🚀 Scripts disponibles

### 1. Test rapide (Recommandé pour débuter)

```bash
pnpm run test:quick
# ou
node scripts/quick-test-connection.js
```

Ce script :
- ✅ Vérifie que le serveur est accessible
- ✅ Affiche les instructions pour se connecter
- ✅ Permet de tester un token Azure AD si disponible

### 2. Test complet

```bash
pnpm run test:connection
# ou
node scripts/test-connection.js
```

Ce script effectue des tests complets :
- ✅ Vérification du serveur
- ✅ Test de connexion Azure AD
- ✅ Test du profil avec token JWT
- ✅ Test de Microsoft Graph API
- ✅ Test des endpoints utilisateurs
- ✅ Test d'endpoints Graph personnalisés

### 3. Test Azure Login (ancien script)

```bash
pnpm run test:azure-login
# ou
node scripts/test-azure-login.js
```

## 📋 Prérequis

1. **Application démarrée** :
   ```bash
   pnpm run start:dev
   ```

2. **Configuration Azure AD** :
   - Fichier `.env` configuré avec les credentials Azure AD
   - Application Azure AD enregistrée dans le portail

## 🔐 Méthodes de test

### Méthode 1 : Via le navigateur

1. **Démarrer l'application** :
   ```bash
   pnpm run start:dev
   ```

2. **Ouvrir le navigateur** :
   ```
   http://localhost:3000/auth/azure-ad
   ```

3. **Se connecter** :
   - Email : `dev@groupe-espi.fr`
   - Mot de passe : `espi2077*`

4. **Récupérer les tokens** :
   Après la connexion, vous recevrez :
   ```json
   {
     "access_token": "eyJ...", // Token JWT pour l'API
     "azure_access_token": "eyJ...", // Token Azure AD pour Graph
     "user": { ... }
   }
   ```

### Méthode 2 : Via Microsoft Graph Explorer

1. **Aller sur** [Microsoft Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer)

2. **Se connecter** avec `dev@groupe-espi.fr`

3. **Copier le token d'accès**

4. **Tester avec le script** :
   ```bash
   pnpm run test:connection
   ```
   Entrez le token quand demandé.

### Méthode 3 : Via Swagger UI

1. **Ouvrir Swagger** :
   ```
   http://localhost:3000/api
   ```

2. **Tester l'endpoint** `/auth/azure-ad`

3. **Utiliser le token retourné** pour tester les autres endpoints

## 🧪 Exemples d'utilisation

### Exemple 1 : Test rapide

```bash
# Démarrer l'application dans un terminal
pnpm run start:dev

# Dans un autre terminal, lancer le test
pnpm run test:quick
```

### Exemple 2 : Test avec token

```bash
# Lancer le test
pnpm run test:connection

# Quand demandé, entrer le token Azure AD
# Le script testera automatiquement :
# - Le profil utilisateur
# - La photo de profil
# - Les groupes
# - Un endpoint personnalisé (si demandé)
```

### Exemple 3 : Test avec curl

```bash
# Test du profil avec token Azure AD
curl -X POST http://localhost:3000/auth/graph/explorer \
  -H "Content-Type: application/json" \
  -d '{
    "token": "VOTRE_TOKEN_AZURE_AD",
    "endpoint": "/me"
  }'

# Test du profil avec token JWT
curl -X GET http://localhost:3000/auth/profile \
  -H "Authorization: Bearer VOTRE_TOKEN_JWT"
```

## 📊 Résultats attendus

### Test réussi

```
🔐 Test de connexion Azure AD

============================================================
1. Vérification du serveur
============================================================
✅ Serveur accessible sur http://localhost:3000
ℹ️  Message: Hello World!

============================================================
2. Test de connexion Azure AD
============================================================
ℹ️  Pour tester la connexion Azure AD:
   1. Ouvrez votre navigateur
   2. Allez sur: http://localhost:3000/auth/azure-ad
   ...
```

### Erreurs courantes

#### Serveur non accessible
```
❌ Le serveur n'est pas accessible
⚠️  Assurez-vous que l'application est démarrée: pnpm run start:dev
```
**Solution** : Démarrer l'application avec `pnpm run start:dev`

#### Token invalide
```
❌ Erreur 401: Unauthorized
```
**Solution** : Vérifier que le token est valide et non expiré

#### Permissions insuffisantes
```
⚠️  Groupes non disponibles (peut nécessiter des permissions supplémentaires)
```
**Solution** : Accorder les permissions nécessaires dans Azure Portal

## 🔧 Options avancées

### Changer l'URL de l'API

```bash
# Via variable d'environnement
API_URL=http://localhost:3001 node scripts/test-connection.js

# Via argument
node scripts/test-connection.js --api-url http://localhost:3001
```

### Aide

```bash
node scripts/test-connection.js --help
```

## 📝 Notes importantes

1. **Tokens expirés** : Les tokens Azure AD expirent généralement après 1 heure. Vous devrez vous reconnecter.

2. **Permissions** : Certaines fonctionnalités nécessitent des permissions spécifiques dans Azure Portal.

3. **HTTPS en production** : En production, utilisez HTTPS pour toutes les communications.

4. **Sécurité** : Ne partagez jamais vos tokens publiquement.

## 🔗 Ressources

- [Guide Graph Explorer](GRAPH_EXPLORER_GUIDE.md)
- [Documentation Swagger](http://localhost:3000/api)
- [Microsoft Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer)

