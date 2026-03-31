const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/jira-asset/jira-asset.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Chercher le bloc exact à remplacer par index de chaîne
const marker = '// 2. V';
const endMarker = '// 3. Fallback';

const start = content.indexOf(marker);
const end = content.indexOf(endMarker);

if (start === -1 || end === -1) {
  console.error('Marqueurs introuvables:', { start, end });
  // Afficher le contexte autour de la zone attendue
  const idx = content.indexOf('userRegistry.size');
  console.log('Contexte autour de userRegistry.size:');
  console.log(content.slice(idx - 100, idx + 500));
  process.exit(1);
}

console.log('start=' + start + ' end=' + end);
console.log('Bloc a remplacer (debut):', JSON.stringify(content.slice(start, start + 80)));

const before = content.slice(0, start);
const after = content.slice(end);

const newBlock = '    // 2. V\u00e9rifier le registre global (comparaison JS, insensible \u00e0 la casse)\n' +
'    if (this.userRegistry.size > 0) {\n' +
'      // 2a. Correspondance exacte (nom complet sans espaces)\n' +
'      let fromRegistry = this.userRegistry.get(searchKey);\n' +
'\n' +
'      // 2b. Si pas trouv\u00e9, essayer les variantes partielles\n' +
'      // Cas : Jira stocke "ADA" mais O365 envoie "ADA DUPONT" \u2192 on cherche chaque partie\n' +
'      if (!fromRegistry && normalizedDisplayName) {\n' +
'        const parts = normalizedDisplayName.split(\' \');\n' +
'\n' +
'        // Chercher chaque partie individuelle (nom seul, pr\u00e9nom seul)\n' +
'        for (const part of parts) {\n' +
'          const partKey = part.replace(/\\\\s+/g, \'\').toLowerCase();\n' +
'          if (partKey.length > 2) {\n' +
'            const candidate = this.userRegistry.get(partKey);\n' +
'            if (candidate) {\n' +
'              this.logger.debug(`\ud83d\udcca Match partiel "${part}" \u2192 "${normalizedDisplayName}" (ID: ${candidate.id})`);\n' +
'              fromRegistry = candidate;\n' +
'              break;\n' +
'            }\n' +
'          }\n' +
'        }\n' +
'\n' +
'        // Chercher par suffixe (ex: "Prenom NOM" \u2192 cl\u00e9 "NOM" seul)\n' +
'        if (!fromRegistry && parts.length > 1) {\n' +
'          for (let i = 1; i < parts.length; i++) {\n' +
'            const combo = parts.slice(i).join(\'\').toLowerCase();\n' +
'            const candidate = this.userRegistry.get(combo);\n' +
'            if (candidate) {\n' +
'              this.logger.debug(`\ud83d\udcca Match suffixe "${parts.slice(i).join(\' \')}" \u2192 "${normalizedDisplayName}" (ID: ${candidate.id})`);\n' +
'              fromRegistry = candidate;\n' +
'              break;\n' +
'            }\n' +
'          }\n' +
'        }\n' +
'      }\n' +
'\n' +
'      if (fromRegistry) {\n' +
'        this.userCache.set(searchKey, { user: fromRegistry, expiresAt: Date.now() + this.USER_CACHE_TTL_MS });\n' +
'        return fromRegistry;\n' +
'      }\n' +
'      // Pas dans le registre = n\'existe pas (le registre est exhaustif)\n' +
'      this.logger.debug(`\ud83d\udd0d "${normalizedDisplayName}" absent du registre (${this.userRegistry.size} users charg\u00e9s)`);\n' +
'      return null;\n' +
'    }\n' +
'\n';

const patched = before + newBlock + after;
fs.writeFileSync(filePath, patched, 'utf8');
console.log('Patch appliqu\u00e9 avec succ\u00e8s !');
