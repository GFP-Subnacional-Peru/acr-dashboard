# Dashboard GFP Subnacional

Servicio web de la línea base de deforestación y del portal de acuerdos de conservación.
Los dos productos salen del mismo programa Python y de la misma publicación.

| Producto | Dirección pública | Páginas |
| --- | --- | --- |
| Línea base de deforestación | https://acr-dashboard-5iqz.onrender.com/ | `frontend/home.html`, `index.html`, `datos.html`, `acr.html` |
| Acuerdos de conservación | https://acr-dashboard-5iqz.onrender.com/acuerdos | `frontend/acuerdos_home.html`, `acuerdos.html` |

El visor de alertas tempranas es otro programa (Java y PostGIS) y vive en
[alertas-tempranas](https://github.com/GFP-Subnacional-Peru/alertas-tempranas).
En línea: https://acr-atd.onrender.com/

Deforestación y acuerdos siguen en este repositorio porque comparten `backend_python/main.py`,
`frontend/assets` y un solo servicio. Partirlos en dos servicios web gastaría el cupo de horas
del plan gratuito y, a mitad de mes, se apagarían los dos.

## Carpetas

| Carpeta | Para qué está |
| --- | --- |
| `backend_python/` | API FastAPI. Arranque: `uvicorn main:app`. |
| `frontend/` | HTML, CSS, JavaScript e imágenes. `/assets` sale de `frontend/assets`. |
| `data/cache/` | GeoJSON y centroides que la API sirve en línea. |
| `data/incoming/` | Capas de entrada ya convertidas a GeoJSON. |
| `www/mapas/` | Mapas PDF y sus miniaturas. |
| `www/reportes_atd/` | Capas que el mapa de deforestación sigue mostrando. |
| `utils/datos_temporales_acr.R` | Serie anual por ACR. El servicio la lee al armar tendencias. |
| `scripts/` | Regeneración de cachés y herramientas. No corren en el servidor. |
| `atd-service/` | Código del visor de alertas, todavía publicado desde aquí. Ver abajo. |
| `.github/workflows/` | De lunes a viernes, de 8:00 a 18:00 (hora de Lima), llama a los dos servicios para que no se duerman. |

La aplicación Shiny (`ui.R`, `server.R`, `modules/`, el resto de `utils/`) y los accesos
directos de Windows quedan en la computadora de quien los tenga. No forman parte de este repositorio.

## Correr en local

El entorno virtual está en la raíz (`.venv`), no dentro de `backend_python`.

```
cd backend_python
..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

También vale, desde la raíz: `python run_server.py`. Abre http://127.0.0.1:8000 cuando `/api/health` responde.

## Publicación

`render.yaml` describe un servicio Python. Un push a `main` actualiza el sitio.
Salud del servicio: `GET /api/health`.

## Alertas tempranas

La carpeta `atd-service/` sigue en este repositorio porque el servicio
https://acr-atd.onrender.com todavía se construye desde ella (Dockerfile dentro de esa carpeta).

El repositorio propio ya está en
https://github.com/GFP-Subnacional-Peru/alertas-tempranas
y ahí el Dockerfile está en la raíz.

Para dejar de publicar el visor desde aquí:

1. En Render, abrir el servicio de alertas.
2. Cambiar el repositorio a `GFP-Subnacional-Peru/alertas-tempranas`.
3. Dejar el directorio raíz vacío y el Dockerfile en `/Dockerfile`.
4. Confirmar que `GET /api/atd/salud` responde.
5. Recién entonces se puede borrar `atd-service/` de este repositorio.

Borrarla antes deja el visor en línea con la imagen actual, y el siguiente despliegue de ese servicio falla.
