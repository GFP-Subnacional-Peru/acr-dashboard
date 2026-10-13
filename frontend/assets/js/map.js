/* Mapa Leaflet — polígonos ACR/ZI + vectores deforestación acumulada (Loreto) */
const AcrMap = (() => {
  let map = null;
  let defoAnt = null;
  let defoNat = null;
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

    // Panes: límites/ACR abajo · vectores de deforestación arriba (prioridad de click)
    if (!map.getPane("boundariesPane")) {
      map.createPane("boundariesPane");
      map.getPane("boundariesPane").style.zIndex = 350;
    }
    if (!map.getPane("defoPane")) {
      map.createPane("defoPane");
      map.getPane("defoPane").style.zIndex = 460;
      map.getPane("defoPane").style.pointerEvents = "auto";
    }
    if (!map.getPane("centroidsPane")) {
      map.createPane("centroidsPane");
      map.getPane("centroidsPane").style.zIndex = 470;
    }

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

    defoAnt = L.layerGroup([], { pane: "defoPane" });
    defoNat = L.layerGroup([], { pane: "defoPane" });
    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 80,
      disableClusteringAtZoom: 15,
      spiderfyOnMaxZoom: true,
      clusterPane: "centroidsPane",
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

    addBasemapControl();
    addMapTools();

    map.on("click", () => closeFeaturePanel());

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

  let selectedLayer = null;
  let selectedPrevStyle = null;
  let escBound = false;

  function escHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fieldHtml(icon, label, value, wide = false) {
    if (value == null || value === "" || value === "—") return "";
    return `<div class="map-feature-field${wide ? " map-feature-field--wide" : ""}">
      <i class="fas fa-${icon}" aria-hidden="true"></i>
      <div><span class="label">${escHtml(label)}</span><span class="value">${value}</span></div>
    </div>`;
  }

  function closeFeaturePanel() {
    const panel = document.getElementById("map-feature-panel");
    if (panel) {
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
      window.clearTimeout(window._mapFeatureCloseT);
      window._mapFeatureCloseT = window.setTimeout(() => {
        if (!panel.classList.contains("is-open")) panel.hidden = true;
      }, 220);
    }
    if (selectedLayer && selectedPrevStyle) {
      try {
        if (typeof selectedLayer.setStyle === "function") {
          selectedLayer.setStyle(selectedPrevStyle);
        }
      } catch (_) {}
    }
    selectedLayer = null;
    selectedPrevStyle = null;
  }

  function openFeaturePanel({ eyebrow, title, badgeHtml = "", bodyHtml }) {
    const panel = document.getElementById("map-feature-panel");
    if (!panel) return;
    const eye = document.getElementById("map-feature-eyebrow");
    const ttl = document.getElementById("map-feature-title");
    const body = document.getElementById("map-feature-body");
    if (eye) eye.textContent = eyebrow || "Detalle";
    if (ttl) {
      ttl.textContent = title || "Resumen";
      let badgeHost = ttl.nextElementSibling;
      if (!badgeHost || !badgeHost.classList.contains("map-feature-badge-host")) {
        badgeHost = document.createElement("div");
        badgeHost.className = "map-feature-badge-host";
        ttl.insertAdjacentElement("afterend", badgeHost);
      }
      badgeHost.innerHTML = badgeHtml || "";
    }
    if (body) body.innerHTML = bodyHtml || "";
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => panel.classList.add("is-open"));
    if (!escBound) {
      escBound = true;
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        // Si hay modal KPI abierto, lo maneja Modals
        const modalRoot = document.getElementById("modal-root");
        if (modalRoot && modalRoot.innerHTML.trim()) return;
        const fs = document.querySelector(".gfp-map-fullscreen");
        if (fs) {
          toggleFullscreen();
          return;
        }
        closeFeaturePanel();
      });
      document.getElementById("map-feature-close")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeFeaturePanel();
      });
    }
  }

  function selectLayer(layer, styleOverride) {
    if (selectedLayer && selectedPrevStyle && selectedLayer !== layer) {
      try {
        if (typeof selectedLayer.setStyle === "function") selectedLayer.setStyle(selectedPrevStyle);
      } catch (_) {}
    }
    selectedLayer = layer;
    selectedPrevStyle = null;
    if (layer && typeof layer.setStyle === "function") {
      selectedPrevStyle = styleOverride || (layer.options && { ...layer.options }) || null;
      try {
        layer.setStyle({
          color: "#ffffff",
          weight: 3,
          opacity: 1,
          fillOpacity: Math.min(0.85, (layer.options?.fillOpacity || 0.55) + 0.2),
        });
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) layer.bringToFront();
      } catch (_) {}
    }
  }

  function showDefoPanel(p, layer) {
    const tipo = p.tipo || "—";
    const causa = (p.causa_nombre || "").trim();
    const fuente = (p.fuente_nombre || "").trim();
    const color = TIPO_COLORS[tipo] || "#c0392b";
    const tipoLabel = tipo === "Antropogenico" ? "Origen antrópico" : tipo;
    const isAnt = tipoLabel === "Origen antrópico" || tipo === "Antropogenico";
    const showCausa =
      causa &&
      !["Natural", "Falsa alerta", "Sin especificar", "Sin datos"].includes(causa) &&
      isAnt;
    const badgeClass = isAnt ? "map-feature-badge--ant" : "map-feature-badge--nat";
    const metricClass = isAnt ? "map-feature-metric--ant" : "map-feature-metric--nat";
    selectLayer(layer, defoStyle(tipo));
    openFeaturePanel({
      eyebrow: "Polígono de deforestación",
      title: "Resumen del evento",
      badgeHtml: `<span class="map-feature-badge ${badgeClass}"><span style="width:8px;height:8px;border-radius:2px;background:${color};display:inline-block"></span>${escHtml(tipoLabel)}</span>`,
      bodyHtml: `
        <div class="map-feature-section">
          <div class="map-feature-section-title">Datos generales</div>
          <div class="map-feature-grid">
            ${fieldHtml("map-marker-alt", "Zona", escHtml(p.zona_key || "—"))}
            ${fieldHtml("calendar-alt", "Año", escHtml(p.anno || "N/A"))}
            ${(p.zonificacion || p.sector) ? fieldHtml("draw-polygon", "Sector", escHtml(p.zonificacion || p.sector), true) : ""}
            ${fieldHtml("fingerprint", "Código", escHtml(p.nombre_acr || p.codigo || "—"))}
            ${fuente ? fieldHtml("satellite", "Fuente", escHtml(fuente), true) : ""}
          </div>
        </div>
        <div class="map-feature-section">
          <div class="map-feature-section-title">Caracterización</div>
          <div class="map-feature-metrics">
            <div class="map-feature-metric ${metricClass}">
              <strong>${fmtHa(p.area_ha, 2)} ha</strong>
              <span>Área</span>
            </div>
            <div class="map-feature-metric ${metricClass}">
              <strong style="font-size:1rem">${escHtml(tipoLabel)}</strong>
              <span>Tipo</span>
            </div>
          </div>
          ${showCausa ? `<p class="map-feature-note"><strong>Causa estimada:</strong> ${escHtml(causa)}</p>` : ""}
        </div>
        <p class="map-feature-foot"><i class="fas fa-hand-pointer"></i> Haga clic en otro polígono para actualizar el resumen.</p>`,
    });
  }

  function showAcrPanel(p, kind, layer) {
    const isZi = kind === "zi";
    const nombre = p.Nombre || p.codigo || (isZi ? "Zona de influencia" : "ACR");
    const total = Number(p.Total || 0);
    const ant = Number(p.Antropico || 0);
    const nat = Number(p.Perdida_natural || 0);
    selectLayer(layer, {
      color: isZi ? "#616161" : "#2E7D32",
      weight: isZi ? 2 : 2.5,
      fill: false,
      fillOpacity: 0,
    });
    openFeaturePanel({
      eyebrow: isZi ? "Zona de influencia" : "Área de Conservación Regional",
      title: nombre,
      badgeHtml: `<span class="map-feature-badge ${isZi ? "map-feature-badge--zi" : "map-feature-badge--acr"}">${isZi ? "ZI" : "ACR"}</span>`,
      bodyHtml: `
        <div class="map-feature-section">
          <div class="map-feature-section-title">Resumen de deforestación</div>
          <div class="map-feature-metrics">
            <div class="map-feature-metric map-feature-metric--total">
              <strong>${fmtHa(total, 2)}</strong>
              <span>Total ha</span>
            </div>
            <div class="map-feature-metric map-feature-metric--ant">
              <strong>${fmtHa(ant, 2)}</strong>
              <span>Antrópico</span>
            </div>
            <div class="map-feature-metric map-feature-metric--nat">
              <strong>${fmtHa(nat, 2)}</strong>
              <span>Natural</span>
            </div>
            ${p.Falsa_alerta != null ? `<div class="map-feature-metric"><strong>${fmtHa(p.Falsa_alerta, 2)}</strong><span>Falsa alerta</span></div>` : ""}
          </div>
        </div>
        <div class="map-feature-section">
          <div class="map-feature-section-title">Identificación</div>
          <div class="map-feature-grid">
            ${fieldHtml("fingerprint", "Código", escHtml(p.codigo || "—"), true)}
          </div>
        </div>
        <p class="map-feature-foot">Totales según estadísticas de la capa (línea base acumulada).</p>`,
    });
  }

  function showCentroidPanel(p, layer) {
    const zona = String(p.codigo || "").replace(/^(ACR_|ZI_)/, "") || "—";
    const ambitoLabel = p.tipo === "acr" ? "ACR" : "ZI";
    selectLayer(null);
    openFeaturePanel({
      eyebrow: "Punto de deforestación",
      title: `Zona ${zona}`,
      badgeHtml: `<span class="map-feature-badge map-feature-badge--ant">${ambitoLabel}</span>`,
      bodyHtml: `
        <div class="map-feature-section">
          <div class="map-feature-section-title">Datos generales</div>
          <div class="map-feature-grid">
            ${fieldHtml("map-marker-alt", "Zona", escHtml(zona))}
            ${fieldHtml("layer-group", "Ámbito", escHtml(ambitoLabel))}
            ${fieldHtml("calendar-alt", "Año", escHtml(p.anno || "N/A"))}
            ${fieldHtml("fingerprint", "Código", escHtml(p.codigo || "—"), true)}
          </div>
        </div>
        <div class="map-feature-section">
          <div class="map-feature-section-title">Área</div>
          <div class="map-feature-metrics">
            <div class="map-feature-metric map-feature-metric--total">
              <strong>${fmtHa(p.area, 2)} ha</strong>
              <span>Pérdida</span>
            </div>
          </div>
        </div>
        <p class="map-feature-foot">Centroide precalculado (departamentos sin polígono GDB o vista mixta).</p>`,
    });
  }

  function geoLayer(geo, style, groupName) {
    if (!geo || !geo.features || !geo.features.length) return null;
    const pane = groupName === "limites" || groupName === "zi" || groupName === "acr"
      ? "boundariesPane"
      : "overlayPane";
    return L.geoJSON(geo, {
      pane,
      style: typeof style === "function" ? style : () => style,
      // ACR/ZI/límites: el click prioritario es deforestación; solo el borde responde
      interactive: groupName !== "limites",
      bubblingMouseEvents: true,
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        if (p.Nombre) layer.bindTooltip(p.Nombre, { sticky: true });
        layer.options.groupName = groupName;
        if (groupName === "acr" || groupName === "zi") {
          layer.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            showAcrPanel(p, groupName, layer);
          });
        }
      },
    });
  }

  function clearLayers() {
    closeFeaturePanel();
    if (!map) return;
    Object.values(layerRefs).forEach((l) => {
      if (l) map.removeLayer(l);
    });
    layerRefs.acr = layerRefs.zi = layerRefs.limites = null;
    [defoAnt, defoNat].forEach((l) => {
      if (!l) return;
      l.clearLayers();
      map.removeLayer(l);
    });
    if (clusterGroup) {
      clusterGroup.clearLayers();
      map.removeLayer(clusterGroup);
    }
  }

  function addLegend(mode) {
    /* Leyenda unificada con toggles — ver setupLayerControl */
  }

  function setupLayerControl(mode) {
    if (map._layerControl) map.removeControl(map._layerControl);
    // Solo polígonos (sin centroides): prioridad de interacción
    const items = [];
    if (layerRefs.acr) {
      items.push({
        label: "Área de Conservación Regional",
        layer: layerRefs.acr,
        swatch: "map-legend-dot--acr",
        defaultOn: true,
      });
    }
    if (layerRefs.zi) {
      items.push({
        label: "Zona de influencia",
        layer: layerRefs.zi,
        swatch: "map-legend-dot--zi",
        defaultOn: true,
      });
    }
    if (layerRefs.limites) {
      items.push({
        label: "Límites departamentales",
        layer: layerRefs.limites,
        swatch: "map-legend-dot--limites",
        defaultOn: true,
      });
    }
    if (mode === "vectors" || mode === "mixed") {
      items.push({
        label: "Pérdida de bosque · antrópico",
        layer: defoAnt,
        swatch: "map-legend-dot--antropico",
        defaultOn: true,
      });
      items.push({
        label: "Pérdida de bosque · natural",
        layer: defoNat,
        swatch: "map-legend-dot--natural",
        defaultOn: true,
      });
    }

    map._layerControl = L.control({ position: "topleft" });
    map._layerControl.onAdd = () => {
      const wrap = L.DomUtil.create("div", "map-legend gfp-legend gfp-legend--interactive");
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);
      const rows = items
        .map((it, i) => {
          const id = `gfp-leg-${i}`;
          const on = map.hasLayer(it.layer) || it.defaultOn;
          if (on && !map.hasLayer(it.layer)) map.addLayer(it.layer);
          const dots = it.swatch2
            ? `<span class="map-legend-dot ${it.swatch}"></span><span class="map-legend-dot ${it.swatch2}"></span>`
            : `<span class="map-legend-dot ${it.swatch}"></span>`;
          return `<label class="map-legend-item map-legend-item--toggle" for="${id}">
            <input type="checkbox" id="${id}" ${on ? "checked" : ""} data-leg="${i}" />
            <span class="map-legend-dots">${dots}</span>
            <span class="map-legend-label">${it.label}</span>
          </label>`;
        })
        .join("");
      wrap.innerHTML = `<div class="map-legend-card">
        <div class="map-legend-title">Leyenda</div>
        <div class="map-legend-list map-legend-list--toggle">${rows}</div>
      </div>`;
      wrap.querySelectorAll("input[type=checkbox]").forEach((input) => {
        input.addEventListener("change", () => {
          const it = items[+input.dataset.leg];
          if (!it?.layer) return;
          if (input.checked) map.addLayer(it.layer);
          else map.removeLayer(it.layer);
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

  function updateMapVectorsNote(state, meta, mode) {
    const el = document.getElementById("map-loreto-info");
    if (el) {
      el.classList.add("hidden");
      el.innerHTML = "";
    }
  }

  const vectorCache = new Map();
  const VECTOR_CACHE_MAX = 8;
  const DRAW_CHUNK = 1500;

  async function fetchVectors(params) {
    const key = JSON.stringify(params);
    const hit = vectorCache.get(key);
    if (hit) {
      vectorCache.delete(key);
      vectorCache.set(key, hit);
      return hit;
    }
    const geo = await apiGet("/api/deforestacion/vectors", params);
    const nombres = geo.meta?.nombres || {};
    geo.features = (geo.features || []).filter((f) => {
      const p = f.properties || {};
      if ((p.tipo || "") === "Falsa alerta") return false;
      const n = nombres[p.codigo];
      if (n) {
        if (!p.nombre_acr) p.nombre_acr = n.nombre_acr;
        if (!p.zona_key) p.zona_key = n.zona_key;
      }
      return true;
    });
    vectorCache.set(key, geo);
    if (vectorCache.size > VECTOR_CACHE_MAX) vectorCache.delete(vectorCache.keys().next().value);
    return geo;
  }

  async function loadDeforestationVectors(state, acrFilter, token) {
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
    // Vista amplia Ambos/todos: tope bajo para no tumbar Render free
    const wideView =
      state.departamento === "todos" ||
      state.ambito === "ambos" ||
      yearSpan > 10;
    const limit = singleAcr || selectedAcrs ? 0 : wideView ? 12000 : 15000;
    const params = {
      departamento: deptoApi,
      ambito: state.ambito || "ambos",
      acr: acrFilter?.length ? acrFilter : undefined,
      anno_desde: state.annoDesde,
      anno_hasta: state.annoHasta,
      limit,
    };
    const geo = await fetchVectors(params);
    const stale = () => token != null && token !== map._refreshToken;
    if (stale()) return { ok: false, stale: true };
    const features = geo.features || [];
    if (geo.meta) geo.meta.count = features.length;
    const meta = geo.meta || {};
    if (!features.length) {
      console.info("Sin polígonos acumulados para los filtros activos.");
      updateMapVectorsNote(state, meta, "vectors");
      return { ok: false, meta };
    }
    defoAnt.clearLayers();
    defoNat.clearLayers();
    map.addLayer(defoAnt);
    map.addLayer(defoNat);
    const geoOpts = {
      pane: "defoPane",
      style: (f) => defoStyle(f.properties?.tipo || "Antropogenico"),
      onEachFeature: (f, layer) => {
        const p = f.properties || {};
        const tipo = p.tipo || "Antropogenico";
        const origen = tipo === "Natural" ? "Natural" : "Antrópico";
        if (p.anno != null) {
          layer.bindTooltip(`${p.anno} · ${origen} · ${fmtHa(p.area_ha, 2)} ha`, {
            sticky: true,
            opacity: 0.92,
          });
        }
        layer.on({
          mouseover: (e) => {
            if (selectedLayer === e.target) return;
            const ly = e.target;
            ly.setStyle(defoStyleHover(tipo));
            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) ly.bringToFront();
          },
          mouseout: (e) => {
            if (selectedLayer === e.target) return;
            e.target.setStyle(defoStyle(tipo));
          },
          click: (e) => {
            L.DomEvent.stopPropagation(e);
            showDefoPanel(p, e.target);
          },
        });
      },
    };
    const antFeatures = features.filter((f) => (f.properties?.tipo || "Antropogenico") !== "Natural");
    const natFeatures = features.filter((f) => f.properties?.tipo === "Natural");
    const drawGroup = async (grupo, feats) => {
      for (let i = 0; i < feats.length; i += DRAW_CHUNK) {
        if (stale()) return false;
        L.geoJSON({ type: "FeatureCollection", features: feats.slice(i, i + DRAW_CHUNK) }, geoOpts)
          .eachLayer((l) => grupo.addLayer(l));
        if (i + DRAW_CHUNK < feats.length) {
          await new Promise((r) => (document.hidden ? setTimeout(r, 0) : requestAnimationFrame(() => r())));
        }
      }
      return true;
    };
    if (!(await drawGroup(defoAnt, antFeatures))) return { ok: false, stale: true };
    if (!(await drawGroup(defoNat, natFeatures))) return { ok: false, stale: true };
    try {
      const pane = map.getPane("defoPane");
      if (pane) pane.style.zIndex = 460;
      [defoAnt, defoNat].forEach((grupo) => {
        grupo.eachLayer((l) => {
          if (typeof l.bringToFront === "function") l.bringToFront();
        });
      });
    } catch (_) {}
    console.info(`Mapa: ${features.length} polígonos acumulados (${deptoApi}, ${state.annoDesde}–${state.annoHasta}, limit=${limit}).`);
    updateMapVectorsNote(state, meta, "vectors");
    return { ok: true, meta };
  }

  async function loadDeforestationCentroids(state, opts = {}) {
    const params = {
      departamento: state.departamento,
      ambito: state.ambito || "ambos",
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
        pane: "centroidsPane",
      });
      m.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        showCentroidPanel(p, m);
      });
      clusterGroup.addLayer(m);
    });
    map.addLayer(clusterGroup);
  }

  function setMapLoadStatus(msg, kind = "loading") {
    const el = document.getElementById("map-load-status");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      el.className = "map-load-status";
      return;
    }
    el.hidden = false;
    el.className = `map-load-status map-load-status--${kind}`;
    el.innerHTML =
      kind === "loading"
        ? `<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> ${msg}`
        : kind === "ok"
          ? `<i class="fas fa-check-circle" aria-hidden="true"></i> ${msg}`
          : `<i class="fas fa-info-circle" aria-hidden="true"></i> ${msg}`;
  }

  async function loadDeforestation(state, token) {
    let hasVectors = false;
    let vectorMeta = null;
    if (shouldUseVectors(state)) {
      const vectorAcrs = state.acrs.filter((c) => ALL_VECTOR_CODES.has(c));
      try {
        setMapLoadStatus("Cargando deforestación…", "loading");
        const res = await loadDeforestationVectors(
          state,
          vectorAcrs.length ? vectorAcrs : undefined,
          token
        );
        if (token != null && token !== map._refreshToken) return { ok: false, stale: true };
        hasVectors = res?.ok;
        vectorMeta = res?.meta;
        if (hasVectors) {
          const n = vectorMeta?.count ?? 0;
          setMapLoadStatus(`${n.toLocaleString("es-PE")} polígonos en el mapa`, "ok");
          window.setTimeout(() => setMapLoadStatus(""), 2200);
        } else {
          setMapLoadStatus("Sin polígonos para estos filtros", "info");
          window.setTimeout(() => setMapLoadStatus(""), 2800);
        }
      } catch (err) {
        if (token != null && token !== map._refreshToken) return { ok: false, stale: true };
        console.warn("Vectores GDB no disponibles (¿reinició el servidor?):", err);
        setMapLoadStatus("No se pudieron cargar los polígonos. Reintente con un filtro más estrecho.", "info");
        updateMapVectorsNote(state, null, "vectors");
      }
    } else {
      setMapLoadStatus("");
    }

    // Centroides retirados: prioridad a polígonos acumulados
    map._defoMode = hasVectors ? "vectors" : "vectors";
    if (hasVectors) updateMapVectorsNote(state, vectorMeta, map._defoMode);
    else updateMapVectorsNote(state, null, "vectors");
    return { ok: hasVectors, meta: vectorMeta };
  }

  async function refresh(state) {
    init();
    const token = (map._refreshToken = (map._refreshToken || 0) + 1);
    clearLayers();
    setMapLoadStatus("Preparando mapa…", "loading");

    const params = {
      departamento: state.departamento,
      ambito: state.ambito || "ambos",
      acr: state.acrs.length ? state.acrs : undefined,
    };

    let layers;
    try {
      layers = await apiGet("/api/map/layers", params);
    } catch (err) {
      console.warn("Capas del mapa:", err);
      setMapLoadStatus("No se pudieron cargar los límites. Reintentando…", "info");
      throw err;
    }
    if (token !== map._refreshToken) return;

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

    // Límites visibles de inmediato; leyenda base ya útil
    if (map._legend) {
      try { map.removeControl(map._legend); } catch (_) {}
      map._legend = null;
    }
    setupLayerControl("vectors");
    setTimeout(() => map?.invalidateSize(), 120);

    // Deforestación en segundo plano (no bloquea la interacción con el mapa)
    loadDeforestation(state, token)
      .then(() => {
        if (token !== map._refreshToken) return;
        if (map._legend) {
          try { map.removeControl(map._legend); } catch (_) {}
          map._legend = null;
        }
        setupLayerControl(map._defoMode);
        setTimeout(() => map?.invalidateSize(), 200);
      })
      .catch((err) => console.warn("Deforestación:", err));
  }

  return { init, refresh };
})();
