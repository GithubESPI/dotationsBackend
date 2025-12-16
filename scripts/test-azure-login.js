/**
 * Script de test pour vérifier la connexion Azure AD (version JavaScript)
 * 
 * Usage:
 *   node scripts/test-azure-login.js
 */

const axios = require('axios');
const readline = require('readline');

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';

async function testAzureLogin() {
  console.log('🔐 Test de connexion Azure AD');
  console.log('================================\n');

  try {
    // Étape 1: Vérifier que le serveur est démarré
    console.log('1️⃣ Vérification du serveur...');
    try {
      await axios.get(`${API_BASE_URL}/`);
      console.log('✅ Serveur accessible\n');
    } catch (error) {
      console.error('❌ Le serveur n\'est pas accessible. Assurez-vous qu\'il est démarré sur', API_BASE_URL);
      console.error('   Lancez: pnpm run start:dev\n');
      process.exit(1);
    }

    // Étape 2: Instructions pour la connexion
    console.log('2️⃣ Instructions pour la connexion Azure AD\n');
    console.log(`📋 Pour vous connecter avec Azure AD:`);
    console.log(`   1. Ouvrez votre navigateur`);
    console.log(`   2. Allez sur: ${API_BASE_URL}/auth/azure-ad`);
    console.log(`   3. Connectez-vous avec: dev@groupe-espi.fr`);
    console.log(`   4. Mot de passe: espi2077*`);
    console.log(`   5. Après la connexion, vous serez redirigé vers le callback`);
    console.log(`   6. Le token JWT sera retourné dans la réponse\n`);

    // Étape 3: Test du profil
    console.log('3️⃣ Test du profil utilisateur\n');
    console.log('Pour tester le profil après connexion:');
    console.log(`curl -X GET "${API_BASE_URL}/auth/profile" \\`);
    console.log(`  -H "Authorization: Bearer YOUR_JWT_TOKEN"\n`);

    // Test interactif
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Avez-vous un token JWT à tester? (o/n): ', async (answer) => {
      if (answer.toLowerCase() === 'o' || answer.toLowerCase() === 'oui') {
        rl.question('Entrez votre token JWT: ', async (token) => {
          await testProfile(token.trim());
          rl.close();
        });
      } else {
        console.log('\n✅ Script terminé. Utilisez les instructions ci-dessus pour tester la connexion.');
        rl.close();
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors du test:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    process.exit(1);
  }
}

async function testProfile(token) {
  try {
    console.log('\n🔍 Test du profil utilisateur...\n');
    const response = await axios.get(`${API_BASE_URL}/auth/profile`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log('✅ Profil récupéré avec succès:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    if (error.response) {
      console.error('❌ Erreur:', error.response.status, error.response.statusText);
      console.error('   Message:', error.response.data?.message || error.response.data);
    } else {
      console.error('❌ Erreur:', error.message);
    }
  }
}

if (require.main === module) {
  testAzureLogin().catch((error) => {
    console.error('Erreur fatale:', error);
    process.exit(1);
  });
}

module.exports = { testAzureLogin, testProfile };

