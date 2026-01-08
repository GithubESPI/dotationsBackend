require('dotenv').config();
const axios = require('axios');

/**
 * Script pour lancer la synchronisation automatique de TOUS les équipements depuis Jira Assets
 * 
 * Usage: node scripts/sync-all-equipment.js [JWT_TOKEN]
 * 
 * Note: Assurez-vous que le serveur NestJS est démarré (npm run start:dev)
 */

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const JWT_TOKEN = process.argv[2] || process.env.TEST_JWT_TOKEN || '';

// URL de la route
const syncUrl = `${API_BASE_URL}/jira-asset/sync/all-equipment-types`;

console.log('='.repeat(60));
console.log('🔄 SYNCHRONISATION COMPLÈTE JIRA ASSETS → MONGODB');
console.log('='.repeat(60));
console.log(`\n📝 Configuration:`);
console.log(`   API URL: ${API_BASE_URL}`);
console.log(`   Route: POST /jira-asset/sync/all-equipment-types`);
console.log(`   Token: ${JWT_TOKEN ? JWT_TOKEN.substring(0, 20) + '...' : 'Non fourni'}`);
console.log('');

async function syncAllEquipment() {
    try {
        const headers = {
            'Content-Type': 'application/json',
        };

        if (JWT_TOKEN) {
            headers['Authorization'] = `Bearer ${JWT_TOKEN}`;
            console.log('🔐 Utilisation du token JWT fourni');
        } else {
            console.log('⚠️  Aucun token JWT fourni. Si l\'API nécessite une authentification, la requête échouera.');
            console.log('   Vous pouvez passer le token en paramètre: node scripts/sync-all-equipment.js <JWT_TOKEN>');
            console.log('   Ou définir TEST_JWT_TOKEN dans .env');
        }

        console.log(`\n📤 Envoi de la requête POST...`);
        console.log(`   URL: ${syncUrl}`);
        console.log(`   Body: {} (détection automatique activée pour tous les types)`);

        const startTime = Date.now();
        const response = await axios.post(syncUrl, {}, { headers });

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`\n✅ Synchronisation terminée en ${duration}s`);
        console.log(`   Status: ${response.status} ${response.statusText}`);

        const data = response.data;
        console.log(`\n📊 RÉSULTATS GLOBAUX:`);
        console.log(`   Types d'équipements traités: ${data.totalEquipmentTypes || 0}`);

        if (data.summary) {
            console.log(`   Total d'objets traités: ${data.summary.totalProcessed || 0}`);
            console.log(`   ✅ Créés: ${data.summary.totalCreated || 0}`);
            console.log(`   🔄 Mis à jour: ${data.summary.totalUpdated || 0}`);
            console.log(`   ⏭️  Ignorés: ${data.summary.totalSkipped || 0}`);
            console.log(`   ❌ Erreurs: ${data.summary.totalErrors || 0}`);
        }

        if (data.results && data.results.length > 0) {
            console.log(`\n📋 DÉTAILS PAR TYPE D'ÉQUIPEMENT:`);
            data.results.forEach(res => {
                console.log(`   - ${res.objectTypeName} (${res.equipmentType}):`);
                console.log(`     Objectif: ${res.total} | +${res.created} | ~${res.updated} | !${res.errors}`);
            });
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ SYNCHRONISATION RÉUSSIE');
        console.log('='.repeat(60));

        process.exit(0);
    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('❌ ÉCHEC DE LA SYNCHRONISATION');
        console.error('='.repeat(60));

        if (error.response) {
            console.error(`\n📋 Détails de l'erreur HTTP:`);
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Status Text: ${error.response.statusText}`);
            console.error(`   URL: ${error.config?.url}`);
            console.error(`   Données:`, JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error(`\n❌ Aucune réponse du serveur`);
            console.error(`   URL: ${error.config?.url}`);
            console.error(`\n💡 Conseil: Assurez-vous que le serveur NestJS est démarré et que la nouvelle route est disponible.`);
        } else {
            console.error(`\n❌ Erreur: ${error.message}`);
        }

        process.exit(1);
    }
}

// Exécuter la synchronisation
syncAllEquipment();
