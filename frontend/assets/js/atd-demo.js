/* Demo interactivo H1 → H2 → H3 — estilo toolbox ArcGIS GFP Subnacional */
const AtdDemo = (() => {
  let stage = null;
  let reg = null;
  let globalStats = null;
  let allRegions = [];
  let selectedOid = null;
  let activeStep = null;
  let h1Started = false;
  let h2SubStep = 3;
  let h2LogTimer = null;
  let viewerState = { zoom: 1, panX: 0, panY: 0, band: "rgb" };

  const TIPO_COLORS = {
    Antropogenico: "#E30613",
    Natural: "#003DA5",
    "Falsa alerta": "#F59E0B",
  };

  const INSTITUCIONAL = { rojo: "#E30613", azul: "#003DA5" };
  const LOGO_GFP = "/reportes_atd/assets/logo_gfp.png";
  const LOGO_BASEL = "/reportes_atd/assets/logo_basel.png";
  const LOGO_SECO = "/reportes_atd/assets/logo_SECO.jpg";
  const GITHUB_REPO = "https://github.com/Favio138-hub/ATD-Loreto-GFP.git";

  const BAND_FILTERS = {
    rgb: "none",
    ndvi: "saturate(1.8) hue-rotate(80deg) contrast(1.1)",
    nbr: "saturate(2) hue-rotate(-30deg) contrast(1.2) brightness(1.05)",
    swir: "saturate(2.2) hue-rotate(-50deg) contrast(1.3)",
    falso: "saturate(1.6) hue-rotate(140deg) contrast(1.15)",
    agri: "saturate(2) hue-rotate(60deg) contrast(1.2)",
  };

  const ESRI_IMAGERY =
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const ESRI_LABELS =
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
  const VECTORES_LORETO = "/reportes_atd/loreto/vectores_loreto.geojson";
  const MONITOREO_LORETO = "/reportes_atd/loreto/monitoreo_loreto.geojson";

  const ZONA_LABELS = {
    "ZI ANPCH": "ZI Alto Nanay",
    "ZI AA": "ZI Ampiyacu",
    "ZI CTT": "ZI Tahuayo",
    "ZI MK": "ZI Maijuna",
  };

  const ZONA_TO_CODIGO = {
    "Maijuna Kichwa": "ACR_MK",
    "Comunal Tahuayo": "ACR_CTT",
    "Nanay": "ACR_ANPCH",
    "Ampiyacu Apayacu": "ACR_AA",
    "ZI ANPCH": "ZI_ANPCH",
    "ZI AA": "ZI_AA",
    "ZI CTT": "ZI_CTT",
    "ZI MK": "ZI_MK",
  };

  const CODIGO_TO_ZONA = {
    ACR_MK: "Maijuna Kichwa",
    ACR_AA: "Ampiyacu Apayacu",
    ACR_ANPCH: "Nanay",
    ACR_CTT: "Comunal Tahuayo",
    ZI_ANPCH: "ZI ANPCH",
    ZI_AA: "ZI AA",
    ZI_CTT: "ZI CTT",
    ZI_MK: "ZI MK",
  };

  const DEMO_OID_BY_ZONA = {
    "Maijuna Kichwa": "1009",
    "ZI ANPCH": "1542",
  };

  const SKIP_DEMO_OIDS = new Set(["60", "681345"]);
  const PREFERRED_DEMO_OIDS = ["1009", "1542", "1546", "1552", "1553", "1554"];

  const BAND_OPTIONS = [
    { id: "rgb", label: "Color Natural (B04,B03,B02)" },
    { id: "swir", label: "SWIR-NIR-Rojo ★ (GFP)" },
    { id: "falso", label: "Infrarrojo Falso (B08,B04,B03)" },
    { id: "agri", label: "Agricultura (B12,B11,B08)" },
  ];

  /** Siempre disponible aunque el manifest no traiga demo_alertas (p. ej. Render sin sync). */
  const FALLBACK_DEMO = {
    loreto: [
      {
        oid: "1009", titulo: "Alerta 2026 — Maijuna Kichwa", acr_codigo: "ACR17", zona: "Maijuna Kichwa",
        pdf_url: "/reportes_atd/loreto/pdfs/ATD_2026_ACR17_001_OID1009.pdf",
        bbox: [-73.1805515151053, -3.252291738408643, -73.14445798907443, -3.2162557023726075],
        antes: { fecha: "2026-03-20", sat: "Sentinel-2", imagen: "/reportes_atd/loreto/imagenes_sentinel/ATD_OID1009_A.png" },
        despues: { fecha: "2026-06-15", sat: "Sentinel-2", imagen: "/reportes_atd/loreto/imagenes_sentinel/ATD_OID1009_D.png" },
      },
      {
        oid: "1542", titulo: "Alerta 2026 — ZI Alto Nanay (Agricultura)", acr_codigo: "ACR10", zona: "ZI ANPCH",
        pdf_url: null,
        bbox: [-73.76933753749726, -3.9105262739641984, -73.73321818001578, -3.8744902379281627],
        antes: { fecha: "2026-03-20", sat: "Sentinel-2", imagen: "/reportes_atd/loreto/imagenes_sentinel/ATD_OID1542_A.png" },
        despues: { fecha: "2026-06-15", sat: "Sentinel-2", imagen: "/reportes_atd/loreto/imagenes_sentinel/ATD_OID1542_D.png" },
      },
      {
        oid: "1546", titulo: "Alerta 2026 — ZI Alto Nanay (Agricultura)", acr_codigo: "ACR10", zona: "ZI ANPCH",
        pdf_url: null,
        bbox: [-73.76933753749726, -3.9105262739641984, -73.73321818001578, -3.8744902379281627],
        antes: { fecha: "2026-03-20", sat: "Sentinel-2", imagen: "/reportes_atd/loreto/imagenes_sentinel/ATD_OID1546_A.png" },
        despues: { fecha: "2026-06-15", sat: "Sentinel-2", imagen: "/reportes_atd/loreto/imagenes_sentinel/ATD_OID1546_D.png" },
      },
    ],
  };


  let h1Map = null;
  let h1VectorLayers = null;
  let h1PuntosLayer = null;
  let h1MonitoreoData = null;
  let h1ZonaTab = "acr";
  let h1HighlightZona = "Maijuna Kichwa";
  let h1HighlightTipo = null;
  let h1ChartScope = "global";

  function zonaLabel(zona) {
    return ZONA_LABELS[zona] || zona;
  }

  function zonaForAlerta(a) {
    if (a?.zona) return a.zona;
    const oid = String(a?.oid || "");
    if (oid === "1009") return "Maijuna Kichwa";
    if (PREFERRED_DEMO_OIDS.includes(oid) && oid !== "1009") return "ZI ANPCH";
    return "";
  }

  function fmtHa(n) {
    return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(n || 0);
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  }

  function loretoRegion() {
    return allRegions.find((r) => r.id === "loreto");
  }

  function statsForRegion() {
    const s = reg?.estadisticas;
    if (s?.total != null) return s;
    return globalStats || {};
  }

  function alertas() {
    let demos = (reg?.demo_alertas || []).filter((a) => a.antes?.imagen);
    if (!demos.length) {
      demos = (loretoRegion()?.demo_alertas || []).filter((a) => a.antes?.imagen);
    }
    if (!demos.length) {
      demos = FALLBACK_DEMO.loreto || [];
    }
    demos = demos.filter((a) => !SKIP_DEMO_OIDS.has(String(a.oid)));
    const pdfs = reg?.reportes_pdf?.length
      ? reg.reportes_pdf
      : (loretoRegion()?.reportes_pdf || []);
    const pdfByOid = Object.fromEntries(pdfs.map((p) => [String(p.oid), p]));
    return demos
      .map((d) => {
        const p = pdfByOid[String(d.oid)];
        if (!p) return d;
        return {
          ...d,
          titulo: p.titulo,
          acr_codigo: p.acr,
          acr_nombre: p.acr_nombre,
          pdf_url: p.url || d.pdf_url,
        };
      })
      .sort((a, b) => {
        const ia = PREFERRED_DEMO_OIDS.indexOf(String(a.oid));
        const ib = PREFERRED_DEMO_OIDS.indexOf(String(b.oid));
        const pa = ia === -1 ? 99 : ia;
        const pb = ib === -1 ? 99 : ib;
        if (pa !== pb) return pa - pb;
        if (a.pdf_url && !b.pdf_url) return -1;
        if (!a.pdf_url && b.pdf_url) return 1;
        return Number(a.oid) - Number(b.oid);
      });
  }

  function ensureAlerta() {
    const a = selectedAlerta();
    if (a?.antes?.imagen) return a;
    const fb = FALLBACK_DEMO.loreto || [];
    return fb.find((x) => String(x.oid) === String(selectedOid)) || fb[0] || a;
  }

  function resumenZonas() {
    if (reg?.resumen_acr_zi?.acr && Object.keys(reg.resumen_acr_zi.acr).length) {
      return reg.resumen_acr_zi;
    }
    const stats = statsForRegion();
    const acr = {};
    const zi = {};
    Object.entries(stats.by_zona_tipo || {}).forEach(([key, val]) => {
      if (!key.includes("|")) return;
      const [zona, tipo] = key.split("|");
      const bucket = zona.trim().toUpperCase().startsWith("ZI") ? zi : acr;
      const z = bucket[zona] || { n: 0, ha: 0, tipos: {} };
      z.n += val.n || 0;
      z.ha = Math.round((z.ha + (val.ha || 0)) * 100) / 100;
      z.tipos[tipo] = val;
      bucket[zona] = z;
    });
    return { acr, zi };
  }

  function tiposForScope(zonaKey) {
    if (zonaKey) {
      const zonas = resumenZonas();
      const bucket = zonaKey.startsWith("ZI") ? zonas.zi : zonas.acr;
      const z = bucket?.[zonaKey];
      if (z?.tipos) return Object.entries(z.tipos);
    }
    return Object.entries(statsForRegion().by_tipo || {});
  }

  function instFooterHtml() {
    const imgStyle = 'height:52px;width:auto;max-width:160px;object-fit:contain';
    return `<footer class="atd-inst-footer">
      <div class="atd-inst-footer-inner">
        <div class="atd-inst-footer-brand">
          <div class="atd-inst-logos-row" aria-label="GFP, SECO y Basel Institute">
            <img src="${LOGO_GFP}" alt="GFP — Suiza apoyando al Perú" class="atd-inst-logo-part atd-inst-logo-gfp" style="${imgStyle}" loading="lazy"/>
            <img src="${LOGO_SECO}" alt="Embajada de Suiza en el Perú — SECO" class="atd-inst-logo-part atd-inst-logo-seco" style="${imgStyle}" loading="lazy"/>
            <img src="${LOGO_BASEL}" alt="Basel Institute on Governance" class="atd-inst-logo-part atd-inst-logo-basel" style="${imgStyle}" loading="lazy"/>
          </div>
          <p>GFP Subnacional · Cooperación Suiza (SECO) · Basel Institute on Governance</p>
        </div>
        <div class="atd-inst-footer-cta">
          <h5><i class="fas fa-toolbox"></i> ¿Lo prueba en ArcGIS Pro?</h5>
          <p>Clone el paquete ATD Loreto: toolbox H1–H2–H3, GDB, logos y guías listas para usar.</p>
          <a class="atd-github-btn" href="${GITHUB_REPO}" target="_blank" rel="noopener noreferrer">
            <i class="fab fa-github"></i> Descargar ATD-Loreto-GFP
          </a>
        </div>
      </div>
    </footer>`;
  }

  function renderTipoChart(tipos, scopeLabel) {
    const el = document.getElementById("atd-chart-tipo");
    if (!el || !window.Plotly || !tipos.length) return;
    const labels = tipos.map(([t]) => t);
    const values = tipos.map(([, v]) => v.n || 0);
    const total = values.reduce((s, n) => s + n, 0);
    Plotly.newPlot(
      el,
      [{
        type: "pie",
        labels,
        values,
        marker: {
          colors: tipos.map(([t]) => TIPO_COLORS[t] || "#95a5a6"),
          line: { color: "#fff", width: 2 },
        },
        hole: 0.48,
        textinfo: "label+percent",
        textposition: "outside",
        pull: labels.map((l) => (h1HighlightTipo === l ? 0.1 : 0)),
        hovertemplate: "<b>%{label}</b><br>%{value} alertas<br>%{percent}<extra></extra>",
      }],
      {
        margin: { t: 40, b: 8, l: 8, r: 8 },
        showlegend: false,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        annotations: [{
          text: `<b>${total}</b><br><span style="font-size:10px">alertas</span>`,
          showarrow: false,
          font: { size: 13, color: INSTITUCIONAL.azul },
        }],
        title: {
          text: scopeLabel || "Composición por tipo",
          font: { size: 12, color: INSTITUCIONAL.azul },
          x: 0.5,
          xanchor: "center",
        },
        font: { family: "Segoe UI, sans-serif", size: 11, color: "#1a2b3c" },
      },
      { responsive: true, displayModeBar: false }
    );
    el.on("plotly_click", (ev) => {
      const label = ev.points?.[0]?.label;
      if (label) highlightTipo(label);
    });
  }

  function highlightTipo(tipo) {
    h1HighlightTipo = h1HighlightTipo === tipo ? null : tipo;
    const scope = h1ChartScope === "global" ? null : h1HighlightZona;
    const tipos = tiposForScope(scope);
    const label = scope ? zonaLabel(scope) : "Todas las zonas";
    renderTipoChart(tipos, label);
    const detail = stage?.querySelector("#atd-tipo-detail");
    if (detail) {
      if (h1HighlightTipo) {
        detail.innerHTML = `<strong>Filtro tipo:</strong> ${h1HighlightTipo} · clic de nuevo para quitar`;
      } else if (scope) {
        detail.innerHTML = `<strong>${zonaLabel(scope)}</strong> — clic en sector para filtrar`;
      }
    }
    stage?.querySelectorAll(".atd-zona-card").forEach((c) => {
      const z = c.dataset.zona;
      const zonas = resumenZonas();
      const bucket = z?.startsWith("ZI") ? zonas.zi : zonas.acr;
      const hasTipo = !h1HighlightTipo || bucket?.[z]?.tipos?.[h1HighlightTipo];
      c.classList.toggle("atd-zona-dim", !hasTipo);
    });
  }

  function resetChartGlobal() {
    h1ChartScope = "global";
    h1HighlightTipo = null;
    h1HighlightZona = null;
    renderTipoChart(tiposForScope(null), "Todas las zonas");
    stage?.querySelectorAll(".atd-zona-card").forEach((c) => {
      c.classList.remove("active", "atd-zona-dim");
    });
    const detail = stage?.querySelector("#atd-tipo-detail");
    if (detail) detail.innerHTML = "Seleccione una zona o un sector del gráfico";
  }

  function updateChartForZona(zonaKey) {
    h1ChartScope = zonaKey ? "zona" : "global";
    h1HighlightTipo = null;
    renderTipoChart(tiposForScope(zonaKey), zonaKey ? zonaLabel(zonaKey) : "Todas las zonas");
  }

  function pickDefaultOid() {
    return DEMO_OID_BY_ZONA["Maijuna Kichwa"] || "1009";
  }

  function selectedAlerta() {
    const list = alertas();
    return list.find((a) => String(a.oid) === String(selectedOid)) || list[0] || null;
  }

  function setStepActive(paso) {
    activeStep = paso;
    document.querySelectorAll(".atd-flow-step").forEach((el) => {
      el.classList.toggle("atd-flow-active", el.dataset.paso === paso);
    });
  }

  function fakeScenes(alerta) {
    const base = [
      { fecha: alerta.antes?.fecha, side: "antes", cloud: 1.0 },
      { fecha: alerta.despues?.fecha, side: "despues", cloud: 27.2 },
    ];
    const extras = [
      { fecha: "2026-03-14", side: null, cloud: 8.5 },
      { fecha: "2026-04-14", side: null, cloud: 12.1 },
      { fecha: "2026-05-02", side: null, cloud: 5.3 },
    ];
    return [...base, ...extras].filter((s) => s.fecha);
  }

  function acrMarker(alerta) {
    const cod = alerta.acr_codigo || "ACR";
    const n = String(alerta.oid || "").slice(-2) || "01";
    return `${cod}-${n}`;
  }

  /* ─── H1: misión interactiva ─── */
  function renderH1() {
    const stats = statsForRegion();
    const periodo = reg?.periodo || globalStats ? reg?.periodo : {};
    const byTipo = stats.by_tipo || {};
    const tipos = Object.entries(byTipo);
    const total = stats.total || tipos.reduce((s, [, v]) => s + (v.n || 0), 0);

    if (!h1Started) {
      stage.innerHTML = `
        <div class="atd-demo-panel atd-h1-mission">
          <div class="atd-mission-hero atd-game-screen">
            <div class="atd-game-scanlines" aria-hidden="true"></div>
            <div class="atd-game-hud">
              <span class="atd-mission-badge">MISIÓN H1</span>
              <span class="atd-game-level"><i class="fas fa-star"></i> NIVEL 1</span>
            </div>
            <div class="atd-game-icon-wrap">
              <div class="atd-game-icon"><i class="fas fa-cloud-download-alt"></i></div>
            </div>
            <h4 class="atd-game-title">Descarga GeoBosques</h4>
            <div class="atd-game-desc-wrap">
              <p class="atd-game-desc">Conecta con MINAM, filtra alertas del periodo y cárgalas al GDB <em>MonitoreoDeforestacion</em>.</p>
            </div>
            <ul class="atd-game-objectives">
              <li><i class="fas fa-circle"></i> Conectar API MINAM GeoBosques</li>
              <li><i class="fas fa-circle"></i> Filtrar ACR y ZI de Loreto</li>
              <li><i class="fas fa-circle"></i> Cargar polígonos al GDB</li>
            </ul>
            <button type="button" class="atd-mission-start atd-game-start" id="atd-h1-start">
              <span class="atd-game-start-glow" aria-hidden="true"></span>
              <i class="fas fa-play"></i> INICIAR
            </button>
            <p class="atd-game-hint"><i class="fas fa-gamepad"></i> Presiona INICIAR para comenzar la misión</p>
          </div>
        </div>`;
      stage.querySelector("#atd-h1-start")?.addEventListener("click", () => {
        h1Started = true;
        runH1Animation(total, stats, periodo, tipos);
      });
      return;
    }
    renderH1Results(total, stats, periodo, tipos);
  }

  function runH1Animation(total, stats, periodo, tipos) {
    stage.innerHTML = `
      <div class="atd-demo-panel atd-h1-mission">
        <div class="atd-h1-live atd-game-loading">
          <div class="atd-game-loading-badge">EJECUTANDO MISIÓN…</div>
          <div class="atd-live-header">
            <span class="atd-live-pulse"></span> Conectando API GeoBosques MINAM…
          </div>
          <div class="atd-xp-bar" aria-label="Progreso"><div class="atd-xp-fill" id="atd-xp-fill"></div></div>
          <p class="atd-xp-label" id="atd-xp-label">0%</p>
          <div class="atd-h1-pipeline atd-pipeline-live">
            <div class="atd-pipe-step atd-pipe-live" data-p="0"><div class="atd-pipe-icon"><i class="fas fa-globe-americas"></i></div><span>API MINAM</span></div>
            <div class="atd-pipe-step atd-pipe-live" data-p="1"><div class="atd-pipe-icon"><i class="fas fa-filter"></i></div><span>Filtro ACR</span></div>
            <div class="atd-pipe-step atd-pipe-live" data-p="2"><div class="atd-pipe-icon"><i class="fas fa-database"></i></div><span>GDB</span></div>
            <div class="atd-pipe-step atd-pipe-live" data-p="3"><div class="atd-pipe-icon"><i class="fas fa-check"></i></div><span id="atd-live-count">0</span> alertas</div>
          </div>
          <div class="atd-mini-map atd-mini-map-empty" id="atd-mini-map">
            <span class="atd-mini-map-hint"><i class="fas fa-satellite"></i> Esperando descarga…</span>
          </div>
          <div class="atd-live-log" id="atd-live-log"></div>
        </div>
      </div>`;

    const map = stage.querySelector("#atd-mini-map");
    const log = stage.querySelector("#atd-live-log");
    const xp = stage.querySelector("#atd-xp-fill");
    const xpLabel = stage.querySelector("#atd-xp-label");
    const counter = stage.querySelector("#atd-live-count");
    const steps = stage.querySelectorAll(".atd-pipe-live");

    const logs = [
      "GET geobosques.minam.gob.pe/api/alertas…",
      "Filtro: periodo ACR + ZI activas",
      "Insertando en MonitoreoDeforestacion…",
      "Validando geometrías…",
      "¡Descarga completada!",
    ];

    let progress = 0;
    let count = 0;
    const target = total || 244;

    const interval = setInterval(() => {
      progress = Math.min(100, progress + 2.5);
      xp.style.width = `${progress}%`;
      if (xpLabel) xpLabel.textContent = `${Math.round(progress)}%`;
      count = Math.floor((progress / 100) * target);
      counter.textContent = count;
      if (map && progress > 20) {
        map.classList.remove("atd-mini-map-empty");
        map.innerHTML = `<span class="atd-mini-map-loading">${count} polígonos cargados…</span>`;
      }

      if (progress >= 25) steps[0]?.classList.add("atd-pipe-done");
      if (progress >= 50) steps[1]?.classList.add("atd-pipe-done");
      if (progress >= 75) steps[2]?.classList.add("atd-pipe-done");
      if (progress >= 100) {
        steps[3]?.classList.add("atd-pipe-done");
        clearInterval(interval);
        setTimeout(() => renderH1Results(target, stats, periodo, tipos), 600);
      }
    }, 80);

    logs.forEach((msg, i) => {
      setTimeout(() => {
        const line = document.createElement("div");
        line.className = "atd-log-line";
        line.innerHTML = `<span class="atd-log-ok">✓</span> ${msg}`;
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
      }, i * 700);
    });
  }

  function renderH1Results(total, stats, periodo, tipos) {
    const zonas = resumenZonas();
    const acrEntries = Object.entries(zonas.acr || {});
    const ziEntries = Object.entries(zonas.zi || {});
    const activeList = h1ZonaTab === "zi" ? ziEntries : acrEntries;
    const acrTotal = acrEntries.reduce((s, [, v]) => s + v.n, 0);
    const ziTotal = ziEntries.reduce((s, [, v]) => s + v.n, 0);

    stage.innerHTML = `
      <div class="atd-demo-panel">
        <div class="atd-h1-stats-bar">
          <span><i class="fas fa-bell"></i> <strong>${total}</strong> alertas</span>
          <span><i class="fas fa-tree"></i> <strong>${fmtHa(stats.total_ha)}</strong> ha</span>
          <span><i class="fas fa-calendar"></i> ${periodo.fecha_ini || "—"} – ${periodo.fecha_fin || "—"}</span>
        </div>
        <div class="atd-mission-complete atd-mission-compact">
          <i class="fas fa-trophy"></i> H1 completada — GDB <em>MonitoreoDeforestacion</em> cargado
        </div>
        <div class="atd-demo-header atd-demo-header-compact">
          <h4><i class="fas fa-cloud-download-alt"></i> H1 — Descarga GeoBosques</h4>
          <p>Monitoreo por <strong>ACR</strong> y <strong>ZI</strong> · clic en polígono para zoom y alertas</p>
        </div>

        <div class="atd-h1-triple">
          <div class="atd-h1-map-col">
            <h5><i class="fas fa-map-marked-alt"></i> Mapa de alertas</h5>
            <div id="atd-h1-map" class="atd-h1-map"></div>
            <p class="atd-map-legend">
              <span class="atd-leg acr"></span> ACR (${acrTotal})
              <span class="atd-leg zi"></span> ZI (${ziTotal})
              <span class="atd-leg alerta"></span> Alertas periodo (GDB)
            </p>
          </div>
          <div class="atd-h1-chart-wrap">
            <div id="atd-chart-tipo" class="atd-chart"></div>
            <p class="atd-chart-hint"><i class="fas fa-hand-pointer"></i> Clic en sector o zona · datos en vivo del GDB</p>
            <button type="button" class="atd-chart-reset" id="atd-chart-reset"><i class="fas fa-undo"></i> Ver todas las zonas</button>
          </div>
          <div class="atd-h1-zonas">
            <div class="atd-zona-tabs">
              <button type="button" class="atd-zona-tab ${h1ZonaTab === "acr" ? "active" : ""}" data-tab="acr">
                <i class="fas fa-leaf"></i> ACR <span class="atd-tab-n">${acrTotal}</span>
              </button>
              <button type="button" class="atd-zona-tab ${h1ZonaTab === "zi" ? "active" : ""}" data-tab="zi">
                <i class="fas fa-border-all"></i> ZI <span class="atd-tab-n">${ziTotal}</span>
              </button>
            </div>
            <div id="atd-tipo-detail" class="atd-tipo-detail">${h1HighlightZona ? `Zona: <strong>${zonaLabel(h1HighlightZona)}</strong>` : "Seleccione una zona en el mapa o lista"}</div>
            <div class="atd-zona-list">
              ${activeList.length ? activeList.map(([nombre, v]) => `
                <button type="button" class="atd-zona-card ${h1HighlightZona === nombre ? "active" : ""}" data-zona="${nombre}">
                  <span class="atd-zona-name">${zonaLabel(nombre)}</span>
                  <span class="atd-zona-stats">${v.n} alertas · ${fmtHa(v.ha)} ha</span>
                </button>`).join("") : `<p class="atd-empty-sm">Sin datos por zona.</p>`}
            </div>
            <button type="button" class="btn btn-primary atd-next-btn atd-mission-next" data-next="H2">
              <i class="fas fa-satellite"></i> Abrir visor ArcGIS (H2) →
            </button>
          </div>
        </div>
      </div>`;

    initH1Leaflet(zonas);

    stage.querySelectorAll(".atd-zona-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        h1ZonaTab = btn.dataset.tab;
        if (h1HighlightZona) {
          const isZi = h1HighlightZona.startsWith("ZI");
          if ((h1ZonaTab === "zi" && !isZi) || (h1ZonaTab === "acr" && isZi)) {
            h1HighlightZona = h1ZonaTab === "zi" ? "ZI ANPCH" : "Maijuna Kichwa";
          }
        }
        renderH1Results(total, stats, periodo, tipos);
      });
    });
    stage.querySelectorAll(".atd-zona-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        focusZona(btn.dataset.zona, zonas);
      });
    });

    if (tipos.length && window.Plotly) {
      updateChartForZona(h1HighlightZona);
    }
    stage.querySelector("#atd-chart-reset")?.addEventListener("click", resetChartGlobal);

    stage.querySelector("[data-next='H2']")?.addEventListener("click", () => {
      h2SubStep = 3;
      showStep("H2");
    });
  }

  function addEsriBasemap(map) {
    L.tileLayer(ESRI_IMAGERY, { attribution: "© Esri", maxZoom: 19 }).addTo(map);
    L.tileLayer(ESRI_LABELS, { maxZoom: 19, opacity: 0.65 }).addTo(map);
  }

  function alertOverlayHtml(marker, visible = true) {
    if (!visible) return "";
    return `<div class="atd-alert-box">
      <div class="atd-alert-box-ring atd-pulse-anim"></div>
      <div class="atd-alert-box-corner tl"></div>
      <div class="atd-alert-box-corner tr"></div>
      <div class="atd-alert-box-corner bl"></div>
      <div class="atd-alert-box-corner br"></div>
      <div class="atd-alert-label"><i class="fas fa-crosshairs"></i> ${marker}</div>
    </div>`;
  }

  function vectorStyle(f) {
    const p = f.properties || {};
    const isZi = p.tipo === "zi";
    const zonaKey = CODIGO_TO_ZONA[p.codigo] || p.codigo;
    const hl = h1HighlightZona && zonaKey === h1HighlightZona;
    return {
      color: hl ? "#fff" : isZi ? "#e67e22" : "#2ecc71",
      weight: hl ? 3.5 : 2,
      fillColor: isZi ? "#e67e22" : "#27ae60",
      fillOpacity: hl ? 0.28 : isZi ? 0.1 : 0.15,
      dashArray: isZi ? "6 4" : null,
    };
  }

  function refreshVectorStyles() {
    if (!h1VectorLayers) return;
    [h1VectorLayers.acr, h1VectorLayers.zi].forEach((g) => {
      g.eachLayer((layer) => {
        if (layer.feature) layer.setStyle(vectorStyle(layer.feature));
      });
    });
  }

  async function loadMonitoreoPeriodo() {
    if (h1MonitoreoData) return h1MonitoreoData;
    try {
      const res = await fetch(MONITOREO_LORETO);
      if (!res.ok) return null;
      h1MonitoreoData = await res.json();
      return h1MonitoreoData;
    } catch (e) {
      console.warn("monitoreo periodo:", e);
      return null;
    }
  }

  function monitoreoPopup(p) {
    return [
      `<b>${zonaLabel(p.zona_key)}</b>`,
      `${p.tipo || "—"} · ${fmtHa(p.area_ha)} ha`,
      p.anno ? `Año monitoreo: ${p.anno}` : "",
      p.oid ? `OID ${p.oid}` : "",
    ].filter(Boolean).join("<br>");
  }

  async function showPuntosForZona(zonaKey) {
    if (!h1Map) return;
    if (h1PuntosLayer) {
      h1Map.removeLayer(h1PuntosLayer);
      h1PuntosLayer = null;
    }
    const detail = stage?.querySelector("#atd-tipo-detail");
    if (detail) {
      detail.innerHTML = `<span class="atd-loading-inline"><i class="fas fa-spinner fa-spin"></i> Cargando alertas del periodo…</span>`;
    }
    const all = await loadMonitoreoPeriodo();
    const feats = (all?.features || []).filter((f) => f.properties?.zona_key === zonaKey);
    if (!feats.length) {
      if (detail) detail.innerHTML = `<strong>${zonaLabel(zonaKey)}</strong> — sin alertas en el periodo`;
      return;
    }
    h1PuntosLayer = L.geoJSON({ type: "FeatureCollection", features: feats }, {
      style: (f) => {
        const tipo = f.properties?.tipo || "Antropogenico";
        const col = TIPO_COLORS[tipo] || "#e74c3c";
        return { color: col, weight: 1.5, fillColor: col, fillOpacity: 0.78 };
      },
      onEachFeature: (f, layer) => {
        const p = f.properties || {};
        layer.bindPopup(monitoreoPopup(p));
        layer.bindTooltip(`${p.tipo || "?"} · ${fmtHa(p.area_ha)} ha`, { sticky: true });
        layer.on("click", () => {
          if (p.oid) selectedOid = String(p.oid);
        });
      },
    }).addTo(h1Map);
    const bucket = h1ZonaTab === "zi" ? resumenZonas().zi : resumenZonas().acr;
    const v = bucket?.[zonaKey];
    if (detail) {
      detail.innerHTML = v
        ? `<strong>${zonaLabel(zonaKey)}</strong> — ${feats.length} alertas periodo · ${v.n} en GDB · ${fmtHa(v.ha)} ha`
        : `<strong>${zonaLabel(zonaKey)}</strong> — ${feats.length} alertas del periodo`;
    }
    const bounds = [];
    h1PuntosLayer.eachLayer((l) => { if (l.getBounds) bounds.push(l.getBounds()); });
    if (bounds.length) {
      h1Map.flyToBounds(L.latLngBounds(bounds), { padding: [48, 48], duration: 0.9, maxZoom: 14 });
    }
  }

  function focusZona(zonaKey, zonas) {
    h1HighlightZona = zonaKey;
    if (DEMO_OID_BY_ZONA[zonaKey]) selectedOid = DEMO_OID_BY_ZONA[zonaKey];
    h1ZonaTab = zonaKey.startsWith("ZI") ? "zi" : "acr";
    stage?.querySelectorAll(".atd-zona-card").forEach((c) => {
      c.classList.toggle("active", c.dataset.zona === zonaKey);
      c.classList.remove("atd-zona-dim");
    });
    updateChartForZona(zonaKey);
    refreshVectorStyles();
    showPuntosForZona(zonaKey);
    flyToZona(zonaKey);
  }

  async function loadLoretoVectors(map) {
    try {
      const res = await fetch(VECTORES_LORETO);
      if (!res.ok) return null;
      const geo = await res.json();
      const layers = { acr: L.layerGroup(), zi: L.layerGroup() };
      L.geoJSON(geo, {
        style: (f) => vectorStyle(f),
        onEachFeature: (f, layer) => {
          const p = f.properties || {};
          layer.bindTooltip(`<b>${p.nombre || p.codigo}</b>`, { sticky: true });
          layer.on("click", () => {
            const zonaKey = CODIGO_TO_ZONA[p.codigo] || p.codigo;
            h1ZonaTab = p.tipo === "zi" ? "zi" : "acr";
            focusZona(zonaKey, resumenZonas());
          });
          (p.tipo === "zi" ? layers.zi : layers.acr).addLayer(layer);
        },
      });
      layers.acr.addTo(map);
      layers.zi.addTo(map);
      return layers;
    } catch (e) {
      console.warn("vectores loreto:", e);
      return null;
    }
  }

  async function initH1Leaflet(zonas) {
    const el = document.getElementById("atd-h1-map");
    if (!el || !window.L) return;
    if (h1Map) {
      h1Map.remove();
      h1Map = null;
      h1VectorLayers = null;
      h1PuntosLayer = null;
    }
    h1Map = L.map(el, { zoomControl: true, attributionControl: false }).setView([-3.45, -73.2], 8);
    addEsriBasemap(h1Map);
    h1VectorLayers = await loadLoretoVectors(h1Map);

    const bounds = [];
    if (h1VectorLayers) {
      [h1VectorLayers.acr, h1VectorLayers.zi].forEach((g) => {
        g.eachLayer((l) => { if (l.getBounds) bounds.push(l.getBounds()); });
      });
    }
    if (bounds.length) h1Map.fitBounds(L.latLngBounds(bounds), { padding: [24, 24] });
    setTimeout(() => {
      h1Map?.invalidateSize();
      if (h1HighlightZona) focusZona(h1HighlightZona, zonas);
    }, 300);
  }

  function flyToZona(zonaNombre) {
    if (!h1Map || !h1VectorLayers) return;
    const codigo = ZONA_TO_CODIGO[zonaNombre] || zonaNombre;
    let target = null;
    h1VectorLayers.acr.eachLayer((l) => {
      if (l.feature?.properties?.codigo === codigo) target = l;
    });
    h1VectorLayers.zi.eachLayer((l) => {
      if (l.feature?.properties?.codigo === codigo) target = l;
    });
    if (target?.getBounds) {
      h1Map.flyToBounds(target.getBounds(), { padding: [48, 48], duration: 0.9, maxZoom: 12 });
    }
    const puntosBounds = [];
    h1PuntosLayer?.eachLayer((l) => { if (l.getBounds) puntosBounds.push(l.getBounds()); });
    if (puntosBounds.length) {
      setTimeout(() => {
        h1Map.flyToBounds(L.latLngBounds(puntosBounds), { padding: [56, 56], duration: 0.8, maxZoom: 13 });
      }, 400);
    }
  }

  /* ─── H2: visor ArcGIS GFP — abre directo en Resultados (paso 3) ─── */
  function renderH2() {
    const alerta = ensureAlerta();
    const list = alertas().filter((a) => a.antes?.imagen);
    const scenes = fakeScenes(alerta);
    const marker = acrMarker(alerta);

    stage.innerHTML = `
      <div class="atd-visor-intro">
        <i class="fas fa-info-circle"></i>
        <strong>Toolbox H2 — Visor Satelital GFP</strong> (mismo flujo que ArcGIS Pro).
        Compare imágenes Sentinel-2, clasifique la alerta y exporte al informe PDF (H3).
      </div>
      <div class="atd-visor-shell">
        <header class="atd-visor-header">
          <div class="atd-visor-title">
            <i class="fas fa-satellite"></i> Visor Satelital — GFP Subnacional
          </div>
          <span class="atd-visor-sub">Fotointerpretación ATD · STAC Element84 · OID ${alerta.oid}</span>
        </header>

        <nav class="atd-visor-steps">
          ${[1, 2, 3, 4].map((n) => `
            <button type="button" class="atd-visor-step ${h2SubStep === n ? "active" : ""} ${h2SubStep > n ? "done" : ""}" data-h2step="${n}">
              <span class="atd-visor-step-n">${n}</span>
              ${["Datos", "Satélite", "Resultados", "Exportar"][n - 1]}
            </button>`).join("")}
        </nav>

        <div class="atd-visor-body" id="atd-visor-body"></div>
      </div>

      <div class="atd-demo-footer atd-visor-footer">
        <button type="button" class="btn btn-outline" data-prev="H1"><i class="fas fa-arrow-left"></i> H1</button>
        <button type="button" class="btn btn-primary" data-next="H3" id="atd-h2-to-h3">
          <i class="fas fa-file-pdf"></i> Generar reporte H3
        </button>
      </div>`;

    renderH2SubPanel(alerta, list.length ? list : [alerta], scenes, marker);

    stage.querySelector("[data-prev='H1']")?.addEventListener("click", () => showStep("H1"));
    stage.querySelector("[data-next='H3']")?.addEventListener("click", () => showStep("H3"));
    stage.querySelectorAll(".atd-visor-step").forEach((btn) => {
      btn.addEventListener("click", () => {
        h2SubStep = Number(btn.dataset.h2step);
        renderH2();
      });
    });
  }

  function renderH2SubPanel(alerta, list, scenes, marker) {
    const body = stage.querySelector("#atd-visor-body");
    if (!body) return;

    if (h2SubStep === 1) {
      body.innerHTML = `
        <div class="atd-h2-step-panel">
          <h5>Paso 1 — Selección de alerta ATD</h5>
          <p>Elija el registro del GDB <em>MonitoreoDeforestacion</em> a fotointerpretar.</p>
          <select id="atd-alerta-select" class="atd-alerta-select">
            ${list.map((a) => `<option value="${a.oid}" ${String(a.oid) === String(selectedOid) ? "selected" : ""}>
              OID ${a.oid} — ${a.titulo || a.acr || ""}${a.pdf_url ? " ✓ PDF" : ""}
            </option>`).join("")}
          </select>
          <div class="atd-alert-card">
            <div class="atd-alert-marker">${marker}</div>
            <div>
              <strong>${alerta.titulo || `Alerta ${alerta.oid}`}</strong>
              <p>OID ${alerta.oid} · ${alerta.acr_codigo || ""} · ${alerta.acr || ""}</p>
            </div>
          </div>
          <button type="button" class="btn btn-primary" id="atd-h2-advance"><i class="fas fa-search"></i> Buscar escenas STAC</button>
        </div>`;
      body.querySelector("#atd-alerta-select")?.addEventListener("change", (e) => {
        selectedOid = e.target.value;
        renderH2();
      });
      body.querySelector("#atd-h2-advance")?.addEventListener("click", () => {
        h2SubStep = 2;
        renderH2();
      });
      return;
    }

    if (h2SubStep === 2) {
      body.innerHTML = `
        <div class="atd-h2-step-panel atd-stac-search">
          <h5>Paso 2 — Búsqueda satelital (Sentinel-2 L2A)</h5>
          <div class="atd-stac-progress"><div class="atd-stac-bar" id="atd-stac-bar"></div></div>
          <div class="atd-stac-log" id="atd-stac-log"></div>
          <button type="button" class="btn btn-primary hidden" id="atd-h2-stac-done">
            <i class="fas fa-images"></i> Ver ${scenes.length + 7} escenas encontradas
          </button>
        </div>`;
      runStacSearch(scenes.length + 7);
      return;
    }

    if (h2SubStep === 3) {
      viewerState = { zoom: 1, panX: 0, panY: 0, band: viewerState.band || "rgb" };
      body.innerHTML = `
        <div class="atd-visor-main">
          <aside class="atd-visor-left">
            <h6><i class="fas fa-check-circle"></i> ${scenes.length + 7} imágenes encontradas</h6>
            <button type="button" class="atd-load-scenes-btn" id="atd-load-scenes">
              <i class="fas fa-sync"></i> CARGAR IMÁGENES ANTES / DESPUÉS
            </button>
            <div class="atd-scene-list">
              ${scenes.map((s, i) => `
                <div class="atd-scene-item ${s.side ? "atd-scene-pick" : ""}" data-side="${s.side || ""}">
                  <div class="atd-scene-date">${fmtDate(s.fecha)}</div>
                  <div class="atd-scene-meta">Sentinel-2 · 10m · Nubosidad ${s.cloud}%</div>
                  ${s.side ? `<div class="atd-scene-btns">
                    <span class="atd-scene-pill ${s.side === "antes" ? "active" : ""}">ANTES</span>
                    <span class="atd-scene-pill ${s.side === "despues" ? "active" : ""}">DESPUÉS</span>
                  </div>` : ""}
                </div>`).join("")}
            </div>
          </aside>

          <div class="atd-visor-center">
            <div class="atd-viewer-chrome">
              <span>[rueda=zoom · arrastre=pan · doble-click=reset]</span>
              <label class="atd-chk"><input type="checkbox" id="atd-chk-alertas" checked/> Alertas</label>
              <label class="atd-chk"><input type="checkbox" id="atd-chk-anim"/> Animación</label>
              <label class="atd-chk"><input type="checkbox" id="atd-chk-vecinos"/> Vecinas</label>
            </div>
            <div class="atd-dual-viewer" id="atd-dual-viewer">
              <div class="atd-viewport" data-vp="antes">
                <span class="atd-vp-label atd-tag-antes">${fmtDate(alerta.antes.fecha)}</span>
                <div class="atd-vp-inner" id="atd-vp-antes">
                  <img src="${alerta.antes.imagen}" alt="Antes" style="filter:${BAND_FILTERS[viewerState.band]}" draggable="false"/>
                  ${alertOverlayHtml(marker, true)}
                </div>
              </div>
              <div class="atd-viewport" data-vp="despues">
                <span class="atd-vp-label atd-tag-despues">${fmtDate(alerta.despues?.fecha)}</span>
                <div class="atd-vp-inner" id="atd-vp-despues">
                  <img src="${alerta.despues?.imagen || alerta.antes.imagen}" alt="Después" style="filter:${BAND_FILTERS[viewerState.band]}" draggable="false"/>
                  ${alertOverlayHtml(marker, true)}
                </div>
              </div>
            </div>
            <div class="atd-stac-console" id="atd-stac-console">
              <div class="atd-console-title">LOG STAC API</div>
              <div class="atd-console-body" id="atd-console-body"></div>
            </div>
          </div>

          <aside class="atd-visor-right">
            <h6>DATOS DE ESCENA</h6>
            <table class="atd-scene-table">
              <tr><td>Antes</td><td>${alerta.antes.sat}</td></tr>
              <tr><td>Fecha A</td><td>${fmtDate(alerta.antes.fecha)}</td></tr>
              <tr><td>Después</td><td>${alerta.despues?.sat || "Sentinel-2"}</td></tr>
              <tr><td>Fecha D</td><td>${fmtDate(alerta.despues?.fecha)}</td></tr>
              <tr><td>Resolución</td><td>10 m</td></tr>
              <tr><td>Fuente</td><td>Element84 STAC</td></tr>
              <tr><td>Buffer</td><td>1.5 km</td></tr>
            </table>
            <h6>COMBINACIÓN DE BANDAS</h6>
            <select id="atd-band-select" class="atd-band-select">
              ${BAND_OPTIONS.map((b) => `<option value="${b.id}" ${viewerState.band === b.id ? "selected" : ""}>${b.label}</option>`).join("")}
            </select>
            <h6>ÍNDICES RÁPIDOS</h6>
            <div class="atd-index-btns atd-index-btns-4">
              <button type="button" class="atd-idx atd-idx-ndvi ${viewerState.band === "ndvi" ? "active" : ""}" data-band="ndvi">NDVI</button>
              <button type="button" class="atd-idx atd-idx-nbr ${viewerState.band === "nbr" ? "active" : ""}" data-band="nbr">NBR</button>
              <button type="button" class="atd-idx atd-idx-swir ${viewerState.band === "swir" ? "active" : ""}" data-band="swir">SWIR ★</button>
              <button type="button" class="atd-idx atd-idx-rgb ${viewerState.band === "rgb" ? "active" : ""}" data-band="rgb">RGB</button>
            </div>
            <h6>OPCIONES TOOLBOX</h6>
            <div class="atd-tool-opts">
              <label class="atd-tool-opt"><input type="checkbox" checked disabled/> Mostrar polígono alerta</label>
              <label class="atd-tool-opt"><input type="checkbox" id="atd-opt-hd"/> Exportar vista HD (4096px)</label>
              <label class="atd-tool-opt">Render: <strong>1024 px</strong></label>
            </div>
            <div class="atd-gfp-brand">
              <div class="atd-gfp-brand-row">
                <img src="${LOGO_GFP}" alt="GFP" class="atd-gfp-logo-sm" onerror="this.onerror=null;this.src='/reportes_atd/assets/logo_gfp.svg'"/>
                <img src="${LOGO_SECO}" alt="SECO" class="atd-gfp-logo-sm"/>
                <img src="${LOGO_BASEL}" alt="Basel" class="atd-gfp-logo-sm"/>
              </div>
            </div>
            <select id="atd-alerta-select2" class="atd-alerta-select atd-alerta-compact">
              ${list.map((a) => `<option value="${a.oid}" ${String(a.oid) === String(selectedOid) ? "selected" : ""}>OID ${a.oid} — ${zonaLabel(zonaForAlerta(a)) || a.titulo || ""}</option>`).join("")}
            </select>
          </aside>
        </div>`;

      bindViewerInteractions(alerta, list);
      appendConsoleLog(`OK visor 1024px · OID ${alerta.oid}`);
      appendConsoleLog(`Descargando [titiler_tci] Sentinel-2 L2A…`);
      setTimeout(() => appendConsoleLog(`Escena ANTES: ${alerta.antes.fecha}`), 400);
      setTimeout(() => appendConsoleLog(`Escena DESPUÉS: ${alerta.despues?.fecha || "—"}`), 800);
    }

    if (h2SubStep === 4) {
      body.innerHTML = `
        <div class="atd-h2-step-panel">
          <h5>Paso 4 — Exportar para H3</h5>
          <p>Imágenes listas para el informe PDF validado.</p>
          <div class="atd-export-preview">
            <img src="${alerta.antes.imagen}" alt=""/><img src="${alerta.despues?.imagen || alerta.antes.imagen}" alt=""/>
          </div>
          <button type="button" class="btn btn-primary" id="atd-h2-export-h3"><i class="fas fa-file-pdf"></i> Generar reporte H3</button>
        </div>`;
      body.querySelector("#atd-h2-export-h3")?.addEventListener("click", () => showStep("H3"));
    }
  }

  function runStacSearch(nScenes) {
    const bar = stage.querySelector("#atd-stac-bar");
    const log = stage.querySelector("#atd-stac-log");
    const done = stage.querySelector("#atd-h2-stac-done");
    const msgs = [
      "POST earth-search.aws.element84.com/v1/search",
      "item_type: sentinel-2-l2a · bbox alerta",
      "cloud_cover < 30% · sorteo por fecha",
      `→ ${nScenes} escenas Sentinel-2 candidatas`,
      "Firma SAS Planetary Computer…",
      "Render titiler 1024px…",
    ];
    let p = 0;
    const iv = setInterval(() => {
      p += 12;
      if (bar) bar.style.width = `${Math.min(100, p)}%`;
      if (p >= 100) {
        clearInterval(iv);
        done?.classList.remove("hidden");
        done?.addEventListener("click", () => { h2SubStep = 3; renderH2(); });
        setTimeout(() => { h2SubStep = 3; renderH2(); }, 1200);
      }
    }, 200);
    msgs.forEach((m, i) => {
      setTimeout(() => {
        if (!log) return;
        const line = document.createElement("div");
        line.textContent = `> ${m}`;
        log.appendChild(line);
      }, i * 450);
    });
  }

  function appendConsoleLog(msg) {
    const body = stage.querySelector("#atd-console-body");
    if (!body) return;
    const line = document.createElement("div");
    line.textContent = msg;
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
  }

  function bindViewerInteractions(alerta, list) {
    viewerState = viewerState || { zoom: 1, panX: 0, panY: 0, band: "rgb" };

    const applyTransform = (inner) => {
      if (!inner) return;
      inner.style.transform = `translate(${viewerState.panX}px,${viewerState.panY}px) scale(${viewerState.zoom})`;
    };

    stage.querySelectorAll(".atd-vp-inner").forEach((inner) => {
      applyTransform(inner);
      let drag = false;
      let sx = 0; let sy = 0;
      inner.parentElement?.addEventListener("wheel", (e) => {
        e.preventDefault();
        viewerState.zoom = Math.max(0.5, Math.min(4, viewerState.zoom + (e.deltaY < 0 ? 0.15 : -0.15)));
        stage.querySelectorAll(".atd-vp-inner").forEach(applyTransform);
      }, { passive: false });
      inner.addEventListener("mousedown", (e) => {
        drag = true; sx = e.clientX - viewerState.panX; sy = e.clientY - viewerState.panY;
      });
      window.addEventListener("mouseup", () => { drag = false; });
      window.addEventListener("mousemove", (e) => {
        if (!drag) return;
        viewerState.panX = e.clientX - sx;
        viewerState.panY = e.clientY - sy;
        stage.querySelectorAll(".atd-vp-inner").forEach(applyTransform);
      });
      inner.parentElement?.addEventListener("dblclick", () => {
        viewerState = { ...viewerState, zoom: 1, panX: 0, panY: 0 };
        stage.querySelectorAll(".atd-vp-inner").forEach(applyTransform);
      });
    });

    stage.querySelector("#atd-load-scenes")?.addEventListener("click", (btn) => {
      btn.classList.add("atd-loaded");
      btn.innerHTML = '<i class="fas fa-check"></i> IMÁGENES CARGADAS';
      appendConsoleLog("Carga ANTES/DESPUÉS completada");
    });

    function applyBand(band) {
      viewerState.band = band;
      stage.querySelectorAll(".atd-vp-inner img").forEach((img) => {
        img.style.filter = BAND_FILTERS[band] || "none";
      });
      stage.querySelectorAll(".atd-idx").forEach((b) => b.classList.toggle("active", b.dataset.band === band));
      const sel = stage.querySelector("#atd-band-select");
      if (sel) sel.value = band;
      appendConsoleLog(`Combinación de bandas: ${band.toUpperCase()}`);
    }

    stage.querySelectorAll(".atd-idx").forEach((btn) => {
      btn.addEventListener("click", () => applyBand(btn.dataset.band));
    });

    stage.querySelector("#atd-band-select")?.addEventListener("change", (e) => applyBand(e.target.value));

    stage.querySelector("#atd-chk-alertas")?.addEventListener("change", (e) => {
      stage.querySelectorAll(".atd-alert-box").forEach((box) => {
        box.style.display = e.target.checked ? "block" : "none";
      });
    });

    stage.querySelector("#atd-chk-anim")?.addEventListener("change", (e) => {
      stage.querySelectorAll(".atd-alert-box-ring").forEach((r) => {
        r.classList.toggle("atd-pulse-anim", e.target.checked);
      });
    });

    stage.querySelector("#atd-alerta-select2")?.addEventListener("change", (e) => {
      selectedOid = e.target.value;
      viewerState = { zoom: 1, panX: 0, panY: 0, band: "rgb" };
      renderH2();
    });
  }

  function bindH2Nav() {
    const toH3 = stage.querySelector("#atd-h2-to-h3");
    if (toH3) toH3.disabled = h2SubStep < 3;
  }

  function renderH3() {
    const alerta = ensureAlerta();
    const pdfUrl = alerta?.pdf_url;

    stage.innerHTML = `
      <div class="atd-demo-panel atd-h3-panel">
        <div class="atd-mission-complete atd-h3-complete">
          <i class="fas fa-award"></i> ¡Misión completada! — Reporte ATD validado
        </div>
        <div class="atd-demo-header">
          <h4><i class="fas fa-file-pdf"></i> H3 — Reporte PDF validado</h4>
          <p>Informe generado tras H1 (GeoBosques) + H2 (fotointerpretación satelital).</p>
        </div>
        ${pdfUrl ? `
        <div class="atd-h3-meta well-panel">
          <div><strong>${alerta.titulo || "Informe ATD"}</strong></div>
          <div class="atd-h3-tags">
            <span class="atd-tag">OID ${alerta.oid}</span>
            ${alerta.acr_codigo ? `<span class="atd-tag">${alerta.acr_codigo}</span>` : ""}
          </div>
        </div>
        <div class="atd-pdf-preview">
          <iframe src="${pdfUrl}" title="Reporte ATD"></iframe>
        </div>
        <div class="atd-demo-footer">
          <button type="button" class="btn btn-outline" data-prev="H2"><i class="fas fa-arrow-left"></i> Volver a H2</button>
          <a class="btn btn-primary" href="${pdfUrl}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> Abrir PDF</a>
          <a class="btn btn-success" href="${pdfUrl}" download><i class="fas fa-download"></i> Descargar</a>
        </div>` : alerta?.antes?.imagen ? `
        <div class="atd-h3-meta well-panel">
          <div><strong>${alerta.titulo || "Informe ATD"}</strong></div>
          <div class="atd-h3-tags">
            <span class="atd-tag">OID ${alerta.oid}</span>
            <span class="atd-tag">${zonaLabel(zonaForAlerta(alerta))}</span>
          </div>
          <p class="atd-h3-pending">PDF en validación MINAM. Fotointerpretación satelital (H2) completada — listo para informe preliminar.</p>
        </div>
        <div class="atd-export-preview atd-h3-sat-preview">
          <img src="${alerta.antes.imagen}" alt="Antes"/><img src="${alerta.despues?.imagen || alerta.antes.imagen}" alt="Después"/>
        </div>
        <div class="atd-demo-footer">
          <button type="button" class="btn btn-outline" data-prev="H2"><i class="fas fa-arrow-left"></i> Volver a H2</button>
          <button type="button" class="btn btn-primary" data-prev="H2"><i class="fas fa-satellite"></i> Ver visor H2</button>
        </div>` : `
        <p class="atd-empty">Sin PDF para OID ${alerta?.oid || "—"}.</p>
        <div class="atd-demo-footer">
          <button type="button" class="btn btn-outline" data-prev="H2">Volver a H2</button>
        </div>`}
      </div>`;
    stage.querySelector("[data-prev='H2']")?.addEventListener("click", () => showStep("H2"));
  }

  function showStep(paso) {
    if (!stage) return;
    setStepActive(paso);
    stage.classList.remove("hidden");
    if (paso === "H2") {
      h2SubStep = 3;
      if (!selectedOid) selectedOid = pickDefaultOid();
    }
    if (paso === "H1") renderH1();
    else if (paso === "H2") renderH2();
    else if (paso === "H3") renderH3();
    stage.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function bindFlow() {
    document.querySelectorAll(".atd-flow-step[data-paso]").forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll(".atd-flow-step[data-paso]").forEach((btn) => {
      btn.addEventListener("click", () => showStep(btn.dataset.paso));
    });
  }

  function mount(region, globalRegion, oid, regions) {
    reg = region;
    globalStats = globalRegion?.estadisticas || null;
    allRegions = regions || [];
    stage = document.getElementById("atd-demo-stage");
    if (!stage) return;
    if (oid) selectedOid = oid;
    else if (!selectedOid) selectedOid = pickDefaultOid();
    bindFlow();
    if (oid) showStep("H3");
  }

  function reset() {
    activeStep = null;
    h1Started = false;
    h2SubStep = 3;
    h1ZonaTab = "acr";
    h1HighlightZona = "Maijuna Kichwa";
    h1HighlightTipo = null;
    h1ChartScope = "global";
    selectedOid = pickDefaultOid();
    viewerState = { zoom: 1, panX: 0, panY: 0, band: "rgb" };
    if (h1Map) { h1Map.remove(); h1Map = null; }
    h1VectorLayers = null;
    h1PuntosLayer = null;
    h1MonitoreoData = null;
    if (h2LogTimer) clearTimeout(h2LogTimer);
    if (stage) stage.classList.add("hidden");
    document.querySelectorAll(".atd-flow-step").forEach((el) => el.classList.remove("atd-flow-active"));
  }

  return { mount, showStep, reset, footerHtml: instFooterHtml };
})();
