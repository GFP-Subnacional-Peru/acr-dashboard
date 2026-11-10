# Backend Python — ACR Dashboard

Migración del procesamiento R Shiny → FastAPI + Pandas.

## Estructura

```
backend_python/
├── main.py                 # FastAPI + endpoints
├── requirements.txt
├── core/
│   ├── config.py           # Rutas, constantes (global.R + cargar_datos.R)
│   ├── data_loader.py      # Lectura RDS / búsqueda de archivos
│   └── serializers.py      # DataFrame → JSON
└── services/
    ├── estadisticas_service.py   # cargar_estadisticas_consolidadas()
    ├── deforestacion_service.py  # armonizar + centroides
    ├── filtros_service.py        # obtener_datos_filtrados / causas
    └── kpis_service.py           # generar_resumen_kpis
```

## Arranque (web completa)

Desde `backend_python`, con el entorno de la raíz del repositorio:

```
..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Abrir **http://127.0.0.1:8000** (sirve frontend + API).

API docs: http://127.0.0.1:8000/docs

## Endpoints iniciales

| Método | Ruta | Equivalente Shiny |
|--------|------|-------------------|
| GET | `/health` | Resumen de carga global.R |
| GET | `/api/metadata/acrs` | Filtros + tablas categoría |
| GET | `/api/categorias` | `bind_rows` ACR/ZI nacional |
| GET | `/api/causas` | `obtener_causas_filtradas_cached` |
| GET | `/api/kpis` | `generar_resumen_kpis` / KPI boxes |
| GET | `/api/deforestacion/centroides` | Caché `centroides_deforestacion` |
| GET | `/api/catalogo/{tabla}` | Variables globales de estadísticas |
