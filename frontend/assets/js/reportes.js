/* Reportes y Descargas — mapas + catálogo ATD GeoBosques */
const Reportes = (() => {
  const MAPAS = {
    loreto: [
      { id: "aa", titulo: "ACR Ampiyacu Apayacu", thumb: "/mapas/thumbs/aa.jpg", img: "/mapas/MAPA_ACR_AA_page-0001.jpg", pdf: "/api/descargas/mapa/aa", fecha: "Noviembre 2025" },
      { id: "anpch", titulo: "ACR Alto Nanay", thumb: "/mapas/thumbs/anpch.jpg", img: "/mapas/MAPA_ACR_ANPCH_page-0001.jpg", pdf: "/api/descargas/mapa/anpch", fecha: "Noviembre 2025" },
      { id: "ctt", titulo: "ACR Tamshiyacu Tahuayo", thumb: "/mapas/thumbs/ctt.jpg", img: "/mapas/MAPA_ACR_CTT_page-0001.jpg", pdf: "/api/descargas/mapa/ctt", fecha: "Noviembre 2025" },
      { id: "mk", titulo: "ACR Maijuna Kichwa", thumb: "/mapas/thumbs/mk.jpg", img: "/mapas/MAPA_ACR_MK_page-0001.jpg", pdf: "/api/descargas/mapa/mk", fecha: "Noviembre 2025" },
    ],
    sanmartin: [
      { id: "boshumi", titulo: "ACR Bosques de Shunté y Mishollo", thumb: "/mapas/thumbs/boshumi.jpg", img: `/mapas/${encodeURIComponent("25NOV17_Mapa_de_deforestación_en_ACR_BOSHUMI_y_su_ZI_A2.jpg")}`, pdf: "/api/descargas/mapa/boshumi", fecha: "Enero 2026" },
      { id: "ce", titulo: "ACR Cordillera Escalera", thumb: "/mapas/thumbs/ce.jpg", img: `/mapas/${encodeURIComponent("25NOV17_Mapa_de_deforestación_en_ACR_CE_y_su_ZI_A2.jpg")}`, pdf: "/api/descargas/mapa/ce", fecha: "Enero 2026" },
    ],
    cusco: [
      { id: "chq", titulo: "ACR Choquequirao", thumb: "/mapas/thumbs/chq.jpg", img: "/mapas/MAPA_CHOQUE_DEF_page-0001.jpg", pdf: "/api/descargas/mapa/chq", fecha: "Noviembre 2025" },
      { id: "chu", titulo: "ACR Chuyapi Urusayhua", thumb: "/mapas/thumbs/chu.jpg", img: "/mapas/MAPA_CHUYAPI_ANEXO2_page-0001.jpg", pdf: "/api/descargas/mapa/chu", fecha: "Noviembre 2025" },
      { id: "qk", titulo: "ACR Q'eros Kosñipata", thumb: "/mapas/thumbs/qk.jpg", img: "/mapas/MAPA_QEROS_ANEXO3_page-0001.jpg", pdf: "/api/descargas/mapa/qk", fecha: "Noviembre 2025" },
    ],
  };

  const DEPTOS = ["loreto", "sanmartin", "cusco"];
  const DEPTO_ATD = { loreto: "loreto", sanmartin: "san_martin", cusco: "cusco" };

  let atdCatalog = null;
  let atdDepto = "loreto";

  function cardHtml(m) {
    return `<div class="card-mapa-nueva">
      <div class="card-mapa-thumb">
        <div class="card-mapa-skeleton" aria-hidden="true"></div>
        <img src="${m.thumb}" alt="${m.titulo}" loading="lazy" decoding="async" class="card-mapa-img"/>
      </div>
      <div class="card-mapa-body">
        <h5><i class="fas fa-leaf"></i> ${m.titulo}</h5>
        <p class="card-mapa-fecha"><i class="fas fa-calendar"></i> Actualizado: ${m.fecha}</p>
        <div class="card-mapa-actions">
          <button type="button" class="btn-mapa-ver" data-img="${m.img}" data-titulo="${m.titulo}">
            <i class="fas fa-search-plus"></i> Ver
          </button>
          <a class="btn-mapa-pdf" href="${m.pdf}" download>
            <i class="fas fa-download"></i> PDF
          </a>
        </div>
      </div>
    </div>`;
  }

  function bindThumbLoad(img) {
    const hideSkeleton = () => {
      img.classList.add("loaded");
      img.parentElement?.querySelector(".card-mapa-skeleton")?.classList.add("hidden");
    };
    if (img.complete && img.naturalWidth > 0) hideSkeleton();
    else {
      img.addEventListener("load", hideSkeleton, { once: true });
      img.addEventListener("error", () => {
        img.alt = "Vista previa no disponible";
        hideSkeleton();
      }, { once: true });
    }
  }

  function renderDepartment(depto) {
    const el = document.getElementById(`mapas-${depto}`);
    const items = MAPAS[depto];
    if (!el || !items || el.dataset.rendered === "1") return;
    el.innerHTML = items.map(cardHtml).join("");
    el.querySelectorAll(".card-mapa-img").forEach(bindThumbLoad);
    el.dataset.rendered = "1";
  }

  function renderAllDepartments() {
    DEPTOS.forEach(renderDepartment);
  }

  function prefetchThumbs() {
    DEPTOS.flatMap((d) => MAPAS[d]).forEach((m) => {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "image";
      link.href = m.thumb;
      document.head.appendChild(link);
    });
  }

  function showDepartment(depto) {
    document.querySelectorAll(".map-gallery-section").forEach((s) => s.classList.add("hidden"));
    renderDepartment(depto);
    document.getElementById(`mapas-${depto}`)?.classList.remove("hidden");
  }

  function fmtHa(n) {
    return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(n || 0);
  }

  function regionAtd(depto) {
    return atdCatalog?.regiones?.find((r) => r.id === DEPTO_ATD[depto]) || null;
  }

  function atdReportCard(r) {
    return `<article class="atd-report-card" data-oid="${r.oid || ""}">
      <div class="atd-report-icon"><i class="fas fa-file-pdf"></i></div>
      <div class="atd-report-body">
        <h5>${r.titulo}</h5>
        <p class="atd-report-meta">${r.subtitulo || r.archivo}</p>
        <div class="atd-report-actions">
          <button type="button" class="btn btn-primary btn-sm atd-btn-demo-h3" data-oid="${r.oid || ""}">
            <i class="fas fa-play"></i> Ver demo H3
          </button>
          <a class="btn btn-outline btn-sm" href="${r.url}" target="_blank" rel="noopener">
            <i class="fas fa-external-link-alt"></i> PDF
          </a>
        </div>
      </div>
    </article>`;
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
      root.innerHTML = `<p class="atd-empty">Catálogo ATD no disponible. Ejecute <code>scripts/sync_atd_reportes.py</code> y redespliegue.</p>`;
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

      const reportes = reg?.reportes_pdf || [];

      root.innerHTML = `
      <div class="atd-top well-panel">
        <div class="atd-top-head">
          <h3><i class="fas fa-satellite-dish"></i> ${atdCatalog.titulo}</h3>
        </div>
        <div class="atd-flow">${flujo}</div>
      </div>

      <div id="atd-demo-stage" class="atd-demo-stage" aria-live="polite"></div>

      <div class="reportes-filter-bar well-panel atd-filter atd-filter-compact">
        <label for="filtro_depto_atd"><i class="fas fa-filter"></i> Región:</label>
        <select id="filtro_depto_atd">
          <option value="loreto">Loreto</option>
          <option value="sanmartin">San Martín</option>
          <option value="cusco">Cusco</option>
        </select>
        ${reg?.guia ? `<a class="btn btn-warning btn-sm atd-guia-btn" href="${reg.guia.url}" target="_blank" rel="noopener"><i class="fas fa-book-open"></i> Guía</a>` : ""}
      </div>
      <div id="atd-inst-footer-slot"></div>
    `;

      const sel = document.getElementById("filtro_depto_atd");
      if (sel) {
        sel.value = atdDepto;
        sel.onchange = (e) => {
          atdDepto = e.target.value;
          AtdDemo.reset();
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
      root.innerHTML = `<p class="atd-empty">Error al mostrar reportes ATD. Recargue la página.</p>`;
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
      if (root && !root.classList.contains("hidden")) {
        root.innerHTML = `<p class="atd-empty">No se pudo cargar el catálogo ATD. El servidor puede estar despertando — espere un momento y vuelva a la pestaña ATD.<br><small>${e.message || ""}</small></p>`;
      }
      throw e;
    }
  }

  function atdLoadingHtml() {
    return `<div class="atd-loading atd-loading-panel"><i class="fas fa-spinner fa-spin"></i> Cargando demo ATD GeoBosques…</div>`;
  }

  function bindSubtabs() {
    const panelMapas = document.getElementById("reportes-panel-mapas");
    const atdRoot = document.getElementById("atd-root");
    const atdDivider = document.querySelector(".atd-section-divider");

    function showMapas() {
      panelMapas?.classList.remove("hidden");
      atdRoot?.classList.add("hidden");
      atdDivider?.classList.add("hidden");
      panelMapas?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function showAtd() {
      panelMapas?.classList.add("hidden");
      atdRoot?.classList.remove("hidden");
      atdDivider?.classList.remove("hidden");
      if (!atdCatalog) {
        if (atdRoot) atdRoot.innerHTML = atdLoadingHtml();
        loadAtd()
          .then(() => renderAtd(true))
          .catch(() => {});
      } else {
        renderAtd(true);
      }
      atdRoot?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    document.querySelectorAll(".reportes-subtab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = btn.dataset.reportesPanel;
        document.querySelectorAll(".reportes-subtab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (panel === "atd") showAtd();
        else showMapas();
      });
    });

    // Por defecto mapas visibles; ATD oculto hasta que el usuario cambie de pestaña.
    atdRoot?.classList.add("hidden");
    atdDivider?.classList.add("hidden");
  }

  function bindEvents() {
    bindSubtabs();
    document.getElementById("filtro_depto_mapas")?.addEventListener("change", (e) => {
      showDepartment(e.target.value);
    });

    document.getElementById("mapas-galleries")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-mapa-ver");
      if (!btn) return;
      Modals.showMap(btn.dataset.titulo, btn.dataset.img);
    });

    document.getElementById("btn-descargar-datos")?.addEventListener("click", () => {
      window.location.href = "/api/descargas/datos";
    });

    document.getElementById("tab-reportes")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".atd-btn-demo-h3");
      if (!btn || typeof AtdDemo === "undefined") return;
      const oid = btn.dataset.oid;
      const reg = regionAtd(atdDepto);
      const regionGlobal = atdCatalog?.regiones?.find((r) => r.id === "global");
      AtdDemo.mount(reg, regionGlobal, oid || undefined, atdCatalog?.regiones);
      AtdDemo.showStep("H3");
    });

    document.getElementById("mapas-galleries")?.addEventListener("click", async (e) => {
      const link = e.target.closest(".btn-mapa-pdf");
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href?.startsWith("/api/")) return;
      e.preventDefault();
      const ok = await fetch(href, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
      if (ok) window.location.href = href;
      else alert("Mapa PDF no disponible en este momento.");
    });
  }

  function init() {
    bindEvents();
    prefetchThumbs();
    renderAllDepartments();
    const sel = document.getElementById("filtro_depto_mapas");
    showDepartment(sel?.value || "loreto");
    loadAtd().catch(() => {});
  }

  return { init };
})();
