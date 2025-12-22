require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODBURI || process.env.MONGODB_URI || 'mongodb://dotation:dotation_password@localhost:27017/dotation?authSource=admin';

async function check() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  
  const total = await db.collection('equipment').countDocuments();
  const laptopCount = await db.collection('equipment').countDocuments({ type: 'PC_portable' });
  
  console.log('Total équipements:', total);
  console.log('PC_portable:', laptopCount);
  
  const types = await db.collection('equipment').aggregate([
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]).toArray();
  
  console.log('\nTypes d\'équipements:');
  types.forEach(t => console.log(`  ${t._id}: ${t.count}`));
  
  const sample = await db.collection('equipment').findOne({});
  if (sample) {
    console.log('\nExemple d\'équipement:');
    console.log(JSON.stringify({
      _id: sample._id,
      type: sample.type,
      brand: sample.brand,
      model: sample.model,
      serialNumber: sample.serialNumber,
      jiraAssetId: sample.jiraAssetId,
    }, null, 2));
  }
  
  await mongoose.disconnect();
}

check().catch(console.error);

