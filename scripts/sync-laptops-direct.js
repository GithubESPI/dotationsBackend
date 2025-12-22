require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');

/**
 * Script pour synchroniser directement les Laptops depuis Jira vers MongoDB
 * Sans passer par l'API HTTP (pas besoin de token JWT)
 * 
 * Usage: node scripts/sync-laptops-direct.js
 */

// Variables d'environnement
const MONGODB_URI = process.env.MONGODBURI || process.env.MONGODB_URI || 'mongodb://dotation:dotation_password@localhost:27017/dotation?authSource=admin';
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

// Schéma Equipment simplifié pour MongoDB (doit correspondre au schéma NestJS)
const EquipmentSchema = new mongoose.Schema({
  jiraAssetId: { type: String, sparse: true },
  internalId: String,
  type: { type: String, required: true, enum: ['PC_portable', 'PC_fixe', 'mobile', 'telephone_ip', 'ecran', 'tablette', 'autre'] },
  brand: { type: String, required: true },
  model: { type: String, required: true },
  serialNumber: { type: String, required: true, unique: true, index: true },
  imei: String,
  phoneLine: String,
  status: { type: String, default: 'disponible', enum: ['disponible', 'affecte', 'en_reparation', 'restitue', 'perdu', 'detruit'] },
  currentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  location: String,
  additionalSoftwares: [String],
  lastSync: Date,
  lastSyncedAt: Date,
}, { timestamps: true, collection: 'equipment' });

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
 * Détecter automatiquement les IDs d'attributs depuis un objet Jira Asset
 */
function detectAttributeIds(jiraAsset) {
  const mapping = {};

  for (const attr of jiraAsset.attributes || []) {
    const value = attr.objectAttributeValues?.[0];
    if (!value) continue;

    // Détecter le numéro de série
    if (!mapping.serialNumberAttrId && value.value && typeof value.value === 'string') {
      const serialPattern = /^[A-Z0-9]{4,20}$/i;
      if (serialPattern.test(value.value) && value.value.length >= 4) {
        mapping.serialNumberAttrId = attr.objectTypeAttributeId;
        continue;
      }
    }

    // Détecter la marque (référence à un objet "Constructeurs")
    if (!mapping.brandAttrId && value.referencedType && value.referencedObject) {
      const refType = value.referencedObject.objectType?.name?.toLowerCase();
      if (refType?.includes('constructeur') || refType?.includes('brand') || refType?.includes('manufacturer')) {
        mapping.brandAttrId = attr.objectTypeAttributeId;
        continue;
      }
    }

    // Détecter le modèle
    if (!mapping.modelAttrId && value.value && typeof value.value === 'string' && value.value.length > 2) {
      const modelPattern = /^(Precision|Latitude|ThinkPad|MacBook|Surface|EliteBook|ProBook)/i;
      if (modelPattern.test(value.value)) {
        mapping.modelAttrId = attr.objectTypeAttributeId;
        continue;
      }
    }

    // Détecter le statut
    if (!mapping.statusAttrId && value.status) {
      mapping.statusAttrId = attr.objectTypeAttributeId;
      continue;
    }

    // Détecter l'ID interne (format PI-XXXX)
    if (!mapping.internalIdAttrId && value.value && typeof value.value === 'string') {
      if (/^PI-\d+$/i.test(value.value)) {
        mapping.internalIdAttrId = attr.objectTypeAttributeId;
        continue;
      }
    }
  }

  return mapping;
}

/**
 * Mapper le statut Jira vers le statut Equipment
 */
function mapJiraStatusToEquipmentStatus(status) {
  if (!status) return 'disponible';
  const statusLower = status.toLowerCase();
  if (statusLower.includes('disponible') || statusLower.includes('available')) return 'disponible';
  if (statusLower.includes('affecte') || statusLower.includes('assigned')) return 'affecte';
  if (statusLower.includes('reparation') || statusLower.includes('repair')) return 'en_reparation';
  if (statusLower.includes('perdu') || statusLower.includes('lost')) return 'perdu';
  if (statusLower.includes('detruit') || statusLower.includes('destroyed')) return 'detruit';
  return 'disponible';
}

/**
 * Récupérer tous les objets d'un type d'objet spécifique dans un schéma
 */
