/* Tendencias — mod_prediccion.R */
const Tendencias = (() => {
  const ACR_OPTS = {
    LORETO: {
      "ACR Ampiyacu Apayacu": "ACR_AA",
      "ACR Alto Nanay": "ACR_ANPCH",
      "ACR Maijuna Kichwa": "ACR_MK",
      "ACR Tamshiyacu Tahuayo": "ACR_CTT",
    },
    "SAN MARTÍN": { "ACR Bosques de Shunté": "ACR_BSM", "ACR Cordillera Escalera": "ACR_CE" },
    CUSCO: {
      "ACR Choquequirao": "ACR_CHQ",
      "ACR Chuyapi Urusayhua": "ACR_CHU",
      "ACR Q'eros Kosñipata": "ACR_QK",
    },
  };

  function init() {
    const sel = document.getElementById("tend-acr");
    if (!sel) return;
    sel.innerHTML = "";
    Object.entries(ACR_OPTS).forEach(([g, items]) => {
      const og = document.createElement("optgroup");
      og.label = g;
      Object.entries(items).forEach(([label, code]) => {
        const o = document.createElement("option");
        o.value = code;
        o.textContent = String(label).replace(/^ACR\s+/i, "");
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    if (!sel.value && sel.options.length) sel.selectedIndex = 0;

    document.getElementById("tend-tipo")?.addEventListener("change", toggleAcrPanel);
    document.getElementById("btn-analizar-tend")?.addEventListener("click", generarAnalisis);
    document.getElementById("tend-anio-min")?.addEventListener("input", syncRange);
    document.getElementById("tend-anio-max")?.addEventListener("input", syncRange);
    toggleAcrPanel();
  }

  function toggleAcrPanel() {
    const tipo = document.getElementById("tend-tipo").value;
    const panel = document.getElementById("tend-acr-panel");
    // Solo se elige ACR en modo individual; comparativa usa las 9 ACR
    panel.classList.toggle("hidden", tipo !== "individual");
  }

  function syncRange() {
    const min = +document.getElementById("tend-anio-min").value;
    const max = +document.getElementById("tend-anio-max").value;
    document.getElementById("tend-rango-label").textContent = `${min} – ${max}`;
  }

  function getSelectedAcrs() {
    const v = document.getElementById("tend-acr")?.value;
    return v ? [v] : [];
  }

  async function generarAnalisis() {
    const tipo = document.getElementById("tend-tipo").value;
    const acrs = getSelectedAcrs();
    let anioMin = +document.getElementById("tend-anio-min").value;
    let anioMax = +document.getElementById("tend-anio-max").value;
    if (anioMin > anioMax) [anioMin, anioMax] = [anioMax, anioMin];
    const tend = document.getElementById("tend-mostrar-linea").checked;

    if (tipo === "individual" && !acrs.length) {
      alert("Seleccione una ACR para este tipo de análisis.");
      return;
    }
    if (tipo === "comparativa") {
      // Compara todas las ACR del programa (Loreto, San Martín, Cusco)
      acrs.length = 0;
      Object.values(ACR_OPTS).forEach((items) => {
        Object.values(items).forEach((code) => acrs.push(code));
      });
    }

    const btn = document.getElementById("btn-analizar-tend");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';

    try {
      const data = await apiGet("/api/tendencias/analisis", {
        tipo_analisis: tipo,
        acr: acrs.length ? acrs : undefined,
        anio_min: anioMin,
        anio_max: anioMax,
        mostrar_tendencia: tend,
      });

      document.getElementById("tend-welcome").classList.add("hidden");
      document.getElementById("tend-chart-panel").classList.remove("hidden");
      renderChart(data);
    } catch (err) {
      console.error(err);
      alert("No se pudo generar el análisis. Verifique que el servidor esté activo (iniciar.bat).");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-search"></i> Generar Análisis';
    }
  }

  function renderChart(data) {
    const traces = [];
    (data.series || []).forEach((s) => {
      traces.push({
        x: s.points.map((p) => p.Anio),
        y: s.points.map((p) => p.Deforestacion_ha),
        name: s.name,
        type: "scatter",
        mode: "lines+markers",
        line: { color: s.color, width: tipoLineWidth(data.tipo) },
        marker: { size: 8, color: s.color },
        text: s.points.map((p) => p.hover),
        hovertemplate: "%{text}<extra></extra>",
      });
      if (s.tendencia) {
        traces.push({
          x: s.tendencia.map((p) => p.Anio),
          y: s.tendencia.map((p) => p.valor),
          name: "Tendencia",
          type: "scatter",
          mode: "lines",
          line: { color: "#d9534f", width: 2, dash: "dash" },
        });
      }
    });

    Plotly.newPlot(
      "chart-tendencias-full",
      traces,
      {
        title: { text: data.titulo || "Tendencias", font: { size: 16 } },
        xaxis: { title: "Año", dtick: 2 },
        yaxis: { title: "Deforestación (ha)" },
        legend: { orientation: "h", y: -0.15 },
        hovermode: "x unified",
        margin: { t: 50, b: 90, l: 60, r: 30 },
        height: 400,
      },
      { responsive: true }
    );
  }

  function tipoLineWidth(tipo) {
    return tipo === "comparativa" ? 2.5 : 3;
  }

  return { init, generarAnalisis };
})();
