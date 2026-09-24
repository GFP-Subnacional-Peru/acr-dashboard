/* Dashboard ACR — orquestación */
const API = "";

const DEFAULT_AMBITO = "ambos";

const state = {
  departamento: "todos",
  ambito: DEFAULT_AMBITO,
  acrs: [],
  annoDesde: 2015,
  annoHasta: 2025,
};
window.state = state;

const ANNO_MIN = 2001;
const ANNO_MAX = 2025;
const DEFAULT_ANNO_DESDE = 2015;
const DEFAULT_ANNO_HASTA = 2025;

const fmt = (n) =>
  new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
const fmt2 = (n) =>
  new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

function qs(sel) {
  return document.querySelector(sel);
}

function buildQuery(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === null || v === undefined || v === "") return;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else p.set(k, v);
  });
  return p.toString() ? `?${p}` : "";
}

async function apiGet(path, params = {}, retries = 2) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const t = ctrl ? setTimeout(() => ctrl.abort(), 90000) : null;
      const res = await fetch(`${API}${path}${buildQuery(params)}`, {
        cache: "no-store",
        signal: ctrl?.signal,
      });
      if (t) clearTimeout(t);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 400 + i * 400));
    }
  }
  throw lastErr;
}

function showLoading() {
  /* no-op: sin splash a pantalla completa */
}

function hideLoading() {
  qs("#app-loading")?.classList.add("hidden");
}

function showOfflineBanner() {
  if (qs("#server-offline-banner")) return;
  const isRemote = !["localhost", "127.0.0.1"].includes(window.location.hostname);
  const box = document.createElement("div");
  box.id = "server-offline-banner";
  box.className = "offline-banner";
  box.innerHTML = `<div class="offline-banner-card">
      <i class="fas fa-server" style="font-size:2.5rem;color:#006D5B;margin-bottom:12px"></i>
      <h2>Servidor iniciando</h2>
      <p id="offline-retry-msg">${
        isRemote
          ? "El servicio en la nube puede tardar <strong>30–60 segundos</strong> en despertar (plan gratuito). Espere un momento…"
          : "Ejecute <strong>iniciar.bat</strong> y espere <em>Uvicorn running</em> en la ventana del servidor."
      }</p>
      <button type="button" id="btn-retry-load" class="btn btn-primary" style="margin-top:16px">
        <i class="fas fa-redo"></i> Reintentar
      </button>
    </div>`;
  document.body.appendChild(box);
  qs("#btn-retry-load")?.addEventListener("click", () => {
    box.remove();
    bootstrapDashboard();
  });
}

async function bootstrapDashboard() {
  hideLoading();
  initYearFilters();
  try {
    Modals.bind(state);
  } catch (_) {}

  const bootTab = initialTabFromUrl();
  const needsMapNow = bootTab === "dashboard";

  // Solo montar Leaflet si el usuario aterriza en Mapa (evita trabajo pesado en Metodología/etc.)
  if (needsMapNow) {
    try { AcrMap.init(); } catch (_) {}
  }

  const healthP = apiGet("/api/health", {}, 4).catch(() => null);

  await applyUrlQueryParams({ skipRefresh: true });
  try {
    document.documentElement.removeAttribute("data-boot-tab");
  } catch (_) {}

  if (!needsMapNow) {
    // Arranque liviano: no espera KPIs/mapa/opciones
    window._dashDataReady = false;
    loadAcrOptions().then(() => {
      if (state._pendingAcr) {
        const code = state._pendingAcr;
        delete state._pendingAcr;
        const sel = qs("#nombre_acr");
        if (sel) sel.value = code;
        state.acrs = [code];
        updateFilterInfo();
      }
    }).catch(() => {});
    healthP.then((health) => {
      if (!health) {
        apiGet("/api/health", {}, 6).catch(() => showOfflineBanner());
      }
    });
    startServerHeartbeat();
    return;
  }

  const optionsP = loadAcrOptions();
  await optionsP;
  if (state._pendingAcr) {
    const code = state._pendingAcr;
    delete state._pendingAcr;
    const sel = qs("#nombre_acr");
    if (sel) sel.value = code;
    state.acrs = [code];
    updateFilterInfo();
  }

  // KPIs + mapa en paralelo (más fluido); no bloquear el arranque
  window._dashDataReady = true;
  refreshDashboard().catch((err) => console.warn("Dashboard:", err));

  const health = await healthP;
  if (!health) {
    try {
      await apiGet("/api/health", {}, 6);
    } catch (err) {
      showOfflineBanner();
      throw err;
    }
  }
  startServerHeartbeat();
}

