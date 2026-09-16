/* Reportes — solo Alertas tempranas ATD GeoBosques */
const Reportes = (() => {
  const DEPTO_ATD = { loreto: "loreto", sanmartin: "san_martin", cusco: "cusco" };

  let atdCatalog = null;
  let atdDepto = "loreto";

  function regionAtd(depto) {
    return atdCatalog?.regiones?.find((r) => r.id === DEPTO_ATD[depto]) || null;
  }

  function updateAtdBadge() {
    const badge = document.getElementById("atd-badge");
    if (!badge || !atdCatalog?.disponible) return;
    const total = atdCatalog.total_reportes || 0;
    badge.textContent = String(total);
    badge.classList.toggle("hidden", !total);
  }

  async function fetchAtdCatalog(retries = 8) {
    let lastErr;
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch("/api/atd/catalogo", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 800 + i * 400));
      }
    }
    throw lastErr;
  }

  function renderAtd(autoStart = false) {
    const root = document.getElementById("atd-root");
    if (!root) return;

    const tieneDatos = atdCatalog?.disponible && (atdCatalog.regiones?.length || 0) > 0;
    if (!tieneDatos) {
      root.innerHTML = `<p class="atd-empty">Catalogo ATD no disponible. Espere un momento y recargue.</p>`;
      return;
    }

    try {
      const reg = regionAtd(atdDepto);
      const regionGlobal = atdCatalog.regiones?.find((r) => r.id === "global");
      const periodo = reg?.periodo || {};
      const stats =
        reg?.estadisticas && reg.estadisticas.total != null
          ? reg.estadisticas
          : regionGlobal?.estadisticas;
      const nAlertas =
        periodo.n_alertas > 0 ? periodo.n_alertas : (stats?.total ?? reg?.n_reportes ?? 0);

      const flujo = (atdCatalog.flujo || [])
        .map(
          (f) => `<button type="button" class="atd-flow-step" data-paso="${f.paso}" title="Demo ${f.paso}">
          <span class="atd-flow-badge">${f.paso}</span>
          <i class="fas ${f.icono}"></i>
          <span>${f.nombre}</span>
          <i class="fas fa-play-circle atd-flow-play"></i>
        </button>`
        )
        .join("");

      root.innerHTML = `
      <div class="atd-top well-panel">
        <div class="atd-top-head">
          <h3><i class="fas fa-satellite-dish"></i> ${atdCatalog.titulo}</h3>
        </div>
        <div class="atd-flow">${flujo}</div>
      </div>

      <div class="reportes-filter-bar well-panel atd-filter atd-filter-compact">
        <label for="filtro_depto_atd"><i class="fas fa-filter"></i> Region:</label>
        <select id="filtro_depto_atd">
          <option value="loreto">Loreto</option>
          <option value="sanmartin">San Martin</option>
          <option value="cusco">Cusco</option>
        </select>
        ${reg?.guia ? `<a class="btn btn-warning btn-sm atd-guia-btn" href="${reg.guia.url}" target="_blank" rel="noopener"><i class="fas fa-book-open"></i> Guia</a>` : ""}
        <span class="atd-filter-meta">${nAlertas ? nAlertas + " alertas" : ""}</span>
      </div>

      <div id="atd-demo-stage" class="atd-demo-stage" aria-live="polite"></div>
      <div id="atd-inst-footer-slot"></div>
    `;

      const sel = document.getElementById("filtro_depto_atd");
      if (sel) {
        sel.value = atdDepto;
        sel.onchange = (e) => {
          atdDepto = e.target.value;
          if (typeof AtdDemo !== "undefined") AtdDemo.reset();
          renderAtd(true);
        };
      }

      if (typeof AtdDemo !== "undefined") {
        AtdDemo.mount(reg, regionGlobal, undefined, atdCatalog.regiones);
        const footerSlot = document.getElementById("atd-inst-footer-slot");
        if (footerSlot && AtdDemo.footerHtml) {
          footerSlot.innerHTML = AtdDemo.footerHtml();
        }
        if (autoStart) {
          setTimeout(() => AtdDemo.showStep("H1"), 50);
        }
      }

      updateAtdBadge();
    } catch (err) {
      console.error("renderAtd:", err);
      root.innerHTML = `<p class="atd-empty">Error al mostrar reportes ATD. Recargue la pagina.</p>`;
    }
  }

  async function loadAtd() {
    const root = document.getElementById("atd-root");
    try {
      if (!atdCatalog) {
        atdCatalog = await fetchAtdCatalog();
      }
      updateAtdBadge();
      return atdCatalog;
    } catch (e) {
      console.error("loadAtd:", e);
      if (root) {
        root.innerHTML = `<p class="atd-empty">No se pudo cargar el catalogo ATD. Espere un momento y recargue.<br><small>${e.message || ""}</small></p>`;
      }
      throw e;
    }
  }

  function atdLoadingHtml() {
    return `<div class="atd-loading atd-loading-panel"><i class="fas fa-spinner fa-spin"></i> Cargando demo ATD GeoBosques...</div>`;
  }

  function bindEvents() {
    document.getElementById("tab-reportes")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".atd-btn-demo-h3");
      if (!btn || typeof AtdDemo === "undefined") return;
      const oid = btn.dataset.oid;
      const reg = regionAtd(atdDepto);
      const regionGlobal = atdCatalog?.regiones?.find((r) => r.id === "global");
      AtdDemo.mount(reg, regionGlobal, oid || undefined, atdCatalog?.regiones);
      AtdDemo.showStep("H3");
    });

    document.getElementById("atd-root")?.addEventListener("click", (e) => {
      const step = e.target.closest(".atd-flow-step");
      if (!step || typeof AtdDemo === "undefined") return;
      const paso = step.dataset.paso;
      if (paso) AtdDemo.showStep(paso);
    });
  }

  function init() {
    bindEvents();
    const atdRoot = document.getElementById("atd-root");
    atdRoot?.classList.remove("hidden");
    if (atdRoot) atdRoot.innerHTML = atdLoadingHtml();
    loadAtd()
      .then(() => renderAtd(true))
      .catch(() => {});
  }

  return { init };
})();
