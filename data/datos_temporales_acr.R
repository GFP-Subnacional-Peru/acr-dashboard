# ========================================
# DATOS TEMPORALES REALES POR ACR
# Regenerado desde GDB (scripts/regen_datos_temporales_desde_gdb.py)
# Suma md_sup ALL causas (sin filtrar falsa alerta) — ACR only, excluye ZI
# ========================================

library(dplyr)

# CUSCO - Choquequirao
cusco_chq <- tribble(
  ~Region, ~ACR, ~Anio, ~Deforestacion_ha,
  "Cusco", "Choquequirao", 2001, 102.9536140268,
  "Cusco", "Choquequirao", 2002, 44.0825840097,
  "Cusco", "Choquequirao", 2003, 14.4899996954,
  "Cusco", "Choquequirao", 2004, 11.8799979758,
  "Cusco", "Choquequirao", 2005, 49.5360104402,
  "Cusco", "Choquequirao", 2006, 6.1775197335,
  "Cusco", "Choquequirao", 2007, 36.8974096738,
  "Cusco", "Choquequirao", 2008, 28.3499998457,
  "Cusco", "Choquequirao", 2009, 22.8103854767,
  "Cusco", "Choquequirao", 2010, 35.7187704831,
  "Cusco", "Choquequirao", 2011, 43.1721033386,
  "Cusco", "Choquequirao", 2012, 10.7099980361,
  "Cusco", "Choquequirao", 2013, 29.6999979327,
  "Cusco", "Choquequirao", 2014, 36.2700020363,
  "Cusco", "Choquequirao", 2015, 18.2744546141,
  "Cusco", "Choquequirao", 2016, 35.0137736375,
  "Cusco", "Choquequirao", 2017, 47.8479880366,
  "Cusco", "Choquequirao", 2018, 10.8000089626,
  "Cusco", "Choquequirao", 2019, 9.9060572123,
  "Cusco", "Choquequirao", 2020, 30.7598255786,
  "Cusco", "Choquequirao", 2021, 12.4615933433,
  "Cusco", "Choquequirao", 2022, 5.39999893,
  "Cusco", "Choquequirao", 2023, 27.7199957192,
  "Cusco", "Choquequirao", 2024, 9.0000008789,
  "Cusco", "Choquequirao", 2025, 0,
  "Cusco", "Choquequirao", 2026, 2.43
)

# CUSCO - Chuyapi Urusayhua
cusco_chu <- tribble(
  ~Region, ~ACR, ~Anio, ~Deforestacion_ha,
  "Cusco", "Chuyapi Urusayhua", 2001, 47.7146014009,
  "Cusco", "Chuyapi Urusayhua", 2002, 26.7299979434,
  "Cusco", "Chuyapi Urusayhua", 2003, 35.9802062124,
  "Cusco", "Chuyapi Urusayhua", 2004, 35.9669884412,
  "Cusco", "Chuyapi Urusayhua", 2005, 16.9808039405,
  "Cusco", "Chuyapi Urusayhua", 2006, 22.6169538185,
  "Cusco", "Chuyapi Urusayhua", 2007, 23.3799855699,
  "Cusco", "Chuyapi Urusayhua", 2008, 6.1199995124,
  "Cusco", "Chuyapi Urusayhua", 2009, 26.916717718,
  "Cusco", "Chuyapi Urusayhua", 2010, 27.3071621643,
  "Cusco", "Chuyapi Urusayhua", 2011, 24.8419179199,
  "Cusco", "Chuyapi Urusayhua", 2012, 10.9859557909,
  "Cusco", "Chuyapi Urusayhua", 2013, 9.0934875617,
  "Cusco", "Chuyapi Urusayhua", 2014, 7.1100017469,
  "Cusco", "Chuyapi Urusayhua", 2015, 33.0662855304,
  "Cusco", "Chuyapi Urusayhua", 2016, 60.589714802,
  "Cusco", "Chuyapi Urusayhua", 2017, 161.0441305292,
  "Cusco", "Chuyapi Urusayhua", 2018, 118.5301044218,
  "Cusco", "Chuyapi Urusayhua", 2019, 52.4574430629,
  "Cusco", "Chuyapi Urusayhua", 2020, 153.5431733736,
  "Cusco", "Chuyapi Urusayhua", 2021, 72.8703422788,
  "Cusco", "Chuyapi Urusayhua", 2022, 24.0966175475,
  "Cusco", "Chuyapi Urusayhua", 2023, 30.8976479517,
  "Cusco", "Chuyapi Urusayhua", 2024, 19.0799954425,
  "Cusco", "Chuyapi Urusayhua", 2025, 0,
  "Cusco", "Chuyapi Urusayhua", 2026, 45.086821
)