function initialTabFromUrl() {
  try {
    const t = (new URLSearchParams(window.location.search).get("tab") || "").toLowerCase();
    if (t === "mapa") return "dashboard";
    if (t === "metodologia" || t === "tendencias") return t;
    if (t === "reportes") return "dashboard"; // pestaña retirada por ahora
  } catch (_) {}
  return "dashboard";
}

/** Primera visita al mapa tras aterrizar en otra pestaña. */
async function ensureDashboardData() {
  if (window._dashDataReady) {
    try { AcrMap.init()?.invalidateSize(); } catch (_) {}
    return;
  }
  window._dashDataReady = true;
  try { AcrMap.init(); } catch (_) {}
  await refreshDashboard();
}

/** Mientras la pestaña está abierta, evita que Render duerma (complemento al ping externo). */
function startServerHeartbeat() {
  if (window._heartbeatStarted) return;
  window._heartbeatStarted = true;
  const ping = () => {
    if (document.visibilityState !== "visible") return;
    fetch("/api/health", { cache: "no-store" }).catch(() => {});
  };
  setInterval(ping, 8 * 60 * 1000);
}

function activateTab(tabName) {
  const allowed = new Set(["dashboard", "metodologia", "tendencias"]);
  const tab = allowed.has(tabName) ? tabName : "dashboard";
  try {
    document.documentElement.removeAttribute("data-boot-tab");
  } catch (_) {}
  document.querySelectorAll(".nav-tabs button[data-tab]").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  const btn = document.querySelector(`.nav-tabs button[data-tab="${tab}"]`);
  if (btn) btn.classList.add("active");
  const panel = qs(`#tab-${tab}`);
  if (panel) panel.classList.add("active");
  if (tab === "dashboard") {
    ensureDashboardData().catch((err) => console.warn("Dashboard:", err));
  }
  if (tab === "tendencias" && typeof Tendencias !== "undefined" && !window._tendenciasReady) {
    window._tendenciasReady = true;
    Tendencias.init();
  }
  // Actualiza URL sin recargar para que cada sección sea una "página" clara
  try {
    const url = new URL(window.location.href);
    if (tab === "dashboard") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url);
  } catch (_) { /* ignore */ }
}

document.querySelectorAll(".nav-tabs button[data-tab]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    activateTab(btn.dataset.tab);
  });
});

const ACR_DEPTO = {
  ACR_AA: "loreto",
  ACR_ANPCH: "loreto",
  ACR_MK: "loreto",
  ACR_CTT: "loreto",
  ACR_BSM: "san_martin",
  ACR_CE: "san_martin",
  ACR_CHQ: "cusco",
  ACR_CHU: "cusco",
  ACR_QK: "cusco",
};

