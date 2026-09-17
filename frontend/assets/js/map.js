/* Mapa Leaflet — polígonos ACR/ZI + vectores deforestación acumulada (Loreto) */
const AcrMap = (() => {
  let map = null;
  let defoLayer = null;
  let clusterGroup = null;
  const layerRefs = { acr: null, zi: null, limites: null };

  const TIPO_COLORS = {
    Antropogenico: "#9a3412",
    Natural: "#0f766e",
  };

  function fmtHa(v, digits = 1) {
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return "0";
    return n.toLocaleString("es-PE", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function defoStyle(tipo) {
    const fill = TIPO_COLORS[tipo] || TIPO_COLORS.Antropogenico;
    const soft = tipo === "Natural" ? 0.55 : 0.58;
    return {
      color: fill,
      weight: 1.1,
      opacity: 0.9,
      fillColor: fill,
      fillOpacity: soft,
    };
  }

  function defoStyleHover(tipo) {
    const fill = TIPO_COLORS[tipo] || TIPO_COLORS.Antropogenico;
    return {
      color: "#ffffff",
      weight: 2,
      opacity: 1,
      fillColor: fill,
      fillOpacity: 0.75,
    };
  }

  function init() {
    if (map) return map;
    map = L.map("map", {
      scrollWheelZoom: true,
      preferCanvas: true,
      zoomControl: false,
    }).setView([-7.5, -74.5], 6);

    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "Leaflet | © OpenStreetMap",
      maxZoom: 18,
    });
    const sat = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Leaflet | Tiles © Esri, Maxar, Earthstar Geographics", maxZoom: 18 }
    );
    const topo = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Leaflet | Tiles © Esri", maxZoom: 18 }
    );
    sat.addTo(map);

    map._tiles = { sat, topo, osm };
    map._activeBase = "sat";

    defoLayer = L.layerGroup();
    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 80,
      disableClusteringAtZoom: 15,
      spiderfyOnMaxZoom: true,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

    addBasemapControl();
    addMapTools();

    map._overlayReady = false;
    map._defoMode = "vectors";
    return map;
  }

  function setBaseLayer(key) {
    if (!map || !map._tiles) return;
    Object.values(map._tiles).forEach((layer) => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });
    const next = map._tiles[key] || map._tiles.sat;
    next.addTo(map);
    map._activeBase = key;
    map.getContainer()
      .querySelectorAll(".gfp-basemap-btn")
      .forEach((btn) => btn.classList.toggle("active", btn.dataset.base === key));
  }

  function addBasemapControl() {
    if (map._basemapCtrl) map.removeControl(map._basemapCtrl);
    map._basemapCtrl = L.control({ position: "topleft" });
    map._basemapCtrl.onAdd = () => {
      const wrap = L.DomUtil.create("div", "gfp-map-ui gfp-basemap");
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);
      wrap.innerHTML = `
        <button type="button" class="gfp-basemap-btn active" data-base="sat">Satelital</button>
        <button type="button" class="gfp-basemap-btn" data-base="topo">Topográfico</button>
        <button type="button" class="gfp-basemap-btn" data-base="osm">Calles</button>
      `;
      wrap.querySelectorAll(".gfp-basemap-btn").forEach((btn) => {
        btn.addEventListener("click", () => setBaseLayer(btn.dataset.base));
      });
      return wrap;
    };
    map._basemapCtrl.addTo(map);
  }

  function addMapTools() {
    if (map._toolsCtrl) map.removeControl(map._toolsCtrl);
    map._toolsCtrl = L.control({ position: "bottomleft" });
    map._toolsCtrl.onAdd = () => {
      const wrap = L.DomUtil.create("div", "gfp-map-ui gfp-map-tools");
      L.DomEvent.disableClickPropagation(wrap);
      wrap.innerHTML = `
        <button type="button" class="gfp-tool-btn" id="gfp-map-fs" title="Pantalla completa" aria-label="Pantalla completa">
          <i class="fas fa-expand"></i>
        </button>
        <button type="button" class="gfp-tool-btn" id="gfp-map-reset" title="Restablecer vista" aria-label="Restablecer vista">
          <i class="fas fa-undo"></i>
        </button>
      `;
      wrap.querySelector("#gfp-map-fs")?.addEventListener("click", toggleFullscreen);
      wrap.querySelector("#gfp-map-reset")?.addEventListener("click", () => {
        try {
          if (layerRefs.acr) map.fitBounds(layerRefs.acr.getBounds(), { padding: [30, 30], maxZoom: 9 });
          else map.setView([-7.5, -74.5], 6);
        } catch (_) {
          map.setView([-7.5, -74.5], 6);
        }
      });
      return wrap;
    };
    map._toolsCtrl.addTo(map);
  }

  function toggleFullscreen() {
    const el = document.getElementById("map");
    const card = el?.closest(".dash-map-card") || el;
    if (!card) return;
    const active = card.classList.toggle("gfp-map-fullscreen");
    document.body.classList.toggle("gfp-map-fs-open", active);
    const icon = document.querySelector("#gfp-map-fs i");
    if (icon) icon.className = active ? "fas fa-compress" : "fas fa-expand";
    setTimeout(() => map?.invalidateSize(), 220);
  }

  function geoLayer(geo, style, groupName) {
    if (!geo || !geo.features || !geo.features.length) return null;
    return L.geoJSON(geo, {
      style: typeof style === "function" ? style : () => style,
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        if (p.popup_html) layer.bindPopup(p.popup_html, { maxWidth: 320 });
        if (p.Nombre) layer.bindTooltip(p.Nombre, { sticky: true });
        layer.options.groupName = groupName;
      },
    });
  }

  function clearLayers() {
    if (!map) return;
    Object.values(layerRefs).forEach((l) => {
      if (l) map.removeLayer(l);
    });
    layerRefs.acr = layerRefs.zi = layerRefs.limites = null;
    if (defoLayer) {
      defoLayer.clearLayers();
      map.removeLayer(defoLayer);
    }
    if (clusterGroup) {
      clusterGroup.clearLayers();
      map.removeLayer(clusterGroup);
    }
  }

  function addLegend(mode) {
    if (map._legend) map.removeControl(map._legend);
    map._legend = L.control({ position: "topleft" });
    map._legend.onAdd = () => {
      const div = L.DomUtil.create("div", "map-legend gfp-legend");
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);

      let defoRows = `
        <li class="map-legend-item">
          <span class="map-legend-dot map-legend-dot--defo"></span>
          <span>Deforestación (centroides)</span>
        </li>`;
      if (mode === "vectors" || mode === "mixed") {
        defoRows = `
        <li class="map-legend-item">
          <span class="map-legend-dot map-legend-dot--antropico"></span>
          <span>Origen antrópico</span>
        </li>
        <li class="map-legend-item">
          <span class="map-legend-dot map-legend-dot--natural"></span>
          <span>Natural</span>
        </li>`;
        if (mode === "mixed") {
          defoRows += `
        <li class="map-legend-item">
          <span class="map-legend-dot map-legend-dot--defo"></span>
          <span>Otros deptos. (centroides)</span>
        </li>`;
        }
      }

      div.innerHTML = `
        <div class="map-legend-card">
          <div class="map-legend-title">Deforestación acumulada</div>
          <ul class="map-legend-list">
            <li class="map-legend-item">
              <span class="map-legend-dot map-legend-dot--acr"></span>
              <span>Área de Conservación Regional</span>
            </li>
            <li class="map-legend-item">
              <span class="map-legend-dot map-legend-dot--zi"></span>
              <span>Zona de influencia</span>
            </li>
            <li class="map-legend-item">
              <span class="map-legend-dot map-legend-dot--limites"></span>
              <span>Límites departamentales</span>
            </li>
            ${defoRows}
          </ul>
        </div>`;
      return div;
    };
    map._legend.addTo(map);
  }

  function setupLayerControl(mode) {
    if (map._layerControl) map.removeControl(map._layerControl);
    const overlays = {};
    if (layerRefs.acr) overlays["ACRs"] = layerRefs.acr;
    if (layerRefs.zi) overlays["Zonas de Influencia"] = layerRefs.zi;
    if (layerRefs.limites) overlays["Límites Departamentales"] = layerRefs.limites;
    if (mode === "mixed") {
      overlays["Deforestación (polígonos)"] = defoLayer;
      overlays["Deforestación (centroides)"] = clusterGroup;
    } else {
      overlays["Deforestación"] = mode === "vectors" ? defoLayer : clusterGroup;
    }

    map._layerControl = L.control({ position: "topright" });
    map._layerControl.onAdd = () => {
      const wrap = L.DomUtil.create("div", "gfp-map-ui gfp-overlays");
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);
      const rows = Object.entries(overlays)
        .map(([label, layer], i) => {
          const id = `gfp-ov-${i}`;
          const checked = map.hasLayer(layer) ? "checked" : "";
          return `<label class="gfp-overlay-row" for="${id}">
            <input type="checkbox" id="${id}" ${checked} data-ov="${i}" />
            <span>${label}</span>
          </label>`;
        })
        .join("");
      wrap.innerHTML = `<div class="gfp-overlays-title">Capas</div>${rows}`;
      const entries = Object.values(overlays);
      wrap.querySelectorAll("input[type=checkbox]").forEach((input) => {
        input.addEventListener("change", () => {
          const layer = entries[+input.dataset.ov];
          if (!layer) return;
          if (input.checked) map.addLayer(layer);
          else map.removeLayer(layer);
        });
      });
      return wrap;
    };
    map._layerControl.addTo(map);
  }

  const DEPTO_CODES = {
    loreto: ["ACR_AA", "ACR_ANPCH", "ACR_MK", "ACR_CTT", "ZI_AA", "ZI_ANPCH", "ZI_MK", "ZI_CTT"],
    san_martin: ["ACR_BSM", "ACR_CE", "ZI_BSM", "ZI_CE"],
    cusco: ["ACR_CHQ", "ACR_CHU", "ACR_QK", "ZI_CHQ", "ZI_CHU", "ZI_QK"],
  };
  const VECTOR_DEPTOS = ["loreto", "san_martin", "cusco"];
  const ALL_VECTOR_CODES = new Set(VECTOR_DEPTOS.flatMap((d) => DEPTO_CODES[d]));

  function shouldUseVectors(state) {
    if (VECTOR_DEPTOS.includes(state.departamento)) return true;
    if (state.departamento === "todos") {
      if (!state.acrs.length) return true;
      return state.acrs.some((c) => ALL_VECTOR_CODES.has(c));
    }
    return false;
  }

  function filterPoints(points, state, opts = {}) {
    let pts = points;
    if (state.ambito === "acr") pts = pts.filter((p) => p.tipo === "acr");
    else if (state.ambito === "zi") pts = pts.filter((p) => p.tipo === "zi");
    if (state.departamento !== "todos") {
      const allowed = new Set(DEPTO_CODES[state.departamento] || []);
      pts = pts.filter((p) => allowed.has(p.codigo));
    }
    if (state.acrs.length) {
      const allowed = new Set([...state.acrs, ...state.acrs.map((c) => c.replace("ACR_", "ZI_"))]);
      pts = pts.filter((p) => allowed.has(p.codigo));
    }
    if (opts.excludeVectorCodes) {
      pts = pts.filter((p) => !ALL_VECTOR_CODES.has(p.codigo));
    }
    if (state.annoDesde != null && state.annoHasta != null) {
      const lo = Math.min(state.annoDesde, state.annoHasta);
      const hi = Math.max(state.annoDesde, state.annoHasta);
      pts = pts.filter((p) => {
        const y = parseInt(p.anno, 10);
        return !Number.isNaN(y) && y >= lo && y <= hi;
      });
    }
    return pts;
  }

  function vectorPopup(p) {
    const tipo = p.tipo || "—";
    const causa = (p.causa_nombre || "").trim();
    const fuente = (p.fuente_nombre || "").trim();
    const color = TIPO_COLORS[tipo] || "#c0392b";
    const tipoLabel = tipo === "Antropogenico" ? "Origen antrópico" : tipo;
    const showCausa =
      causa &&
      !["Natural", "Falsa alerta", "Sin especificar", "Sin datos"].includes(causa) &&
      tipoLabel === "Origen antrópico";
    return `<div class="defo-popup" style="font-family:'Segoe UI',Arial,sans-serif;min-width:220px;line-height:1.5">
      <div style="display:flex;align-items:center;gap:8px;margin:0 0 10px">
        <span style="width:10px;height:10px;border-radius:2px;background:${color};box-shadow:0 0 0 1px rgba(255,255,255,.85)"></span>
        <strong style="color:${color};font-size:0.95rem">Deforestación acumulada</strong>
      </div>
      <div style="font-size:0.86rem;color:#334155">
        <div><span style="color:#64748b">Zona</span> · <b>${p.zona_key || "—"}</b></div>
        ${p.sector ? `<div><span style="color:#64748b">Sector</span> · ${p.sector}</div>` : ""}
        <div><span style="color:#64748b">Tipo</span> · <b style="color:${color}">${tipoLabel}</b></div>
        ${showCausa ? `<div><span style="color:#64748b">Causa</span> · <b>${causa}</b></div>` : ""}
        <div><span style="color:#64748b">Año</span> · ${p.anno || "N/A"}</div>
        <div style="margin-top:6px"><span style="color:#64748b">Área</span> · <b style="color:${color};font-size:1.05rem">${fmtHa(p.area_ha, 1)} ha</b></div>
        ${fuente ? `<div><span style="color:#64748b">Fuente</span> · ${fuente}</div>` : ""}
      </div>
    </div>`;
  }

  function updateMapVectorsNote(state, meta, mode) {
    const el = document.getElementById("map-loreto-info");
    if (!el) return;
    const lo = Math.min(state.annoDesde, state.annoHasta);
    const hi = Math.max(state.annoDesde, state.annoHasta);
    const deptoLabel = {
      loreto: "Loreto",
      san_martin: "San Martín",
      cusco: "Cusco",
      todos: "Todas las regiones",
    }[state.departamento] || state.departamento;
    if (mode === "vectors" || mode === "mixed") {
      const n = meta?.count ?? 0;
      const hitLimit = !!(meta?.limited || (meta?.limit > 0 && n >= meta.limit));
      const limitNote = hitLimit
        ? ` · <em>mostrando ${n.toLocaleString("es-PE")} de muchos — filtre ACR o años</em>`
        : "";
      el.innerHTML = `<i class="fas fa-info-circle"></i> <strong>${deptoLabel}</strong>: <b>${n.toLocaleString("es-PE")}</b> polígonos acumulados (${lo}–${hi}) · GDB <em>MonitoreoDeforestacionAcumulado</em>${
        mode === "mixed" ? " · resto en centroides" : ""
      }${limitNote}`;
    } else {
      el.innerHTML = `<i class="fas fa-info-circle"></i> Deforestación en centroides precalculados (${lo}–${hi}).`;
    }
  }

  async function loadDeforestationVectors(state, acrFilter) {
    const note = document.getElementById("map-loreto-info");
    const deptoApi = VECTOR_DEPTOS.includes(state.departamento) ? state.departamento : "todos";
    if (note) {
      note.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Cargando polígonos (${deptoApi}, ${state.annoDesde}–${state.annoHasta})…`;
    }
    const yearSpan =
      Math.abs(Number(state.annoHasta) - Number(state.annoDesde)) + 1;
    const singleAcr =
      (Array.isArray(acrFilter) && acrFilter.length === 1) ||
      (Array.isArray(state.acrs) && state.acrs.length === 1);
    const selectedAcrs =
      (Array.isArray(acrFilter) && acrFilter.length > 0) ||
      (Array.isArray(state.acrs) && state.acrs.length > 0);
    // Con ACR elegidos: sin tope. Vista “todos”: tope alto; backend reparte por ACR
    const limit = singleAcr || selectedAcrs ? 0 : state.departamento === "todos" || yearSpan > 10 ? 12000 : 0;
    const params = {
      departamento: deptoApi,
      ambito: state.ambito || "acr",
      acr: acrFilter?.length ? acrFilter : undefined,
      anno_desde: state.annoDesde,
      anno_hasta: state.annoHasta,
      limit,
    };
    const geo = await apiGet("/api/deforestacion/vectors", params);
    // Seguridad: excluir falsas alertas aunque el backend las envíe
    geo.features = (geo.features || []).filter((f) => (f.properties?.tipo || "") !== "Falsa alerta");
    const features = geo.features || [];
    if (geo.meta) geo.meta.count = features.length;
    const meta = geo.meta || {};
    if (!features.length) {
      console.info("Sin polígonos acumulados para los filtros activos.");
      updateMapVectorsNote(state, meta, "vectors");
      return { ok: false, meta };
    }
    defoLayer.clearLayers();
    L.geoJSON(geo, {
      style: (f) => defoStyle(f.properties?.tipo || "Antropogenico"),
      onEachFeature: (f, layer) => {
        const p = f.properties || {};
        const tipo = p.tipo || "Antropogenico";
        layer.bindPopup(vectorPopup(p));
        if (p.anno != null) {
          layer.bindTooltip(`${p.anno} · ${fmtHa(p.area_ha, 1)} ha`, {
            sticky: true,
            opacity: 0.92,
          });
        }
        layer.on({
          mouseover: (e) => {
            const ly = e.target;
            ly.setStyle(defoStyleHover(tipo));
            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) ly.bringToFront();
          },
          mouseout: (e) => {
            e.target.setStyle(defoStyle(tipo));
          },
        });
      },
    }).eachLayer((l) => defoLayer.addLayer(l));
    map.addLayer(defoLayer);
    console.info(`Mapa: ${features.length} polígonos acumulados (${deptoApi}, ${state.annoDesde}–${state.annoHasta}, limit=${limit}).`);
    updateMapVectorsNote(state, meta, "vectors");
    return { ok: true, meta };
  }

  async function loadDeforestationCentroids(state, opts = {}) {
    const params = {
      departamento: state.departamento,
      ambito: state.ambito || "acr",
      acr: state.acrs.length ? state.acrs : undefined,
      anno_desde: state.annoDesde,
      anno_hasta: state.annoHasta,
      limit: 0,
    };
    const data = await apiGet("/api/deforestacion/centroides", params);
    const points = filterPoints(data.data || [], state, opts);
    if (!points.length) {
      console.info("Sin puntos de deforestación para los filtros activos (incl. año).");
      return;
    }
    points.forEach((p) => {
      if (!p.lon || !p.lat) return;
      const m = L.circleMarker([p.lat, p.lon], {
        radius: 5,
        color: "#c0392b",
        fillColor: "#e74c3c",
        fillOpacity: 0.75,
        weight: 1,
      });
      m.bindPopup(
        `<div style="font-family:'Segoe UI',Arial,sans-serif;min-width:200px;line-height:1.45">
          <h4 style="color:#c0392b;margin:0 0 8px;font-size:0.95rem">Deforestación</h4>
          <b>Zona:</b> ${String(p.codigo).replace(/^(ACR_|ZI_)/, "")}<br>
          <b>Tipo:</b> ${p.tipo === "acr" ? "ACR" : "ZI"}<br>
          <b>Año:</b> ${p.anno || "N/A"}<br>
          <b>Área:</b> <span style="color:#c0392b;font-weight:700">${fmtHa(p.area, 1)} ha</span>
        </div>`
      );
      clusterGroup.addLayer(m);
    });
    map.addLayer(clusterGroup);
  }

  async function loadDeforestation(state) {
    let hasVectors = false;
    let vectorMeta = null;
    if (shouldUseVectors(state)) {
      const vectorAcrs = state.acrs.filter((c) => ALL_VECTOR_CODES.has(c));
      try {
        const res = await loadDeforestationVectors(
          state,
          vectorAcrs.length ? vectorAcrs : undefined
        );
        hasVectors = res?.ok;
        vectorMeta = res?.meta;
      } catch (err) {
        console.warn("Vectores GDB no disponibles (¿reinició el servidor?):", err);
        updateMapVectorsNote(state, null, "centroids");
      }
    }

    const needsCentroids = !VECTOR_DEPTOS.includes(state.departamento) || !hasVectors;
    if (needsCentroids) {
      await loadDeforestationCentroids(state, { excludeVectorCodes: hasVectors });
    }

    if (hasVectors && needsCentroids) map._defoMode = "mixed";
    else if (hasVectors) map._defoMode = "vectors";
    else map._defoMode = "centroids";

    if (hasVectors) updateMapVectorsNote(state, vectorMeta, map._defoMode);
  }

  async function refresh(state) {
    init();
    clearLayers();

    const params = {
      departamento: state.departamento,
      ambito: state.ambito || "acr",
      acr: state.acrs.length ? state.acrs : undefined,
    };

    const layers = await apiGet("/api/map/layers", params);

    if (!layers.geojson_ready) {
      console.warn("Ejecute exportar_datos.bat para polígonos ACR/ZI");
    }

    const limColors = { LORETO: "#E30613", SAN_MARTIN: "#E30613", CUSCO: "#E30613" };
    if (layers.limites) {
      layerRefs.limites = geoLayer(
        layers.limites,
        (f) => ({
          color: limColors[f.properties.codigo] || "#E30613",
          weight: 2.5,
          fill: false,
          fillOpacity: 0,
          opacity: 0.95,
        }),
        "limites"
      );
      if (layerRefs.limites) layerRefs.limites.addTo(map);
    }

    if (layers.zi) {
      layerRefs.zi = geoLayer(
        layers.zi,
        {
          color: "#616161",
          weight: 2,
          fill: false,
          fillOpacity: 0,
          fillColor: "#9E9E9E",
        },
        "zi"
      );
      if (layerRefs.zi) layerRefs.zi.addTo(map);
    }

    if (layers.acr) {
      layerRefs.acr = geoLayer(
        layers.acr,
        {
          color: "#2E7D32",
          weight: 2.5,
          fill: false,
          fillOpacity: 0,
          fillColor: "#4CAF50",
        },
        "acr"
      );
      if (layerRefs.acr) {
        layerRefs.acr.addTo(map);
        try {
          map.fitBounds(layerRefs.acr.getBounds(), { padding: [30, 30], maxZoom: 9 });
        } catch (_) {}
      }
    }

    await loadDeforestation(state);
    setupLayerControl(map._defoMode);
    addLegend(map._defoMode);
    setTimeout(() => map.invalidateSize(), 300);
  }

  return { init, refresh };
})();
