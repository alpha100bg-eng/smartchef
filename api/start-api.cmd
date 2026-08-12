@echo off
REM Lance l'API SmartChef en ecoutant sur le reseau local (test telephone).
REM
REM Pourquoi ce script plutot que ".venv\Scripts\python.exe -m uvicorn ..." :
REM le pare-feu Windows autorise le Python de uv mais PAS l'executable du venv.
REM On lance donc l'interpreteur autorise en pointant sur les paquets du venv,
REM ce qui evite d'avoir a creer une regle de pare-feu (droits admin requis).

setlocal
cd /d "%~dp0"

set "VENV_SITE=%~dp0.venv\Lib\site-packages"
set "ALLOWED_PY=%APPDATA%\uv\python\cpython-3.12.13-windows-x86_64-none\python.exe"

if exist "%ALLOWED_PY%" (
    echo Demarrage avec l'interpreteur autorise par le pare-feu...
    set "PYTHONPATH=%VENV_SITE%"
    "%ALLOWED_PY%" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
) else (
    echo Interpreteur uv introuvable, repli sur le venv.
    echo Si le telephone ne joint pas l'API, c'est le pare-feu Windows.
    ".venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
)

endlocal
