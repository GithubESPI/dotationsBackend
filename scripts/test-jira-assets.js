require('dotenv').config();
const axios = require('axios');

/**
 * Script de test pour récupérer tous les objets d'un schéma Jira Asset
 * 
 * Usage: node scripts/test-jira-assets.js [schemaName]
 * Exemple: node scripts/test-jira-assets.js "Parc Informatique"
 */

// Récupérer le nom du schéma depuis les arguments de ligne de commande
const schemaName = process.argv[2] || 'Parc Informatique';
const limit = parseInt(process.argv[3]) || 1000;

// Variables d'environnement
const baseUrlAssets = process.env.JIRA_BASE_URL_ASSETS || 'https://api.atlassian.com/';
const basePathAssets = process.env.JIRA_BASE_PATH_ASSETS || '';
const emailAssets = process.env.JIRA_EMAIL_ASSETS || '';
const apiTokenAssets = (process.env.JIRA_TOKEN_ASSETS || '').replace(/^["']|["']$/g, '');

// Vérifier la configuration
if (!emailAssets || !apiTokenAssets) {
  console.error('❌ Erreur: JIRA_EMAIL_ASSETS et JIRA_TOKEN_ASSETS doivent être définis dans .env');
  process.exit(1);
}

if (!basePathAssets) {
  console.warn('⚠️  Avertissement: JIRA_BASE_PATH_ASSETS n\'est pas défini');
}

/**
 * Construire l'URL complète pour l'API Jira Assets
 */
function buildAssetsUrl(endpoint) {
  const baseUrl = baseUrlAssets.replace(/\/$/, ''); // Enlever le slash final
  if (basePathAssets) {
    // Si JIRA_BASE_PATH_ASSETS est fourni, l'utiliser directement
    const basePath = basePathAssets.replace(/^\/+/, '').replace(/\/+$/, '');
    const endpointPath = endpoint.replace(/^\/+/, '');
    return `${baseUrl}/${basePath}/${endpointPath}`.replace(/\/+/g, '/').replace(/https:\//, 'https://');
  } else {
    // Sinon, construire avec le workspace ID
    return `${baseUrl}${endpoint}`;
  }
}

/**
 * Extraire le workspace ID du chemin si disponible
 */
function extractWorkspaceId() {
  if (basePathAssets) {
    const workspaceMatch = basePathAssets.match(/workspace\/([a-f0-9-]+)/i);
    if (workspaceMatch && workspaceMatch[1]) {
      return workspaceMatch[1];
    }
  }
  return null;
}

/**
 * Récupérer tous les objets d'un schéma spécifique via différentes méthodes
 */
async function getAllAssetsFromSchema(schemaName, limit = 1000) {
  const allAssets = [];
  const pageSize = 100;
  const authHeader = `Basic ${Buffer.from(`${emailAssets}:${apiTokenAssets}`).toString('base64')}`;

  // D'abord, essayer de récupérer les schémas disponibles
  console.log(`\n🔍 Récupération des schémas disponibles...`);
  try {
    const schemasUrl = buildAssetsUrl('objectschema');
    const schemasResponse = await axios.get(schemasUrl, {
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
    });
    console.log(`✅ Schémas disponibles:`, JSON.stringify(schemasResponse.data).substring(0, 300));
  } catch (error) {
    console.log(`   ⚠️  Impossible de récupérer les schémas: ${error.response?.status || error.message}`);
  }

  // Essayer différentes approches
  const methods = [
    {
      name: 'AQL avec POST sur /aql/objects',
      url: buildAssetsUrl('aql/objects'),
      method: 'POST',
      body: (start) => ({
        qlQuery: `objectSchema = "${schemaName}"`,
        start,
        limit: pageSize,
      }),
    },
    {
      name: 'AQL avec GET sur /aql/objects',
      url: buildAssetsUrl('aql/objects'),
      method: 'GET',
      params: (start) => ({
        qlQuery: `objectSchema = "${schemaName}"`,
        start: start.toString(),
        limit: pageSize.toString(),
      }),
    },
    {
      name: 'Recherche IQL sur /object/navlist/iql',
      url: buildAssetsUrl('object/navlist/iql'),
      method: 'POST',
      body: (start) => ({
        iql: `objectSchema = "${schemaName}"`,
        resultPerPage: pageSize,
        startAt: start,
      }),
    },
    {
      name: 'Liste d\'objets sur /object',
      url: buildAssetsUrl('object'),
      method: 'GET',
      params: (start) => ({
        objectSchema: schemaName,
        start: start.toString(),
        limit: pageSize.toString(),
      }),
    },
    {
      name: 'Recherche via /object/aql',
      url: buildAssetsUrl('object/aql'),
      method: 'POST',
      body: (start) => ({
        qlQuery: `objectSchema = "${schemaName}"`,
        start,
        limit: pageSize,
      }),
    },
  ];

  let workingMethod = null;
  let start = 0;

  // Essayer chaque méthode jusqu'à trouver celle qui fonctionne
  for (const method of methods) {
    console.log(`\n🔍 Test de la méthode: ${method.name}`);
    console.log(`   URL: ${method.url}`);

    try {
      let response;
      const config = {
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      };

      if (method.method === 'POST') {
        config.headers['Content-Type'] = 'application/json';
        response = await axios.post(method.url, method.body(0), config);
      } else {
        const params = new URLSearchParams(method.params(0));
        response = await axios.get(`${method.url}?${params.toString()}`, config);
      }

      // Vérifier si la réponse contient des données
      const assets = response.data.values || response.data || [];
      if (Array.isArray(assets) && assets.length >= 0) {
        workingMethod = method;
        console.log(`✅ Méthode fonctionnelle trouvée: ${method.name}`);
        console.log(`   Réponse: ${JSON.stringify(response.data).substring(0, 200)}...`);
        break;
      }
    } catch (error) {
      if (error.response) {
        console.log(`   ❌ ${error.response.status}: ${error.response.statusText}`);
        if (error.response.status === 405) {
          console.log(`   ℹ️  Méthode ${method.method} non supportée sur cet endpoint`);
        }
      } else {
        console.log(`   ❌ ${error.message}`);
      }
      continue;
    }
  }

  if (!workingMethod) {
    throw new Error('Aucune méthode fonctionnelle trouvée. Vérifiez la documentation de l\'API Jira Assets.');
  }

  // Récupérer tous les objets avec pagination
  console.log(`\n📥 Récupération des objets avec pagination...`);
  start = 0;

  while (true) {
    try {
      let response;
      const config = {
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      };

      if (workingMethod.method === 'POST') {
        config.headers['Content-Type'] = 'application/json';
        response = await axios.post(workingMethod.url, workingMethod.body(start), config);
      } else {
        const params = new URLSearchParams(workingMethod.params(start));
        response = await axios.get(`${workingMethod.url}?${params.toString()}`, config);
      }

      const assets = response.data.values || response.data || [];
      const assetsArray = Array.isArray(assets) ? assets : [];

      if (assetsArray.length === 0) {
        break;
      }

      allAssets.push(...assetsArray);
      console.log(`   📦 ${assetsArray.length} objets récupérés (total: ${allAssets.length})`);

      // Afficher le premier objet pour debug
      if (start === 0 && assetsArray.length > 0) {
        console.log(`\n📋 Exemple du premier objet:`);
        console.log(JSON.stringify(assetsArray[0], null, 2));
      }

      // Vérifier s'il y a plus de résultats
      if (assetsArray.length < pageSize || allAssets.length >= limit) {
        break;
      }

      start += pageSize;
    } catch (error) {
      console.error(`   ❌ Erreur lors de la pagination: ${error.message}`);
      break;
    }
  }

  return allAssets.slice(0, limit);
}

/**
 * Fonction principale
 */
async function main() {
  console.log('='.repeat(60));
  console.log('🧪 TEST JIRA ASSETS - Récupération des objets d\'un schéma');
  console.log('='.repeat(60));
  console.log(`\n📝 Configuration:`);
  console.log(`   Base URL: ${baseUrlAssets}`);
  console.log(`   Base Path: ${basePathAssets || '(non défini)'}`);
  console.log(`   Email: ${emailAssets}`);
  console.log(`   Token: ${apiTokenAssets.substring(0, 20)}...`);
  
  const workspaceId = extractWorkspaceId();
  if (workspaceId) {
    console.log(`   Workspace ID (extrait): ${workspaceId}`);
  }
  
  console.log(`\n🎯 Paramètres:`);
  console.log(`   Schéma: "${schemaName}"`);
  console.log(`   Limite: ${limit} objets`);

  try {
    const assets = await getAllAssetsFromSchema(schemaName, limit);

    console.log('\n' + '='.repeat(60));
    console.log('📊 RÉSULTATS');
    console.log('='.repeat(60));
    console.log(`\n✅ Total d'objets récupérés: ${assets.length}`);

    if (assets.length > 0) {
      // Afficher un résumé des attributs disponibles
      console.log(`\n📋 Attributs disponibles dans le premier objet:`);
      const firstAsset = assets[0];
      if (firstAsset.attributes && firstAsset.attributes.length > 0) {
        firstAsset.attributes.forEach((attr, index) => {
          const value = attr.objectAttributeValues?.[0]?.value || '(vide)';
          console.log(`   ${index + 1}. Attribute ID: ${attr.objectTypeAttributeId}`);
          console.log(`      Valeur: ${JSON.stringify(value)}`);
        });
      }

      // Statistiques
      const stats = {
        avecId: assets.filter(a => a.id).length,
        avecObjectKey: assets.filter(a => a.objectKey).length,
        avecAttributes: assets.filter(a => a.attributes && a.attributes.length > 0).length,
      };
      console.log(`\n📈 Statistiques:`);
      console.log(`   Objets avec ID: ${stats.avecId}`);
      console.log(`   Objets avec ObjectKey: ${stats.avecObjectKey}`);
      console.log(`   Objets avec attributs: ${stats.avecAttributes}`);

      // Optionnel: sauvegarder dans un fichier JSON
      if (process.argv.includes('--save')) {
        const fs = require('fs');
        const filename = `jira-assets-${schemaName.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify(assets, null, 2));
        console.log(`\n💾 Résultats sauvegardés dans: ${filename}`);
      }
    } else {
      console.log(`\n⚠️  Aucun objet trouvé dans le schéma "${schemaName}"`);
      console.log(`   Vérifiez que le nom du schéma est correct.`);
    }

    console.log('\n' + '='.repeat(60));
    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ÉCHEC DU TEST');
    console.error('='.repeat(60));
    if (error.response) {
      console.error(`\nDétails de l'erreur:`);
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${error.response.statusText}`);
      console.error(`   Données:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(`\nErreur: ${error.message}`);
    }
    process.exit(1);
  }
}

// Exécuter le script
main();
