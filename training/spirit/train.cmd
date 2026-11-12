@echo off
rem Start a training run, or resume it if it already has checkpoints, logging to its train.log.
rem
rem   training\spirit\train.cmd                 run "main" with the defaults
rem   training\spirit\train.cmd main --updates 8000
rem
rem Activates the `train` conda env (set CONDA_BAT if conda lives elsewhere). To run it
rem detached (keeps going after the terminal closes):
rem   powershell -c "Start-Process cmd -ArgumentList '/c','training\spirit\train.cmd' -WindowStyle Hidden"
rem Stop it with an empty training\runs\spirit\<run>\STOP file (it saves first). If the
rem trainer crashes (non-zero exit; it saves on the way out), it resumes after 60 s, up to 3 times.
setlocal
cd /d "%~dp0..\.."
if not defined CONDA_BAT set "CONDA_BAT=C:\ProgramData\anaconda3\condabin\conda.bat"
call "%CONDA_BAT%" activate train || exit /b 1
set "RUN=%~1"
if "%RUN%"=="" set "RUN=main"
set "DIR=training\runs\spirit\%RUN%"
if not exist "%DIR%" mkdir "%DIR%"
set "RESUME="
if exist "%DIR%\ckpt\update_*.pt" set "RESUME=--resume"
set PYTHONUNBUFFERED=1
rem CUDA's lazy module loading (the default): eager loading would set aside 8.5 GB of RAM instead of ~3 GB
set CUDA_MODULE_LOADING=LAZY
echo ==== %DATE% %TIME% start %RUN% %RESUME% %2 %3 %4 %5 %6 %7 %8 %9 >> "%DIR%\train.log"
set TRIES=0
:again
python training\spirit\train.py --run %RUN% %RESUME% %2 %3 %4 %5 %6 %7 %8 %9 >> "%DIR%\train.log" 2>&1
set "CODE=%ERRORLEVEL%"
if "%CODE%"=="0" exit /b 0
set /a TRIES+=1
if %TRIES% GTR 3 (
  echo ==== %DATE% %TIME% exited with code %CODE% again: giving up after 3 restarts >> "%DIR%\train.log"
  exit /b %CODE%
)
echo ==== %DATE% %TIME% exited with code %CODE%: resuming from the last save in 60 s, restart %TRIES% of 3 >> "%DIR%\train.log"
ping -n 61 127.0.0.1 >nul
set "RESUME=--resume"
goto again
