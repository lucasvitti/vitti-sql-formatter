@echo off
REM Copy the canonical formatter engine into the web page and the extension.
copy /Y "%~dp0sqlfmt\sqlfmt.js" "%~dp0web\sqlfmt.js" >nul
copy /Y "%~dp0sqlfmt\sqlfmt.js" "%~dp0extension\sqlfmt.js" >nul
echo Synced sqlfmt.js -> web\ and extension\
