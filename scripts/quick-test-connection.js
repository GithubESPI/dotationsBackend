/**
 * Script de test rapide de connexion Azure AD
 * 
 * Usage:
 *   node scripts/quick-test-connection.js
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function quickTest() {
  console.log('🔐 Test rapide de connexion Azure AD\n');
  console.log('='.repeat(60));
  
  // Test 1: Santé du serveur
  console.log('\n1️⃣ Test du serveur...');
  try {
    const health = await axios.get(`${API_URL}/`);
    console.log('✅ Serveur accessible');
    console.log(`   Message: ${health.data.message || 'OK'}\n`);
  } catch (error) {
    console.error('❌ Serveur non accessible');
    console.error(`   Erreur: ${error.message}`);
    console.error(`   Assurez-vous que l'application est démarrée: pnpm run start:dev\n`);
    process.exit(1);
  }
  
  // Instructions
  console.log('2️⃣ Instructions pour tester la connexion:\n');
  console.log('   Option A: Via le navigateur');
  console.log(`   → Ouvrez: ${API_URL}/auth/azure-ad`);
  console.log('   → Connectez-vous avec: dev@groupe-espi.fr');
  console.log('   → Mot de passe: espi2077*\n');
  
  console.log('   Option B: Via Microsoft Graph Explorer');
  console.log('   → Allez sur: https://developer.microsoft.com/en-us/graph/graph-explorer');
  console.log('   → Connectez-vous avec: dev@groupe-espi.fr');
  console.log('   → Copiez le token d\'accès\n');
  
  console.log('   Option C: Via Swagger UI');
  console.log(`   → Ouvrez: ${API_URL}/api`);
  console.log('   → Testez l\'endpoint /auth/azure-ad\n');
  
  // Test avec token si fourni
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  rl.question('Avez-vous un token Azure AD à tester? (o/n): ', async (answer) => {
    if (answer.toLowerCase() === 'o' || answer.toLowerCase() === 'oui') {
      rl.question('Entrez votre token Azure AD: ', async (token) => {
        await testWithToken(token.trim());
        rl.close();
      });
    } else {
      console.log('\n✅ Test terminé. Utilisez une des options ci-dessus pour vous connecter.');
      rl.close();
    }
  });
}

async function testWithToken(token) {
  console.log('\n3️⃣ Test avec le token Azure AD...\n');
  
  try {
    // Test Graph Explorer endpoint
    console.log('Test: Endpoint Graph Explorer (/me)');
    const response = await axios.post(
      `${API_URL}/auth/graph/explorer`,
      {
        token: token,
        endpoint: '/me',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (response.data.success) {
      console.log('✅ Token valide!');
      console.log('\nProfil utilisateur:');
      const user = response.data.data;
      console.log(`   ID: ${user.id}`);
      console.log(`   Nom: ${user.displayName || 'N/A'}`);
      console.log(`   Email: ${user.mail || user.userPrincipalName || 'N/A'}`);
      console.log(`   Job Title: ${user.jobTitle || 'N/A'}`);
      console.log(`   Department: ${user.department || 'N/A'}`);
    } else {
      console.error('❌ Erreur:', response.data.error);
    }
  } catch (error) {
    console.error('❌ Erreur lors du test:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`   Message: ${error.message}`);
    }
  }
}

if (require.main === module) {
  quickTest().catch((error) => {
    console.error('Erreur fatale:', error);
    process.exit(1);
  });
}

module.exports = { quickTest, testWithToken };

