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

async function inspectAttributes() {
  try {
    const response = await axios.get(`${fullUrl}/objecttype/${objectTypeId}/attributes`, { headers });
    response.data.forEach(attr => {
      console.log(`${attr.id}:${attr.name}`);
    });
  } catch (error) {
    console.error("Error:", error.message);
  }
}

inspectAttributes();
