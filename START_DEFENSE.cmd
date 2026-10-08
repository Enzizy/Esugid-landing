@echo off
rem Double-click on the defense laptop: serves the showcase locally and opens it in defense mode.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_PREVIEW.ps1" -Present
