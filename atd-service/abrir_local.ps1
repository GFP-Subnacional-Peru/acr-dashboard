# Levanta el sistema ATD en esta PC y abre la vista previa en el navegador.
# 'Continue': en PowerShell 5 la salida de error de docker con 'Stop' corta el script aunque Docker solo esté cerrado.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

function Esperar($mensaje, [scriptblock]$prueba, $intentos = 60) {
    Write-Host $mensaje -ForegroundColor Cyan
    for ($i = 0; $i -lt $intentos; $i++) {
        if (& $prueba) { return $true }
        Start-Sleep 3
    }
    return $false
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    $ok = Esperar "Abriendo Docker Desktop (puede tardar 1 minuto)..." { docker info *> $null; $LASTEXITCODE -eq 0 }
    if (-not $ok) { throw "Docker Desktop no arrancó. Ábrelo manualmente y vuelve a intentar." }
}

Write-Host "Levantando base PostGIS y servicio Java..." -ForegroundColor Cyan
docker compose up -d --build db api 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "No se pudo levantar docker compose" }

$ok = Esperar "Esperando al servicio Java..." {
    try { Invoke-RestMethod http://localhost:8081/api/atd/salud -TimeoutSec 3 | Out-Null; $true } catch { $false }
}
if (-not $ok) { docker compose logs --tail 40 api; throw "El servicio Java no respondió" }

$salud = Invoke-RestMethod http://localhost:8081/api/atd/salud
if ($salud.alertas -eq 0) {
    Write-Host "La base está vacía: cargando las 3 GDB por primera vez..." -ForegroundColor Yellow
    & "$PSScriptRoot\db\carga\migrar_gdb.ps1"
}

Write-Host ""
Write-Host "Listo. Vista previa:        http://localhost:8081/" -ForegroundColor Green
Write-Host "Base para QGIS:             host localhost, puerto 5433, base atd, usuario atd, clave atd_local" -ForegroundColor Green
Write-Host "Para apagar todo:           docker compose stop   (los datos se conservan)" -ForegroundColor Green
Start-Process "http://localhost:8081/"
