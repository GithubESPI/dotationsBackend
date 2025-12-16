# Guide de Test - Connexion Azure AD

Ce guide vous explique comment tester la connexion Azure AD avec l'utilisateur `dev@groupe-espi.fr`.

## Prérequis

1. **Configuration Azure AD complétée** :
   - Application enregistrée dans Azure Portal
   - Client ID, Client Secret et Tenant ID configurés dans `.env`
   - Redirect URI configuré : `http://localhost:3000/auth/azure-ad/callback`

2. **Application démarrée** :
   ```bash
   pnpm run start:dev
   ```

## Méthode 1 : Test via le navigateur (Recommandé)

1. **Démarrer l'application** :
   ```bash
   pnpm run start:dev
   ```

2. **Ouvrir le navigateur** et aller sur :
   ```
   http://localhost:3000/auth/azure-ad
   ```

3. **Vous serez redirigé vers Azure AD**. Connectez-vous avec :
   - **Email** : `dev@groupe-espi.fr`
   - **Mot de passe** : `espi2077*`

4. **Après la connexion**, vous serez redirigé vers le callback qui retournera :
   ```json
   {
     "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "user": {
       "id": "...",
       "email": "dev@groupe-espi.fr",
       "name": "...",
       "roles": []
     }
   }
   ```

5. **Copiez le `access_token`** pour tester les endpoints protégés.

## Méthode 2 : Test avec le script automatique

1. **Démarrer l'application** :
   ```bash
   pnpm run start:dev
   ```

2. **Dans un autre terminal**, exécutez le script de test :
   ```bash
   pnpm run test:azure-login
   ```

3. Le script vous guidera à travers le processus de test.

## Méthode 3 : Test avec curl

### Étape 1 : Initier la connexion
```bash
curl -X GET "http://localhost:3000/auth/azure-ad" -L -v
```

Cela vous redirigera vers Azure AD. Vous devrez vous connecter manuellement dans le navigateur.

### Étape 2 : Tester le profil avec le token JWT
```bash
curl -X GET "http://localhost:3000/auth/profile" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Remplacez `YOUR_JWT_TOKEN` par le token obtenu après la connexion.

## Méthode 4 : Test via Swagger UI

1. **Accéder à Swagger** :
   ```
   http://localhost:3000/api
   ```

2. **Cliquer sur** `/auth/azure-ad` → **Try it out** → **Execute**

3. **Vous serez redirigé vers Azure AD** pour vous connecter.

4. **Après la connexion**, utilisez le token retourné pour tester les autres endpoints.

## Vérification de la configuration

### Vérifier que le Tenant ID est configuré

Assurez-vous que votre fichier `.env` contient :
```env
AZURE_AD_TENANT_ID=votre-tenant-id-spécifique
```

**⚠️ Important** : Si vous utilisez `common`, tous les utilisateurs Azure AD pourront se connecter. Pour limiter l'accès aux utilisateurs de votre tenant uniquement, utilisez votre Tenant ID spécifique.

### Vérifier le domaine autorisé (optionnel)

Pour limiter l'accès à un domaine spécifique (ex: `@groupe-espi.fr`), ajoutez dans `.env` :
```env
AZURE_AD_ALLOWED_DOMAIN=groupe-espi.fr
```

## Dépannage

### Erreur : "Le serveur n'est pas accessible"
- Vérifiez que l'application est démarrée : `pnpm run start:dev`
- Vérifiez que le port 3000 n'est pas utilisé par une autre application

### Erreur : "Profil Azure AD invalide"
- Vérifiez que les credentials Azure AD sont corrects dans `.env`
- Vérifiez que l'application Azure AD est correctement configurée dans le portail

### Erreur : "L'utilisateur n'appartient pas au tenant autorisé"
- Vérifiez que le Tenant ID dans `.env` correspond au tenant de l'utilisateur
- Vérifiez que l'utilisateur `dev@groupe-espi.fr` appartient bien au tenant configuré

### Erreur : "Redirect URI mismatch"
- Vérifiez que le Redirect URI dans Azure Portal correspond exactement à celui dans `.env`
- Le Redirect URI doit être : `http://localhost:3000/auth/azure-ad/callback`

## Test du profil utilisateur

Une fois connecté et avec un token JWT valide :

```bash
# Test du profil
curl -X GET "http://localhost:3000/auth/profile" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test de la liste des utilisateurs
curl -X GET "http://localhost:3000/users" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Notes importantes

1. **Sécurité** : Ne partagez jamais vos credentials Azure AD ou votre JWT_SECRET
2. **Production** : Changez `JWT_SECRET` pour un secret fort et unique en production
3. **HTTPS** : En production, utilisez HTTPS pour toutes les communications
4. **CORS** : Configurez `FRONTEND_URL` dans `.env` pour votre frontend en production

