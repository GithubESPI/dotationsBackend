const axios = require('axios');
require('dotenv').config();

const email = process.env.JIRA_EMAIL_ASSETS;
const token = process.env.JIRA_TOKEN_ASSETS.replace(/^["']|["']$/g, '');
const auth = Buffer.from(`${email}:${token}`).toString('base64');
const baseUrl = process.env.JIRA_BASE_URL_ASSETS.replace(/\/$/, '');
const basePath = process.env.JIRA_BASE_PATH_ASSETS.replace(/^\//, '');

axios.post(`${baseUrl}/${basePath}/object/aql`, {
  qlQuery: 'objectType = "Users"',
  maxResults: 5,
  includeAttributes: true
}, {
  headers: { Authorization: `Basic ${auth}` }
}).then(r => {
  const data = r.data.values.map(v => ({
    id: v.id,
    label: v.label,
    attrs: v.attributes.map(a => ({
      attrId: a.objectTypeAttributeId,
      val: a.objectAttributeValues[0]?.value
    }))
  }));
  require('fs').writeFileSync('debug-jira.json', JSON.stringify(data, null, 2));
  console.log('done');
}).catch(console.error);
