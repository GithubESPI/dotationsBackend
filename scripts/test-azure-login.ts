/**
 * Script de test pour vérifier la connexion Azure AD
 * 
 * Ce script simule le flux d'authentification Azure AD pour tester la connexion
 * d'un utilisateur du tenant.
 * 
 * Usage:
 *   pnpm ts-node scripts/test-azure-login.ts
 * 
 * Note: Ce script nécessite que l'application soit démarrée sur http://localhost:3000
 */

import axios from 'axios';
import * as readline from 'readline';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';

interface LoginResult {
  success: boolean;
  access_token?: string;
  user?: any;
  error?: string;
}

/**
 * Fonction pour tester la connexion Azure AD
 * 
 * IMPORTANT: L'authentification Azure AD nécessite une redirection vers le portail Azure.
 * Ce script guide l'utilisateur à travers le processus.
 */
async function testAzureLogin(): Promise<void> {
  console.log('🔐 Test de connexion Azure AD');
  console.log('================================\n');

  try {
    // Étape 1: Vérifier que le serveur est démarré
    console.log('1️⃣ Vérification du serveur...');
    try {
      const healthCheck = await axios.get(`${API_BASE_URL}/`);
      console.log('✅ Serveur accessible\n');
    } catch (error) {
      console.error('❌ Le serveur n\'est pas accessible. Assurez-vous qu\'il est démarré sur', API_BASE_URL);
      console.error('   Lancez: pnpm run start:dev\n');
      process.exit(1);
    }

    // Étape 2: Obtenir l'URL d'authentification Azure AD
    console.log('2️⃣ Récupération de l\'URL d\'authentification Azure AD...');
    console.log(`\n📋 Pour vous connecter avec Azure AD:`);
    console.log(`   1. Ouvrez votre navigateur`);
    console.log(`   2. Allez sur: ${API_BASE_URL}/auth/azure-ad`);
    console.log(`   3. Connectez-vous avec: dev@groupe-espi.fr`);
    console.log(`   4. Après la connexion, vous serez redirigé vers le callback`);
    console.log(`   5. Le token JWT sera retourné dans la réponse\n`);

    // Étape 3: Instructions pour tester avec curl ou Postman
    console.log('3️⃣ Alternative: Test avec curl\n');
    console.log('Pour tester manuellement avec curl:');
    console.log(`curl -X GET "${API_BASE_URL}/auth/azure-ad" -L -v\n`);

    // Étape 4: Test du profil (nécessite un token)
    console.log('4️⃣ Test du profil utilisateur\n');
    console.log('Pour tester le profil après connexion:');
    console.log(`curl -X GET "${API_BASE_URL}/auth/profile" \\`);
    console.log(`  -H "Authorization: Bearer YOUR_JWT_TOKEN"\n`);

    // Étape 5: Test interactif si l'utilisateur a un token
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

  } catch (error: any) {
    console.error('❌ Erreur lors du test:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    process.exit(1);
  }
}

/**
 * Teste l'accès au profil avec un token JWT
 */
async function testProfile(token: string): Promise<void> {
  try {
    console.log('\n🔍 Test du profil utilisateur...\n');
    const response = await axios.get(`${API_BASE_URL}/auth/profile`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log('✅ Profil récupéré avec succès:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    if (error.response) {
      console.error('❌ Erreur:', error.response.status, error.response.statusText);
      console.error('   Message:', error.response.data?.message || error.response.data);
    } else {
      console.error('❌ Erreur:', error.message);
    }
  }
}

// Exécution du script
if (require.main === module) {
  testAzureLogin().catch((error) => {
    console.error('Erreur fatale:', error);
    process.exit(1);
  });
}

export { testAzureLogin, testProfile };

