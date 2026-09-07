@echo off
cd /d "%~dp0"
call node_modules\.bin\next build > build-out.txt 2>&1