async function getAllAssetsByObjectType(schemaName, objectTypeName, limit = 1000) {
  const allAssets = [];
  let start = 0;
  const pageSize = 100;
  const authHeader = `Basic ${Buffer.from(`${emailAssets}:${apiTokenAssets}`).toString('base64')}`;

  const searchUrl = buildAssetsUrl('object/aql');

  while (true) {
    const aqlBody = {
      qlQuery: `objectSchema = "${schemaName}" AND objectType = "${objectTypeName}"`,
      start,
      limit: pageSize,
    };

    const response = await axios.post(searchUrl, aqlBody, {
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    const assets = response.data.values || [];
    const totalSize = response.data.size || 0;
    allAssets.push(...assets);

    const pageNum = Math.floor(start / pageSize) + 1;
    console.log(`   📦 Page ${pageNum}: ${assets.length} objets récupérés (total: ${allAssets.length}${totalSize > 0 ? `/${totalSize}` : ''})`);

    const hasMore = assets.length > 0 && 
      (totalSize === 0 || allAssets.length < totalSize) && 
      allAssets.length < limit;

    if (!hasMore) break;
    start += assets.length;
  }

  return allAssets.slice(0, limit);
}

/**
 * Extraire la valeur d'un attribut
 */
function getAttributeValue(attributes, attributeId) {
  if (!attributeId) return undefined;
  const attr = attributes.find(a => a.objectTypeAttributeId === attributeId);
  const value = attr?.objectAttributeValues?.[0];
  if (!value) return undefined;
  
  // Si c'est une référence, retourner le nom de l'objet référencé
  if (value.referencedType && value.referencedObject) {
    return value.referencedObject.name || value.referencedObject.label || value.displayValue;
  }
  
  return value.value?.toString();
}

/**
 * Fonction principale de synchronisation
 */
async function syncLaptops() {
  console.log('='.repeat(60));
  console.log('🔄 SYNCHRONISATION DIRECTE DES LAPTOPS JIRA → MONGODB');
  console.log('='.repeat(60));
  console.log(`\n📝 Configuration:`);
  console.log(`   MongoDB: ${MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`);
  console.log(`   Jira Base URL: ${baseUrlAssets}`);
  console.log(`   Email: ${emailAssets}`);
  console.log(`   Token: ${apiTokenAssets.substring(0, 20)}...`);
  console.log('');

  let db = null;
  let EquipmentModel = null;

  try {
    // Connexion à MongoDB
    console.log('🔌 Connexion à MongoDB...');
    db = await mongoose.connect(MONGODB_URI);
    console.log('✅ Connecté à MongoDB');

    EquipmentModel = mongoose.model('Equipment', EquipmentSchema);

    // Récupérer tous les Laptops depuis Jira
    console.log(`\n🔍 Récupération des Laptops depuis Jira...`);
    const jiraAssets = await getAllAssetsByObjectType('Parc Informatique', 'Laptop', 1000);
    console.log(`✅ ${jiraAssets.length} Laptops récupérés depuis Jira\n`);

    if (jiraAssets.length === 0) {
      console.log('⚠️  Aucun Laptop trouvé dans Jira');
      process.exit(0);
    }

    // Détecter les attributs depuis le premier objet
    console.log('🔍 Détection automatique des attributs...');
    const attributeMapping = detectAttributeIds(jiraAssets[0]);
    console.log('✅ Attributs détectés:');
    console.log(JSON.stringify(attributeMapping, null, 2));
    console.log('');

    // Vérifier combien d'équipements existent déjà dans MongoDB
    const existingCount = await EquipmentModel.countDocuments({ type: 'PC_portable' }).exec();
    console.log(`\n📊 Équipements PC_portable existants dans MongoDB: ${existingCount}`);

    // Synchroniser chaque Laptop
    const results = { created: 0, updated: 0, skipped: 0, errors: 0, skippedNoSerial: 0, skippedDuplicate: 0 };
    const batchSize = 50;
    const skippedDetails = [];

    for (let i = 0; i < jiraAssets.length; i += batchSize) {
      const batch = jiraAssets.slice(i, i + batchSize);
      
      for (const jiraAsset of batch) {
        try {
          const serialNumber = getAttributeValue(jiraAsset.attributes, attributeMapping.serialNumberAttrId);
          
          if (!serialNumber || serialNumber.trim() === '') {
            results.skipped++;
            results.skippedNoSerial++;
            skippedDetails.push({ assetId: jiraAsset.id, reason: 'Numéro de série manquant' });
            continue;
          }

          const brand = getAttributeValue(jiraAsset.attributes, attributeMapping.brandAttrId) || 'Inconnu';
          const model = getAttributeValue(jiraAsset.attributes, attributeMapping.modelAttrId) || 'Inconnu';
          const status = getAttributeValue(jiraAsset.attributes, attributeMapping.statusAttrId);
          const internalId = getAttributeValue(jiraAsset.attributes, attributeMapping.internalIdAttrId);

          const equipmentData = {
            jiraAssetId: jiraAsset.id,
            serialNumber: serialNumber.trim(),
            brand,
            model,
            type: 'PC_portable',
            status: mapJiraStatusToEquipmentStatus(status),
            lastSyncedAt: new Date(),
          };

          if (internalId) {
            equipmentData.internalId = internalId;
          }

          // Chercher l'équipement existant - d'abord par jiraAssetId, puis par serialNumber
          let existing = await EquipmentModel.findOne({
            jiraAssetId: jiraAsset.id.toString(),
          }).exec();

          // Si pas trouvé par jiraAssetId, chercher par serialNumber
          if (!existing) {
            existing = await EquipmentModel.findOne({
              serialNumber: serialNumber.trim(),
              type: 'PC_portable', // S'assurer que c'est bien un PC_portable
            }).exec();
          }

          // Debug: log les premiers cas pour comprendre
          if (results.created + results.updated < 5 && !existing) {
            console.log(`   🔍 Debug: Asset ${jiraAsset.id} - Serial: ${serialNumber.trim()} - Pas trouvé, création...`);
          }

          if (existing) {
            // Mettre à jour l'équipement existant avec les nouvelles données de Jira
            const hasChanges = existing.jiraAssetId !== jiraAsset.id.toString() || 
                              existing.serialNumber !== serialNumber.trim() ||
                              existing.brand !== brand ||
                              existing.model !== model ||
                              existing.status !== mapJiraStatusToEquipmentStatus(status) ||
                              (internalId && existing.internalId !== internalId);
            
            if (hasChanges) {
              Object.assign(existing, equipmentData);
              await existing.save();
              results.updated++;
            } else {
              // Pas de changement nécessaire - déjà synchronisé
              results.skippedDuplicate++;
            }
          } else {
            // Créer un nouvel équipement
            try {
              await EquipmentModel.create(equipmentData);
              results.created++;
            } catch (createError) {
              if (createError.code === 11000) {
                // Erreur de duplication (unique constraint sur serialNumber)
                // Cela signifie qu'un équipement avec ce serialNumber existe mais n'a pas été trouvé par la requête
                // Peut-être qu'il n'est pas de type PC_portable
                results.skippedDuplicate++;
                skippedDetails.push({ assetId: jiraAsset.id, serialNumber, reason: 'Numéro de série déjà existant (peut-être autre type)' });
              } else {
                results.errors++;
                console.error(`   ❌ Erreur lors de la création de l'asset ${jiraAsset.id}: ${createError.message}`);
              }
            }
          }
        } catch (error) {
          results.errors++;
          console.error(`   ❌ Erreur pour asset ${jiraAsset.id}: ${error.message}`);
          if (error.code === 11000) {
            // Erreur de duplication (unique constraint)
            results.skippedDuplicate++;
            skippedDetails.push({ assetId: jiraAsset.id, reason: `Duplicata: ${error.message}` });
          }
        }
      }

      if ((i + batchSize) % 100 === 0 || i + batchSize >= jiraAssets.length) {
        console.log(`   📊 Progression: ${Math.min(i + batchSize, jiraAssets.length)}/${jiraAssets.length} traités (${results.created} créés, ${results.updated} mis à jour)`);
      }
    }

    // Compter les équipements finaux dans MongoDB
    const finalCount = await EquipmentModel.countDocuments({ type: 'PC_portable' }).exec();
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 RÉSULTATS DÉTAILLÉS');
    console.log('='.repeat(60));
    console.log(`\n✅ Total d'objets Jira traités: ${jiraAssets.length}`);
    console.log(`   ✅ Créés: ${results.created}`);
    console.log(`   🔄 Mis à jour: ${results.updated}`);
    console.log(`   ⏭️  Ignorés (sans numéro de série): ${results.skippedNoSerial}`);
    console.log(`   🔁 Doublons détectés: ${results.skippedDuplicate}`);
    console.log(`   ❌ Erreurs: ${results.errors}`);
    console.log(`\n📊 État MongoDB:`);
    console.log(`   Avant: ${existingCount} équipements PC_portable`);
    console.log(`   Après: ${finalCount} équipements PC_portable`);
    console.log(`   Différence: ${finalCount - existingCount} équipements`);
    
    if (results.skippedNoSerial > 0) {
      console.log(`\n⚠️  ${results.skippedNoSerial} équipements ignorés car sans numéro de série`);
      if (skippedDetails.length > 0 && skippedDetails.length <= 10) {
        console.log(`   Détails:`, skippedDetails.slice(0, 10).map(d => `Asset ${d.assetId}: ${d.reason}`).join(', '));
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ SYNCHRONISATION TERMINÉE');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ERREUR');
    console.error('='.repeat(60));
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack:', error.stack);
    }
    process.exit(1);
  } finally {
    if (db) {
      await mongoose.disconnect();
      console.log('\n🔌 Déconnecté de MongoDB');
    }
  }
}

// Exécuter la synchronisation
syncLaptops();

