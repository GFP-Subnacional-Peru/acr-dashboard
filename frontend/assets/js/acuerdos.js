(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const map = L.map("map", { scrollWheelZoom: true, zoomControl: true }).setView([-9.2, -74.5], 5);
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Leaflet | Tiles © Esri", maxZoom: 18 }
  ).addTo(map);
  L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

  let geo = { features: [] };
  let capa = null;
  let limite = null;
  let seleccionado = null;

  function ha(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString("es-PE", { maximumFractionDigits: 0 }) + " ha";
  }

  function regionKey(nombre) {
    const n = String(nombre || "").toLowerCase();
    if (n.includes("cusco") || n.includes("cuzco")) return "cusco";
    if (n.includes("loreto")) return "loreto";
    if (n.includes("san")) return "san_martin";
    return n;
  }

  function visibles() {
    const dep = $("departamento").value;
    const acr = $("nombre_acr").value;
    return (geo.features || []).filter((f) => {
      const p = f.properties || {};
      if (dep !== "todos" && regionKey(p.region) !== dep) return false;
      if (acr !== "todos" && p.acr_codigo !== acr) return false;
      return true;
    });
  }

  function llenarAcr() {
    const dep = $("departamento").value;
    const previo = $("nombre_acr").value;
    const vistos = new Map();
    (geo.features || []).forEach((f) => {
      const p = f.properties || {};
      if (dep !== "todos" && regionKey(p.region) !== dep) return;
      if (p.acr_codigo && !vistos.has(p.acr_codigo)) vistos.set(p.acr_codigo, p.acr || p.acr_codigo);
    });
    $("nombre_acr").innerHTML = `<option value="todos">Todas</option>` +
      [...vistos].map(([cod, nom]) => `<option value="${esc(cod)}">${esc(nom)}</option>`).join("");
    if ([...$("nombre_acr").options].some((o) => o.value === previo)) $("nombre_acr").value = previo;
  }

  function estilo(sel) {
    return {
      color: sel ? "#ffffff" : "#b45309",
      weight: sel ? 3.4 : 2.4,
      fillColor: "#f59e0b",
      fillOpacity: sel ? 0.45 : 0.32,
    };
  }

  function pintarFicha(lista) {
    const partes = $("adc-partes");
    const p = seleccionado;
    if (!p) {
      partes.innerHTML = `<article class="adc-parte"><h3>Sin acuerdo en este filtro</h3><p>Loreto y San Martín todavía no tienen un acuerdo cargado en este dashboard. El que está firmado y mapeado es Illapani, en Cusco.</p></article>`;
      return;
    }
    const lugar = [p.sector, p.centro_poblado, p.distrito, p.provincia, p.region].filter(Boolean).join(", ");
    const pdf = p.pdf
      ? `<p style="margin-top:.7rem"><a class="acuerdos-pdf" href="${esc(p.pdf)}" target="_blank" rel="noopener"><i class="fas fa-file-pdf"></i> Ver el acuerdo</a></p>`
      : "";
    partes.innerHTML = `
      <article class="adc-parte"><i class="fas fa-users"></i><h3>Partes</h3><p>Gobierno Regional de ${esc(p.region)} y ${esc(p.suscriptor)}. ${esc(p.numero || "")}</p></article>
      <article class="adc-parte"><i class="fas fa-bullseye"></i><h3>Objeto</h3><p>${esc(p.objeto || "Cuidar el bosque del ámbito acordado.")}</p></article>
      <article class="adc-parte"><i class="fas fa-ruler-combined"></i><h3>Ámbito</h3><p>El documento señala ${ha(p.ambito_ha)}. El polígono del mapa mide ${ha(p.area_ha)}. La diferencia es la cifra firmada frente a la medición del dibujo.</p>${pdf}</article>
      <article class="adc-parte"><i class="fas fa-map-pin"></i><h3>Dónde</h3><p>${esc(lugar)}. Dentro de ${esc(p.acr)}, en la zonificación de su Plan Maestro. ${lista.length === 1 ? "Es el único acuerdo cargado con este filtro." : lista.length + " acuerdos con este filtro."}</p></article>`;
  }

  function pintarLista(lista) {
    $("adc-lista").innerHTML = lista.map((f) => {
      const p = f.properties || {};
      const activo = seleccionado && seleccionado.numero === p.numero ? " activo" : "";
      return `<button type="button" class="adc-item${activo}" data-n="${esc(p.numero)}"><span><strong>${esc(p.nombre || "Acuerdo")}</strong><small>${esc(p.acr || "")}</small></span><span>${ha(p.area_ha)}</span></button>`;
    }).join("");
    $("adc-lista").querySelectorAll(".adc-item").forEach((b) => {
      b.onclick = () => {
        const f = lista.find((x) => (x.properties || {}).numero === b.dataset.n);
        if (!f) return;
        seleccionado = f.properties;
        enfocar(f);
        pintar();
      };
    });
  }

  function enfocar(feature) {
    if (!capa) return;
    capa.eachLayer((layer) => {
      const n = (layer.feature.properties || {}).numero;
      const sel = feature && n === (feature.properties || {}).numero;
      layer.setStyle(estilo(sel));
      if (sel) {
        layer.bringToFront();
        map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 14 });
      }
    });
  }

  function cargarLimite(codigo, departamento) {
    if (limite) { map.removeLayer(limite); limite = null; }
    if (!codigo) return;
    const dep = departamento || "cusco";
    fetch("/api/map/layers?departamento=" + encodeURIComponent(dep) + "&ambito=acr&acr=" + encodeURIComponent(codigo))
      .then((r) => (r.ok ? r.json() : null))
      .then((layers) => {
        if (!layers || !layers.acr) return;
        limite = L.geoJSON(layers.acr, {
          style: { color: "#2E7D32", weight: 2.4, fill: false },
          interactive: false,
        }).addTo(map);
        if (capa) capa.bringToFront();
      })
      .catch(() => {});
  }

  function pintar() {
    const lista = visibles();
    const doc = lista.reduce((s, f) => s + (Number(f.properties.ambito_ha) || 0), 0);
    const dibujo = lista.reduce((s, f) => s + (Number(f.properties.area_ha) || 0), 0);
    const acrs = new Set(lista.map((f) => f.properties.acr_codigo).filter(Boolean));
    $("kpi-acuerdos").textContent = String(lista.length);
    $("kpi-acuerdos-sub").textContent = lista.length ? "Suscritos y con polígono" : "Ninguno con este filtro";
    $("kpi-documento").textContent = lista.length ? ha(doc) : "—";
    $("kpi-mapa").textContent = lista.length ? ha(dibujo) : "—";
    $("kpi-acr").textContent = acrs.size + " de 9";
    $("adc-vacio").hidden = lista.length > 0;
    const filtros = $("departamento").value !== "todos" || $("nombre_acr").value !== "todos";
    $("btn-restablecer").classList.toggle("hidden", !filtros);
    $("filter-info").textContent = lista.length
      ? `${lista.length} acuerdo${lista.length === 1 ? "" : "s"} · ${ha(dibujo)} en el mapa · no autoriza deforestación`
      : "En Loreto y San Martín este dashboard todavía no tiene un acuerdo cargado.";

    if (!seleccionado || !lista.some((f) => f.properties.numero === seleccionado.numero)) {
      seleccionado = lista[0] ? lista[0].properties : null;
    }
    pintarLista(lista);
    pintarFicha(lista);

    if (capa) { map.removeLayer(capa); capa = null; }
    if (!lista.length) {
      if (limite) { map.removeLayer(limite); limite = null; }
      $("dash-map-period").textContent = "En este filtro todavía no hay un acuerdo cargado.";
      map.setView([-9.2, -74.5], 5);
      return;
    }
    capa = L.geoJSON({ type: "FeatureCollection", features: lista }, {
      style: (f) => estilo(seleccionado && f.properties.numero === seleccionado.numero),
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        layer.bindTooltip(`${p.nombre || "Acuerdo"} · ${ha(p.area_ha)}`, { sticky: true });
        layer.on("click", () => {
          seleccionado = p;
          enfocar(feature);
          pintarLista(lista);
          pintarFicha(lista);
          cargarLimite(p.acr_codigo, regionKey(p.region));
        });
      },
    }).addTo(map);
    const elegido = lista.find((f) => f.properties.numero === (seleccionado && seleccionado.numero)) || lista[0];
    enfocar(elegido);
    cargarLimite(elegido.properties.acr_codigo, regionKey(elegido.properties.region));
    $("dash-map-period").textContent = `${elegido.properties.nombre} · ${elegido.properties.acr} · polígono ámbar dentro del límite verde`;
    setTimeout(() => map.invalidateSize(), 120);
  }

  $("departamento").onchange = () => { llenarAcr(); seleccionado = null; pintar(); };
  $("nombre_acr").onchange = () => { seleccionado = null; pintar(); };
  $("estado").onchange = pintar;
  $("btn-restablecer").onclick = () => {
    $("departamento").value = "todos";
    llenarAcr();
    $("nombre_acr").value = "todos";
    $("estado").value = "todos";
    seleccionado = null;
    pintar();
  };

  function activar(tab) {
    document.querySelectorAll(".nav-tabs button[data-tab]").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.classList.toggle("active", p.id === "tab-" + tab);
    });
    if (tab === "dashboard") setTimeout(() => map.invalidateSize(), 80);
  }
  document.querySelectorAll(".nav-tabs button[data-tab]").forEach((b) => {
    b.addEventListener("click", () => activar(b.dataset.tab));
  });
  if ((new URLSearchParams(location.search).get("tab") || "") === "marco") activar("marco");

  fetch("/assets/data/acuerdos_conservacion.geojson")
    .then((r) => { if (!r.ok) throw new Error("sin datos"); return r.json(); })
    .then((gj) => {
      geo = gj && gj.features ? gj : { features: [] };
      llenarAcr();
      pintar();
    })
    .catch(() => {
      $("filter-info").textContent = "No se pudo cargar el acuerdo.";
      $("adc-vacio").hidden = false;
    });
})();
