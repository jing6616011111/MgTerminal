@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "CLI_SCRIPT=%SCRIPT_DIR%magies-terminal-tool-cli.cjs"
set "APP_EXE="

if defined MAGIES_TERMINAL_CLI_ELECTRON_EXEC_PATH if exist "%MAGIES_TERMINAL_CLI_ELECTRON_EXEC_PATH%" set "APP_EXE=%MAGIES_TERMINAL_CLI_ELECTRON_EXEC_PATH%"
if not defined APP_EXE if exist "%SCRIPT_DIR%..\..\..\..\MagiesTerminal.exe" set "APP_EXE=%SCRIPT_DIR%..\..\..\..\MagiesTerminal.exe"
if not defined APP_EXE if exist "%SCRIPT_DIR%..\..\..\..\magiesTerminal.exe" set "APP_EXE=%SCRIPT_DIR%..\..\..\..\magiesTerminal.exe"

if defined APP_EXE (
  set "ELECTRON_RUN_AS_NODE=1"
  "%APP_EXE%" "%CLI_SCRIPT%" %*
  exit /b %ERRORLEVEL%
)

where node >nul 2>nul
if not errorlevel 1 (
  node "%CLI_SCRIPT%" %*
  exit /b %ERRORLEVEL%
)

echo Failed to locate the bundled MagiesTerminal runtime for magies-terminal-tool-cli. 1>&2
exit /b 1
