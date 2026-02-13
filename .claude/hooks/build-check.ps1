# .claude/hooks/build-check.ps1
# PostToolUse hook: automatically build after editing frontend or backend files

$input = $Input | Out-String
$json = $input | ConvertFrom-Json
$filePath = $json.tool_input.file_path

if (-not $filePath) { exit 0 }

# Normalize path separators
$filePath = $filePath -replace '\\', '/'
$projectDir = $env:CLAUDE_PROJECT_DIR -replace '\\', '/'

if ($filePath -match '/web/') {
    # Frontend file edited - run Angular build
    Write-Host "Running Angular build check..." -ForegroundColor Cyan
    Set-Location "$projectDir/web"
    $output = & yarn ng build 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Write-Host $output -ForegroundColor Red
        Write-Output "{`"systemMessage`": `"Frontend build FAILED. Please review the errors above and fix them.`"}"
        exit 2
    } else {
        Write-Output "{`"systemMessage`": `"Frontend build succeeded.`"}"
    }
}
elseif ($filePath -match '/server/') {
    # Backend file edited - run Bun build
    Write-Host "Running backend build check..." -ForegroundColor Cyan
    Set-Location "$projectDir/server"
    $output = & yarn build 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Write-Host $output -ForegroundColor Red
        Write-Output "{`"systemMessage`": `"Backend build FAILED. Please review the errors above and fix them.`"}"
        exit 2
    } else {
        Write-Output "{`"systemMessage`": `"Backend build succeeded.`"}"
    }
}

exit 0
