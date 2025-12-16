# Guide de dépannage - Erreurs Azure AD

## ❌ Erreur : AADSTS700054 - response_type 'id_token' not enabled

### Symptôme
```
AADSTS700054: response_type 'id_token' is not enabled for the application.
```

### Cause
Le type de réponse `id_token` n'est pas activé pour votre application dans Azure Portal, ou la stratégie utilise un flow non supporté.

### Solution 1 : Utiliser le flow 'code' (Recommandé - Déjà corrigé)

Le code a été modifié pour utiliser le flow Authorization Code (`code`) au lieu de `code id_token`. Ce flow est plus standard et fonctionne avec toutes les applications Azure AD.

**Redémarrez l'application** :
```bash
pnpm run start:dev
```

### Solution 2 : Activer ID tokens dans Azure Portal (Alternative)

Si vous préférez utiliser `code id_token`, vous devez l'activer dans Azure Portal :

1. Allez sur [Azure Portal](https://portal.azure.com/)
2. Microsoft Entra ID → App registrations → Votre application
3. Allez dans **Authentication**
4. Dans la section **Implicit grant and hybrid flows**, cochez :
   - ✅ **ID tokens** (used for implicit and hybrid flows)
5. Cliquez sur **Save**

**Note** : Cette option est dépréciée par Microsoft. Il est recommandé d'utiliser le flow Authorization Code (`code`) qui est déjà configuré.

## ❌ Erreur : AADSTS900144 - client_id manquant

### Symptôme
```
AADSTS900144: The request body must contain the following parameter: 'client_id'.
```

### Cause
Le paramètre `AZURE_AD_CLIENT_ID` n'est pas configuré ou est vide dans votre fichier `.env`.

### Solution

1. **Vérifier la configuration** :
   ```bash
   pnpm run check:config
   ```

2. **Créer ou mettre à jour le fichier `.env`** :
   ```bash
   # Si le fichier .env n'existe pas, copiez env.example
   cp env.example .env
   ```

3. **Remplir les valeurs Azure AD dans `.env`** :
   ```env
   AZURE_AD_CLIENT_ID=votre-client-id-ici
   AZURE_AD_CLIENT_SECRET=votre-client-secret-ici
   AZURE_AD_TENANT_ID=votre-tenant-id-ici
   AZURE_AD_REDIRECT_URI=http://localhost:3000/auth/azure-ad/callback
   ```

4. **Redémarrer l'application** :
   ```bash
   pnpm run start:dev
   ```

## ❌ Autres erreurs courantes

### Erreur : "Redirect URI mismatch"

**Symptôme** : L'URI de redirection ne correspond pas.

**Solution** :
1. Vérifiez que `AZURE_AD_REDIRECT_URI` dans `.env` correspond exactement à celui dans Azure Portal
2. Dans Azure Portal → App registrations → Votre app → Authentication
3. Ajoutez l'URI : `http://localhost:3000/auth/azure-ad/callback`

### Erreur : "Invalid client secret"

**Symptôme** : Le secret client est invalide ou expiré.

**Solution** :
1. Créez un nouveau secret dans Azure Portal
2. Mettez à jour `AZURE_AD_CLIENT_SECRET` dans `.env`
3. Redémarrez l'application

### Erreur : "User does not belong to tenant"

**Symptôme** : L'utilisateur n'appartient pas au tenant configuré.

**Solution** :
1. Vérifiez que `AZURE_AD_TENANT_ID` correspond au tenant de l'utilisateur
2. Ou utilisez `common` pour autoriser tous les tenants (non recommandé en production)

### Erreur : "CORS" dans Swagger

**Symptôme** : Erreur CORS lors du test dans Swagger.

**Solution** :
- L'endpoint `/auth/azure-ad` ne peut pas être testé directement dans Swagger (redirection OAuth2)
- Utilisez plutôt `/auth/test` avec un token Azure AD
- Ou testez directement dans le navigateur : `http://localhost:3000/auth/azure-ad`

## 🔍 Vérification étape par étape

### 1. Vérifier que le fichier .env existe
```bash
ls -la .env
# ou sur Windows
dir .env
```

### 2. Vérifier le contenu du fichier .env
```bash
# Ne pas afficher les secrets en clair
cat .env | grep AZURE_AD_CLIENT_ID
```

### 3. Vérifier que les variables sont chargées
```bash
pnpm run check:config
```

### 4. Vérifier les logs au démarrage
Lors du démarrage de l'application, vous devriez voir :
```
✅ Configuration Azure AD chargée:
   Client ID: 12345678...
   Tenant ID: votre-tenant-id
   Redirect URI: http://localhost:3000/auth/azure-ad/callback
```

Si vous ne voyez pas ces logs, la configuration n'est pas chargée correctement.

## 📝 Checklist de configuration

- [ ] Fichier `.env` créé à la racine du projet
- [ ] `AZURE_AD_CLIENT_ID` configuré (pas vide, pas "your-azure-ad-client-id")
- [ ] `AZURE_AD_CLIENT_SECRET` configuré (pas vide, pas "your-azure-ad-client-secret")
- [ ] `AZURE_AD_TENANT_ID` configuré (ou utilise "common")
- [ ] `AZURE_AD_REDIRECT_URI` correspond à celui dans Azure Portal
- [ ] Application redémarrée après modification de `.env`
- [ ] Script `pnpm run check:config` ne montre aucune erreur
- [ ] Flow `code` utilisé (pas `code id_token`) - **Déjà corrigé dans le code**

## 🆘 Besoin d'aide ?

1. **Vérifiez les logs** de l'application au démarrage
2. **Exécutez le script de vérification** : `pnpm run check:config`
3. **Consultez la documentation** :
   - `README.md` - Instructions d'installation
   - `TEST_CONNECTION.md` - Guide de test
   - `GRAPH_EXPLORER_GUIDE.md` - Guide Graph Explorer

## 🔗 Ressources

- [Documentation Azure AD](https://docs.microsoft.com/en-us/azure/active-directory/develop/)
- [Erreurs Azure AD](https://docs.microsoft.com/en-us/azure/active-directory/develop/reference-aadsts-error-codes)
- [Azure Portal](https://portal.azure.com/)
- [Flow Authorization Code](https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow)
