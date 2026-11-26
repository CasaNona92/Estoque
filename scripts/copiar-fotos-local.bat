@echo off
REM ==========================================================================
REM  Copia TODAS as fotos/notas e os backups do Cloudflare R2 para um HD externo
REM  ou para o PC da loja. Rode uma vez por mes (ou agende no Agendador de Tarefas).
REM
REM  Pre-requisitos (uma vez so):
REM   1) Instale o rclone: winget install Rclone.Rclone
REM   2) Configure os 2 "remotes" com: rclone config
REM      - r2-fotos   : Storage = s3, provider = Cloudflare, access key/secret do bucket estoque-fotos,
REM                     endpoint = https://SEU_ACCOUNT_ID.r2.cloudflarestorage.com
REM      - r2-backups : igual, com as chaves do bucket estoque-backups
REM      (modelo em scripts\rclone-exemplo.conf)
REM   3) Ajuste DESTINO abaixo para a letra do HD externo.
REM ==========================================================================

setlocal
set DESTINO=E:\Backup-Estoque
set DATA=%date:~6,4%-%date:~3,2%-%date:~0,2%

where rclone >nul 2>nul
if errorlevel 1 (
  echo [ERRO] rclone nao encontrado. Instale com: winget install Rclone.Rclone
  pause
  exit /b 1
)

if not exist "%DESTINO%" (
  echo [ERRO] Pasta de destino %DESTINO% nao existe. Conecte o HD externo ou ajuste DESTINO.
  pause
  exit /b 1
)

echo Copiando fotos e notas (estoque-fotos)...
rclone copy r2-fotos:estoque-fotos "%DESTINO%\fotos" --progress --transfers 8 --checkers 16 --log-file "%DESTINO%\copia-%DATA%.log" --log-level INFO
if errorlevel 1 goto erro

echo Copiando backups do banco (estoque-backups)...
rclone copy r2-backups:estoque-backups "%DESTINO%\backups-banco" --progress --log-file "%DESTINO%\copia-%DATA%.log" --log-level INFO
if errorlevel 1 goto erro

echo.
echo Concluido! Copia em %DESTINO% (log: copia-%DATA%.log)
echo Lembre: os backups do banco estao criptografados com age. A chave privada fica com o dono.
pause
exit /b 0

:erro
echo [ERRO] A copia falhou. Veja o log em %DESTINO%\copia-%DATA%.log
pause
exit /b 1
