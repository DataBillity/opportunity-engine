# Opportunity Engine
#   .\go                 local stack: worker (backend) + Next.js (frontend)
#   .\go -FrontOnly      Next.js only (this window)
#   .\go -WorkerOnly     worker only (this window)
#   .\go -Port 3100      pin the Next.js port
#
# Canonical ports (dedicated — do not reuse sibling stacks):
#   Frontend   3100
#   Langfuse   3040  (observability, not started by .\go)
#
# Sibling port map (avoid these):
#   staystaged 3000
#   Autograph 3001 / 3004 / 8001
#   Super Admin partners 3002 | ops UI 3003 | Affiliate API 8000
#   Compliabillity 3010 / 3011
#   Billity marketing 3012
#   DataBillity.com 3014 / 8014
#   Hyde Concepts 3020

param(
    [int] $Port = 0,
    [switch] $FrontOnly,
    [switch] $WorkerOnly,
    [switch] $Help
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$PreferredPort = 3100
$WebDir = Join-Path $PSScriptRoot "apps\web"
$WorkerDir = Join-Path $PSScriptRoot "apps\worker"

# Ports owned by other local stacks — never use these for Next fallback either.
$ReservedElsewhere = @(
    3000, 3001, 3002, 3003, 3004,
    3010, 3011, 3012, 3014, 3020,
    3040,
    5000, 5173,
    8000, 8001, 8014, 8080, 8888
)

function Test-PortFree([int] $Candidate) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Candidate -ErrorAction SilentlyContinue
    return -not $listener
}

function Get-ProcessCommandLine([int] $ProcessId) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
    if ($proc) { return $proc.CommandLine }
    return $null
}

function Test-IsOpportunityEngineFrontend([int] $ProcessId) {
    $cmd = Get-ProcessCommandLine $ProcessId
    if (-not $cmd) { return $false }
    return ($cmd -match [regex]::Escape($PSScriptRoot)) -and ($cmd -match "next|start-server")
}

function Test-IsOpportunityEngineWorker([int] $ProcessId) {
    $cmd = Get-ProcessCommandLine $ProcessId
    if (-not $cmd) { return $false }
    $inRepo = $cmd -match [regex]::Escape($PSScriptRoot)
    $isWorker = ($cmd -match [regex]::Escape("apps\worker")) -or
        ($cmd -match [regex]::Escape("apps/worker")) -or
        ($cmd -match "@opportunity-engine/worker")
    return $inRepo -and $isWorker
}

function Stop-ProcessTree([int] $ProcessId) {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ParentProcessId -eq $ProcessId } |
        ForEach-Object { Stop-ProcessTree $_.ProcessId }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-OpportunityEngineDevServers([int[]] $FrontPorts, [switch] $IncludeWorker) {
    $stopped = $false

    foreach ($candidatePort in $FrontPorts) {
        $listeners = Get-NetTCPConnection -State Listen -LocalPort $candidatePort -ErrorAction SilentlyContinue
        foreach ($conn in $listeners) {
            $procId = $conn.OwningProcess
            if (-not (Test-IsOpportunityEngineFrontend $procId)) { continue }
            Write-Host "opportunity-engine: stopping frontend on :$candidatePort (pid $procId)" -ForegroundColor Yellow
            Stop-ProcessTree $procId
            $stopped = $true
        }
    }

    if ($IncludeWorker) {
        $workerProcs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object { $_.ProcessId -and (Test-IsOpportunityEngineWorker $_.ProcessId) }
        foreach ($proc in $workerProcs) {
            Write-Host "opportunity-engine: stopping worker (pid $($proc.ProcessId))" -ForegroundColor Yellow
            Stop-ProcessTree $proc.ProcessId
            $stopped = $true
        }
    }

    if ($stopped) {
        Start-Sleep -Milliseconds 750
    }
}

function Find-DevPort {
    if ($Port -gt 0) {
        if (-not (Test-PortFree $Port)) {
            Write-Host "opportunity-engine: port $Port is already in use." -ForegroundColor Red
            exit 1
        }
        return $Port
    }

    if (Test-PortFree $PreferredPort) { return $PreferredPort }

    foreach ($candidate in 3100..3110) {
        if ($candidate -in $ReservedElsewhere) { continue }
        if (Test-PortFree $candidate) { return $candidate }
    }

    Write-Host "opportunity-engine: no free port found in 3100-3110." -ForegroundColor Red
    exit 1
}

function Ensure-EnvLocal([int] $FrontPort) {
    $envPath = Join-Path $PSScriptRoot ".env.local"
    $examplePath = Join-Path $PSScriptRoot ".env.example"
    if (-not (Test-Path $envPath)) {
        if (Test-Path $examplePath) {
            Write-Host "opportunity-engine: creating .env.local from .env.example..." -ForegroundColor Cyan
            Copy-Item $examplePath $envPath
        } else {
            @"
NEXT_PUBLIC_APP_URL=http://localhost:$FrontPort
NODE_ENV=development
"@ | Set-Content -Path $envPath -Encoding UTF8
        }
    }

    $raw = Get-Content $envPath -Raw
    $appUrl = "http://localhost:$FrontPort"
    if ($raw -notmatch "(?m)^\s*NEXT_PUBLIC_APP_URL\s*=") {
        Add-Content -Path $envPath -Value "`nNEXT_PUBLIC_APP_URL=$appUrl"
        Write-Host "opportunity-engine: set NEXT_PUBLIC_APP_URL=$appUrl in .env.local" -ForegroundColor Cyan
    } elseif ($raw -match "(?m)^\s*NEXT_PUBLIC_APP_URL\s*=\s*$") {
        $updated = $raw -replace "(?m)^\s*NEXT_PUBLIC_APP_URL\s*=\s*$", "NEXT_PUBLIC_APP_URL=$appUrl"
        Set-Content -Path $envPath -Value $updated -Encoding UTF8 -NoNewline
        Write-Host "opportunity-engine: filled empty NEXT_PUBLIC_APP_URL=$appUrl" -ForegroundColor Cyan
    } elseif ($FrontPort -ne $PreferredPort -and $raw -match "(?m)^\s*NEXT_PUBLIC_APP_URL\s*=\s*https?://(localhost|127\.0\.0\.1):3100\s*$") {
        $updated = $raw -replace "(?m)^\s*NEXT_PUBLIC_APP_URL\s*=\s*https?://(localhost|127\.0\.0\.1):3100\s*$", "NEXT_PUBLIC_APP_URL=$appUrl"
        Set-Content -Path $envPath -Value $updated -Encoding UTF8 -NoNewline
        Write-Host "opportunity-engine: moved app URL -> $appUrl" -ForegroundColor Cyan
    }
}

