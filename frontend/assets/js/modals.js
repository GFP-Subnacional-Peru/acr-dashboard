/* Modales KPI — server.R observeEvent btn_kpi_* */
const Modals = (() => {
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

  async function openHectareas(state) {
    const params = {
      departamento: state.departamento,
      ambito: state.ambito || "acr",
      acr: state.acrs.length ? state.acrs : undefined,
    };
    let tipoMeta = "acr";
    if (state.ambito === "zi") tipoMeta = "zi";
    else if (state.ambito === "ambos") tipoMeta = "acr";
    const rows = await apiGet("/api/metadata/acrs", {
      departamento: state.departamento,
      tipo: tipoMeta,
      acr: params.acr,
    });
    const data = rows.data || [];
    const total = data.reduce((s, r) => s + (r.Total || 0), 0);
    const ant = data.reduce((s, r) => s + (r.Antropico || 0), 0);
    const nat = data.reduce((s, r) => s + (r.Perdida_natural || 0), 0);

    let table = "<p>No hay datos</p>";
    if (data.length) {
      table = `<table class="data-table"><thead><tr>
        <th>ACR</th><th>Total (ha)</th><th>Antrópico</th><th>Natural</th></tr></thead><tbody>`;
      data.sort((a, b) => b.Total - a.Total).forEach((r) => {
        table += `<tr><td>${r.Nombre}</td><td>${fmt(r.Total)}</td>
          <td>${fmt(r.Antropico)}</td><td>${fmt(r.Perdida_natural)}</td></tr>`;
      });
      table += "</tbody></table>";
    }

    show(`<h3><i class="fas fa-tree"></i> Detalles de Deforestación</h3>
      <div class="kpi-modal-grid">
        <div class="kpi-mini" style="border-color:#d9534f"><h2>${fmt(total)}</h2><span>TOTAL HA</span></div>
        <div class="kpi-mini" style="border-color:#f39c12"><h2>${fmt(ant)}</h2><span>ANTRÓPICO</span></div>
        <div class="kpi-mini" style="border-color:#5cb85c"><h2>${fmt(nat)}</h2><span>NATURAL</span></div>
      </div>
      <h4>Distribución por ACR:</h4>${table}`);
  }

  async function openCausas(state) {
    const causas = await apiGet("/api/causas", {
      departamento: state.departamento,
      ambito: state.ambito || "acr",
      acr: state.acrs.length ? state.acrs : undefined,
    });
    const data = (causas.data || [])
      .filter((c) => c.Area_Ha > 0)
      .sort((a, b) => Number(b.Area_Ha) - Number(a.Area_Ha));
    if (!data.length) {
      show("<h3><i class=\"fas fa-tractor\"></i> Causas Antrópicas</h3><p>Sin datos para los filtros.</p>");
      return;
    }
    const labels = data.map((d) => d.Causa).reverse();
    const values = data.map((d) => d.Area_Ha).reverse();
    show(`<h3><i class="fas fa-tractor"></i> Causas Antrópicas de Deforestación</h3>
      <div id="modal-chart-causas" style="height:${Math.max(420, 34 * data.length + 100)}px"></div>`);
    Plotly.newPlot(
      "modal-chart-causas",
      [
        {
          y: labels,
          x: values,
          type: "bar",
          orientation: "h",
          marker: { color: "#1a7a5c" },
          text: values.map((v) => Number(v).toLocaleString("es-PE", { maximumFractionDigits: 1 })),
          textposition: "outside",
          cliponaxis: false,
        },
      ],
      { margin: { l: 180, r: 56, t: 24, b: 48 }, xaxis: { title: "Hectáreas" }, yaxis: { automargin: true } },
      { responsive: true }
    );
  }

  function bind(state) {
    document.getElementById("kpi-hectareas")?.addEventListener("click", () => openHectareas(state));
    document.getElementById("kpi-causa")?.addEventListener("click", () => openCausas(state));
  }

  const REGION_MODALS = {
    loreto: {
      title: "LORETO - Frentes Activos de Deforestación",
      titleStyle: "background:linear-gradient(135deg,#f1c40f,#f39c12);color:#fff;padding:12px;border-radius:6px;margin:-8px -8px 16px",
      stats: [
        ["8,500+", "Hectáreas deforestadas", "#fff3cd", "#f39c12"],
        ["+18.6%", "Incremento última década", "#ffe8e8", "#e74c3c"],
        ["4", "ACRs bajo presión", "#e8f5e9", "#27ae60"],
      ],
      body: `<h4 style="color:#1a4d2e"><i class="fas fa-chart-bar"></i> Análisis Detallado</h4>
        <div class="modal-region-block" style="border-color:#f39c12">
          <h5><i class="fas fa-map-pin" style="color:#e74c3c"></i> Zona Crítica: Corredor Iquitos-Nauta</h5>
          <p>El corredor Iquitos-Nauta concentra el <strong>mayor número de alertas de deforestación</strong> en la región Loreto, con más de <strong>8,500 hectáreas</strong> afectadas en la última década.</p>
          <ul><li><strong>Agricultura migratoria:</strong> Ciclos de cultivo de 3-5 años con técnica de roce y quema</li>
          <li><strong>Accesibilidad:</strong> Carretera facilita el ingreso a áreas forestales</li>
          <li><strong>Presión demográfica:</strong> Crecimiento poblacional en comunidades cercanas</li></ul>
        </div>
        <div class="modal-region-block" style="border-color:#f39c12;background:#fff3e0">
          <h5><i class="fas fa-exclamation-triangle" style="color:#f39c12"></i> ACRs Afectadas</h5>
          <ol><li><strong>ACR Ampiyacu Apayacu:</strong> Alta presión en zona de amortiguamiento</li>
          <li><strong>ACR Alto Nanay – Pintuyacu Chambira:</strong> Incremento en límites norte</li>
          <li><strong>ACR Maijuna Kichwa:</strong> Deforestación dispersa en todo el territorio</li>
          <li><strong>ACR Comunal Tamshiyacu Tahuayo:</strong> Presión moderada pero constante</li></ol>
        </div>`,
    },
    sanmartin: {
      title: "SAN MARTÍN - Presión en Bordes de ACRs",
      titleStyle: "background:linear-gradient(135deg,#f8c471,#f39c12);color:#fff;padding:12px;border-radius:6px;margin:-8px -8px 16px",
      stats: [
        ["260+", "Ha afectadas por incendios 2023", "#ffe8e8", "#e74c3c"],
        ["40%", "Expansión urbana (causa principal)", "#f5f5f5", "#7f8c8d"],
        ["35%", "Cultivos permanentes (café)", "#fff3e0", "#e67e22"],
      ],
      body: `<h4 style="color:#1a4d2e"><i class="fas fa-chart-bar"></i> Análisis Detallado</h4>
        <div class="modal-region-block" style="border-color:#f8c471">
          <h5><i class="fas fa-city" style="color:#95a5a6"></i> Dinámica Post-2018</h5>
          <p>San Martín experimenta un <strong>incremento notable en la presión sobre sus ACRs desde 2018</strong>, particularmente en <strong>ACR Cordillera Escalera</strong>.</p>
          <ul><li><strong>Mejoras viales:</strong> Nueva infraestructura facilita acceso a zonas forestales</li>
          <li><strong>Crecimiento urbano:</strong> Expansión de Moyobamba, Rioja y Nueva Cajamarca</li>
          <li><strong>Boom cafetalero:</strong> Incremento en cultivos permanentes de café</li></ul>
        </div>
        <div class="modal-region-block" style="border-color:#e74c3c;background:#ffebee">
          <h5><i class="fas fa-fire" style="color:#e74c3c"></i> Incendios Forestales 2023</h5>
          <p>El año 2023 fue particularmente crítico con <strong>más de 260 hectáreas afectadas por incendios forestales</strong> en y alrededor de las ACRs.</p>
        </div>`,
    },
    cusco: {
      title: "CUSCO - Reducción de Deforestación",
      titleStyle: "background:linear-gradient(135deg,#5cb85c,#4cae4c);color:#fff;padding:12px;border-radius:6px;margin:-8px -8px 16px",
      stats: [
        ["-15%", "Reducción desde 2020", "#e8f5e9", "#27ae60"],
        ["&lt; 2 ha", "Parches promedio", "#e1f5fe", "#2196f3"],
        ["3", "ACRs monitoreadas", "#f3e5f5", "#8e44ad"],
      ],
      body: `<h4 style="color:#1a4d2e"><i class="fas fa-chart-bar"></i> Análisis Detallado</h4>
        <div class="modal-region-block" style="border-color:#27ae60;background:#e8f5e9">
          <h5><i class="fas fa-chart-line" style="color:#27ae60"></i> Tendencia Positiva</h5>
          <p>Cusco muestra una <strong>reducción del 15% en deforestación desde 2020</strong>, con parches pequeños (0.5-2 ha) en valles cultivados y baja presión comparada con selva baja.</p>
        </div>
        <div class="modal-region-block" style="border-color:#f39c12;background:#fff3e0">
          <h5><i class="fas fa-award" style="color:#f39c12"></i> Factores de Éxito</h5>
          <ol><li><strong>Gobernanza participativa:</strong> Involucramiento activo de comunidades</li>
          <li><strong>Conocimiento ancestral:</strong> Respeto por prácticas tradicionales</li>
          <li><strong>Monitoreo constante:</strong> Sistema de alertas tempranas funcional</li></ol>
        </div>`,
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

  return { bind, bindRegionCards, close, show, showMap, showInformeCatalogo, showRegion };
})();
