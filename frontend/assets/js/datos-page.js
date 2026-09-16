/* Página Datos — mapas + descargas (mitad / mitad) */
(function () {
  const MAPAS = {
    loreto: [
      { titulo: "Ampiyacu Apayacu", thumb: "/mapas/thumbs/aa.jpg", img: "/mapas/MAPA_ACR_AA_page-0001.jpg", pdf: "/api/descargas/mapa/aa" },
      { titulo: "Alto Nanay – Pintuyacu Chambira", thumb: "/mapas/thumbs/anpch.jpg", img: "/mapas/MAPA_ACR_ANPCH_page-0001.jpg", pdf: "/api/descargas/mapa/anpch" },
      { titulo: "Tamshiyacu Tahuayo", thumb: "/mapas/thumbs/ctt.jpg", img: "/mapas/MAPA_ACR_CTT_page-0001.jpg", pdf: "/api/descargas/mapa/ctt" },
      { titulo: "Maijuna Kichwa", thumb: "/mapas/thumbs/mk.jpg", img: "/mapas/MAPA_ACR_MK_page-0001.jpg", pdf: "/api/descargas/mapa/mk" },
    ],
    sanmartin: [
      {
        titulo: "Bosques de Shunté y Mishollo",
        thumb: "/mapas/thumbs/boshumi.jpg",
        img: `/mapas/${encodeURIComponent("25NOV17_Mapa_de_deforestación_en_ACR_BOSHUMI_y_su_ZI_A2.jpg")}`,
        pdf: "/api/descargas/mapa/boshumi",
      },
      {
        titulo: "Cordillera Escalera",
        thumb: "/mapas/thumbs/ce.jpg",
        img: `/mapas/${encodeURIComponent("25NOV17_Mapa_de_deforestación_en_ACR_CE_y_su_ZI_A2.jpg")}`,
        pdf: "/api/descargas/mapa/ce",
      },
    ],
    cusco: [
      { titulo: "Choquequirao", thumb: "/mapas/thumbs/chq.jpg", img: "/mapas/MAPA_CHOQUE_DEF_page-0001.jpg", pdf: "/api/descargas/mapa/chq" },
      { titulo: "Chuyapi Urusayhua", thumb: "/mapas/thumbs/chu.jpg", img: "/mapas/MAPA_CHUYAPI_ANEXO2_page-0001.jpg", pdf: "/api/descargas/mapa/chu" },
      { titulo: "Q'eros Kosñipata", thumb: "/mapas/thumbs/qk.jpg", img: "/mapas/MAPA_QEROS_ANEXO3_page-0001.jpg", pdf: "/api/descargas/mapa/qk" },
    ],
  };

  function cardHtml(m) {
    return `<div class="card-mapa-nueva">
      <div class="card-mapa-thumb">
        <img src="${m.thumb}" alt="${m.titulo}" loading="lazy" decoding="async" class="card-mapa-img loaded"/>
      </div>
      <div class="card-mapa-body">
        <h5><i class="fas fa-leaf"></i> ${m.titulo}</h5>
        <div class="card-mapa-actions">
          <a class="btn-mapa-ver" href="${m.img}" target="_blank" rel="noopener"><i class="fas fa-search-plus"></i> Ver</a>
          <a class="btn-mapa-pdf" href="${m.pdf}" download><i class="fas fa-download"></i> PDF</a>
        </div>
      </div>
    </div>`;
  }

  function render(depto) {
    const root = document.getElementById("datos-mapas-gallery");
    if (!root) return;
    const items = MAPAS[depto] || [];
    root.innerHTML = items.map(cardHtml).join("");
  }

  const sel = document.getElementById("datos-filtro-depto");
  sel?.addEventListener("change", (e) => render(e.target.value));
  render(sel?.value || "loreto");
})();
