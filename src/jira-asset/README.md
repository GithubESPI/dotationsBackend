# Module Jira Asset - Version Améliorée

## 📋 Description

Le module Jira Asset permet de synchroniser les équipements informatiques entre Jira Asset (Jira Service Management) et MongoDB de manière **bidirectionnelle et automatique**.

### Flux de synchronisation

1. **Récupération des assets existants** : Récupère tous les assets depuis Jira et les synchronise vers MongoDB
2. **Affectation dans MongoDB** : Lorsqu'un équipement est affecté à un utilisateur dans MongoDB, Jira est automatiquement mis à jour
3. **Libération dans MongoDB** : Lorsqu'un équipement est libéré dans MongoDB, Jira est automatiquement mis à jour

## 🚀 Fonctionnalités principales

### 1. Synchronisation depuis Jira vers MongoDB

Récupère les assets existants dans Jira et les synchronise vers MongoDB pour pouvoir les affecter aux utilisateurs.

**Méthode principale** : `syncAllFromJira()`
- Récupère tous les assets d'un type d'objet depuis Jira
- Crée les équipements manquants dans MongoDB
- Met à jour les équipements existants
- Synchronise également l'utilisateur affecté si présent dans Jira

### 2. Synchronisation automatique vers Jira lors des affectations

Lorsqu'un équipement est affecté ou libéré dans MongoDB, Jira est automatiquement mis à jour.

**Méthode optimisée** : `updateEquipmentStatusInJira()`
- Met à jour uniquement le statut et l'utilisateur affecté dans Jira
- Plus rapide que la synchronisation complète
- Ne fait pas échouer l'opération si Jira n'est pas disponible

### 3. Support de l'utilisateur affecté