/** Aplica ?tab=… y ?acr=… desde la URL (portal → mapa). */
async function applyUrlQueryParams(opts = {}) {
  const { skipRefresh = false } = opts;
  const params = new URLSearchParams(window.location.search);
  const tab = (params.get("tab") || "").toLowerCase();
  if (tab) activateTab(tab === "mapa" ? "dashboard" : tab);

  let acrParam = params.get("acr") || params.get("ACR");
  if (!acrParam) return false;
  acrParam = acrParam.trim().toUpperCase();
  if (!ACR_DEPTO[acrParam]) return false;

  const depto = ACR_DEPTO[acrParam];
  state.departamento = depto;
  state.ambito = "acr";
  if (qs("#departamento")) qs("#departamento").value = depto;
  if (qs("#ambito")) qs("#ambito").value = "acr";
  if (!skipRefresh) await loadAcrOptions();
  // Si skipRefresh, loadAcrOptions lo hará el bootstrap después; marcar intención
  state._pendingAcr = acrParam;
  if (!skipRefresh) {
    const sel = qs("#nombre_acr");
    if (sel) {
      sel.value = acrParam;
    }
    state.acrs = [acrParam];
    updateFilterInfo();
    await refreshDashboard();
  }
  return true;
}

function initYearFilters() {
  const desde = qs("#anno_desde");
  const hasta = qs("#anno_hasta");
  if (!desde || !hasta) return;
  for (let y = ANNO_MIN; y <= ANNO_MAX; y++) {
    const o1 = document.createElement("option");
    o1.value = String(y);
    o1.textContent = String(y);
    desde.appendChild(o1);
    const o2 = document.createElement("option");
    o2.value = String(y);
    o2.textContent = String(y);
    hasta.appendChild(o2);
  }
  desde.value = String(state.annoDesde);
  hasta.value = String(state.annoHasta);
  syncYearFilterLabel();
}

function readYearFilters() {
  let desde = parseInt(qs("#anno_desde")?.value || ANNO_MIN, 10);
  let hasta = parseInt(qs("#anno_hasta")?.value || ANNO_MAX, 10);
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  state.annoDesde = desde;
  state.annoHasta = hasta;
  if (qs("#anno_desde")) qs("#anno_desde").value = String(desde);
  if (qs("#anno_hasta")) qs("#anno_hasta").value = String(hasta);
  syncYearFilterLabel();
}

function syncYearFilterLabel() {
  const full = state.annoDesde === ANNO_MIN && state.annoHasta === ANNO_MAX;
  const text = full
    ? `Periodo: ${ANNO_MIN} – ${ANNO_MAX}`
    : `Periodo: ${state.annoDesde} – ${state.annoHasta}`;
  const label = qs("#anno-range-label");
  if (label) label.textContent = text;
  const mapPeriod = qs("#dash-map-period");
  if (mapPeriod) mapPeriod.textContent = text.replace("Periodo", "Período");
}

function isYearFilterActive() {
  return state.annoDesde !== DEFAULT_ANNO_DESDE || state.annoHasta !== DEFAULT_ANNO_HASTA;
}

async function loadAcrOptions() {
  const data = await apiGet("/api/filtros/opciones-acr", { departamento: state.departamento });
  const sel = qs("#nombre_acr");
  const prev = sel.value;
  sel.innerHTML = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "Todas las ACR";
  sel.appendChild(all);
  Object.entries(data.grupos || {}).forEach(([grupo, items]) => {
    const og = document.createElement("optgroup");
    og.label = grupo;
    Object.entries(items).forEach(([label, code]) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = String(label).replace(/^ACR\s+/i, "");
      og.appendChild(opt);
    });
    sel.appendChild(og);
  });
  if (prev && Array.from(sel.options).some((o) => o.value === prev)) {
    sel.value = prev;
  } else {
    sel.value = "";
  }
}

function getSelectedAcrs() {
  const v = qs("#nombre_acr")?.value;
  return v ? [v] : [];
}

