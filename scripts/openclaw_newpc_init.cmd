@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PS1=%SCRIPT_DIR%openclaw_newpc_init.ps1"

if not exist "%PS1%" (
  echo [ERROR] 找不到脚本: %PS1%
  pause
  exit /b 1
)

if "%OPENCLAW_API_KEY%"=="" (
  set /p OPENCLAW_API_KEY=请输入 codex-vip API Key:
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -ApiKey "%OPENCLAW_API_KEY%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [FAILED] 初始化失败，错误码: %EXIT_CODE%
  pause
  exit /b %EXIT_CODE%
)

echo.
echo [DONE] 初始化完成。
pause
exit /b 0
