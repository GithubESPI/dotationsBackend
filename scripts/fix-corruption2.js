const fs = require('fs');
const f = 'src/jira-asset/jira-asset.service.ts';
let c = fs.readFileSync(f, 'utf8');

// Supprimer les lignes corrompues 395-400 (restes de l'ancien if(existing) block)
// Ces lignes apparaissent juste apres le catch (searchError) block
// Pattern: \r\n\r\n    " existe deja...\r\n      // Mettre en cache...\r\n      return existing;\r\n    }\r\n

const badBlock = '\r\n\r\n    " existe d';
const idx = c.indexOf(badBlock);
if (idx === -1) {
  console.log('Fragment corrompu non trouve, tentative alternative...');
  // Chercher juste le debut de la ligne corrompue
  const alt = '    " existe d';
  const idx2 = c.indexOf(alt);
  console.log('Alt pattern at:', idx2);
  if (idx2 > -1) {
    // Trouver debut de la ligne
    const lineStart = c.lastIndexOf('\r\n', idx2) + 2;
    // Trouver la fin du bloc (jusqu'apres la ligne "    }\r\n")
    const blockEnd = c.indexOf('}\r\n', idx2) + 3;
    console.log('lineStart:', lineStart, 'blockEnd:', blockEnd);
    console.log('Fragment:', JSON.stringify(c.slice(lineStart - 4, blockEnd + 4)));
    c = c.slice(0, lineStart - 2) + c.slice(blockEnd);
    fs.writeFileSync(f, c, 'utf8');
    console.log('Fragment supprime. Taille:', c.length);
  }
} else {
  // Trouver la fin du bloc corrompu
  const blockEnd = c.indexOf('}\r\n', idx + badBlock.length) + 3;
  console.log('Suppression block:', idx, '->', blockEnd);
  c = c.slice(0, idx) + c.slice(blockEnd);
  fs.writeFileSync(f, c, 'utf8');
  console.log('Bloc corrompu supprime. Taille:', c.length);
}
