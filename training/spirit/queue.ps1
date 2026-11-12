<#
Queue a Spirit Island training run: wait until the machine has room for it, then start it (through
train.cmd, so it is logged to the run's train.log, resumes if it has checkpoints, and restarts
itself after a crash).

  powershell -NoProfile -File training\spirit\queue.ps1 -Run main -TrainArgs "@training/spirit/round4.args"

Detached (keeps waiting after the terminal closes):

  powershell -NoProfile -Command "Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File training\spirit\queue.ps1 -Run main -TrainArgs @training/spirit/round4.args'"

Room means: the GPU on average no more than -MaxGpuUtil % busy (-Samples readings, 2 s apart), at
least -MinFreeMB of its memory free, at least -MinFreeRamGB of system memory available, and at least
-MinFreeCommitGB of commit headroom (Windows' limit on memory set aside: physical memory plus the
page file). Measured for round 5 (8 env workers x 56 games, evals on the CPU): the trainer peaks at
about 2 GB of physical memory and sets aside about 5.5 GB (CUDA's libraries, mostly never touched),
the env workers about 70 MB each, an eval about 0.5 GB / 1.2 GB; so about 3-3.5 GB of RAM and 7.5 GB
of commit. Running out of commit is the likely cause of an env worker dying mid-run. Other
training jobs may run alongside if there is room; -Exclusive waits until none is running (any python
process whose arguments mention train / rl.py, other than this project's tools). The run starts after
-QuietChecks checks in a row (one every -PollSeconds) find room. While waiting, a banner at the top of
the run's progress.md shows the queue's status (the trainer rewrites the page once it starts) and
queue.log records each change. To cancel, delete the run's QUEUED file. -DryRun checks once, prints
the status, and exits without starting anything.
#>
param(
  [string]$Run = 'main',
  [string]$TrainArgs = '',
  [int]$PollSeconds = 60,
  [int]$QuietChecks = 2,
  [int]$MaxGpuUtil = 50,
  [int]$Samples = 5,
  [int]$MinFreeMB = 4000,
  [int]$MinFreeRamGB = 4,
  [int]$MinFreeCommitGB = 10,
  [switch]$Exclusive,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dir = Join-Path $repo "training\runs\spirit\$Run"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$log = Join-Path $dir 'queue.log'
$flag = Join-Path $dir 'QUEUED'
$progress = Join-Path $dir 'progress.md'
$since = Get-Date
$utf8 = New-Object System.Text.UTF8Encoding $false

function Say([string]$msg) {
  Add-Content -Path $log -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
}

function Get-OtherTraining {
  # python processes training something else; the interpreter path is left out (the conda env is called "train")
  @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" | ForEach-Object {
      $cl = [string]$_.CommandLine
      $rest = if ($cl.StartsWith('"')) { $cl.Substring([Math]::Max(1, $cl.IndexOf('"', 1) + 1)) } else { ($cl -split '\s+', 2)[-1] }
      if ($rest -match '(?i)train|\brl\.py' -and $rest -notmatch 'training[\\/]spirit[\\/]') {
        if ($rest -match '([\w.-]+[\\/][\w.-]+\.py|-m\s+[\w.]+)') { $Matches[1] } else { 'python' }
      }
    })
}

function Get-Gpu {
  $util = @(); $free = [int]::MaxValue
  for ($i = 0; $i -lt $Samples; $i++) {
    if ($i) { Start-Sleep -Seconds 2 }
    $line = (& nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits | Select-Object -First 1)
    $p = $line.Split(',') | ForEach-Object { [int]$_.Trim() }
    $util += $p[0]; $free = [Math]::Min($free, $p[2] - $p[1])
  }
  @{ Util = [int](($util | Measure-Object -Average).Average); FreeMB = $free }
}

function Get-Memory {
  $o = Get-CimInstance Win32_OperatingSystem
  @{ RamGB = [Math]::Round($o.FreePhysicalMemory / 1MB, 1); CommitGB = [Math]::Round($o.FreeVirtualMemory / 1MB, 1) }
}

function Remove-Banner([string]$text) {
  [regex]::Replace($text, '(?s)<!-- queue -->.*?<!-- /queue -->\r?\n(\r?\n)?', '')
}

function Write-Status([string]$state) {
  $exclusive = if ($Exclusive) { ', and no other training running' } else { '' }
  $banner = @(
    '<!-- queue -->',
    "> **Queued** since $($since.ToString('yyyy-MM-dd HH:mm')) (``$TrainArgs``): it starts by itself once the machine has room.",
    "> Last check $(Get-Date -Format 'yyyy-MM-dd HH:mm'): $state",
    "> Room = GPU on average at most $MaxGpuUtil% busy, $MinFreeMB MB of GPU memory, $MinFreeRamGB GB of RAM and $MinFreeCommitGB GB of commit headroom free$exclusive, $QuietChecks checks in a row ($PollSeconds s apart). Queue log: ``queue.log``; to cancel, delete ``training/runs/spirit/$Run/QUEUED``.",
    '<!-- /queue -->',
    ''
  ) -join "`n"
  if (Test-Path $progress) {
    $text = Remove-Banner ([IO.File]::ReadAllText($progress, $utf8))
    $parts = $text -split "`n", 2
    $body = if ($parts.Count -gt 1) { $parts[1].TrimStart("`r", "`n") } else { '' }
    $out = $parts[0].TrimEnd("`r") + "`n`n" + $banner + "`n" + $body
  } else {
    $out = "# Spirit Island training progress: run ``$Run```n`n" + $banner
  }
  [IO.File]::WriteAllText($progress, $out, $utf8)
}

function Clear-Status {
  if (Test-Path $progress) { [IO.File]::WriteAllText($progress, (Remove-Banner ([IO.File]::ReadAllText($progress, $utf8))), $utf8) }
}

if (-not $DryRun) {
  Set-Content -Path $flag -Value ("queued {0} {1}" -f (Get-Date -Format s), $TrainArgs)
  Say "queued run '$Run' ($TrainArgs)"
}
$quiet = 0
$last = ''
while ($true) {
  if (-not $DryRun -and -not (Test-Path $flag)) { Clear-Status; Say 'QUEUED file removed: cancelled'; exit 0 }
  $others = @(Get-OtherTraining | Sort-Object -Unique)
  $gpu = Get-Gpu
  $mem = Get-Memory
  $ram = $mem.RamGB
  $why = @()
  if ($Exclusive -and $others.Count) { $why += "other training running: $($others -join ', ')" }
  if ($gpu.Util -gt $MaxGpuUtil) { $why += "GPU $($gpu.Util)% busy on average" }
  if ($gpu.FreeMB -lt $MinFreeMB) { $why += "$($gpu.FreeMB) MB of GPU memory free" }
  if ($ram -lt $MinFreeRamGB) { $why += "$ram GB of RAM free" }
  if ($mem.CommitGB -lt $MinFreeCommitGB) { $why += "$($mem.CommitGB) GB of commit headroom" }
  $also = if ($others.Count -and -not $Exclusive) { " Also running: $($others -join ', ')." } else { '' }
  if ($why.Count) { $quiet = 0; $state = "waiting: $($why -join '; ').$also" }
  else { $quiet++; $state = "room (GPU $($gpu.Util)% busy, $($gpu.FreeMB) MB GPU, $ram GB RAM and $($mem.CommitGB) GB commit free), check $quiet of $QuietChecks.$also" }
  if ($DryRun) { Write-Output $state; exit 0 }
  Write-Status $state
  if ($state -ne $last -and -not ($state -like 'room*' -and $last -like 'room*')) { Say $state }
  $last = $state
  if ($quiet -ge $QuietChecks) { break }
  Start-Sleep -Seconds $PollSeconds
}
Remove-Item $flag
Clear-Status
Say 'starting the trainer (train.cmd)'
$argv = @($Run) + @($TrainArgs -split '\s+' | Where-Object { $_ })
& (Join-Path $PSScriptRoot 'train.cmd') @argv
Say "trainer exited (code $LASTEXITCODE)"
