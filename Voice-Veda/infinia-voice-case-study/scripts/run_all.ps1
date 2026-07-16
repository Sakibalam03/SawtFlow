param(
    [ValidateSet('smoke', 'full')]
    [string]$Mode = 'smoke'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$runArgs = if ($Mode -eq 'smoke') { '--repetitions 1 --warmup-runs 0' } else { '' }
cmd /c "conda run -n infinia-chatterbox python src/run_chatterbox.py --variant mtl-v3 $runArgs"
cmd /c "conda run -n infinia-chatterbox python src/run_chatterbox.py --variant turbo $runArgs"
cmd /c "conda run -n infinia-xtts python src/run_xtts.py $runArgs"
cmd /c "conda run -n infinia-indicf5 python src/run_indicf5.py $runArgs"