function updateFilterInfo() {
  const info = qs("#filter-info");
  const btn = qs("#btn-restablecer");
  const hasDepto = state.departamento && state.departamento !== "todos";
  const hasAmbito = state.ambito && state.ambito !== DEFAULT_AMBITO;
  const hasYears = isYearFilterActive();
  const has = hasDepto || hasAmbito || state.acrs.length || hasYears;
  if (!has) {
    info.classList.remove("visible");
    info.innerHTML = "";
    btn?.classList.add("hidden");
    return;
  }
  let html = "<strong>Filtro activo:</strong> ";
  const parts = [];
  if (hasDepto) parts.push(`Depto: ${state.departamento}`);
  if (hasAmbito) {
    const t =
      state.ambito === "acr" ? "ACR" : state.ambito === "zi" ? "Zona de Influencia" : "ACR + ZI";
    parts.push(`Ámbito: ${t}`);
  }
  if (state.acrs.length) parts.push(`ACRs: ${state.acrs.length}`);
  if (hasYears) parts.push(`Periodo: ${state.annoDesde}–${state.annoHasta}`);
  html += parts.join(" · ");
  info.innerHTML = html;
  info.classList.add("visible");
  btn?.classList.remove("hidden");
}

async function restablecerFiltros() {
  state.departamento = "todos";
  state.ambito = DEFAULT_AMBITO;
  state.acrs = [];
  state.annoDesde = DEFAULT_ANNO_DESDE;
  state.annoHasta = DEFAULT_ANNO_HASTA;
  if (qs("#departamento")) qs("#departamento").value = "todos";
  if (qs("#ambito")) qs("#ambito").value = DEFAULT_AMBITO;
  if (qs("#anno_desde")) qs("#anno_desde").value = String(DEFAULT_ANNO_DESDE);
  if (qs("#anno_hasta")) qs("#anno_hasta").value = String(DEFAULT_ANNO_HASTA);
  const label = qs("#anno-range-label");
  if (label) label.textContent = `Periodo: ${DEFAULT_ANNO_DESDE} – ${DEFAULT_ANNO_HASTA}`;
  const mapPeriod = qs("#dash-map-period");
  if (mapPeriod) mapPeriod.textContent = `Período: ${DEFAULT_ANNO_DESDE} – ${DEFAULT_ANNO_HASTA}`;
  await loadAcrOptions();
  if (qs("#nombre_acr")) qs("#nombre_acr").value = "";
  updateFilterInfo();
  try {
    Modals.close?.();
  } catch (_) {}
  await refreshDashboard();
}

async function refreshDashboard() {
  const seq = (window._dashRefreshSeq = (window._dashRefreshSeq || 0) + 1);
  document.querySelector(".dash-kpi-card")?.classList.add("is-loading");
  const params = {
    departamento: state.departamento,
    ambito: state.ambito || DEFAULT_AMBITO,
    acr: state.acrs.length ? state.acrs : undefined,
    anno_desde: state.annoDesde,
    anno_hasta: state.annoHasta,
  };
  // Mapa en paralelo sin bloquear KPIs
  AcrMap.refresh(state).catch((err) => console.warn("Mapa:", err));
  const emptyKpis = {
    total_hectareas: 0,
    total_antropico: 0,
    pct_antropico: 0,
    causa_principal: "Cargando…",
    causa_principal_ha: 0,
    causa_principal_pct: 0,
    variacion_anual: { variacion: 0, texto: "Espere un momento", color: "#f39c12", icono: "spinner" },
    texto_ambito_kpi: "Total (ACR + ZI)",
  };
  const kpiP = apiGet("/api/kpis", params)
    .then((k) => {
      if (seq !== window._dashRefreshSeq) return;
      renderKpis(k);
    })
    .catch((err) => {
      if (seq !== window._dashRefreshSeq) return;
      console.warn("KPIs:", err);
      renderKpis(emptyKpis);
    })
    .finally(() => {
      if (seq === window._dashRefreshSeq) {
        document.querySelector(".dash-kpi-card")?.classList.remove("is-loading");
      }
    });
  if (state.acrs.length) {
    await Promise.all([
      kpiP,
      apiGet("/api/graficos", { ...params, ambito: state.ambito })
        .then((g) => {
          if (seq !== window._dashRefreshSeq) return;
          renderCharts(g);
        })
        .catch((err) => console.warn("Gráficos:", err)),
    ]);
  } else {
    renderCharts({ modo: "nacional" });
    await kpiP;
  }
  if (seq === window._dashRefreshSeq) Modals.bind(state);
}

