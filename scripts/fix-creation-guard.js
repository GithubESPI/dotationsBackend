/**
 * CORRECTION DÉFINITIVE des doublons lors des synchros Jira
 *
 * Problème : _doCreateAssetUser appelle findAssetUserByEmail() qui elle-meme
 * utilise le registre ou une requete AQL case-sensitive.
 * Si le registre est vide et AQL ne trouve pas a cause de la casse,
 * la creation est declenchee => doublons.
 *
 * Solution : Ajouter dans _doCreateAssetUser une recherche AQL directe
 * par LIKE sur chaque partie du nom, ce qui est case-insensitive sur Jira Cloud.
 * De plus, il faut aussi s'assurer que le registre est utilise PARTOUT.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/jira-asset/jira-asset.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// ============================================================
// FIX 1 : Ajouter une recherche AQL directe robuste dans _doCreateAssetUser
// Cette recherche contourne le registre et utilise LIKE pour chaque mot du nom
// ============================================================
const OLD_GUARD = "    // SÉCURITÉ 1 : Vérifier si l'utilisateur existe déjà dans Jira\r\n    // findAssetUserByEmail propage les erreurs réseau → si erreur API, on arrête ici\r\n    let existing: JiraAssetObjectResponse | null = null;\r\n    try {\r\n      existing = await this.findAssetUserByEmail(user.email, normalizedDisplayName);\r\n    } catch (searchError: any) {\r\n      this.logger.error(`❌ Erreur lors de la recherche préalable pour \"${lockKey}\": ${searchError.message}. Création bloquée.`);\r\n      // On ne peut pas vérifier l'existence → on ne crée pas pour éviter un doublon\r\n      return null;\r\n    }";

const NEW_GUARD = `    // SÉCURITÉ 1 : Vérification multi-niveaux de l'existence de l'utilisateur
    // Niveau A : Registre en mémoire (rapide) - le charger si vide
    if (this.userRegistry.size === 0) {
      await this.loadUserRegistry();
    }

    // Niveau B : Recherche dans le registre par clé normalisée
    let existing: JiraAssetObjectResponse | null = null;
    const regResult = this.userRegistry.get(lockKey);
    if (regResult) {
      this.logger.log(\`ℹ️ Utilisateur Asset trouvé dans le registre: "\${lockKey}" (ID: \${regResult.id}), création annulée.\`);
      this.userCache.set(lockKey, { user: regResult, expiresAt: Date.now() + this.USER_CACHE_TTL_MS });
      return regResult;
    }

    // Niveau C : Recherche AQL directe robuste (insensible à la casse via LIKE sur chaque mot)
    // C'est LE filet de sécurité ultime contre les doublons
    try {
      const searchUrl = this.buildAssetsUrl('object/aql');
      const nameParts = normalizedDisplayName.split(' ').filter(p => p.length > 1);
      // Construire une requete qui cherche chaque partie du nom
      // Ex: "Amandine FRANCHI" -> LIKE "%Amandine%" AND LIKE "%FRANCHI%"
      const likeConditions = nameParts.map(p => \`"Name" LIKE "%\${p}%"\`).join(' AND ');
      const aqlQuery = \`objectType = "Users" AND \${likeConditions}\`;

      const response = await firstValueFrom(
        this.httpService.post<{ values: JiraAssetObjectResponse[] }>(
          searchUrl,
          { qlQuery: aqlQuery, maxResults: 10, includeAttributes: true },
          { headers: this.getAuthHeaders() },
        ),
      );
      const candidates = response.data.values || [];
      if (candidates.length > 0) {
        // Prendre le plus ancien (ID le plus petit) en cas de doublons existants
        existing = candidates.sort((a, b) => parseInt(a.id) - parseInt(b.id))[0];
        this.logger.log(\`ℹ️ Utilisateur Asset trouvé par AQL LIKE: "\${lockKey}" (ID: \${existing.id}), création annulée.\`);
        // Mettre en cache et dans le registre pour les prochains appels
        this.userCache.set(lockKey, { user: existing, expiresAt: Date.now() + this.USER_CACHE_TTL_MS });
        this.userRegistry.set(lockKey, existing);
        return existing;
      }
    } catch (searchError: any) {
      this.logger.error(\`❌ Erreur recherche préalable pour "\${lockKey}": \${searchError.message}. Création bloquée.\`);
      return null;
    }`;

if (!content.includes(OLD_GUARD)) {
  // Essayer avec LF
  const OLD_LF = OLD_GUARD.replace(/\r\n/g, '\n');
  if (content.includes(OLD_LF)) {
    content = content.replace(OLD_LF, NEW_GUARD);
    console.log('Remplacement avec LF réussi');
  } else {
    console.error('Pattern non trouvé! Cherchons par fragments...');
    const i1 = content.indexOf('SÉCURITÉ 1 : Vérifier si');
    const i2 = content.indexOf('} catch (searchError: any) {', i1);
    const i3 = content.indexOf('}', i2 + 30);
    console.log('Fragment indices:', i1, i2, i3);
    const i4 = content.indexOf('if (existing)', i3);
    console.log('if (existing):', i4);
    // Remplacer le bloc entier
    const newContent = content.slice(0, i1) + NEW_GUARD + content.slice(i4);
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Remplacement chirurgical par indices réussi');
    process.exit(0);
  }
} else {
  content = content.replace(OLD_GUARD, NEW_GUARD);
  console.log('Remplacement avec CRLF réussi');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fichier sauvegardé. Taille:', content.length);
