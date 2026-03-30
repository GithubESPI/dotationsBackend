const axios = require('axios');
require('dotenv').config();

// Configuration Jira Assets
const email = process.env.JIRA_EMAIL_ASSETS;
const token = process.env.JIRA_TOKEN_ASSETS?.replace(/^["']|["']$/g, '');
const baseUrl = process.env.JIRA_BASE_URL_ASSETS;
const basePath = process.env.JIRA_BASE_PATH_ASSETS;

if (!email || !token || !baseUrl) {
  console.error("❌ Configuration Jira manquante dans .env");
  process.exit(1);
}

const auth = Buffer.from(`${email}:${token}`).toString('base64');
const headers = {
  'Authorization': `Basic ${auth}`,
  'Accept': 'application/json',
  'Content-Type': 'application/json'
};

const fullUrl = `${baseUrl.replace(/\/$/, '')}/${basePath.replace(/^\//, '')}`;
const objectTypeId = "26"; // ID pour 'Users'

// Paramètres de nettoyage
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 25; // Augmenté pour la vitesse
const BATCH_DELAY = 1000; // 1 second entre les lots

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function deleteWithRetry(id, key, maxRetries = 3) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      await axios.delete(`${fullUrl}/object/${id}`, { headers });
      return true;
    } catch (err) {
      if (err.response && err.response.status === 429) {
        const retryAfter = parseInt(err.response.headers['retry-after']) || 5;
        console.log(`\n⚠️ Rate limited sur ${key}. Attente de ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        retries++;
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Max retries reached for ${key}`);
}

async function cleanup() {
  try {
    console.log("=".repeat(60));
    console.log(`🧹 NETTOYAGE MASSIF DES DOUBLONS JIRA ASSETS (Users)`);
    console.log(`MODE: ${DRY_RUN ? '🔍 SIMULATION (DRY RUN)' : '🚀 RÉEL (EXECUTION)'}`);
    console.log("=".repeat(60));

    // 1. Récupérer TOUS les utilisateurs
    console.log(`\n📥 Récupération de tous les objets de type ID ${objectTypeId}...`);
    
    let allUsers = [];
    let startAt = 0;
    const maxResults = 100;
    
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
        process.stdout.write(`\r   📦 Objets récupérés: ${allUsers.length}...`);
        
        if (users.length < maxResults) break;
        startAt += maxResults;
      } catch (err) {
        console.error(`\n❌ Erreur lors de la récupération (startAt=${startAt}): ${err.message}`);
        break;
      }
    }
    console.log(`\n✅ Récupération terminée. Total: ${allUsers.length} utilisateurs.`);

    if (allUsers.length === 0) {
      console.log("ℹ️ Aucun utilisateur trouvé.");
      return;
    }

    // 2. Grouper par Nom (Normalisé) et Email
    console.log(`\n🔍 Recherche de doublons...`);
    const groups = {};
    
    for (const user of allUsers) {
      const name = (user.name || user.label || 'Inconnu')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      
      let emailVal = "";
      for (const attr of user.attributes) {
        const val = attr.objectAttributeValues?.[0]?.value;
        if (val && typeof val === 'string' && val.includes('@')) {
          emailVal = val.trim().toLowerCase();
          break;
        }
      }
      
      // La clé de dédoublonnement doit être robuste
      // On utilise l'email s'il existe, sinon le nom sans aucun espace
      const key = emailVal || name.replace(/\s+/g, ''); 
      
      if (!groups[key]) groups[key] = [];
      groups[key].push({
        id: user.id,
        key: user.objectKey,
        name: user.name || user.label,
        email: emailVal,
        created: user.created ? new Date(user.created) : new Date(0)
      });
    }

    // 3. Identifier les doublons à supprimer
    const toDelete = [];
    let totalDuplicates = 0;

    for (const [key, list] of Object.entries(groups)) {
      if (list.length > 1) {
        // Trier par date de création (on garde le plus ANCIEN)
        const sorted = list.sort((a, b) => a.created.getTime() - b.created.getTime());
        const kept = sorted[0];
        const duplicates = sorted.slice(1);
        
        totalDuplicates += duplicates.length;
        toDelete.push(...duplicates.map(d => ({ ...d, keptId: kept.id, keptKey: kept.key })));
      }
    }

    console.log(`\n📊 Résultats de l'analyse:`);
    console.log(`   - Groupes uniques: ${Object.keys(groups).length}`);
    console.log(`   - Doublons identifiés: ${totalDuplicates}`);

    if (totalDuplicates === 0) {
      console.log("✅ Aucun doublon détecté.");
      return;
    }

    // 4. Exécuter la suppression
    if (DRY_RUN) {
      console.log(`\n🔍 [DRY RUN] Liste des premiers doublons qui seraient supprimés :`);
      toDelete.slice(0, 10).forEach((d, i) => {
        console.log(`   ${i+1}. Supprimer ${d.key} (${d.name}) - Garder ${d.keptKey}`);
      });
      if (toDelete.length > 10) console.log(`   ... et ${toDelete.length - 10} autres.`);
      console.log(`\n💡 Lancez le script sans --dry-run pour effectuer les suppressions.`);
    } else {
      console.log(`\n🚀 Début de la suppression massive de ${totalDuplicates} doublons...`);
      let deleted = 0;
      let errors = 0;

      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const batch = toDelete.slice(i, i + BATCH_SIZE);
        const progress = Math.round((i / toDelete.length) * 100);
        console.log(`\n📦 Lot ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toDelete.length / BATCH_SIZE)} (${progress}%)`);

        await Promise.all(batch.map(async (item) => {
          try {
            await deleteWithRetry(item.id, item.key);
            deleted++;
            process.stdout.write(`\r   ✅ Supprimés: ${deleted}/${totalDuplicates}`);
          } catch (err) {
            errors++;
            console.error(`\n❌ Erreur sur ${item.key}: ${err.message}`);
          }
        }));

        if (i + BATCH_SIZE < toDelete.length) {
          await sleep(BATCH_DELAY);
        }
      }

      console.log(`\n\n✅ Nettoyage terminé !`);
      console.log(`   - Réussis: ${deleted}`);
      console.log(`   - Échecs: ${errors}`);
    }

  } catch (error) {
    console.error("\n💥 Erreur fatale:", error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

cleanup();
