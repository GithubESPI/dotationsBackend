require('dotenv').config();
const axios = require('axios');

/**
 * Script pour lancer la synchronisation automatique des Laptops depuis Jira vers MongoDB
 * 
 * Usage: node scripts/sync-laptops-from-jira.js [JWT_TOKEN]
 * 
 * Note: Assurez-vous que le serveur NestJS est démarré (npm run start:dev)
 */

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const JWT_TOKEN = process.argv[2] || process.env.TEST_JWT_TOKEN || '';

// URL de la route
const syncUrl = `${API_BASE_URL}/jira-asset/sync/laptops`;

console.log('='.repeat(60));
console.log('🔄 SYNCHRONISATION AUTOMATIQUE DES LAPTOPS JIRA → MONGODB');
console.log('='.repeat(60));
console.log(`\n📝 Configuration:`);
console.log(`   API URL: ${API_BASE_URL}`);
console.log(`   Route: POST /jira-asset/sync/laptops`);
console.log(`   Token: ${JWT_TOKEN ? JWT_TOKEN.substring(0, 20) + '...' : 'Non fourni'}`);
console.log('');

async function syncLaptops() {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (JWT_TOKEN) {
      headers['Authorization'] = `Bearer ${JWT_TOKEN}`;
      console.log('🔐 Utilisation du token JWT fourni');
    } else {
      console.log('⚠️  Aucun token JWT fourni. Si l\'API nécessite une authentification, la requête échouera.');
      console.log('   Vous pouvez passer le token en paramètre: node scripts/sync-laptops-from-jira.js <JWT_TOKEN>');
      console.log('   Ou définir TEST_JWT_TOKEN dans .env');
    }

    console.log(`\n📤 Envoi de la requête POST...`);
    console.log(`   URL: ${syncUrl}`);
    console.log(`   Body: {} (détection automatique activée)`);
    
    const startTime = Date.now();
    const response = await axios.post(syncUrl, {}, { headers });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ Synchronisation terminée en ${duration}s`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    const data = response.data;
    console.log(`\n📊 RÉSULTATS:`);
    console.log(`   Total d'objets traités: ${data.total || 0}`);
    console.log(`   ✅ Créés: ${data.created || 0}`);
    console.log(`   🔄 Mis à jour: ${data.updated || 0}`);
    console.log(`   ⏭️  Ignorés: ${data.skipped || 0}`);
    console.log(`   ❌ Erreurs: ${data.errors || 0}`);

    if (data.attributeMapping) {
      console.log(`\n🔍 Attributs détectés automatiquement:`);
      console.log(JSON.stringify(data.attributeMapping, null, 2));
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ SYNCHRONISATION RÉUSSIE');
    console.log('='.repeat(60));
    
    if (data.created > 0 || data.updated > 0) {
      console.log(`\n💡 Les équipements sont maintenant disponibles pour attribution aux employés.`);
      console.log(`   Vous pouvez utiliser GET /equipment/available pour voir les équipements disponibles.`);
    }

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
      
      if (error.response.status === 401) {
        console.error(`\n💡 Conseil: L'API nécessite une authentification JWT.`);
        console.error(`   Connectez-vous via l'API d'authentification pour obtenir un token.`);
      }
    } else if (error.request) {
      console.error(`\n❌ Aucune réponse du serveur`);
      console.error(`   URL: ${error.config?.url}`);
      console.error(`\n💡 Conseil: Assurez-vous que le serveur NestJS est démarré:`);
      console.error(`   npm run start:dev`);
    } else {
      console.error(`\n❌ Erreur: ${error.message}`);
    }

    process.exit(1);
  }
}

// Exécuter la synchronisation
syncLaptops();

