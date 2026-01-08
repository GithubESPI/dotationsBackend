# Script PowerShell pour corriger les paramètres de pagination Jira Assets API pour getAllAssetsByObjectType

$filePath = "src/jira-asset/jira-asset.service.ts"
$content = Get-Content $filePath -Raw -Encoding UTF8

# Remplacement 1: Retirer startAt et maxResults du body pour getAllAssetsByObjectType
$pattern1 = '        // Requête AQL pour filtrer par schéma ET type d''objet\r?\n        // IMPORTANT: Utiliser startAt et maxResults au lieu de page et resultPerPage\r?\n        const aqlBody = \{\r?\n          qlQuery: `objectSchema = "\$\{schemaName\}" AND objectType = "\$\{objectTypeName\}"`,\r?\n          startAt: start,  // Index de départ \(0-indexed\)\r?\n          maxResults: pageSize,  // Nombre de résultats par page\r?\n        \};'
$replacement1 = '        // Requête AQL pour filtrer par schéma ET type d''objet
        // IMPORTANT: Les paramètres de pagination doivent être dans l''URL, PAS dans le body
        const aqlBody = {
          qlQuery: `objectSchema = "${schemaName}" AND objectType = "${objectTypeName}"`,
        };'

$content = $content -replace $pattern1, $replacement1

# Remplacement 2: Modifier l'URL et le log pour getAllAssetsByObjectType
$pattern2 = '        this\.logger\.debug\(`   🔍 Requête AQL: startAt=\$\{aqlBody\.startAt\}, maxResults=\$\{aqlBody\.maxResults\}`\);\r?\n\r?\n        const response = await firstValueFrom\(\r?\n          this\.httpService\.post<\{ values: JiraAssetObjectResponse\[\]; size: number; start: number; limit: number; total\?: number; isLast\?: boolean \}>\(\r?\n            searchUrl,'
$replacement2 = '        // Construire l''URL avec les paramètres de pagination
        const paginatedUrl = `${searchUrl}?startAt=${start}&maxResults=${pageSize}&includeAttributes=true`;

        this.logger.debug(`   🔍 Requête AQL: URL=${paginatedUrl}`);

        const response = await firstValueFrom(
          this.httpService.post<{ values: JiraAssetObjectResponse[]; size: number; start: number; limit: number; total?: number; isLast?: boolean }>(
            paginatedUrl,'

$content = $content -replace $pattern2, $replacement2

# Sauvegarder le fichier
$content | Set-Content $filePath -Encoding UTF8 -NoNewline

Write-Host "✅ Modifications appliquées pour getAllAssetsByObjectType"
