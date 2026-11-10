@echo off
rem Start a training run, or resume it if it already has checkpoints, logging to its train.log.
rem
rem   training\spirit\train.cmd                 run "main" with the defaults
rem   training\spirit\train.cmd main --updates 8000
rem
rem Activates the `train` conda env (set CONDA_BAT if conda lives elsewhere). To run it
rem detached (keeps going after the terminal closes):
rem   powershell -c "Start-Process cmd -ArgumentList '/c','training\spirit\train.cmd' -WindowStyle Hidden"
rem Stop it with an empty training\runs\spirit\<run>\STOP file (it saves first).
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
echo ==== %DATE% %TIME% start %RUN% %RESUME% %2 %3 %4 %5 %6 %7 %8 %9 >> "%DIR%\train.log"
python training\spirit\train.py --run %RUN% %RESUME% %2 %3 %4 %5 %6 %7 %8 %9 >> "%DIR%\train.log" 2>&1
