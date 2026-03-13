Set WshShell = CreateObject("WScript.Shell")

' Kill any existing ocr_server processes to avoid zombies
WshShell.Run "taskkill /F /FI ""IMAGENAME eq pythonw.exe"" /FI ""WINDOWTITLE eq ocr_server""", 0, True
WshShell.Run "cmd /c for /f ""tokens=2"" %a in ('netstat -ano ^| findstr 127.0.0.1:7331 ^| findstr LISTENING') do taskkill /F /PID %a", 0, True

WScript.Sleep 1000

' Start the OCR server silently
Dim scriptDir
scriptDir = Replace(WScript.ScriptFullName, WScript.ScriptName, "")
WshShell.Run "pythonw """ & scriptDir & "ocr_server.py""", 0, False
