param(
    [switch]$Check,
    [switch]$Stop,
    [switch]$BackendOnly,
    [string]$PythonPath = $env:MEMORY_PYTHON,
    [ValidateRange(1,65535)][int]$BackendPort = 8900,
    [ValidateRange(1,65535)][int]$FrontendPort = 3000
)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.runtime'
$statePath = Join-Path $runtimeDir 'processes.json'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

function Read-State {
    if (Test-Path -LiteralPath $statePath) {
        return @(Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json)
    }
    return @()
}
function Is-OwnedProcess($entry) {
    if ($entry.root -ne $projectRoot) { return $false }
    $proc = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
    return $proc -and ($proc.StartTime.ToUniversalTime().Ticks.ToString() -eq $entry.startTicks)
}
function Stop-Owned($entries) {
    foreach ($entry in $entries) {
        if (Is-OwnedProcess $entry) {
            & taskkill.exe /PID $entry.pid /T /F | Out-Null
            if ($LASTEXITCODE -ne 0 -and (Is-OwnedProcess $entry)) {
                throw "Could not stop owned $($entry.name) process $($entry.pid)"
            }
        }
    }
}
function Find-Python {
    if ($PythonPath) {
        if (-not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) { throw 'MEMORY_PYTHON / -PythonPath does not exist.' }
        return (Resolve-Path -LiteralPath $PythonPath).Path
    }
    $candidates = @((Join-Path $projectRoot '.venv\Scripts\python.exe'))
    $condaCommand = Get-Command conda -ErrorAction SilentlyContinue
    if ($condaCommand) {
        try {
            $environments = ((& $condaCommand.Source env list --json) -join "`n" | ConvertFrom-Json).envs
            foreach ($environment in $environments) {
                if ((Split-Path $environment -Leaf) -eq 'agent-memory') {
                    $candidates += Join-Path $environment 'python.exe'
                }
            }
        } catch { Write-Warning 'Conda discovery failed; checking remaining interpreters.' }
    }
    $pathPython = Get-Command python -ErrorAction SilentlyContinue
    if ($pathPython -and $pathPython.Source -notlike '*\WindowsApps\*') { $candidates += $pathPython.Source }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    throw 'No Python found. Create .venv, or set MEMORY_PYTHON to a Python executable.'
}
function Assert-FreePort([int]$Port) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    try { $listener.Start() }
    catch { throw "Port $Port is occupied. No existing process was stopped. Choose another port or stop its owner." }
    finally { $listener.Stop() }
}
function Save-State($entries) {
    $temporaryState = Join-Path $runtimeDir 'processes.next.json'
    ConvertTo-Json -InputObject @($entries) | Set-Content -LiteralPath $temporaryState -Encoding UTF8
    Move-Item -LiteralPath $temporaryState -Destination $statePath -Force
}
function Wait-Service($url, $proc, [int]$seconds) {
    $deadline = [DateTime]::UtcNow.AddSeconds($seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $proc.Refresh()
        if ($proc.HasExited) { throw "Service exited ($($proc.ExitCode)); see $runtimeDir logs." }
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    throw "Health check timed out: $url. See $runtimeDir logs."
}

$launcherLock = $null
$started = @()
try {
    $launcherLock = [System.IO.File]::Open((Join-Path $runtimeDir 'launcher.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    $saved = @(Read-State)
    if ($Stop) {
        Stop-Owned $saved
        if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
        Write-Host 'Stopped recorded project processes. Unrelated processes were not touched.'
        exit 0
    }
    $pythonBin = Find-Python
    $env:PYTHONUTF8 = '1'
    $env:PYTHONIOENCODING = 'utf-8'
    & $pythonBin (Join-Path $projectRoot 'Agent-Memory-Server\check_environment.py')
    if ($LASTEXITCODE -ne 0) { throw 'Backend dependencies are missing. Install Agent-Memory-Server/requirements.txt using this interpreter.' }
    Write-Host "Python: $pythonBin"
    if (-not $BackendOnly) {
        $nodeBin = (Get-Command node -ErrorAction Stop).Source
        $nodeVersion = (& $nodeBin --version).TrimStart('v')
        if ($LASTEXITCODE -ne 0 -or [version]$nodeVersion -lt [version]'20.9') { throw 'Next.js requires Node.js 20.9 or later.' }
        $nextBin = Join-Path $projectRoot 'Agent-memory-ui\node_modules\next\dist\bin\next'
        if (-not (Test-Path -LiteralPath $nextBin)) { throw 'Frontend dependencies missing; run npm ci in Agent-memory-ui.' }
        Write-Host "Node: $nodeBin"
    }
    if ($Check) {
        Write-Host 'Preflight passed. No services started.'
        exit 0
    }
    foreach ($entry in $saved) { if (Is-OwnedProcess $entry) { throw 'Project is already running. Use stop.bat first.' } }
    Assert-FreePort $BackendPort
    if (-not $BackendOnly) {
        if ($BackendPort -eq $FrontendPort) { throw 'Backend and frontend ports must differ.' }
        Assert-FreePort $FrontendPort
    }
    $backendDir = Join-Path $projectRoot 'Agent-Memory-Server'
    $frontendDir = Join-Path $projectRoot 'Agent-memory-ui'
    $env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:$BackendPort"
    $env:MEMORY_API_ORIGIN = "http://127.0.0.1:$BackendPort"
    $backend = Start-Process -FilePath $pythonBin -ArgumentList @('api.py','--host','127.0.0.1','--port',"$BackendPort") -WorkingDirectory $backendDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'backend.out.log') -RedirectStandardError (Join-Path $runtimeDir 'backend.err.log')
    $started += @{name='backend';pid=$backend.Id;startTicks=$backend.StartTime.ToUniversalTime().Ticks.ToString();root=$projectRoot}
    Save-State $started
    Wait-Service "http://127.0.0.1:$BackendPort/health" $backend 45
    if ($BackendOnly) {
        Write-Host "Engine ready: http://127.0.0.1:$BackendPort. Stop with stop.bat."
        exit 0
    }
    $frontend = Start-Process -FilePath $nodeBin -ArgumentList @(('"'+$nextBin+'"'),'dev','--hostname','127.0.0.1','--port',"$FrontendPort") -WorkingDirectory $frontendDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'frontend.out.log') -RedirectStandardError (Join-Path $runtimeDir 'frontend.err.log')
    $started += @{name='frontend';pid=$frontend.Id;startTicks=$frontend.StartTime.ToUniversalTime().Ticks.ToString();root=$projectRoot}
    Save-State $started
    Wait-Service "http://127.0.0.1:$FrontendPort" $frontend 60
    Write-Host "Ready: http://127.0.0.1:$FrontendPort (API: http://127.0.0.1:$BackendPort/docs). Stop with stop.bat."
} catch {
    if ($started.Count) {
        Stop-Owned $started
        if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
    }
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {
    if ($launcherLock) { $launcherLock.Dispose() }
}
