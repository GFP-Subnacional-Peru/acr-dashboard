/* Mapa Leaflet — polígonos ACR/ZI + vectores deforestación acumulada (Loreto) */
const AcrMap = (() => {
  let map = null;
  let defoLayer = null;
  let clusterGroup = null;
  const layerRefs = { acr: null, zi: null, limites: null };

  const TIPO_COLORS = {
    Antropogenico: "#e74c3c",
    Natural: "#27ae60",
    "Falsa alerta": "#f39c12",
  };

  function init() {
    if (map) return map;
    map = L.map("map", { scrollWheelZoom: true, preferCanvas: true }).setView([-7.5, -74.5], 6);

    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 18,
    });
    const sat = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "© Esri", maxZoom: 18 }
    );
    const topo = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
      { attribution: "© Esri", maxZoom: 18 }
    );
    sat.addTo(map);

    defoLayer = L.layerGroup();
    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 80,
      disableClusteringAtZoom: 15,
      spiderfyOnMaxZoom: true,
    });

    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

    map._baseLayers = {
      "🗺️ Calles (OSM)": osm,
      "🛰️ Satelital (Esri)": sat,
      "⛰️ Topográfico": topo,
    };
    map._overlayReady = false;
    map._defoMode = "vectors";
    return map;
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
    map._legend = L.control({ position: "bottomright" });
    map._legend.onAdd = () => {
      const div = L.DomUtil.create("div", "map-legend");
      let defoLine = `<span style="color:#d32f2f">●</span> Deforestación (centroides)`;
      if (mode === "vectors" || mode === "mixed") {
        defoLine = `<span style="color:#e74c3c">■</span> Deforestación acumulada (polígonos)<br>
           <span style="color:#27ae60">■</span> Natural · <span style="color:#e74c3c">■</span> Antropogénico`;
        if (mode === "mixed") {
          defoLine += `<br><span style="color:#d32f2f">●</span> Otros deptos. (centroides)`;
        }
      }
      div.innerHTML = `<div style="background:#fff;padding:10px;border-radius:6px;font-size:12px;line-height:1.6">
        <b>🔍 Leyenda del Mapa</b><br>
        <span style="color:#2E7D32">□</span> ACR (solo borde)<br>
        <span style="color:#616161">□</span> Zona de Influencia (solo borde)<br>
        <span style="color:#E30613">—</span> Límites departamentales<br>
        ${defoLine}
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
      overlays["🔴 Deforestación (polígonos)"] = defoLayer;
      overlays["🔴 Deforestación (centroides)"] = clusterGroup;
    } else {
      overlays["🔴 Deforestación"] = mode === "vectors" ? defoLayer : clusterGroup;
    }

    map._layerControl = L.control.layers(map._baseLayers, overlays, { collapsed: false }).addTo(map);
  }

  const DEPTO_CODES = {
    loreto: ["ACR_AA", "ACR_ANPCH", "ACR_MK", "ACR_CTT", "ZI_AA", "ZI_ANPCH", "ZI_MK", "ZI_CTT"],
    san_martin: ["ACR_BSM", "ACR_CE", "ZI_BSM", "ZI_CE"],
    cusco: ["ACR_CHQ", "ACR_CHU", "ACR_QK", "ZI_CHQ", "ZI_CHU", "ZI_QK"],
  };

  function shouldUseLoretoVectors(state) {
    if (state.departamento === "loreto") return true;
    if (state.departamento === "todos") {
      if (!state.acrs.length) return true;
      return state.acrs.some((c) => DEPTO_CODES.loreto.includes(c));
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
    if (opts.excludeLoreto) {
      const loreto = new Set(DEPTO_CODES.loreto);
      pts = pts.filter((p) => !loreto.has(p.codigo));
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
    return `<div style="font-family:Arial;min-width:200px">
      <h4 style="color:#d32f2f;margin:0 0 8px">Deforestación acumulada</h4>
      <b>Zona:</b> ${p.zona_key || "—"}<br>
      ${p.sector ? `<b>Sector:</b> ${p.sector}<br>` : ""}
      <b>Tipo:</b> ${p.tipo || "—"}<br>
      <b>Año:</b> ${p.anno || "N/A"}<br>
      <b>Área:</b> <span style="color:#d32f2f">${Number(p.area_ha || 0).toFixed(4)} ha</span>
      ${p.fuente ? `<br><b>Fuente:</b> ${p.fuente}` : ""}
    </div>`;
  }

  function updateLoretoMapNote(state, meta, mode) {
    const el = document.getElementById("map-loreto-info");
    if (!el) return;
    const lo = Math.min(state.annoDesde, state.annoHasta);
    const hi = Math.max(state.annoDesde, state.annoHasta);
    if (mode === "vectors" || mode === "mixed") {
      const n = meta?.count ?? 0;
      el.innerHTML = `<i class="fas fa-info-circle"></i> <strong>Loreto</strong>: <b>${n.toLocaleString("es-PE")}</b> polígonos acumulados (${lo}–${hi}) · GDB <em>MonitoreoDeforestacionAcumulado</em>${
        mode === "mixed" ? " · otros deptos. en centroides" : ""
      }`;
    } else {
      el.innerHTML = `<i class="fas fa-info-circle"></i> Deforestación en centroides precalculados (${lo}–${hi}). En <strong>Loreto</strong> use el filtro de departamento o recargue si el servidor acaba de reiniciarse.`;
    }
  }

  async function loadDeforestationVectors(state, loretoAcrs) {
    const note = document.getElementById("map-loreto-info");
    if (note) {
      note.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Cargando polígonos Loreto (${state.annoDesde}–${state.annoHasta})…`;
    }
    const params = {
      departamento: "loreto",
      ambito: state.ambito || "acr",
      acr: loretoAcrs?.length ? loretoAcrs : undefined,
      anno_desde: state.annoDesde,
      anno_hasta: state.annoHasta,
      limit: 0,
    };
    const geo = await apiGet("/api/deforestacion/vectors", params);
    const features = geo.features || [];
    const meta = geo.meta || {};
    if (!features.length) {
      console.info("Sin polígonos acumulados para los filtros activos.");
      updateLoretoMapNote(state, meta, "vectors");
      return { ok: false, meta };
    }
    defoLayer.clearLayers();
    L.geoJSON(geo, {
      style: (f) => {
        const tipo = f.properties?.tipo || "Antropogenico";
        return {
          color: TIPO_COLORS[tipo] || "#c0392b",
          weight: 0.8,
          fillColor: TIPO_COLORS[tipo] || "#e74c3c",
          fillOpacity: 0.65,
        };
      },
      onEachFeature: (f, layer) => {
        const p = f.properties || {};
        layer.bindPopup(vectorPopup(p));
        if (p.anno != null) {
          layer.bindTooltip(`${p.anno} · ${Number(p.area_ha || 0).toFixed(2)} ha`, { sticky: true });
        }
      },
    }).eachLayer((l) => defoLayer.addLayer(l));
    map.addLayer(defoLayer);
    console.info(`Mapa: ${features.length} polígonos acumulados (GDB Loreto, ${state.annoDesde}–${state.annoHasta}).`);
    updateLoretoMapNote(state, meta, "vectors");
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
        `<div style="font-family:Arial;min-width:200px">
          <h4 style="color:#d32f2f;margin:0 0 8px">🔴 Deforestación</h4>
          <b>Zona:</b> ${String(p.codigo).replace(/^(ACR_|ZI_)/, "")}<br>
          <b>Tipo:</b> ${p.tipo === "acr" ? "ACR" : "ZI"}<br>
          <b>Año:</b> ${p.anno || "N/A"}<br>
          <b>Área:</b> <span style="color:#d32f2f">${Number(p.area).toFixed(4)} ha</span>
        </div>`
      );
      clusterGroup.addLayer(m);
    });
    map.addLayer(clusterGroup);
  }

  async function loadDeforestation(state) {
    let hasVectors = false;
    let vectorMeta = null;
    if (shouldUseLoretoVectors(state)) {
      const loretoAcrs = state.acrs.filter((c) => DEPTO_CODES.loreto.includes(c));
      try {
        const res = await loadDeforestationVectors(
          state,
          loretoAcrs.length ? loretoAcrs : undefined
        );
        hasVectors = res?.ok;
        vectorMeta = res?.meta;
      } catch (err) {
        console.warn("Vectores Loreto no disponibles (¿reinició el servidor?):", err);
        updateLoretoMapNote(state, null, "centroids");
      }
    }

    const needsCentroids = state.departamento !== "loreto" || !hasVectors;
    if (needsCentroids) {
      await loadDeforestationCentroids(state, { excludeLoreto: hasVectors });
    }

    if (hasVectors && needsCentroids) map._defoMode = "mixed";
    else if (hasVectors) map._defoMode = "vectors";
    else map._defoMode = "centroids";

    if (hasVectors) updateLoretoMapNote(state, vectorMeta, map._defoMode);
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
