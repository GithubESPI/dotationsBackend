# Script PowerShell pour corriger les paramètres de pagination Jira Assets API

$filePath = "src/jira-asset/jira-asset.service.ts"
$content = Get-Content $filePath -Raw -Encoding UTF8

# Remplacement 1: Retirer startAt et maxResults du body pour getAllAssetsFromSchema
$pattern1 = '        const aqlBody = \{\r?\n          qlQuery: `objectSchema = "\$\{schemaName\}"`,\r?\n          startAt: start,  // Index de départ \(0-indexed\)\r?\n          maxResults: pageSize,  // Nombre de résultats par page\r?\n        \};'
$replacement1 = '        const aqlBody = {
          qlQuery: `objectSchema = "${schemaName}"`,
        };'

$content = $content -replace $pattern1, $replacement1

# Sauvegarder le fichier
$content | Set-Content $filePath -Encoding UTF8 -NoNewline

Write-Host "✅ Modification 1 appliquée: Retrait de startAt/maxResults du body pour getAllAssetsFromSchema"
