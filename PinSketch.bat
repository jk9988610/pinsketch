@echo off
start "PinSketch" msedge --app="file:///E:/tools/PinSketch/index.html" --start-maximized
if errorlevel 1 start "PinSketch" "E:\tools\PinSketch\index.html"
