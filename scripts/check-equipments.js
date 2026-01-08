const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkEquipments() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dotation';
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('✅ Connecté à MongoDB');

        const database = client.db();
        const equipments = database.collection('equipment');

        // Compter le nombre total d'équipements
        const totalCount = await equipments.countDocuments();
        console.log(`\n📊 Nombre total d'équipements: ${totalCount}`);

        // Compter par type
        const countByType = await equipments.aggregate([
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]).toArray();

        console.log('\n📋 Répartition par type:');
        countByType.forEach(item => {
            console.log(`  - ${item._id || 'Non défini'}: ${item.count}`);
        });

        // Compter par statut
        const countByStatus = await equipments.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]).toArray();

        console.log('\n🔄 Répartition par statut:');
        countByStatus.forEach(item => {
            console.log(`  - ${item._id || 'Non défini'}: ${item.count}`);
        });

        // Compter par marque
        const countByBrand = await equipments.aggregate([
            {
                $group: {
                    _id: '$brand',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]).toArray();

        console.log('\n🏢 Top 10 des marques:');
        countByBrand.forEach(item => {
            console.log(`  - ${item._id || 'Non défini'}: ${item.count}`);
        });

        // Afficher quelques exemples d'équipements
        const sampleEquipments = await equipments.find({})
            .limit(5)
            .toArray();

        console.log('\n📦 Exemples d\'équipements (5 premiers):');
        sampleEquipments.forEach((eq, index) => {
            console.log(`\n${index + 1}. ${eq.serialNumber || 'N/A'}`);
            console.log(`   Type: ${eq.type || 'N/A'}`);
            console.log(`   Marque: ${eq.brand || 'N/A'}`);
            console.log(`   Modèle: ${eq.model || 'N/A'}`);
            console.log(`   Statut: ${eq.status || 'N/A'}`);
            console.log(`   Jira ID: ${eq.jiraAssetId || 'N/A'}`);
            if (eq.currentUserId) {
                console.log(`   Utilisateur affecté: ${eq.currentUserId}`);
            }
        });

        // Compter les équipements avec/sans Jira Asset ID
        const withJiraId = await equipments.countDocuments({ jiraAssetId: { $exists: true, $ne: null } });
        const withoutJiraId = totalCount - withJiraId;

        console.log('\n🔗 Synchronisation Jira:');
        console.log(`  - Avec Jira Asset ID: ${withJiraId}`);
        console.log(`  - Sans Jira Asset ID: ${withoutJiraId}`);

    } catch (error) {
        console.error('❌ Erreur:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ Connexion fermée');
    }
}

checkEquipments();
