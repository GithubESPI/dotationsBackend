const mongoose = require('mongoose');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();

const DRY_RUN = process.argv.includes('--dry-run');
const MONGODB_URI = process.env.MONGODBURI || process.env.MONGODB_URI;
const AZURE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = 'dotationdoc';

const DocumentSchema = new mongoose.Schema({
  documentType: String,
  allocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Allocation' },
  filename: String,
  storageUrl: String,
  createdAt: Date,
}, { collection: 'documentmodels' });

const AllocationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  equipments: [{ equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' } }],
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
  status: String,
  deliveryDate: Date,
}, { collection: 'allocations' });

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

async function run() {
  console.log('='.repeat(60));
  console.log('🛡️ RESTAURATION ET NETTOYAGE CONSOLIDÉ DES DOUBLONS');
  console.log(`MODE: ${DRY_RUN ? '🔍 SIMULATION' : '🚀 EXECUTION'}`);
  console.log('='.repeat(60));

  let db;
  try {
    db = await mongoose.connect(MONGODB_URI);
    const DocumentModel = mongoose.model('Document', DocumentSchema);
    const Allocation = mongoose.model('Allocation', AllocationSchema);
    const User = mongoose.model('User', UserSchema);

    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

    console.log('📥 Récupération des fichiers depuis Azure...');
    const blobs = [];
    for await (const blob of containerClient.listBlobsFlat()) {
      blobs.push(blob);
    }
    console.log(`✅ ${blobs.length} fichiers trouvés dans Azure.`);

    // Pattern: dotation_ALLOCID_TIMESTAMP.pdf
    const blobsByAllocationId = new Map();
    const allAllocIds = new Set();
    const blobsToDelete = [];

    // Grouper les blobs par allocation ID
    for (const blob of blobs) {
      if (typeof blob.name === 'string') {
        const match = blob.name.match(/dotation_([a-f0-9]{24})_/);
        if (match) {
          const allocId = match[1];
          if (!blobsByAllocationId.has(allocId)) blobsByAllocationId.set(allocId, []);
          blobsByAllocationId.get(allocId).push(blob);
          allAllocIds.add(allocId);
        } else {
            console.log("Blob non reconnu:", blob.name);
        }
      }
    }

    console.log(`📊 ${blobsByAllocationId.size} allocations identifiées depuis les fichiers.`);

    // Mais attention : on a aussi des allocations EN DOUBLE pour le MEME equipement !
    // On doit grouper les allocations par équipement + utilisateur pour garder uniquement la plus récente.
    console.log('📥 Récupération des Allocations depuis MongoDB...');
    const allAllocations = await Allocation.find().lean();
    
    // Grouper les allocations par (userId_equipmentId)
    const allocGroups = new Map();
    for (const alloc of allAllocations) {
        if (!alloc.userId || !alloc.equipments || alloc.equipments.length === 0) continue;
        const eqId = alloc.equipments[0].equipmentId?.toString();
        if (!eqId) continue;
        const uId = alloc.userId.toString();
        const key = `${uId}_${eqId}_${alloc.status || 'Active'}`; // on groupe par status aussi

        if (!allocGroups.has(key)) allocGroups.set(key, []);
        allocGroups.get(key).push(alloc);
    }

    const allocationsToKeep = new Set();
    const allocationsToDelete = new Set(); // Duplicates

    for (const [key, group] of allocGroups.entries()) {
        // Trier par date: on garde l'allocation la plus récente
        group.sort((a, b) => new Date(b.deliveryDate || 0) - new Date(a.deliveryDate || 0));
        
        allocationsToKeep.add(group[0]._id.toString());
        
        for (let i = 1; i < group.length; i++) {
            allocationsToDelete.add(group[i]._id.toString());
        }
    }
    
    console.log(`📊 Allocations à garder (uniques): ${allocationsToKeep.size}`);
    console.log(`📊 Allocations à supprimer (doublons): ${allocationsToDelete.size}`);

    const newDocsToInsert = [];
    let restoredCount = 0;

    // Traiter les blobs: pour chaque allocation conservée, on garde SEULEMENT son document le plus récent
    for (const allocId of allAllocIds) {
        const allocBlobs = blobsByAllocationId.get(allocId) || [];
        
        if (allocationsToDelete.has(allocId)) {
            // Cette allocation est un doublon supprimé -> TOUT supprimer dans Azure
            blobsToDelete.push(...allocBlobs);
            continue;
        }

        if (allocationsToKeep.has(allocId)) {
            // Trier les blobs chronologiquement: on garde le plus récent
            allocBlobs.sort((a, b) => new Date(b.properties.createdOn) - new Date(a.properties.createdOn));
            
            const keepBlob = allocBlobs[0];
            const url = containerClient.url + '/' + keepBlob.name;
            
            // Recréer le DocumentModel !
            newDocsToInsert.push({
                documentType: 'dotation',
                allocationId: mongoose.Types.ObjectId.createFromHexString(allocId),
                filename: keepBlob.name,
                storageUrl: url,
                createdAt: keepBlob.properties.createdOn || new Date()
            });
            restoredCount++;

            // Les autres versions générées = à supprimer
            for (let i = 1; i < allocBlobs.length; i++) {
                blobsToDelete.push(allocBlobs[i]);
            }
        } else {
             // Si l'allocation n'existe même plus en base (orphelin)
             blobsToDelete.push(...allocBlobs);
        }
    }

    console.log(`\n🔍 Bilan Final:`);
    console.log(`   - Documents à RESTAURER: ${newDocsToInsert.length}`);
    console.log(`   - Fichiers Azure à SUPPRIMER (orphelins/doublons): ${blobsToDelete.length}`);
    console.log(`   - Allocations MongoDB à SUPPRIMER (doublons): ${allocationsToDelete.size}`);

    if (DRY_RUN) {
        console.log('\n💡 [DRY RUN] Aucun changement appliqué.');
    } else {
        console.log('\n🚀 1. Nettoyage de DocumentModels (suppression de l\'existant)...');
        // Vider DocumentModels en préparation de la restauration propre
        await DocumentModel.deleteMany({});
        
        console.log('\n🚀 2. Restauration de DocumentModels (documents propres uniquement)...');
        if (newDocsToInsert.length > 0) {
            const inserted = await DocumentModel.insertMany(newDocsToInsert);
            console.log(`   ✅ ${inserted.length} DocumentModels insérés.`);
            
            // Lier les nouveaux DocumentModels à leurs Allocations
            const docMap = new Map(inserted.map(d => [d.allocationId.toString(), d._id]));
            let allocUpdateCount = 0;
            const bulkOps = [];
            for (const allocId of allocationsToKeep) {
                const docId = docMap.get(allocId);
                if (docId) {
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: mongoose.Types.ObjectId.createFromHexString(allocId) },
                            update: { $set: { documentId: docId } }
                        }
                    });
                    allocUpdateCount++;
                }
            }
            if (bulkOps.length > 0) {
                await Allocation.bulkWrite(bulkOps);
                console.log(`   ✅ ${allocUpdateCount} Allocations reliées à leur nouveau DocumentModel.`);
            }

            // Nettoyer et restaurer les historiques Users !
            console.log('\n🚀 3. Restauration des historiques de documents Utilisateurs...');
            const allUsersToUpdate = await User.find({}).exec();
            let userUpdateCount = 0;

            // Pré-indexer les allocations à conserver par utilisateur, complexité O(N)
            const keepAllocsByUser = new Map();
            for (const a of allAllocations) {
                const aIdStr = a._id.toString();
                if (allocationsToKeep.has(aIdStr)) {
                    const uIdStr = a.userId?.toString();
                    if (uIdStr) {
                        if (!keepAllocsByUser.has(uIdStr)) keepAllocsByUser.set(uIdStr, []);
                        keepAllocsByUser.get(uIdStr).push(a);
                    }
                }
            }

            const bulkUserOps = [];
            for (const user of allUsersToUpdate) {
                const userAllocs = keepAllocsByUser.get(user._id.toString()) || [];
                
                const validUserDocs = [];
                for (const a of userAllocs) {
                    const docInfo = newDocsToInsert.find(d => d.allocationId.toString() === a._id.toString());
                    if (docInfo) {
                        validUserDocs.push({
                            type: 'dotation',
                            name: docInfo.filename,
                            url: docInfo.storageUrl,
                            createdAt: docInfo.createdAt
                        });
                    }
                }
                
                bulkUserOps.push({
                    updateOne: {
                        filter: { _id: user._id },
                        update: { $set: { documents: validUserDocs } }
                    }
                });
                userUpdateCount++;
            }
            if (bulkUserOps.length > 0) {
                await User.bulkWrite(bulkUserOps);
            }
            console.log(`   ✅ ${userUpdateCount} profils Users mis à jour.`);
        }

        console.log('\n🚀 4. Suppression des Allocations dupliquées dans MongoDB...');
        if (allocationsToDelete.size > 0) {
            const result = await Allocation.deleteMany({
                _id: { $in: Array.from(allocationsToDelete).map(id => mongoose.Types.ObjectId.createFromHexString(id)) }
            });
            console.log(`   ✅ ${result.deletedCount} Allocations en double supprimées.`);
        }

        console.log(`\n🚀 5. Suppressions Physiques Azure (${blobsToDelete.length} fichiers)...`);
        let deleteCount = 0;
        let errors = 0;
        const PARALLEL = 50;
        for (let i = 0; i < blobsToDelete.length; i += PARALLEL) {
            const batch = blobsToDelete.slice(i, i + PARALLEL);
            await Promise.all(batch.map(async (blob) => {
                try {
                    const blobClient = containerClient.getBlobClient(blob.name);
                    await blobClient.delete();
                    deleteCount++;
                } catch (e) {
                    errors++;
                }
            }));
            process.stdout.write(`\r   📦 Blob supprimés: ${deleteCount}/${blobsToDelete.length}...`);
        }
        console.log(`\n   ✅ Azure propre ! (${errors} erreurs).`);
        
        console.log('\n🎉 RECONSTRUCTION ET NETTOYAGE TERMINÉS AVEC SUCCÈS.');
    }

  } catch (err) {
    console.error('\n❌ Erreur Fatale:', err.message);
  } finally {
    if (db) await mongoose.disconnect();
    console.log('🔌 Déconnecté de MongoDB.');
  }
}

run();
