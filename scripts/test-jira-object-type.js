require('dotenv').config();
const axios = require('axios');

/**
 * Script de test pour récupérer tous les objets d'un type d'objet spécifique (ex: Laptop)
 * dans un schéma Jira Asset
 * 
 * Usage: node scripts/test-jira-object-type.js [schemaName] [objectTypeName]
 * Exemple: node scripts/test-jira-object-type.js "Parc Informatique" "Laptop"
 */

// Récupérer les paramètres depuis les arguments de ligne de commande
const schemaName = process.argv[2] || 'Parc Informatique';
const objectTypeName = process.argv[3] || 'Laptop';
const limit = parseInt(process.argv[4]) || 1000;

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

/**
 * Construire l'URL complète pour l'API Jira Assets
 */
function buildAssetsUrl(endpoint) {
  const baseUrl = baseUrlAssets.replace(/\/$/, '');
  if (basePathAssets) {
    const basePath = basePathAssets.replace(/^\/+/, '').replace(/\/+$/, '');
    const endpointPath = endpoint.replace(/^\/+/, '');
    return `${baseUrl}/${basePath}/${endpointPath}`.replace(/\/+/g, '/').replace(/https:\//, 'https://');
  } else {
    return `${baseUrl}${endpoint}`;
  }
}

/**
 * Récupérer tous les objets d'un type d'objet spécifique dans un schéma
 */
async function getAllAssetsByObjectType(schemaName, objectTypeName, limit = 1000) {
  const allAssets = [];
  let start = 0;
  const pageSize = 100;
  const authHeader = `Basic ${Buffer.from(`${emailAssets}:${apiTokenAssets}`).toString('base64')}`;

  try {
    console.log(`🔍 Récupération des objets de type "${objectTypeName}" du schéma "${schemaName}"...`);
    console.log(`📋 Limite: ${limit} objets maximum`);

    const searchUrl = buildAssetsUrl('object/aql');
    console.log(`🌐 URL: ${searchUrl}`);

    while (true) {
      // Requête AQL pour filtrer par schéma ET type d'objet
      const aqlBody = {
        qlQuery: `objectSchema = "${schemaName}" AND objectType = "${objectTypeName}"`,
        start,
        limit: pageSize,
      };

      console.log(`\n📤 Requête AQL (start: ${start}, limit: ${pageSize}):`);
      console.log(`   Query: ${aqlBody.qlQuery}`);

      const response = await axios.post(
        searchUrl,
        aqlBody,
        {
          headers: {
            Authorization: authHeader,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      const assets = response.data.values || [];
      const totalSize = response.data.size || 0; // Nombre total d'objets disponibles
      const responseStart = response.data.start || 0;
      const responseLimit = response.data.limit || pageSize;
      
      // Afficher les détails de la réponse pour debug
      if (start === 0) {
        console.log(`\n📋 Détails de la réponse API:`);
        console.log(`   size: ${totalSize}`);
        console.log(`   start: ${responseStart}`);
        console.log(`   limit: ${responseLimit}`);
        console.log(`   values.length: ${assets.length}`);
        console.log(`   Réponse complète (premiers 500 caractères):`, JSON.stringify(response.data).substring(0, 500));
      }
      
      allAssets.push(...assets);

      const pageNum = Math.floor(start / pageSize) + 1;
      console.log(`✅ Page ${pageNum}: ${assets.length} objets récupérés (total: ${allAssets.length}${totalSize > 0 ? `/${totalSize}` : ''})`);

      // Afficher le premier objet pour debug (seulement sur la première page)
      if (start === 0 && assets.length > 0) {
        console.log(`\n📦 Exemple du premier objet (simplifié):`);
        const simplified = {
          id: assets[0].id,
          objectKey: assets[0].objectKey,
          label: assets[0].label,
          objectType: assets[0].objectType?.name,
          attributesCount: assets[0].attributes?.length || 0,
        };
        console.log(JSON.stringify(simplified, null, 2));
      }

      // Vérifier s'il y a plus de résultats
      // Si on reçoit 0 objets, on a fini
      // Si totalSize est disponible et qu'on l'a atteint, on a fini
      // Sinon, continuer tant qu'on reçoit des objets et qu'on n'a pas atteint la limite
      const hasMore = assets.length > 0 && 
        (totalSize === 0 || allAssets.length < totalSize) && 
        allAssets.length < limit;

      if (!hasMore) {
        if (assets.length === 0) {
          console.log(`\n✅ Pagination terminée: aucune donnée supplémentaire disponible`);
        } else if (totalSize > 0 && allAssets.length >= totalSize) {
          console.log(`\n✅ Pagination terminée: tous les objets récupérés (${allAssets.length}/${totalSize})`);
        } else if (allAssets.length >= limit) {
          console.log(`\n⚠️  Limite atteinte: ${allAssets.length} objets récupérés sur ${limit} demandés`);
        }
        break;
      }

      // Continuer avec la pagination
      // Utiliser le nombre réel d'objets reçus pour éviter de sauter des objets
      start += assets.length;
    }

    console.log(`\n✅ Récupération terminée: ${allAssets.length} objets de type "${objectTypeName}" récupérés du schéma "${schemaName}"`);
    return allAssets.slice(0, limit);
  } catch (error) {
    console.error(`\n❌ Erreur lors de la récupération:`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${error.response.statusText}`);
      console.error(`   Détails:`, JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error(`   Requête envoyée mais pas de réponse`);
      console.error(`   URL: ${error.config?.url}`);
    } else {
      console.error(`   ${error.message}`);
    }
    throw error;
  }
}

/**
 * Fonction principale
 */
async function main() {
  console.log('='.repeat(60));
  console.log('🧪 TEST JIRA ASSETS - Récupération par type d\'objet');
  console.log('='.repeat(60));
  console.log(`\n📝 Configuration:`);
  console.log(`   Base URL: ${baseUrlAssets}`);
  console.log(`   Base Path: ${basePathAssets || '(non défini)'}`);
  console.log(`   Email: ${emailAssets}`);
  console.log(`   Token: ${apiTokenAssets.substring(0, 20)}...`);
  
  console.log(`\n🎯 Paramètres:`);
  console.log(`   Schéma: "${schemaName}"`);
  console.log(`   Type d'objet: "${objectTypeName}"`);
  console.log(`   Limite: ${limit} objets`);
  console.log('');

  try {
    const assets = await getAllAssetsByObjectType(schemaName, objectTypeName, limit);

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
          const displayValue = attr.objectAttributeValues?.[0]?.displayValue || value;
          console.log(`   ${index + 1}. Attribute ID: ${attr.objectTypeAttributeId}`);
          console.log(`      Valeur: ${JSON.stringify(displayValue)}`);
        });
      }

      // Statistiques
      const stats = {
        avecId: assets.filter(a => a.id).length,
        avecObjectKey: assets.filter(a => a.objectKey).length,
        avecAttributes: assets.filter(a => a.attributes && a.attributes.length > 0).length,
        avecObjectType: assets.filter(a => a.objectType).length,
      };
      console.log(`\n📈 Statistiques:`);
      console.log(`   Objets avec ID: ${stats.avecId}`);
      console.log(`   Objets avec ObjectKey: ${stats.avecObjectKey}`);
      console.log(`   Objets avec attributs: ${stats.avecAttributes}`);
      console.log(`   Objets avec ObjectType: ${stats.avecObjectType}`);

      // Afficher les types d'objets uniques trouvés
      const objectTypes = [...new Set(assets.map(a => a.objectType?.name).filter(Boolean))];
      if (objectTypes.length > 0) {
        console.log(`\n📂 Types d'objets trouvés: ${objectTypes.join(', ')}`);
      }

      // Optionnel: sauvegarder dans un fichier JSON
      if (process.argv.includes('--save')) {
        const fs = require('fs');
        const filename = `jira-${schemaName.replace(/[^a-zA-Z0-9]/g, '-')}-${objectTypeName.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify(assets, null, 2));
        console.log(`\n💾 Résultats sauvegardés dans: ${filename}`);
      }
    } else {
      console.log(`\n⚠️  Aucun objet trouvé de type "${objectTypeName}" dans le schéma "${schemaName}"`);
      console.log(`   Vérifiez que le nom du schéma et du type d'objet sont corrects.`);
    }

    console.log('\n' + '='.repeat(60));
    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ÉCHEC DU TEST');
    console.error('='.repeat(60));
    process.exit(1);
  }
}

// Exécuter le script
main();

