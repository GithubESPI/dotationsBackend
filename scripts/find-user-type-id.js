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

async function getObjectTypes() {
  try {
    // 1. Get Schema ID for "Parc Informatique"
    const schemasResponse = await axios.get(`${fullUrl}/objectschema/list`, { headers });
    const schema = schemasResponse.data.values.find(s => s.name === "Parc Informatique");
    if (!schema) {
      console.error("Schema 'Parc Informatique' not found");
      return;
    }
    console.log(`Schema ID: ${schema.id}`);

    // 2. Get Object Types for this schema
    const typesResponse = await axios.get(`${fullUrl}/objectschema/${schema.id}/objecttypes`, { headers });
    const userType = typesResponse.data.find(t => t.name === "Users");
    if (userType) {
      console.log(`User Object Type ID: ${userType.id}`);
    } else {
      console.log("Object Type 'Users' not found");
      console.log("Available types:", typesResponse.data.map(t => t.name).join(", "));
    }
  } catch (error) {
    console.error("Error:", error.response ? error.response.data : error.message);
  }
}

getObjectTypes();