# CUSCO - Q'eros Kosñipata
cusco_qk <- tribble(
  ~Region, ~ACR, ~Anio, ~Deforestacion_ha,
  "Cusco", "Q'eros Kosñipata", 2001, 26.8069862037,
  "Cusco", "Q'eros Kosñipata", 2002, 36.4565001118,
  "Cusco", "Q'eros Kosñipata", 2003, 53.3027687226,
  "Cusco", "Q'eros Kosñipata", 2004, 10.1438457122,
  "Cusco", "Q'eros Kosñipata", 2005, 26.0353851653,
  "Cusco", "Q'eros Kosñipata", 2006, 63.0986003062,
  "Cusco", "Q'eros Kosñipata", 2007, 56.1085388773,
  "Cusco", "Q'eros Kosñipata", 2008, 14.3893333394,
  "Cusco", "Q'eros Kosñipata", 2009, 7.1142980297,
  "Cusco", "Q'eros Kosñipata", 2010, 35.8045196133,
  "Cusco", "Q'eros Kosñipata", 2011, 29.2120812151,
  "Cusco", "Q'eros Kosñipata", 2012, 2.5199991,
  "Cusco", "Q'eros Kosñipata", 2013, 2.1599997,
  "Cusco", "Q'eros Kosñipata", 2014, 13.8599978892,
  "Cusco", "Q'eros Kosñipata", 2015, 7.8299995251,
  "Cusco", "Q'eros Kosñipata", 2016, 12.0600002704,
  "Cusco", "Q'eros Kosñipata", 2017, 95.174479078,
  "Cusco", "Q'eros Kosñipata", 2018, 59.3753577385,
  "Cusco", "Q'eros Kosñipata", 2019, 0.9000009,
  "Cusco", "Q'eros Kosñipata", 2020, 15.5799610053,
  "Cusco", "Q'eros Kosñipata", 2021, 7.1999977288,
  "Cusco", "Q'eros Kosñipata", 2022, 24.4612813471,
  "Cusco", "Q'eros Kosñipata", 2023, 1.6199994,
  "Cusco", "Q'eros Kosñipata", 2024, 0.5400006293,
  "Cusco", "Q'eros Kosñipata", 2025, 0,
  "Cusco", "Q'eros Kosñipata", 2026, 24.388549
)

# SAN MARTÍN - Cordillera Escalera
sm_ce <- tribble(
  ~Region, ~ACR, ~Anio, ~Deforestacion_ha,
  "San Martín", "Cordillera Escalera", 2001, 112.3553621769,
  "San Martín", "Cordillera Escalera", 2002, 114.3393376958,
  "San Martín", "Cordillera Escalera", 2003, 99.2444473984,
  "San Martín", "Cordillera Escalera", 2004, 165.9553202898,
  "San Martín", "Cordillera Escalera", 2005, 262.6553271403,
  "San Martín", "Cordillera Escalera", 2006, 247.0856337395,
  "San Martín", "Cordillera Escalera", 2007, 340.1805873746,
  "San Martín", "Cordillera Escalera", 2008, 193.555067743,
  "San Martín", "Cordillera Escalera", 2009, 167.6520209914,
  "San Martín", "Cordillera Escalera", 2010, 213.5620145349,
  "San Martín", "Cordillera Escalera", 2011, 77.4695463285,
  "San Martín", "Cordillera Escalera", 2012, 130.4251180169,
  "San Martín", "Cordillera Escalera", 2013, 90.8175736211,
  "San Martín", "Cordillera Escalera", 2014, 120.3633678744,
  "San Martín", "Cordillera Escalera", 2015, 169.601566203,
  "San Martín", "Cordillera Escalera", 2016, 88.8476228542,
  "San Martín", "Cordillera Escalera", 2017, 84.2194744391,
  "San Martín", "Cordillera Escalera", 2018, 63.2028293508,
  "San Martín", "Cordillera Escalera", 2019, 82.4882454749,
  "San Martín", "Cordillera Escalera", 2020, 179.4236288721,
  "San Martín", "Cordillera Escalera", 2021, 92.3007525281,
  "San Martín", "Cordillera Escalera", 2022, 117.9051511843,
  "San Martín", "Cordillera Escalera", 2023, 95.6662438745,
  "San Martín", "Cordillera Escalera", 2024, 150.4650849612,
  "San Martín", "Cordillera Escalera", 2025, 111.3105450611,
  "San Martín", "Cordillera Escalera", 2026, 0
)

