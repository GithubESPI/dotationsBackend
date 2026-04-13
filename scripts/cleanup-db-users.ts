import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { UserSchema } from '../src/database/schemas/user.schema';
import { AllocationSchema } from '../src/database/schemas/allocation.schema';
import { ReturnSchema } from '../src/database/schemas/return.schema';

dotenv.config();

const DRY_RUN = !process.argv.includes('--execute');
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODBURI || 'mongodb://localhost:27017/dotation';

async function mergeUsers(UserModel: any, AllocationModel: any, ReturnModel: any, ids: any[]) {
  // Trier les utilisateurs par date de dernière synchro ou création
  const users = await UserModel.find({ _id: { $in: ids } }).sort({ lastSync: -1, createdAt: -1 });
  
  if (users.length < 2) return;

  const [primary, ...toMerge] = users;
  console.log(`   ✅ Garde le compte principal: ${primary._id} (${primary.email})`);

  for (const secondary of toMerge) {
    console.log(`   🧹 Fusion du compte secondaire: ${secondary._id} (${secondary.email})`);
    
    if (primary._id.toString() === secondary._id.toString()) continue;

    // 1. Déplacer les allocations
    if (DRY_RUN) {
      console.log(`      [DRY RUN] Déplacerait les allocations.`);
    } else {
      const allocResult = await AllocationModel.updateMany(
        { userId: secondary._id },
        { $set: { userId: primary._id } }
      );
      if (allocResult.modifiedCount > 0) {
        console.log(`      📦 ${allocResult.modifiedCount} allocations transférées.`);
      }
    }

    // 2. Déplacer les restitutions
    if (DRY_RUN) {
      console.log(`      [DRY RUN] Déplacerait les restitutions.`);
    } else {
      const returnResult = await ReturnModel.updateMany(
        { userId: secondary._id },
        { $set: { userId: primary._id } }
      );
      if (returnResult.modifiedCount > 0) {
        console.log(`      ↩️ ${returnResult.modifiedCount} restitutions transférées.`);
      }
    }

    // 3. Fusionner les documents dans le profil
    if (secondary.documents && secondary.documents.length > 0) {
      if (DRY_RUN) {
        console.log(`      [DRY RUN] Fusionnerait ${secondary.documents.length} documents.`);
      } else {
        await UserModel.findByIdAndUpdate(primary._id, {
          $addToSet: { documents: { $each: secondary.documents } }
        });
        console.log(`      📄 ${secondary.documents.length} documents fusionnés dans l'historique.`);
      }
    }

    // 4. Supprimer le compte secondaire
    if (DRY_RUN) {
      console.log(`      [DRY RUN] Supprimerait le compte secondaire.`);
    } else {
      await UserModel.findByIdAndDelete(secondary._id);
      console.log(`      ❌ Compte secondaire supprimé.`);
    }
  }
}

async function cleanup() {
  console.log('='.repeat(60));
  console.log('🧹 NETTOYAGE DES DOUBLONS MONGODB (Users)');
  console.log(`MODE: ${DRY_RUN ? '🔍 SIMULATION (DRY RUN)' : '🚀 RÉEL (EXECUTION)'}`);
  console.log('='.repeat(60));

  console.log('🔄 Connexion à MongoDB...');
  await mongoose.connect(MONGODB_URI);
  
  const UserModel = mongoose.model('User', UserSchema);
  const AllocationModel = mongoose.model('Allocation', AllocationSchema);
  const ReturnModel = mongoose.model('Return', ReturnSchema);

  console.log('🔍 Recherche des doublons (Email insensible à la casse)...');
  const emailDuplicates = await UserModel.aggregate([
    { $group: { 
        _id: { $toLower: '$email' }, 
        count: { $sum: 1 }, 
        ids: { $push: '$_id' },
        emails: { $addToSet: '$email' }
    } },
    { $match: { count: { $gt: 1 } } }
  ]);

  console.log(`📊 ${emailDuplicates.length} groupes de doublons par email trouvés.`);
  for (const group of emailDuplicates) {
    console.log(`\n📧 Email: ${group._id}`);
    await mergeUsers(UserModel, AllocationModel, ReturnModel, group.ids);
  }

  console.log('\n🔍 Recherche des doublons par Nom (Exact)...');
  const nameDuplicates = await UserModel.aggregate([
    { $group: { 
        _id: '$displayName', 
        count: { $sum: 1 }, 
        ids: { $push: '$_id' } 
    } },
    { $match: { count: { $gt: 1 }, _id: { $nin: [null, ''] } } }
  ]);

  console.log(`📊 ${nameDuplicates.length} groupes de doublons par nom trouvés.`);
  for (const group of nameDuplicates) {
    console.log(`\n👤 Nom: ${group._id}`);
    await mergeUsers(UserModel, AllocationModel, ReturnModel, group.ids);
  }

  console.log('\n✅ Script terminé.');
  await mongoose.disconnect();
}

cleanup().catch(err => {
  console.error('💥 Erreur:', err);
  process.exit(1);
});
