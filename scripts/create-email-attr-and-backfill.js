const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const email = process.env.JIRA_EMAIL_ASSETS;
const token = process.env.JIRA_TOKEN_ASSETS?.replace(/^["']|["']$/g, '');
const baseUrl = process.env.JIRA_BASE_URL_ASSETS;
const basePath = process.env.JIRA_BASE_PATH_ASSETS;

const auth = Buffer.from(`${email}:${token}`).toString('base64');
const headers = {
  'Authorization': `Basic ${auth}`,
  'Accept': 'application/json',
  'Content-Type': 'application/json'
};

const fullUrl = `${baseUrl.replace(/\/$/, '')}/${basePath.replace(/^\//, '')}`;
const objectTypeId = "26"; // 'Users'

// Connect to Mongo
const mongoUri = process.env.MONGODBURI;

const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema);

const delay = ms => new Promise(res => setTimeout(res, ms));

async function main() {
  console.log("==========================================");
  console.log("🚀 MIGRATION: CRÉATION EMAIL & BACKFILL");
  console.log("==========================================\n");

  try {
    // 1. Vérifier ou Créer l'attribut Email
    console.log(`🔍 Vérification des attributs de l'objet ID ${objectTypeId}...`);
    const attrsRes = await axios.get(`${fullUrl}/objecttype/${objectTypeId}/attributes`, { headers });
    let attributes = attrsRes.data;
    
    let emailAttr = attributes.find(a => a.name.toLowerCase() === 'email' || a.name.toLowerCase() === 'e-mail' || a.name.toLowerCase() === 'mail');
    
    if (!emailAttr) {
      console.log(`➕ L'attribut Email n'existe pas. Création via API...`);
      const createRes = await axios.post(`${fullUrl}/objecttypeattribute/${objectTypeId}`, {
        name: "Email",
        type: 0,
        defaultTypeId: 0, // Text
        description: "Email Office 365"
      }, { headers });
      emailAttr = createRes.data;
      console.log(`✅ Attribut 'Email' créé avec succès ! (ID: ${emailAttr.id})`);
    } else {
      console.log(`✅ Attribut 'Email' trouvé (ID: ${emailAttr.id}). Aucune création nécessaire.`);
    }

    const emailAttrId = emailAttr.id;

    // 2. Récupérer les utilisateurs Mongoose
    console.log(`\n⏳ Connexion à MongoDB...`);
    await mongoose.connect(mongoUri);
    console.log(`✅ MongoDB Connecté.`);
    
    const dbUsers = await User.find({ email: { $exists: true } });
    console.log(`📋 Utilisateurs MongoDB trouvés : ${dbUsers.length}`);

    // Map pour accès rapide : Clé = Nom normalisé sans espaces (minuscules), Valeur = email
    const dbUserMap = new Map();
    dbUsers.forEach(u => {
      if (u.displayName && u.email) {
        const normName = u.displayName.replace(/\s+/g, '').toLowerCase();
        dbUserMap.set(normName, u.email.toLowerCase());
      }
    });

    // 3. Récupérer tous les utilisateurs Jira Assets
    console.log(`\n📥 Récupération des utilisateurs Jira Assets (Type ID: ${objectTypeId})...`);
    let jiraUsers = [];
    let startAt = 0;
    while (true) {
      const res = await axios.post(`${fullUrl}/object/aql`, {
        qlQuery: `objectType = "Users"`
      }, { params: { startAt, maxResults: 100, includeAttributes: true }, headers });
      
      const page = res.data.values || [];
      if (page.length === 0) break;
      
      jiraUsers.push(...page);
      process.stdout.write(`\r   📦 Récupérés: ${jiraUsers.length}...`);
      if (page.length < 100) break;
      startAt += 100;
    }
    console.log(`\n✅ Récupération terminée. Total: ${jiraUsers.length} profils Jira.`);

    // 4. Backfill (Mise à jour)
    console.log(`\n🔄 Démarrage du Backfill des Emails...`);
    let updatedCount = 0;
    let skippedCount = 0;
    let missingDBCount = 0;
    let errorCount = 0;

    for (const jUser of jiraUsers) {
      const nameAttr = jUser.attributes.find(a => a.objectTypeAttributeId === "116"); // ID Nom (souvent 116 ou "Name" caché)
      const name = jUser.name || jUser.label || (nameAttr ? nameAttr.objectAttributeValues?.[0]?.value : '');
      
      if (!name) continue;
      
      const normName = name.replace(/\s+/g, '').toLowerCase();
      const mailFromDb = dbUserMap.get(normName);
      
      if (!mailFromDb) {
        missingDBCount++;
        continue;
      }
      
      // Vérifier si l'email est DÉJÀ renseigné dans le profil Jira Asset
      const currentEmailObj = jUser.attributes.find(a => a.objectTypeAttributeId === emailAttrId.toString());
      const currentEmail = currentEmailObj?.objectAttributeValues?.[0]?.value;

      if (currentEmail && currentEmail.toLowerCase() === mailFromDb) {
        skippedCount++; // Déjà à jour
        continue;
      }

      // Mettre à jour dans Jira Asset !
      try {
        await axios.put(`${fullUrl}/object/${jUser.id}`, {
          objectTypeId: objectTypeId,
          attributes: [
            {
              objectTypeAttributeId: emailAttrId.toString(),
              objectAttributeValues: [{ value: mailFromDb }]
            }
          ]
        }, { headers });
        
        updatedCount++;
        process.stdout.write(`\r   ✅ Mis à jour: ${updatedCount} profils...`);
        await delay(100); // Respecter le rate limit Jira
      } catch (err) {
        // En cas d'erreur de MAJ, on log mais on continue (parfois 412 Validate Failed)
        console.error(`\n❌ Échec maj email pour ${name} (ID: ${jUser.id}) :`, err.response?.data || err.message);
        errorCount++;
      }
    }

    console.log(`\n\n🎉 BACKFILL TERMINÉ !`);
    console.log(`   - Profils mis à jour avec email : ${updatedCount}`);
    console.log(`   - Profils ignorés (déjà à jour) : ${skippedCount}`);
    console.log(`   - Introuvables dans Mongo : ${missingDBCount}`);
    console.log(`   - Erreurs de MAJ : ${errorCount}`);

  } catch (error) {
    console.error("❌ ERREUR FATALE:", error.response?.data || error.message);
  } finally {
    mongoose.disconnect();
  }
}

main();
