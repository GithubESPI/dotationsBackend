# Script simple pour corriger la ligne 158

$filePath = "src/jira-asset/jira-asset.service.ts"
$lines = Get-Content $filePath -Encoding UTF8

# La ligne 157 (index 156) contient: qlQuery: `objectSchema = "${schemaName}"`
# On doit ajouter }; après
$lines[157] = '        };'

# Sauvegarder
$lines | Set-Content $filePath -Encoding UTF8

Write-Host "✅ Accolade fermante ajoutée"
