# Línea base de deforestación y acuerdos de conservación

Registro de la pérdida de bosque en nueve Áreas de Conservación Regional de Loreto, San Martín y Cusco, y de los acuerdos con los que el Gobierno Regional encarga a una organización local el cuidado de un ámbito. Lo publica el programa GFP Subnacional.

| Producto | Dirección pública |
| --- | --- |
| Línea base de deforestación | https://www.gfpsubnacional.pe/dashboard-linea-base-de-deforestacion/ |
| Acuerdos de conservación | https://www.gfpsubnacional.pe/acuerdos-de-conservacion/ |

Las dos lecturas salen del mismo servicio. El sitio de GFP embebe las páginas.

## Línea base

La serie mide la pérdida de cobertura de bosque húmedo amazónico entre 2001 y 2025. La fuente primaria es GeoBosques, del Ministerio del Ambiente. MapBiomas Perú se usa como lectura complementaria de cobertura y uso del suelo. El procesamiento sigue el criterio de detección de cambio de Hansen et al. (2013): polígonos anuales de pérdida, a 30 m, a partir de Landsat.

Cada polígono queda en una de tres clases:

- **Antrópica.** Agricultura, ganadería, minería o infraestructura. La infraestructura agrupa edificaciones, vías y tendidos; esta línea base no separa esos tres tipos.
- **Natural.** Inundación, deslizamiento o muerte del arbolado.
- **Falsa alerta.** Nube, sombra o un cambio espectral que no es pérdida de bosque.

La comparación entre las nueve ACR usa una zona de influencia de 5 km. Ese buffer es la referencia común de la línea base. Donde el área ya tiene zona de influencia aprobada, como en Loreto, o en propuesta, como en San Martín, el monitoreo de alertas usa ese límite, aunque pase de 5 km o quede por debajo.

La tendencia de cada ACR es una regresión lineal simple de la serie anual. El ajuste se lee con el coeficiente de determinación (R²) y la tasa media en hectáreas por año. Las cifras que muestra el mapa están calculadas de antemano: el servicio lee los GeoJSON, los centroides y la serie anual, y no vuelve a cruzar las capas en cada visita.

El contraste de la serie se hizo con los reportes del MINAM, con MapBiomas Alertas y con la revisión visual de los polígonos sobre imágenes de alta resolución.

Hansen, M. C., et al. (2013). High-resolution global maps of 21st-century forest cover change. *Science*, 342(6160), 850–853.

## Acuerdos de conservación

La Ley N.º 26834 y su reglamento, el Decreto Supremo N.º 038-2001-AG, permiten que la autoridad del área suscriba acuerdos con la población local para conservar y usar el bosque de forma compatible con la categoría y con el Plan Maestro. En un ACR quien administra y firma es el Gobierno Regional, por la Ley N.º 27867.

En la ficha se publican dos superficies: la escrita en el documento y la del polígono cartografiado. Hoy hay un solo acuerdo cargado: Illapani, 001-2026-ACR Chuyapi Urusayhua, suscrito por la Asociación de Servicios Turísticos de la Catarata Illapani en el ACR Chuyapi Urusayhua, Cusco. El documento señala 1,000 ha y el polígono mide 952 ha.

## Repositorio

| Carpeta | Contenido |
| --- | --- |
| `backend_python/` | API FastAPI. Arranque: `uvicorn main:app`. |
| `frontend/` | Páginas, estilos y scripts. `/assets` sale de `frontend/assets`. |
| `data/cache/` | GeoJSON y centroides que sirve la API. |
| `data/incoming/` | Capas de entrada ya convertidas. |
| `www/mapas/` | Mapas PDF y sus miniaturas. |
| `utils/datos_temporales_acr.R` | Serie anual por ACR. |
| `scripts/` | Regeneración de las capas. No corre en el servidor. |

Cada cambio que entra a `main` queda en GitHub y actualiza el sitio publicado.

Para correrlo en esta computadora, el entorno virtual está en la raíz:

```
cd backend_python
..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Desde la raíz también vale `python run_server.py`. Abre http://127.0.0.1:8000 cuando `/api/health` responde.
