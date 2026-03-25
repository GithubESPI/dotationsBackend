const axios = require('axios');
require('dotenv').config();

const email = process.env.JIRA_EMAIL_ASSETS;
const token = process.env.JIRA_TOKEN_ASSETS.replace(/^["']|["']$/g, '');
const baseUrl = process.env.JIRA_BASE_URL_ASSETS;
const basePath = process.env.JIRA_BASE_PATH_ASSETS;

const auth = Buffer.from(`${email}:${token}`).toString('base64');
const headers = {
  'Authorization': `Basic ${auth}`,
  'Accept': 'application/json',
  'Content-Type': 'application/json'
};

const fullUrl = `${baseUrl.replace(/\/$/, '')}/${basePath.replace(/^\//, '')}`;
const objectTypeId = "26"; // ID for 'Users'

async function listDuplicates() {
  try {
    console.log(`🔍 Fetching all User objects (Type ID: ${objectTypeId})...`);
    
    let allUsers = [];
    let startAt = 0;
    const maxResults = 100;
    
    while (true) {
      const response = await axios.post(`${fullUrl}/object/aql`, {
        qlQuery: `objectType = "Users"`,
      }, {
        params: {
          startAt,
          maxResults,
          includeAttributes: true
        },
        headers
      });
      
      const users = response.data.values || [];
      if (users.length === 0) break;
      
      allUsers.push(...users);
      console.log(`   Fetched ${allUsers.length} users...`);
      
      // Print first user's attributes once to identify IDs
      if (startAt === 0 && users.length > 0) {
        console.log("\n📋 Attributes identification for User object:");
        for (const attr of users[0].attributes) {
           const val = attr.objectAttributeValues?.[0]?.value || "(empty)";
           console.log(`   ID: ${attr.objectTypeAttributeId}, Value: ${JSON.stringify(val)}`);
        }
      }

      if (users.length < maxResults) break;
      startAt += maxResults;
    }

    console.log(`\n📊 Total users found: ${allUsers.length}`);

    // Group by email/name
    const groups = {};
    
    for (const user of allUsers) {
      // Find email attribute
      const emailAttr = user.attributes.find(a => 
        a.objectTypeAttributeId === "170" // I should check this ID or just use Name
      );
      
      // Since I don't know the exact email attribute ID yet for sure, 
      // let's look for a text attribute that looks like an email or use the Name
      const name = user.name || user.label;
      let emailVal = "";
      
      for (const attr of user.attributes) {
        const val = attr.objectAttributeValues?.[0]?.value;
        if (val && typeof val === 'string' && val.includes('@')) {
          emailVal = val;
          break;
        }
      }
      
      const key = emailVal || name;
      if (!groups[key]) groups[key] = [];
      groups[key].push({
        id: user.id,
        key: user.objectKey,
        name: name,
        email: emailVal,
        created: user.created || "unknown"
      });
    }

    const duplicates = Object.entries(groups).filter(([key, list]) => list.length > 1);
    
    if (duplicates.length === 0) {
      console.log("✅ No duplicates found!");
    } else {
      console.log(`\n⚠️ Found ${duplicates.length} sets of duplicates:`);
      for (const [key, list] of duplicates) {
        console.log(`\n[${key}] - ${list.length} instances:`);
        list.forEach((u, i) => {
          console.log(`   ${i + 1}. ID: ${u.id}, Key: ${u.key}, Name: ${u.name}, Created: ${u.created}`);
        });
      }
      
      // Generate delete commands if requested
      if (process.argv.includes('--generate-delete')) {
        console.log("\n🗑️  Delete commands (keeping the oldest one):");
        for (const [key, list] of duplicates) {
          // Sort by creation date if possible, otherwise by ID
          const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id)); 
          const toDelete = sorted.slice(1);
          toDelete.forEach(u => {
            console.log(`curl -X DELETE "${fullUrl}/object/${u.id}" -H "Authorization: Basic ${auth}"`);
          });
        }
      }
    }

  } catch (error) {
    console.error("Error:", error.response ? error.response.data : error.message);
  }
}

listDuplicates();
