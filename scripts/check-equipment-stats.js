const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkEquipmentStats() {
    // Utiliser MONGODBURI comme défini dans database.module.ts
    const uri = process.env.MONGODBURI;

    if (!uri) {
        console.error('❌ MONGODBURI n\'est pas défini dans .env');
        return;
    }

    // Ajouter authSource si nécessaire
    let finalUri = uri;
    if (!finalUri.includes('authSource=')) {
        const separator = finalUri.includes('?') ? '&' : '?';
        finalUri = `${finalUri}${separator}authSource=admin`;
    }

    const client = new MongoClient(finalUri);

    try {
        await client.connect();
        console.log('✅ Connecté à MongoDB\n');

        const database = client.db();
        const equipment = database.collection('equipment');

        // Compter le nombre total d'équipements
        const totalCount = await equipment.countDocuments();
        console.log(`📊 Nombre total d'équipements: ${totalCount}\n`);

        if (totalCount === 0) {
            console.log('⚠️  Aucun équipement trouvé dans la collection');
            return;
        }

        // Compter par type
        console.log('📋 Répartition par type:');
        const countByType = await equipment.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).toArray();
        countByType.forEach(item => {
            console.log(`   ${item._id || 'Non défini'}: ${item.count}`);
        });

        // Compter par statut
        console.log('\n🔄 Répartition par statut:');
        const countByStatus = await equipment.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).toArray();
        countByStatus.forEach(item => {
            console.log(`   ${item._id || 'Non défini'}: ${item.count}`);
        });

        // Compter par marque
        console.log('\n🏢 Top 10 des marques:');
        const countByBrand = await equipment.aggregate([
            { $group: { _id: '$brand', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]).toArray();
        countByBrand.forEach(item => {
            console.log(`   ${item._id || 'Non défini'}: ${item.count}`);
        });

        // Compter les équipements avec/sans Jira Asset ID
        const withJiraId = await equipment.countDocuments({
            jiraAssetId: { $exists: true, $ne: null }
        });
        const withoutJiraId = totalCount - withJiraId;

        console.log('\n🔗 Synchronisation Jira:');
        console.log(`   Avec Jira Asset ID: ${withJiraId}`);
        console.log(`   Sans Jira Asset ID: ${withoutJiraId}`);

        // Afficher quelques exemples
        console.log('\n📦 Exemples d\'équipements (5 premiers):');
        const samples = await equipment.find({}).limit(5).toArray();
        samples.forEach((eq, i) => {
            console.log(`\n${i + 1}. ${eq.serialNumber || 'N/A'}`);
            console.log(`   Type: ${eq.type || 'N/A'}`);
            console.log(`   Marque: ${eq.brand || 'N/A'}`);
            console.log(`   Modèle: ${eq.model || 'N/A'}`);
            console.log(`   Statut: ${eq.status || 'N/A'}`);
            console.log(`   Jira ID: ${eq.jiraAssetId || 'N/A'}`);
        });

    } catch (error) {
        console.error('❌ Erreur:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await client.close();
        console.log('\n✅ Connexion fermée');
    }
}

checkEquipmentStats();
