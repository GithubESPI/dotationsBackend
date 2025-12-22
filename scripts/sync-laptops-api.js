require('dotenv').config();
const axios = require('axios');

/**
 * Script pour synchroniser les Laptops depuis Jira vers MongoDB via l'API NestJS
 * Accepte soit un token JWT directement, soit un token Azure AD (qui sera converti en JWT)
 * 
 * Usage: 
 *   node scripts/sync-laptops-api.js [JWT_TOKEN]
 *   node scripts/sync-laptops-api.js --azure-token [AZURE_AD_TOKEN]
 * 
 * Si le token n'est pas fourni en argument, il sera lu depuis JWT_TOKEN ou AZURE_AD_TOKEN dans .env
 */

// Configuration
const API_BASE_URL = process.env.API_URL || process.env.BASE_URL || 'http://localhost:3000';

// Parser les arguments
let JWT_TOKEN = process.env.JWT_TOKEN;
let AZURE_TOKEN = process.env.AZURE_AD_TOKEN;

if (process.argv[2] === '--azure-token' && process.argv[3]) {
  AZURE_TOKEN = process.argv[3];
} else if (process.argv[2] && process.argv[2] !== '--azure-token') {
  JWT_TOKEN = process.argv[2];
}

// Fonction pour obtenir un JWT depuis un token Azure AD
async function getJwtFromAzureToken(azureToken) {
  try {
    console.log('🔄 Conversion du token Azure AD en JWT...');
    const response = await axios.post(
      `${API_BASE_URL}/auth/test`,
      { azureToken },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );
    
    if (response.data?.access_token) {
      console.log('✅ Token JWT obtenu avec succès');
      return response.data.access_token;
    } else {
      throw new Error('Aucun access_token dans la réponse');
    }
  } catch (error) {
    if (error.response) {
      throw new Error(`Erreur lors de la conversion: ${error.response.data?.message || error.response.statusText}`);
    }
    throw error;
  }
}

// Fonction principale
async function syncLaptops() {
  console.log('='.repeat(60));
  console.log('🔄 SYNCHRONISATION DES LAPTOPS JIRA → MONGODB VIA API');
  console.log('='.repeat(60));
  
  try {
    // Si on a un token Azure AD mais pas de JWT, le convertir
    if (!JWT_TOKEN && AZURE_TOKEN) {
      JWT_TOKEN = await getJwtFromAzureToken(AZURE_TOKEN);
    }
    
    // Vérifier le token
    if (!JWT_TOKEN) {
      console.error('\n❌ Erreur: Token JWT ou Azure AD requis');
      console.error('   Usage: node scripts/sync-laptops-api.js [JWT_TOKEN]');
      console.error('   Ou: node scripts/sync-laptops-api.js --azure-token [AZURE_AD_TOKEN]');
      console.error('   Ou définissez JWT_TOKEN ou AZURE_AD_TOKEN dans .env');
      process.exit(1);
    }

    console.log(`\n📝 Configuration:`);
    console.log(`   API URL: ${API_BASE_URL}`);
    console.log(`   Token: ${JWT_TOKEN.substring(0, 50)}...`);
    console.log('');

    // Appeler l'endpoint de synchronisation
    console.log('🔄 Démarrage de la synchronisation...\n');
    
    const startTime = Date.now();
    const response = await axios.post(
      `${API_BASE_URL}/jira-asset/sync/laptops`,
      {
        schemaName: 'Parc Informatique',
        objectTypeName: 'Laptop',
        limit: 1000,
        autoDetectAttributes: true,
      },
      {
        headers: {
          'Authorization': `Bearer ${JWT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 300000, // 5 minutes timeout
      }
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const results = response.data;

    // Afficher les résultats
    console.log('\n' + '='.repeat(60));
    console.log('📊 RÉSULTATS DE LA SYNCHRONISATION');
    console.log('='.repeat(60));
    console.log(`\n✅ Total d'objets Jira traités: ${results.total || 'N/A'}`);
    console.log(`   ✅ Créés: ${results.created || 0}`);
    console.log(`   🔄 Mis à jour: ${results.updated || 0}`);
    console.log(`   ⏭️  Ignorés: ${results.skipped || 0}`);
    console.log(`   ❌ Erreurs: ${results.errors || 0}`);
    console.log(`\n⏱️  Durée: ${duration}s`);
    
    if (results.attributeMapping) {
      console.log(`\n🔍 Attributs détectés:`);
      console.log(JSON.stringify(results.attributeMapping, null, 2));
    }

    // Vérifier le nombre total d'équipements dans MongoDB
    try {
      const statsResponse = await axios.get(
        `${API_BASE_URL}/equipment/stats`,
        {
          headers: {
            'Authorization': `Bearer ${JWT_TOKEN}`,
          },
        }
      );
      const stats = statsResponse.data;
      console.log(`\n📊 Statistiques MongoDB:`);
      console.log(`   Total équipements: ${stats.total || 'N/A'}`);
      if (stats.byType) {
        const laptopType = stats.byType.find(t => t._id === 'PC_portable');
        const laptopCount = laptopType ? laptopType.count : 0;
        console.log(`   PC_portable: ${laptopCount}`);
      }
    } catch (err) {
      // Ignorer l'erreur si l'endpoint n'existe pas
      console.log(`\n⚠️  Impossible de récupérer les statistiques: ${err.message}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ SYNCHRONISATION TERMINÉE');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ERREUR LORS DE LA SYNCHRONISATION');
    console.error('='.repeat(60));
    
    if (error.response) {
      // Erreur HTTP
      console.error(`\n📡 Statut HTTP: ${error.response.status} ${error.response.statusText}`);
      console.error(`📄 Message: ${error.response.data?.message || error.response.statusText}`);
      
      if (error.response.status === 401) {
        console.error('\n💡 Le token JWT est invalide ou expiré.');
        console.error('   Veuillez obtenir un nouveau token en vous connectant à l\'application.');
      } else if (error.response.status === 403) {
        console.error('\n💡 Vous n\'avez pas les permissions nécessaires.');
      } else if (error.response.data) {
        console.error(`\n📋 Détails:`, JSON.stringify(error.response.data, null, 2));
      }
    } else if (error.request) {
      // Pas de réponse du serveur
      console.error(`\n❌ Impossible de contacter le serveur à ${API_BASE_URL}`);
      console.error('   Vérifiez que le serveur NestJS est démarré.');
    } else {
      // Erreur de configuration
      console.error(`\n❌ Erreur: ${error.message}`);
    }
    
    console.error('\n' + '='.repeat(60));
    process.exit(1);
  }
}

// Exécuter le script
syncLaptops();

