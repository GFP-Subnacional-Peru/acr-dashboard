# Dashboard GFP Subnacional

Portal de la línea base de deforestación en las Áreas de Conservación Regional, y del registro de acuerdos de conservación. Lo publica el programa GFP Subnacional.

## Qué hace

La línea base muestra la pérdida de bosque en 9 ACR de Loreto, San Martín y Cusco. Desde el inicio se entra al mapa, a los indicadores, a la metodología, a los reportes y a las tendencias. Cada ACR se puede abrir con su propio filtro.

Los acuerdos de conservación tienen portada, mapa y marco normativo. Un acuerdo es el compromiso de una organización local con el Gobierno Regional para vigilar un ámbito del ACR. Quien firma es el Gobierno Regional. En la ficha se leen dos cifras: la del documento y la del polígono. Hoy está publicado un solo acuerdo: Illapani (001-2026-ACR Chuyapi Urusayhua), de la Asociación de Servicios Turísticos de la Catarata Illapani, en el ACR Chuyapi Urusayhua, Cusco. El documento señala 1,000 ha y el polígono mide 952 ha.

| Producto | Dirección pública | Páginas |
| --- | --- | --- |
| Línea base de deforestación | https://www.gfpsubnacional.pe/dashboard-linea-base-de-deforestacion/ | `frontend/home.html`, `index.html`, `datos.html`, `acr.html` |
| Acuerdos de conservación | https://www.gfpsubnacional.pe/acuerdos-de-conservacion/ | `frontend/acuerdos_home.html`, `acuerdos.html` |

El sitio de GFP embebe estas páginas. Deforestación y acuerdos salen del mismo programa porque comparten la API, los estilos y una sola publicación.

## Cómo está hecho

El servicio es Python con FastAPI. Entrega el HTML y la API (`/api/health`, indicadores, centroides, geometrías). El mapa es Leaflet y los gráficos son Plotly, escritos en HTML, CSS y JavaScript estáticos. Las cifras no se recalculan en cada visita: el servidor lee GeoJSON, la tabla de centroides y la serie anual que ya están en el repositorio.

`render.yaml` describe esa publicación. Un push a `main` actualiza el sitio.

## Carpetas

| Carpeta | Para qué está |
| --- | --- |
| `backend_python/` | API FastAPI. El arranque es `uvicorn main:app`. |
| `frontend/` | Páginas, estilos, scripts e imágenes. `/assets` sale de `frontend/assets`. |
| `data/cache/` | GeoJSON y centroides que la API sirve. |
| `data/incoming/` | Capas de entrada ya convertidas a GeoJSON. |
| `www/mapas/` | Mapas PDF y sus miniaturas. |
| `utils/datos_temporales_acr.R` | Serie anual por ACR. Las tendencias la leen. |
| `scripts/` | Regeneración de cachés. No corre en el servidor. |
| `.github/workflows/` | Mantiene el servicio despierto en el horario de trabajo. |

## Horario

De lunes a viernes, de 8:00 a 18:00, hora de Lima. GitHub Actions llama a `GET /api/health` desde las 7:50, para que a las 8 el sitio ya responda, y deja de llamar a las 18. A esa hora el servicio se apaga solo. La computadora de quien desarrolla no tiene que estar prendida: el aviso corre en GitHub.

Hay dos workflows, `keep-render-awake.yml` y `keep-render-awake-offset.yml`. El segundo va desfasado unos minutos por si el primero se atrasa. Los dos cubren el mismo horario.

## Correr en local

El entorno virtual está en la raíz (`.venv`), no dentro de `backend_python`.

```
cd backend_python
..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

También vale, desde la raíz: `python run_server.py`. Abre http://127.0.0.1:8000 cuando `/api/health` responde.