function scheduleRefresh(delay = 220) {
  window.clearTimeout(window._dashRefreshT);
  window._dashRefreshT = window.setTimeout(() => {
    refreshDashboard().catch((err) => console.warn("Dashboard:", err));
  }, delay);
}

function renderKpis(k) {
  qs("#kpi-hectareas .number").textContent = `${fmt(k.total_hectareas)} ha`;
  const v = k.variacion_anual || {};
  const val = v.variacion ?? 0;
  const sign = val >= 0 ? "+" : "";
  const box = qs("#kpi-variacion");
  const color = v.color || "#f39c12";
  const icon = v.icono || "minus";
  box.style.borderLeftColor = color;
  box.style.background = "linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)";
  box.querySelector(".number").textContent = `${sign} ${Math.abs(val)}%`;
  box.querySelector(".number").style.color = color;
  const bgIcon = box.querySelector(".kpi-bg-icon");
  if (bgIcon) {
    bgIcon.className = `kpi-bg-icon fas fa-${icon}`;
    bgIcon.style.color = color;
  }
  const subIcon = box.querySelector(".sub-icon");
  const subText = box.querySelector(".sub-text");
  if (subIcon) subIcon.className = `sub-icon fas fa-${icon}`;
  if (subText) {
    subText.textContent =
      v.anio && v.anio_anterior
        ? `${v.texto || "Sin cambios"} · ${v.anio} vs ${v.anio_anterior}`
        : `${v.texto || "Sin cambios"} respecto al año anterior`;
    subText.style.color = color;
    subText.style.fontWeight = "600";
  }

  const pct = k.porcentaje_antropico_kpi ?? k.pct_antropico ?? 0;
  const colorPct = pct < 30 ? "#5cb85c" : pct < 60 ? "#f39c12" : "#d9534f";
  qs("#kpi-porcentaje .number").textContent = `${pct}%`;
  qs("#kpi-porcentaje .number").style.color = colorPct;
  const pctSub = k.texto_ambito_kpi
    ? `${k.texto_ambito_kpi} · ${fmt(k.total_antropico)} ha de ${fmt(k.total_hectareas)} ha`
    : `${fmt(k.total_antropico)} ha de ${fmt(k.total_hectareas)} ha`;
  qs("#kpi-porcentaje .sub").textContent = pctSub;

  const causa = k.causa_principal || "Sin datos";
  const causaHa = k.causa_principal_ha ?? 0;
  const causaPct = k.causa_principal_pct ?? 0;
  qs("#kpi-causa .number").textContent = `${fmt(causaHa)} ha`;
  qs("#kpi-causa .number").style.color = "#1a4d2e";
  const causaSub = qs("#kpi-causa .sub");
  if (causaSub) {
    causaSub.innerHTML = `<i class="fas fa-search"></i> ${causa} · ${causaPct}% del total`;
    causaSub.title = `${causa}: ${fmt(causaHa)} ha (${causaPct}% del total filtrado)`;
  }
}