Le module gère maintenant l'attribut "utilisateur affecté" dans Jira :
- Lors de la synchronisation depuis Jira, si un utilisateur est affecté dans Jira, il est automatiquement lié dans MongoDB (si l'utilisateur existe)
- Lors de l'affectation dans MongoDB, l'utilisateur est mis à jour dans Jira
- Lors de la libération dans MongoDB, l'utilisateur est retiré dans Jira

## 📁 Structure

```
src/jira-asset/
├── jira-asset.service.ts           # Service de synchronisation amélioré
├── jira-asset.controller.ts        # Endpoints API
├── jira-asset.module.ts            # Module NestJS
├── dto/
│   ├── sync-equipment.dto.ts      # DTOs pour la synchronisation
│   └── update-status-jira.dto.ts  # DTO pour mise à jour statut uniquement
└── README.md                       # Documentation
```

## 🔧 Configuration

### Variables d'environnement

```env
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-jira-api-token
```

### Mapping des attributs

Pour utiliser le module, vous devez connaître les IDs des attributs dans Jira Asset :

- `objectTypeId` : ID du type d'objet (ex: "Computer")
- `serialNumberAttrId` : ID de l'attribut numéro de série
- `brandAttrId` : ID de l'attribut marque
- `modelAttrId` : ID de l'attribut modèle
- `typeAttrId` : ID de l'attribut type
- `statusAttrId` : ID de l'attribut statut
- `internalIdAttrId` : ID de l'attribut numéro interne (optionnel)
- `assignedUserAttrId` : ID de l'attribut utilisateur affecté (optionnel mais recommandé)

## 🔌 Endpoints API

### `POST /jira-asset/sync/all-from-jira`
**Synchronise tous les équipements depuis Jira vers MongoDB**

C'est la méthode principale pour récupérer vos assets existants.

**Body:**
```json
{
  "objectTypeId": "250",
  "serialNumberAttrId": "2797",
  "brandAttrId": "2807",
  "modelAttrId": "2808",
  "typeAttrId": "2809",
  "statusAttrId": "2810",
  "internalIdAttrId": "2811",
  "assignedUserAttrId": "2812"
}
```

**Réponse:**
```json
{
  "created": 10,
  "updated": 5,
  "skipped": 2,
  "errors": 0
}
```

### `POST /jira-asset/equipment/:equipmentId/update-status`
**Met à jour uniquement le statut et l'utilisateur dans Jira**

Méthode optimisée pour les mises à jour fréquentes (affectation/libération).

**Body:**
```json
{
  "statusAttrId": "2810",
  "assignedUserAttrId": "2812"
}
```

### `POST /jira-asset/sync/from-jira`
**Synchronise un équipement spécifique depuis Jira**

### `POST /jira-asset/sync/to-jira`
**Synchronise un équipement vers Jira (synchronisation complète)**

## 🔄 Workflow recommandé

### 1. Synchronisation initiale

```bash
# Récupérer tous les assets existants depuis Jira
POST /jira-asset/sync/all-from-jira
```

Cette opération va :
- Récupérer tous les assets du type d'objet spécifié
- Créer les équipements dans MongoDB
- Synchroniser les utilisateurs affectés si présents dans Jira

### 2. Affectation d'un équipement

```bash
# Affecter un équipement à un utilisateur
POST /equipment/:id/assign
Body: { "userId": "mongodb_user_id" }
```

Cette opération va automatiquement :
- Mettre à jour le statut dans MongoDB (`affecte`)
- Mettre à jour l'utilisateur affecté dans MongoDB
- Mettre à jour le statut dans Jira (`affecté`)
- Mettre à jour l'utilisateur affecté dans Jira (si `assignedUserAttrId` est configuré)

### 3. Libération d'un équipement

```bash
# Libérer un équipement
POST /equipment/:id/release
```

Cette opération va automatiquement :
- Mettre à jour le statut dans MongoDB (`disponible`)
- Retirer l'utilisateur affecté dans MongoDB
- Mettre à jour le statut dans Jira (`disponible`)
- Retirer l'utilisateur affecté dans Jira (si `assignedUserAttrId` est configuré)

## 🔐 Gestion des utilisateurs

### Synchronisation depuis Jira

Lors de la synchronisation depuis Jira, si un utilisateur est affecté dans Jira :
1. Le module cherche l'utilisateur dans MongoDB par email
2. Si trouvé, l'équipement est automatiquement affecté à cet utilisateur
3. Si non trouvé, un avertissement est loggé (synchronisez d'abord les utilisateurs depuis Office 365)

### Mise à jour vers Jira

Lors de l'affectation dans MongoDB :
- L'email de l'utilisateur est envoyé à Jira
- Si vous utilisez l'Atlassian Account ID, vous pouvez modifier le code pour l'utiliser à la place

## 📝 Exemple d'utilisation complète

### 1. Configuration initiale

```typescript
// 1. Synchroniser les utilisateurs depuis Office 365
POST /employees/sync

// 2. Synchroniser les équipements depuis Jira
POST /jira-asset/sync/all-from-jira
Body: {
  "objectTypeId": "250",
  "serialNumberAttrId": "2797",
  "brandAttrId": "2807",
  "modelAttrId": "2808",
  "typeAttrId": "2809",
  "statusAttrId": "2810",
  "assignedUserAttrId": "2812"
}
```

### 2. Affectation d'un équipement

```typescript
// L'équipement est automatiquement mis à jour dans Jira
POST /equipment/:equipmentId/assign
Body: { "userId": "user_mongodb_id" }
```

### 3. Vérification dans Jira

L'asset dans Jira devrait maintenant avoir :
- Statut : `affecté`
- Utilisateur affecté : email de l'utilisateur

## 🐛 Dépannage

### Les équipements ne sont pas synchronisés depuis Jira

- Vérifiez que les IDs d'attributs sont corrects
- Vérifiez que le numéro de série est présent dans Jira
- Consultez les logs pour voir les erreurs détaillées

### Les mises à jour Jira ne fonctionnent pas lors des affectations

- Vérifiez que `jiraAssetId` est présent sur l'équipement
- Vérifiez la configuration Jira dans `.env`
- Les erreurs Jira ne font pas échouer l'affectation (consultez les logs)

### Les utilisateurs ne sont pas synchronisés depuis Jira

- Assurez-vous d'avoir synchronisé les utilisateurs depuis Office 365 d'abord
- Vérifiez que l'email dans Jira correspond à l'email dans MongoDB
- Si vous utilisez l'Atlassian Account ID, modifiez le code pour l'utiliser

## 🔄 Intégration avec les autres modules

- **EquipmentModule** : Mise à jour automatique de Jira lors des affectations/libérations
- **EmployeesModule** : Synchronisation des utilisateurs depuis Office 365 (requis pour la synchronisation des utilisateurs affectés)

## 📚 Documentation Jira Asset API

- [Créer des objets Assets via REST API](https://support.atlassian.com/jira/kb/how-to-create-assets-objects-via-rest-api-based-on-different-attribute-type/)
- [API Assets Jira Service Management](https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-assets/)
