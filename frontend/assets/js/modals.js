/* Detalle KPI inline — reemplaza modal para indicadores del mapa */
const Modals = (() => {
  let activeKpi = null;
  let bound = false;

  function ensureModalRoot() {
    let el = document.getElementById("modal-root");
    if (!el) {
      el = document.createElement("div");
      el.id = "modal-root";
      document.body.appendChild(el);
    }
    return el;
  }

  function show(html) {
    const root = ensureModalRoot();
    root.innerHTML = `<div class="modal-overlay" id="modal-overlay">
      <div class="modal-dialog">${html}
        <button type="button" class="btn btn-block" id="modal-close" style="margin-top:1rem">Cerrar</button>
      </div></div>`;
    document.getElementById("modal-close").onclick = close;
    document.getElementById("modal-overlay").onclick = (e) => {
      if (e.target.id === "modal-overlay") close();
    };
  }

  function close() {
    const root = document.getElementById("modal-root");
    if (root) root.innerHTML = "";
  }

  function dock() {
    return document.getElementById("kpi-detail-dock");
  }

  function setTriggers(openKey) {
    document.querySelectorAll(".kpi-trigger").forEach((btn) => {
      const on = btn.dataset.kpi === openKey;
      btn.classList.toggle("is-open", on);
      btn.setAttribute("aria-expanded", on ? "true" : "false");
    });
  }

  function closeDock() {
    activeKpi = null;
    const el = dock();
    if (el) el.classList.add("hidden");
    setTriggers(null);
  }

  function openDock(titleHtml) {
    const el = dock();
    if (!el) return;
    const title = document.getElementById("kpi-detail-title");
    if (title) title.innerHTML = titleHtml;
    el.classList.remove("hidden");
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function showMap(titulo, src) {
    const root = ensureModalRoot();
    root.innerHTML = `<div class="modal-overlay" id="modal-overlay">
      <div class="modal-dialog modal-dialog-xl">
        <h3 style="margin:0 0 1rem;color:#1a4d2e"><i class="fas fa-map"></i> ${titulo}</h3>
        <div class="modal-map-wrap">
          <div class="modal-map-loading"><i class="fas fa-spinner fa-spin"></i> Cargando mapa en alta resolución…</div>
          <img id="modal-map-img" alt="${titulo}" style="width:100%;height:auto;display:none;border-radius:8px"/>
        </div>
        <div style="display:flex;gap:10px;margin-top:1rem;flex-wrap:wrap">
          <a href="${src}" target="_blank" class="btn" style="background:#2c5f7d;color:#fff;text-decoration:none"><i class="fas fa-external-link-alt"></i> Abrir en pestaña nueva</a>
          <button type="button" class="btn btn-block" id="modal-close" style="flex:1;max-width:200px">Cerrar</button>
        </div>
      </div></div>`;
    const img = document.getElementById("modal-map-img");
    const loading = root.querySelector(".modal-map-loading");
    img.onload = () => {
      img.style.display = "block";
      if (loading) loading.style.display = "none";
    };
    img.onerror = () => {
      if (loading) loading.textContent = "No se pudo cargar la imagen.";
    };
    img.src = src;
    document.getElementById("modal-close").onclick = close;
    document.getElementById("modal-overlay").onclick = (e) => {
      if (e.target.id === "modal-overlay") close();
    };
  }

  function showInformeCatalogo() {
    const items = [
      { t: "ACR Ampiyacu Apayacu", u: "/api/descargas/mapa/aa" },
      { t: "ACR Alto Nanay", u: "/api/descargas/mapa/anpch" },
      { t: "Informe cartográfico — seleccione un mapa PDF de la galería superior" },
    ];
    const links = items
      .filter((i) => i.u)
      .map((i) => `<li><a href="${i.u}" target="_blank" style="color:#006D5B;font-weight:600">${i.t}</a></li>`)
      .join("");
    show(`<h3><i class="fas fa-file-pdf"></i> Informes y mapas PDF</h3>
      <p style="color:#666;line-height:1.7">Los informes cartográficos por ACR están disponibles en formato PDF. Use los botones <strong>PDF</strong> en cada tarjeta o los enlaces siguientes:</p>
      <ul style="line-height:2">${links}</ul>
      <p style="font-size:13px;color:#999"><i class="fas fa-info-circle"></i> Para el paquete completo de datos (CSV, GeoJSON), use <strong>Descargar datos</strong> al final de la página.</p>`);
  }

  function showChartsInDock(showCharts) {
    const nac = document.getElementById("charts-nacional");
    const ind = document.getElementById("charts-individual");
    const comp = document.getElementById("charts-comparativa");
    if (!showCharts) {
      nac?.classList.add("hidden");
      ind?.classList.add("hidden");
      comp?.classList.add("hidden");
      return;
    }
    // Deja visible lo que renderCharts ya marcó; si no hay ACR, muestra hint
    const hasInd = ind && !ind.classList.contains("hidden");
    const hasComp = comp && !comp.classList.contains("hidden");
    if (!hasInd && !hasComp) {
      nac?.classList.remove("hidden");
    } else {
      nac?.classList.add("hidden");
    }
  }

  async function openHectareas(state) {
    if (activeKpi === "hectareas") {
      closeDock();
      return;
    }
    activeKpi = "hectareas";
    setTriggers("hectareas");
    openDock('<i class="fas fa-tree"></i> Detalles de deforestación');

    const summary = document.getElementById("kpi-detail-summary");
    const extra = document.getElementById("kpi-detail-extra");
    if (summary) summary.innerHTML = `<p class="kpi-detail-loading"><i class="fas fa-spinner fa-spin"></i> Cargando detalle…</p>`;
    if (extra) extra.innerHTML = "";

    let tipoMeta = "acr";
    if (state.ambito === "zi") tipoMeta = "zi";
    const rows = await apiGet("/api/metadata/acrs", {
      departamento: state.departamento,
      tipo: tipoMeta,
      acr: state.acrs.length ? state.acrs : undefined,
    });
    const data = rows.data || [];
    const total = data.reduce((s, r) => s + (r.Total || 0), 0);
    const ant = data.reduce((s, r) => s + (r.Antropico || 0), 0);
    const nat = data.reduce((s, r) => s + (r.Perdida_natural || 0), 0);

    let table = `<p class="kpi-detail-empty">No hay datos para los filtros actuales.</p>`;
    if (data.length) {
      table = `<h6 class="kpi-detail-table-title">Distribución por ACR</h6>
        <div class="kpi-detail-table-wrap"><table class="data-table"><thead><tr>
        <th>ACR</th><th>Total (ha)</th><th>Antrópico</th><th>Natural</th></tr></thead><tbody>`;
      data
        .slice()
        .sort((a, b) => b.Total - a.Total)
        .forEach((r) => {
          table += `<tr><td>${r.Nombre}</td><td>${fmt(r.Total)}</td>
            <td>${fmt(r.Antropico)}</td><td>${fmt(r.Perdida_natural)}</td></tr>`;
        });
      table += "</tbody></table></div>";
    }

    if (summary) {
      summary.innerHTML = `<div class="kpi-modal-grid">
        <div class="kpi-mini" style="border-color:#d9534f"><h2>${fmt(total)}</h2><span>TOTAL HA</span></div>
        <div class="kpi-mini" style="border-color:#f39c12"><h2>${fmt(ant)}</h2><span>ANTRÓPICO</span></div>
        <div class="kpi-mini" style="border-color:#5cb85c"><h2>${fmt(nat)}</h2><span>NATURAL</span></div>
      </div>`;
    }
    if (extra) extra.innerHTML = table;
    showChartsInDock(true);
    setTimeout(() => {
      try {
        window.dispatchEvent(new Event("resize"));
      } catch (_) {}
    }, 120);
  }

  async function openAntropico(state) {
    if (activeKpi === "antropico") {
      closeDock();
      return;
    }
    activeKpi = "antropico";
    setTriggers("antropico");
    openDock('<i class="fas fa-chart-pie"></i> Origen antrópico');
    const summary = document.getElementById("kpi-detail-summary");
    const extra = document.getElementById("kpi-detail-extra");
    if (extra) extra.innerHTML = "";
    if (summary) {
      summary.innerHTML = `<p class="kpi-detail-lead">Composición antrópica vs natural según los filtros activos. Seleccione una ACR para ver los gráficos detallados.</p>`;
    }
    showChartsInDock(true);
    setTimeout(() => window.dispatchEvent(new Event("resize")), 120);
  }

  async function openVariacion(state) {
    if (activeKpi === "variacion") {
      closeDock();
      return;
    }
    activeKpi = "variacion";
    setTriggers("variacion");
    openDock('<i class="fas fa-chart-bar"></i> Variación anual');
    const summary = document.getElementById("kpi-detail-summary");
    const extra = document.getElementById("kpi-detail-extra");
    const box = document.getElementById("kpi-variacion");
    const num = box?.querySelector(".number")?.textContent || "—";
    const sub = box?.querySelector(".sub-text")?.textContent || "";
    if (summary) {
      summary.innerHTML = `<div class="kpi-modal-grid">
        <div class="kpi-mini" style="border-color:#5cb85c"><h2>${num}</h2><span>VARIACIÓN</span></div>
      </div>
      <p class="kpi-detail-lead">${sub || "Comparación respecto al año anterior con los filtros activos."}</p>`;
    }
    if (extra) extra.innerHTML = "";
    showChartsInDock(true);
  }

  async function openCausas(state) {
    if (activeKpi === "causa") {
      closeDock();
      return;
    }
    activeKpi = "causa";
    setTriggers("causa");
    openDock('<i class="fas fa-cog"></i> Principal causa estimada');

    const summary = document.getElementById("kpi-detail-summary");
    const extra = document.getElementById("kpi-detail-extra");
    if (summary) summary.innerHTML = `<p class="kpi-detail-loading"><i class="fas fa-spinner fa-spin"></i> Cargando causas…</p>`;
    if (extra) extra.innerHTML = "";

    // Oculta charts genéricos; muestra gráfico de causas en extra
    showChartsInDock(false);

    const causas = await apiGet("/api/causas", {
      departamento: state.departamento,
      ambito: state.ambito || "acr",
      acr: state.acrs.length ? state.acrs : undefined,
    });
    const data = (causas.data || [])
      .filter((c) => c.Area_Ha > 0)
      .sort((a, b) => Number(b.Area_Ha) - Number(a.Area_Ha));

    if (!data.length) {
      if (summary) summary.innerHTML = `<p class="kpi-detail-empty">Sin datos de causas para los filtros.</p>`;
      return;
    }

    if (summary) {
      summary.innerHTML = `<p class="kpi-detail-lead">Causas antrópicas ordenadas por área (ha) según filtros activos.</p>`;
    }
    if (extra) {
      extra.innerHTML = `<div id="kpi-inline-causas" style="height:${Math.max(320, 34 * data.length + 80)}px"></div>`;
      const labels = data.map((d) => d.Causa).reverse();
      const values = data.map((d) => d.Area_Ha).reverse();
      const colors = ["#006D5B", "#1a4d2e", "#66c2a5", "#2e8b57", "#8fbc8f", "#3d9970"];
      Plotly.newPlot(
        "kpi-inline-causas",
        [
          {
            y: labels,
            x: values,
            type: "bar",
            orientation: "h",
            marker: {
              color: values.map((_, i) => colors[i % colors.length]),
              opacity: 0.92,
            },
            text: values.map((v) => Number(v).toLocaleString("es-PE", { maximumFractionDigits: 1 })),
            textposition: "outside",
            cliponaxis: false,
          },
        ],
        {
          paper_bgcolor: "#fff",
          plot_bgcolor: "#fbfcfd",
          margin: { l: 160, r: 56, t: 16, b: 40 },
          xaxis: { title: "Hectáreas (ha)", gridcolor: "#edf2f7" },
          yaxis: { automargin: true },
          font: { family: "Segoe UI, Arial, sans-serif", size: 12, color: "#2c3e50" },
        },
        { responsive: true, displayModeBar: false }
      );
    }
  }

  function bind(state) {
    Modals._state = state;
    if (bound) return;
    bound = true;

    document.getElementById("kpi-detail-close")?.addEventListener("click", (e) => {
      e.preventDefault();
      closeDock();
    });

    document.querySelectorAll(".kpi-trigger").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const st = Modals._state || state;
        const key = btn.dataset.kpi;
        if (key === "hectareas") openHectareas(st);
        else if (key === "causa") openCausas(st);
        else if (key === "antropico") openAntropico(st);
        else if (key === "variacion") openVariacion(st);
      });
    });
  }

  const REGION_MODALS = {
    loreto: {
      title: "LORETO - Frentes Activos de Deforestación",
      titleStyle:
        "background:linear-gradient(135deg,#f1c40f,#f39c12);color:#fff;padding:12px;border-radius:6px;margin:-8px -8px 16px",
      stats: [
        ["8,500+", "Hectáreas deforestadas", "#fff3cd", "#f39c12"],
        ["+18.6%", "Incremento última década", "#ffe8e8", "#e74c3c"],
        ["4", "ACRs bajo presión", "#e8f5e9", "#27ae60"],
      ],
      body: `<h4 style="color:#1a4d2e"><i class="fas fa-chart-bar"></i> Análisis Detallado</h4>
        <div class="modal-region-block" style="border-color:#f39c12">
          <h5><i class="fas fa-map-pin" style="color:#e74c3c"></i> Zona Crítica: Corredor Iquitos-Nauta</h5>
          <p>El corredor Iquitos-Nauta concentra el <strong>mayor número de alertas de deforestación</strong> en la región Loreto.</p>
        </div>`,
    },
    sanmartin: {
      title: "SAN MARTÍN - Presión en Bordes de ACRs",
      titleStyle:
        "background:linear-gradient(135deg,#f8c471,#f39c12);color:#fff;padding:12px;border-radius:6px;margin:-8px -8px 16px",
      stats: [
        ["260+", "Ha afectadas por incendios 2023", "#ffe8e8", "#e74c3c"],
        ["40%", "Expansión urbana (causa principal)", "#f5f5f5", "#7f8c8d"],
      ],
      body: `<h4 style="color:#1a4d2e"><i class="fas fa-chart-bar"></i> Análisis Detallado</h4>
        <p>San Martín experimenta presión sobre sus ACRs desde 2018, particularmente en Cordillera Escalera.</p>`,
    },
    cusco: {
      title: "CUSCO - Reducción de Deforestación",
      titleStyle:
        "background:linear-gradient(135deg,#5cb85c,#4cae4c);color:#fff;padding:12px;border-radius:6px;margin:-8px -8px 16px",
      stats: [
        ["-15%", "Reducción desde 2020", "#e8f5e9", "#27ae60"],
        ["3", "ACRs monitoreadas", "#f3e5f5", "#8e44ad"],
      ],
      body: `<h4 style="color:#1a4d2e"><i class="fas fa-chart-bar"></i> Análisis Detallado</h4>
        <p>Cusco muestra una reducción del 15% en deforestación desde 2020.</p>`,
    },
  };

  function showRegion(region) {
    const dynamic = typeof RegionInsights !== "undefined" ? RegionInsights.getModal(region) : null;
    const r = dynamic || REGION_MODALS[region];
    if (!r) return;
    const statsHtml = `<div class="modal-region-stats">${r.stats
      .map(
        ([n, l, bg, border]) =>
          `<div style="background:${bg};border-left:4px solid ${border};padding:16px;border-radius:8px;text-align:center">
            <h2 style="margin:0;font-weight:800;color:${border}">${n}</h2>
            <p style="margin:5px 0 0;font-size:13px;color:#666;font-weight:600">${l}</p>
          </div>`
      )
      .join("")}</div>`;
    show(
      `<div style="${r.titleStyle}"><i class="fas fa-map"></i> <strong>${r.title}</strong></div>
      ${statsHtml}<hr style="margin:20px 0"/>${r.body}`
    );
  }

  function bindRegionCards() {
    document.querySelectorAll(".region-link").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        showRegion(btn.dataset.region);
      });
    });
  }

  return {
    bind,
    bindRegionCards,
    close,
    closeDock,
    show,
    showMap,
    showInformeCatalogo,
    showRegion,
    getActiveKpi: () => activeKpi,
  };
})();
