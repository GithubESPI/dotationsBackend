require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

// Config
const email = process.env.JIRA_EMAIL_ASSETS;
const token = process.env.JIRA_TOKEN_ASSETS?.replace(/^["']|["']$/g, '');
const baseUrl = process.env.JIRA_BASE_URL_ASSETS;
const basePath = process.env.JIRA_BASE_PATH_ASSETS;

const fullUrl = `${baseUrl.replace(/\/$/, '')}/${basePath.replace(/^\//, '')}`;
const auth = Buffer.from(`${email}:${token}`).toString('base64');
const headers = {
  'Authorization': `Basic ${auth}`,
  'Accept': 'application/json',
  'Content-Type': 'application/json'
};

async function audit() {
  const allUsers = [];
  const maxResults = 100;
  let startAt = 0;

  console.log('🔍 Audit des utilisateurs Jira (via AQL) ...');

  while (true) {
    try {
      const response = await axios.post(`${fullUrl}/object/aql`, {
        qlQuery: `objectType = "Users"`,
      }, {
        params: { startAt, maxResults, includeAttributes: true },
        headers
      });

      const users = response.data.values || [];
      if (users.length === 0) break;
      
      allUsers.push(...users);
      console.log(`📦 Récupéré: ${allUsers.length} utilisateurs...`);
      
      if (users.length < maxResults) break;
      startAt += maxResults;
    } catch (error) {
      console.error('❌ Erreur:', error.message);
      break;
    }
  }

  console.log(`✅ Total récupéré: ${allUsers.length}`);

  const groups = {};
  allUsers.forEach(user => {
    // Normalisation du nom pour un matching plus souple
    const nameOrig = user.name || user.label || 'Inconnu';
    const name = nameOrig.trim().toLowerCase();
    
    let emailVal = "";
    for (const attr of user.attributes) {
      const val = attr.objectAttributeValues?.[0]?.value;
      if (val && typeof val === 'string' && val.includes('@')) {
        emailVal = val.trim().toLowerCase();
        break;
      }
    }

    const key = emailVal || name;
    if (!groups[key]) groups[key] = [];
    groups[key].push({
      id: user.id,
      key: user.objectKey,
      name: nameOrig,
      email: emailVal,
      created: user.created
    });
  });

  const report = {
    total: allUsers.length,
    uniqueCount: Object.keys(groups).length,
    duplicates: Object.entries(groups)
      .filter(([k, g]) => g.length > 1)
      .map(([k, g]) => ({ key: k, count: g.length, items: g }))
  };

  fs.writeFileSync('scripts/audit-results.json', JSON.stringify(report, null, 2));
  console.log(`📊 Rapport généré: scripts/audit-results.json`);
  console.log(`👥 Utilisateurs uniques (par clé): ${report.uniqueCount}`);
  console.log(`⚠️ Groupes avec doublons: ${report.duplicates.length}`);
  
  if (report.total > 0) {
      console.log(`\nExemple des 5 premiers utilisateurs:`);
      allUsers.slice(0, 5).forEach(u => console.log(`- ${u.objectKey}: ${u.name} (${u.id})`));
  }
}

audit();
