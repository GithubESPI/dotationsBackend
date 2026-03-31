const fs = require('fs');
const f = 'src/jira-asset/jira-asset.service.ts';
let c = fs.readFileSync(f, 'utf8');

// Trouver et afficher toutes les lignes problematiques autour de la ligne 396
const lines = c.split('\n');
for (let i = 390; i < Math.min(410, lines.length); i++) {
  console.log(i + 1, ':', JSON.stringify(lines[i]));
}
console.log('---');

// Supprimer les lignes corrompues (396-400 dans l'editeur = indices 395-399 dans le tableau)
// Ces lignes sont des fragments de l'ancien "if (existing)" block
// On cherche la ligne qui commence par un guillemet corrompu
let toRemove = [];
for (let i = 393; i < 403; i++) {
  const line = lines[i] || '';
  // Lignes corrompues: celles qui sont des fragments de l'if(existing) block
  if (
    line.includes('existe d') && line.includes('ID: ${existing') ||
    line.includes('// Mettre en cache pour les prochains appels dans cette session') ||
    (line.trim() === '}' && i > 393 && i < 403)
  ) {
    console.log('Ligne a supprimer:', i + 1, ':', JSON.stringify(line));
    toRemove.push(i);
  }
}

if (toRemove.length > 0) {
  // Supprimer en ordre inverse pour ne pas changer les indices
  for (let i = toRemove.length - 1; i >= 0; i--) {
    lines.splice(toRemove[i], 1);
  }
  const newContent = lines.join('\n');
  fs.writeFileSync(f, newContent, 'utf8');
  console.log('Lignes supprimees:', toRemove.length, '- Nouvelle taille:', newContent.length);
} else {
  console.log('Aucune ligne corrompue trouvee');
  // Essayer une approche differente: chercher le fragment exact
  const frag = 'existe d';
  const idx = c.indexOf(frag);
  if (idx > -1) {
    const lineIdx = (c.slice(0, idx).match(/\n/g) || []).length;
    console.log('Fragment trouve a la ligne:', lineIdx + 1);
  }
}
