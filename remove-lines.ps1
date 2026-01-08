# Script pour supprimer les lignes 158-159 du fichier jira-asset.service.ts

$filePath = "src/jira-asset/jira-asset.service.ts"
$lines = Get-Content $filePath -Encoding UTF8

# Supprimer les lignes 158-159 (index 157-158 en 0-based)
$newLines = $lines[0..156] + $lines[160..($lines.Count - 1)]

# Sauvegarder
$newLines | Set-Content $filePath -Encoding UTF8

Write-Host "✅ Lignes 158-159 supprimées (startAt et maxResults du body)"
