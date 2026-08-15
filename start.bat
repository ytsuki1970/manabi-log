@echo off
rem manabi-log launcher (ASCII only)
cd /d "%~dp0"
start "" /min python -m http.server 8931
powershell -NoProfile -Command "$u='http://localhost:8931/'; for($i=0;$i -lt 60;$i++){ try{ Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 1 ^| Out-Null; break }catch{ Start-Sleep -Milliseconds 250 } }; Start-Process $u"
