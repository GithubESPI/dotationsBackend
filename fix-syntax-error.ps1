# Script pour corriger l'erreur de syntaxe dans jira-asset.service.ts

$filePath = "src/jira-asset/jira-asset.service.ts"
$content = Get-Content $filePath -Raw -Encoding UTF8

# Remplacer la ligne 158 qui manque l'accolade fermante
$content = $content -replace '          qlQuery: `objectSchema = "\$\{schemaName\}"`', \r?\n\r?\n        // Construire', '          qlQuery: `objectSchema = "${schemaName}"`,' + "`r`n        };`r`n`r`n        // Construire"

# Sauvegarder
$content | Set-Content $filePath -Encoding UTF8 -NoNewline

Write-Host "✅ Erreur de syntaxe corrigée (accolade fermante ajoutée)"
