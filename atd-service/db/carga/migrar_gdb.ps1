# Carga (o recarga) las alertas de las 3 GDB oficiales en la base ATD local.
# Uso:  powershell -ExecutionPolicy Bypass -File db\carga\migrar_gdb.ps1 [-GdbDir "ruta\a\GDB"] [-GdbLoretoDir "ruta"]
# Loreto se toma de la GDB completa de ATD_Loreto (todas las alertas fotointerpretadas del año).
param(
    [string]$GdbDir = "$env:USERPROFILE\Desktop\GFP-Subnacional\2026\LBD_2026\reporte_atd_loreto\output\salidas\Informe_ATD_preliminar\GDB",
    [string]$GdbLoretoDir = "$env:USERPROFILE\Desktop\GFP-Subnacional\2026\LBD_2026\reporte_atd_loreto\output\salidas\ATD_Loreto\GDB"
)
# 'Continue': en PowerShell 5 la salida de progreso de docker por stderr corta el script con 'Stop'.
$ErrorActionPreference = 'Continue'
Set-Location (Resolve-Path "$PSScriptRoot\..\..")

if (-not (Test-Path $GdbDir)) { throw "No existe la carpeta de GDB: $GdbDir" }
$env:ATD_GDB_DIR = (Resolve-Path $GdbDir).Path
if (Test-Path $GdbLoretoDir) {
    $env:ATD_GDB_LORETO_DIR = (Resolve-Path $GdbLoretoDir).Path
    Write-Host "Loreto desde: $env:ATD_GDB_LORETO_DIR" -ForegroundColor DarkCyan
}
# San Martín y Cusco salen de la GDB completa de cada región, no del informe preliminar.
$salidas = Split-Path (Split-Path $GdbLoretoDir -Parent) -Parent
$GdbSanMartinDir = Join-Path $salidas 'ATD_San_Martin\GDB'
$GdbCuscoDir = Join-Path $salidas 'ATD_Cuzco\GDB'
$montajes = @()
function Add-Montaje([string]$hostDir, [string]$destino) {
    if (-not (Test-Path $hostDir)) { return }
    $h = ((Resolve-Path $hostDir).Path -replace '\\', '/')
    $script:montajes += "${h}:${destino}:ro"
    Write-Host "$destino desde: $h" -ForegroundColor DarkCyan
}
Add-Montaje $GdbSanMartinDir '/gdb_san_martin'
Add-Montaje $GdbCuscoDir '/gdb_cusco'

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
$run = @('compose', 'run', '--rm')
foreach ($m in $montajes) { $run += @('-v', $m) }
$run += @('gdal', 'sh', '-c', "tr -d '\r' < /carga/cargar_staging.sh > /tmp/c.sh && bash /tmp/c.sh")
& docker @run
if ($LASTEXITCODE -ne 0) { throw "La copia a staging falló" }

Write-Host "4/4 Normalizando hacia las tablas ATD..." -ForegroundColor Cyan
docker compose exec -T db psql -U atd -d atd -f /carga/normalizar.sql
if ($LASTEXITCODE -ne 0) { throw "La normalización falló" }

Write-Host "Listo: http://localhost:8081/api/atd/territorios" -ForegroundColor Green
