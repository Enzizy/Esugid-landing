@echo off
rem Double-click to serve the E-sugid showcase locally and open it in your browser.
rem Add -Present to open in defense mode, or -Static for the no-motion version.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_PREVIEW.ps1" %*
