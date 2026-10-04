# Carga (o recarga) las alertas de las 3 GDB oficiales en la base ATD local.
# Uso:  powershell -ExecutionPolicy Bypass -File db\carga\migrar_gdb.ps1 [-GdbDir "ruta\a\GDB"]
param(
    [string]$GdbDir = "$env:USERPROFILE\Desktop\GFP-Subnacional\2026\LBD_2026\reporte_atd_loreto\output\salidas\Informe_ATD_preliminar\GDB"
)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot\..\..")

if (-not (Test-Path $GdbDir)) { throw "No existe la carpeta de GDB: $GdbDir" }
$env:ATD_GDB_DIR = (Resolve-Path $GdbDir).Path

Write-Host "1/4 Levantando base y API (Flyway crea las tablas)..." -ForegroundColor Cyan
docker compose up -d --build db api
if ($LASTEXITCODE -ne 0) { throw "docker compose up falló" }

Write-Host "2/4 Esperando a que la API aplique el esquema..." -ForegroundColor Cyan
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
    try { Invoke-RestMethod http://localhost:8081/api/atd/salud -TimeoutSec 3 | Out-Null; $ok = $true; break } catch { Start-Sleep 3 }
}
if (-not $ok) { docker compose logs --tail 40 api; throw "La API no respondió" }

Write-Host "3/4 Copiando capas de las GDB a staging (GDAL)..." -ForegroundColor Cyan
docker compose run --rm gdal sh -c "tr -d '\r' < /carga/cargar_staging.sh > /tmp/c.sh && bash /tmp/c.sh"
if ($LASTEXITCODE -ne 0) { throw "La copia a staging falló" }

Write-Host "4/4 Normalizando hacia las tablas ATD..." -ForegroundColor Cyan
docker compose exec -T db psql -U atd -d atd -f /carga/normalizar.sql
if ($LASTEXITCODE -ne 0) { throw "La normalización falló" }

Write-Host "Listo: http://localhost:8081/api/atd/territorios" -ForegroundColor Green
