require('dotenv').config();
const mongoose = require('mongoose');

/**
 * Script de migration pour déplacer les données de la collection "equipments" vers "equipment"
 * 
 * Usage: node scripts/migrate-equipments-to-equipment.js
 */

const MONGODB_URI = process.env.MONGODBURI || process.env.MONGODB_URI || 'mongodb://dotation:dotation_password@localhost:27017/dotation?authSource=admin';

async function migrate() {
  console.log('='.repeat(60));
  console.log('🔄 MIGRATION: equipments → equipment');
  console.log('='.repeat(60));
  
  try {
    // Connexion à MongoDB
    console.log('\n🔌 Connexion à MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connecté à MongoDB');
    
    const db = mongoose.connection.db;
    
    // Vérifier si la collection equipments existe
    const collections = await db.listCollections().toArray();
    const equipmentsExists = collections.some(c => c.name === 'equipments');
    const equipmentExists = collections.some(c => c.name === 'equipment');
    
    console.log(`\n📊 État des collections:`);
    console.log(`   equipments: ${equipmentsExists ? '✅ existe' : '❌ n\'existe pas'}`);
    console.log(`   equipment: ${equipmentExists ? '✅ existe' : '❌ n\'existe pas'}`);
    
    if (!equipmentsExists) {
      console.log('\n⚠️  La collection "equipments" n\'existe pas. Rien à migrer.');
      process.exit(0);
    }
    
    // Compter les documents dans equipments
    const equipmentsCollection = db.collection('equipments');
    const count = await equipmentsCollection.countDocuments();
    console.log(`\n📦 Documents dans "equipments": ${count}`);
    
    if (count === 0) {
      console.log('\n⚠️  La collection "equipments" est vide. Rien à migrer.');
      if (equipmentsExists) {
        await db.collection('equipments').drop();
        console.log('✅ Collection "equipments" supprimée');
      }
      process.exit(0);
    }
    
    // Vérifier si equipment existe déjà et contient des données
    if (equipmentExists) {
      const equipmentCollection = db.collection('equipment');
      const equipmentCount = await equipmentCollection.countDocuments();
      
      if (equipmentCount > 0) {
        console.log(`\n⚠️  La collection "equipment" contient déjà ${equipmentCount} documents.`);
        console.log('   Les données seront fusionnées (les doublons par serialNumber seront ignorés).');
      }
    }
    
    // Migrer les données
    console.log('\n🔄 Migration des données...');
    const equipments = await equipmentsCollection.find({}).toArray();
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const doc of equipments) {
      try {
        // Vérifier si un document avec le même serialNumber existe déjà dans equipment
        const equipmentCollection = db.collection('equipment');
        const existing = await equipmentCollection.findOne({ serialNumber: doc.serialNumber });
        
        if (existing) {
          // Mettre à jour le document existant avec les données de equipments (sans _id)
          const { _id, ...docWithoutId } = doc;
          await equipmentCollection.updateOne(
            { serialNumber: doc.serialNumber },
            { $set: docWithoutId }
          );
          skipped++;
        } else {
          // Insérer le nouveau document
          await equipmentCollection.insertOne(doc);
          migrated++;
        }
      } catch (error) {
        errors++;
        console.error(`   ❌ Erreur pour document ${doc._id}: ${error.message}`);
      }
    }
    
    console.log(`\n📊 Résultats de la migration:`);
    console.log(`   ✅ Migrés: ${migrated}`);
    console.log(`   🔄 Mis à jour: ${skipped}`);
    console.log(`   ❌ Erreurs: ${errors}`);
    
    // Supprimer la collection equipments après migration réussie
    if (migrated + skipped === count && errors === 0) {
      console.log('\n🗑️  Suppression de la collection "equipments"...');
      await db.collection('equipments').drop();
      console.log('✅ Collection "equipments" supprimée');
    } else {
      console.log('\n⚠️  La collection "equipments" n\'a pas été supprimée car il y a eu des erreurs.');
      console.log('   Vérifiez les erreurs et relancez le script si nécessaire.');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRATION TERMINÉE');
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ERREUR LORS DE LA MIGRATION');
    console.error('='.repeat(60));
    console.error(`\n❌ Erreur: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// Exécuter la migration
migrate();

