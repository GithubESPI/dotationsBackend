const fs = require('fs');
const f = 'src/jira-asset/jira-asset.service.ts';
const buf = fs.readFileSync(f);
let c = buf.toString('utf8');

// Le fichier a des CRLF (\r\n) sur les lignes originales TypeScript
// Chercher par contenu specifique sans s'inquieter des fins de lignes
const searchStr = 'params: { startAt, maxResults: pageSize, includeAttributes: true }';
const idx = c.indexOf(searchStr);
if (idx === -1) {
  console.error('Pattern non trouve dans le fichier!!');
  process.exit(1);
}
console.log('Trouve a l index:', idx);

// Trouver le debut de la ligne params (debut du bloc { avant)
// On cherche: "            {\r\n              params: { startAt, maxResults: pageSize, includeAttributes: true },\r\n              headers: this.getAuthHeaders(),\r\n            },"
// et on le remplace par:
// "            { maxResults: pageSize, startAt, includeAttributes: true },"

// Trouver l'accolade ouvrante qui precede "params:"
const openBraceSearch = '            {';
let searchFrom = idx - 200;
let openBraceIdx = c.lastIndexOf(openBraceSearch, idx);
console.log('openBraceIdx:', openBraceIdx, 'idx:', idx);

// Verifier le contexte
console.log('Contexte:', JSON.stringify(c.slice(openBraceIdx, idx + searchStr.length + 50)));

// Remplacer le bloc de 4 lignes (accolade ouvrante jusqu'a la virginule fermante)
// Pattern attendu avec CRLF
const patterns = [
  // version CRLF pure
  '            {\r\n              params: { startAt, maxResults: pageSize, includeAttributes: true },\r\n              headers: this.getAuthHeaders(),\r\n            },',
  // version LF pure
  '            {\n              params: { startAt, maxResults: pageSize, includeAttributes: true },\n              headers: this.getAuthHeaders(),\n            },',
  // version mixte
  '            {\r              params: { startAt, maxResults: pageSize, includeAttributes: true },\r              headers: this.getAuthHeaders(),\r            },',
];

const replacement = '            // CORRECTION CRITIQUE: ces params doivent etre dans le corps JSON, pas en query params\n            { qlQuery: `objectType = "Users"`, maxResults: pageSize, startAt, includeAttributes: true },\n            { headers: this.getAuthHeaders() },';

let patched = c;
let found = false;
for (const p of patterns) {
  if (patched.includes(p)) {
    // Aussi supprimer la ligne qlQuery qui est deja separee
    const withQlQuery = '            { qlQuery: `objectType = "Users"` },\r\n' + p;
    const withQlQueryLF = '            { qlQuery: `objectType = "Users"` },\n' + p;
    if (patched.includes(withQlQuery)) {
      patched = patched.replace(withQlQuery, replacement);
      console.log('Remplace avec qlQuery CRLF!');
      found = true;
      break;
    } else if (patched.includes(withQlQueryLF)) {
      patched = patched.replace(withQlQueryLF, replacement);
      console.log('Remplace avec qlQuery LF!');
      found = true;
      break;
    } else {
      patched = patched.replace(p, replacement).replace('            { qlQuery: `objectType = "Users"` },\r\n', '');
      patched = patched.replace('            { qlQuery: `objectType = "Users"` },\n', '');
      console.log('Remplace params seul!');
      found = true;
      break;
    }
  }
}

if (!found) {
  // Approche chirurgicale: remplacer exactement les octets autour de "params:"
  const paramsIdx = c.indexOf('params: { startAt');
  // Trouver debut ligne params
  let lineStart = paramsIdx;
  while (lineStart > 0 && c[lineStart] !== '\n') lineStart--;
  lineStart++;
  // Trouver la fin du bloc (jusqu'a "}," apres "headers")
  const headersIdx = c.indexOf('headers: this.getAuthHeaders(),', paramsIdx);
  const closingIdx = c.indexOf('},', headersIdx) + 2;
  
  console.log('Remplacement chirurgical:', lineStart, '->', closingIdx);
  console.log('Avant:', JSON.stringify(c.slice(lineStart - 50, closingIdx + 10)));
  
  patched = c.slice(0, lineStart - 50) + 
    '            // CORRECTION CRITIQUE: params dans corps JSON, pas query params\n' +
    '            { qlQuery: `objectType = "Users"`, maxResults: pageSize, startAt, includeAttributes: true },\n' +
    '            { headers: this.getAuthHeaders() },' +
    c.slice(closingIdx);
  
  // SUPPRIMER l'ancienne ligne qlQuery separee
  patched = patched.replace(/\s*\{ qlQuery: `objectType = "Users"` \},\s*\n\s*\/\/ CORRECTION/, '\n            // CORRECTION');
  found = true;
  console.log('Remplacement chirurgical applique');
}

if (found) {
  fs.writeFileSync(f, patched, 'utf8');
  console.log('Fichier sauvegarde. Taille:', patched.length);
}
