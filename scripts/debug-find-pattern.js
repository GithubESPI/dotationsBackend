const fs = require('fs');
const f = 'src/jira-asset/jira-asset.service.ts';
const c = fs.readFileSync(f, 'utf8');

// Chercher le pattern exact avec les vraies sequences de caracteres du fichier
const idx = c.indexOf('qlQuery');
if (idx === -1) { console.error('qlQuery not found'); process.exit(1); }

// Afficher la zone exacte autour du premier qlQuery dans loadUserRegistry
console.log('Zone qlQuery hex:');
const zone = c.slice(idx - 30, idx + 180);
for (let i = 0; i < zone.length; i++) {
  const ch = zone[i];
  const code = zone.charCodeAt(i);
  if (code === 13) process.stdout.write('[CR]');
  else if (code === 10) process.stdout.write('[LF]\n');
  else if (code === 96) process.stdout.write('[BT]');
  else process.stdout.write(ch);
}
console.log('\n---');

// Remplacer uniquement les 3 lignes du bloc params
// On cherche les positions exactes
const paramsStart = c.indexOf('params: { startAt, maxResults: pageSize, includeAttributes: true }');
const lineStart = c.lastIndexOf('\n', paramsStart);
const blockStart = c.lastIndexOf('\n', lineStart - 1);

console.log('params at:', paramsStart);
console.log('Bloc a remplacer:');
const toReplace = c.slice(blockStart + 1, c.indexOf('\n', c.indexOf('},', paramsStart)) + 1);
console.log(JSON.stringify(toReplace));
