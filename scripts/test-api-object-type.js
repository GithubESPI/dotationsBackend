require('dotenv').config();
const axios = require('axios');

/**
 * Script de test pour tester la route API qui récupère les objets par type
 * 
 * Usage: node scripts/test-api-object-type.js [schemaName] [objectTypeName]
 * Exemple: node scripts/test-api-object-type.js "Parc Informatique" "Laptop"
 * 
 * Note: Assurez-vous que le serveur NestJS est démarré (npm run start:dev)
 */

// Récupérer les paramètres depuis les arguments de ligne de commande
const schemaName = process.argv[2] || 'Parc Informatique';
const objectTypeName = process.argv[3] || 'Laptop';

// Configuration de l'API
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const JWT_TOKEN = process.env.TEST_JWT_TOKEN || ''; // Optionnel, si vous avez un token de test

// URL de la route
const routeUrl = `${API_BASE_URL}/jira-asset/schema/${encodeURIComponent(schemaName)}/object-type/${encodeURIComponent(objectTypeName)}`;

console.log('='.repeat(60));
console.log('🧪 TEST API - Récupération par type d\'objet');
console.log('='.repeat(60));
console.log(`\n📝 Configuration:`);
console.log(`   API URL: ${API_BASE_URL}`);
console.log(`   Route: GET /jira-asset/schema/:schemaName/object-type/:objectTypeName`);
console.log(`\n🎯 Paramètres:`);
console.log(`   Schéma: "${schemaName}"`);
console.log(`   Type d'objet: "${objectTypeName}"`);
console.log(`\n🌐 URL complète: ${routeUrl}`);
console.log('');

async function testRoute() {
  try {
    const headers = {};
    
    // Si un token JWT est fourni, l'utiliser
    if (JWT_TOKEN) {
      headers['Authorization'] = `Bearer ${JWT_TOKEN}`;
      console.log('🔐 Utilisation du token JWT fourni');
    } else {
      console.log('⚠️  Aucun token JWT fourni. Si l\'API nécessite une authentification, la requête échouera.');
      console.log('   Vous pouvez définir TEST_JWT_TOKEN dans .env ou passer le token en paramètre.');
    }

    console.log(`\n📤 Envoi de la requête GET...`);
    const response = await axios.get(routeUrl, { headers });

    console.log(`\n✅ Réponse reçue:`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Headers:`, JSON.stringify(response.headers, null, 2).substring(0, 200));

    const data = response.data;
    console.log(`\n📊 Données reçues:`);
    console.log(`   Schéma: ${data.schemaName}`);
    console.log(`   Type d'objet: ${data.objectTypeName}`);
    console.log(`   Nombre d'objets: ${data.count}`);

    if (data.assets && data.assets.length > 0) {
      console.log(`\n📦 Premier objet:`);
      const firstAsset = data.assets[0];
      console.log(`   ID: ${firstAsset.id}`);
      console.log(`   ObjectKey: ${firstAsset.objectKey}`);
      console.log(`   Label: ${firstAsset.label || firstAsset.name}`);
      console.log(`   ObjectType: ${firstAsset.objectType?.name || 'N/A'}`);
      console.log(`   Nombre d'attributs: ${firstAsset.attributes?.length || 0}`);

      if (firstAsset.attributes && firstAsset.attributes.length > 0) {
        console.log(`\n   Attributs:`);
        firstAsset.attributes.slice(0, 5).forEach((attr, index) => {
          const value = attr.objectAttributeValues?.[0]?.displayValue || 
                       attr.objectAttributeValues?.[0]?.value || 
                       '(vide)';
          console.log(`     ${index + 1}. Attribute ID ${attr.objectTypeAttributeId}: ${JSON.stringify(value)}`);
        });
        if (firstAsset.attributes.length > 5) {
          console.log(`     ... et ${firstAsset.attributes.length - 5} autres attributs`);
        }
      }

      // Statistiques
      const stats = {
        avecId: data.assets.filter(a => a.id).length,
        avecObjectKey: data.assets.filter(a => a.objectKey).length,
        avecAttributes: data.assets.filter(a => a.attributes && a.attributes.length > 0).length,
        avecObjectType: data.assets.filter(a => a.objectType).length,
      };
      console.log(`\n📈 Statistiques:`);
      console.log(`   Objets avec ID: ${stats.avecId}`);
      console.log(`   Objets avec ObjectKey: ${stats.avecObjectKey}`);
      console.log(`   Objets avec attributs: ${stats.avecAttributes}`);
      console.log(`   Objets avec ObjectType: ${stats.avecObjectType}`);
    } else {
      console.log(`\n⚠️  Aucun objet trouvé`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ TEST RÉUSSI');
    console.log('='.repeat(60));
    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ÉCHEC DU TEST');
    console.error('='.repeat(60));

    if (error.response) {
      console.error(`\n📋 Détails de l'erreur HTTP:`);
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Status Text: ${error.response.statusText}`);
      console.error(`   URL: ${error.config?.url}`);
      console.error(`   Données:`, JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 401) {
        console.error(`\n💡 Conseil: L'API nécessite une authentification JWT.`);
        console.error(`   Définissez TEST_JWT_TOKEN dans .env ou connectez-vous via l'API d'authentification.`);
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

// Exécuter le test
testRoute();

