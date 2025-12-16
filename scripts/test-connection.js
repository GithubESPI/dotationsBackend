/**
 * Script de test de connexion Azure AD avec Microsoft Graph
 * 
 * Usage:
 *   node scripts/test-connection.js
 * 
 * Ou avec des paramètres:
 *   node scripts/test-connection.js --email dev@groupe-espi.fr --password espi2077*
 */

const axios = require('axios');
const readline = require('readline');

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const GRAPH_EXPLORER_URL = 'https://developer.microsoft.com/en-us/graph/graph-explorer';

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// Interface readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

/**
 * Teste si le serveur est accessible
 */
async function testServerHealth() {
  logSection('1. Vérification du serveur');
  try {
    const response = await axios.get(`${API_BASE_URL}/`);
    logSuccess(`Serveur accessible sur ${API_BASE_URL}`);
    logInfo(`Message: ${response.data.message || 'OK'}`);
    return true;
  } catch (error) {
    logError(`Le serveur n'est pas accessible sur ${API_BASE_URL}`);
    if (error.code === 'ECONNREFUSED') {
      logWarning('Assurez-vous que l\'application est démarrée: pnpm run start:dev');
    }
    return false;
  }
}

/**
 * Teste la connexion Azure AD via le navigateur
 */
async function testAzureADConnection() {
  logSection('2. Test de connexion Azure AD');
  
  logInfo('Pour tester la connexion Azure AD:');
  console.log(`   1. Ouvrez votre navigateur`);
  console.log(`   2. Allez sur: ${API_BASE_URL}/auth/azure-ad`);
  console.log(`   3. Connectez-vous avec vos identifiants Azure AD`);
  console.log(`   4. Après la connexion, vous recevrez un token JWT et un token Azure AD\n`);
  
  logInfo('Alternative: Utiliser Microsoft Graph Explorer');
  console.log(`   1. Allez sur: ${GRAPH_EXPLORER_URL}`);
  console.log(`   2. Connectez-vous avec: dev@groupe-espi.fr`);
  console.log(`   3. Copiez le token d'accès\n`);
  
  const useToken = await question('Avez-vous un token Azure AD à tester? (o/n): ');
  
  if (useToken.toLowerCase() === 'o' || useToken.toLowerCase() === 'oui') {
    const token = await question('Entrez votre token Azure AD: ');
    return token.trim();
  }
  
  return null;
}

/**
 * Teste le profil utilisateur avec un token JWT
 */
