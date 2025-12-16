# Module Equipment - Gestion du Matériel Informatique

## 📋 Vue d'ensemble

Le module Equipment gère le matériel informatique (PC, tablettes, mobiles, etc.) qui sera synchronisé avec Jira Asset et utilisé dans les dotations et restitutions.

## 🎯 Types de matériel supportés

- `PC_portable` - PC portable
- `PC_fixe` - Poste fixe
- `mobile` - Téléphone mobile
- `telephone_ip` - Téléphone IP
- `ecran` - Écran
- `tablette` - Tablette
- `autre` - Autres matériels

## 📊 Statuts du matériel

- `disponible` - Matériel disponible pour affectation
- `affecte` - Matériel affecté à un utilisateur
- `en_reparation` - Matériel en réparation
- `restitue` - Matériel restitué
- `perdu` - Matériel perdu
- `detruit` - Matériel détruit

## 📡 Endpoints disponibles

### Créer un matériel

```
POST /equipment
```

**Body:**
```json
{
  "type": "PC_portable",
  "brand": "Dell",
  "model": "ThinkPad E14",
  "serialNumber": "SN123456789",
  "internalId": "INT-001",
  "jiraAssetId": "JIRA-123",
  "imei": "123456789012345",  // Pour les mobiles
  "phoneLine": "+33123456789", // Pour les mobiles/téléphones IP
  "location": "Bureau Paris",
  "additionalSoftwares": ["MS Visio", "MS Project"]
}
```

### Rechercher des matériels

```
GET /equipment?query=dell&type=PC_portable&status=disponible&page=1&limit=20
```

**Paramètres de requête:**
- `query` : Recherche par marque, modèle, N° série ou N° interne
- `type` : Filtrer par type de matériel
- `status` : Filtrer par statut
- `brand` : Filtrer par marque
- `location` : Filtrer par localisation
- `currentUserId` : Filtrer par utilisateur actuel
- `page` : Numéro de page (défaut: 1)
- `limit` : Nombre d'éléments par page (défaut: 20, max: 100)

### Liste complète

```
GET /equipment/all
```

### Matériels disponibles

```
GET /equipment/available
```

Retourne uniquement les matériels disponibles (non affectés).

### Matériels d'un utilisateur

```
GET /equipment/user/:userId
```

Retourne tous les matériels affectés à un utilisateur spécifique.

### Statistiques

```
GET /equipment/stats
```

Retourne :
- Nombre total de matériels
- Répartition par statut
- Répartition par type
- Top 10 des marques

### Détails d'un matériel

```
GET /equipment/:id
```

### Mettre à jour un matériel

```
PUT /equipment/:id
```

### Affecter un matériel à un utilisateur

```
POST /equipment/:id/assign
Body: { "userId": "mongodb_user_id" }
```

Change automatiquement le statut à `affecte`.

### Libérer un matériel

```
POST /equipment/:id/release
```

Rend le matériel disponible (statut `disponible`, `currentUserId` = null).

### Supprimer un matériel

```
DELETE /equipment/:id
```

⚠️ **Note:** Impossible de supprimer un matériel affecté à un utilisateur.

## 🔗 Intégration avec Jira Asset

Le champ `jiraAssetId` permet de lier le matériel à un asset dans Jira. La synchronisation avec Jira Asset sera implémentée dans un module dédié.

## 📝 Notes importantes

1. **Numéro de série unique** : Le numéro de série doit être unique dans la base de données
2. **Affectation** : Un matériel ne peut être affecté qu'à un seul utilisateur à la fois
3. **Statut** : Le statut est automatiquement mis à jour lors de l'affectation/libération
4. **Suppression** : Un matériel affecté ne peut pas être supprimé

