@echo off
echo ============================================
echo  YouTube Sub Blur - Mining Setup
echo ============================================
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not on PATH.
    echo         Download from https://www.python.org/downloads/
    echo         Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)
echo [OK] Python found

:: Install Python packages
echo.
echo Installing Python packages...
pip install meikiocr owocr numpy Pillow yt-dlp
if %errorlevel% neq 0 (
    echo [WARNING] Some packages may have failed to install.
) else (
    echo [OK] Python packages installed
)

:: Check ffmpeg
echo.
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] ffmpeg not found. Attempting install via winget...
    winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements >nul 2>&1
    if %errorlevel% neq 0 (
        echo [WARNING] Could not install ffmpeg automatically.
        echo           Install manually from https://ffmpeg.org/download.html
        echo           or run: winget install Gyan.FFmpeg
    ) else (
        echo [OK] ffmpeg installed via winget
        echo     You may need to restart your terminal for ffmpeg to be on PATH.
    )
) else (
    echo [OK] ffmpeg found
)

:: Check yt-dlp
echo.
yt-dlp --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] yt-dlp not found on PATH. It was installed via pip.
    echo           Try restarting your terminal.
) else (
    echo [OK] yt-dlp found
)

:: Copy startup script
echo.
echo Installing auto-start script...
copy /Y "%~dp0start_ocr.vbs" "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\start_ocr.vbs" >nul
echo [OK] OCR server will auto-start on login

:: Remind about AnkiConnect
echo.
echo ============================================
echo  Setup complete!
echo ============================================
echo.
echo  Remaining manual step:
echo    Install AnkiConnect in Anki:
echo    Anki ^> Tools ^> Add-ons ^> Get Add-ons
echo    Paste code: 2055492159
echo.
echo  To start the OCR server now:
echo    python ocr_server.py
echo.
echo  Or just restart your PC and everything
echo  will start automatically.
echo ============================================
pause
