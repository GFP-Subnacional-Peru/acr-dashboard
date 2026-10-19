(function () {
  const ficha = document.getElementById("acuerdo-ficha");
  const map = L.map("acuerdo-mapa", { scrollWheelZoom: true, zoomControl: true }).setView([-12.69, -72.63], 12);
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Leaflet | Tiles © Esri, Maxar, Earthstar Geographics", maxZoom: 18 }
  ).addTo(map);
  L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

  const estilo = {
    color: "#b45309",
    weight: 2.8,
    fillColor: "#f59e0b",
    fillOpacity: 0.38,
  };

  function ha(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString("es-PE", { maximumFractionDigits: 0 }) + " ha";
  }

  function dato(icono, etiqueta, valor) {
    if (!valor) return "";
    return `<div class="acuerdos-dato"><i class="fas fa-${icono}" aria-hidden="true"></i><div><small>${etiqueta}</small>${valor}</div></div>`;
  }

  function pintar(p) {
    const pdf = p.pdf
      ? `<a class="acuerdos-pdf" href="${p.pdf}" target="_blank" rel="noopener"><i class="fas fa-file-pdf"></i> Ver el acuerdo</a>`
      : "";
    ficha.innerHTML = `
      <span class="acuerdos-piloto">Piloto</span>
      <div>
        <p class="acuerdos-kicker">Acuerdo de conservación</p>
        <h2>${p.nombre || "Acuerdo"}</h2>
      </div>
      <div class="acuerdos-metrics">
        <div class="acuerdos-metric"><strong>${ha(p.area_ha)}</strong><span>En el mapa</span></div>
        <div class="acuerdos-metric"><strong>${ha(p.ambito_ha)}</strong><span>En el acuerdo</span></div>
      </div>
      ${dato("file-signature", "Número", p.numero)}
      ${dato("tree", "ACR", p.acr)}
      ${dato("users", "Suscriptor", p.suscriptor)}
      ${dato("home", "Centro poblado", p.centro_poblado)}
      ${dato("map-pin", "Lugar", [p.sector, p.distrito, p.provincia, p.region].filter(Boolean).join(" · "))}
      <p class="acuerdos-objeto">${p.objeto || ""}</p>
      ${pdf}`;
  }

  fetch("/assets/data/acuerdos_conservacion.geojson")
    .then((r) => r.json())
    .then((geo) => {
      const capa = L.geoJSON(geo, {
        style: () => estilo,
        onEachFeature: (feature, layer) => {
          const p = feature.properties || {};
          layer.bindTooltip(p.nombre || "Acuerdo", { sticky: true });
          layer.on("click", () => pintar(p));
        },
      }).addTo(map);
      const primero = geo.features && geo.features[0] && geo.features[0].properties;
      if (primero) pintar(primero);
      try {
        map.fitBounds(capa.getBounds(), { padding: [36, 36], maxZoom: 14 });
      } catch (_) {}
      setTimeout(() => map.invalidateSize(), 150);

      const codigo = primero && primero.acr_codigo;
      if (!codigo) return;
      fetch("/api/map/layers?departamento=cusco&ambito=acr&acr=" + encodeURIComponent(codigo))
        .then((r) => r.json())
        .then((layers) => {
          if (!layers || !layers.acr) return;
          L.geoJSON(layers.acr, {
            style: { color: "#2E7D32", weight: 2.2, fill: false },
            interactive: false,
          }).addTo(map);
          capa.bringToFront();
        })
        .catch(() => {});
    })
    .catch(() => {
      ficha.innerHTML = `<p class="acuerdos-kicker">No se pudo cargar el acuerdo.</p>`;
    });
})();
