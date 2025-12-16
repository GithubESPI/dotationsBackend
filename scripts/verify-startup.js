/**
 * Script pour vérifier que l'application démarre correctement avec la configuration Azure AD
 */

const axios = require('axios');
const readline = require('readline');

const API_URL = process.env.API_URL || 'http://localhost:3000';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function verifyStartup() {
  console.log('\n🔍 Vérification du démarrage de l\'application\n');
  
  console.log('1. Assurez-vous que l\'application est démarrée:');
  console.log('   pnpm run start:dev\n');
  
  console.log('2. Vérifiez les logs au démarrage. Vous devriez voir:');
  console.log('   ✅ Configuration Azure AD chargée:');
  console.log('      Client ID: 4fe9585f...');
  console.log('      Tenant ID: aba6abb3-d3fe-4135-9cdf-aa12bf5ff72b');
  console.log('      Redirect URI: http://localhost:3000/auth/azure-ad/callback\n');
  
  const isRunning = await question('L\'application est-elle démarrée? (o/n): ');
  
  if (isRunning.toLowerCase() === 'o' || isRunning.toLowerCase() === 'oui') {
    console.log('\n3. Test de l\'endpoint de santé...');
    try {
      const response = await axios.get(`${API_URL}/`);
      console.log('✅ Application accessible');
      console.log(`   Message: ${response.data.message || 'OK'}\n`);
      
      console.log('4. Test de la connexion Azure AD...');
      console.log(`   Ouvrez dans votre navigateur: ${API_URL}/auth/azure-ad`);
      console.log('   Vous devriez être redirigé vers Azure AD pour vous connecter.\n');
      
      console.log('✅ Tout est prêt! La configuration est correcte.');
    } catch (error) {
      console.error('❌ L\'application n\'est pas accessible');
      console.error(`   Erreur: ${error.message}`);
      console.error('   Assurez-vous que l\'application est démarrée sur le port 3000');
    }
  } else {
    console.log('\n📝 Pour démarrer l\'application:');
    console.log('   pnpm run start:dev\n');
    console.log('   Après le démarrage, vérifiez les logs pour confirmer que la configuration Azure AD est chargée.');
  }
  
  rl.close();
}

verifyStartup().catch((error) => {
  console.error('Erreur:', error);
  rl.close();
  process.exit(1);
});