# SAN MARTÍN - Bosques de Shunté y Mishollo
sm_bsm <- tribble(
  ~Region, ~ACR, ~Anio, ~Deforestacion_ha,
  "San Martín", "Bosques de Shunté y Mishollo", 2001, 76.8432082773,
  "San Martín", "Bosques de Shunté y Mishollo", 2002, 43.6932314356,
  "San Martín", "Bosques de Shunté y Mishollo", 2003, 8.6877779592,
  "San Martín", "Bosques de Shunté y Mishollo", 2004, 54.5488390652,
  "San Martín", "Bosques de Shunté y Mishollo", 2005, 113.8367206316,
  "San Martín", "Bosques de Shunté y Mishollo", 2006, 96.6634379847,
  "San Martín", "Bosques de Shunté y Mishollo", 2007, 76.2922443946,
  "San Martín", "Bosques de Shunté y Mishollo", 2008, 34.6537872482,
  "San Martín", "Bosques de Shunté y Mishollo", 2009, 113.219542773,
  "San Martín", "Bosques de Shunté y Mishollo", 2010, 127.0590234161,
  "San Martín", "Bosques de Shunté y Mishollo", 2011, 33.8189772543,
  "San Martín", "Bosques de Shunté y Mishollo", 2012, 54.3944494577,
  "San Martín", "Bosques de Shunté y Mishollo", 2013, 46.0137748966,
  "San Martín", "Bosques de Shunté y Mishollo", 2014, 59.1544661144,
  "San Martín", "Bosques de Shunté y Mishollo", 2015, 155.7471904479,
  "San Martín", "Bosques de Shunté y Mishollo", 2016, 78.2125450229,
  "San Martín", "Bosques de Shunté y Mishollo", 2017, 85.5806081643,
  "San Martín", "Bosques de Shunté y Mishollo", 2018, 139.3335779615,
  "San Martín", "Bosques de Shunté y Mishollo", 2019, 25.9790979804,
  "San Martín", "Bosques de Shunté y Mishollo", 2020, 26.5113755741,
  "San Martín", "Bosques de Shunté y Mishollo", 2021, 46.6628089851,
  "San Martín", "Bosques de Shunté y Mishollo", 2022, 64.6252798651,
  "San Martín", "Bosques de Shunté y Mishollo", 2023, 59.9845303723,
  "San Martín", "Bosques de Shunté y Mishollo", 2024, 311.9996210849,
  "San Martín", "Bosques de Shunté y Mishollo", 2025, 53.4640176298,
  "San Martín", "Bosques de Shunté y Mishollo", 2026, 0
)

# LORETO - Ampiyacu Apayacu
loreto_aa <- tribble(
  ~Region, ~ACR, ~Anio, ~Deforestacion_ha,
  "Loreto", "Ampiyacu Apayacu", 2001, 1.34,
  "Loreto", "Ampiyacu Apayacu", 2002, 7.56,
  "Loreto", "Ampiyacu Apayacu", 2003, 0.57,
  "Loreto", "Ampiyacu Apayacu", 2004, 17.18,
  "Loreto", "Ampiyacu Apayacu", 2005, 8.29,
  "Loreto", "Ampiyacu Apayacu", 2006, 3.99,
  "Loreto", "Ampiyacu Apayacu", 2007, 0.6,
  "Loreto", "Ampiyacu Apayacu", 2008, 3.41,
  "Loreto", "Ampiyacu Apayacu", 2009, 4.86,
  "Loreto", "Ampiyacu Apayacu", 2010, 7.22,
  "Loreto", "Ampiyacu Apayacu", 2011, 7.09,
  "Loreto", "Ampiyacu Apayacu", 2012, 2.75,
  "Loreto", "Ampiyacu Apayacu", 2013, 7.1,
  "Loreto", "Ampiyacu Apayacu", 2014, 92.99,
  "Loreto", "Ampiyacu Apayacu", 2015, 3.96,
  "Loreto", "Ampiyacu Apayacu", 2016, 173.62,
  "Loreto", "Ampiyacu Apayacu", 2017, 1.08,
  "Loreto", "Ampiyacu Apayacu", 2018, 25.54,
  "Loreto", "Ampiyacu Apayacu", 2019, 7.12,
  "Loreto", "Ampiyacu Apayacu", 2020, 139.05,
  "Loreto", "Ampiyacu Apayacu", 2021, 1.82,
  "Loreto", "Ampiyacu Apayacu", 2022, 0.82,
  "Loreto", "Ampiyacu Apayacu", 2023, 0.42,
  "Loreto", "Ampiyacu Apayacu", 2024, 23.27,
  "Loreto", "Ampiyacu Apayacu", 2025, 3.74,
  "Loreto", "Ampiyacu Apayacu", 2026, 0
)

# LORETO - Alto Nanay Pintuyacu Chambira
loreto_anpch <- tribble(
  ~Region, ~ACR, ~Anio, ~Deforestacion_ha,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2001, 9.54,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2002, 43.29,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2003, 22.39,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2004, 14.31,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2005, 14.4,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2006, 71.86,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2007, 4.05,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2008, 21.96,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2009, 39.42,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2010, 111.72,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2011, 26.49,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2012, 49.77,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2013, 149.14,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2014, 47.97,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2015, 36.09,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2016, 15.84,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2017, 202.95,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2018, 13.41,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2019, 5.22,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2020, 5.13,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2021, 23.87,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2022, 0.27,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2023, 13.33,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2024, 0.76,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2025, 9.53,
  "Loreto", "Alto Nanay Pintuyacu Chambira", 2026, 0
)

