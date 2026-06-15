@echo off
cd /d "%~dp0"
echo [%date% %time%] Running score update script... >> scraper.log
node update-scores.js >> scraper.log 2>&1
echo [%date% %time%] Score update finished. >> scraper.log
echo Done! Please check scraper.log for details.