function renderCharts(g) {
  const ind = qs("#charts-individual");
  const comp = qs("#charts-comparativa");
  const nac = qs("#charts-nacional");
  ind?.classList.add("hidden");
  comp?.classList.add("hidden");
  nac?.classList.add("hidden");

  const COL = {
    antropico: "#d9534f",
    natural: "#5cb85c",
    causas: ["#006D5B", "#1a4d2e", "#66c2a5", "#2e8b57", "#8fbc8f", "#3d9970"],
  };

  const sciLayout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(248,250,252,0.55)",
    font: { family: "Segoe UI, Helvetica Neue, Arial, sans-serif", size: 12, color: "#334155" },
    hoverlabel: {
      bgcolor: "rgba(15, 23, 42, 0.92)",
      bordercolor: "rgba(15, 23, 42, 0.92)",
      font: { color: "#fff", size: 12 },
    },
  };
  const axisSci = {
    gridcolor: "rgba(226,232,240,0.85)",
    zeroline: false,
    linecolor: "rgba(203,213,225,0.9)",
    tickfont: { size: 11, color: "#64748b" },
    titlefont: { size: 12, color: "#475569" },
    showline: true,
    mirror: false,
  };

  if (g.modo === "individual" && g.composicion) {
    ind?.classList.remove("hidden");
    const composicion = (g.composicion || []).filter((d) => d.Categoria !== "Falsa alerta");
    const compColors = composicion.map((d) =>
      String(d.Categoria || "").toLowerCase().includes("antr") ? COL.antropico : COL.natural
    );
    Plotly.newPlot(
      "chart-composicion",
      [{
        x: composicion.map((d) => d.Categoria),
        y: composicion.map((d) => d.Hectareas),
        type: "bar",
        width: 0.48,
        marker: { color: compColors, line: { width: 0 }, opacity: 0.95, cornerradius: 8 },
        text: composicion.map((d) => Number(d.Hectareas).toLocaleString("es-PE", { maximumFractionDigits: 1 })),
        textposition: "outside",
        textfont: { size: 12, color: "#0f172a", family: "Segoe UI, Arial, sans-serif" },
        cliponaxis: false,
        hovertemplate: "<b>%{x}</b><br>%{y:,.1f} ha<extra></extra>",
      }],
      {
        ...sciLayout,
        yaxis: { title: "Hectáreas (ha)", ...axisSci },
        xaxis: { ...axisSci, tickangle: 0, showgrid: false },
        showlegend: false,
        margin: { t: 40, b: 52, l: 58, r: 18 },
        height: 310,
        bargap: 0.42,
      },
      { responsive: true, displayModeBar: false }
    );
    if (g.causas_top5) {
      const causas = g.causas_top5.slice(0, 12);
      const labels = causas.map((d) => d.Causa).reverse();
      const values = causas.map((d) => d.Area_Ha).reverse();
      Plotly.newPlot(
        "chart-causas",
        [{
          y: labels,
          x: values,
          type: "bar",
          orientation: "h",
          marker: {
            color: values.map((_, i) => COL.causas[i % COL.causas.length]),
            line: { width: 0 },
            opacity: 0.95,
            cornerradius: 6,
          },
          text: values.map((v) => Number(v).toLocaleString("es-PE", { maximumFractionDigits: 1 })),
          textposition: "outside",
          textfont: { size: 11, color: "#0f172a" },
          cliponaxis: false,
          hovertemplate: "<b>%{y}</b><br>%{x:,.1f} ha<extra></extra>",
        }],
        {
          ...sciLayout,
          margin: { l: 148, r: 56, t: 28, b: 44 },
          xaxis: { title: "Hectáreas (ha)", ...axisSci },
          yaxis: { ...axisSci, automargin: true, showgrid: false },
          height: Math.max(300, 38 * labels.length + 90),
        },
        { responsive: true, displayModeBar: false }
      );
    }
    if (g.distribucion) {
      const distItems = (g.distribucion.items || []).filter((d) => d.Categoria !== "Falsa alerta");
      const distTotal = Number(g.distribucion.total != null
        ? g.distribucion.total
        : distItems.reduce((a, d) => a + Number(d.Hectareas || 0), 0));
      const pieColors = distItems.map((d) =>
        String(d.Categoria || "").toLowerCase().includes("antr") ? COL.antropico : COL.natural
      );
      Plotly.newPlot(
        "chart-distribucion",
        [{
          labels: distItems.map((d) => d.Categoria),
          values: distItems.map((d) => d.Hectareas),
          type: "pie",
          hole: 0.58,
          marker: { colors: pieColors, line: { color: "#ffffff", width: 3 } },
          textinfo: "percent",
          textposition: "inside",
          textfont: { size: 13, color: "#ffffff" },
          insidetextorientation: "horizontal",
          sort: false,
          pull: 0.015,
          hovertemplate: "<b>%{label}</b><br>%{value:,.1f} ha (%{percent})<extra></extra>",
        }],
        {
          ...sciLayout,
          annotations: [{
            text: `<b style="font-size:17px;color:#1e3a5f">${fmt(distTotal)} ha</b><br><span style="font-size:11px;color:#64748b">total analizado</span>`,
            showarrow: false,
            font: { size: 13 },
          }],
          margin: { t: 28, b: 44, l: 28, r: 28 },
          height: 330,
          showlegend: true,
          legend: {
            orientation: "h",
            y: -0.08,
            x: 0.5,
            xanchor: "center",
            font: { size: 11, color: "#475569" },
          },
        },
        { responsive: true, displayModeBar: false }
      );
    }
    setTimeout(() => AcrMap.init()?.invalidateSize(), 200);
  } else if (g.modo === "comparativa" && g.comparativa) {
    comp?.classList.remove("hidden");
    const names = g.comparativa.map((d) => d.Nombre_corto);
    Plotly.newPlot(
      "chart-comparativa",
      [
        {
          x: names,
          y: g.comparativa.map((d) => d.Antropico),
          name: "Origen antrópico",
          type: "bar",
          marker: { color: COL.antropico, opacity: 0.95, line: { width: 0 }, cornerradius: 5 },
        },
        {
          x: names,
          y: g.comparativa.map((d) => d.Perdida_natural),
          name: "Natural",
          type: "bar",
          marker: { color: COL.natural, opacity: 0.95, line: { width: 0 }, cornerradius: 5 },
        },
      ],
      {
        ...sciLayout,
        barmode: "group",
        bargap: 0.3,
        bargroupgap: 0.14,
        margin: { b: 100, t: 28, l: 56, r: 20 },
        xaxis: { ...axisSci, tickangle: -28, showgrid: false },
        yaxis: { title: "Área (ha)", ...axisSci },
        legend: { orientation: "h", y: -0.28, font: { size: 11 } },
        height: 390,
      },
      { responsive: true, displayModeBar: false }
    );
    setTimeout(() => AcrMap.init()?.invalidateSize(), 200);
  } else {
    nac?.classList.remove("hidden");
  }
}

