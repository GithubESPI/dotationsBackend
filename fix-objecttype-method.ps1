# Script pour corriger getAllAssetsByObjectType

$filePath = "src/jira-asset/jira-asset.service.ts"
$lines = Get-Content $filePath -Encoding UTF8

# Supprimer les lignes 253-254 (startAt et maxResults du body)
# Index 0-based: 252-253
$newLines = $lines[0..251] + $lines[254..($lines.Count - 1)]

# Sauvegarder temporairement
$newLines | Set-Content "${filePath}.tmp" -Encoding UTF8

# Maintenant modifier la ligne du logger (qui était 257, maintenant 255)
$lines2 = Get-Content "${filePath}.tmp" -Encoding UTF8

# Trouver et remplacer la ligne du logger
for ($i = 0; $i -lt $lines2.Count; $i++) {
    if ($lines2[$i] -match 'this\.logger\.debug\(`   🔍 Requête AQL: startAt=') {
        # Remplacer par la nouvelle ligne
        $lines2[$i] = '        // Construire l''URL avec les paramètres de pagination'
        # Insérer les nouvelles lignes après
        $before = $lines2[0..$i]
        $after = $lines2[($i + 1)..($lines2.Count - 1)]
        $newInsert = @(
            '        const paginatedUrl = `${searchUrl}?startAt=${start}&maxResults=${pageSize}&includeAttributes=true`;',
            '',
            '        this.logger.debug(`   🔍 Requête AQL: URL=${paginatedUrl}`);'
        )
        $lines2 = $before + $newInsert + $after
        break
    }
}

# Maintenant remplacer searchUrl par paginatedUrl dans le post
for ($i = 0; $i -lt $lines2.Count; $i++) {
    if ($lines2[$i] -match '^\s+searchUrl,\s*$') {
        $lines2[$i] = '            paginatedUrl,'
        break
    }
}

# Sauvegarder
$lines2 | Set-Content $filePath -Encoding UTF8

# Nettoyer
Remove-Item "${filePath}.tmp"

Write-Host "✅ getAllAssetsByObjectType corrigé"
