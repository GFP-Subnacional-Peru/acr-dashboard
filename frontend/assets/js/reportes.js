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
    return `<article class="atd-report-card">
      <div class="atd-report-icon"><i class="fas fa-file-pdf"></i></div>
      <div class="atd-report-body">
        <h5>${r.titulo}</h5>
        <p class="atd-report-meta">${r.subtitulo || r.archivo}</p>
        <div class="atd-report-actions">
          <a class="btn btn-primary btn-sm" href="${r.url}" target="_blank" rel="noopener">
            <i class="fas fa-external-link-alt"></i> Abrir PDF
          </a>
          <a class="btn btn-outline btn-sm" href="${r.url}" download>
            <i class="fas fa-download"></i> Descargar
          </a>
        </div>
      </div>
    </article>`;
  }

  function atdDocLink(d) {
    const icon = d.tipo === "swipe" ? "fa-exchange-alt" : "fa-book";
    return `<a class="atd-doc-link" href="${d.url}" target="_blank" rel="noopener">
      <i class="fas ${icon}"></i> ${d.titulo}
    </a>`;
  }

  function renderAtd() {
    const root = document.getElementById("atd-root");
    if (!root || !atdCatalog?.disponible) {
      if (root) {
        root.innerHTML = `<p class="atd-empty">Catálogo ATD no disponible. Ejecute <code>scripts/sync_atd_reportes.py</code>.</p>`;
      }
      return;
    }

    const reg = regionAtd(atdDepto);
    const global = atdCatalog.regiones?.find((r) => r.id === "global");
    const periodo = reg?.periodo || {};
    const stats = reg?.estadisticas?.total != null ? reg.estadisticas : global?.estadisticas;
    const nAlertas = periodo.n_alertas ?? stats?.total ?? reg?.n_reportes ?? 0;

    const flujo = (atdCatalog.flujo || [])
      .map(
        (f) => `<div class="atd-flow-step">
          <span class="atd-flow-badge">${f.paso}</span>
          <i class="fas ${f.icono}"></i>
          <span>${f.nombre}</span>
        </div>`
      )
      .join("");

    const reportes = reg?.reportes_pdf || [];
    const docs = reg?.documentacion || [];
    const swipes = docs.filter((d) => d.tipo === "swipe");
    const otros = docs.filter((d) => d.tipo !== "swipe");

    root.innerHTML = `
      <div class="atd-hero well-panel">
        <div class="atd-hero-text">
          <h3><i class="fas fa-satellite-dish"></i> ${atdCatalog.titulo}</h3>
          <p>${atdCatalog.descripcion}</p>
        </div>
        <div class="atd-kpis">
          <div class="atd-kpi"><span class="atd-kpi-n">${nAlertas}</span><span class="atd-kpi-l">Alertas en periodo</span></div>
          <div class="atd-kpi"><span class="atd-kpi-n">${reportes.length}</span><span class="atd-kpi-l">Reportes PDF</span></div>
          <div class="atd-kpi"><span class="atd-kpi-n">${stats?.total_ha ? fmtHa(stats.total_ha) : "—"}</span><span class="atd-kpi-l">Ha monitoreadas</span></div>
          <div class="atd-kpi atd-kpi-wide"><span class="atd-kpi-l">Periodo</span><span class="atd-kpi-n-sm">${periodo.fecha_ini || "—"} – ${periodo.fecha_fin || "—"}</span></div>
        </div>
      </div>

      <div class="atd-flow">${flujo}</div>

      <div class="reportes-filter-bar well-panel atd-filter">
        <label for="filtro_depto_atd"><i class="fas fa-filter"></i> Región ATD:</label>
        <select id="filtro_depto_atd">
          <option value="loreto">Loreto</option>
          <option value="sanmartin">San Martín</option>
          <option value="cusco">Cusco</option>
        </select>
        ${reg?.guia ? `<a class="btn btn-warning btn-sm atd-guia-btn" href="${reg.guia.url}" target="_blank" rel="noopener"><i class="fas fa-book-open"></i> Guía toolbox</a>` : ""}
        ${global?.guia ? `<a class="btn btn-outline btn-sm" href="${global.guia.url}" target="_blank" rel="noopener"><i class="fas fa-toolbox"></i> Guía general</a>` : ""}
      </div>

      <h4 class="atd-section-title"><i class="fas fa-file-pdf"></i> Informes ATD validados — ${reg?.label || ""}</h4>
      <div class="atd-reports-grid">
        ${reportes.length ? reportes.map(atdReportCard).join("") : `<p class="atd-empty">Sin reportes PDF publicados para esta región. Genere informes con H3 en ArcGIS Pro.</p>`}
      </div>

      ${swipes.length ? `<h4 class="atd-section-title"><i class="fas fa-exchange-alt"></i> Visores swipe (antes / después)</h4>
      <div class="atd-docs-grid">${swipes.map(atdDocLink).join("")}</div>` : ""}

      ${otros.length ? `<h4 class="atd-section-title"><i class="fas fa-book"></i> Metodología y procedimientos</h4>
      <div class="atd-docs-grid">${otros.map(atdDocLink).join("")}</div>` : ""}
    `;

    const sel = document.getElementById("filtro_depto_atd");
    if (sel) {
      sel.value = atdDepto;
      sel.addEventListener("change", (e) => {
        atdDepto = e.target.value;
        renderAtd();
      });
    }
  }

  async function loadAtd() {
    try {
      const res = await fetch("/api/atd/catalogo");
      atdCatalog = await res.json();
      renderAtd();
    } catch (e) {
      const root = document.getElementById("atd-root");
      if (root) root.innerHTML = `<p class="atd-empty">No se pudo cargar el catálogo ATD.</p>`;
    }
  }

  function bindSubtabs() {
    document.querySelectorAll(".reportes-subtab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = btn.dataset.reportesPanel;
        document.querySelectorAll(".reportes-subtab").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".reportes-panel").forEach((p) => p.classList.add("hidden"));
        btn.classList.add("active");
        document.getElementById(`reportes-panel-${panel}`)?.classList.remove("hidden");
        if (panel === "atd" && !atdCatalog) loadAtd();
      });
    });
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
    loadAtd();
  }

  return { init };
})();
