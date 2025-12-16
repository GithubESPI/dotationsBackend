# Module Employees - Synchronisation Office 365

## 📋 Vue d'ensemble

Le module Employees gère la synchronisation des utilisateurs depuis Microsoft Graph API. **Les employés ne peuvent pas être créés manuellement** - ils doivent être synchronisés depuis Office 365.

## 🔄 Synchronisation Office 365

### Endpoint de synchronisation

```
POST /employees/sync
```

**Body (optionnel):**
```json
{
  "token": "votre_token_azure_ad"
}
```

Si le token n'est pas fourni dans le body, le système essaiera de le récupérer depuis la session de l'utilisateur connecté.

### Fonctionnement

1. Récupère tous les utilisateurs depuis `https://graph.microsoft.com/v1.0/users`
2. Filtre les comptes invités (`#EXT#`) et les comptes système
3. Crée ou met à jour chaque utilisateur dans MongoDB
4. Utilise `userPrincipalName` comme identifiant unique

### Propriétés synchronisées

Selon la [documentation Microsoft Graph](https://learn.microsoft.com/fr-fr/graph/api/resources/users), les propriétés suivantes sont synchronisées :

- `id` → `office365Id`
- `userPrincipalName` → `office365Id` (identifiant unique)
- `mail` → `email`
- `displayName` → `displayName`
- `givenName` → `givenName`
- `surname` → `surname`
- `jobTitle` → `jobTitle`
- `department` → `department`
- `officeLocation` → `officeLocation`
- `mobilePhone` → `mobilePhone`
- `businessPhones[0]` → `mobilePhone` (si mobilePhone vide)
- `accountEnabled` → `isActive`

## 📡 Endpoints disponibles

### Recherche d'employés

```
GET /employees?query=nom&department=IT&page=1&limit=20
```

**Paramètres de requête:**
- `query` : Recherche par nom, prénom, email ou département
- `department` : Filtrer par département
- `officeLocation` : Filtrer par localisation
- `isActive` : Filtrer par statut actif/inactif
- `page` : Numéro de page (défaut: 1)
- `limit` : Nombre d'éléments par page (défaut: 20, max: 100)

### Liste complète

```
GET /employees/all
```

Retourne tous les employés actifs, triés par nom.

### Statistiques

```
GET /employees/stats
```

Retourne :
- Nombre total d'employés
- Nombre d'employés actifs
- Nombre d'employés inactifs
- Répartition par département

### Détails d'un employé

```
GET /employees/:id
```

### Mise à jour (limitée)

```
PUT /employees/:id
```

⚠️ **Note:** Les mises à jour manuelles sont limitées. L'identifiant Office 365 ne peut pas être modifié. Pour une synchronisation complète, utilisez `POST /employees/sync`.

### Désactivation

```
DELETE /employees/:id
```

Désactive un employé (soft delete) - met `isActive` à `false`.

## 🔐 Autorisations requises

Pour la synchronisation, l'application doit avoir les permissions Microsoft Graph suivantes :

- `User.Read.All` (déléguée) ou `User.Read.All` (application)
- `Directory.Read.All` (recommandé pour lire tous les utilisateurs)

## 📚 Références

- [Documentation Microsoft Graph - Users](https://learn.microsoft.com/fr-fr/graph/api/resources/users)
- [API Users - Liste](https://graph.microsoft.com/v1.0/users)
- [Permissions Microsoft Graph](https://learn.microsoft.com/fr-fr/graph/permissions-reference)

