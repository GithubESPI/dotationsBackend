require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dotation';

async function verifyAttributes() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const equipmentSchema = new mongoose.Schema({
            jiraAttributes: Object,
            serialNumber: String,
            type: String
        }, { collection: 'equipment', strict: false });

        const Equipment = mongoose.model('Equipment', equipmentSchema);

        // Find one item where jiraAttributes exists and is not empty
        const item = await Equipment.findOne({
            jiraAttributes: { $exists: true, $ne: {} }
        }).lean();

        if (item) {
            console.log('✅ Found item with jiraAttributes:');
            console.log(`Type: ${item.type}, Serial: ${item.serialNumber}`);
            console.log('Attributes sample:', JSON.stringify(item.jiraAttributes, null, 2));
        } else {
            console.log('❌ No item found with populated jiraAttributes');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

verifyAttributes();
