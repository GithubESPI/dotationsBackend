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

const searchUrl = `${baseUrl.replace(/\/$/, '')}/${basePath.replace(/^\//, '')}/object/aql`;

async function testQuery() {
  try {
    let startAt = 0;
    const pageSize = 100;
    const body = { qlQuery: `objectType = "Users"`, maxResults: pageSize, startAt, includeAttributes: true };
    console.log("Requesting:", searchUrl, "Body:", body);
    
    const response = await axios.post(searchUrl, body, { headers });
    
    console.log("Total received values:", response.data.values ? response.data.values.length : 0);
    console.log("First user:", response.data.values && response.data.values.length > 0 ? JSON.stringify({
      id: response.data.values[0].id,
      label: response.data.values[0].label,
      attributes: response.data.values[0].attributes.slice(0, 3).map(a => ({ id: a.objectTypeAttributeId, vals: a.objectAttributeValues }))
    }, null, 2) : "None");
    
  } catch (error) {
    console.error("Error:", error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

testQuery();
