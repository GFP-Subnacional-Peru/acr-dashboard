/* Tendencias — mod_prediccion.R */
const Tendencias = (() => {
  const ACR_OPTS = {
    LORETO: {
      "Ampiyacu Apayacu": "ACR_AA",
      "Alto Nanay – Pintuyacu Chambira": "ACR_ANPCH",
      "Maijuna Kichwa": "ACR_MK",
      "Comunal Tamshiyacu Tahuayo": "ACR_CTT",
    },
    "SAN MARTÍN": {
      "Bosques de Shunté y Mishollo": "ACR_BSM",
      "Cordillera Escalera": "ACR_CE",
    },
    CUSCO: {
      Choquequirao: "ACR_CHQ",
      "Chuyapi Urusayhua": "ACR_CHU",
      "Q'eros Kosñipata": "ACR_QK",
    },
  };

  const SCI_PALETTE = [
    "#0B6E4F",
    "#1B4F72",
    "#B9770E",
    "#6C3483",
    "#148F77",
    "#C0392B",
    "#2471A3",
    "#1E8449",
    "#D35400",
  ];

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
        o.textContent = label;
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

  function seriesColor(s, i) {
    return s.color || SCI_PALETTE[i % SCI_PALETTE.length];
  }

  function renderChart(data) {
    const traces = [];
    (data.series || []).forEach((s, i) => {
      const color = seriesColor(s, i);
      const isSingle = (data.series || []).length === 1;
      traces.push({
        x: s.points.map((p) => p.Anio),
        y: s.points.map((p) => p.Deforestacion_ha),
        name: s.name,
        type: "scatter",
        mode: "lines+markers",
        line: {
          color,
          width: isSingle ? 3.2 : 2.4,
          shape: "spline",
          smoothing: 0.55,
        },
        marker: {
          size: isSingle ? 8 : 6,
          color,
          line: { color: "#ffffff", width: 1.2 },
        },
        fill: isSingle ? "tozeroy" : "none",
        fillcolor: isSingle ? "rgba(11, 110, 79, 0.12)" : undefined,
        text: s.points.map((p) => p.hover),
        hovertemplate: "%{text}<extra></extra>",
      });
      if (s.tendencia) {
        traces.push({
          x: s.tendencia.map((p) => p.Anio),
          y: s.tendencia.map((p) => p.valor),
          name: "Tendencia lineal",
          type: "scatter",
          mode: "lines",
          line: { color: "#C0392B", width: 2.2, dash: "dot" },
          hovertemplate: "<b>Tendencia</b>: %{y:.1f} ha<extra></extra>",
        });
      }
    });

    Plotly.newPlot(
      "chart-tendencias-full",
      traces,
      {
        title: {
          text: data.titulo || "Tendencias de deforestación",
          font: { size: 15, color: "#0f172a", family: "Segoe UI, Helvetica, Arial, sans-serif" },
          x: 0.02,
          xanchor: "left",
        },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "#f8fafc",
        font: { family: "Segoe UI, Helvetica, Arial, sans-serif", size: 12, color: "#334155" },
        xaxis: {
          title: { text: "Año", font: { size: 12, color: "#475569" } },
          dtick: 2,
          gridcolor: "#e2e8f0",
          zeroline: false,
          showline: true,
          linecolor: "#cbd5e1",
          tickfont: { color: "#64748b" },
        },
        yaxis: {
          title: { text: "Deforestación (ha)", font: { size: 12, color: "#475569" } },
          gridcolor: "#e2e8f0",
          zerolinecolor: "#cbd5e1",
          showline: true,
          linecolor: "#cbd5e1",
          tickfont: { color: "#64748b" },
          separatethousands: true,
        },
        legend: {
          orientation: "h",
          y: -0.18,
          x: 0,
          bgcolor: "rgba(255,255,255,0.7)",
          bordercolor: "#e2e8f0",
          borderwidth: 1,
          font: { size: 11 },
        },
        hovermode: "x unified",
        hoverlabel: {
          bgcolor: "#0f172a",
          bordercolor: "#0f172a",
          font: { color: "#f8fafc", size: 12 },
        },
        margin: { t: 56, b: 96, l: 64, r: 28 },
        height: 440,
      },
      { responsive: true, displayModeBar: false, staticPlot: false }
    );
  }

  return { init, generarAnalisis };
})();
