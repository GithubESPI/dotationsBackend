/**
 * Fix critique: loadUserRegistry() envoyait maxResults/startAt/includeAttributes
 * en query params URL au lieu du corps JSON POST → attributs jamais retournés
 * → le registre était vide de vrais noms → tous les lookups échouaient → doublons
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/jira-asset/jira-asset.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Trouver et remplacer l'ancienne implem de loadUserRegistry
const start = content.indexOf('  async loadUserRegistry(): Promise<void> {');
const end = content.indexOf('  /**\n   * Invalider le registre');
if (start === -1 || end === -1) {
  console.error('Marqueurs introuvables:', { start, end });
  process.exit(1);
}

console.log('Remplacement lignes', start, '->', end);
console.log('Debut du bloc:', content.slice(start, start + 100).replace(/\n/g, '↵'));

const newFn = `  async loadUserRegistry(): Promise<void> {
    const now = Date.now();
    if (this.userRegistryLoadedAt > 0 && (now - this.userRegistryLoadedAt) < this.USER_REGISTRY_TTL_MS) {
      this.logger.log(\`📦 Registre utilisateurs déjà chargé (\${this.userRegistry.size} entrées, valide encore \${Math.round((this.USER_REGISTRY_TTL_MS - (now - this.userRegistryLoadedAt)) / 1000)}s)\`);
      return;
    }

    this.logger.log('🔄 Chargement du registre global des utilisateurs Jira Assets...');
    try {
      const searchUrl = this.buildAssetsUrl('object/aql');
      const allUsers: JiraAssetObjectResponse[] = [];
      let startAt = 0;
      const pageSize = 100;

      // CORRECTION CRITIQUE : maxResults, startAt et includeAttributes doivent être
      // dans le CORPS JSON, pas en query params (?...) - l'endpoint POST object/aql
      // ignore les query params pour ces champs
      while (true) {
        const response = await firstValueFrom(
          this.httpService.post<{ values: JiraAssetObjectResponse[]; total?: number }>(
            searchUrl,
            {
              qlQuery: \`objectType = "Users"\`,
              maxResults: pageSize,
              startAt,
              includeAttributes: true,
            },
            { headers: this.getAuthHeaders() },
          ),
        );
        const page = response.data.values || [];
        allUsers.push(...page);
        this.logger.debug(\`📦 Page \${startAt / pageSize + 1}: \${page.length} users récupérés (total: \${allUsers.length})\`);
        if (page.length < pageSize) break;
        startAt += pageSize;
      }

      // Vider et reconstruire le registre
      this.userRegistry.clear();
      for (const u of allUsers) {
        // Index 1 : label retourné par l'API (nom affiché, ex: "Alice CARTIER")
        const rawLabel: string = (u as any).label || '';
        if (rawLabel && rawLabel.trim().length > 1) {
          const labelKey = rawLabel.replace(/\\s+/g, '').toLowerCase();
          if (!this.userRegistry.has(labelKey)) {
            this.userRegistry.set(labelKey, u);
          }
        }

        // Index 2 : valeurs textuelles de chaque attribut (Nom, Prénoms, etc.)
        // SOURCE DE VÉRITÉ quand label est absent ou vide
        for (const attr of u.attributes || []) {
          const val = attr.objectAttributeValues?.[0]?.value;
          if (val && typeof val === 'string' && val.trim().length > 1) {
            // Indexer la valeur brute
            const attrKey = val.replace(/\\s+/g, '').toLowerCase();
            if (!this.userRegistry.has(attrKey)) {
              this.userRegistry.set(attrKey, u);
            }
            // Indexer aussi les parties individuelles (ex: "BOUNOIR" seul)
            val.split(' ').forEach(part => {
              const pk = part.replace(/\\s+/g, '').toLowerCase();
              if (pk.length > 2 && !this.userRegistry.has(pk)) {
                this.userRegistry.set(pk, u);
              }
            });
          }
        }
      }

      this.userRegistryLoadedAt = Date.now();
      this.logger.log(\`✅ Registre chargé : \${this.userRegistry.size} entrées pour \${allUsers.length} utilisateurs Jira\`);
    } catch (err: any) {
      this.logger.error(\`❌ Erreur chargement registre utilisateurs: \${err.message}\`);
    }
  }

`;

const patched = content.slice(0, start) + newFn + content.slice(end);
fs.writeFileSync(filePath, patched, 'utf8');
console.log('✅ Fix appliqué avec succès !');
console.log('Nouvelles lignes du registre:', newFn.split('\n').length);
