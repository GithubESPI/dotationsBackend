const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

/**
 * Script de nettoyage massif des documents en doublon.
 * Utilise Jira comme source de vérité pour déterminer quel PC est affecté à quel utilisateur.
 * 
 * Usage: node scripts/massive-document-cleanup.js [--execute]
 */

const DRY_RUN = !process.argv.includes('--execute');
const MONGODB_URI = process.env.MONGODBURI || process.env.MONGODB_URI || 'mongodb://localhost:27017/dotation';
const JIRA_EMAIL = process.env.JIRA_EMAIL_ASSETS;
const JIRA_TOKEN = (process.env.JIRA_TOKEN_ASSETS || '').replace(/^["']|["']$/g, '');
const JIRA_BASE_URL = process.env.JIRA_BASE_URL_ASSETS;
const JIRA_BASE_PATH = process.env.JIRA_BASE_PATH_ASSETS || '';

if (!JIRA_EMAIL || !JIRA_TOKEN || !JIRA_BASE_URL) {
  console.error('❌ Configuration Jira manquante dans .env');
  process.exit(1);
}

// --- SCHEMAS MONGODB ---

const EquipmentSchema = new mongoose.Schema({
  serialNumber: String,
  jiraAssetId: String,
  brand: String,
  model: String,
  type: String,
}, { collection: 'equipment' });

const AllocationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  equipments: [{ equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' } }],
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
  status: String,
  deliveryDate: Date,
}, { collection: 'allocations' });

const DocumentSchema = new mongoose.Schema({
  documentType: String,
  allocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Allocation' },
  filename: String,
  storageUrl: String,
  createdAt: Date,
}, { collection: 'documentmodels' }); // 'documentmodels' d'après la capture

const UserSchema = new mongoose.Schema({
  email: String,
  displayName: String,
  documents: [{
    type: { type: String },
    url: String,
    name: String,
    createdAt: Date
  }]
}, { collection: 'users' });

// --- UTILS ---

function buildJiraUrl(endpoint) {
  const base = JIRA_BASE_URL.replace(/\/$/, '');
  const path = JIRA_BASE_PATH.replace(/^\/+/, '').replace(/\/+$/, '');
  return `${base}/${path}/${endpoint.replace(/^\/+/, '')}`.replace(/\/+/g, '/').replace(/https:\//, 'https://');
}

async function getAllJiraLaptops() {
  const assets = [];
  let startAt = 0;
  const maxResults = 100;
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
  
  console.log('🔍 Récupération des Laptops depuis Jira...');
  
  while (true) {
    const response = await axios.post(buildJiraUrl('object/aql'), {
      qlQuery: `objectType = "Laptop"`,
    }, {
      params: { startAt, maxResults, includeAttributes: true },
      headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
    });
    
    const values = response.data.values || [];
    assets.push(...values);
    process.stdout.write(`\r   📦 Objets récupérés: ${assets.length}...`);
    if (values.length < maxResults) break;
    startAt += maxResults;
  }
  console.log('\n✅ Récupération Jira terminée.');
  return assets;
}

// --- MAIN ---

async function run() {
  console.log('='.repeat(60));
  console.log('🧹 NETTOYAGE MASSIF DES DOCUMENTS EN DOUBLON');
  console.log(`MODE: ${DRY_RUN ? '🔍 SIMULATION (DRY RUN)' : '🚀 RÉEL (EXECUTION)'}`);
  console.log('='.repeat(60));

  let db;
  try {
    db = await mongoose.connect(MONGODB_URI);
    const Equipment = mongoose.model('Equipment', EquipmentSchema);
    const Allocation = mongoose.model('Allocation', AllocationSchema);
    const DocumentModel = mongoose.model('Document', DocumentSchema);
    const User = mongoose.model('User', UserSchema);

    // 1. Charger la vérité depuis Jira
    const jiraLaptops = await getAllJiraLaptops();
    const jiraAssignments = new Map(); // Key: normalized name/email, Value: Array of serialNumbers

    for (const laptop of jiraLaptops) {
      // Trouver l'attribut utilisateur et numéro de série
      // On cherche par labels communs car les IDs peuvent varier
      let serial = '';
      let userVal = '';
      
      for (const attr of laptop.attributes || []) {
        const val = attr.objectAttributeValues?.[0];
        if (!val) continue;
        
        // Détection heuristique simplifiée pour le script
        const label = attr.objectTypeAttribute?.name?.toLowerCase() || '';
        
        // Numéro de série
        if (!serial && (label.includes('série') || label.includes('serial') || label.includes('n/s'))) {
          serial = val.value?.toString();
        }
        
        // Utilisateur (référence ou texte)
        if (!userVal && (label.includes('user') || label.includes('utilisateur') || label.includes('owner'))) {
          if (val.referencedObject) {
            userVal = val.referencedObject.name || val.referencedObject.label;
          } else {
            userVal = val.value?.toString();
          }
        }
      }

      if (serial && userVal) {
        const key = userVal.replace(/\s+/g, '').toLowerCase();
        if (!jiraAssignments.has(key)) jiraAssignments.set(key, []);
        jiraAssignments.get(key).push(serial.trim());
      }
    }

    console.log(`\n📊 Jira: ${jiraAssignments.size} utilisateurs avec des PCs affectés identifiés.`);

    // 2. Analyser les documents MongoDB
    console.log('📦 Chargement des données MongoDB...');
    const allDocs = await DocumentModel.find({ documentType: 'dotation' }).sort({ createdAt: -1 }).exec();
    const allAllocations = await Allocation.find().exec();
    const allUsers = await User.find().exec();
    const allEquipments = await Equipment.find().exec();

    console.log(`📊 MongoDB: ${allDocs.length} documents de dotation trouvés.`);

    // --- OPTIMISATION: Création de maps pour lookup rapide ---
    const allocMap = new Map(allAllocations.map(a => [a._id.toString(), a]));
    const equipMap = new Map(allEquipments.map(e => [e._id.toString(), e]));
    
    // Grouper les documents par Allocation ID
    const docsByAlloc = new Map();
    for (const doc of allDocs) {
      const aid = doc.allocationId?.toString();
      if (!aid) continue;
      if (!docsByAlloc.has(aid)) docsByAlloc.set(aid, []);
      docsByAlloc.get(aid).push(doc);
    }

    // Grouper les allocations par User ID
    const allocsByUser = new Map();
    for (const alloc of allAllocations) {
      const uid = alloc.userId?.toString();
      if (!uid) continue;
      if (!allocsByUser.has(uid)) allocsByUser.set(uid, []);
      allocsByUser.get(uid).push(alloc);
    }

    const validDocIds = new Set();
    const toDelete = [];
    const userSummary = {};

    console.log('🔍 Analyse des doublons et des affectations Jira...');

    // Pour chaque utilisateur MongoDB
    for (const user of allUsers) {
      const userKey = (user.displayName || user.email || '').replace(/\s+/g, '').toLowerCase();
      const assignedSerials = jiraAssignments.get(userKey) || [];
      
      // Trouver les allocations de cet utilisateur
      const userAllocs = allocsByUser.get(user._id.toString()) || [];
      if (userAllocs.length === 0) continue;

      userSummary[user.displayName || user.email] = { total: 0, kept: 0, removed: 0 };

      // Stratégie: Pour chaque PC affecté dans Jira, garder le document le plus récent lié à ce PC
      const keptSerialsForThisUser = new Set();

      // On traite les allocations de la plus récente à la plus ancienne (ou chronologiquement inverse)
      for (const alloc of userAllocs.sort((a,b) => b.deliveryDate - a.deliveryDate)) {
        const docs = docsByAlloc.get(alloc._id.toString()) || [];
        if (docs.length === 0) continue;
        
        userSummary[user.displayName || user.email].total += docs.length;

        // Trouver l'équipement lié à cette allocation
        const equipmentId = alloc.equipments?.[0]?.equipmentId;
        const equipment = equipMap.get(equipmentId?.toString());
        const serial = equipment?.serialNumber;

        // Si le serial est dans la liste Jira ET qu'on ne l'a pas encore "gardé" pour cet utilisateur
        if (serial && assignedSerials.includes(serial) && !keptSerialsForThisUser.has(serial)) {
          // On garde le TOUT DERNIER document de cette allocation (le premier du tableau docs car trié par createdAt desc)
          const latestDoc = docs[0];
          validDocIds.add(latestDoc._id.toString());
          keptSerialsForThisUser.add(serial);
          userSummary[user.displayName || user.email].kept++;
          
          // Les autres documents de la même allocation sont des doublons à supprimer
          for (let k = 1; k < docs.length; k++) {
            toDelete.push(docs[k]);
            userSummary[user.displayName || user.email].removed++;
          }
        } else {
          // Sinon c'est une ancienne affectation ou un PC non listé dans les actifs Jira
          toDelete.push(...docs);
          userSummary[user.displayName || user.email].removed += docs.length;
        }
      }
    }

    // 3. Afficher les résultats
    console.log('\n🔍 RÉSULTATS DE L\'ANALYSE :');
    console.log(`   - Documents totaux: ${allDocs.length}`);
    console.log(`   - Documents à GARDER: ${validDocIds.size}`);
    console.log(`   - Documents à SUPPRIMER: ${toDelete.length}`);

    // Focus sur Didier LATOUR si présent
    const didier = Object.keys(userSummary).find(k => k.includes('LATOUR'));
    if (didier) {
      console.log(`\n📋 Détail pour ${didier}:`);
      console.log(`   - Total: ${userSummary[didier].total}`);
      console.log(`   - Gardés: ${userSummary[didier].kept}`);
      console.log(`   - Supprimés (doublons/inutiles): ${userSummary[didier].removed}`);
    }

    if (toDelete.length === 0) {
      console.log('\n✅ Aucun document superflu identifié.');
      return;
    }

    // 4. Exécution
    if (DRY_RUN) {
      console.log('\n💡 [SIMULATION] Aucun fichier n\'a été supprimé.');
      console.log('   Exécutez avec --execute pour appliquer les changements.');
    } else {
      console.log(`\n🚀 Suppression de ${toDelete.length} documents...`);
      
      const toDeleteIds = toDelete.map(d => d._id);
      
      // Suppression des documents
      const delResult = await DocumentModel.deleteMany({ _id: { $in: toDeleteIds } });
      console.log(`   ✅ ${delResult.deletedCount} entrées supprimées de DocumentModel.`);

      // Nettoyage des tableaux documents dans User
      console.log('   🧹 Nettoyage des historiques utilisateurs...');
      let userUpdated = 0;
      for (const user of allUsers) {
        // Filtrer le tableau documents pour ne garder que ceux dont l'URL n'est pas dans les docs supprimés
        // (Ou plus simple: on pourrait comparer par nom si l'URL est changeante, mais l'ID est plus sûr)
        const initialCount = user.documents.length;
        user.documents = user.documents.filter(ud => {
          // On garde si on ne trouve pas de doc supprimé avec cette URL
          return !toDelete.some(td => td.storageUrl === ud.url);
        });
        
        if (user.documents.length !== initialCount) {
          await user.save();
          userUpdated++;
        }
      }
      console.log(`   ✅ ${userUpdated} profils utilisateurs mis à jour.`);

      // Nettoyage des Allocation.documentId
      console.log('   🧹 Nettoyage des références dans les allocations...');
      const allocUpdate = await Allocation.updateMany(
        { documentId: { $in: toDeleteIds } },
        { $unset: { documentId: "" } }
      );
      console.log(`   ✅ ${allocUpdate.modifiedCount} allocations mises à jour.`);
    }

  } catch (err) {
    console.error('\n❌ Erreur:', err.message);
    if (err.response) console.error(JSON.stringify(err.response.data));
  } finally {
    if (db) await mongoose.disconnect();
    console.log('\n🔌 Déconnecté de MongoDB.');
  }
}

run();