function Ensure-Pnpm {
    $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
    if (-not $pnpm) {
        Write-Host "opportunity-engine: pnpm is required. Install with: npm install -g pnpm@9" -ForegroundColor Red
        exit 1
    }
}

function Ensure-Deps {
    Ensure-Pnpm
    if (-not (Test-Path "$PSScriptRoot\node_modules")) {
        Write-Host "opportunity-engine: pnpm install..." -ForegroundColor Cyan
        pnpm install
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
}

function Start-Worker([switch] $InThisWindow) {
    if (-not (Test-Path (Join-Path $WorkerDir "package.json"))) {
        Write-Host "opportunity-engine: worker not found at $WorkerDir" -ForegroundColor Red
        exit 1
    }

    Write-Host "opportunity-engine: starting worker (orchestration backend)" -ForegroundColor Cyan

    if ($InThisWindow) {
        Write-Host "opportunity-engine: stop with Ctrl+C" -ForegroundColor DarkGray
        pnpm --filter @opportunity-engine/worker dev
        exit $LASTEXITCODE
    }

    $title = "Opportunity Engine - worker"
    $cmdLine = 'title {0} & cd /d "{1}" & pnpm --filter @opportunity-engine/worker dev' -f $title, $PSScriptRoot
    Start-Process -FilePath "cmd.exe" -ArgumentList @("/k", $cmdLine) -WindowStyle Normal
}

function Start-Frontend([int] $DevPort, [switch] $InThisWindow) {
    if (-not (Test-Path (Join-Path $WebDir "package.json"))) {
        Write-Host "opportunity-engine: web app not found at $WebDir" -ForegroundColor Red
        exit 1
    }

    Ensure-EnvLocal -FrontPort $DevPort
    Write-Host "opportunity-engine: starting frontend -> http://localhost:$DevPort" -ForegroundColor Cyan

    $frontCmd = if ($DevPort -eq $PreferredPort) {
        "pnpm --filter @opportunity-engine/web dev"
    } else {
        "pnpm --filter @opportunity-engine/web exec next dev --turbopack --port $DevPort"
    }

    if ($InThisWindow) {
        Write-Host "opportunity-engine: stop with Ctrl+C" -ForegroundColor DarkGray
        if ($DevPort -eq $PreferredPort) {
            pnpm --filter @opportunity-engine/web dev
        } else {
            pnpm --filter @opportunity-engine/web exec next dev --turbopack --port $DevPort
        }
        exit $LASTEXITCODE
    }

    $title = "Opportunity Engine - frontend (:$DevPort)"
    $cmdLine = 'title {0} & cd /d "{1}" & {2}' -f $title, $PSScriptRoot, $frontCmd
    Start-Process -FilePath "cmd.exe" -ArgumentList @("/k", $cmdLine) -WindowStyle Normal
}

# --- entry ---

if ($Help) {
    Write-Host "Opportunity Engine local launcher" -ForegroundColor Cyan
    Write-Host "  .\go                 worker (own window) + Next.js on :3100 (this window)"
    Write-Host "  .\go -FrontOnly      Next.js only (this window)"
    Write-Host "  .\go -WorkerOnly     worker only (this window)"
    Write-Host "  .\go -Port 3100      pin the Next.js port"
    exit 0
}

if ($WorkerOnly -and $FrontOnly) {
    Write-Host "opportunity-engine: use only one of -WorkerOnly / -FrontOnly." -ForegroundColor Red
    exit 1
}

Ensure-Deps

$frontPortsToClear = if ($Port -gt 0) { @($Port) } else { @(3100..3110) }

if ($WorkerOnly) {
    Stop-OpportunityEngineDevServers -FrontPorts @() -IncludeWorker
    Start-Worker -InThisWindow
    exit 0
}

Stop-OpportunityEngineDevServers -FrontPorts $frontPortsToClear -IncludeWorker:(-not $FrontOnly)

$devPort = Find-DevPort

if ($FrontOnly) {
    Start-Frontend -DevPort $devPort -InThisWindow
    exit 0
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Opportunity Engine local stack" -ForegroundColor Cyan
Write-Host "  Frontend:  http://localhost:$devPort" -ForegroundColor Cyan
Write-Host "  Worker:    apps/worker (orchestration)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Start-Worker
Start-Sleep -Seconds 1
# Keep Next in this window so Ctrl+C stops the UI; worker stays in its own window.
Start-Frontend -DevPort $devPort -InThisWindow
