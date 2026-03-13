Set WshShell = CreateObject("WScript.Shell")

' Kill any existing ocr_server processes to avoid zombies
WshShell.Run "cmd /c for /f ""tokens=2"" %a in ('wmic process where ""commandline like '%%ocr_server.py%%'"" get processid ^| findstr /r [0-9]') do taskkill /F /PID %a", 0, True
WshShell.Run "cmd /c for /f ""tokens=2"" %a in ('netstat -ano ^| findstr 127.0.0.1:7331 ^| findstr LISTENING') do taskkill /F /PID %a", 0, True

WScript.Sleep 1000

' Start the OCR server silently
Dim scriptDir
scriptDir = Replace(WScript.ScriptFullName, WScript.ScriptName, "")
WshShell.Run "cmd /c python -u """ & scriptDir & "ocr_server.py"" > """ & scriptDir & "ocr_server.log"" 2>&1", 0, False
