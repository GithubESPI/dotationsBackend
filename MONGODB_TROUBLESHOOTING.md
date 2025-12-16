# Dépannage MongoDB - Erreur d'authentification

## ❌ Erreur: `Authentication failed`

### Symptôme
```
MongoServerError: Authentication failed.
```

### Cause
L'URI MongoDB n'utilise pas le bon `authSource`. L'utilisateur root créé par Docker est dans la base `admin`, pas dans la base `dotation`.

### Solution

**1. Vérifiez votre fichier `.env`**

L'URI doit être exactement :
```env
MONGODBURI=mongodb://dotation:dotation_password@localhost:27017/dotation?authSource=admin
```

**Points importants :**
- ✅ `authSource=admin` (obligatoire)
- ✅ Username: `dotation`
- ✅ Password: `dotation_password`
- ✅ Database: `dotation` (base de données où seront stockées les collections)

**2. Vérifiez que MongoDB est démarré**

```bash
docker ps
```

Vous devriez voir `mongodb_dotation` dans la liste.

**3. Si MongoDB n'est pas démarré**

```bash
docker-compose up -d mongodb
```

**4. Testez la connexion manuellement**

```bash
docker exec -it mongodb_dotation mongosh -u dotation -p dotation_password --authenticationDatabase admin
```

Si cela fonctionne, le problème vient de l'URI dans `.env`.

### URI incorrectes (ne fonctionnent PAS)

```env
# ❌ Sans authSource
MONGODBURI=mongodb://dotation:dotation_password@localhost:27017/dotation

# ❌ Avec authSource=dotation (l'utilisateur n'est pas dans cette base)
MONGODBURI=mongodb://dotation:dotation_password@localhost:27017/dotation?authSource=dotation
```

### URI correcte

```env
# ✅ Avec authSource=admin
MONGODBURI=mongodb://dotation:dotation_password@localhost:27017/dotation?authSource=admin
```

## 🔍 Vérification

Après avoir corrigé l'URI, redémarrez le serveur :

```bash
npm run start:dev
```

Vous devriez voir :
```
✅ Connexion MongoDB configurée
   URI: mongodb://***:***@localhost:27017/dotation?authSource=admin
```

Et **PAS** d'erreur `Authentication failed`.

## 🆘 Si le problème persiste

1. **Réinitialisez MongoDB** (⚠️ supprime toutes les données) :
   ```bash
   docker-compose down -v
   docker-compose up -d mongodb
   ```

2. **Vérifiez les logs MongoDB** :
   ```bash
   docker logs mongodb_dotation
   ```

3. **Testez avec MongoDB Compass** :
   - Connection String: `mongodb://dotation:dotation_password@localhost:27017/dotation?authSource=admin`
   - Si ça fonctionne dans Compass mais pas dans l'app, vérifiez le `.env`

