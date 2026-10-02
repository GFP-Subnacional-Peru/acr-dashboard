/* Modales KPI — ventana flotante moderna */
const Modals = (() => {
  let listenersReady = false;
  let chartHost = null;

  function ensureModalRoot() {
    let el = document.getElementById("modal-root");
    if (!el) {
      el = document.createElement("div");
      el.id = "modal-root";
      document.body.appendChild(el);
    }
    return el;
  }

  function ensureChartHost() {
    if (chartHost && document.body.contains(chartHost)) return chartHost;
    chartHost = document.getElementById("kpi-chart-host");
    if (!chartHost) {
      chartHost = document.createElement("div");
      chartHost.id = "kpi-chart-host";
      chartHost.className = "hidden";
      chartHost.setAttribute("aria-hidden", "true");
      document.body.appendChild(chartHost);
    }
    ["charts-nacional", "charts-individual", "charts-comparativa"].forEach((id) => {
      const node = document.getElementById(id);
      if (node && node.parentElement !== chartHost) chartHost.appendChild(node);
    });
    return chartHost;
  }

  function parkCharts() {
    const host = ensureChartHost();
    ["charts-nacional", "charts-individual", "charts-comparativa"].forEach((id) => {
      const node = document.getElementById(id);
      if (node && node.parentElement !== host) host.appendChild(node);
    });
    // Restaurar bloques ocultos en modal de hectáreas
    document.querySelectorAll("#charts-individual .chart-block").forEach((el) => el.classList.remove("hidden"));
    document.getElementById("chart-distribucion")?.closest(".chart-block")?.classList.add("chart-block--wide");
  }

  function close() {
    parkCharts();
    const root = document.getElementById("modal-root");
    if (root) root.innerHTML = "";
    document.body.classList.remove("kpi-modal-open");
    document.querySelectorAll(".kpi-trigger").forEach((btn) => {
      btn.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    });
  }

  function openKpiFromButton(btn) {
    const st = Modals._state || window.state || null;
    if (!st || !btn) return;
    const key = btn.dataset.kpi;
    if (key === "hectareas") openHectareas(st);
    else if (key === "causa") openCausas(st);
    else if (key === "antropico") openAntropico(st);
    else if (key === "variacion") openVariacion(st);
  }

  function ensureListeners() {
    if (listenersReady) return;
    listenersReady = true;
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const root = document.getElementById("modal-root");
      if (root && root.innerHTML.trim()) close();
    });
    // Delegación: sobrevive refrescos y evita el bug de "bound" prematuro
    document.addEventListener("click", (e) => {
      const btn = e.target.closest?.(".kpi-trigger");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      openKpiFromButton(btn);
    });
  }

  ensureListeners();

  function showFloating(titleHtml, bodyHtml, opts = {}) {
    parkCharts();
    const root = ensureModalRoot();
    const wide = opts.wide ? " modal-dialog--kpi" : "";
    root.innerHTML = `<div class="modal-overlay kpi-modal-overlay" id="modal-overlay" role="dialog" aria-modal="true">
      <div class="modal-dialog${wide}">
        <div class="kpi-modal-top">
          <h3 class="kpi-modal-title">${titleHtml}</h3>
          <button type="button" class="kpi-detail-close" id="modal-x" title="Cerrar" aria-label="Cerrar">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="kpi-modal-body" id="kpi-modal-body">${bodyHtml}</div>
        <div id="kpi-modal-charts" class="kpi-modal-charts"></div>
        <button type="button" class="btn btn-block kpi-modal-cerrar" id="modal-close">Cerrar</button>
      </div>
    </div>`;
    document.body.classList.add("kpi-modal-open");
    document.getElementById("modal-close").onclick = close;
    document.getElementById("modal-x").onclick = close;
    document.getElementById("modal-overlay").onclick = (e) => {
      if (e.target.id === "modal-overlay") close();
    };
    return root;
  }

  function attachChartsToModal() {
    const slot = document.getElementById("kpi-modal-charts");
    if (!slot) return;
    const ind = document.getElementById("charts-individual");
    const comp = document.getElementById("charts-comparativa");
    const nac = document.getElementById("charts-nacional");
    const hasInd = ind && !ind.classList.contains("hidden");
    const hasComp = comp && !comp.classList.contains("hidden");
    if (hasInd) {
      nac?.classList.add("hidden");
      slot.appendChild(ind);
      ind.classList.remove("hidden");
    } else if (hasComp) {
      nac?.classList.add("hidden");
      slot.appendChild(comp);
      comp.classList.remove("hidden");
    } else if (nac) {
      slot.appendChild(nac);
      nac.classList.remove("hidden");
    }
    setTimeout(() => {
      try {
        window.dispatchEvent(new Event("resize"));
        if (typeof Plotly !== "undefined") {
          ["chart-composicion", "chart-causas", "chart-distribucion", "chart-comparativa"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) Plotly.Plots.resize(el);
          });
        }
      } catch (_) {}
    }, 180);
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
    ];
    const links = items
      .map((i) => `<li><a href="${i.u}" target="_blank" style="color:#006D5B;font-weight:600">${i.t}</a></li>`)
      .join("");
    show(`<h3><i class="fas fa-file-pdf"></i> Informes y mapas PDF</h3>
      <p style="color:#666;line-height:1.7">Use los botones <strong>PDF</strong> en cada tarjeta o los enlaces siguientes:</p>
      <ul style="line-height:2">${links}</ul>`);
  }

  async function openHectareas(state) {
    document.querySelectorAll(".kpi-trigger").forEach((b) => {
      const on = b.dataset.kpi === "hectareas";
      b.classList.toggle("is-open", on);
      b.setAttribute("aria-expanded", on ? "true" : "false");
    });

    const periodo = `${state.annoDesde}–${state.annoHasta}`;
    showFloating(
      `<i class="fas fa-tree"></i> Detalles de deforestación <span class="kpi-modal-period">· ${periodo}</span>`,
      '<p class="kpi-detail-loading"><i class="fas fa-spinner fa-spin"></i> Cargando detalle del período…</p>',
      { wide: true }
    );

    const baseParams = {
      departamento: state.departamento,
      ambito: state.ambito || "ambos",
      acr: state.acrs.length ? state.acrs : undefined,
      anno_desde: state.annoDesde,
      anno_hasta: state.annoHasta,
    };
    let tipoMeta =
      state.ambito === "zi" ? "zi" : state.ambito === "acr" ? "acr" : "ambos";

    let rowsRes;
    let graf;
    try {
      [rowsRes, graf] = await Promise.all([
        apiGet("/api/metadata/acrs", {
          departamento: state.departamento,
          tipo: tipoMeta,
          acr: state.acrs.length ? state.acrs : undefined,
          anno_desde: state.annoDesde,
          anno_hasta: state.annoHasta,
        }),
        state.acrs.length
          ? apiGet("/api/graficos", baseParams).catch(() => null)
          : Promise.resolve(null),
      ]);
    } catch (err) {
      console.warn("Modal hectáreas:", err);
      const bodyErr = document.getElementById("kpi-modal-body");
      if (bodyErr) {
        bodyErr.innerHTML =
          "<p class='kpi-detail-empty'>No se pudo cargar el detalle. Revise la conexión e intente de nuevo.</p>";
      }
      return;
    }

    if (graf && typeof renderCharts === "function") {
      renderCharts(graf);
      // Pérdida de bosque: quitar barras de composición; pie ocupa ese espacio
      document.getElementById("chart-composicion")?.closest(".chart-block")?.classList.add("hidden");
      const pieBlock = document.getElementById("chart-distribucion")?.closest(".chart-block");
      const causasBlock = document.getElementById("chart-causas")?.closest(".chart-block");
      const stack = document.querySelector("#charts-individual .charts-stack");
      if (pieBlock) {
        pieBlock.classList.remove("chart-block--wide");
        pieBlock.classList.remove("hidden");
        if (stack && causasBlock) stack.insertBefore(pieBlock, causasBlock);
      }
    }

    const data = rowsRes.data || [];
    const total = data.reduce((s, r) => s + (Number(r.Total) || 0), 0);
    const ant = data.reduce((s, r) => s + (Number(r.Antropico) || 0), 0);
    const nat = data.reduce((s, r) => s + (Number(r.Perdida_natural) || 0), 0);

    // Tabla por ACR solo si hay más de una (evita repetir el resumen)
    let table = "";
    if (data.length > 1) {
      table = `<h4 class="kpi-detail-table-title"><i class="fas fa-table"></i> Distribución por ACR · ${periodo}</h4>
        <div class="kpi-detail-table-wrap"><table class="data-table"><thead><tr>
        <th>ACR</th><th>Total (ha)</th><th>Antrópico</th><th>Natural</th></tr></thead><tbody>`;
      data
        .slice()
        .sort((a, b) => (Number(b.Total) || 0) - (Number(a.Total) || 0))
        .forEach((r) => {
          table += `<tr><td>${r.Nombre}</td><td>${fmt2(r.Total)}</td>
            <td>${fmt2(r.Antropico)}</td><td>${fmt2(r.Perdida_natural)}</td></tr>`;
        });
      table += "</tbody></table></div>";
    } else if (!data.length) {
      table = "<p class='kpi-detail-empty'>No hay datos para el período y filtros actuales.</p>";
    }

    const body = document.getElementById("kpi-modal-body");
    if (body) {
      body.innerHTML = `<div class="kpi-modal-grid">
        <div class="kpi-mini kpi-mini--total"><h2>${fmt2(total)}</h2><span>TOTAL HA</span></div>
        <div class="kpi-mini kpi-mini--ant"><h2>${fmt2(ant)}</h2><span>ANTRÓPICO</span></div>
        <div class="kpi-mini kpi-mini--nat"><h2>${fmt2(nat)}</h2><span>NATURAL</span></div>
      </div>${table}`;
    }
    attachChartsToModal();
  }

  function plotSerieLine(elId, years, values, opts = {}) {
    const color = opts.color || "#0B6E4F";
    const name = opts.name || "ha";
    Plotly.newPlot(
      elId,
      [
        {
          x: years,
          y: values,
          type: "scatter",
          mode: "lines+markers",
          name,
          line: { color, width: 2.5, shape: "spline" },
          marker: { size: 7, color },
          fill: opts.fill ? "tozeroy" : undefined,
          fillcolor: opts.fillColor || "rgba(11,110,79,0.12)",
          hovertemplate: "<b>%{x}</b><br>%{y:,.2f} ha<extra></extra>",
        },
      ],
      {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(248,250,252,0.65)",
        margin: { t: 28, b: 44, l: 56, r: 20 },
        height: opts.height || 320,
        xaxis: { title: "Año", gridcolor: "rgba(226,232,240,0.9)", zeroline: false },
        yaxis: { title: "Hectáreas (ha)", gridcolor: "rgba(226,232,240,0.9)", zeroline: false },
        font: { family: "Segoe UI, Arial, sans-serif", size: 12, color: "#334155" },
        showlegend: false,
      },
      { responsive: true, displayModeBar: false }
    );
  }

  async function openVariacion(state) {
    const periodo = `${state.annoDesde}–${state.annoHasta}`;
    const box = document.getElementById("kpi-variacion");
    const num = box?.querySelector(".number")?.textContent || "—";
    const sub = box?.querySelector(".sub-text")?.textContent || "";
    showFloating(
      `<i class="fas fa-chart-bar"></i> Variación anual <span class="kpi-modal-period">· ${periodo}</span>`,
      '<p class="kpi-detail-loading"><i class="fas fa-spinner fa-spin"></i> Cargando serie del período…</p>',
      { wide: true }
    );

    const serieRes = await apiGet("/api/serie-anual", {
      departamento: state.departamento,
      ambito: state.ambito || "ambos",
      acr: state.acrs.length ? state.acrs : undefined,
      anno_desde: state.annoDesde,
      anno_hasta: state.annoHasta,
    }).catch(() => ({ serie: [] }));
    const rows = (serieRes.serie || []).slice().sort((a, b) => a.Anio - b.Anio);
    const years = rows.map((r) => r.Anio);
    const vals = rows.map((r) => Number(r.Deforestacion_ha) || 0);

    const body = document.getElementById("kpi-modal-body");
    if (body) {
      body.innerHTML = `<div class="kpi-modal-grid" style="grid-template-columns:1fr">
        <div class="kpi-mini kpi-mini--ant"><h2>${num}</h2><span>VARIACIÓN</span></div>
      </div>
      <p class="kpi-detail-lead">${sub || "Comparación respecto al año anterior."} Serie de pérdida anual en el período filtrado.</p>
      <div class="chart-block" style="margin-top:0.75rem">
        <h6><i class="fas fa-chart-line"></i> Pérdida anual (ha)</h6>
        <div id="modal-chart-variacion" style="height:320px"></div>
      </div>`;
    }
    if (years.length && typeof Plotly !== "undefined") {
      plotSerieLine("modal-chart-variacion", years, vals, {
        color: "#e67e22",
        fill: true,
        fillColor: "rgba(230,126,34,0.12)",
        name: "Pérdida anual",
      });
    } else if (body) {
      body.insertAdjacentHTML(
        "beforeend",
        `<p class="kpi-detail-empty">Sin serie anual para los filtros actuales.</p>`
      );
    }
  }

  async function openAntropico(state) {
    const periodo = `${state.annoDesde}–${state.annoHasta}`;
    const box = document.getElementById("kpi-porcentaje");
    const num = box?.querySelector(".number")?.textContent || "—";
    const sub = box?.querySelector(".sub")?.textContent || "";
    showFloating(
      `<i class="fas fa-chart-pie"></i> Origen antrópico <span class="kpi-modal-period">· ${periodo}</span>`,
      '<p class="kpi-detail-loading"><i class="fas fa-spinner fa-spin"></i> Cargando serie antrópica…</p>',
      { wide: true }
    );

    const serieRes = await apiGet("/api/serie-anual", {
      departamento: state.departamento,
      ambito: state.ambito || "ambos",
      acr: state.acrs.length ? state.acrs : undefined,
      anno_desde: state.annoDesde,
      anno_hasta: state.annoHasta,
    }).catch(() => ({ serie: [] }));
    const rows = (serieRes.serie || []).slice().sort((a, b) => a.Anio - b.Anio);
    const years = rows.map((r) => r.Anio);
    const antVals = rows.map((r) =>
      r.Antropico_ha != null ? Number(r.Antropico_ha) : Number(r.Deforestacion_ha) || 0
    );
    const natVals = rows.map((r) => (r.Natural_ha != null ? Number(r.Natural_ha) : null));
    const hasNat = natVals.some((v) => v != null);

    const body = document.getElementById("kpi-modal-body");
    if (body) {
      body.innerHTML = `<div class="kpi-modal-grid" style="grid-template-columns:1fr">
        <div class="kpi-mini kpi-mini--ant"><h2>${num}</h2><span>ANTRÓPICO</span></div>
      </div>
      <p class="kpi-detail-lead">${sub || ""} · evolución anual en ${periodo}.</p>
      <div class="chart-block" style="margin-top:0.75rem">
        <h6><i class="fas fa-chart-area"></i> Origen antrópico por año</h6>
        <div id="modal-chart-antropico" style="height:340px"></div>
      </div>`;
    }
    if (!years.length || typeof Plotly === "undefined") {
      if (body) {
        body.insertAdjacentHTML(
          "beforeend",
          `<p class="kpi-detail-empty">Sin serie anual para los filtros actuales.</p>`
        );
      }
      return;
    }
    const traces = [
      {
        x: years,
        y: antVals,
        type: "scatter",
        mode: "lines+markers",
        name: "Origen antrópico",
        line: { color: "#d9534f", width: 2.5 },
        marker: { size: 7, color: "#d9534f" },
        fill: "tozeroy",
        fillcolor: "rgba(217,83,79,0.12)",
        hovertemplate: "<b>%{x}</b><br>Antrópico: %{y:,.2f} ha<extra></extra>",
      },
    ];
    if (hasNat) {
      traces.push({
        x: years,
        y: natVals,
        type: "scatter",
        mode: "lines+markers",
        name: "Natural",
        line: { color: "#5cb85c", width: 2 },
        marker: { size: 6, color: "#5cb85c" },
        hovertemplate: "<b>%{x}</b><br>Natural: %{y:,.2f} ha<extra></extra>",
      });
    }
    Plotly.newPlot(
      "modal-chart-antropico",
      traces,
      {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(248,250,252,0.65)",
        margin: { t: 28, b: 44, l: 56, r: 20 },
        height: 340,
        xaxis: { title: "Año", gridcolor: "rgba(226,232,240,0.9)", zeroline: false },
        yaxis: { title: "Hectáreas (ha)", gridcolor: "rgba(226,232,240,0.9)", zeroline: false },
        legend: { orientation: "h", y: -0.18 },
        font: { family: "Segoe UI, Arial, sans-serif", size: 12, color: "#334155" },
      },
      { responsive: true, displayModeBar: false }
    );
  }

  async function openCausas(state) {
    const periodo = `${state.annoDesde}–${state.annoHasta}`;
    showFloating(
      `<i class="fas fa-cog"></i> Principal causa estimada <span class="kpi-modal-period">· ${periodo}</span>`,
      '<p class="kpi-detail-loading"><i class="fas fa-spinner fa-spin"></i> Cargando causas del período…</p>',
      { wide: true }
    );

    const causas = await apiGet("/api/causas", {
      departamento: state.departamento,
      ambito: state.ambito || "ambos",
      acr: state.acrs.length ? state.acrs : undefined,
      anno_desde: state.annoDesde,
      anno_hasta: state.annoHasta,
    });
    const data = (causas.data || [])
      .filter((c) => c.Area_Ha > 0)
      .sort((a, b) => Number(b.Area_Ha) - Number(a.Area_Ha));

    const body = document.getElementById("kpi-modal-body");
    if (!data.length) {
      if (body) body.innerHTML = `<p class="kpi-detail-empty">Sin datos de causas para el período ${periodo}.</p>`;
      return;
    }

    if (body) {
      body.innerHTML = `<p class="kpi-detail-lead">Causas antrópicas · período ${periodo}.</p>
        <div id="modal-chart-causas" style="height:${Math.max(360, 34 * data.length + 90)}px"></div>`;
    }

    const labels = data.map((d) => d.Causa).reverse();
    const values = data.map((d) => d.Area_Ha).reverse();
    const colors = ["#006D5B", "#1a4d2e", "#66c2a5", "#2e8b57", "#8fbc8f", "#3d9970"];
    Plotly.newPlot(
      "modal-chart-causas",
      [
        {
          y: labels,
          x: values,
          type: "bar",
          orientation: "h",
          marker: {
            color: values.map((_, i) => colors[i % colors.length]),
            opacity: 0.95,
            line: { width: 0 },
            cornerradius: 6,
          },
          text: values.map((v) => Number(v).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
          textposition: "outside",
          cliponaxis: false,
        },
      ],
      {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(248,250,252,0.65)",
        margin: { l: 160, r: 56, t: 12, b: 40 },
        xaxis: { title: "Hectáreas (ha)", gridcolor: "rgba(226,232,240,0.9)", zeroline: false },
        yaxis: { automargin: true },
        font: { family: "Segoe UI, Arial, sans-serif", size: 12, color: "#2c3e50" },
      },
      { responsive: true, displayModeBar: false }
    );
  }

  function bind(state) {
    Modals._state = state;
    ensureChartHost();
    ensureListeners();
  }

  function showRegion(region) {
    const dynamic = typeof RegionInsights !== "undefined" ? RegionInsights.getModal(region) : null;
    const r = dynamic;
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
    closeDock: close,
    show,
    showMap,
    showInformeCatalogo,
    showRegion,
    getActiveKpi: () => null,
  };
})();
