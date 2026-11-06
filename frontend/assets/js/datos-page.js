/* Catálogo de datos de deforestación — una ficha por conjunto. */
(function () {
  const COMUN = {
    organizacion: "GFP Subnacional",
    tema: "Medio ambiente",
    crs: "WGS84 (EPSG:4326)",
    resolucion: "30 m en la fuente Landsat, según la metodología publicada",
    linaje: "Polígonos de pérdida de bosque dentro del ACR. La metodología usa GeoBosques (MINAM) como fuente primaria y MapBiomas Perú como complemento.",
    frecuencia: "Anual. La siguiente actualización de la capa está prevista al cierre de 2026.",
    licencia: "Publicado en este dashboard por GFP Subnacional. El uso sigue las condiciones de las fuentes oficiales.",
    contacto: "GFP Subnacional — gfpsubnacional.pe",
  };

  const FICHA = {
    ACR_AA: { temporal: "2001–2025", poligonos: 7950, extension: "Loreto. Oeste −73.0263, sur −3.4828, este −71.6239, norte −2.6598.", palabras: "deforestación, Ampiyacu Apayacu, Loreto, ACR" },
    ACR_ANPCH: { temporal: "2001–2025", poligonos: 12489, extension: "Loreto. Oeste −75.0369, sur −3.9776, este −73.6480, norte −2.4372.", palabras: "deforestación, Alto Nanay, Pintuyacu Chambira, Loreto, ACR" },
    ACR_MK: { temporal: "2001–2025", poligonos: 7117, extension: "Loreto. Oeste −73.5346, sur −3.2748, este −72.2995, norte −2.2346.", palabras: "deforestación, Maijuna Kichwa, Loreto, ACR" },
    ACR_CTT: { temporal: "2001–2025", poligonos: 7651, extension: "Loreto. Oeste −73.4304, sur −5.0259, este −72.5858, norte −4.1267.", palabras: "deforestación, Tamshiyacu Tahuayo, Loreto, ACR" },
    ACR_BSM: { temporal: "2001–2025", poligonos: 7002, extension: "San Martín. Oeste −77.1218, sur −8.5412, este −76.6520, norte −7.5002.", palabras: "deforestación, Shunté, Mishollo, San Martín, ACR" },
    ACR_CE: { temporal: "2001–2025", poligonos: 13606, extension: "San Martín. Oeste −76.7760, sur −6.6198, este −75.9098, norte −5.9754.", palabras: "deforestación, Cordillera Escalera, San Martín, ACR" },
    ACR_CHQ: { temporal: "2001–2026", poligonos: 4380, extension: "Cusco. Oeste −72.9442, sur −13.4194, este −72.5527, norte −13.1365.", palabras: "deforestación, Choquequirao, Cusco, ACR" },
    ACR_CHU: { temporal: "2001–2026", poligonos: 5060, extension: "Cusco. Oeste −73.2086, sur −13.0038, este −72.5901, norte −12.6376.", palabras: "deforestación, Chuyapi Urusayhua, Cusco, ACR" },
    ACR_QK: { temporal: "2001–2026", poligonos: 4177, extension: "Cusco. Oeste −71.5425, sur −13.3647, este −71.0206, norte −13.0165.", palabras: "deforestación, Q'eros Kosñipata, Cusco, ACR" },
    paquete: {
      temporal: "La de los archivos incluidos en el ZIP",
      pill: "Caché exportado",
      extension: "Loreto, San Martín y Cusco. Reúne el caché exportado, no una sola capa.",
      palabras: "deforestación, centroides, caché, ACR",
      crs: "WGS84 (EPSG:4326) en los archivos que traen geometría",
      resolucion: "",
      linaje: "Exportación del caché del dashboard: CSV de centroides y GeoJSON generados. No reemplaza las nueve capas de deforestación acumulada.",
      frecuencia: "Se regenera cuando se actualizan los datos del dashboard. La siguiente actualización de las capas está prevista al cierre de 2026.",
    },
  };

  const DATASETS = [
    { id: "ACR_AA", titulo: "Deforestación acumulada — Ampiyacu Apayacu", resumen: "Polígonos de pérdida de bosque del ACR Ampiyacu Apayacu y su mapa de línea base.", depto: "Loreto", deptoKey: "loreto", geojson: "/api/descargas/acr/ACR_AA", pdf: "/api/descargas/mapa/aa", thumb: "/mapas/thumbs/aa.jpg", img: "/mapas/MAPA_ACR_AA_page-0001.jpg" },
    { id: "ACR_ANPCH", titulo: "Deforestación acumulada — Alto Nanay Pintuyacu Chambira", resumen: "Polígonos de pérdida de bosque del ACR Alto Nanay – Pintuyacu Chambira y su mapa de línea base.", depto: "Loreto", deptoKey: "loreto", geojson: "/api/descargas/acr/ACR_ANPCH", pdf: "/api/descargas/mapa/anpch", thumb: "/mapas/thumbs/anpch.jpg", img: "/mapas/MAPA_ACR_ANPCH_page-0001.jpg" },
    { id: "ACR_MK", titulo: "Deforestación acumulada — Maijuna Kichwa", resumen: "Polígonos de pérdida de bosque del ACR Maijuna Kichwa y su mapa de línea base.", depto: "Loreto", deptoKey: "loreto", geojson: "/api/descargas/acr/ACR_MK", pdf: "/api/descargas/mapa/mk", thumb: "/mapas/thumbs/mk.jpg", img: "/mapas/MAPA_ACR_MK_page-0001.jpg" },
    { id: "ACR_CTT", titulo: "Deforestación acumulada — Comunal Tamshiyacu Tahuayo", resumen: "Polígonos de pérdida de bosque del ACR Comunal Tamshiyacu Tahuayo y su mapa de línea base.", depto: "Loreto", deptoKey: "loreto", geojson: "/api/descargas/acr/ACR_CTT", pdf: "/api/descargas/mapa/ctt", thumb: "/mapas/thumbs/ctt.jpg", img: "/mapas/MAPA_ACR_CTT_page-0001.jpg" },
    { id: "ACR_BSM", titulo: "Deforestación acumulada — Bosques de Shunté y Mishollo", resumen: "Polígonos de pérdida de bosque del ACR Bosques de Shunté y Mishollo y su mapa de línea base.", depto: "San Martín", deptoKey: "sanmartin", geojson: "/api/descargas/acr/ACR_BSM", pdf: "/api/descargas/mapa/boshumi", thumb: "/mapas/thumbs/boshumi.jpg", img: "/mapas/" + encodeURIComponent("25NOV17_Mapa_de_deforestación_en_ACR_BOSHUMI_y_su_ZI_A2.jpg") },
    { id: "ACR_CE", titulo: "Deforestación acumulada — Cordillera Escalera", resumen: "Polígonos de pérdida de bosque del ACR Cordillera Escalera y su mapa de línea base.", depto: "San Martín", deptoKey: "sanmartin", geojson: "/api/descargas/acr/ACR_CE", pdf: "/api/descargas/mapa/ce", thumb: "/mapas/thumbs/ce.jpg", img: "/mapas/" + encodeURIComponent("25NOV17_Mapa_de_deforestación_en_ACR_CE_y_su_ZI_A2.jpg") },
    { id: "ACR_CHQ", titulo: "Deforestación acumulada — Choquequirao", resumen: "Polígonos de pérdida de bosque del ACR Choquequirao y su mapa de línea base.", depto: "Cusco", deptoKey: "cusco", geojson: "/api/descargas/acr/ACR_CHQ", pdf: "/api/descargas/mapa/chq", thumb: "/mapas/thumbs/chq.jpg", img: "/mapas/MAPA_CHOQUE_DEF_page-0001.jpg" },
    { id: "ACR_CHU", titulo: "Deforestación acumulada — Chuyapi Urusayhua", resumen: "Polígonos de pérdida de bosque del ACR Chuyapi Urusayhua y su mapa de línea base.", depto: "Cusco", deptoKey: "cusco", geojson: "/api/descargas/acr/ACR_CHU", pdf: "/api/descargas/mapa/chu", thumb: "/mapas/thumbs/chu.jpg", img: "/mapas/MAPA_CHUYAPI_ANEXO2_page-0001.jpg" },
    { id: "ACR_QK", titulo: "Deforestación acumulada — Q'eros Kosñipata", resumen: "Polígonos de pérdida de bosque del ACR Q'eros Kosñipata y su mapa de línea base.", depto: "Cusco", deptoKey: "cusco", geojson: "/api/descargas/acr/ACR_QK", pdf: "/api/descargas/mapa/qk", thumb: "/mapas/thumbs/qk.jpg", img: "/mapas/MAPA_QEROS_ANEXO3_page-0001.jpg" },
    { id: "paquete", titulo: "Paquete de datos del dashboard", resumen: "Archivo comprimido con el caché exportado: centroides de deforestación en CSV y GeoJSON generados para el monitoreo.", depto: "Nacional", deptoKey: "todos", zip: "/api/descargas/datos", formatos: ["ZIP"] },
  ];

  const state = { q: "", depto: "todos", formato: "todos", orden: "nombre" };

  function fichaDe(d) {
    return Object.assign({}, COMUN, FICHA[d.id] || {});
  }

  function formatos(d) {
    if (d.formatos) return d.formatos;
    return ["GeoJSON", "PDF", "JPG"];
  }

  function coincide(d) {
    if (state.depto !== "todos" && d.deptoKey !== state.depto && d.deptoKey !== "todos") return false;
    const tiene = formatos(d).map((f) => f.toLowerCase());
    if (state.formato === "geojson" && !tiene.includes("geojson")) return false;
    if (state.formato === "pdf" && !tiene.includes("pdf")) return false;
    if (state.formato === "zip" && !tiene.includes("zip")) return false;
    const f = fichaDe(d);
    const texto = (d.titulo + " " + d.resumen + " " + d.depto + " " + (f.palabras || "") + " " + (f.temporal || "")).toLowerCase();
    return !state.q || texto.includes(state.q);
  }

  function ordenar(lista) {
    const copia = lista.slice();
    copia.sort((a, b) => {
      const ka = state.orden === "depto" ? a.depto + a.titulo : a.titulo;
      const kb = state.orden === "depto" ? b.depto + b.titulo : b.titulo;
      return ka.localeCompare(kb, "es");
    });
    return copia;
  }

  function pills(d) {
    const f = fichaDe(d);
    const anio = `<span class="ide-pill">${f.pill || f.temporal}</span>`;
    return formatos(d).map((f) => `<span class="ide-pill">${f}</span>`).join("") + anio;
  }

  function acciones(d) {
    const ficha = `<button type="button" class="ide-btn ide-btn-ficha" data-ficha="${d.id}"><i class="fas fa-id-card"></i> Ficha</button>`;
    if (d.zip) {
      return `<a class="ide-btn ide-btn-main" href="${d.zip}"><i class="fas fa-file-archive"></i> Descargar ZIP</a>${ficha}`;
    }
    return `<a class="ide-btn ide-btn-main" href="${d.geojson}"><i class="fas fa-download"></i> GeoJSON</a>
      <a class="ide-btn" href="${d.img}" target="_blank" rel="noopener"><i class="fas fa-map"></i> Ver mapa</a>
      <a class="ide-btn" href="${d.pdf}"><i class="fas fa-file-pdf"></i> PDF</a>${ficha}`;
  }

  function card(d) {
    const thumb = d.thumb
      ? `<img src="${d.thumb}" alt="" loading="lazy" decoding="async" />`
      : `<span class="ide-thumb-zip"><i class="fas fa-file-archive"></i></span>`;
    return `<article class="ide-card">
      <div class="ide-thumb">${thumb}</div>
      <div class="ide-body">
        <p class="ide-org">GFP Subnacional · ${d.depto}</p>
        <h3>${d.titulo}</h3>
        <p>${d.resumen}</p>
        <div class="ide-meta">${pills(d)}<span class="ide-pill ide-pill-tema">Medio ambiente</span></div>
        <div class="ide-actions">${acciones(d)}<a class="ide-btn ide-btn-link" href="/mapa"><i class="fas fa-map-marked-alt"></i> Abrir en el mapa</a></div>
      </div>
    </article>`;
  }

  function fila(dl, etiqueta, valor) {
    if (!valor) return;
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = etiqueta;
    dd.textContent = valor;
    dl.append(dt, dd);
  }

  function abrirFicha(id) {
    const d = DATASETS.find((item) => item.id === id);
    if (!d) return;
    const f = fichaDe(d);
    document.getElementById("ide-ficha-org").textContent = f.organizacion + " · " + d.depto;
    document.getElementById("ide-ficha-titulo").textContent = d.titulo;
    document.getElementById("ide-ficha-resumen").textContent = d.resumen;
    const dl = document.getElementById("ide-ficha-dl");
    dl.replaceChildren();
    fila(dl, "Identificador", d.id);
    fila(dl, "Organización", f.organizacion);
    fila(dl, "Tema", f.tema);
    fila(dl, "Palabras clave", f.palabras);
    fila(dl, "Cobertura temporal", f.temporal);
    fila(dl, "Polígonos", f.poligonos ? String(f.poligonos).replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "");
    fila(dl, "Extensión", f.extension);
    fila(dl, "Coordenadas", f.crs);
    fila(dl, "Resolución", f.resolucion);
    fila(dl, "Formatos", formatos(d).join(", "));
    fila(dl, "Linaje", f.linaje);
    fila(dl, "Actualización", f.frecuencia);
    fila(dl, "Licencia", f.licencia);
    fila(dl, "Contacto", f.contacto);
    document.getElementById("ide-ficha").showModal();
  }

  function render() {
    const lista = ordenar(DATASETS.filter(coincide));
    const root = document.getElementById("ide-results");
    const count = document.getElementById("ide-count");
    count.textContent = lista.length + (lista.length === 1 ? " conjunto" : " conjuntos");
    root.innerHTML = lista.length
      ? lista.map(card).join("")
      : `<p class="ide-vacio">Ningún conjunto coincide con esa búsqueda.</p>`;
  }

  document.getElementById("ide-search").addEventListener("submit", (e) => e.preventDefault());
  document.getElementById("ide-q").addEventListener("input", (e) => {
    state.q = e.target.value.trim().toLowerCase();
    render();
  });
  document.getElementById("ide-orden").addEventListener("change", (e) => {
    state.orden = e.target.value;
    render();
  });
  document.getElementById("ide-depto").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.depto = btn.dataset.depto;
    btn.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
    render();
  });
  document.getElementById("ide-formato").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.formato = btn.dataset.formato;
    btn.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
    render();
  });
  document.getElementById("ide-results").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-ficha]");
    if (btn) abrirFicha(btn.dataset.ficha);
  });
  const dialog = document.getElementById("ide-ficha");
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  render();
})();