async function applyFiltersFromDom() {
  state.departamento = qs("#departamento")?.value || "todos";
  state.ambito = qs("#ambito")?.value || DEFAULT_AMBITO;
  state.acrs = getSelectedAcrs();
  readYearFilters();
  updateFilterInfo();
  scheduleRefresh(80);
}

qs("#departamento").addEventListener("change", async (e) => {
  state.departamento = e.target.value;
  state.acrs = [];
  await loadAcrOptions();
  updateFilterInfo();
  scheduleRefresh(80);
});

qs("#ambito").addEventListener("change", (e) => {
  state.ambito = e.target.value || DEFAULT_AMBITO;
  updateFilterInfo();
  scheduleRefresh();
});

qs("#nombre_acr").addEventListener("change", () => {
  state.acrs = getSelectedAcrs();
  updateFilterInfo();
  scheduleRefresh();
});

function onYearFilterChange() {
  readYearFilters();
  updateFilterInfo();
  scheduleRefresh(280);
}

qs("#anno_desde")?.addEventListener("change", onYearFilterChange);
qs("#anno_hasta")?.addEventListener("change", onYearFilterChange);
qs("#btn-restablecer")?.addEventListener("click", () => {
  restablecerFiltros().catch((err) => console.error(err));
});

(async function init() {
  try {
    await bootstrapDashboard();
  } catch (err) {
    console.error(err);
    hideLoading();
    if (!qs("#server-offline-banner")) showOfflineBanner();
  }
})();
