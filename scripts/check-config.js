/**
 * Script de vérification de la configuration Azure AD
 * 
 * Usage:
 *   node scripts/check-config.js
 */

require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bright: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkConfig() {
  console.log('\n' + '='.repeat(60));
  log('🔍 Vérification de la configuration Azure AD', 'bright');
  console.log('='.repeat(60) + '\n');

  let hasErrors = false;
  let hasWarnings = false;

  // Vérifier AZURE_AD_CLIENT_ID
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  if (!clientId || clientId.trim() === '' || clientId === 'your-azure-ad-client-id') {
    log('❌ AZURE_AD_CLIENT_ID est manquant ou non configuré', 'red');
    log('   → Ajoutez AZURE_AD_CLIENT_ID dans votre fichier .env', 'red');
    log('   → Vous pouvez le trouver dans Azure Portal > App registrations > Votre app > Application (client) ID', 'red');
    hasErrors = true;
  } else {
    log(`✅ AZURE_AD_CLIENT_ID: ${clientId.substring(0, 8)}...${clientId.substring(clientId.length - 4)}`, 'green');
  }

  // Vérifier AZURE_AD_CLIENT_SECRET
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;
  if (!clientSecret || clientSecret.trim() === '' || clientSecret === 'your-azure-ad-client-secret') {
    log('❌ AZURE_AD_CLIENT_SECRET est manquant ou non configuré', 'red');
    log('   → Ajoutez AZURE_AD_CLIENT_SECRET dans votre fichier .env', 'red');
    log('   → Créez un secret dans Azure Portal > App registrations > Votre app > Certificates & secrets', 'red');
    hasErrors = true;
  } else {
    log(`✅ AZURE_AD_CLIENT_SECRET: ${'*'.repeat(clientSecret.length)}`, 'green');
  }

  // Vérifier AZURE_AD_TENANT_ID
  const tenantId = process.env.AZURE_AD_TENANT_ID;
  if (!tenantId || tenantId.trim() === '' || tenantId === 'your-azure-ad-tenant-id') {
    log('⚠️  AZURE_AD_TENANT_ID est manquant ou non configuré', 'yellow');
    log('   → L\'application utilisera "common" (tous les tenants Azure AD)', 'yellow');
    log('   → Pour limiter à votre tenant, ajoutez AZURE_AD_TENANT_ID dans .env', 'yellow');
    log('   → Vous pouvez le trouver dans Azure Portal > App registrations > Votre app > Directory (tenant) ID', 'yellow');
    hasWarnings = true;
  } else {
    log(`✅ AZURE_AD_TENANT_ID: ${tenantId}`, 'green');
  }

  // Vérifier AZURE_AD_REDIRECT_URI
  const redirectUri = process.env.AZURE_AD_REDIRECT_URI || 'http://localhost:3000/auth/azure-ad/callback';
  log(`ℹ️  AZURE_AD_REDIRECT_URI: ${redirectUri}`, 'blue');
  log('   → Assurez-vous que cette URI correspond à celle configurée dans Azure Portal', 'blue');

  // Vérifier JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret === 'your-super-secret-jwt-key-change-in-production') {
    log('⚠️  JWT_SECRET utilise la valeur par défaut', 'yellow');
    log('   → Changez JWT_SECRET pour un secret fort en production', 'yellow');
    hasWarnings = true;
  } else {
    log('✅ JWT_SECRET est configuré', 'green');
  }

  // Résumé
  console.log('\n' + '='.repeat(60));
  if (hasErrors) {
    log('❌ Des erreurs de configuration ont été détectées', 'red');
    log('\n📝 Pour corriger:', 'bright');
    log('   1. Copiez env.example vers .env: cp env.example .env', 'blue');
    log('   2. Remplissez les valeurs Azure AD dans .env', 'blue');
    log('   3. Consultez README.md pour les instructions détaillées', 'blue');
    process.exit(1);
  } else if (hasWarnings) {
    log('⚠️  Configuration OK avec des avertissements', 'yellow');
    log('   → Vérifiez les avertissements ci-dessus', 'yellow');
    process.exit(0);
  } else {
    log('✅ Configuration complète et valide!', 'green');
    process.exit(0);
  }
}

// Vérifier si dotenv est disponible
try {
  require('dotenv').config();
} catch (error) {
  log('⚠️  Le package dotenv n\'est pas installé. Installation des variables depuis process.env...', 'yellow');
}

checkConfig();




