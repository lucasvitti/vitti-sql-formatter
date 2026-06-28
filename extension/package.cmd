@echo off
REM Build a clean store-ready zip of the extension (manifest at the zip root).
REM Excludes dev files (gen-icons.js, *.md, the zip itself).
setlocal
cd /d "%~dp0"
set OUT=vitti-sql-formatter-v1.0.0.zip
if exist "%OUT%" del "%OUT%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path 'manifest.json','popup.html','popup.js','content.js','background.js','sqlfmt.js','icons' -DestinationPath '%OUT%' -Force; Write-Host ('Packed ' + (Get-Item '%OUT%').Length + ' bytes -> %OUT%')"
echo Done. Upload %OUT% to the Chrome Web Store / Edge Partner Center.
