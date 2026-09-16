/* Dashboard ACR — orquestación */
const API = "";

const state = {
  departamento: "todos",
  ambito: "acr",
  acrs: [],
  annoDesde: 2015,
  annoHasta: 2025,
};

const ANNO_MIN = 2001;
const ANNO_MAX = 2025;

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

async function apiGet(path, params = {}, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API}${path}${buildQuery(params)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 400 + i * 350));
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
  Tendencias.init();

  // Health en paralelo (no bloquea la UI); si falla del todo, banner offline
  const healthP = apiGet("/api/health", {}, 8).catch(() => null);

  // URL ?acr= / ?tab= antes del primer refresh para no cargar dos veces
  await applyUrlQueryParams({ skipRefresh: true });

  await loadAcrOptions();
  if (state._pendingAcr) {
    const code = state._pendingAcr;
    delete state._pendingAcr;
    const sel = qs("#nombre_acr");
    if (sel) {
      sel.value = code;
    }
    state.acrs = [code];
    updateFilterInfo();
  }

  // Mapa + KPIs al toque
  const dashP = refreshDashboard();

  const health = await healthP;
  if (!health) {
    try {
      await apiGet("/api/health", {}, 12);
    } catch (err) {
      showOfflineBanner();
      throw err;
    }
  }
  await dashP;
  startServerHeartbeat();
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
  const allowed = new Set(["dashboard", "metodologia", "reportes", "tendencias"]);
  const tab = allowed.has(tabName) ? tabName : "dashboard";
  document.querySelectorAll(".nav-tabs button").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  const btn = document.querySelector(`.nav-tabs button[data-tab="${tab}"]`);
  if (btn) btn.classList.add("active");
  const panel = qs(`#tab-${tab}`);
  if (panel) panel.classList.add("active");
  if (tab === "dashboard") {
    setTimeout(() => AcrMap.init()?.invalidateSize(), 250);
  }
  if (tab === "reportes" && !window._reportesReady) {
    window._reportesReady = true;
    Reportes.init();
  }
}

document.querySelectorAll(".nav-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
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
  return state.annoDesde !== ANNO_MIN || state.annoHasta !== ANNO_MAX;
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
  const hasDepto = state.departamento && state.departamento !== "todos";
  const hasAmbito = state.ambito && state.ambito !== "acr";
  const has = hasDepto || hasAmbito || state.acrs.length || isYearFilterActive();
  if (!has) {
    info.classList.remove("visible");
    return;
  }
  let html = "<strong>Filtro activo:</strong> ";
  const parts = [];
  if (hasDepto) parts.push(`Depto: ${state.departamento}`);
  if (state.ambito) {
    const t =
      state.ambito === "acr" ? "ACR" : state.ambito === "zi" ? "Zona de Influencia" : "ACR + ZI";
    parts.push(`Ámbito: ${t}`);
  }
  if (state.acrs.length) parts.push(`ACRs: ${state.acrs.length}`);
  if (isYearFilterActive()) parts.push(`Periodo: ${state.annoDesde}–${state.annoHasta}`);
  html += parts.join(" · ");
  info.innerHTML = html;
  info.classList.add("visible");
}

