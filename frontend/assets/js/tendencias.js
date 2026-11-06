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
    "#C0392B",
    "#1A5276",
    "#B9770E",
    "#6C3483",
    "#117A65",
    "#E67E22",
    "#1C2833",
    "#1A7A4C",
    "#7B241C",
  ];
  const LINE_DASH = ["solid", "dash", "dot", "dashdot"];
  let lastData = null;

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
    document.getElementById("btn-reset-tend")?.addEventListener("click", restablecer);
    document.getElementById("tend-anio-min")?.addEventListener("input", syncRange);
    document.getElementById("tend-anio-max")?.addEventListener("input", syncRange);
    toggleAcrPanel();
    initDownloads();
  }

  function toggleAcrPanel() {
    const tipo = document.getElementById("tend-tipo").value;
    const panel = document.getElementById("tend-acr-panel");
    const sel = document.getElementById("tend-acr");
    const hint = document.getElementById("tend-acr-hint");
    const label = document.getElementById("tend-acr-label");
    const show = tipo === "individual" || tipo === "comparativa";
    panel?.classList.toggle("hidden", !show);
    if (sel) {
      sel.multiple = tipo === "comparativa";
      sel.size = tipo === "comparativa" ? 8 : 1;
      if (tipo === "individual" && sel.selectedOptions.length > 1) {
        const first = sel.selectedOptions[0]?.value;
        Array.from(sel.options).forEach((o) => {
          o.selected = o.value === first;
        });
      }
      if (tipo === "comparativa" && sel.selectedOptions.length < 2) {
        Array.from(sel.options).forEach((o, i) => {
          o.selected = i < 3;
        });
      }
    }
    if (label) {
      label.textContent = tipo === "comparativa" ? "Seleccionar ACR(s) a comparar:" : "Seleccionar ACR:";
    }
    if (hint) {
      hint.textContent =
        tipo === "comparativa"
          ? "Use Ctrl (Windows) o Cmd (Mac) para marcar varias ACR."
          : "Elija una ACR para el análisis individual.";
      hint.classList.toggle("hidden", !show);
    }
  }

  function syncRange() {
    const min = +document.getElementById("tend-anio-min").value;
    const max = +document.getElementById("tend-anio-max").value;
    document.getElementById("tend-rango-label").textContent = `${min} – ${max}`;
  }

  function restablecer() {
    document.getElementById("tend-tipo").value = "general";
    const sel = document.getElementById("tend-acr");
    if (sel) {
      sel.multiple = false;
      Array.from(sel.options).forEach((o, i) => {
        o.selected = i === 0;
      });
    }
    document.getElementById("tend-anio-min").value = 2001;
    document.getElementById("tend-anio-max").value = 2025;
    document.getElementById("tend-mostrar-linea").checked = true;
    syncRange();
    toggleAcrPanel();
    const chart = document.getElementById("chart-tendencias-full");
    if (chart && window.Plotly?.purge) Plotly.purge(chart);
    document.getElementById("tend-chart-panel")?.classList.add("hidden");
    document.getElementById("tend-welcome")?.classList.remove("hidden");
  }

  function getSelectedAcrs() {
    const sel = document.getElementById("tend-acr");
    if (!sel) return [];
    return Array.from(sel.selectedOptions)
      .map((o) => o.value)
      .filter(Boolean);
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
    if (tipo === "comparativa" && acrs.length < 2) {
      alert("Seleccione al menos 2 ACR para comparar.");
      return;
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
          width: isSingle ? 3.2 : 2.6,
          dash: LINE_DASH[i % LINE_DASH.length],
          shape: "linear",
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
          hovertemplate: "<b>Tendencia</b>: %{y:,.2f} ha<extra></extra>",
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
          dtick: 1,
          tickangle: -60,
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
        margin: { t: 56, b: 120, l: 64, r: 28 },
        height: 480,
      },
      {
        responsive: true,
        displayModeBar: false,
      }
    );
    const tools = document.getElementById("tend-tools");
    if (tools) tools.hidden = false;
    lastData = data;
  }

  function descargarCsv() {
    const data = lastData;
    if (!data?.series?.length) return;
    const years = [...new Set(data.series.flatMap((s) => s.points.map((p) => p.Anio)))].sort((a, b) => a - b);
    const header = ["Anio", ...data.series.map((s) => s.name)];
    const rows = years.map((y) => [
      y,
      ...data.series.map((s) => {
        const p = s.points.find((pt) => pt.Anio === y);
        return p ? p.Deforestacion_ha : "";
      }),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tendencia-deforestacion.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function initDownloads() {
    document.getElementById("tend-descargar-png")?.addEventListener("click", () => {
      const el = document.getElementById("chart-tendencias-full");
      if (el && typeof Plotly !== "undefined") {
        Plotly.downloadImage(el, { format: "png", filename: "tendencia-deforestacion", scale: 2 });
      }
    });
    document.getElementById("tend-descargar-csv")?.addEventListener("click", descargarCsv);
  }

  return { init, generarAnalisis };
})();
