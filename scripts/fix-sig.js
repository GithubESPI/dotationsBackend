const fs = require('fs');
try {
  let file = 'src/jira-asset/jira-asset.service.ts';
  let c = fs.readFileSync(file, 'utf8');
  
  c = c.replace(
    /private async _doCreateAssetUser\([\s\S]*?const doubleCheck =/g,
    `private async _doCreateAssetUser(
    user: { email: string; firstName: string; lastName: string; displayName: string },
    normalizedDisplayName: string | undefined,
    normalizedEmail: string | undefined,
    lockKey: string
  ): Promise<JiraAssetObjectResponse | null> {
    // SÉCURITÉ 1 : Revérification via le mécanisme robuste de findAssetUserByEmail
    // C'est le seul endroit où l'on garantit qu'on ne duplique pas (l'AQL échoue à cause du labeling "Nom").
    const doubleCheck =`
  );
  
  fs.writeFileSync(file, c);
  console.log("Fixed signature!");
} catch(e) {
  console.error(e);
}
