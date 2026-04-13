import { BlobServiceClient } from '@azure/storage-blob';
import * as dotenv from 'dotenv';

dotenv.config();

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = 'dotationdoc';

async function cleanupAzure() {
  if (!CONNECTION_STRING) {
    console.error('❌ AZURE_STORAGE_CONNECTION_STRING manquante');
    return;
  }

  console.log('🔄 Connexion à Azure Blob Storage...');
  const blobServiceClient = BlobServiceClient.fromConnectionString(CONNECTION_STRING);
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

  console.log(`📂 Analyse du conteneur: ${CONTAINER_NAME}...`);
  
  const blobs: any[] = [];
  for await (const blob of containerClient.listBlobsFlat()) {
    blobs.push(blob);
  }

  console.log(`📊 ${blobs.length} fichiers trouvés.`);

  // Grouper par ID d'allocation (pour les fichiers avec timestamps)
  const groups = new Map<string, any[]>();

  for (const blob of blobs) {
    // Format attendu: dotation_ALLOCID_TIMESTAMP.pdf ou restitution_RETID_TIMESTAMP.pdf
    const match = blob.name.match(/^(dotation|restitution)_([a-f0-9]{24})_(\d+)\.pdf$/);
    
    if (match) {
      const type = match[1];
      const id = match[2];
      const timestamp = parseInt(match[3]);
      const key = `${type}_${id}`;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ name: blob.name, timestamp });
    }
  }

  console.log(`🔍 ${groups.size} groupes d'allocations identifiés avec des doublons potentiels.`);

  let deletedCount = 0;

  for (const [key, files] of groups.entries()) {
    if (files.length > 1) {
      // Trier par timestamp (on garde le plus récent)
      files.sort((a, b) => b.timestamp - a.timestamp);
      
      const [newest, ...others] = files;
      console.log(`\n📄 Groupe: ${key}`);
      console.log(`   ✅ Gardé: ${newest.name}`);

      for (const old of others) {
        console.log(`   ❌ Suppression: ${old.name}`);
        // await containerClient.deleteBlob(old.name); // Décommenter pour exécution réelle
        deletedCount++;
      }
    }
  }

  console.log(`\n✅ Analyse terminée. ${deletedCount} fichiers en doublon identifiés.`);
  console.log('💡 NOTE: Le script est actuellement en mode lecture seule. Décommentez la ligne de suppression pour nettoyer réellement.');
}

cleanupAzure().catch(console.error);
