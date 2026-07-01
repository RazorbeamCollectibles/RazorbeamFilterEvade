@echo off
setlocal
cd /d "%~dp0"

set "RBFE_DEPS=%LOCALAPPDATA%\RazorbeamCollectibles\RazorbeamFilterEvade\python_deps"
if not exist "%RBFE_DEPS%" mkdir "%RBFE_DEPS%"
set "PYTHONPATH=%RBFE_DEPS%;%PYTHONPATH%"

python -c "import sys; sys.path=[r'%RBFE_DEPS%']; import PySide6" >nul 2>nul
if errorlevel 1 (
    echo Installing required Python dependency: PySide6
    uv pip install --target "%RBFE_DEPS%" -r requirements.txt
    if errorlevel 1 (
        echo.
        echo Dependency install failed.
        pause
        exit /b 1
    )
)

python "%~dp0razorbeam_filter_evade.py"
