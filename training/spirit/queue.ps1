<#
Queue a Spirit Island training run: wait until no other training is using the GPU, then start it
(through train.cmd, so it is logged to the run's train.log and resumes if it has checkpoints).

  powershell -NoProfile -File training\spirit\queue.ps1 -Run main -TrainArgs "--init training/runs/spirit/main/policies/update_001000.json"

Detached (keeps waiting after the terminal closes):

  powershell -NoProfile -Command "Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File training\spirit\queue.ps1 -Run main'"

The GPU counts as busy while another training process runs (a python process with train.py in its
command line, other than this project's trainer), while it is more than -MaxGpuUtil % busy, or while
less than -MinFreeMB of its memory is free. The run starts after -QuietChecks checks in a row (one
every -PollSeconds) find it free. While waiting, the run's progress.md shows the queue's status (the
trainer replaces it once it starts) and queue.log records each change. To cancel, delete the run's
QUEUED file. -DryRun checks once, writes the status, and exits without starting anything.
#>
param(
  [string]$Run = 'main',
  [string]$TrainArgs = '',
  [int]$PollSeconds = 60,
  [int]$QuietChecks = 3,
  [int]$MaxGpuUtil = 30,
  [int]$MinFreeMB = 4000,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dir = Join-Path $repo "training\runs\spirit\$Run"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$log = Join-Path $dir 'queue.log'
$flag = Join-Path $dir 'QUEUED'
$progress = Join-Path $dir 'progress.md'
$baseline = Join-Path $dir 'per-spirit-u1000.md'
$since = Get-Date

function Say([string]$msg) {
  Add-Content -Path $log -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
}

function Get-OtherTraining {
  @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object {
      $_.CommandLine -match 'train\.py' -and $_.CommandLine -notmatch 'training[\\/]spirit[\\/]train\.py'
    })
}

function Get-Gpu {
  $line = (& nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits | Select-Object -First 1)
  $p = $line.Split(',') | ForEach-Object { [int]$_.Trim() }
  @{ Util = $p[0]; FreeMB = $p[2] - $p[1] }
}

function Write-Status([string]$state) {
  $text = @(
    "# Spirit Island training progress: run ``$Run``",
    '',
    "**Queued** since $($since.ToString('yyyy-MM-dd HH:mm')): it starts by itself once no other training is using the GPU.",
    '',
    "Last check $(Get-Date -Format 'yyyy-MM-dd HH:mm'): $state",
    '',
    "It starts after $QuietChecks free checks in a row, one every $PollSeconds s (free = no other train.py running, GPU under $MaxGpuUtil% busy, at least $MinFreeMB MB of its memory free). Once it is running, this page shows each Spirit's rung, its probe win rate there, its share of the games and its promotions, and refreshes every 100 updates.",
    '',
    "Arguments: ``$TrainArgs``. Queue log: ``queue.log``. To cancel the queue, delete ``training/runs/spirit/$Run/QUEUED``.",
    ''
  )
  if (Test-Path $baseline) { $text += @('## Where it starts', '') + (Get-Content -Encoding UTF8 $baseline | Select-Object -Skip 1) }
  [System.IO.File]::WriteAllLines($progress, [string[]]$text, (New-Object System.Text.UTF8Encoding $false))
}

Set-Content -Path $flag -Value ("queued {0} {1}" -f (Get-Date -Format s), $TrainArgs)
Say "queued run '$Run' ($TrainArgs)"
$quiet = 0
$last = ''
while ($true) {
  if (-not (Test-Path $flag)) { Say 'QUEUED file removed: cancelled'; exit 0 }
  $others = @(Get-OtherTraining)
  $gpu = Get-Gpu
  $why = @()
  if ($others.Count) {
    $names = $others | ForEach-Object { if ($_.CommandLine -match '(training[\\/][^\s]+[\\/]train\.py)') { $Matches[1] } else { 'train.py' } }
    $why += "other training running: $(($names | Sort-Object -Unique) -join ', ')"
  }
  if ($gpu.Util -gt $MaxGpuUtil) { $why += "GPU $($gpu.Util)% busy" }
  if ($gpu.FreeMB -lt $MinFreeMB) { $why += "$($gpu.FreeMB) MB of GPU memory free" }
  if ($why.Count) { $quiet = 0; $state = "waiting: $($why -join '; ')." }
  else { $quiet++; $state = "GPU free ($($gpu.Util)% busy, $($gpu.FreeMB) MB free), check $quiet of $QuietChecks." }
  Write-Status $state
  if ($state -ne $last -and -not ($state -like 'GPU free*' -and $last -like 'GPU free*')) { Say $state }
  $last = $state
  if ($DryRun) { Remove-Item $flag; Say 'dry run: not starting'; exit 0 }
  if ($quiet -ge $QuietChecks) { break }
  Start-Sleep -Seconds $PollSeconds
}
Remove-Item $flag
Say 'starting the trainer (train.cmd)'
$argv = @($Run) + @($TrainArgs -split '\s+' | Where-Object { $_ })
& (Join-Path $PSScriptRoot 'train.cmd') @argv
Say "trainer exited (code $LASTEXITCODE)"