async function refreshDashboard() {
  const params = {
    departamento: state.departamento,
    ambito: state.ambito || "acr",
    acr: state.acrs.length ? state.acrs : undefined,
    anno_desde: state.annoDesde,
    anno_hasta: state.annoHasta,
  };
  // 1) KPIs first (fast path — sin geometrías / sin CSV si vectores cubren)
  renderKpis(await apiGet("/api/kpis", params));
  // 2) Charts only when ACR selected; nacional placeholder needs no fetch
  if (state.acrs.length) {
    await apiGet("/api/graficos", { ...params, ambito: state.ambito }).then(renderCharts);
  } else {
    renderCharts({ modo: "nacional" });
  }
  // 3) Map fire-and-forget so KPIs/charts paint without waiting for polygons
  AcrMap.refresh(state).catch((err) => console.warn("Mapa:", err));
  Modals.bind(state);
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
    subText.textContent = `${v.texto || "Sin cambios"} respecto al año anterior`;
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

  if (g.modo === "individual" && g.composicion) {
    ind?.classList.remove("hidden");
    Plotly.newPlot(
      "chart-composicion",
      [{ x: g.composicion.map((d) => d.Categoria), y: g.composicion.map((d) => d.Hectareas), type: "bar", marker: { color: g.composicion.map((d) => d.Color) }, textposition: "outside" }],
      { yaxis: { title: "Hectáreas" }, showlegend: false, margin: { t: 20, b: 40 }, height: 260 },
      { responsive: true, displayModeBar: false }
    );
    if (g.causas_top5) {
      const causas = g.causas_top5.slice(0, 12);
      // Plotly pone el primer ítem abajo: invertimos para que el mayor quede arriba
      const labels = causas.map((d) => d.Causa).reverse();
      const values = causas.map((d) => d.Area_Ha).reverse();
      Plotly.newPlot(
        "chart-causas",
        [{
          y: labels,
          x: values,
          type: "bar",
          orientation: "h",
          marker: { color: "#1a7a5c" },
          text: values.map((v) => Number(v).toLocaleString("es-PE", { maximumFractionDigits: 1 })),
          textposition: "outside",
          cliponaxis: false,
        }],
        {
          margin: { l: 130, r: 48, t: 20, b: 40 },
          xaxis: { title: "Hectáreas" },
          yaxis: { automargin: true },
          height: Math.max(280, 36 * labels.length + 80),
        },
        { responsive: true, displayModeBar: false }
      );
    }
    if (g.distribucion) {
      Plotly.newPlot(
        "chart-distribucion",
        [{ labels: g.distribucion.items.map((d) => d.Categoria), values: g.distribucion.items.map((d) => d.Hectareas), type: "pie", hole: 0.4, marker: { colors: g.distribucion.items.map((d) => d.Color) }, textinfo: "label+percent" }],
        { annotations: [{ text: `<b>${fmt(g.distribucion.total)} ha</b>`, showarrow: false, font: { size: 14 } }], margin: { t: 20, b: 20 }, height: 280 },
        { responsive: true, displayModeBar: false }
      );
    }
  } else if (g.modo === "comparativa" && g.comparativa) {
    comp?.classList.remove("hidden");
    const names = g.comparativa.map((d) => d.Nombre_corto);
    Plotly.newPlot(
      "chart-comparativa",
      [
        { x: names, y: g.comparativa.map((d) => d.Antropico), name: "Antrópico", type: "bar", marker: { color: "#d9534f" } },
        { x: names, y: g.comparativa.map((d) => d.Perdida_natural), name: "Natural", type: "bar", marker: { color: "#5cb85c" } },
        { x: names, y: g.comparativa.map((d) => d.Falsa_alerta), name: "Falsa Alerta", type: "bar", marker: { color: "#f0ad4e" } },
      ],
      { barmode: "group", margin: { b: 100, t: 20 }, xaxis: { tickangle: -35 }, yaxis: { title: "Área (ha)" }, legend: { orientation: "h", y: -0.25 }, height: 360 },
      { responsive: true, displayModeBar: false }
    );
  } else {
    nac?.classList.remove("hidden");
  }
}

async function applyFiltersFromDom() {
  state.departamento = qs("#departamento")?.value || "todos";
  state.ambito = qs("#ambito")?.value || "acr";
  state.acrs = getSelectedAcrs();
  readYearFilters();
  updateFilterInfo();
  await refreshDashboard();
}

qs("#departamento").addEventListener("change", async (e) => {
  state.departamento = e.target.value;
  state.acrs = [];
  await loadAcrOptions();
  updateFilterInfo();
  await refreshDashboard();
});

qs("#ambito").addEventListener("change", (e) => {
  state.ambito = e.target.value || "acr";
  updateFilterInfo();
  refreshDashboard();
});

qs("#nombre_acr").addEventListener("change", () => {
  state.acrs = getSelectedAcrs();
  updateFilterInfo();
  refreshDashboard();
});

function onYearFilterChange() {
  readYearFilters();
  updateFilterInfo();
  refreshDashboard();
}

qs("#anno_desde")?.addEventListener("change", onYearFilterChange);
qs("#anno_hasta")?.addEventListener("change", onYearFilterChange);

(async function init() {
  try {
    await bootstrapDashboard();
  } catch (err) {
    console.error(err);
    hideLoading();
    if (!qs("#server-offline-banner")) showOfflineBanner();
  }
})();
