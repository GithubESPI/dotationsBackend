# Configuration MongoDB - Application de Dotation

## 📋 Prérequis

1. Docker installé et démarré
2. Variables d'environnement configurées

## 🚀 Démarrage rapide

### 1. Installer les dépendances

```bash
npm install @nestjs/mongoose mongoose
```

### 2. Démarrer MongoDB avec Docker

```bash
docker-compose up -d mongodb
```

Cela démarre MongoDB sur le port `27017` avec :
- **Username:** `dotation`
- **Password:** `dotation_password`
- **Database:** `dotation` (créée automatiquement)

### 3. Configurer la variable d'environnement

Ajoutez dans votre fichier `.env` :

```env
MONGODBURI=mongodb://dotation:dotation_password@localhost:27017/dotation?authSource=admin
```

**⚠️ IMPORTANT:** 
- L'utilisateur `dotation` est créé dans la base `admin` (utilisateur root)
- Vous DEVEZ utiliser `authSource=admin` dans l'URI
- Si vous omettez `authSource`, le module l'ajoutera automatiquement

**Note:** Si vous utilisez une instance MongoDB différente, adaptez l'URI en conséquence.

## 📊 Schémas MongoDB créés

### 1. **User** (`users`)
- Synchronisation avec Office 365
- Informations utilisateur (nom, email, département, etc.)
- Statut actif/inactif

### 2. **Equipment** (`equipments`)
- Matériel informatique (PC, tablettes, mobiles, etc.)
- Synchronisation avec Jira Asset
- Statut (disponible, affecté, restitué, etc.)

### 3. **Allocation** (`allocations`)
- Dotations de matériel aux utilisateurs
- Historique des dotations
- Signatures électroniques
- PDFs archivés

### 4. **Return** (`returns`)
- Restitutions de matériel
- État du matériel restitué
- Signatures multiples (utilisateur, IT, RH)
- Validation RH

### 5. **Document** (`documents`)
- PDFs archivés (dotation et restitution)
- Métadonnées (QR codes, versions charte)
- Signatures associées
- Statut (pending, signed, archived)

### 6. **Audit** (`audits`)
- Traçabilité complète de toutes les actions
- Logs d'audit pour conformité
- Historique des modifications

## 🔍 Vérification de la connexion

Une fois le serveur démarré, vous devriez voir dans les logs :

```
✅ Connexion MongoDB configurée
   URI: mongodb://***:***@localhost:27017/dotation?authSource=admin
```

## 🛠️ Commandes utiles

### Accéder à MongoDB via MongoDB Compass

1. Téléchargez [MongoDB Compass](https://www.mongodb.com/products/compass)
2. Connectez-vous avec :
   - **Connection String:** `mongodb://dotation:dotation_password@localhost:27017/dotation?authSource=admin`

### Accéder via CLI MongoDB

```bash
docker exec -it mongodb_dotation mongosh -u dotation -p dotation_password --authenticationDatabase admin
```

### Voir les collections

```javascript
use dotation
show collections
```

### Voir les données d'une collection

```javascript
db.users.find().pretty()
db.equipments.find().pretty()
db.allocations.find().pretty()
```

## 📝 Notes importantes

1. **GridFS pour les PDFs** : Les PDFs seront stockés via GridFS (système de fichiers MongoDB) pour gérer les fichiers volumineux
2. **Index** : Tous les schémas ont des index optimisés pour les recherches fréquentes
3. **Relations** : Les schémas utilisent des références MongoDB (`Types.ObjectId`) pour les relations
4. **Timestamps** : Tous les schémas ont `createdAt` et `updatedAt` automatiques

## 🔒 Sécurité

- Les credentials MongoDB sont stockés dans `.env` (ne jamais commiter ce fichier)
- L'authentification MongoDB est activée dans Docker
- Les données sensibles (IMEI, n° de série) peuvent être chiffrées si nécessaire

## 🐛 Dépannage

### Erreur de connexion

1. Vérifiez que MongoDB est démarré : `docker ps`
2. Vérifiez l'URI dans `.env`
3. Vérifiez les credentials (username/password)

### Erreur d'authentification

Assurez-vous que `authSource=admin` est présent dans l'URI MongoDB.

### Réinitialiser la base de données

```bash
docker-compose down -v
docker-compose up -d mongodb
```

**⚠️ Attention:** Cela supprime toutes les données !

