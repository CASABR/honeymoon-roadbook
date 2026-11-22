<#
.SYNOPSIS
    HOUNIGO - Script di automazione Deploy GitHub Actions (Antigravity & Terminale)
.DESCRIPTION
    Consente di avviare, monitorare e verificare la pipeline nativa GitHub Pages
    (deploy.yml) senza dover aprire il browser su GitHub.
    Usa GitHub CLI e recupera le credenziali in modo sicuro da Git Credential Manager
    senza salvare token su disco ne' stamparli nei log.
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
        # Fallback se git credential non e' disponibile
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
    Write-Host ">> Modalita' DRY-RUN selezionata: test di compilazione, lint e versionamento senza pubblicazione." -ForegroundColor Yellow
    $dryRun = 'true'
    $effectiveConfirm = ''
} elseif ($Action -eq 'deploy') {
    if ($Confirm -ne 'CONFERMA') {
        Write-Error "BLOCCO DI SICUREZZA: Per pubblicare in produzione devi specificare -Confirm CONFERMA."
        exit 1
    }
    Write-Host ">> Modalita' DEPLOY REALE selezionata su ref '$Ref' con conferma esplicita." -ForegroundColor Green
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
    Write-Host ">> Modalita' ROLLBACK REALE selezionata sul commit '$Ref' con conferma esplicita." -ForegroundColor Magenta
    $dryRun = 'false'
    $effectiveConfirm = 'CONFERMA'
}

# 4.1 Preflight Obbligatorio Locale per Deploy e Dry-Run
if ($Action -eq 'deploy' -or $Action -eq 'dry-run') {
    Write-Host ">> PREFLIGHT LOCALE: Verifica requisiti di versionamento prima di contattare GitHub Actions..." -ForegroundColor Cyan

    $testScript = Join-Path $PSScriptRoot "..\ViaggiodiNozze\scripts\test_release_versioning.cjs"
    if (Test-Path $testScript) {
        $nodeOutput = & node $testScript 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n========================================================" -ForegroundColor Red
            Write-Host "[ERRORE PREFLIGHT LOCALE] Test di versionamento fallito!" -ForegroundColor Red
            Write-Host "GitHub Actions NON e' stato avviato per evitare deploy falliti ed email di errore." -ForegroundColor Red
            Write-Host "Dettagli errore:`n$nodeOutput" -ForegroundColor Yellow
            Write-Host "========================================================`n" -ForegroundColor Red
            exit 1
        }
        Write-Host "   [OK] Test di versionamento superato ($($nodeOutput.Trim()))" -ForegroundColor Green
    } else {
        Write-Error "Script di test versionamento non trovato in '$testScript'."
        exit 1
    }

    # Verifica esplicita sourceCommit e allineamento versione
    $pkgPath = Join-Path $PSScriptRoot "..\ViaggiodiNozze\package.json"
    $relPath = Join-Path $PSScriptRoot "..\ViaggiodiNozze\src\data\releaseHistory.json"
    if ((Test-Path $pkgPath) -and (Test-Path $relPath)) {
        $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
        $rel = Get-Content $relPath -Raw | ConvertFrom-Json
        $latestRel = if ($rel.releases -and $rel.releases.Count -gt 0) { $rel.releases[0] } else { $null }

        if (-not $latestRel -or $latestRel.version -ne $pkg.version) {
            Write-Error "BLOCCO PREFLIGHT: Versione disallineata: package.json ($($pkg.version)) vs releaseHistory.json ($($latestRel.version))."
            exit 1
        }

        if (-not $latestRel.sourceCommit -or -not ($latestRel.sourceCommit -match '^[a-f0-9]{7,40}$')) {
            Write-Error "BLOCCO PREFLIGHT: sourceCommit mancante o non valido nella release $($latestRel.version) in releaseHistory.json. Valorizza lo SHA del commit prima del deploy."
            exit 1
        }
        Write-Host "   [OK] Release $($pkg.version) pronta con sourceCommit valido: $($latestRel.sourceCommit)" -ForegroundColor Green
    }

    # Verifica che i commit locali siano stati inviati su GitHub prima del deploy reale
    if ($Action -eq 'deploy') {
        try {
            $unpushed = & git log "origin/${Ref}..${Ref}" --oneline 2>$null
            if ($unpushed) {
                Write-Host "`n========================================================" -ForegroundColor Red
                Write-Host "[ERRORE PREFLIGHT LOCALE] Commit locali non inviati a origin/${Ref}:" -ForegroundColor Red
                Write-Host $unpushed -ForegroundColor Yellow
                Write-Host "Esegui 'git push origin ${Ref}' prima di avviare il deploy su GitHub Actions." -ForegroundColor Yellow
                Write-Host "========================================================`n" -ForegroundColor Red
                exit 1
            }
            Write-Host "   [OK] Repository allineato con origin/${Ref} (nessun commit locale pendente)" -ForegroundColor Green
        } catch {
            # Se origin/$Ref non e' raggiungibile, non bloccare
        }
    }

    Write-Host ">> PREFLIGHT SUPERATO: Parametri e versionamento validati con successo.`n" -ForegroundColor Green
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
            Write-Host "[SUCCESS] PUBBLICAZIONE COMPLETATA CON SUCCESSO SU GITHUB PAGES!" -ForegroundColor Green
            Write-Host "Sito: https://casabr.github.io/honeymoon-roadbook/" -ForegroundColor Green
            Write-Host "========================================================`n" -ForegroundColor Green
        } else {
            Write-Host "`n========================================================" -ForegroundColor Yellow
            Write-Host "[OK] DRY-RUN COMPLETATO CON SUCCESSO! Nessun deploy eseguito." -ForegroundColor Yellow
            Write-Host "========================================================`n" -ForegroundColor Yellow
        }
    } else {
        $msg = "Pipeline terminata con esito: " + $finalStatus.conclusion + ". Dettagli: " + $runUrl
        Write-Error $msg
        exit 1
    }
}
