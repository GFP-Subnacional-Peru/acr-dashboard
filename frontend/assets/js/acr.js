/* Ficha ACR — /acr/{slug} */
(function () {
  const SLUG_TO_ACR = {
    "ampiyacu-apayacu": {
      codigo: "ACR_AA",
      nombre: "Ampiyacu Apayacu",
      departamento: "loreto",
      region: "Loreto",
    },
    "alto-nanay": {
      codigo: "ACR_ANPCH",
      nombre: "Alto Nanay Pintuyacu Chambira",
      departamento: "loreto",
      region: "Loreto",
    },
    "maijuna-kichwa": {
      codigo: "ACR_MK",
      nombre: "Maijuna Kichwa",
      departamento: "loreto",
      region: "Loreto",
    },
    tahuayo: {
      codigo: "ACR_CTT",
      nombre: "Comunal Tamshiyacu Tahuayo",
      departamento: "loreto",
      region: "Loreto",
    },
    "bosques-shunte": {
      codigo: "ACR_BSM",
      nombre: "Bosques de Shunté y Mishollo",
      departamento: "san_martin",
      region: "San Martín",
    },
    "cordillera-escalera": {
      codigo: "ACR_CE",
      nombre: "Cordillera Escalera",
      departamento: "san_martin",
      region: "San Martín",
    },
    choquequirao: {
      codigo: "ACR_CHQ",
      nombre: "Choquequirao",
      departamento: "cusco",
      region: "Cusco",
    },
    "chuyapi-urusayhua": {
      codigo: "ACR_CHU",
      nombre: "Chuyapi Urusayhua",
      departamento: "cusco",
      region: "Cusco",
    },
    "qeros-kosnipata": {
      codigo: "ACR_QK",
      nombre: "Q'eros Kosñipata",
      departamento: "cusco",
      region: "Cusco",
    },
  };

  const fmt = (n) =>
    new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }).format(Math.round(n || 0));

  function slugFromPath() {
    const parts = window.location.pathname.replace(/\/+$/, "").split("/");
    const i = parts.indexOf("acr");
    return i >= 0 && parts[i + 1] ? decodeURIComponent(parts[i + 1]) : "";
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  function renderError(root, msg) {
    root.innerHTML = `<div class="acr-error"><i class="fas fa-exclamation-circle"></i> ${msg}</div>`;
  }

  async function load() {
    const root = document.getElementById("acr-root");
    if (!root) return;

    const slug = slugFromPath();
    const meta = SLUG_TO_ACR[slug];
    if (!meta) {
      renderError(
        root,
        `ACR no encontrado (<code>${slug || "—"}</code>). <a href="/">Volver al inicio</a>`
      );
      return;
    }

    let decreto = {};
    try {
      decreto = await fetchJson(`/api/decretos/${encodeURIComponent(meta.codigo)}`);
    } catch (_) {
      decreto = {};
    }

    const nombre = meta.nombre;
    const region = decreto.region || meta.region;
    const ds = decreto.decreto || "—";
    const fecha = decreto.fecha || "—";
    const superficie =
      decreto.superficie != null && decreto.superficie !== ""
        ? `${fmt(decreto.superficie)} ha`
        : "—";

    let kpiHtml = `<p class="acr-kpi-note">Indicadores de deforestación: cargando…</p>`;
    try {
      const q = new URLSearchParams({
        departamento: meta.departamento,
        ambito: "acr",
      });
      q.append("acr", meta.codigo);
      const kpis = await fetchJson(`/api/kpis?${q}`);
      const ha = kpis.total_hectareas != null ? fmt(kpis.total_hectareas) : "—";
      const pct =
        kpis.porcentaje_antropico_kpi != null
          ? kpis.porcentaje_antropico_kpi
          : kpis.pct_antropico != null
            ? kpis.pct_antropico
            : "—";
      kpiHtml = `<p class="acr-kpi-note"><strong>${ha} ha</strong> deforestadas (serie disponible) · <strong>${pct}%</strong> de origen antrópico.</p>`;
    } catch (_) {
      kpiHtml = `<p class="acr-kpi-note">No se pudieron cargar los KPI en este momento. Use el mapa para consultar indicadores.</p>`;
    }

    document.title = `${nombre} — Portal ACR | GFP`;

    root.innerHTML = `
      <span class="acr-detail-region">${region}</span>
      <h1>${nombre}</h1>
      <p class="acr-detail-code">${meta.codigo}</p>
      <div class="acr-meta-grid">
        <div class="acr-meta-item">
          <span class="label">Decreto</span>
          <span class="value">${ds}</span>
        </div>
        <div class="acr-meta-item">
          <span class="label">Fecha de creación</span>
          <span class="value">${fecha}</span>
        </div>
        <div class="acr-meta-item">
          <span class="label">Superficie (registro)</span>
          <span class="value">${superficie}</span>
        </div>
        <div class="acr-meta-item">
          <span class="label">Región</span>
          <span class="value">${region}</span>
        </div>
      </div>
      ${kpiHtml}
      <div class="acr-actions">
        <a class="portal-cta" href="/mapa?acr=${encodeURIComponent(meta.codigo)}">
          <i class="fas fa-map"></i> Ver en el mapa
        </a>
        <a class="portal-cta portal-cta-ghost" href="/">
          <i class="fas fa-home"></i> Inicio
        </a>
      </div>
    `;
  }

  load().catch((err) => {
    console.error(err);
    const root = document.getElementById("acr-root");
    if (root) renderError(root, "Error al cargar la ficha.");
  });
})();
