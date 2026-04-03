const mongoose = require('mongoose');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();

/**
 * Script de nettoyage massif d'Azure Blob Storage.
 * Supprime les fichiers PDF qui ne sont plus référencés dans MongoDB.
 * 
 * Usage: node scripts/azure-cleanup.js [--execute]
 */

const DRY_RUN = !process.argv.includes('--execute');
const MONGODB_URI = process.env.MONGODBURI || process.env.MONGODB_URI;
const AZURE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = 'dotationdoc';

if (!MONGODB_URI || !AZURE_CONNECTION_STRING) {
  console.error('❌ Configuration MongoDB ou Azure manquante dans .env');
  process.exit(1);
}

// --- SCHEMA MONGODB ---

const DocumentSchema = new mongoose.Schema({
  filename: String,
  storageUrl: String,
}, { collection: 'documentmodels' });

// --- MAIN ---

async function run() {
  console.log('='.repeat(60));
  console.log('🧹 NETTOYAGE MASSIF D\'AZURE BLOB STORAGE');
  console.log(`MODE: ${DRY_RUN ? '🔍 SIMULATION (DRY RUN)' : '🚀 RÉEL (EXECUTION)'}`);
  console.log('='.repeat(60));

  let db;
  try {
    // 1. Connexion à MongoDB
    console.log('🔌 Connexion à MongoDB...');
    db = await mongoose.connect(MONGODB_URI);
    const DocumentModel = mongoose.model('Document', DocumentSchema);

    // 2. Récupérer tous les noms de fichiers valides
    console.log('📥 Récupération des noms de fichiers valides (395 docs attendus)...');
    const validDocs = await DocumentModel.find({}).exec();
    const validFilenames = new Set(validDocs.map(d => d.filename).filter(Boolean));
    console.log(`✅ ${validFilenames.size} fichiers valides identifiés dans MongoDB.`);

    // 3. Connexion à Azure Blob Storage
    console.log('\n🔌 Connexion à Azure Blob Storage...');
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

    // 4. Lister tous les blobs
    console.log(`🔍 Listing des blobs dans le conteneur '${CONTAINER_NAME}'...`);
    const blobs = [];
    for await (const blob of containerClient.listBlobsFlat()) {
      blobs.push(blob);
    }
    console.log(`✅ ${blobs.length} fichiers trouvés sur Azure.`);

    // 5. Identifier les blobs orphelins
    const toDelete = [];
    const kept = [];
    
    for (const blob of blobs) {
      if (!validFilenames.has(blob.name)) {
        toDelete.push(blob);
      } else {
        kept.push(blob);
      }
    }

    console.log(`\n📊 RÉSULTATS DE L'ANALYSE :`);
    console.log(`   - Fichiers à GARDER (référencés): ${kept.length}`);
    console.log(`   - Fichiers à SUPPRIMER (orphelins): ${toDelete.length}`);

    if (toDelete.length === 0) {
      console.log('\n✅ Aucun fichier orphelin identifié sur Azure.');
      return;
    }

    // 6. Exécution
    if (DRY_RUN) {
      console.log('\n🔍 [DRY RUN] Liste de quelques fichiers qui seraient supprimés :');
      toDelete.slice(0, 15).forEach((b, i) => {
        console.log(`   ${i + 1}. ${b.name}`);
      });
      if (toDelete.length > 15) console.log(`   ... et ${toDelete.length - 15} autres.`);
      
      console.log('\n💡 [SIMULATION] Aucun fichier n\'a été supprimé.');
      console.log('   Exécutez avec --execute pour appliquer les changements.');
    } else {
      console.log(`\n🚀 Début de la suppression réelle de ${toDelete.length} fichiers...`);
      let count = 0;
      let errors = 0;
      const PARALLEL_DELETES = 50;

      for (let i = 0; i < toDelete.length; i += PARALLEL_DELETES) {
        const batch = toDelete.slice(i, i + PARALLEL_DELETES);
        await Promise.all(batch.map(async (blob) => {
          try {
            const blobClient = containerClient.getBlobClient(blob.name);
            await blobClient.delete();
            count++;
          } catch (err) {
            errors++;
            console.error(`\n❌ Erreur sur ${blob.name}: ${err.message}`);
          }
        }));
        
        if (count % 100 === 0 || count >= toDelete.length) {
          process.stdout.write(`\r   📦 Progression: ${count}/${toDelete.length} supprimés...`);
        }
      }

      console.log(`\n\n✅ Nettoyage Azure terminé !`);
      console.log(`   - Réussis: ${count}`);
      console.log(`   - Échecs: ${errors}`);
    }

  } catch (err) {
    console.error('\n❌ Erreur:', err.message);
  } finally {
    if (db) await mongoose.disconnect();
    console.log('\n🔌 Déconnecté de MongoDB.');
  }
}

run();
