const fs = require('fs');

const path = 'src/jira-asset/jira-asset.service.ts';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
  /const searchKey = normalizedDisplayName\s+\?\s+normalizedDisplayName\.replace\(\/\\s\+\/g,\s+''\)\.toLowerCase\(\)\s+:\s+email\.trim\(\)\.toLowerCase\(\)\.replace\(\/\[@\.\]\/g,\s+''\);/,
  `const searchKey = email\n      ? email.trim().toLowerCase()\n      : (normalizedDisplayName ? normalizedDisplayName.replace(/\\s+/g, '').toLowerCase() : '');`
);

c = c.replace(
  /const queryParts: string\[\] = \[\];\s+if \(normalizedDisplayName\)/,
  `const queryParts: string[] = [];\n      if (email) {\n        queryParts.push(\`"Email" = "\${email}"\`);\n      }\n      if (normalizedDisplayName)`
);

c = c.replace(
  /const lockKey = normalizedDisplayName\?\.replace\(\/\\s\+\/g,\s+''\)\.toLowerCase\(\) \|\| user\.email\?\.trim\(\)\.toLowerCase\(\) \|\| 'unknown';/,
  `const lockKey = user.email?.trim().toLowerCase() || normalizedDisplayName?.replace(/\\s+/g, '').toLowerCase() || 'unknown';`
);

fs.writeFileSync(path, c);
console.log('Update complete.');
