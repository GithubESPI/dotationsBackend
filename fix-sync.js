const fs = require('fs');
const path = 'c:/Users/SouleyLITIE/Documents/dotation-backend/src/jira-asset/jira-asset.service.ts';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove skip logic in syncLaptopsFromJira
const skipRegex = /if \(!serialNumber \|\| serialNumber\.trim\(\) === ''\) \{\s+results\.skipped\+\+;\s+this\.logger\.debug\(`⚠️ Asset \$\{jiraAsset\.id\} ignoré: numéro de série manquant`\);\s+return;\s+\}/g;
content = content.replace(skipRegex, `if (!serialNumber || serialNumber.trim() === '') {
              this.logger.debug(\`⚠️ Asset \${jiraAsset.id} sans numéro de série: utilisation du fallback.\`);
            }`);

// 2. Modify syncEquipmentFromJira
// Replace the SN extraction and exception
const snRegex = /const serialNumber = getAttributeValue\(attributeMapping\.serialNumberAttrId\);/g;
content = content.replace(snRegex, `let serialNumber = getAttributeValue(attributeMapping.serialNumberAttrId);
    let isMissingSerialNumber = false;
    if (!serialNumber || serialNumber.trim() === '') {
      serialNumber = \`MANQUANT_\${jiraAsset.objectKey}\`;
      isMissingSerialNumber = true;
    }`);

const exceptionRegex = /if \(!serialNumber\) \{\s+throw new BadRequestException\('Le numéro de série est requis pour synchroniser un équipement'\);\s+\}/g;
content = content.replace(exceptionRegex, '');

// Update equipmentData object
const dataRegex = /objectTypeName: \(jiraAsset as any\)\.objectType\?\.name,/g;
content = content.replace(dataRegex, `objectTypeName: (jiraAsset as any).objectType?.name,
      isMissingSerialNumber,`);

fs.writeFileSync(path, content, 'utf8');
console.log('Update successful');
