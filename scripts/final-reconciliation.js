const mongoose = require('mongoose');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();

/**
 * Script de RÉCONCILIATION FINALE Chirurgicale.
 * Aligne parfaitement MongoDB (Allocations + Documents) sur Azure (188 fichiers).
 * 
 * Usage: node scripts/final-reconciliation.js [--execute]
 */

const DRY_RUN = !process.argv.includes('--execute');
const MONGODB_URI = process.env.MONGODBURI || process.env.MONGODB_URI;
const AZURE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = 'dotationdoc';

if (!MONGODB_URI || !AZURE_CONNECTION_STRING) {
  console.error('❌ Configuration MongoDB ou Azure manquante dans .env');
  process.exit(1);
}

// --- MAIN ---

async function run() {
  console.log('='.repeat(60));
  console.log('🛡️ RÉCONCILIATION FINALE ET CHIRURGICALE (ALLOCATIONS + DOCUMENTS)');
  console.log(`MODE: ${DRY_RUN ? '🔍 SIMULATION (DRY RUN)' : '🚀 RÉEL (EXECUTION)'}`);
  console.log('='.repeat(60));

  let db;
  try {
    // 1. Connexion à Azure pour lister les fichiers réels
    console.log('🔌 Connexion à Azure Blob Storage...');
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
    const blobs = [];
    for await (const blob of containerClient.listBlobsFlat()) {
      blobs.push(blob);
    }
    console.log(`✅ ${blobs.length} fichiers physiques trouvés sur Azure.`);

    // 2. Extraire les ID d'allocations valides depuis les noms de fichiers
    // Pattern: dotation_ALLOCID_TIMESTAMP.pdf
    const validAllocationIds = new Set();
    const validFilenames = new Set();
    blobs.forEach(b => {
      validFilenames.add(b.name);
      const match = b.name.match(/dotation_([a-f0-9]{24})_/);
      if (match) validAllocationIds.add(match[1]);
    });
    console.log(`📊 ${validAllocationIds.size} Allocations valides identifiées (via Azure).`);

    // 3. Connexion à MongoDB
    console.log('\n🔌 Connexion à MongoDB...');
    db = await mongoose.connect(MONGODB_URI);

    // 4. Analyser les Allocations
    const allocationsCol = mongoose.connection.db.collection('allocations');
    const allAllocations = await allocationsCol.find({}).toArray();
    const allocsToDelete = allAllocations.filter(a => !validAllocationIds.has(a._id.toString()));
    const allocsToKeep = allAllocations.filter(a => validAllocationIds.has(a._id.toString()));

    console.log(`📈 Analyse Allocations:`);
    console.log(`   - Total en base: ${allAllocations.length}`);
    console.log(`   - À GARDER: ${allocsToKeep.length}`);
    console.log(`   - À SUPPRIMER (doublons/orphelins): ${allocsToDelete.length}`);

    // 5. Analyser les DocumentModels
    const docsCol = mongoose.connection.db.collection('documentmodels');
    const allDocs = await docsCol.find({}).toArray();
    const docsToDelete = allDocs.filter(d => !validFilenames.has(d.filename));
    const docsToKeep = allDocs.filter(d => validFilenames.has(d.filename));

    console.log(`📈 Analyse DocumentModels:`);
    console.log(`   - Total en base: ${allDocs.length}`);
    console.log(`   - À GARDER: ${docsToKeep.length}`);
    console.log(`   - À SUPPRIMER (orphelins de fichiers): ${docsToDelete.length}`);

    // 6. Exécution
    if (DRY_RUN) {
      console.log('\n💡 [DRY RUN] Aucun changement appliqué.');
      console.log('   Exécutez avec --execute pour effectuer la réconciliation finale.');
    } else {
      // A. Supprimer Allocations superflues
      if (allocsToDelete.length > 0) {
        console.log(`\n📦 Suppression de ${allocsToDelete.length} allocations...`);
        const result = await allocationsCol.deleteMany({
          _id: { $in: allocsToDelete.map(a => a._id) }
        });
        console.log(`   ✅ ${result.deletedCount} allocations supprimées.`);
      }

      // B. Supprimer DocumentModels superflus
      if (docsToDelete.length > 0) {
        console.log(`\n📦 Suppression de ${docsToDelete.length} documentmodels...`);
        const result = await docsCol.deleteMany({
          _id: { $in: docsToDelete.map(d => d._id) }
        });
        console.log(`   ✅ ${result.deletedCount} documentmodels supprimés.`);
      }

      // C. Nettoyer les profils utilisateurs
      console.log(`\n📦 Nettoyage de l'historique des utilisateurs...`);
      const usersCol = mongoose.connection.db.collection('users');
      const allUsers = await usersCol.find({}).toArray();
      let updatedUsers = 0;

      for (const user of allUsers) {
        if (!user.documents || user.documents.length === 0) continue;

        const initialLength = user.documents.length;
        const cleanedDocs = user.documents.filter(d => validFilenames.has(d.name));

        if (cleanedDocs.length !== initialLength) {
          await usersCol.updateOne(
            { _id: user._id },
            { $set: { documents: cleanedDocs } }
          );
          updatedUsers++;
        }
      }
      console.log(`   ✅ ${updatedUsers} profils utilisateurs nettoyés.`);

      // D. Conclusion
      console.log('\n🎉 RÉCONCILIATION CHIRURGICALE RÉUSSIE !');
      console.log(`   L'état final est : ${validAllocationIds.size} Allocations = ${validFilenames.size} Documents = ${blobs.length} Azure Files.`);
    }

  } catch (err) {
    console.error('\n❌ Erreur:', err.message);
  } finally {
    if (db) await mongoose.disconnect();
    console.log('\n🔌 Déconnecté de MongoDB.');
  }
}

run();
