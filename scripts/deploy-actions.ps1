<#
.SYNOPSIS
    HOUNIGO — Script di automazione Deploy GitHub Actions (Antigravity & Terminale)
.DESCRIPTION
    Consente di avviare, monitorare e verificare la pipeline nativa GitHub Pages
    (deploy.yml) senza dover aprire il browser su GitHub.
    Usa GitHub CLI e recupera le credenziali in modo sicuro da Git Credential Manager
    senza salvare token su disco né stamparli nei log.
.PARAMETER Action
    Azione da eseguire: 'deploy' (predefinito), 'dry-run', 'rollback', 'status'
.PARAMETER Ref
    Branch, tag o commit SHA su cui eseguire l'azione (default: 'main')
.PARAMETER Confirm
    Stringa di sicurezza: deve essere 'CONFERMA' per autorizzare un deploy o rollback reale.
.PARAMETER NoWait
    Non attendere il completamento della pipeline.
#>
param(
    [ValidateSet('deploy', 'dry-run', 'rollback', 'status')]
    [string]$Action = 'deploy',

    [string]$Ref = 'main',

    [string]$Confirm = '',

    [switch]$NoWait
)

$ErrorActionPreference = 'Stop'
$Repo = 'CASABR/honeymoon-roadbook'
$Workflow = 'deploy.yml'

# 1. Localizzazione eseguibile gh
$cmd = Get-Command gh -ErrorAction SilentlyContinue
$ghExe = if ($cmd) { $cmd.Source } else { $null }
if (-not $ghExe) {
    $defaultGhPath = 'C:\Program Files\GitHub CLI\gh.exe'
    if (Test-Path $defaultGhPath) {
        $ghExe = $defaultGhPath
    } else {
        Write-Error "GitHub CLI ('gh') non trovato. Installalo con 'winget install --id GitHub.cli'."
        exit 1
    }
}

# 2. Configurazione autenticazione sicura tramite Git Credential Manager (in-memory)
if (-not $env:GH_TOKEN) {
    try {
        $inputStr = "protocol=https`nhost=github.com`n`n"
        $credLines = $inputStr | git credential fill 2>$null
        $tokenLine = $credLines | Where-Object { $_ -like "password=*" }
        if ($tokenLine) {
            $env:GH_TOKEN = $tokenLine.Substring("password=".Length).Trim()
        }
    } catch {
        # Fallback se git credential non è disponibile
    }
}

# 3. Gestione Azione STATUS
if ($Action -eq 'status') {
    Write-Host "=== ULTIME ESECUZIONI WORKFLOW DEPLOY ($Repo) ===" -ForegroundColor Cyan
    & $ghExe run list --workflow $Workflow --repo $Repo --limit 5
    exit 0
}

# 4. Validazione Sicurezza per Deploy e Rollback
$dryRun = 'true'
$effectiveConfirm = ''

if ($Action -eq 'dry-run') {
    Write-Host ">> Modalità DRY-RUN selezionata: test di compilazione, lint e versionamento senza pubblicazione." -ForegroundColor Yellow
    $dryRun = 'true'
    $effectiveConfirm = ''
} elseif ($Action -eq 'deploy') {
    if ($Confirm -ne 'CONFERMA') {
        Write-Error "BLOCCO DI SICUREZZA: Per pubblicare in produzione devi specificare -Confirm CONFERMA."
        exit 1
    }
    Write-Host ">> Modalità DEPLOY REALE selezionata su ref '$Ref' con conferma esplicita." -ForegroundColor Green
    $dryRun = 'false'
    $effectiveConfirm = 'CONFERMA'
} elseif ($Action -eq 'rollback') {
    if ($Confirm -ne 'CONFERMA') {
        Write-Error "BLOCCO DI SICUREZZA: Per eseguire un rollback reale devi specificare -Confirm CONFERMA."
        exit 1
    }
    if ($Ref -eq 'main' -or [string]::IsNullOrWhiteSpace($Ref)) {
        Write-Error "ERRORE ROLLBACK: Devi specificare il commit SHA o tag di ripristino con -Ref <commit-sha>."
        exit 1
    }
    Write-Host ">> Modalità ROLLBACK REALE selezionata sul commit '$Ref' con conferma esplicita." -ForegroundColor Magenta
    $dryRun = 'false'
    $effectiveConfirm = 'CONFERMA'
}

# 5. Avvio del Workflow GitHub Actions
Write-Host "Avvio workflow '$Workflow' su repository '$Repo' (ref: $Ref, dry_run: $dryRun)..." -ForegroundColor Cyan
$runOutput = & $ghExe workflow run $Workflow --repo $Repo --ref $Ref -f ref=$Ref -f dry_run=$dryRun -f confirm=$effectiveConfirm 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Errore avvio workflow: $runOutput"
    exit $LASTEXITCODE
}

Write-Host "Workflow avviato con successo!" -ForegroundColor Green

if ($NoWait) {
    Write-Host "Monitoraggio asincrono: puoi verificare lo stato con './scripts/deploy-actions.ps1 -Action status'." -ForegroundColor Gray
    exit 0
}

# 6. Attesa e monitoraggio esecuzione
Write-Host "Recupero ID esecuzione in corso..." -ForegroundColor Gray
Start-Sleep -Seconds 4
$latestRun = & $ghExe run list --workflow $Workflow --repo $Repo --limit 1 --json databaseId,status,conclusion,url | ConvertFrom-Json

if ($latestRun -and $latestRun.Count -gt 0) {
    $runId = $latestRun[0].databaseId
    $runUrl = $latestRun[0].url
    Write-Host "Esecuzione identificata: #$runId" -ForegroundColor Cyan
    Write-Host "Link esecuzione: $runUrl" -ForegroundColor Gray
    Write-Host "Monitoraggio in tempo reale..." -ForegroundColor Yellow
    
    & $ghExe run watch $runId --repo $Repo
    $finalStatus = & $ghExe run view $runId --repo $Repo --json conclusion,url | ConvertFrom-Json
    
    if ($finalStatus.conclusion -eq 'success') {
        if ($dryRun -eq 'false') {
            Write-Host "`n========================================================" -ForegroundColor Green
            Write-Host "🎉 PUBBLICAZIONE COMPLETATA CON SUCCESSO SU GITHUB PAGES!" -ForegroundColor Green
            Write-Host "Sito: https://casabr.github.io/honeymoon-roadbook/" -ForegroundColor Green
            Write-Host "========================================================`n" -ForegroundColor Green
        } else {
            Write-Host "`n========================================================" -ForegroundColor Yellow
            Write-Host "✓ DRY-RUN COMPLETATO CON SUCCESSO! Nessun deploy eseguito." -ForegroundColor Yellow
            Write-Host "========================================================`n" -ForegroundColor Yellow
        }
    } else {
        Write-Error "Pipeline terminata con esito: $($finalStatus.conclusion). Dettagli: $runUrl"
        exit 1
    }
}