async function testProfileWithJWT(token) {
  logSection('3. Test du profil avec token JWT');
  
  if (!token) {
    logWarning('Aucun token JWT fourni. Test ignoré.');
    return;
  }
  
  try {
    const response = await axios.get(`${API_BASE_URL}/auth/profile`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    
    logSuccess('Profil récupéré avec succès:');
    console.log(JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    if (error.response) {
      logError(`Erreur ${error.response.status}: ${error.response.statusText}`);
      if (error.response.data?.message) {
        logError(`Message: ${error.response.data.message}`);
      }
    } else {
      logError(`Erreur: ${error.message}`);
    }
    return false;
  }
}

/**
 * Teste Microsoft Graph API avec un token Azure AD
 */
async function testGraphAPI(azureToken) {
  logSection('4. Test de Microsoft Graph API');
  
  if (!azureToken) {
    logWarning('Aucun token Azure AD fourni. Test ignoré.');
    return;
  }
  
  // Test 1: Profil utilisateur
  logInfo('Test 1: Récupération du profil depuis Graph API');
  try {
    const response = await axios.post(
      `${API_BASE_URL}/auth/graph/explorer`,
      {
        token: azureToken,
        endpoint: '/me',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (response.data.success) {
      logSuccess('Profil récupéré depuis Graph API:');
      console.log(JSON.stringify(response.data.data, null, 2));
    } else {
      logError('Erreur lors de la récupération du profil:');
      console.log(JSON.stringify(response.data.error, null, 2));
    }
  } catch (error) {
    logError(`Erreur: ${error.message}`);
    if (error.response) {
      console.log(JSON.stringify(error.response.data, null, 2));
    }
  }
  
  // Test 2: Photo de profil
  logInfo('\nTest 2: Récupération de la photo de profil');
  try {
    const response = await axios.get(`${API_BASE_URL}/auth/graph/photo`, {
      params: { token: azureToken },
      headers: {
        Authorization: `Bearer ${azureToken}`,
      },
    });
    
    if (response.data.photo) {
      logSuccess('Photo de profil récupérée (base64)');
      logInfo(`Taille: ${response.data.photo.length} caractères`);
    } else {
      logWarning('Aucune photo de profil disponible');
    }
  } catch (error) {
    if (error.response?.status === 401) {
      logWarning('Photo non disponible (peut nécessiter des permissions supplémentaires)');
    } else {
      logError(`Erreur: ${error.message}`);
    }
  }
  
  // Test 3: Groupes
  logInfo('\nTest 3: Récupération des groupes');
  try {
    const response = await axios.get(`${API_BASE_URL}/auth/graph/groups`, {
      params: { token: azureToken },
      headers: {
        Authorization: `Bearer ${azureToken}`,
      },
    });
    
    if (response.data.groups && response.data.groups.length > 0) {
      logSuccess(`Groupes récupérés (${response.data.groups.length}):`);
      response.data.groups.forEach((group, index) => {
        console.log(`   ${index + 1}. ${group}`);
      });
    } else {
      logWarning('Aucun groupe trouvé');
    }
  } catch (error) {
    if (error.response?.status === 401) {
      logWarning('Groupes non disponibles (peut nécessiter des permissions supplémentaires)');
    } else {
      logError(`Erreur: ${error.message}`);
    }
  }
  
  // Test 4: Endpoint personnalisé
  const customEndpoint = await question('\nVoulez-vous tester un endpoint Graph personnalisé? (o/n): ');
  if (customEndpoint.toLowerCase() === 'o' || customEndpoint.toLowerCase() === 'oui') {
    const endpoint = await question('Entrez l\'endpoint Graph (ex: /me/memberOf, /users): ');
    
    try {
      const response = await axios.post(
        `${API_BASE_URL}/auth/graph/explorer`,
        {
          token: azureToken,
          endpoint: endpoint.trim(),
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.data.success) {
        logSuccess(`Résultat de ${endpoint}:`);
        console.log(JSON.stringify(response.data.data, null, 2));
      } else {
        logError(`Erreur pour ${endpoint}:`);
        console.log(JSON.stringify(response.data.error, null, 2));
      }
    } catch (error) {
      logError(`Erreur: ${error.message}`);
      if (error.response) {
        console.log(JSON.stringify(error.response.data, null, 2));
      }
    }
  }
}

/**
 * Teste les endpoints utilisateurs
 */
async function testUsersEndpoints(jwtToken) {
  logSection('5. Test des endpoints utilisateurs');
  
  if (!jwtToken) {
    logWarning('Aucun token JWT fourni. Test ignoré.');
    return;
  }
  
  try {
    // Liste des utilisateurs
    logInfo('Test: Liste des utilisateurs');
    const response = await axios.get(`${API_BASE_URL}/users`, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    });
    
    logSuccess('Liste des utilisateurs récupérée:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    if (error.response) {
      logError(`Erreur ${error.response.status}: ${error.response.statusText}`);
    } else {
      logError(`Erreur: ${error.message}`);
    }
  }
}

/**
 * Fonction principale
 */
async function main() {
  console.clear();
  log('🔐 Test de connexion Azure AD avec Microsoft Graph', 'bright');
  log(`API Base URL: ${API_BASE_URL}\n`, 'cyan');
  
  // Test 1: Vérification du serveur
  const serverOk = await testServerHealth();
  if (!serverOk) {
    logError('\nLe serveur n\'est pas accessible. Arrêt des tests.');
    rl.close();
    process.exit(1);
  }
  
  // Test 2: Connexion Azure AD
  const azureToken = await testAzureADConnection();
  
  // Test 3: Profil avec JWT (si disponible)
  const hasJWT = await question('\nAvez-vous un token JWT à tester? (o/n): ');
  let jwtToken = null;
  if (hasJWT.toLowerCase() === 'o' || hasJWT.toLowerCase() === 'oui') {
    jwtToken = await question('Entrez votre token JWT: ');
    await testProfileWithJWT(jwtToken.trim());
  }
  
  // Test 4: Graph API
  if (azureToken) {
    await testGraphAPI(azureToken);
  } else {
    logWarning('\nAucun token Azure AD fourni. Les tests Graph API sont ignorés.');
    logInfo('Pour obtenir un token:');
    logInfo(`  1. Allez sur ${API_BASE_URL}/auth/azure-ad`);
    logInfo(`  2. Ou utilisez Graph Explorer: ${GRAPH_EXPLORER_URL}`);
  }
  
  // Test 5: Endpoints utilisateurs
  if (jwtToken) {
    await testUsersEndpoints(jwtToken);
  }
  
  // Résumé
  logSection('Résumé des tests');
  logSuccess('Tests terminés!');
  logInfo('\nPour plus d\'informations:');
  logInfo(`  - Documentation Swagger: ${API_BASE_URL}/api`);
  logInfo(`  - Guide Graph Explorer: Voir GRAPH_EXPLORER_GUIDE.md`);
  
  rl.close();
}

// Gestion des arguments en ligne de commande
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node scripts/test-connection.js [options]

Options:
  --help, -h          Affiche cette aide
  --email <email>     Email pour la connexion (non utilisé actuellement)
  --password <pwd>    Mot de passe (non utilisé actuellement)
  --api-url <url>     URL de l'API (défaut: http://localhost:3000)

Exemples:
  node scripts/test-connection.js
  node scripts/test-connection.js --api-url http://localhost:3000
  API_URL=http://localhost:3000 node scripts/test-connection.js
  `);
  process.exit(0);
}

// Récupération de l'URL de l'API depuis les arguments
const apiUrlIndex = args.indexOf('--api-url');
if (apiUrlIndex !== -1 && args[apiUrlIndex + 1]) {
  process.env.API_URL = args[apiUrlIndex + 1];
}

// Exécution
if (require.main === module) {
  main().catch((error) => {
    logError(`\nErreur fatale: ${error.message}`);
    console.error(error);
    rl.close();
    process.exit(1);
  });
}

module.exports = { testServerHealth, testGraphAPI, testProfileWithJWT };

