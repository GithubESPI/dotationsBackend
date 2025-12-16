# Module PDF Generator

## 📋 Description

Le module PDF Generator permet de générer et gérer les PDFs de dotation et de restitution de matériel informatique. Les PDFs sont stockés dans MongoDB via GridFS pour une gestion efficace des fichiers binaires.

## 🚀 Fonctionnalités

### Génération de PDFs

1. **PDF de Dotation** (`generateAllocationPDF`)
   - Informations utilisateur (nom, email, département)
   - Liste détaillée du matériel alloué (marque, modèle, n° de série)
   - Accessoires et logiciels supplémentaires
   - Charte d'utilisation du matériel informatique
   - Espaces pour signatures (utilisateur, IT)
   - QR code de vérification

2. **PDF de Restitution** (`generateReturnPDF`)
   - Informations utilisateur
   - Liste du matériel restitué avec état (bon état, dégradé, endommagé, etc.)
   - Logiciels supprimés
   - Signatures électroniques intégrées (utilisateur, IT, RH)
   - Validation RH avec solde de tout compte
   - QR code de vérification

### Stockage GridFS

- Les PDFs sont stockés dans MongoDB via GridFS (bucket `documents`)
- Métadonnées stockées dans la collection `documents` :
  - Type de document (dotation/restitution)
  - Référence à l'allocation ou restitution
  - ID du fichier GridFS
  - Métadonnées (nom utilisateur, liste matériel, version charte, QR code)
  - Statut (pending, signed, cancelled, archived)

## 📁 Structure

```
src/pdf-generator/
├── pdf-generator.service.ts    # Service de génération PDF
├── pdf-generator.controller.ts # Endpoints API
├── pdf-generator.module.ts     # Module NestJS
└── README.md                   # Documentation
```

## 🔌 Endpoints API

### `POST /pdf/allocation/:allocationId`
Génère le PDF de dotation pour une allocation donnée.

**Paramètres:**
- `allocationId` (path): ID MongoDB de l'allocation

**Réponse:**
```json
{
  "_id": "...",
  "documentType": "dotation",
  "allocationId": "...",
  "fileId": "...",
  "filename": "dotation_..._1234567890.pdf",
  "mimeType": "application/pdf",
  "fileSize": 12345,
  "metadata": {
    "userName": "John Doe",
    "equipmentsList": ["Dell Latitude 5520 - SN123456"],
    "charterVersion": "1.0",
    "qrCode": "http://localhost:3001/verify/allocation/..."
  },
  "status": "pending"
}
```

### `POST /pdf/return/:returnId`
Génère le PDF de restitution pour une restitution donnée.

**Paramètres:**
- `returnId` (path): ID MongoDB de la restitution

**Réponse:**
```json
{
  "_id": "...",
  "documentType": "restitution",
  "returnId": "...",
  "fileId": "...",
  "filename": "restitution_..._1234567890.pdf",
  "mimeType": "application/pdf",
  "fileSize": 12345,
  "metadata": {
    "userName": "John Doe",
    "equipmentsList": ["Dell Latitude 5520 - SN123456"],
    "charterVersion": "1.0",
    "qrCode": "http://localhost:3001/verify/return/..."
  },
  "status": "pending"
}
```

### `GET /pdf/document/:documentId`
Télécharge un PDF depuis GridFS.

**Paramètres:**
- `documentId` (path): ID MongoDB du document

**Réponse:**
- Fichier PDF en stream
- Headers: `Content-Type: application/pdf`, `Content-Disposition: attachment`

## 📝 Charte d'Utilisation

La charte d'utilisation incluse dans les PDFs de dotation contient les règles suivantes :

1. Utilisation professionnelle uniquement
2. Responsabilité de la sécurité physique
3. Interdiction d'installer des logiciels non autorisés
4. Obligation de restitution en cas de départ
5. Sanctions en cas de non-conformité

**Version actuelle:** `1.0`

## 🔍 QR Codes

Chaque PDF contient un QR code qui pointe vers une URL de vérification :
- Format: `${FRONTEND_URL}/verify/${type}/${id}`
- Types: `allocation` ou `return`
- Permet de vérifier l'authenticité du document

## 🔧 Utilisation dans le Code

### Générer un PDF de dotation

```typescript
import { PdfGeneratorService } from './pdf-generator/pdf-generator.service';

// Dans votre service
const document = await this.pdfGeneratorService.generateAllocationPDF(allocationId);
// Le PDF est automatiquement stocké dans GridFS et l'allocation est mise à jour
```

### Générer un PDF de restitution

```typescript
const document = await this.pdfGeneratorService.generateReturnPDF(returnId);
// Le PDF est automatiquement stocké dans GridFS et la restitution est mise à jour
```

### Télécharger un PDF

```typescript
const { stream, filename, size } = await this.pdfGeneratorService.getPDF(documentId);
// Utiliser le stream pour envoyer le fichier au client
```

## 📦 Dépendances

- `pdfkit`: Génération de PDFs
- `qrcode`: Génération de QR codes
- `mongodb`: GridFS pour le stockage des fichiers
- `@nestjs/mongoose`: Intégration MongoDB

## 🔐 Sécurité

- Tous les endpoints nécessitent une authentification JWT (`@UseGuards(JwtAuthGuard)`)
- Les PDFs contiennent des informations sensibles (noms, emails, n° de série)
- Les QR codes permettent de vérifier l'authenticité des documents

## 🎨 Personnalisation

Pour modifier le contenu des PDFs :

1. **Charte d'utilisation**: Modifier la méthode `createAllocationPDFBuffer` dans `pdf-generator.service.ts`
2. **Mise en page**: Ajuster les paramètres de `PDFDocument` (marges, polices, tailles)
3. **Version de la charte**: Modifier `CHARTE_VERSION` dans le service

## 📊 Métriques

Le service enregistre les logs suivants :
- ✅ PDF généré avec succès (taille en bytes)
- ❌ Erreurs lors de la génération ou du stockage

## 🔄 Intégration avec les autres modules

- **AllocationsModule**: Génération automatique du PDF lors de la création d'une allocation
- **ReturnsModule**: Génération automatique du PDF lors de la création d'une restitution
- **DatabaseModule**: Utilisation de GridFS pour le stockage

## 🐛 Dépannage

### Erreur: "GridFS bucket not found"
- Vérifier que MongoDB est démarré
- Vérifier la connexion MongoDB dans `.env`

### Erreur: "Allocation non trouvée"
- Vérifier que l'allocation existe dans la base de données
- Vérifier que l'ID est correct

### PDF mal formaté
- Vérifier que toutes les données nécessaires sont présentes (utilisateur, matériel)
- Vérifier les logs pour les erreurs de génération