# LORETO - Comunal Tamshiyacu Tahuayo
loreto_ctt <- tribble(
  ~Region, ~ACR, ~Anio, ~Deforestacion_ha,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2001, 4.3,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2002, 1.36,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2003, 4.05,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2004, 2.35,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2005, 13.08,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2006, 13.85,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2007, 5.42,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2008, 3.08,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2009, 3.94,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2010, 3.75,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2011, 8.69,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2012, 2,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2013, 3.85,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2014, 17.03,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2015, 15.9,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2016, 28.65,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2017, 10.82,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2018, 12.31,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2019, 10.76,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2020, 4.2,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2021, 3.78,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2022, 5.5,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2023, 0.49,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2024, 10.63,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2025, 9.93,
  "Loreto", "Comunal Tamshiyacu Tahuayo", 2026, 0
)

# LORETO - Maijuna Kichwa
loreto_mk <- tribble(
  ~Region, ~ACR, ~Anio, ~Deforestacion_ha,
  "Loreto", "Maijuna Kichwa", 2001, 10.02,
  "Loreto", "Maijuna Kichwa", 2002, 4.76,
  "Loreto", "Maijuna Kichwa", 2003, 4.65,
  "Loreto", "Maijuna Kichwa", 2004, 5.49,
  "Loreto", "Maijuna Kichwa", 2005, 9.5,
  "Loreto", "Maijuna Kichwa", 2006, 4.31,
  "Loreto", "Maijuna Kichwa", 2007, 1.2,
  "Loreto", "Maijuna Kichwa", 2008, 43.65,
  "Loreto", "Maijuna Kichwa", 2009, 4.58,
  "Loreto", "Maijuna Kichwa", 2010, 5.9,
  "Loreto", "Maijuna Kichwa", 2011, 3.98,
  "Loreto", "Maijuna Kichwa", 2012, 154.06,
  "Loreto", "Maijuna Kichwa", 2013, 62.98,
  "Loreto", "Maijuna Kichwa", 2014, 27.72,
  "Loreto", "Maijuna Kichwa", 2015, 17.6,
  "Loreto", "Maijuna Kichwa", 2016, 38.92,
  "Loreto", "Maijuna Kichwa", 2017, 7.97,
  "Loreto", "Maijuna Kichwa", 2018, 13.72,
  "Loreto", "Maijuna Kichwa", 2019, 1.93,
  "Loreto", "Maijuna Kichwa", 2020, 6.5,
  "Loreto", "Maijuna Kichwa", 2021, 9.58,
  "Loreto", "Maijuna Kichwa", 2022, 58.67,
  "Loreto", "Maijuna Kichwa", 2023, 2.8,
  "Loreto", "Maijuna Kichwa", 2024, 1.58,
  "Loreto", "Maijuna Kichwa", 2025, 46.64,
  "Loreto", "Maijuna Kichwa", 2026, 0
)

# ========================================
# CONSOLIDAR TODO EN UNA LISTA
# ========================================
datos_temporales_reales <- bind_rows(
  cusco_chq,
  cusco_chu,
  cusco_qk,
  sm_ce,
  sm_bsm,
  loreto_aa,
  loreto_anpch,
  loreto_ctt,
  loreto_mk
)

# Mapeo de códigos ACR
datos_temporales_reales <- datos_temporales_reales %>%
  mutate(
    ACR_codigo = case_when(
      ACR == "Choquequirao" ~ "ACR_CHQ",
      ACR == "Chuyapi Urusayhua" ~ "ACR_CHU",
      ACR == "Q'eros Kosñipata" ~ "ACR_QK",
      ACR == "Cordillera Escalera" ~ "ACR_CE",
      ACR == "Bosques de Shunté y Mishollo" ~ "ACR_BSM",
      ACR == "Ampiyacu Apayacu" ~ "ACR_AA",
      ACR == "Alto Nanay Pintuyacu Chambira" ~ "ACR_ANPCH",
      ACR == "Comunal Tamshiyacu Tahuayo" ~ "ACR_CTT",
      ACR == "Maijuna Kichwa" ~ "ACR_MK",
      TRUE ~ ACR
    )
  )

cat("✅ Datos temporales reales cargados exitosamente\n")
cat(sprintf("   Total de registros: %d\n", nrow(datos_temporales_reales)))
cat(sprintf("   ACRs únicas: %d\n", length(unique(datos_temporales_reales$ACR_codigo))))
