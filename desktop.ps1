param(
    [switch]$BuildOnly,
    [string]$PythonPath = $env:MEMORY_PYTHON,
    [ValidateRange(1,65535)][int]$BackendPort = 8900
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$framework = Join-Path $env:windir 'Microsoft.NET\Framework64\v4.0.30319'
$compiler = Join-Path $framework 'csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework is required.' }

$desktop = Join-Path $root 'Agent-Memory-Desktop'
$runtime = Join-Path $root '.runtime\desktop'
$sources = @(Get-ChildItem -LiteralPath $desktop -Filter '*.cs' -File | Sort-Object Name)
$sourceHashes = (Get-FileHash -LiteralPath $sources.FullName).Hash -join ''
$hasher = [System.Security.Cryptography.SHA256]::Create()
try {
    $version = ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::ASCII.GetBytes($sourceHashes)))).Replace('-', '').Substring(0, 16)
} finally { $hasher.Dispose() }
$build = Join-Path $runtime $version
$exe = Join-Path $build 'AgentMemory.exe'
New-Item -ItemType Directory -Path $build -Force | Out-Null
if (-not (Test-Path -LiteralPath $exe)) {
    $references = @('WPF\PresentationFramework.dll','WPF\PresentationCore.dll','WPF\WindowsBase.dll','System.Xaml.dll','System.Net.Http.dll','System.Web.Extensions.dll','System.Windows.Forms.dll') |
        ForEach-Object { '/reference:' + (Join-Path $framework $_) }
    $pending = Join-Path $build "AgentMemory-$PID.exe"
    try {
        & $compiler /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 "/out:$pending" @references $sources.FullName
        if ($LASTEXITCODE -ne 0) { throw 'Desktop compilation failed.' }
        try { [IO.File]::Move($pending, $exe) }
        catch [IO.IOException] { if (-not (Test-Path -LiteralPath $exe)) { throw } }
    } finally {
        if (Test-Path -LiteralPath $pending) { Remove-Item -LiteralPath $pending }
    }
}
if ($BuildOnly) { Write-Host $exe; exit 0 }

$savedPython = Join-Path $runtime 'python-path.txt'
if ($PythonPath) {
    $PythonPath = (Resolve-Path -LiteralPath $PythonPath).Path
    Set-Content -LiteralPath $savedPython -Value $PythonPath -Encoding UTF8
} elseif (Test-Path -LiteralPath $savedPython) {
    $candidate = (Get-Content -LiteralPath $savedPython -Raw).Trim()
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { $PythonPath = $candidate }
}
$origin = "http://127.0.0.1:$BackendPort"
try {
    $engine = Invoke-RestMethod "$origin/api/stats" -TimeoutSec 2
    if ($null -eq $engine.total_chunks -or $null -eq $engine.namespaces) { throw 'Unexpected engine response.' }
} catch {
    $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'start.ps1'),'-BackendOnly','-BackendPort',$BackendPort)
    if ($PythonPath) { $arguments += @('-PythonPath',$PythonPath) }
    & powershell.exe @arguments
    if ($LASTEXITCODE -ne 0) { throw 'The local engine could not start.' }
}
Start-Process -FilePath $exe -ArgumentList @('"' + $root + '"', $origin)
