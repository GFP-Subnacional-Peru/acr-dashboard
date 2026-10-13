# ========================================
# UI.R - VERSIÓN CORREGIDA FINAL
# Estructura: Dashboard → Metodología → Reportes → Tendencias
# ========================================

ui <- navbarPage(
  title = div(
    style = "display: flex; align-items: center;",
    icon("leaf", style = "margin-right: 8px; color: #006D5B;")
  ),
  
  windowTitle = "Dashboard ACRs - Monitoreo de Deforestación",
  
  theme = shinytheme("flatly"),
  
  # ========================================
  # TAB 1: DASHBOARD PRINCIPAL
  # ========================================
  tabPanel("Dashboard", icon = icon("chart-bar"),
           fluidPage(
             useShinyjs(),
             
             # ============ HERO SECTION ============
             fluidRow(
               column(12,
                      div(
                        style = "margin-bottom: 30px;",
                        
                        # Barra roja superior
                        div(style = "background: #d32f2f; color: white; padding: 12px 40px; text-align: center;",
                            h4(style = "margin: 0; font-size: 18px; font-weight: 600;",
                               "Conservación de la biodiversidad y lucha contra el cambio climático")
                        ),
                        
                        # Contenedor principal azul
                        div(style = "background: #2c5f7d; color: white; padding: 30px 40px;",
                            h2(style = "margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: white; text-align: center;",
                               "Monitoreo de la deforestación en Áreas de Conservación Regional de la Amazonía Peruana"),
                            
                            p(style = "margin: 0; font-size: 15px; line-height: 1.7; text-align: justify; color: white;",
                              "En el marco de la asistencia técnica del ", 
                              strong("Programa GFP Subnacional de la Cooperación Económica Suiza – SECO"), 
                              ", implementado por el ", 
                              strong("Basel Institute on Governance"), 
                              ", y en coordinación con los Gobiernos Regionales de Loreto, San Martín y Cusco, se desarrolló el ",
                              strong("Dashboard de Línea Base de Deforestación de nueve Áreas de Conservación Regional"), 
                              ", basado en la evaluación de información satelital de 24 años (2001 – 2024), así como herramienta clave para el monitoreo y la protección de los ecosistemas amazónicos.")
                        )
                      )
               )
             ),
             
             # ============ FILTROS Y KPIs ============
             fluidRow(
               column(3, filtros_ui("filtros")),
               column(9,
                      h5(icon("tachometer-alt"), strong(" Indicadores Clave"), 
                         class = "section-title",
                         style = "margin-bottom: 20px;"),
                      fluidRow(
                        column(6, uiOutput("kpi_hectareas")),
                        column(6, uiOutput("kpi_variacion"))
                      ),
                      fluidRow(
                        column(6, uiOutput("kpi_porcentaje_acr")),
                        column(6, uiOutput("kpi_causa_principal"))
                      )
               )
             ),
             
             # ============ MAPA ============
             fluidRow(
               column(12, mapa_ui("mapa"))
             ),
             
             # ============ GRÁFICOS ============
             graficos_ui("graficos"),
             
             # ============ TABLAS ============
             tablas_ui("tablas"),
             
             # ========================================
             # SECCIÓN PARA AGREGAR DESPUÉS DE tablas_ui("tablas")
             # Reemplaza desde la línea 82 hasta la 187
             # ========================================
             
             # ============ DATOS RELEVANTES POR REGIÓN ============
             fluidRow(
               column(12,
                      h5(icon("lightbulb"), strong(" Datos Relevantes por Región"), 
                         class = "section-title",
                         style = "margin-top: 40px; margin-bottom: 25px;")
               )
             ),
             
             fluidRow(
               # ============ LORETO ============
               column(4,
                      div(
                        class = "panelbox",
                        style = "border-top: 4px solid #f1c40f; transition: all 0.3s; cursor: pointer; min-height: 280px; position: relative; background: linear-gradient(135deg, #ffffff 0%, #fffef5 100%);",
                        onmouseover = "this.style.transform='translateY(-8px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.2)';",
                        onmouseout = "this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)';",
                        
                        # Badge de región
                        div(style = "position: absolute; top: 15px; right: 15px; background: linear-gradient(135deg, #f1c40f 0%, #f39c12 100%); color: white; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.2);",
                            "LORETO"),
                        
                        # Título con ícono
                        h4(
                          icon("fire", style = "color: #e74c3c;"), 
                          " Frentes Activos de", tags$br(), "Deforestación", 
                          style = "color: #1a4d2e; margin-bottom: 15px; line-height: 1.4; font-weight: 700;"
                        ),
                        
                        # Descripción
                        p(style = "font-size: 14px; text-align: justify; color: #555; line-height: 1.6;",
                          "El ", strong("corredor Iquitos-Nauta"), " concentra el mayor número de alertas, con ",
                          strong("8,500+ hectáreas"), " deforestadas en la última década. La agricultura migratoria ",
                          "en ciclos de 3-5 años es el patrón dominante."
                        ),
                        
                        # Lista de puntos clave
                        tags$ul(
                          style = "font-size: 13px; color: #666; margin-top: 12px; list-style: none; padding-left: 0;",
                          tags$li(style = "margin-bottom: 6px;", 
                                  icon("map-pin", style = "color: #e74c3c;"), 
                                  " Zona crítica: Eje vial Iquitos-Nauta"),
                          tags$li(style = "margin-bottom: 6px;", 
                                  icon("chart-line", style = "color: #f39c12;"), 
                                  " Tendencia: +18.6% última década"),
                          tags$li(style = "margin-bottom: 6px;", 
                                  icon("tree", style = "color: #27ae60;"), 
                                  " Impacto: 4 ACRs con presión alta")
                        ),
                        
                        # Link de análisis completo
                        div(
                          style = "text-align: right; margin-top: 20px; border-top: 1px solid #eee; padding-top: 12px;",
                          actionLink(
                            "link_loreto", 
                            tagList("Ver análisis completo ", icon("arrow-right")),
                            style = "color: #006D5B; font-weight: 600; text-decoration: none; transition: all 0.3s;"
                          )
                        )
                      )
               ),
               
               # ============ SAN MARTÍN ============
               column(4,
                      div(
                        class = "panelbox",
                        style = "border-top: 4px solid #f8c471; transition: all 0.3s; cursor: pointer; min-height: 280px; position: relative; background: linear-gradient(135deg, #ffffff 0%, #fff9f0 100%);",
                        onmouseover = "this.style.transform='translateY(-8px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.2)';",
                        onmouseout = "this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)';",
                        
                        # Badge de región
                        div(style = "position: absolute; top: 15px; right: 15px; background: linear-gradient(135deg, #f8c471 0%, #f39c12 100%); color: white; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.2);",
                            "SAN MARTÍN"),
                        
                        # Título con ícono
                        h4(
                          icon("exclamation-triangle", style = "color: #f39c12;"), 
                          " Presión en Bordes", tags$br(), "de ACRs", 
                          style = "color: #1a4d2e; margin-bottom: 15px; line-height: 1.4; font-weight: 700;"
                        ),
                        
                        # Descripción
                        p(style = "font-size: 14px; text-align: justify; color: #555; line-height: 1.6;",
                          "Incremento notable ", strong("post-2018"), " en los límites de ",
                          strong("Cordillera Escalera"), ", coincidiendo con mejoras en infraestructura vial. ",
                          "Expansión urbana y caficultura son las causas principales."
                        ),
                        
                        # Lista de puntos clave
                        tags$ul(
                          style = "font-size: 13px; color: #666; margin-top: 12px; list-style: none; padding-left: 0;",
                          tags$li(style = "margin-bottom: 6px;", 
                                  icon("fire-alt", style = "color: #e74c3c;"), 
                                  " Incendios forestales 2023: 260+ ha"),
                          tags$li(style = "margin-bottom: 6px;", 
                                  icon("city", style = "color: #95a5a6;"), 
                                  " Causa #1: Expansión urbana (40%)"),
                          tags$li(style = "margin-bottom: 6px;", 
                                  icon("coffee", style = "color: #8b4513;"), 
                                  " Causa #2: Cultivos permanentes (35%)")
                        ),
                        
                        # Link de análisis completo
                        div(
                          style = "text-align: right; margin-top: 20px; border-top: 1px solid #eee; padding-top: 12px;",
                          actionLink(
                            "link_sanmartin", 
                            tagList("Ver análisis completo ", icon("arrow-right")),
                            style = "color: #006D5B; font-weight: 600; text-decoration: none; transition: all 0.3s;"
                          )
                        )
                      )
               ),
               
               # ============ CUSCO ============
               column(4,
                      div(
                        class = "panelbox",
                        style = "border-top: 4px solid #5cb85c; transition: all 0.3s; cursor: pointer; min-height: 280px; position: relative; background: linear-gradient(135deg, #ffffff 0%, #f0fff4 100%);",
                        onmouseover = "this.style.transform='translateY(-8px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.2)';",
                        onmouseout = "this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)';",
                        
                        # Badge de región
                        div(style = "position: absolute; top: 15px; right: 15px; background: linear-gradient(135deg, #5cb85c 0%, #4cae4c 100%); color: white; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.2);",
                            "CUSCO"),
                        
                        # Título con ícono
                        h4(
                          icon("chart-line", style = "color: #27ae60;"), 
                          " Reducción de", tags$br(), "Deforestación", 
                          style = "color: #1a4d2e; margin-bottom: 15px; line-height: 1.4; font-weight: 700;"
                        ),
                        
                        # Descripción
                        p(style = "font-size: 14px; text-align: justify; color: #555; line-height: 1.6;",
                          strong("Buenas noticias:"), " Cusco muestra una ", strong("reducción del 15%"), 
                          " en deforestación desde 2020. Parches pequeños (0.5-2 ha) en valles cultivados, ",
                          "con baja presión comparada con selva baja."
                        ),
                        
                        # Lista de puntos clave
                        tags$ul(
                          style = "font-size: 13px; color: #666; margin-top: 12px; list-style: none; padding-left: 0;",
                          tags$li(style = "margin-bottom: 6px;", 
                                  icon("check-circle", style = "color: #27ae60;"), 
                                  " Tendencia positiva: -15% desde 2020"),
                          tags$li(style = "margin-bottom: 6px;", 
                                  icon("seedling", style = "color: #27ae60;"), 
                                  " Patrón: Parches dispersos < 2 ha"),
                          tags$li(style = "margin-bottom: 6px;", 
                                  icon("mountain", style = "color: #3498db;"), 
                                  " Contexto: Prácticas agrícolas tradicionales")
                        ),
                        
                        # Link de análisis completo
                        div(
                          style = "text-align: right; margin-top: 20px; border-top: 1px solid #eee; padding-top: 12px;",
                          actionLink(
                            "link_cusco", 
                            tagList("Ver análisis completo ", icon("arrow-right")),
                            style = "color: #006D5B; font-weight: 600; text-decoration: none; transition: all 0.3s;"
                          )
                        )
                      )
               )
             ),
             
             # ============ DECORACIÓN FINAL CON HOJITA ============
             #fluidRow(
               #column(12,
                   #   div(
                    #    style = "margin-top: 50px; margin-bottom: 40px; text-align: center;",
                        
                        # Línea decorativa superior
                      #  tags$hr(style = "border: none; border-top: 2px solid #ddd; width: 60%; margin: 0 auto 20px auto;"),
                        
                        # Ícono de hoja central
                      #  div(
                       #   style = "display: inline-block; padding: 20px; background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%); border-radius: 50%; box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3);",
                        #  icon("leaf", style = "color: white; font-size: 2.5em;")
                        #),
                        
                        # Texto decorativo
                        #div(
                         # style = "margin-top: 15px; color: #666; font-size: 14px; font-style: italic;",
                          #"Conservando nuestros bosques amazónicos"
                        #),
                        
                        # Línea decorativa inferior
                        #tags$hr(style = "border: none; border-top: 2px solid #ddd; width: 60%; margin: 20px auto 0 auto;")
                      #)
               #)
            # ),
             
             # ============ FOOTER ============
             footer_simple()
             # ============ SECCIÓN DE DESCARGAS ELIMINADA ============
             # (Ahora solo está disponible en la pestaña "Reportes y Descargas")
           )  # ← CIERRE DE fluidPage() DEL TAB DASHBOARD
  ),  # ← CIERRE DE tabPanel("Dashboard")
  # ========================================
  # TAB 2: METODOLOGÍA
  # ========================================
  tabPanel("Metodología", icon = icon("book-open"),
           fluidPage(
             
             fluidRow(
               column(12,
                      
                      div(
                        style = "margin-bottom: 30px;",
                        
                        # Barra roja superior
                        div(
                          style = "background: #d32f2f; color: white; padding: 12px 40px; text-align: center;",
                          h4(
                            style = "margin: 0; font-size: 18px; font-weight: 600;",
                            "Metodología Científica"
                          )
                        ),
                        
                        # Contenedor azul
                        div(
                          style = "background: #2c5f7d; color: white; padding: 30px 40px;",
                          
                          h2(
                            style = "margin: 0 0 20px 0; font-size: 24px; font-weight: 700; text-align: center;",
                            "Sistema de monitoreo y evaluación de deforestación en Áreas de Conservación Regional del Perú"
                          ),
                          
                          p(
                            style = "margin: 0; font-size: 15px; line-height: 1.7; text-align: justify;",
                            "Análisis basado en imágenes satelitales de alta resolución (Sentinel -2 , Landsat 7/8, PlanetScope) procesadas con algoritmos de detección de cambios espectrales. ",
                            "La metodología sigue estándares internacionales establecidos por Hansen et al. (2013) y el protocolo del MINAM para el monitoreo de bosques amazónicos."
                          )
                        )
                      )
                      
               )
             ),
             
             # Contenido metodológico COMPLETO
             fluidRow(
               column(12,
                      div(class = "panelbox",
                          
                          h3(icon("book"), " 1. Marco Normativo y Conceptual"),
                          p(style = "text-align:justify; font-size:15px; line-height: 1.8;",
                            strong("Base legal:"), " Según el Decreto Supremo N.º 006-2008-MINAM, ",
                            "se establece el procedimiento para la aprobación de Áreas de Conservación Regional (ACRs). ",
                            "El análisis de línea base de deforestación es un requisito fundamental establecido en el ",
                            "marco legal peruano para evaluar la efectividad de las medidas de conservación implementadas ",
                            "y para la planificación de estrategias de gestión territorial sostenible."
                          ),
                          
                          tags$blockquote(
                            style = "border-left: 4px solid #006D5B; padding-left: 20px; margin: 20px 0; background: #f8f9fa; padding: 15px; border-radius: 6px;",
                            tags$p(style = "font-size: 14px; margin: 0; font-style: italic; color: #555;",
                                   "Las ACRs son espacios naturales bajo gestión regional que buscan conservar la diversidad biológica, ",
                                   "los servicios ecosistémicos y los valores culturales asociados, integrando a las comunidades locales ",
                                   "en la gestión sostenible de estos territorios."
                            )
                          ),
                          
                          hr(),
                          
                          h3(icon("satellite"), " 2. Fuentes de Información y Datos"),
                          
                          tags$ul(style = "font-size: 15px; line-height: 1.8;",
                                  tags$li(strong("Fuente primaria:"), " Plataforma ", 
                                          tags$a(href = "https://geobosques.minam.gob.pe", target = "_blank", 
                                                 "GeoBosques", style = "color: #006D5B; font-weight: 600;"),
                                          " del Ministerio del Ambiente (MINAM)"),
                                  tags$li(strong("Período temporal:"), " 2001-2024 (24 años de serie histórica)"),
                                  tags$li(strong("Resolución espacial:"), " 30 metros (imágenes Landsat 7 ETM+, Landsat 8 OLI/TIRS)"),
                                  tags$li(strong("Frecuencia de actualización:"), " Anual, con alertas trimestrales"),
                                  tags$li(strong("Cobertura geográfica:"), " 9 ACRs en 3 departamentos (Loreto, San Martín, Cusco)")
                          ),
                          
                          p(style = "text-align:justify; font-size:15px; line-height: 1.8; margin-top: 15px;",
                            "Los datos de pérdida de cobertura forestal fueron procesados mediante ",
                            strong("análisis multitemporal de imágenes satelitales"), ", utilizando algoritmos de ",
                            "detección de cambios espectrales. La metodología sigue los estándares internacionales ",
                            "establecidos por Hansen et al. (2013) para el monitoreo global de bosques."
                          ),
                          
                          hr(),
                          
                          h3(icon("cogs"), " 3. Procesamiento y Análisis"),
                          
                          tags$ol(style = "font-size: 15px; line-height: 1.8;",
                                  tags$li(strong("Descarga de capas vectoriales:"), " Se obtuvieron los polígonos de pérdida de cobertura forestal ",
                                          "desde GeoBosques en formato shapefile (.shp), segmentados por año"),
                                  tags$li(strong("Normalización geométrica:"), " Transformación al sistema de coordenadas WGS84 (EPSG:4326) ",
                                          "y simplificación de geometrías para optimización computacional"),
                                  tags$li(strong("Intersección espacial:"), " Cruce de capas de deforestación con polígonos de ACRs y sus ",
                                          "zonas de influencia. En la línea base histórica el límite de comparación es un buffer de 5 km. ",
                                          "Si el ACR tiene zona de influencia aprobada (Loreto) o en propuesta (San Martín), ",
                                          "el monitoreo de alertas usa ese límite, sea mayor o menor que 5 km"),
                                  tags$li(strong("Clasificación de alertas:"), " Cada polígono de pérdida fue clasificado en: ",
                                          tags$ul(
                                            tags$li(tags$strong("Antrópico:"), " Causas directas humanas (agricultura, ganadería, minería e infraestructura). ",
                                                    "Infraestructura agrupa edificaciones y viviendas, vías de transporte y tendidos eléctricos, sin separar esos tres tipos"),
                                            tags$li(tags$strong("Natural:"), " Eventos naturales (inundaciones, deslizamientos, muerte natural de árboles)"),
                                            tags$li(tags$strong("Falsa alerta:"), " Detecciones erróneas por nubes, sombras o cambios espectrales temporales")
                                          )
                                  ),
                                  tags$li(strong("Cálculo de métricas:"), " Estimación de hectáreas deforestadas por categoría, año y ACR")
                          ),
                          
                          hr(),
                          
                          h3(icon("shield-alt"), " 4. Zona de Influencia"),
                          
                          p(style = "text-align:justify; font-size:15px; line-height: 1.8;",
                            "Para comparar las 9 ACR con el mismo criterio, la línea base histórica usa una ",
                            strong("zona de influencia"), " de 5 km alrededor de cada ACR. ",
                            "Cuando el área ya tiene zona de influencia aprobada, como en Loreto, o en propuesta, como en San Martín, ",
                            "el visor de alertas usa ese límite oficial aunque pase de 5 km o quede por debajo. ",
                            "El buffer de 5 km queda como referencia común de la línea base. Esta delimitación permite:",
                            tags$ul(
                              tags$li("Identificar frentes de deforestación que podrían avanzar hacia el ACR"),
                              tags$li("Evaluar la efectividad de las ACRs como barreras contra la pérdida de bosques"),
                              tags$li("Diseñar estrategias de gestión territorial que integren el paisaje circundante")
                            )
                          ),
                          
                          hr(),
                          
                          h3(icon("chart-line"), " 5. Análisis de Tendencias"),
                          
                          p(style = "text-align:justify; font-size:15px; line-height: 1.8;",
                            "Se implementó un modelo de ", strong("regresión lineal simple"), " para identificar tendencias temporales ",
                            "de deforestación en el período 2001-2024. El modelo permite:",
                            tags$ul(
                              tags$li("Cuantificar la tasa anual promedio de cambio (hectáreas/año)"),
                              tags$li("Proyectar escenarios tendenciales a 5 años (2025-2029)"),
                              tags$li("Evaluar el coeficiente de determinación (R²) como medida de bondad de ajuste")
                            )
                          ),
                          
                          tags$div(
                            style = "background: #fff3cd; padding: 15px; border-left: 4px solid #f0ad4e; border-radius: 6px; margin: 20px 0;",
                            icon("exclamation-triangle", style = "color: #f0ad4e; margin-right: 8px;"),
                            strong("Limitaciones del modelo predictivo:"),
                            tags$ul(style = "margin: 10px 0 0 0; font-size: 14px;",
                                    tags$li("No incorpora cambios en políticas públicas o intervenciones de conservación futuras"),
                                    tags$li("Asume continuidad de patrones históricos sin eventos extraordinarios"),
                                    tags$li("Los intervalos de confianza amplios reflejan la variabilidad anual de los datos")
                            )
                          ),
                          
                          hr(),
                          
                          h3(icon("database"), " 6. Gestión de Datos"),
                          
                          p(style = "text-align:justify; font-size:15px; line-height: 1.8;",
                            "El dashboard utiliza una arquitectura de datos optimizada para minimizar tiempos de carga:",
                            tags$ul(
                              tags$li(strong("Geometrías:"), " Almacenadas en formato RDS (R Data Serialization) con geometrías simplificadas"),
                              tags$li(strong("Estadísticas:"), " Precomputadas y cargadas en memoria durante la inicialización"),
                              tags$li(strong("Visualizaciones:"), " Generadas dinámicamente mediante Plotly y Leaflet para interactividad"),
                              tags$li(strong("Tamaño total:"), " < 30 MB para cumplir límites de Shinyapps.io")
                            )
                          ),
                          
                          hr(),
                          
                          h3(icon("users"), " 7. Control de Calidad"),
                          
                          p(style = "text-align:justify; font-size:15px; line-height: 1.8;",
                            "Se realizó un proceso de ", strong("validación cruzada"), " mediante:",
                            tags$ul(
                                    tags$li("Comparación con reportes oficiales del MINAM y estudios académicos previos"),
                                    tags$li("Contraste con MapBiomas Alertas Perú, para revisar si la pérdida coincide con alertas independientes de cambio de cobertura"),
                                    tags$li("Verificación visual de polígonos de deforestación en imágenes de alta resolución (Google Earth, Planet)"),
                              tags$li("Consulta con técnicos de las Gerencias Regionales de Recursos Naturales")
                            )
                          ),
                          
                          hr(),
                          
                          h3(icon("book-open"), " 8. Referencias Metodológicas"),
                          
                          tags$ol(style = "font-size: 14px; line-height: 1.8;",
                                  tags$li("Hansen, M. C., et al. (2013). High-resolution global maps of 21st-century forest cover change. ", 
                                          tags$em("Science"), ", 342(6160), 850-853."),
                                  tags$li("MINAM (2024). Metodología para el monitoreo de la pérdida de cobertura de bosque húmedo amazónico. ",
                                          "Programa Nacional de Conservación de Bosques."),
                                  tags$li("Decreto Supremo N.º 006-2008-MINAM. Reglamento de Organización y Funciones del SERNANP."),
                                  tags$li("Global Forest Watch (2024). Plataforma de monitoreo forestal en tiempo real.")
                          )
                      )
               )
             ),
             # ============ FOOTER ============
             footer_simple()
           )
  ),
  # ========================================
  # TAB 3: REPORTES Y DESCARGAS
  # ========================================
  tabPanel("Reportes y Descargas", icon = icon("download"),
           fluidPage(
             
             # ============ HEADER CON ESTILO ROJO-AZUL ============
             fluidRow(
               column(12,
                      div(
                        style = "margin-bottom: 30px;",
                        
                        # Barra roja superior
                        div(style = "background: #d32f2f; color: white; padding: 12px 40px; text-align: center;",
                            h4(style = "margin: 0; font-size: 18px; font-weight: 600;",
                               "Productos Cartográficos y Datos")
                        ),
                        
                        # Contenedor azul
                        div(style = "background: #2c5f7d; color: white; padding: 30px 40px;",
                            h2(style = "margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: white; text-align: center;",
                               "Mapas Temáticos de Deforestación por ACR"),
                            
                            p(style = "margin: 0; font-size: 15px; line-height: 1.7; text-align: justify; color: white;",
                              "Accede a mapas de alta resolución y conjuntos de datos geoespaciales de las Áreas de Conservación Regional. ",
                              "Los productos cartográficos están actualizados a noviembre 2025 y disponibles para descarga en formatos PDF y shapefile.")
                        )
                      )
               )
             ),
             
             # ============ FILTRO DE DEPARTAMENTO ============
             fluidRow(
               column(12,
                      wellPanel(
                        style = "background: #f8f9fa; border-left: 4px solid #006D5B; margin-bottom: 30px;",
                        fluidRow(
                          column(4,
                                 selectInput("filtro_depto_mapas",
                                             label = tags$span(icon("filter"), " Filtrar por Departamento:"),
                                             choices = c("Loreto" = "loreto", "San Martín" = "sanmartin", "Cusco" = "cusco"),
                                             selected = "loreto")
                          ),
                          column(8,
                                 tags$p(style = "margin-top: 10px; color: #666; font-size: 14px;",
                                        icon("info-circle"), 
                                        " Selecciona un departamento para visualizar los mapas disponibles. Click en 'Ver Mapa' para ampliar o 'Descargar PDF' para guardar en tu dispositivo.")
                          )
                        )
                      )
               )
             ),
             
             # ============ GALERÍA DE MAPAS - LORETO ============
             conditionalPanel(
               condition = "input.filtro_depto_mapas == 'loreto'",
               fluidRow(
                 # Mapa 1: ACR Ampiyacu Apayacu
                 column(3,
                        div(class = "card-mapa-nueva",
                            style = "border: 2px solid #e0e0e0; border-radius: 12px; overflow: hidden; background: white; margin-bottom: 20px; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.1);",
                            
                            # Miniatura del mapa
                            div(style = "width: 100%; height: 200px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; overflow: hidden;",
                                tags$img(src = "mapas/MAPA_ACR_AA_page-0001.jpg", 
                                         style = "width: 100%; height: 100%; object-fit: cover;")
                            ),
                            
                            # Contenido
                            div(style = "padding: 20px;",
                                h5(style = "margin: 0 0 8px 0; color: #1a4d2e; font-weight: 700;", 
                                   icon("leaf"), " ACR Ampiyacu Apayacu"),
                                tags$p(style = "margin: 0 0 15px 0; color: #666; font-size: 13px;",
                                       icon("calendar"), " Actualizado: Noviembre 2025"),
                                
                                # Botones
                                div(style = "display: flex; gap: 8px;",
                                    actionButton("ver_mapa_aa", 
                                                 label = tagList(icon("search-plus"), " Ver"),
                                                 class = "btn btn-sm",
                                                 style = "flex: 1; background: #2c5f7d; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;"),
                                    downloadButton("descargar_mapa_aa",
                                                   label = tagList(icon("download"), " PDF"),
                                                   class = "btn btn-sm",
                                                   style = "flex: 1; background: #17a2b8; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;")
                                )
                            )
                        )
                 ),
                 
                 # Mapa 2: ACR Alto Nanay
                 column(3,
                        div(class = "card-mapa-nueva",
                            style = "border: 2px solid #e0e0e0; border-radius: 12px; overflow: hidden; background: white; margin-bottom: 20px; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.1);",
                            
                            div(style = "width: 100%; height: 200px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; overflow: hidden;",
                                tags$img(src = "mapas/MAPA_ACR_ANPCH_page-0001.jpg", 
                                         style = "width: 100%; height: 100%; object-fit: cover;")
                            ),
                            
                            div(style = "padding: 20px;",
                                h5(style = "margin: 0 0 8px 0; color: #1a4d2e; font-weight: 700;", 
                                   icon("leaf"), " ACR Alto Nanay"),
                                tags$p(style = "margin: 0 0 15px 0; color: #666; font-size: 13px;",
                                       icon("calendar"), " Actualizado: Noviembre 2025"),
                                
                                div(style = "display: flex; gap: 8px;",
                                    actionButton("ver_mapa_anpch", 
                                                 label = tagList(icon("search-plus"), " Ver"),
                                                 class = "btn btn-sm",
                                                 style = "flex: 1; background: #2c5f7d; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;"),
                                    downloadButton("descargar_mapa_anpch",
                                                   label = tagList(icon("download"), " PDF"),
                                                   class = "btn btn-sm",
                                                   style = "flex: 1; background: #17a2b8; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;")
                                )
                            )
                        )
                 ),
                 
                 # Mapa 3: ACR Tamshiyacu Tahuayo
                 column(3,
                        div(class = "card-mapa-nueva",
                            style = "border: 2px solid #e0e0e0; border-radius: 12px; overflow: hidden; background: white; margin-bottom: 20px; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.1);",
                            
                            div(style = "width: 100%; height: 200px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; overflow: hidden;",
                                tags$img(src = "mapas/MAPA_ACR_CTT_page-0001.jpg", 
                                         style = "width: 100%; height: 100%; object-fit: cover;")
                            ),
                            
                            div(style = "padding: 20px;",
                                h5(style = "margin: 0 0 8px 0; color: #1a4d2e; font-weight: 700;", 
                                   icon("leaf"), " ACR Tamshiyacu Tahuayo"),
                                tags$p(style = "margin: 0 0 15px 0; color: #666; font-size: 13px;",
                                       icon("calendar"), " Actualizado: Noviembre 2025"),
                                
                                div(style = "display: flex; gap: 8px;",
                                    actionButton("ver_mapa_ctt", 
                                                 label = tagList(icon("search-plus"), " Ver"),
                                                 class = "btn btn-sm",
                                                 style = "flex: 1; background: #2c5f7d; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;"),
                                    downloadButton("descargar_mapa_ctt",
                                                   label = tagList(icon("download"), " PDF"),
                                                   class = "btn btn-sm",
                                                   style = "flex: 1; background: #17a2b8; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;")
                                )
                            )
                        )
                 ),
                 
                 # Mapa 4: ACR Maijuna Kichwa
                 column(3,
                        div(class = "card-mapa-nueva",
                            style = "border: 2px solid #e0e0e0; border-radius: 12px; overflow: hidden; background: white; margin-bottom: 20px; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.1);",
                            
                            div(style = "width: 100%; height: 200px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; overflow: hidden;",
                                tags$img(src = "mapas/MAPA_ACR_MK_page-0001.jpg", 
                                         style = "width: 100%; height: 100%; object-fit: cover;")
                            ),
                            
                            div(style = "padding: 20px;",
                                h5(style = "margin: 0 0 8px 0; color: #1a4d2e; font-weight: 700;", 
                                   icon("leaf"), " ACR Maijuna Kichwa"),
                                tags$p(style = "margin: 0 0 15px 0; color: #666; font-size: 13px;",
                                       icon("calendar"), " Actualizado: Noviembre 2025"),
                                
                                div(style = "display: flex; gap: 8px;",
                                    actionButton("ver_mapa_mk", 
                                                 label = tagList(icon("search-plus"), " Ver"),
                                                 class = "btn btn-sm",
                                                 style = "flex: 1; background: #2c5f7d; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;"),
                                    downloadButton("descargar_mapa_mk",
                                                   label = tagList(icon("download"), " PDF"),
                                                   class = "btn btn-sm",
                                                   style = "flex: 1; background: #17a2b8; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;")
                                )
                            )
                        )
                 )
               )
             ),
             
             # Placeholders para San Martín y Cusco
             
             # ============ GALERÍA DE MAPAS - SAN MARTÍN ============
             conditionalPanel(
               condition = "input.filtro_depto_mapas == 'sanmartin'",
               fluidRow(
                 # Mapa 1: ACR Bosques de Shunté y Mishollo (BOSHUMI)
                 column(6,
                        div(class = "card-mapa-nueva",
                            style = "border: 2px solid #e0e0e0; border-radius: 12px; overflow: hidden; background: white; margin-bottom: 20px; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.1);",
                            
                            div(style = "width: 100%; height: 200px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; overflow: hidden;",
                                tags$img(src = "mapas/25NOV17_Mapa_de_deforestación_en_ACR_BOSHUMI_y_su_ZI_A2.jpg", 
                                         style = "width: 100%; height: 100%; object-fit: cover;")
                            ),
                            
                            div(style = "padding: 20px;",
                                h5(style = "margin: 0 0 8px 0; color: #1a4d2e; font-weight: 700;", 
                                   icon("leaf"), " ACR Bosques de Shunté y Mishollo"),
                                tags$p(style = "margin: 0 0 15px 0; color: #666; font-size: 13px;",
                                       icon("calendar"), " Actualizado: Enero 2026"),
                                
                                div(style = "display: flex; gap: 8px;",
                                    actionButton("ver_mapa_boshumi", 
                                                 label = tagList(icon("search-plus"), " Ver"),
                                                 class = "btn btn-sm",
                                                 style = "flex: 1; background: #2c5f7d; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;"),
                                    downloadButton("descargar_mapa_boshumi",
                                                   label = tagList(icon("download"), " PDF"),
                                                   class = "btn btn-sm",
                                                   style = "flex: 1; background: #17a2b8; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;")
                                )
                            )
                        )
                 ),
                 
                 # Mapa 2: ACR Cordillera Escalera
                 column(6,
                        div(class = "card-mapa-nueva",
                            style = "border: 2px solid #e0e0e0; border-radius: 12px; overflow: hidden; background: white; margin-bottom: 20px; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.1);",
                            
                            div(style = "width: 100%; height: 200px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; overflow: hidden;",
                                tags$img(src = "mapas/25NOV17_Mapa_de_deforestación_en_ACR_CE_y_su_ZI_A2.jpg", 
                                         style = "width: 100%; height: 100%; object-fit: cover;")
                            ),
                            
                            div(style = "padding: 20px;",
                                h5(style = "margin: 0 0 8px 0; color: #1a4d2e; font-weight: 700;", 
                                   icon("leaf"), " ACR Cordillera Escalera"),
                                tags$p(style = "margin: 0 0 15px 0; color: #666; font-size: 13px;",
                                       icon("calendar"), " Actualizado: Enero 2026"),
                                
                                div(style = "display: flex; gap: 8px;",
                                    actionButton("ver_mapa_ce", 
                                                 label = tagList(icon("search-plus"), " Ver"),
                                                 class = "btn btn-sm",
                                                 style = "flex: 1; background: #2c5f7d; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;"),
                                    downloadButton("descargar_mapa_ce",
                                                   label = tagList(icon("download"), " PDF"),
                                                   class = "btn btn-sm",
                                                   style = "flex: 1; background: #17a2b8; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;")
                                )
                            )
                        )
                 )
               )
             ),
             # ============ GALERÍA DE MAPAS - CUSCO ============
             conditionalPanel(
               condition = "input.filtro_depto_mapas == 'cusco'",
               fluidRow(
                 # Mapa 1: ACR Choquequirao
                 column(4,
                        div(class = "card-mapa-nueva",
                            style = "border: 2px solid #e0e0e0; border-radius: 12px; overflow: hidden; background: white; margin-bottom: 20px; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.1);",
                            
                            # Miniatura del mapa - SIN ESPACIOS
                            div(style = "width: 100%; height: 200px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; overflow: hidden;",
                                tags$img(src = "mapas/MAPA_CHOQUE_DEF_page-0001.jpg", 
                                         style = "width: 100%; height: 100%; object-fit: cover;")
                            ),
                            
                            # Contenido
                            div(style = "padding: 20px;",
                                h5(style = "margin: 0 0 8px 0; color: #1a4d2e; font-weight: 700;", 
                                   icon("leaf"), " ACR Choquequirao"),
                                tags$p(style = "margin: 0 0 15px 0; color: #666; font-size: 13px;",
                                       icon("calendar"), " Actualizado: Noviembre 2025"),
                                
                                # Botones
                                div(style = "display: flex; gap: 8px;",
                                    actionButton("ver_mapa_chq", 
                                                 label = tagList(icon("search-plus"), " Ver"),
                                                 class = "btn btn-sm",
                                                 style = "flex: 1; background: #2c5f7d; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;"),
                                    downloadButton("descargar_mapa_chq",
                                                   label = tagList(icon("download"), " PDF"),
                                                   class = "btn btn-sm",
                                                   style = "flex: 1; background: #17a2b8; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;")
                                )
                            )
                        )
                 ),
                 
                 # Mapa 2: ACR Chuyapi Urusayhua
                 column(4,
                        div(class = "card-mapa-nueva",
                            style = "border: 2px solid #e0e0e0; border-radius: 12px; overflow: hidden; background: white; margin-bottom: 20px; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.1);",
                            
                            div(style = "width: 100%; height: 200px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; overflow: hidden;",
                                tags$img(src = "mapas/MAPA_CHUYAPI_ANEXO2_page-0001.jpg", 
                                         style = "width: 100%; height: 100%; object-fit: cover;")
                            ),
                            
                            div(style = "padding: 20px;",
                                h5(style = "margin: 0 0 8px 0; color: #1a4d2e; font-weight: 700;", 
                                   icon("leaf"), " ACR Chuyapi Urusayhua"),
                                tags$p(style = "margin: 0 0 15px 0; color: #666; font-size: 13px;",
                                       icon("calendar"), " Actualizado: Noviembre 2025"),
                                
                                div(style = "display: flex; gap: 8px;",
                                    actionButton("ver_mapa_chu", 
                                                 label = tagList(icon("search-plus"), " Ver"),
                                                 class = "btn btn-sm",
                                                 style = "flex: 1; background: #2c5f7d; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;"),
                                    downloadButton("descargar_mapa_chu",
                                                   label = tagList(icon("download"), " PDF"),
                                                   class = "btn btn-sm",
                                                   style = "flex: 1; background: #17a2b8; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;")
                                )
                            )
                        )
                 ),
                 
                 # Mapa 3: ACR Q'eros Kosñipata
                 column(4,
                        div(class = "card-mapa-nueva",
                            style = "border: 2px solid #e0e0e0; border-radius: 12px; overflow: hidden; background: white; margin-bottom: 20px; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.1);",
                            
                            div(style = "width: 100%; height: 200px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; overflow: hidden;",
                                tags$img(src = "mapas/MAPA_QEROS_ANEXO3_page-0001.jpg", 
                                         style = "width: 100%; height: 100%; object-fit: cover;")
                            ),
                            
                            div(style = "padding: 20px;",
                                h5(style = "margin: 0 0 8px 0; color: #1a4d2e; font-weight: 700;", 
                                   icon("leaf"), " ACR Q'eros Kosñipata"),
                                tags$p(style = "margin: 0 0 15px 0; color: #666; font-size: 13px;",
                                       icon("calendar"), " Actualizado: Noviembre 2025"),
                                
                                div(style = "display: flex; gap: 8px;",
                                    actionButton("ver_mapa_qk", 
                                                 label = tagList(icon("search-plus"), " Ver"),
                                                 class = "btn btn-sm",
                                                 style = "flex: 1; background: #2c5f7d; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;"),
                                    downloadButton("descargar_mapa_qk",
                                                   label = tagList(icon("download"), " PDF"),
                                                   class = "btn btn-sm",
                                                   style = "flex: 1; background: #17a2b8; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600;")
                                )
                            )
                        )
                 )
               )
             ),
             
             # ============ SECCIÓN DE DESCARGAS GENERAL ============
             fluidRow(
               column(12,
                      div(style = "background: #f8f9fa; padding: 20px; border-left: 4px solid #5cb85c; border-radius: 8px; margin-top: 40px;",
                          
                          div(style = "display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;",
                              
                              div(style = "flex: 1; min-width: 300px;",
                                  h4(style = "margin: 0 0 5px 0; color: #1a4d2e;",
                                     icon("download"), " Reportes, datos y metodologías"),
                                  p(style = "margin: 0; color: #666; font-size: 14px;",
                                    "Shapefiles, GeoTIFF, CSV, informes PDF y notas metodológicas.")
                              ),
                              
                              div(style = "display: flex; gap: 10px; align-items: center;",
                                  downloadButton("btn_descargar_datos_completo",
                                                 label = tagList(icon("file-archive"), " Descargar datos"),
                                                 class = "btn-success",
                                                 style = "padding: 10px 20px; font-weight: 600;"),
                                  
                                  actionButton("btn_ver_informe_completo",
                                               label = tagList(icon("file-pdf"), " Ver informe"),
                                               class = "btn-warning",
                                               style = "padding: 10px 20px; font-weight: 600; background: #f0ad4e; color: white; border: none;")
                              )
                          )
                      )
               )
             ),
             # ============ FOOTER ============
             footer_simple()
           )  # Cierre de fluidPage del tab Reportes
  ),  # Cierre de tabPanel("Reportes y Descargas")
  
  # ========================================
  # TAB 4: TENDENCIAS
  # ========================================
  tabPanel("Tendencias", icon = icon("chart-line"),
           prediccion_ui("prediccion"),
           # ============ FOOTER ============
           footer_simple()
               ),
)