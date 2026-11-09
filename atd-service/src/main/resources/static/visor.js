(() => {
  'use strict';

  const API = '/api/atd';
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const COLOR = { antropica: '#e53935', natural: '#1e88e5', falsa: '#9e9e9e', pendiente: '#fb8c00' };
  const TEXTO = { antropica: 'Pérdida antrópica', natural: 'Cambio natural', falsa: 'Falsa alerta', pendiente: 'Pendiente' };

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d = 2) => Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const ha = (v) => `${num(v)} ha`;
  const fecha = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '–');
  const clase = (p) => (p.estado === 'pendiente' ? 'pendiente' : p.resultado || 'pendiente');

  function utmDe(lat, lon) {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return '';
    const a = 6378137;
    const f = 1 / 298.257223563;
    const k0 = 0.9996;
    const e2 = f * (2 - f);
    const ep2 = e2 / (1 - e2);
    const zone = Math.floor((lo + 180) / 6) + 1;
    const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
    const latR = la * Math.PI / 180;
    const lonR = lo * Math.PI / 180;
    const sen = Math.sin(latR);
    const cos = Math.cos(latR);
    const tan = Math.tan(latR);
    const N = a / Math.sqrt(1 - e2 * sen * sen);
    const T = tan * tan;
    const C = ep2 * cos * cos;
    const A = (lonR - lon0) * cos;
    const e4 = e2 * e2;
    const e6 = e4 * e2;
    const M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * latR
      - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * latR)
      + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * latR)
      - (35 * e6 / 3072) * Math.sin(6 * latR));
    const este = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
    let norte = k0 * (M + N * tan * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
    if (la < 0) norte += 10000000;
    const metros = (n) => Math.round(n).toLocaleString('es-PE');
    return `${zone}${la < 0 ? 'S' : 'N'}  ${metros(este)} E  ${metros(norte)} N`;
  }

  const irAlLogin = () => { location.assign('/login.html'); };
  const tokenCsrf = () => decodeURIComponent((document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN=')) || '').slice(11));

  async function api(ruta, fresco = false) {
    const r = await fetch(API + ruta, fresco ? { cache: 'reload' } : undefined);
    if (r.status === 401) { irAlLogin(); throw new Error('Sesión vencida'); }
    if (!r.ok) throw new Error(`${r.status} ${ruta}`);
    return r.json();
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 3200);
  }

  const st = {
    territorios: [], region: null, acr: null, ambito: 'ambos', anio: null, mes: null,
    periodos: [], periodosPorAcr: {}, eje: [], calAnio: null, resumen: null, geo: null, filtro: 'todas', alerta: null, escenas: [],
    pasoMax: 1, modo: 'consulta', catalogos: null,
    cl: { cola: [], idx: -1, hechas: {}, duda: {}, resultado: null, causa: null, conf: 1, bosque: 1, desdeRed: false, guardando: false },
  };

  /* ====================================================== MAPA */
  const mapa = L.map('mapa', { zoomControl: true, preferCanvas: false }).setView([-7.8, -74.8], 6);
  // Servicios ArcGIS sin caché de teselas: se pide cada tesela como un export con su bbox en EPSG:3857.
  const TeselaExport = L.TileLayer.extend({
    getTileUrl(c) {
      const t = this.getTileSize();
      const nw = mapa.options.crs.project(mapa.unproject([c.x * t.x, c.y * t.y], c.z));
      const se = mapa.options.crs.project(mapa.unproject([(c.x + 1) * t.x, (c.y + 1) * t.y], c.z));
      return `${this._url}?bbox=${nw.x},${se.y},${se.x},${nw.y}&bboxSR=3857&imageSR=3857&size=${t.x},${t.y}&${this.options.extra}`;
    },
  });
  // Escenas Sentinel-2 L2A de 2026 con nubosidad ≤ 30 %, la más reciente encima (archivo vivo de Esri).
  const S2_2026 = 'format=jpgpng&f=image'
    + `&mosaicRule=${encodeURIComponent(JSON.stringify({ mosaicMethod: 'esriMosaicAttribute', sortField: 'acquisitiondate', sortValue: '2099/12/31', ascending: true, where: "acquisitiondate >= timestamp '2026-01-01 00:00:00' AND cloudcover <= 0.3" }))}`
    // Sin DRA: el estiramiento por tesela deja costuras; el contraste se realza con CSS (.s2-2026).
    + `&renderingRule=${encodeURIComponent(JSON.stringify({ rasterFunction: 'Natural Color' }))}`;
  const bases = {
    esri: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri World Imagery' }),
    s2026: new TeselaExport('https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer/exportImage', { maxZoom: 18, maxNativeZoom: 16, extra: S2_2026, className: 's2-2026', attribution: 'Sentinel-2 L2A 2026 (nubes ≤ 30 %) · Copernicus / Esri' }),
    s2: L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg', { maxZoom: 17, attribution: 'Sentinel-2 cloudless 2024 · EOX (Copernicus)' }),
    topo: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' }),
    gris: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '© OpenStreetMap · CARTO' }),
  };
  let base = bases.esri.addTo(mapa);
  const etiquetas = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: .8 }).addTo(mapa);
  const geobosques = new TeselaExport('https://gis.bosques.gob.pe/server/rest/services/Interoperabilidad/alertas_tempranas_2026/MapServer/export', { maxZoom: 19, opacity: .95, extra: 'format=png32&transparent=true&f=image', attribution: 'ATD GeoBosques · MINAM' });

  const NOMBRE_LIMITE = {
    ACR_AA: 'ACR Ampiyacu Apayacu', ZI_AA: 'ZI Ampiyacu Apayacu',
    ACR_ANPCH: 'ACR Alto Nanay - Pintuyacu Chambira', ZI_ANPCH: 'ZI Alto Nanay - Pintuyacu Chambira',
    ACR_CTT: 'ACR Comunal Tamshiyacu Tahuayo', ZI_CTT: 'ZI Comunal Tamshiyacu Tahuayo',
    ACR_MK: 'ACR Maijuna Kichwa', ZI_MK: 'ZI Maijuna Kichwa',
    ACR_MPA: 'ACR Medio Putumayo Algodón',
    ACR_BSM: 'ACR Bosques de Shunté y Mishollo', ZI_BSM: 'ZI Bosques de Shunté y Mishollo',
    ACR_CE: 'ACR Cordillera Escalera', ZI_CE: 'ZI Cordillera Escalera',
    ACR_CHQ: 'ACR Choquequirao', ZI_CHQ: 'ZI Choquequirao',
    ACR_CHU: 'ACR Chuyapi Urusayhua', ZI_CHU: 'ZI Chuyapi Urusayhua',
    ACR_QK: "ACR Q'eros Kosñipata", ZI_QK: "ZI Q'eros Kosñipata",
  };

  const capaLimites = L.geoJSON(null, {
    style: (f) => {
      const p = f.properties || {};
      const sel = p.codigo === st.acr || p.codigo === (st.acr || '').replace('ACR_', 'ZI_');
      const esAcr = String(p.tipo || p.layer || '').toUpperCase() === 'ACR';
      return {
        color: esAcr ? '#2E7D32' : '#616161',
        weight: esAcr ? 2.5 : 2,
        opacity: sel || !st.acr ? 1 : .4,
        fill: false,
      };
    },
    onEachFeature: (f, l) => {
      const p = f.properties || {};
      const nombre = p.nombre || NOMBRE_LIMITE[p.codigo] || p.codigo;
      l.bindTooltip(nombre, { sticky: true });
    },
  }).addTo(mapa);

  const capaAlertas = L.featureGroup().addTo(mapa);
  const capaPuntos = L.featureGroup().addTo(mapa);
  const capaPropuesta = L.geoJSON(null, {
    interactive: false,
    smoothFactor: 2.6,
    style: {
      color: '#e8b931', weight: 1.7, opacity: .95,
      dashArray: '6 7', lineCap: 'round', lineJoin: 'round',
      fillOpacity: 0,
    },
  });
  const marcas = new Map();

  function estiloAlerta(p, sel) {
    return {
      color: sel ? '#ffffff' : '#e53935',
      weight: sel ? 3.2 : 2.4,
      fillColor: '#e53935',
      fillOpacity: sel ? 0.28 : 0.16,
    };
  }

  function abrirDesdeMapa(codigo, ev) {
    if (ev) L.DomEvent.stop(ev);
    if (st.modo === 'clasificar') abrirClasificacion(codigo);
    else verAlerta(codigo);
  }

  function codigoCercano(latlng, px) {
    const aqui = mapa.latLngToContainerPoint(latlng);
    let mejor = null;
    let dist = px;
    marcas.forEach((m, codigo) => {
      const q = mapa.latLngToContainerPoint(m.punto.getLatLng());
      const d = aqui.distanceTo(q);
      if (d <= dist) { dist = d; mejor = codigo; }
    });
    return mejor;
  }

  function dibujarAlertas(features) {
    capaAlertas.clearLayers();
    capaPuntos.clearLayers();
    marcas.clear();
    features.forEach((f) => {
      const p = f.properties;
      const poli = L.geoJSON(f, { style: () => estiloAlerta(p, false) });
      const punto = L.circleMarker([p.lat, p.lon], {
        radius: radioPunto(), color: '#fff', weight: 1.5, fillColor: COLOR[clase(p)], fillOpacity: .95,
      });
      poli.bindTooltip(`${p.codigo} · ${ha(p.superficie_ha)} · un solo polígono`);
      punto.bindTooltip(`${p.codigo} · centro de esta misma alerta`);
      [poli, punto].forEach((l) => l.on('click', (ev) => abrirDesdeMapa(p.codigo, ev)));
      capaAlertas.addLayer(poli);
      capaPuntos.addLayer(punto);
      marcas.set(p.codigo, { poli, punto, p });
    });
    if (ed.codigo && (ed.capa || ed.redibujando)) {
      const oculta = marcas.get(ed.codigo);
      if (oculta) {
        capaAlertas.removeLayer(oculta.poli);
        capaPuntos.removeLayer(oculta.punto);
      }
    }
    ajustarPuntos();
    if (mapa.hasLayer(capaAlertas)) capaAlertas.bringToFront();
    if (mapa.hasLayer(capaPuntos)) capaPuntos.bringToFront();
  }

  mapa.on('click', (e) => {
    if (st.modo !== 'clasificar' || ed.capa || ed.redibujando) return;
    const codigo = codigoCercano(e.latlng, 64);
    if (codigo) abrirClasificacion(codigo);
  });

  // En pantallas angostas el panel flota sobre el mapa: el encuadre debe dejar libre lo que tapa.
  function encuadre(margen) {
    const tapado = $('panel').classList.contains('oculto') ? 0
      : Math.max(0, $('panel').getBoundingClientRect().right - $('mapa').getBoundingClientRect().left);
    return { paddingTopLeft: [tapado + margen, margen], paddingBottomRight: [margen, margen], duration: .8 };
  }

  function resaltar(codigo) {
    marcas.forEach(({ poli, p }, c) => poli.setStyle(estiloAlerta(p, c === codigo)));
    const m = marcas.get(codigo);
    if (m) {
      m.poli.bringToFront();
      mapa.flyToBounds(m.poli.getBounds(), { ...encuadre(80), maxZoom: 16 });
    }
  }

  function radioPunto() {
    const z = mapa.getZoom();
    if (z >= 15) return 6;
    if (z >= 12) return 7;
    if (z >= 9) return 8;
    return 10;
  }

  function ajustarPuntos() {
    const ver = $('c-alertas').checked;
    if (ver && !mapa.hasLayer(capaPuntos)) mapa.addLayer(capaPuntos);
    if (!ver && mapa.hasLayer(capaPuntos)) mapa.removeLayer(capaPuntos);
    const r = radioPunto();
    capaPuntos.eachLayer((l) => { if (l.setRadius) l.setRadius(r); });
    const prop = $('c-propuesta');
    const verProp = !!prop && prop.checked && mapa.getZoom() >= 14;
    if (verProp && !mapa.hasLayer(capaPropuesta)) mapa.addLayer(capaPropuesta);
    if (!verProp && mapa.hasLayer(capaPropuesta)) mapa.removeLayer(capaPropuesta);
    capaAlertas.bringToFront();
    if (mapa.hasLayer(capaPuntos)) capaPuntos.bringToFront();
  }
  mapa.on('zoomend', ajustarPuntos);

  /* Cuadrícula EXA, zonificación y sectores: sin relleno. En satélite la línea es clara; en el mapa claro, negra. */
  const lienzoRef = L.canvas({ padding: 0.15 });
  function tonoRef() {
    const v = document.querySelector('input[name=base]:checked');
    const id = v ? v.value : 'esri';
    return (id === 'topo' || id === 'gris') ? '#1a1a1a' : '#efe6d0';
  }
  function estiloRef(clave) {
    const color = tonoRef();
    if (clave === 'zon') return { color, weight: 2.3, opacity: .92, fill: false };
    if (clave === 'sec') return { color, weight: 2, opacity: .92, dashArray: '7 5', fill: false };
    return { color, weight: 1.2, opacity: .88, fill: false };
  }
  const capaRef = {
    exa: L.geoJSON(null, { interactive: false, renderer: lienzoRef, style: () => estiloRef('exa') }),
    zon: L.geoJSON(null, { interactive: false, renderer: lienzoRef, style: () => estiloRef('zon') }),
    sec: L.geoJSON(null, { interactive: false, renderer: lienzoRef, style: () => estiloRef('sec') }),
  };
  const etiquetasRef = L.layerGroup();
  const refDatos = {};
  const refCarga = {};
  const refClave = {};
  let refGen = 0;
  const REF = {
    exa: { url: '/limites/exa.geojson', caja: 'c-exa', ley: 'ley-exa', zoom: 10, zoomEtiqueta: 13, tope: 12000, cupo: 50 },
    zon: { url: '/limites/zonif.geojson', caja: 'c-zon', ley: 'ley-zon', zoom: 8, zoomEtiqueta: 10, tope: 2000, cupo: 36 },
    sec: { url: '/limites/sectores.geojson', caja: 'c-sec', ley: 'ley-sec', zoom: 8, zoomEtiqueta: 9, tope: 400, cupo: 24 },
  };

  function cajaGeom(g) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    const rec = (c) => {
      if (typeof c[0] === 'number') {
        if (c[0] < minx) minx = c[0];
        if (c[1] < miny) miny = c[1];
        if (c[0] > maxx) maxx = c[0];
        if (c[1] > maxy) maxy = c[1];
      } else c.forEach(rec);
    };
    rec(g.coordinates);
    return [minx, miny, maxx, maxy];
  }

  function centroGeom(g) {
    const anillo = g.type === 'Polygon' ? g.coordinates[0] : (g.coordinates[0] && g.coordinates[0][0]);
    if (!anillo || !anillo.length) return [0, 0];
    let x = 0, y = 0;
    const n = anillo.length > 1 ? anillo.length - 1 : anillo.length;
    for (let i = 0; i < n; i++) { x += anillo[i][0]; y += anillo[i][1]; }
    return [y / n, x / n];
  }

  function cruza(caja, b) {
    return caja[0] <= b.getEast() && caja[2] >= b.getWest() && caja[1] <= b.getNorth() && caja[3] >= b.getSouth();
  }

  function asegurarRef(clave) {
    if (refDatos[clave]) return Promise.resolve();
    if (!refCarga[clave]) {
      refCarga[clave] = fetch(REF[clave].url).then(async (r) => {
        if (!r.ok) throw new Error(clave);
        const gj = await r.json();
        refDatos[clave] = (gj.features || []).map((f) => ({
          acr: f.properties.acr,
          label: f.properties.label,
          geometry: f.geometry,
          caja: cajaGeom(f.geometry),
          centro: centroGeom(f.geometry),
        }));
      });
    }
    return refCarga[clave];
  }

  function pintarEtiquetasRef() {
    etiquetasRef.clearLayers();
    const z = mapa.getZoom();
    const b = mapa.getBounds();
    const centro = mapa.getCenter();
    const acr = acrDeReferencia();
    let puestos = 0;
    ['sec', 'zon', 'exa'].forEach((clave) => {
      const def = REF[clave];
      const caja = $(def.caja);
      if (!caja || !caja.checked || !refDatos[clave] || z < def.zoomEtiqueta) return;
      const cerca = refDatos[clave].filter((f) => (!acr || f.acr === acr) && cruza(f.caja, b));
      cerca.sort((a, c) => centro.distanceTo(a.centro) - centro.distanceTo(c.centro));
      cerca.slice(0, def.cupo).forEach((f) => {
        const punto = L.circleMarker(f.centro, { radius: 0, stroke: false, fill: false, interactive: false });
        punto.bindTooltip(f.label, { permanent: true, direction: 'center', className: 'etiq-ref', opacity: 1 });
        etiquetasRef.addLayer(punto);
        puestos += 1;
      });
    });
    if (puestos && !mapa.hasLayer(etiquetasRef)) etiquetasRef.addTo(mapa);
    if (!puestos && mapa.hasLayer(etiquetasRef)) mapa.removeLayer(etiquetasRef);
  }

  function acrDeReferencia() {
    if (st.modo === 'clasificar') return st.acr && String(st.acr).startsWith('ACR_') ? st.acr : null;
    const sel = $('f-acr') ? $('f-acr').value : 'todas';
    if (!sel || sel === 'todas') return null;
    if (String(sel).startsWith('ZI_')) return sel.replace('ZI_', 'ACR_');
    return String(sel).startsWith('ACR_') ? sel : null;
  }

  async function pintarReferencia() {
    const gen = ++refGen;
    const z = mapa.getZoom();
    const b = mapa.getBounds();
    const acr = acrDeReferencia();
    const activas = [];
    for (const clave of Object.keys(REF)) {
      const def = REF[clave];
      const caja = $(def.caja);
      const filtro = $(`f-${def.caja}`);
      const activo = !!(caja && caja.checked);
      document.querySelectorAll(`.${def.ley}`).forEach((nodo) => { nodo.hidden = !activo; });
      if (filtro && filtro.checked !== activo) filtro.checked = activo;
      if (!activo) {
        if (mapa.hasLayer(capaRef[clave])) mapa.removeLayer(capaRef[clave]);
        refClave[clave] = '';
        continue;
      }
      activas.push(clave);
    }
    try {
      await Promise.all(activas.map((clave) => asegurarRef(clave)));
    } catch {
      toast('No se pudo cargar la capa');
      return;
    }
    if (gen !== refGen) return;
    for (const clave of activas) {
      const def = REF[clave];
      const firma = acr && z >= def.zoom
        ? `${acr}|fijo`
        : (z < def.zoom ? 'lejos' : `vista|${b.getWest().toFixed(2)}|${b.getSouth().toFixed(2)}|${b.getEast().toFixed(2)}|${b.getNorth().toFixed(2)}`);
      if (refClave[clave] === firma && (firma === 'lejos' || mapa.hasLayer(capaRef[clave]))) continue;
      refClave[clave] = firma;
      capaRef[clave].clearLayers();
      if (z < def.zoom) {
        if (mapa.hasLayer(capaRef[clave])) mapa.removeLayer(capaRef[clave]);
        continue;
      }
      const feats = [];
      for (const f of refDatos[clave]) {
        if (acr && f.acr !== acr) continue;
        if (!acr && !cruza(f.caja, b)) continue;
        feats.push({ type: 'Feature', properties: {}, geometry: f.geometry });
        if (feats.length >= def.tope) break;
      }
      if (feats.length) {
        capaRef[clave].addData({ type: 'FeatureCollection', features: feats });
        if (!mapa.hasLayer(capaRef[clave])) capaRef[clave].addTo(mapa);
      } else if (mapa.hasLayer(capaRef[clave])) {
        mapa.removeLayer(capaRef[clave]);
      }
    }
    pintarEtiquetasRef();
    if (mapa.hasLayer(capaAlertas)) capaAlertas.bringToFront();
    if (mapa.hasLayer(capaPuntos)) capaPuntos.bringToFront();
  }

  function engancharReferencia(id) {
    const el = $(id);
    const filtro = $(`f-${id}`);
    if (!el) return;
    el.onchange = () => {
      if (filtro) filtro.checked = el.checked;
      pintarReferencia();
    };
    if (filtro) filtro.onchange = () => { el.checked = filtro.checked; el.onchange(); };
  }
  ['c-exa', 'c-zon', 'c-sec'].forEach(engancharReferencia);
  mapa.on('moveend', () => { pintarReferencia(); });

  async function cargarLimitesOficiales() {
    if (capaLimites.getLayers().length) return;
    const [acr, zi] = await Promise.all([
      fetch('/limites/acr.geojson').then((r) => r.json()),
      fetch('/limites/zi.geojson').then((r) => r.json()),
    ]);
    capaLimites.addData(acr);
    capaLimites.addData(zi);
    capaLimites.bringToFront();
    const loreto = new Set(['ACR_AA', 'ZI_AA', 'ACR_ANPCH', 'ZI_ANPCH', 'ACR_CTT', 'ZI_CTT', 'ACR_MK', 'ZI_MK', 'ACR_MPA']);
    const foco = capaLimites.getLayers().filter((l) => loreto.has(l.feature.properties.codigo));
    if (!st.region && foco.length) mapa.fitBounds(L.featureGroup(foco).getBounds(), encuadre(40));
  }

  function dist2Segmento(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy || 1e-18;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
    return x * x + y * y;
  }

  /** Quita el zigzag de un píxel a otro. El trazo queda continuo, como un contorno dibujado. */
  function simplificarAnillo(anillo, tol) {
    if (!anillo || anillo.length < 6) return anillo;
    const tol2 = tol * tol;
    const cerrado = anillo[0][0] === anillo[anillo.length - 1][0] && anillo[0][1] === anillo[anillo.length - 1][1];
    const pts = cerrado ? anillo.slice(0, -1) : anillo.slice();
    if (pts.length < 4) return anillo;
    const recortar = (lista) => {
      const keep = new Uint8Array(lista.length);
      keep[0] = 1;
      keep[lista.length - 1] = 1;
      const pila = [[0, lista.length - 1]];
      while (pila.length) {
        const [a, b] = pila.pop();
        let max = 0, idx = -1;
        for (let i = a + 1; i < b; i++) {
          const d = dist2Segmento(lista[i], lista[a], lista[b]);
          if (d > max) { max = d; idx = i; }
        }
        if (idx > 0 && max > tol2) {
          keep[idx] = 1;
          pila.push([a, idx], [idx, b]);
        }
      }
      const out = [];
      for (let i = 0; i < lista.length; i++) if (keep[i]) out.push(lista[i]);
      return out;
    };
    let lejos = 1, mejor = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[0][0], dy = pts[i][1] - pts[0][1];
      const d = dx * dx + dy * dy;
      if (d > mejor) { mejor = d; lejos = i; }
    }
    const ida = recortar(pts.slice(0, lejos + 1));
    const vuelta = recortar(pts.slice(lejos).concat([pts[0]]));
    const out = ida.slice(0, -1).concat(vuelta);
    return out.length >= 4 ? out : anillo;
  }

  function simplificarGeom(geom) {
    const tol = 0.00055;
    const anillos = (lista) => lista.map((a) => simplificarAnillo(a, tol));
    if (!geom) return geom;
    if (geom.type === 'Polygon') return { ...geom, coordinates: anillos(geom.coordinates) };
    if (geom.type === 'MultiPolygon') return { ...geom, coordinates: geom.coordinates.map(anillos) };
    return geom;
  }

  function cargarPropuesta() {
    return fetch('/limites/propuesta_loreto.geojson')
      .then((r) => (r.ok ? r.json() : null))
      .then((gj) => {
        if (!gj) return;
        gj.features.forEach((f) => { f.geometry = simplificarGeom(f.geometry); });
        capaPropuesta.addData(gj);
        ajustarPuntos();
      })
      .catch(() => {});
  }

  async function cargarLimitesRegion(region) {
    await cargarLimitesOficiales();
    const codigos = new Set(st.territorios
      .filter((t) => t.region === region)
      .flatMap((t) => [t.codigo, t.codigo.replace('ACR_', 'ZI_')]));
    const capas = capaLimites.getLayers().filter((l) => codigos.has(l.feature.properties.codigo));
    if (capas.length) mapa.flyToBounds(L.featureGroup(capas).getBounds(), encuadre(30));
    else if (capaLimites.getLayers().length) mapa.flyToBounds(capaLimites.getBounds(), encuadre(30));
  }

  function enfocarAcr() {
    capaLimites.setStyle(capaLimites.options.style);
    const capas = capaLimites.getLayers().filter((l) => l.feature.properties.codigo.endsWith(st.acr.replace('ACR_', '_')));
    if (capas.length) mapa.flyToBounds(L.featureGroup(capas).getBounds(), encuadre(30));
  }

  /* Panel de capas */
  $('capas-btn').onclick = () => $('capas-cuerpo').classList.toggle('oculto');
  $('c-alertas').onchange = (e) => {
    if ($('f-c-alertas')) $('f-c-alertas').checked = e.target.checked;
    ajustarPuntos();
  };
  $('c-poli').onchange = (e) => {
    if (e.target.checked) mapa.addLayer(capaAlertas);
    else mapa.removeLayer(capaAlertas);
    if ($('f-c-poli')) $('f-c-poli').checked = e.target.checked;
  };
  $('c-geob').onchange = (e) => {
    document.querySelectorAll('.ley-geob').forEach((d) => (d.hidden = !e.target.checked));
    if ($('f-c-geob')) $('f-c-geob').checked = e.target.checked;
    if (e.target.checked) { geobosques.addTo(mapa); toast('GeoBosques 2026: magenta = última semana, azul = acumulado del año'); } else mapa.removeLayer(geobosques);
  };
  const capaSemana = L.geoJSON(null, {
    style: { color: '#c45c26', weight: 1.6, fillColor: '#c45c26', fillOpacity: 0.2 },
    onEachFeature: (f, capa) => {
      const p = f.properties || {};
      capa.bindTooltip(`${p.region} · ${p.ambito} · ${p.fecha} · ${num(p.ha)} ha`);
    },
  });
  let semanaLista = null;
  async function verSemana(prender) {
    document.querySelectorAll('.ley-semana').forEach((nodo) => { nodo.hidden = !prender; });
    if (!prender) {
      if (mapa.hasLayer(capaSemana)) mapa.removeLayer(capaSemana);
      return;
    }
    if (!semanaLista) {
      const r = await fetch('/limites/semana.geojson');
      if (!r.ok) { toast('No se pudo cargar la semana nueva'); return; }
      semanaLista = await r.json();
      capaSemana.addData(semanaLista);
    }
    if (!mapa.hasLayer(capaSemana)) capaSemana.addTo(mapa);
    capaSemana.bringToFront();
  }
  if ($('c-semana')) $('c-semana').onchange = (e) => {
    if ($('f-c-semana')) $('f-c-semana').checked = e.target.checked;
    verSemana(e.target.checked);
  };
  if ($('c-geob').checked) geobosques.addTo(mapa);
  $('c-limites').onchange = (e) => (e.target.checked ? mapa.addLayer(capaLimites) : mapa.removeLayer(capaLimites));
  if ($('c-propuesta')) $('c-propuesta').onchange = () => ajustarPuntos();
  document.querySelectorAll('input[name=base]').forEach((r) => (r.onchange = () => {
    mapa.removeLayer(base);
    base = bases[r.value].addTo(mapa);
    base.bringToBack();
    etiquetas.bringToFront();
    Object.entries(capaRef).forEach(([clave, capa]) => capa.setStyle(estiloRef(clave)));
  }));

  /* ====================================================== SINCRONIZACIÓN */
  async function sincronizacion() {
    try {
      const s = await api('/sincronizacion');
      const g = s.geobosques;
      $('sync').classList.add('ok');
      $('sync-titulo').textContent = g ? `GeoBosques: monitoreo del ${g.desde} al ${g.hasta}` : 'GeoBosques sin respuesta';
      $('sync-detalle').textContent = 'Actualización de alertas cada 15 días aprox.';
      $('acerca-semana').textContent = g ? `${g.desde} – ${g.hasta}` : '–';
      const b = $('badge-pend');
      b.textContent = s.alertas.por_clasificar;
      b.hidden = !s.alertas.por_clasificar;
    } catch (e) {
      $('sync-titulo').textContent = 'Sin conexión con el servicio';
    }
  }

  /* ====================================================== PASOS */
  function irPaso(n) {
    if (n > st.pasoMax) return;
    document.querySelectorAll('#modo-consulta .paso').forEach((d) => (d.hidden = +d.dataset.paso !== n));
    document.querySelectorAll('#pasos li').forEach((li) => {
      const p = +li.dataset.paso;
      li.classList.toggle('activo', p === n);
      li.classList.toggle('hecho', p < n && p <= st.pasoMax);
      li.classList.toggle('bloq', p > st.pasoMax);
    });
    document.querySelector('#modo-consulta .cuerpo').scrollTop = 0;
  }
  function desbloquear(n) { st.pasoMax = Math.max(st.pasoMax, n); irPaso(n); }
  document.querySelectorAll('#pasos li').forEach((li) => (li.onclick = () => irPaso(+li.dataset.paso)));

  /* ---------- Paso 1: filtros (periodo, tamaño, región, ACR) ---------- */
  const ym = (p) => p.anio * 12 + p.mes;
  const etiquetaMes = (p) => `${String(p.mes).padStart(2, '0')}/${p.anio}`;

  function acrsDeRegion(region) {
    return st.territorios.filter((t) => t.region === region && t.tipo === 'ACR');
  }

  function llenarRegiones() {
    const regiones = [...new Map(st.territorios.map((t) => [t.region, t.regionNombre])).entries()];
    $('f-region').innerHTML = regiones.map(([cod, nom]) => {
      const n = st.territorios.filter((t) => t.region === cod).reduce((s, t) => s + t.alertas, 0);
      return `<option value="${esc(cod)}">${esc(nom)} · ${num(n, 0)} alertas</option>`;
    }).join('');
  }

  function llenarAcrs() {
    const acrs = acrsDeRegion(st.region);
    const opts = [`<option value="todas">Todas las ACR de la región</option>`]
      .concat(acrs.map((t) => {
        const zi = st.territorios.find((z) => z.codigo === t.codigo.replace('ACR_', 'ZI_'));
        const total = t.alertas + (zi ? zi.alertas : 0);
        return `<option value="${esc(t.codigo)}">${esc(t.nombre)} · ${num(total, 0)}</option>`;
      }));
    $('f-acr').innerHTML = opts.join('');
  }

  function acrsElegidos() {
    if ($('f-acr').value === 'todas') return acrsDeRegion(st.region).map((t) => t.codigo);
    return $('f-acr').value ? [$('f-acr').value] : [];
  }

  function mesesElegidos() {
    if (!st.eje.length) return [];
    let a = +$('f-desde').value;
    let b = +$('f-hasta').value;
    if (a > b) [a, b] = [b, a];
    const desde = st.eje[a];
    const hasta = st.eje[b];
    if (!desde || !hasta) return [];
    const wanted = new Set();
    acrsElegidos().forEach((codigo) => {
      (st.periodosPorAcr[codigo] || []).forEach((p) => {
        if (ym(p) >= ym(desde) && ym(p) <= ym(hasta)) wanted.add(`${p.anio}-${p.mes}`);
      });
    });
    return [...wanted].map((k) => {
      const [anio, mes] = k.split('-').map(Number);
      return { anio, mes };
    }).sort((x, y) => ym(x) - ym(y));
  }

  let calAncla = null;

  function aniosDelEje() {
    return [...new Set(st.eje.map((p) => p.anio))].sort((x, y) => x - y);
  }

  function indiceMes(anio, mes) {
    return st.eje.findIndex((p) => p.anio === anio && p.mes === mes);
  }

  function mesConAlertas(anio, mes) {
    return acrsDeRegion(st.region).some((t) => (st.periodosPorAcr[t.codigo] || []).some((p) => p.anio === anio && p.mes === mes));
  }

  function pintarCalendario() {
    const box = $('f-cal-meses');
    if (!box) return;
    const anios = aniosDelEje();
    if (!anios.length) {
      box.innerHTML = '';
      if ($('f-anio-lbl')) $('f-anio-lbl').textContent = '—';
      return;
    }
    if (!anios.includes(st.calAnio)) st.calAnio = anios[anios.length - 1];
    $('f-anio-lbl').textContent = String(st.calAnio);
    $('f-anio-prev').disabled = st.calAnio <= anios[0];
    $('f-anio-next').disabled = st.calAnio >= anios[anios.length - 1];
    const a = st.eje[+$('f-desde').value];
    const b = st.eje[+$('f-hasta').value];
    const lo = a && b ? Math.min(ym(a), ym(b)) : null;
    const hi = a && b ? Math.max(ym(a), ym(b)) : null;
    box.innerHTML = MESES.map((nombre, i) => {
      const mes = i + 1;
      const cur = st.calAnio * 12 + mes;
      const dentro = lo != null && cur >= lo && cur <= hi;
      const extremo = dentro && (cur === lo || cur === hi);
      const vacio = mesConAlertas(st.calAnio, mes) ? '' : ' vacio';
      return `<button type="button" data-mes="${mes}" class="${dentro ? 'dentro' : ''}${extremo ? ' extremo' : ''}${vacio}">${nombre.slice(0, 3)}</button>`;
    }).join('');
  }

  function pintarEtiquetasPeriodo() {
    const a = st.eje[+$('f-desde').value];
    const b = st.eje[+$('f-hasta').value];
    if (a) $('f-desde-lbl').textContent = `${MESES[a.mes - 1]} ${a.anio}`;
    if (b) $('f-hasta-lbl').textContent = `${MESES[b.mes - 1]} ${b.anio}`;
    pintarCalendario();
  }

  function seleccionarAnio(anio) {
    const idxs = [];
    st.eje.forEach((p, i) => { if (p.anio === anio) idxs.push(i); });
    if (!idxs.length) return;
    st.calAnio = anio;
    calAncla = null;
    $('f-desde').value = String(idxs[0]);
    $('f-hasta').value = String(idxs[idxs.length - 1]);
    st.anio = anio;
    st.mes = 12;
    pintarEtiquetasPeriodo();
  }

  function armarEje() {
    const puntos = [];
    acrsDeRegion(st.region).forEach((t) => (st.periodosPorAcr[t.codigo] || []).forEach((p) => puntos.push(p)));
    if (!puntos.length) {
      st.eje = [];
      st.calAnio = null;
      pintarCalendario();
      return;
    }
    const anios = [...new Set(puntos.map((p) => p.anio))].sort((x, y) => x - y);
    const eje = [];
    anios.forEach((y) => { for (let m = 1; m <= 12; m += 1) eje.push({ anio: y, mes: m }); });
    st.eje = eje;
    const anioHoy = new Date().getFullYear();
    seleccionarAnio(anios.includes(anioHoy) ? anioHoy : anios[anios.length - 1]);
    const uno = $('f-acr').value !== 'todas' ? $('f-acr').value : acrsDeRegion(st.region)[0]?.codigo;
    st.periodos = st.periodosPorAcr[uno] || [];
  }

  async function cargarPeriodosRegion() {
    const acrs = acrsDeRegion(st.region);
    const listas = await Promise.all(acrs.map((t) => api(`/periodos?acr=${t.codigo}&ambito=${st.ambito}`).catch(() => [])));
    acrs.forEach((t, i) => { st.periodosPorAcr[t.codigo] = listas[i]; });
    armarEje();
  }

  function ordenarRango(a, b, pintar) {
    const sync = () => {
      if (+a.value > +b.value) {
        if (document.activeElement === a) b.value = a.value;
        else a.value = b.value;
      }
      pintar();
    };
    a.oninput = sync;
    b.oninput = sync;
  }

  function pintarHa() {
    $('f-ha-min-lbl').textContent = num(+$('f-ha-min').value, +$('f-ha-min').value % 1 ? 1 : 0);
    const alTope = +$('f-ha-max').value >= +$('f-ha-max').max;
    $('f-ha-max-lbl').textContent = alTope ? `${num(+$('f-ha-max').max, 0)}+` : num(+$('f-ha-max').value, +$('f-ha-max').value % 1 ? 1 : 0);
  }

  async function alCambiarRegion() {
    st.region = $('f-region').value;
    llenarAcrs();
    $('f-acr').value = 'todas';
    st.acr = null;
    await cargarLimitesRegion(st.region);
    await cargarPeriodosRegion();
    await buscar();
  }

  async function alCambiarAcr() {
    st.acr = $('f-acr').value === 'todas' ? null : $('f-acr').value;
    if (st.acr) enfocarAcr();
    else if (st.region) await cargarLimitesRegion(st.region);
    const uno = st.acr || acrsDeRegion(st.region)[0]?.codigo;
    st.periodos = st.periodosPorAcr[uno] || [];
    await buscar();
  }

  function filtroExtra() {
    const q = ($('f-texto').value || '').trim();
    const porCodigo = document.querySelector('input[name="f-por"]:checked')?.value !== 'territorio';
    if (porCodigo && q) return true;
    if (!$('mb-det').hidden) {
      if (+$('f-ha-min').value > 0 || +$('f-ha-max').value < +$('f-ha-max').max) return true;
      if ($('f-resultado').value !== 'todas') return true;
      if ($('f-estado').value !== 'todas') return true;
      if ($('f-causa').value) return true;
    }
    return false;
  }

  function pasaFiltro(f) {
    const p = f.properties;
    const q = ($('f-texto').value || '').trim().toUpperCase();
    const porCodigo = document.querySelector('input[name="f-por"]:checked')?.value !== 'territorio';
    if (porCodigo && q && !String(p.codigo).toUpperCase().includes(q)) return false;
    if (!$('mb-det').hidden) {
      const haMin = +$('f-ha-min').value;
      const haMax = +$('f-ha-max').value >= +$('f-ha-max').max ? Infinity : +$('f-ha-max').value;
      const s = +p.superficie_ha || 0;
      if (s < haMin || s > haMax) return false;
      const res = $('f-resultado').value;
      if (res !== 'todas' && clase(p) !== res) return false;
      const estado = $('f-estado').value;
      if (estado === 'pendiente' && p.estado !== 'pendiente') return false;
      if (estado === 'validada' && p.estado !== 'validada') return false;
      if (estado === 'constatada' && !p.con_foto) return false;
      const causa = $('f-causa').value;
      if (causa && String(p.causa_id) !== causa) return false;
    }
    return true;
  }

  async function traerAlertas(acrs, meses) {
    const pedidos = [];
    acrs.forEach((acr) => {
      const tiene = new Set((st.periodosPorAcr[acr] || []).map((p) => `${p.anio}-${p.mes}`));
      meses.forEach((p) => {
        if (tiene.has(`${p.anio}-${p.mes}`)) {
          pedidos.push(api(`/alertas?acr=${acr}&ambito=${st.ambito}&anio=${p.anio}&mes=${p.mes}`).catch(() => ({ features: [] })));
        }
      });
    });
    const geos = [];
    for (let i = 0; i < pedidos.length; i += 6) {
      geos.push(...await Promise.all(pedidos.slice(i, i + 6)));
    }
    const vistos = new Set();
    const features = [];
    geos.forEach((g) => (g.features || []).forEach((f) => {
      const id = f.properties?.codigo || f.id;
      if (vistos.has(id)) return;
      vistos.add(id);
      features.push(f);
    }));
    return features;
  }

  function tituloTerritorio() {
    if ($('f-acr').value === 'todas') {
      const nom = $('f-region').selectedOptions[0]?.textContent?.split('·')[0]?.trim() || '';
      return `Todas las ACR · ${nom}`;
    }
    const t = st.territorios.find((x) => x.codigo === $('f-acr').value);
    return t ? t.nombre : 'Alertas';
  }

  function tituloPeriodo(meses) {
    if (!meses.length) return '';
    const a = meses[0];
    const b = meses[meses.length - 1];
    if (a.anio === b.anio && a.mes === b.mes) return `${MESES[a.mes - 1]} ${a.anio}`;
    if (a.anio === b.anio) return `${MESES[a.mes - 1].slice(0, 3)}–${MESES[b.mes - 1].slice(0, 3)} ${a.anio}`;
    return `${etiquetaMes(a)} – ${etiquetaMes(b)}`;
  }

  let buscaN = 0;
  async function buscar() {
    const yo = ++buscaN;
    const btn = $('ir-2');
    const previo = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando…';
    try {
      const texto = ($('f-texto').value || '').trim().toUpperCase();
      const porCodigo = document.querySelector('input[name="f-por"]:checked')?.value !== 'territorio';
      if (porCodigo && /^[A-Z]{3}-\d{4}-\d{4,6}$/.test(texto)) {
        $('f-texto').value = '';
        await abrirEnlace(texto);
        $('f-texto').value = texto;
        return;
      }
      const acrs = acrsElegidos();
      const meses = mesesElegidos();
      if (!acrs.length || !meses.length) {
        toast('No hay alertas de GeoBosques en ese periodo');
        return;
      }
      st.ambito = $('f-ambito').value;
      st.acr = acrs.length === 1 ? acrs[0] : acrs[0];
      st.anio = meses[meses.length - 1].anio;
      st.mes = meses[meses.length - 1].mes;
      st.periodos = st.periodosPorAcr[st.acr] || [];
      const extra = filtroExtra();
      if (acrs.length === 1 && meses.length === 1 && !extra) {
        await cargarResumen();
        if (yo !== buscaN) return;
      } else if (acrs.length === 1 && meses.length === 1) {
        await cargarResumen();
        if (yo !== buscaN) return;
        const features = (st.geo.features || []).filter(pasaFiltro);
        st.geo.features = features;
        pintarAgregado(features, meses);
        dibujarAlertas(features);
        renderLista();
      } else {
        const features = (await traerAlertas(acrs, meses)).filter(pasaFiltro);
        if (yo !== buscaN) return;
        st.geo = { type: 'FeatureCollection', features };
        st.filtro = 'todas';
        st.resumen = null;
        pintarAgregado(features, meses);
        dibujarAlertas(features);
        renderLista();
      }
      if (yo !== buscaN) return;
      if (capaAlertas.getLayers().length) mapa.flyToBounds(capaAlertas.getBounds(), { ...encuadre(40), maxZoom: 12 });
      desbloquear(2);
    } catch (e) {
      toast('No se pudo cargar las alertas');
    } finally {
      btn.disabled = false;
      btn.innerHTML = previo;
    }
  }

  function pintarAgregado(features, meses) {
    const cuenta = { antropica: 0, natural: 0, falsa: 0, pendiente: 0 };
    let antr = 0;
    let nat = 0;
    const causas = {};
    features.forEach((f) => {
      const p = f.properties;
      const c = clase(p);
      cuenta[c] += 1;
      const s = +p.superficie_ha || 0;
      if (c === 'antropica') {
        antr += s;
        if (p.causa) causas[p.causa] = (causas[p.causa] || 0) + s;
      } else if (c === 'natural') nat += s;
    });
    const validadas = cuenta.antropica + cuenta.natural + cuenta.falsa;
    $('res-titulo').textContent = `${tituloTerritorio()} · ${tituloPeriodo(meses)}`;
    $('k-total').textContent = num(features.length, 0);
    $('k-total-var').textContent = `${meses.length} mes${meses.length === 1 ? '' : 'es'} del periodo`;
    $('k-total-var').className = '';
    $('k-valid').textContent = num(validadas, 0);
    $('k-valid-sub').textContent = cuenta.pendiente ? `${cuenta.pendiente} pendientes de validar` : 'Todas validadas';
    $('k-antr').textContent = ha(antr);
    $('k-antr-var').textContent = 'Suma del periodo elegido';
    $('k-antr-var').className = '';
    $('k-nat').textContent = ha(nat);
    $('k-nat-sub').textContent = `${cuenta.falsa} falsas alertas descartadas`;
    const tot = features.length || 1;
    $('barra-res').innerHTML = Object.keys(cuenta).map((k) => `<i style="width:${(cuenta[k] / tot) * 100}%;background:${COLOR[k]}" title="${TEXTO[k]}: ${cuenta[k]}"></i>`).join('');
    $('leyenda-res').innerHTML = Object.keys(cuenta).map((k) => `<span style="--c:${COLOR[k]}">${TEXTO[k]} <b>${cuenta[k]}</b></span>`).join('');
    pintarGraficoMeses();
    const filas = Object.entries(causas).sort((a, b) => b[1] - a[1]);
    const maxC = Math.max(0.0001, ...filas.map(([, v]) => v));
    $('tarjeta-causas').hidden = !filas.length;
    $('causas').innerHTML = filas.map(([causa, valor]) => `<div class="causa-fila"><span>${esc(causa)}</span>
      <div class="bar"><i style="width:${(valor / maxC) * 100}%"></i></div><b>${num(valor)}</b></div>`).join('');
    pintarSeguimiento();
  }

  function pintarGraficoMeses() {
    $('graf-anio').textContent = st.anio;
    const porMes = Array(12).fill(0);
    const conMes = Array(12).fill(0);
    const codigos = $('f-acr').value === 'todas' ? acrsElegidos() : [st.acr];
    codigos.forEach((codigo) => {
      (st.periodosPorAcr[codigo] || []).filter((p) => p.anio === st.anio).forEach((p) => {
        porMes[p.mes - 1] += p.alertas;
        conMes[p.mes - 1] += p.constatadas || 0;
      });
    });
    const desde = st.eje[+$('f-desde').value];
    const hasta = st.eje[+$('f-hasta').value];
    const max = Math.max(1, ...porMes);
    let totalCon = 0;
    let total = 0;
    $('graf-meses').innerHTML = porMes.map((n, i) => {
      const cur = st.anio * 12 + (i + 1);
      const sel = desde && hasta && cur >= ym(desde) && cur <= ym(hasta);
      const con = Math.min(conMes[i], n);
      const sin = n - con;
      if (sel) { total += n; totalCon += con; }
      const alto = Math.max(2, Math.round((n / max) * 78));
      return `<div data-m="${i + 1}" class="${sel ? 'sel' : ''}" title="${MESES[i]}: ${con} constatadas, ${sin} sin constatar">
      <b>${n || ''}</b>
      <span class="pila" style="height:${n ? alto : 2}px">
        <i class="con" style="height:${n ? (con / n) * 100 : 0}%"></i>
        <i class="sin" style="height:${n ? (sin / n) * 100 : 100}%"></i>
      </span>${MESES[i].slice(0, 1)}</div>`;
    }).join('');
    $('graf-leyenda').innerHTML = `<span><i style="background:#2e7d32"></i>Constatadas <b>${totalCon}</b></span>
      <span><i style="background:#c5e1a5"></i>Sin constatar <b>${Math.max(0, total - totalCon)}</b></span>`;
    $('graf-meses').querySelectorAll('div').forEach((d) => (d.onclick = async () => {
      const m = +d.dataset.m;
      const idx = st.eje.findIndex((p) => p.anio === st.anio && p.mes === m);
      if (idx < 0) return;
      $('f-desde').value = String(idx);
      $('f-hasta').value = String(idx);
      st.calAnio = st.anio;
      calAncla = null;
      pintarEtiquetasPeriodo();
      await buscar();
    }));
  }

  function resetFiltros() {
    document.querySelector('input[name="f-por"][value="codigo"]').checked = true;
    $('f-texto').value = '';
    $('mb-modo').querySelector('[data-v="simple"]').click();
    $('f-ha-min').value = '0';
    $('f-ha-max').value = $('f-ha-max').max;
    $('f-resultado').value = 'todas';
    $('f-estado').value = 'todas';
    $('f-causa').value = '';
    $('f-orden').value = 'ha';
    $('f-ambito').value = 'ambos';
    st.ambito = 'ambos';
    pintarHa();
    if ($('f-region').options.length) {
      $('f-region').selectedIndex = 0;
      alCambiarRegion();
    }
  }

  $('mb-tabs').querySelectorAll('button').forEach((b) => (b.onclick = () => {
    $('mb-tabs').querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
    $('mb-filtros').hidden = b.dataset.tab !== 'filtros';
    $('mb-capas').hidden = b.dataset.tab !== 'capas';
  }));
  $('mb-modo').querySelectorAll('button').forEach((b) => (b.onclick = () => {
    $('mb-modo').querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
    $('mb-det').hidden = b.dataset.v !== 'detallado';
  }));
  ordenarRango($('f-ha-min'), $('f-ha-max'), pintarHa);
  $('f-cal-meses')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || st.calAnio == null) return;
    const idx = indiceMes(st.calAnio, +btn.dataset.mes);
    if (idx < 0) return;
    if (calAncla == null) {
      calAncla = idx;
      $('f-desde').value = String(idx);
      $('f-hasta').value = String(idx);
    } else {
      $('f-desde').value = String(Math.min(calAncla, idx));
      $('f-hasta').value = String(Math.max(calAncla, idx));
      calAncla = null;
    }
    pintarEtiquetasPeriodo();
  });
  $('f-anio-prev').onclick = () => {
    const anios = aniosDelEje();
    const i = anios.indexOf(st.calAnio);
    if (i > 0) seleccionarAnio(anios[i - 1]);
  };
  $('f-anio-next').onclick = () => {
    const anios = aniosDelEje();
    const i = anios.indexOf(st.calAnio);
    if (i >= 0 && i < anios.length - 1) seleccionarAnio(anios[i + 1]);
  };
  pintarHa();
  $('f-region').onchange = () => alCambiarRegion();
  $('f-acr').onchange = () => alCambiarAcr();
  $('f-ambito').onchange = async () => {
    st.ambito = $('f-ambito').value;
    await cargarPeriodosRegion();
    await buscar();
  };
  $('f-lupa').onclick = () => buscar();
  $('f-texto').addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(); });
  $('f-reset').onclick = () => resetFiltros();
  $('ir-2').onclick = () => buscar();
  $('f-c-alertas').onchange = (e) => { $('c-alertas').checked = e.target.checked; $('c-alertas').onchange(e); };
  $('f-c-poli').onchange = (e) => { $('c-poli').checked = e.target.checked; $('c-poli').onchange(e); };
  if ($('f-c-propuesta')) $('f-c-propuesta').onchange = (e) => { $('c-propuesta').checked = e.target.checked; $('c-propuesta').onchange(); };
  $('f-c-geob').onchange = (e) => { $('c-geob').checked = e.target.checked; $('c-geob').onchange(e); };
  if ($('f-c-semana')) $('f-c-semana').onchange = (e) => { $('c-semana').checked = e.target.checked; $('c-semana').onchange(e); };
  $('f-c-limites').onchange = (e) => { $('c-limites').checked = e.target.checked; $('c-limites').onchange(e); };
  $('f-base').onchange = () => {
    const r = document.querySelector(`input[name=base][value="${$('f-base').value}"]`);
    if (r) { r.checked = true; r.onchange(); }
  };

  async function elegirRegion(region) {
    $('f-region').value = region;
    await alCambiarRegion();
  }

  async function elegirAcr(codigo) {
    $('f-acr').value = codigo;
    await alCambiarAcr();
  }

  /* ---------- Paso 2: resumen ---------- */
  function variacion(actual, anterior, unidad) {
    if (!anterior) return { txt: 'Sin datos el mes anterior', cls: '' };
    const d = actual - anterior;
    if (Math.abs(d) < 1e-9) return { txt: 'Igual que el mes anterior', cls: '' };
    const flecha = d > 0 ? '▲' : '▼';
    return { txt: `${flecha} ${unidad(Math.abs(d))} vs. mes anterior`, cls: d > 0 ? 'sube' : 'baja' };
  }

  async function cargarResumen() {
    const q = `acr=${st.acr}&ambito=${st.ambito}&anio=${st.anio}&mes=${st.mes}`;
    const [r, geo] = await Promise.all([api(`/resumen?${q}`), api(`/alertas?${q}`)]);
    st.resumen = r; st.geo = geo; st.filtro = 'todas';
    dibujarAlertas(geo.features);

    const t = st.territorios.find((x) => x.codigo === st.acr);
    $('res-titulo').textContent = `${t.nombre} · ${MESES[st.mes - 1]} ${st.anio}`;
    const a = r.actual, b = r.mesAnterior;
    $('k-total').textContent = num(a.alertasRecibidas, 0);
    const v1 = variacion(a.alertasRecibidas, b.alertasRecibidas, (x) => num(x, 0));
    $('k-total-var').textContent = v1.txt; $('k-total-var').className = v1.cls;
    $('k-valid').textContent = num(a.alertasValidadas, 0);
    $('k-valid-sub').textContent = a.alertasPendientes ? `${a.alertasPendientes} pendientes de validar` : 'Todas validadas';
    $('k-antr').textContent = ha(a.perdidaAntropicaHa);
    const v2 = variacion(+a.perdidaAntropicaHa, +b.perdidaAntropicaHa, ha);
    $('k-antr-var').textContent = v2.txt; $('k-antr-var').className = v2.cls;
    $('k-nat').textContent = ha(a.cambioNaturalHa);
    $('k-nat-sub').textContent = `${a.falsasAlertas} falsas alertas descartadas`;

    const cuenta = { antropica: 0, natural: 0, falsa: 0, pendiente: 0 };
    geo.features.forEach((f) => cuenta[clase(f.properties)]++);
    const tot = geo.features.length || 1;
    $('barra-res').innerHTML = Object.keys(cuenta).map((k) => `<i style="width:${(cuenta[k] / tot) * 100}%;background:${COLOR[k]}" title="${TEXTO[k]}: ${cuenta[k]}"></i>`).join('');
    $('leyenda-res').innerHTML = Object.keys(cuenta).map((k) => `<span style="--c:${COLOR[k]}">${TEXTO[k]} <b>${cuenta[k]}</b></span>`).join('');

    pintarGraficoMeses();

    const maxC = Math.max(0.0001, ...r.porCausa.map((c) => +c.ha));
    $('tarjeta-causas').hidden = !r.porCausa.length;
    $('causas').innerHTML = r.porCausa.map((c) => `<div class="causa-fila"><span>${esc(c.causa)}</span>
      <div class="bar"><i style="width:${(+c.ha / maxC) * 100}%"></i></div><b>${num(c.ha)}</b></div>`).join('');
    renderLista();
    pintarSeguimiento();
  }

  $('ir-3').onclick = () => desbloquear(3);

  function ordenLista(x, y) {
    const orden = $('f-orden') ? $('f-orden').value : 'ha';
    if (orden === 'fecha') return String(y.properties.fecha_imagen || '').localeCompare(String(x.properties.fecha_imagen || ''));
    if (orden === 'codigo') return String(x.properties.codigo).localeCompare(String(y.properties.codigo));
    return y.properties.superficie_ha - x.properties.superficie_ha;
  }

  async function pintarSeguimiento() {
    await Promise.all([pintarLabor(), pintarEquipo()]);
  }

  async function pintarLabor() {
    if (!st.acr || !String(st.acr).startsWith('ACR_')) {
      $('labor').innerHTML = '<p class="ayuda">Elige un ACR para ver la labor del especialista.</p>';
      return;
    }
    let filas = [];
    try {
      filas = await api(`/labor?acr=${encodeURIComponent(st.acr)}&ambito=${st.ambito}&anio=${st.anio}&mes=${st.mes}`);
    } catch { filas = []; }
    $('labor').innerHTML = filas.length
      ? filas.map((f) => `<div class="labor-fila"><span>${esc(f.especialista)}</span><b>${f.clasificadas} clasificadas · ${f.constatadas} constatadas</b></div>`).join('')
      : '<p class="ayuda">En este mes todavía no hay clasificaciones guardadas.</p>';
  }

  async function pintarEquipo() {
    $('form-equipo').hidden = !ed.habilitada;
    if (!st.acr || !String(st.acr).startsWith('ACR_')) {
      $('equipo').innerHTML = '<p class="ayuda">Elige un ACR para ver a quién se le pide la fotointerpretación.</p>';
      return;
    }
    let gente = [];
    try { gente = await api(`/responsables?acr=${encodeURIComponent(st.acr)}`, true); } catch { gente = []; }
    $('equipo').innerHTML = gente.length
      ? gente.map((p) => `<div class="equipo-fila"><span>${esc(p.nombre)} · ${p.cargo ? esc(p.cargo) : 'sin cargo'}</span>${ed.habilitada ? `<button type="button" data-id="${p.id}" title="Quitar">×</button>` : ''}</div>`).join('')
      : '<p class="ayuda">Todavía no hay personas anotadas para este ACR.</p>';
    $('equipo').querySelectorAll('button[data-id]').forEach((b) => {
      b.onclick = async () => {
        const r = await fetch(`${API}/responsables/${b.dataset.id}`, { method: 'DELETE', headers: { 'X-XSRF-TOKEN': tokenCsrf() } });
        if (r.status === 401 || r.status === 403) { irAlLogin(); return; }
        if (!r.ok) { toast('No se pudo quitar'); return; }
        pintarEquipo();
      };
    });
  }

  function abrirComunicado() {
    const feats = (st.geo && st.geo.features) || [];
    const nuevas = feats.filter((f) => f.properties.estado === 'pendiente');
    const destinos = [...$('equipo').querySelectorAll('.equipo-fila span')].map((n) => n.textContent);
    const filas = nuevas.map((f) => {
      const p = f.properties;
      const coord = (p.lat != null && p.lon != null) ? `${p.lat}, ${p.lon}` : '';
      return `<tr><td>${esc(p.codigo)}</td><td>${fecha(p.fecha_imagen)}</td><td>${num(p.superficie_ha)} ha</td><td>${esc(coord)}</td></tr>`;
    }).join('');
    const w = window.open('', '_blank');
    if (!w) { toast('El navegador bloqueó el comunicado'); return; }
    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Comunicado de alertas nuevas</title>
      <style>body{font-family:Georgia,serif;margin:36px;color:#1d2b20}h1{font-size:22px;color:#1b5e20;margin-bottom:4px}p{line-height:1.45}table{border-collapse:collapse;width:100%;margin-top:16px}td,th{border-bottom:1px solid #d7e0d4;padding:7px 6px;text-align:left;font-size:14px}th{color:#1b5e20}</style></head><body>
      <h1>Comunicado de alertas nuevas</h1>
      <p><b>${esc(tituloTerritorio())}</b>. Se solicita la fotointerpretación de estas alertas de deforestación.</p>
      <p>${destinos.length ? 'Para: ' + esc(destinos.join(' · ')) : 'Sin destinatarios anotados en el equipo del ACR.'}</p>
      ${nuevas.length ? `<table><thead><tr><th>Código</th><th>Fecha</th><th>Superficie</th><th>Coordenadas</th></tr></thead><tbody>${filas}</tbody></table>` : '<p>No hay alertas pendientes en el periodo que está en pantalla.</p>'}
      </body></html>`);
    w.document.close();
  }

  $('mostrar-todo').onclick = async () => {
    if (!st.eje.length) return;
    $('f-desde').value = '0';
    $('f-hasta').value = String(st.eje.length - 1);
    pintarEtiquetasPeriodo();
    await buscar();
  };
  $('btn-comunicado').onclick = () => abrirComunicado();
  $('form-equipo').onsubmit = async (e) => {
    e.preventDefault();
    if (!st.acr || !String(st.acr).startsWith('ACR_')) { toast('Elige un ACR'); return; }
    const r = await fetch(`${API}/responsables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': tokenCsrf() },
      body: JSON.stringify({ acr: st.acr, nombre: $('eq-nombre').value.trim(), cargo: $('eq-cargo').value.trim() }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) { irAlLogin(); return; }
    if (!r.ok) { toast(j.error || 'No se pudo agregar'); return; }
    $('eq-nombre').value = '';
    $('eq-cargo').value = '';
    pintarEquipo();
  };

  /* ---------- Paso 3: lista ---------- */
  function renderLista() {
    const feats = st.geo.features;
    const cuenta = { todas: feats.length, antropica: 0, natural: 0, falsa: 0, pendiente: 0 };
    feats.forEach((f) => cuenta[clase(f.properties)]++);
    $('filtros-res').innerHTML = Object.keys(cuenta).filter((k) => k === 'todas' || cuenta[k]).map((k) =>
      `<button class="filtro ${st.filtro === k ? 'sel' : ''}" data-f="${k}" style="--c:${COLOR[k] || '#1d2b20'}">${k === 'todas' ? '' : '<i></i>'}${k === 'todas' ? 'Todas' : TEXTO[k]} · ${cuenta[k]}</button>`).join('');
    $('filtros-res').querySelectorAll('.filtro').forEach((b) => (b.onclick = () => { st.filtro = b.dataset.f; renderLista(); }));

    const lista = feats.filter((f) => st.filtro === 'todas' || clase(f.properties) === st.filtro)
      .sort(ordenLista);
    $('lista').innerHTML = lista.length ? lista.map((f) => {
      const p = f.properties, c = clase(p);
      const mini = p.con_imagen ? `style="background-image:url('${API}/alertas/${p.codigo}/imagen/despues.png')"` : '';
      return `<button class="item ${st.alerta === p.codigo ? 'sel' : ''}" data-c="${esc(p.codigo)}">
        <span class="miniatura" ${mini}>${p.con_imagen ? '' : '<i class="fas fa-satellite"></i>'}</span>
        <span><strong>${esc(p.codigo)}</strong><small>${fecha(p.fecha_imagen)} · ${p.ambito === 'ZI' ? 'Zona de Influencia' : 'ACR'}${p.causa ? ' · ' + esc(p.causa) : ''}${p.con_foto ? ' · foto de campo' : ''}</small>
        <span class="chip" style="--c:${COLOR[c]};margin-top:5px">${TEXTO[c]}</span></span>
        <span class="ha">${num(p.superficie_ha)}<small>ha</small></span></button>`;
    }).join('') : '<div class="vacio"><i class="fas fa-leaf"></i>Sin alertas con este filtro</div>';
    $('lista').querySelectorAll('.item').forEach((b) => {
      b.onclick = () => verAlerta(b.dataset.c);
      b.onmouseenter = () => marcas.get(b.dataset.c)?.poli.setStyle({ weight: 3, color: '#fff' });
      b.onmouseleave = () => { const m = marcas.get(b.dataset.c); if (m) m.poli.setStyle(estiloAlerta(m.p, b.dataset.c === st.alerta)); };
    });
  }

  /* ---------- Paso 4: evidencia ---------- */
  // Polígono vigente dibujado sobre el recorte (extensión EPSG:3857) en un lienzo SVG de 1000 × 1000.
  function contornoSvg(geom, recorte) {
    if (!geom || !recorte) return '';
    const [x0, y0, x1, y1] = recorte;
    const poligonos = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    const d = poligonos.flat().map((anillo) => 'M' + anillo.map(([lon, lat]) => {
      const p = L.CRS.EPSG3857.project(L.latLng(lat, lon));
      return `${(((p.x - x0) / (x1 - x0)) * 1000).toFixed(1)},${(((y1 - p.y) / (y1 - y0)) * 1000).toFixed(1)}`;
    }).join('L') + 'Z').join('');
    return `<svg class="contorno" viewBox="0 0 1000 1000" preserveAspectRatio="none"><path d="${d}"/></svg>`;
  }

  let capaBusqueda = null;

  function quitarBusquedaMapa() {
    if (capaBusqueda) { mapa.removeLayer(capaBusqueda); capaBusqueda = null; }
  }

  function buscarSentinel(cont, codigo, sugerida) {
    const desde = cont.querySelector('.s2-desde');
    const hasta = cont.querySelector('.s2-hasta');
    const base = (sugerida || new Date().toISOString().slice(0, 10));
    const dia = new Date(`${base}T00:00:00`);
    const iso = (d) => d.toISOString().slice(0, 10);
    desde.value = iso(new Date(dia.getTime() - 45 * 86400000));
    hasta.value = iso(new Date(dia.getTime() + 20 * 86400000));
    const lista = cont.querySelector('.s2-lista');
    const vista = cont.querySelector('.s2-vista');
    cont.querySelector('.s2-buscar').onclick = async () => {
      lista.innerHTML = '<p class="vacio-mini">Buscando en Sentinel-2…</p>';
      vista.hidden = true;
      quitarBusquedaMapa();
      try {
        const r = await api(`/alertas/${codigo}/sentinel?desde=${desde.value}&hasta=${hasta.value}`);
        if (!r.escenas.length) {
          lista.innerHTML = `<p class="vacio-mini">${esc(r.nota || 'No hay escenas en esas fechas.')}</p>`;
          return;
        }
        lista.innerHTML = r.escenas.map((e) =>
          `<button type="button" class="s2-fecha" data-i="${esc(e.escenaId)}">${fecha(e.fecha)}<small>${num(e.nubes, 0)} % nubes</small></button>`).join('');
        lista.querySelectorAll('.s2-fecha').forEach((b) => {
          b.onclick = () => {
            const e = r.escenas.find((x) => x.escenaId === b.dataset.i);
            lista.querySelectorAll('.s2-fecha').forEach((x) => x.classList.toggle('activo', x === b));
            const src = e.recorte || e.miniatura;
            vista.hidden = false;
            vista.innerHTML = `<img alt="Sentinel-2 ${esc(e.fecha)}" src="${esc(src)}"><p>Sentinel-2 L2A · ${fecha(e.fecha)} · ${esc(e.escenaId)} · ${num(e.nubes, 0)} % nubes. Esta vista no reemplaza el par del reporte.</p>`;
            const img = vista.querySelector('img');
            img.onerror = () => {
              if (e.miniatura && !img.dataset.fallback) {
                img.dataset.fallback = '1';
                img.src = e.miniatura;
              }
            };
            quitarBusquedaMapa();
            if (e.recorte) {
              const bounds = L.latLngBounds([e.sur, e.oeste], [e.norte, e.este]);
              capaBusqueda = L.imageOverlay(e.recorte, bounds, { opacity: 0.92 }).addTo(mapa);
              if (!mapa.getBounds().intersects(bounds)) mapa.flyToBounds(bounds, encuadre(20));
              $('escena-fija').hidden = false;
              $('escena-fija').textContent = `Sentinel-2 L2A · ${fecha(e.fecha)} · ${e.escenaId}`;
            }
          };
        });
      } catch (e) {
        lista.innerHTML = '<p class="vacio-mini">No se pudo consultar el catálogo Sentinel-2.</p>';
      }
    };
  }

  function diaSiguiente(iso) {
    const d = new Date(`${(iso || '').slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return '';
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  /** Misma fecha reciente, combinación infrarrojo de onda corta. El suelo desnudo sale en magenta. */
  function urlSwir(recorte, fechaIso) {
    if (!recorte || recorte.length !== 4) return '';
    const [x0, y0, x1, y1] = recorte;
    const dia = (fechaIso || '').slice(0, 10);
    const hasta = diaSiguiente(dia);
    const where = dia && hasta
      ? `acquisitiondate >= timestamp '${dia} 00:00:00' AND acquisitiondate < timestamp '${hasta} 00:00:00'`
      : "cloudcover <= 0.3";
    const mosaic = encodeURIComponent(JSON.stringify({
      mosaicMethod: 'esriMosaicAttribute', sortField: 'acquisitiondate', sortValue: '2099/12/31',
      ascending: true, where,
    }));
    const render = encodeURIComponent(JSON.stringify({ rasterFunction: 'Short-wave Infrared' }));
    return 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer/exportImage'
      + `?bbox=${x0},${y0},${x1},${y1}&bboxSR=3857&imageSR=3857&size=480,480`
      + `&format=jpgpng&f=image&mosaicRule=${mosaic}&renderingRule=${render}`;
  }

  function marcoImagen(rotulo, src, alt, geom, recorte) {
    return `<figure class="marco">
        <img src="${src}" alt="${esc(alt)}" loading="lazy">
        ${contornoSvg(geom, recorte)}
        <figcaption>${rotulo}</figcaption>
      </figure>`;
  }

  let verContorno = true;

  function aplicarContorno() {
    const comp = document.querySelector('#fotos-lienzo .comparador');
    if (comp) comp.classList.toggle('sin-contorno', !verContorno);
    document.querySelectorAll('#ev-comparador .trio, #cl-comparador .trio').forEach((t) => t.classList.toggle('sin-contorno', !verContorno));
    const btn = $('fotos-contorno');
    if (btn) btn.classList.toggle('activo', verContorno);
  }

  function htmlDeslizador(izqSrc, derSrc, rotIzq, rotDer, geom, recorte) {
    return `<div class="comparador" style="--pos:52%">
        <img src="${derSrc}" alt="">
        <img class="antes" src="${izqSrc}" alt="">
        ${contornoSvg(geom, recorte)}
        <span class="rot izq">${rotIzq}</span>
        <span class="rot der">${rotDer}</span>
        <span class="divisor"></span>
        <input type="range" min="0" max="100" value="52" aria-label="Deslizar entre antes y después">
      </div>`;
  }

  function abrirFotos(modoInicial, antes, despues, swir, geom, recorte) {
    if (!antes || !despues) return;
    const dlg = $('dlg-fotos');
    const caja = $('fotos-lienzo');
    let modo = modoInicial === 'swir' && swir ? 'swir' : 'rgb';
    const pintar = () => {
      const der = modo === 'swir' && swir ? swir : despues.imagen;
      const rotDer = modo === 'swir' ? 'SWIR<small>suelo desnudo</small>' : `DESPUÉS<small>${fecha(despues.fecha)}</small>`;
      caja.innerHTML = htmlDeslizador(antes.imagen, der, `ANTES<small>${fecha(antes.fecha)}</small>`, rotDer, geom, recorte);
      const comp = caja.querySelector('.comparador');
      const rango = caja.querySelector('input');
      rango.oninput = () => comp.style.setProperty('--pos', `${rango.value}%`);
      $('fotos-modo').querySelectorAll('button[data-m]').forEach((b) => b.classList.toggle('activo', b.dataset.m === modo));
      aplicarContorno();
    };
    $('fotos-swir').hidden = !swir;
    $('fotos-modo').onclick = (e) => {
      const b = e.target.closest('button[data-m]');
      if (!b || b.hidden) return;
      modo = b.dataset.m;
      pintar();
    };
    $('fotos-contorno').onclick = () => { verContorno = !verContorno; aplicarContorno(); };
    pintar();
    if (!dlg.open) dlg.showModal();
  }

  function comparador(cont, escenas, geom, codigo) {
    const antes = escenas.find((e) => e.momento === 'antes');
    const despues = escenas.find((e) => e.momento === 'despues');
    const sugerida = despues?.fecha || antes?.fecha || '';
    const recorte = despues?.recorte || antes?.recorte;
    const swir = urlSwir(recorte, despues?.fecha);
    const par = (antes && despues) ? `<div class="trio">
        ${marcoImagen(`ANTES<small>${fecha(antes.fecha)}</small>`, antes.imagen, 'Imagen antes', geom, antes.recorte || recorte)}
        ${marcoImagen(`DESPUÉS<small>${fecha(despues.fecha)}</small>`, despues.imagen, 'Imagen después', geom, despues.recorte || recorte)}
        ${swir ? marcoImagen('SWIR<small>suelo desnudo</small>', swir, 'Infrarrojo de onda corta', geom, recorte) : ''}
      </div>
      <p class="sensor-nota">Clic en una imagen para abrir el deslizador. El contorno naranja es la alerta. SWIR es la misma fecha reciente: el suelo sin bosque se ve magenta.</p>`
      : `<div class="sin-imagen"><i class="fas fa-cloud-sun"></i>Aún no hay un par guardado para el reporte. Puede buscar otra fecha abajo.</div>`;
    cont.innerHTML = `${par}
      <div class="busqueda-s2">
        <p class="sensor-nota">Buscar otro día en el catálogo Sentinel-2 L2A (Copernicus / Element84). Nubes de la escena completa, hasta 80 %.</p>
        <div class="busqueda-s2-fechas">
          <label>Desde <input class="s2-desde" type="date"></label>
          <label>Hasta <input class="s2-hasta" type="date"></label>
          <button type="button" class="btn-sec s2-buscar">Buscar</button>
        </div>
        <div class="s2-lista"></div>
        <div class="s2-vista" hidden></div>
      </div>`;
    cont.querySelectorAll('.marco').forEach((fig) => {
      const alt = fig.querySelector('img')?.alt || '';
      fig.title = 'Abrir y deslizar';
      fig.onclick = () => abrirFotos(alt.includes('onda corta') ? 'swir' : 'rgb', antes, despues, swir, geom, recorte);
    });
    aplicarContorno();
    cont.querySelectorAll('.marco img').forEach((img) => {
      if (!img.alt.includes('onda corta')) return;
      img.onerror = () => {
        const fig = img.closest('.marco');
        if (fig) fig.innerHTML = '<p class="marco-fallo">SWIR no disponible para esta fecha.</p>';
      };
    });
    if (codigo) buscarSentinel(cont, codigo, sugerida);
  }

  let propuestasRed = null;
  async function propuestasRedCargar() {
    if (propuestasRed) return propuestasRed;
    try {
      const r = await fetch('/propuestas.json', { cache: 'no-store' });
      propuestasRed = r.ok ? await r.json() : {};
    } catch { propuestasRed = {}; }
    return propuestasRed;
  }
  function pintarPropuesta(id, codigo) {
    const box = $(id);
    const p = propuestasRed && propuestasRed[codigo];
    if (!box) return;
    box.hidden = !p;
    const txt = box.querySelector('b');
    if (p && txt) {
      const pct = Math.round(Number(p.probabilidad) * 100);
      txt.textContent = `${p.causa} · ${p.confiabilidad} · ${pct} %`;
    }
    if (id !== 'cl-red') return;
    const etiqueta = box.querySelector('span');
    const nota = box.querySelector('small');
    if (etiqueta) etiqueta.textContent = st.cl.desdeRed ? 'La red ya la marcó' : 'Propuesta de la red';
    if (nota) {
      nota.textContent = st.cl.desdeRed
        ? 'Esa lectura ya está marcada abajo. Enter la guarda. El polígono sigue siendo el de GeoBosques.'
        : 'Sugerencia para esta alerta. Guardar sigue siendo la decisión del especialista.';
    }
  }

  function lecturaRed(codigo) {
    const p = propuestasRed && propuestasRed[codigo];
    if (!p) return null;
    const falsa = p.causa_id === 99 || p.causa === 'Falsa alerta';
    const natural = p.causa_id === 14 || p.causa === 'Natural';
    return {
      resultado: falsa ? 'falsa' : (natural ? 'natural' : 'antropica'),
      causa: falsa || natural ? null : p.causa_id,
      conf: p.confiabilidad === 'Bajo' ? 2 : 1,
      causaNombre: p.causa,
    };
  }

  function ficha(d, escenas) {
    const antes = escenas.find((e) => e.momento === 'antes');
    const despues = escenas.find((e) => e.momento === 'despues');
    const filas = [
      ['Superficie', ha(d.superficie_ha)], ['Fecha de detección', fecha(d.fecha_imagen)],
      ['Ámbito', d.ambito === 'ZI' ? 'Zona de Influencia' : 'Dentro del ACR'], ['Zonificación', d.zonificacion],
      ['Causal', d.causa], ['Confiabilidad', d.confiabilidad], ['Tipo de bosque', d.tipo_bosque], ['Sector', d.sector],
      ['Coordenadas UTM', utmDe(d.lat, d.lon)], ['Fuente de detección', d.fuente],
      ['Escena antes', antes?.escenaId], ['Escena después', despues?.escenaId],
    ].filter(([, v]) => v !== null && v !== undefined && v !== '');
    return filas.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('');
  }

  async function verAlerta(codigo, fresco = false) {
    if (st.modo !== 'consulta') return;
    if (ed.capa) terminarEdicion();
    st.alerta = codigo;
    const [det, escenas] = await Promise.all([api(`/alertas/${codigo}`, fresco), api(`/alertas/${codigo}/evidencia`)]);
    const d = det.properties, c = clase(d);
    st.detalle = d; st.escenas = escenas; st.geomDetalle = det.geometry;
    $('ev-codigo').textContent = d.codigo_reporte || d.codigo;
    $('ev-sub').textContent = `${d.codigo_reporte ? d.codigo + ' · ' : ''}${d.acr_nombre} · ${d.region}`;
    $('ev-chip').textContent = TEXTO[c];
    $('ev-chip').style.setProperty('--c', COLOR[c]);
    comparador($('ev-comparador'), escenas, det.geometry, codigo);
    $('ev-escena').hidden = !escenas.some((e) => e.recorte);
    verEscena(escenas.some((e) => e.momento === 'despues' && e.recorte) ? 'despues' : '');
    $('ev-ficha').innerHTML = ficha(d, escenas);
    if ($('foto-lat')) {
      $('foto-lat').value = d.lat ?? '';
      $('foto-lon').value = d.lon ?? '';
    }
    await propuestasRedCargar();
    pintarPropuesta('ev-red', codigo);
    cargarFotos(codigo);
    const concl = d.conclusion || (d.estado === 'pendiente' ? 'Alerta pendiente de validación técnica: aún no tiene clasificación ni causal definitiva.' : null);
    $('ev-conclusion').hidden = !concl;
    $('ev-conclusion').textContent = concl || '';
    resaltar(codigo);
    renderLista();
    desbloquear(4);
  }
  $('ev-volver').onclick = () => { if (ed.capa) terminarEdicion(); verEscena(''); irPaso(3); };

  /* ---------- Escena Sentinel-2 exacta sobre el mapa ---------- */
  mapa.createPane('escena').style.zIndex = 350;
  let capaEscena = null;
  function verEscena(momento, acercar) {
    if (capaEscena) { mapa.removeLayer(capaEscena); capaEscena = null; }
    $('ev-escena-sel').querySelectorAll('button').forEach((b) => b.classList.toggle('activo', b.dataset.v === momento));
    const e = (st.escenas || []).find((x) => x.momento === momento);
    const fija = $('escena-fija');
    if (!e || !e.recorte) { fija.hidden = true; return null; }
    const [x0, y0, x1, y1] = e.recorte;
    const limites = L.latLngBounds(L.CRS.EPSG3857.unproject(L.point(x0, y0)), L.CRS.EPSG3857.unproject(L.point(x1, y1)));
    capaEscena = L.imageOverlay(e.imagen, limites, { pane: 'escena', interactive: false }).addTo(mapa);
    if (acercar || !mapa.getBounds().contains(limites)) mapa.flyToBounds(limites, { ...encuadre(24), maxZoom: 17 });
    fija.hidden = false;
    fija.textContent = `Sentinel-2 L2A · ${momento === 'antes' ? 'antes' : 'después'} · ${fecha(e.fecha)} · ${e.escenaId}`;
    return limites;
  }
  $('ev-escena-sel').querySelectorAll('button').forEach((b) => (b.onclick = () => verEscena(b.dataset.v)));

  /* ---------- Edición del polígono ---------- */
  const ed = { habilitada: false, capa: null, codigo: null, herr: 'vertices', redibujando: false };
  api('/sesion', true).then((s) => {
    const editor = !!s.editor && !!s.ingresado;
    ed.habilitada = editor;
    document.querySelector('.rail-btn[data-modo="clasificar"]').hidden = !editor;
    $('btn-entrar').hidden = !!s.ingresado;
    $('rail-usuario').hidden = !s.ingresado;
    if (s.ingresado) {
      $('usr-inicial').textContent = (s.usuario || '?').charAt(0);
      $('usr-nombre').textContent = s.usuario;
      $('rail-usuario').title = `${s.usuario} · ${editor ? 'editor' : 'consulta'}`;
    }
    if (st.alerta && $('ed-panel').hidden) pintarBotonEditar();
    if (editor && st.modo === 'clasificar' && !$('cl-form').hidden && !ed.capa && st.alerta) editar();
    if (st.alerta) cargarFotos(st.alerta);
  }).catch(() => {});

  async function cargarFotos(codigo) {
    let fotos = [];
    try { fotos = await api(`/alertas/${codigo}/foto`, true); } catch { fotos = []; }
    const box = $('ev-fotos');
    box.innerHTML = fotos.length ? fotos.map((f) => {
      const coord = utmDe(f.lat, f.lon) || 'Sin coordenadas';
      return `<figure>
        <img src="${f.url}" alt="Foto de constatación de ${esc(codigo)}">
        <figcaption>${esc(f.nota || 'Sin descripción')} · ${esc(coord)}${f.tomada ? ' · ' + esc(f.tomada) : ''}</figcaption>
        ${ed.habilitada ? `<button type="button" class="btn-sec foto-borrar" data-id="${f.id}">Quitar</button>` : ''}
      </figure>`;
    }).join('') : '<p class="ayuda">Todavía no hay foto de constatación en esta alerta.</p>';
    box.querySelectorAll('.foto-borrar').forEach((b) => {
      b.onclick = async () => {
        const r = await fetch(`${API}/alertas/${codigo}/foto/${b.dataset.id}`, {
          method: 'DELETE',
          headers: { 'X-XSRF-TOKEN': tokenCsrf() },
        });
        if (r.status === 401 || r.status === 403) { irAlLogin(); return; }
        if (!r.ok) { toast('No se pudo quitar la foto'); return; }
        cargarFotos(codigo);
      };
    });
    $('form-foto').hidden = !ed.habilitada || fotos.length >= 6;
    $('foto-entrar').hidden = ed.habilitada;
    let celda = document.getElementById('ev-ficha-foto');
    if (!celda && $('ev-ficha').children.length) {
      $('ev-ficha').insertAdjacentHTML('beforeend', '<div id="ev-ficha-foto"><span>Validación de campo</span><b></b></div>');
      celda = document.getElementById('ev-ficha-foto');
    }
    if (celda) celda.querySelector('b').textContent = fotos.length
      ? `${fotos.length} foto${fotos.length === 1 ? '' : 's'} de constatación`
      : 'Sin constatación';
    marcarFoto(codigo, fotos.length > 0);
  }

  function marcarFoto(codigo, tiene) {
    const f = (st.geo?.features || []).find((x) => x.properties.codigo === codigo);
    if (!f || !!f.properties.con_foto === tiene) return;
    f.properties.con_foto = tiene;
    renderLista();
  }

  $('form-foto').onsubmit = async (e) => {
    e.preventDefault();
    const archivo = $('foto-archivo').files[0];
    if (!archivo || !st.alerta) return;
    const fd = new FormData();
    fd.append('foto', archivo);
    fd.append('nota', $('foto-nota').value.trim());
    fd.append('lat', $('foto-lat').value.trim());
    fd.append('lon', $('foto-lon').value.trim());
    const r = await fetch(`${API}/alertas/${st.alerta}/foto`, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': tokenCsrf() },
      body: fd,
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) { irAlLogin(); return; }
    if (!r.ok) { toast(j.error || 'No se pudo subir la foto'); return; }
    $('foto-archivo').value = '';
    $('foto-nota').value = '';
    toast('Foto de campo guardada en la alerta');
    marcarFoto(st.alerta, true);
    cargarFotos(st.alerta);
  };
  $('btn-entrar').onclick = () => irAlLogin();
  $('form-salir').onsubmit = () => { $('salir-csrf').value = tokenCsrf(); };

  function anilloHa(anillo) {
    const R = 6378137, rad = Math.PI / 180;
    let a = 0;
    for (let i = 0; i < anillo.length; i++) {
      const p1 = anillo[i], p2 = anillo[(i + 1) % anillo.length];
      a += (p2.lng - p1.lng) * rad * (2 + Math.sin(p1.lat * rad) + Math.sin(p2.lat * rad));
    }
    return Math.abs((a * R * R) / 2) / 10000;
  }
  function areaHa(ll) {
    if (ll[0] instanceof L.LatLng) return anilloHa(ll);
    if (ll[0][0] instanceof L.LatLng) return ll.reduce((s, anillo, i) => s + (i ? -anilloHa(anillo) : anilloHa(anillo)), 0);
    return ll.reduce((s, p) => s + areaHa(p), 0);
  }
  function actualizarArea() {
    if (!ed.capa) return;
    $('ed-ha').textContent = ha(areaHa(ed.capa.getLatLngs()));
  }

  function aplicarHerramienta() {
    const pm = ed.capa.pm;
    pm.disable();
    pm.disableLayerDrag();
    if (pm.rotateEnabled()) pm.disableRotate();
    if (ed.herr === 'vertices') pm.enable({ allowSelfIntersection: false, snappable: false });
    else if (ed.herr === 'mover') pm.enableLayerDrag();
    else pm.enableRotate();
    $('ed-herr').querySelectorAll('[data-h]').forEach((b) => b.classList.toggle('activo', b.dataset.h === ed.herr));
  }

  // Escala alrededor del centro en metros (EPSG:3857), para agrandar o achicar sin deformar.
  function escalar(factor) {
    const c = L.CRS.EPSG3857.project(ed.capa.getBounds().getCenter());
    const mover = (ll) => (Array.isArray(ll) ? ll.map(mover) : (() => {
      const p = L.CRS.EPSG3857.project(ll);
      return L.CRS.EPSG3857.unproject(L.point(c.x + (p.x - c.x) * factor, c.y + (p.y - c.y) * factor));
    })());
    ed.capa.pm.disable();
    ed.capa.setLatLngs(mover(ed.capa.getLatLngs()));
    aplicarHerramienta();
    actualizarArea();
  }

  const edAncla = $('ed-panel').parentElement;
  function anclarEditor() {
    const panel = $('ed-panel');
    const destino = st.modo === 'clasificar' ? $('cl-editor') : edAncla;
    if (destino && panel.parentElement !== destino) destino.appendChild(panel);
  }
  function pintarBotonEditar() {
    if ($('cl-editar')) $('cl-editar').hidden = !(ed.habilitada && !ed.capa && st.modo === 'clasificar');
  }

  async function editar() {
    const m = marcas.get(st.alerta);
    if (!ed.habilitada || !m || ed.capa || ed.abriendo) return;
    ed.codigo = st.alerta;
    ed.herr = 'vertices';
    ed.abriendo = true;
    // El polígono vigente se pide sin caché: otra persona pudo corregirlo hace instantes.
    const det = await api(`/alertas/${ed.codigo}`, true).finally(() => { ed.abriendo = false; });
    if (ed.codigo !== st.alerta) return;
    st.detalle = det.properties;
    ed.capa = L.geoJSON(det.geometry, { style: () => ({ color: '#00e5ff', weight: 2.2, fillColor: '#00e5ff', fillOpacity: .12 }) }).getLayers()[0];
    if (!ed.capa) return;
    ed.capa.addTo(mapa);
    ed.capa.on('pm:edit pm:dragend pm:rotateend pm:vertexadded pm:vertexremoved pm:markerdragend', actualizarArea);
    capaAlertas.removeLayer(m.poli);
    capaPuntos.removeLayer(m.punto);
    anclarEditor();
    verEscena('despues', true);
    mapa.flyToBounds(ed.capa.getBounds(), { ...encuadre(90), maxZoom: 18 });
    $('ed-orig').textContent = `(antes: ${ha(st.detalle.superficie_ha)})`;
    $('ed-restaurar').hidden = !st.detalle.editada;
    $('ed-guardar').disabled = false;
    $('ed-panel').hidden = false;
    pintarBotonEditar();
    aplicarHerramienta();
    actualizarArea();
    $('ed-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function cortarDibujo() {
    ed.redibujando = false;
    if (mapa.pm && typeof mapa.pm.globalDrawModeEnabled === 'function' && mapa.pm.globalDrawModeEnabled()) mapa.pm.disableDraw();
  }

  function terminarEdicion() {
    cortarDibujo();
    if (ed.capa) {
      ed.capa.pm.disable();
      ed.capa.pm.disableLayerDrag();
      if (ed.capa.pm.rotateEnabled()) ed.capa.pm.disableRotate();
      mapa.removeLayer(ed.capa);
      ed.capa = null;
    }
    const m = marcas.get(ed.codigo);
    if (m) { capaAlertas.addLayer(m.poli); capaPuntos.addLayer(m.punto); }
    $('ed-panel').hidden = true;
    pintarBotonEditar();
  }

  async function enviarGeometria(metodo, geometria) {
    const r = await fetch(`${API}/alertas/${ed.codigo}/geometria`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': tokenCsrf() },
      body: geometria ? JSON.stringify(geometria) : undefined,
    });
    if (r.status === 401 || r.status === 403) { irAlLogin(); throw new Error('Ingresa para editar'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo guardar el polígono');
    return j;
  }

  async function aplicarResultado() {
    const codigo = ed.codigo;
    terminarEdicion();
    if (st.modo === 'clasificar') {
      const det = await api(`/alertas/${codigo}`, true);
      const f = (st.cl.geo?.features || []).find((x) => x.properties.codigo === codigo);
      if (f) {
        f.geometry = det.geometry;
        f.properties.superficie_ha = det.properties.superficie_ha;
        const item = st.cl.cola.find((x) => x.codigo === codigo);
        if (item) item.superficie_ha = det.properties.superficie_ha;
      }
      dibujarAlertas(st.cl.geo.features);
      st.alerta = codigo;
      st.detalle = det.properties;
      const p = st.cl.cola.find((x) => x.codigo === codigo);
      if (p) $('cl-sub').textContent = `${ha(p.superficie_ha)} · detectada el ${fecha(p.fecha_imagen)} · ${p.ambito === 'ZI' ? 'Zona de Influencia' : 'Dentro del ACR'}`;
      if (ed.habilitada) await editar();
      else verEscena('despues', true);
      return;
    }
    if (st.geo) {
      st.geo = await api(`/alertas?acr=${st.acr}&ambito=${st.ambito}&anio=${st.anio}&mes=${st.mes}`, true);
      dibujarAlertas(st.geo.features);
    }
    await verAlerta(codigo, true);
  }

  if ($('cl-editar')) $('cl-editar').onclick = editar;
  $('ed-herr').querySelectorAll('[data-h]').forEach((b) => (b.onclick = () => { ed.herr = b.dataset.h; aplicarHerramienta(); }));
  $('ed-mas').onclick = () => escalar(1.05);
  $('ed-menos').onclick = () => escalar(1 / 1.05);
  $('ed-cancelar').onclick = terminarEdicion;
  function soltarVector() {
    if (!ed.capa) return;
    try {
      ed.capa.pm.disable();
      ed.capa.pm.disableLayerDrag();
      if (typeof ed.capa.pm.rotateEnabled === 'function' && ed.capa.pm.rotateEnabled()) ed.capa.pm.disableRotate();
    } catch (e) { /* el polígono igual se quita */ }
    mapa.removeLayer(ed.capa);
    ed.capa = null;
  }
  $('ed-eliminar').onclick = () => {
    if (st.modo !== 'clasificar' || !ed.codigo || (!ed.capa && !ed.redibujando)) return;
    if (!confirm('¿Eliminar este vector? Luego dibuja el polígono nuevo. Cancelar lo devuelve sin guardar.')) return;
    soltarVector();
    const rojo = marcas.get(ed.codigo);
    if (rojo) {
      capaAlertas.removeLayer(rojo.poli);
      capaPuntos.removeLayer(rojo.punto);
    }
    ed.redibujando = true;
    $('ed-guardar').disabled = true;
    $('ed-ha').textContent = '–';
    $('ed-orig').textContent = 'Doble clic cierra el polígono nuevo.';
    mapa.pm.enableDraw('Polygon', {
      snappable: false,
      allowSelfIntersection: false,
      finishOn: 'dblclick',
      templineStyle: { color: '#00e5ff', weight: 2 },
      hintlineStyle: { color: '#00e5ff', dashArray: '4 4' },
      pathOptions: { color: '#00e5ff', weight: 2.2, fillColor: '#00e5ff', fillOpacity: 0.12 },
    });
  };
  mapa.on('pm:create', (e) => {
    if (!ed.redibujando) {
      mapa.removeLayer(e.layer);
      return;
    }
    cortarDibujo();
    ed.capa = e.layer;
    ed.herr = 'vertices';
    ed.capa.on('pm:edit pm:dragend pm:rotateend pm:vertexadded pm:vertexremoved pm:markerdragend', actualizarArea);
    $('ed-guardar').disabled = false;
    aplicarHerramienta();
    actualizarArea();
  });
  $('ed-guardar').onclick = async () => {
    try {
      const j = await enviarGeometria('PUT', ed.capa.toGeoJSON().geometry);
      toast(`Polígono guardado · ${ha(j.superficieHa)}`);
      await aplicarResultado();
    } catch (e) { toast(e.message); }
  };
  $('ed-restaurar').onclick = async () => {
    if (!confirm('¿Restaurar el polígono original de la GDB? Se perderá la corrección.')) return;
    try {
      await enviarGeometria('DELETE');
      toast('Polígono original restaurado');
      await aplicarResultado();
    } catch (e) { toast(e.message); }
  };

  /* ---------- Paso 5: reporte ---------- */
  const urlReporte = () => `${API}/alertas/${st.detalle.codigo}/reporte.pdf`;
  function renderReporte() {
    const d = st.detalle, e = st.escenas;
    const antes = e.find((x) => x.momento === 'antes'), despues = e.find((x) => x.momento === 'despues');
    $('rep-prev').innerHTML = `<div class="rp-pdf"><i class="fas fa-file-pdf"></i><div><b>Reporte técnico ${esc(d.codigo_reporte || d.codigo)}</b>
        <small>${esc(d.acr_nombre)} · ${esc(d.region)} · 1 página A4</small></div></div>
      <ul class="rp-lista">
        <li><i class="fas fa-location-dot"></i> Ubicación (circunscripción, ACR, sector, OLV y lugar poblado cercanos) y mapa</li>
        <li><i class="fas fa-satellite"></i> ${antes && despues ? `Sentinel-2 antes (${fecha(antes.fecha)}) y después (${fecha(despues.fecha)}) con el polígono` : 'Sin par de imágenes Sentinel-2 todavía'}</li>
        <li><i class="fas fa-clipboard-list"></i> Datos de monitoreo, afectación, producción y elaboración</li>
      </ul>
      <a class="btn-sec rp-abrir" href="${urlReporte()}" target="_blank" rel="noopener"><i class="fas fa-up-right-from-square"></i> Abrir PDF</a>`;
  }
  $('ir-5').onclick = () => { if (ed.capa) terminarEdicion(); renderReporte(); desbloquear(5); };
  $('ir-const').onclick = () => {
    if (!st.alerta) return;
    window.open(`/constatacion.html?codigo=${encodeURIComponent(st.alerta)}`, '_blank');
  };
  $('rep-descargar').onclick = () => {
    const a = Object.assign(document.createElement('a'), { href: urlReporte(), download: '' });
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /* ====================================================== MODO CLASIFICAR */
  function cambiarModo(modo) {
    if (modo !== 'clasificar' && (ed.capa || ed.redibujando)) terminarEdicion();
    st.modo = modo;
    document.querySelectorAll('.rail-btn[data-modo]').forEach((b) => b.classList.toggle('activo', b.dataset.modo === modo));
    $('modo-consulta').hidden = modo !== 'consulta';
    $('modo-clasificar').hidden = modo !== 'clasificar';
    $('cab-sub').textContent = modo === 'consulta' ? 'Consulta de alertas' : 'Bandeja de clasificación';
    if (modo === 'clasificar') iniciarClasificacion();
    else if (st.geo) dibujarAlertas(st.geo.features);
  }
  document.querySelectorAll('.rail-btn[data-modo]').forEach((b) => (b.onclick = () => cambiarModo(b.dataset.modo)));

  function notaCodigo(codigo) {
    const pref = String(codigo || '').split('-')[0];
    const region = { LOR: 'Loreto', SMA: 'San Martín', CUS: 'Cusco' }[pref] || 'la región';
    return `${codigo} es el código de trabajo: ${region}, año de la imagen e identificador de origen. Se usa igual si la alerta está pendiente o ya clasificada. El código oficial del PDF es el de la GDB (por ejemplo ACR10-2026-084).`;
  }

  async function iniciarClasificacion() {
    const esp = $('cl-especialista');
    if (esp && !esp.value) esp.value = localStorage.getItem('atd-especialista') || '';
    if (esp) esp.onchange = () => localStorage.setItem('atd-especialista', esp.value.trim());
    if (!st.territorios.length) st.territorios = await api('/territorios');
    if (!st.catalogos) st.catalogos = await api('/catalogos');
    if (!$('cl-causas').children.length) {
      $('cl-causas').innerHTML = st.catalogos.causas.filter((c) => c.resultado === 'antropica')
        .map((c) => `<button data-v="${c.id}">${esc(c.nombre)}</button>`).join('');
      $('cl-causas').querySelectorAll('button').forEach((b) => (b.onclick = () => { st.cl.causa = +b.dataset.v; st.cl.desdeRed = false; pintarForm(); pintarPropuesta('cl-red', st.alerta); }));
      $('cl-conf').innerHTML = st.catalogos.confiabilidad.map((c) => `<button data-v="${c.id}">${esc(c.nombre)}</button>`).join('');
      $('cl-bosque').innerHTML = st.catalogos.tipoBosque.map((c) => `<button data-v="${c.id}">${esc(c.nombre)}</button>`).join('');
      $('cl-conf').querySelectorAll('button').forEach((b) => (b.onclick = () => { st.cl.conf = +b.dataset.v; st.cl.desdeRed = false; pintarForm(); pintarPropuesta('cl-red', st.alerta); }));
      $('cl-bosque').querySelectorAll('button').forEach((b) => (b.onclick = () => { st.cl.bosque = +b.dataset.v; pintarForm(); }));
    }
    if (!st.cl.acrs) {
      const conPend = [];
      for (const t of st.territorios.filter((x) => x.tipo === 'ACR')) {
        const per = await api(`/periodos?acr=${t.codigo}&ambito=ambos`);
        if (per.length) conPend.push([t, per]);
      }
      st.cl.periodos = new Map(conPend.map(([t, per]) => [t.codigo, per]));
      st.cl.acrs = conPend.map(([t]) => t);
      const regiones = [...new Map(st.cl.acrs.map((t) => [t.region, t.regionNombre])).entries()];
      $('cl-region').innerHTML = regiones.map(([cod, nom]) => `<option value="${esc(cod)}">${esc(nom)}</option>`).join('');
      $('cl-region').onchange = () => { llenarAcrsCl(); llenarMesesCl(); cargarCola(); };
      $('cl-ambito').onchange = async () => {
        const acr = $('cl-acr').value;
        if (acr) {
          const per = await api(`/periodos?acr=${acr}&ambito=${$('cl-ambito').value}`);
          st.cl.periodos.set(acr, per);
          llenarMesesCl();
        }
        cargarCola();
      };
      $('cl-acr').onchange = () => { llenarMesesCl(); cargarCola(); };
      $('cl-mes').onchange = cargarCola;
      llenarAcrsCl();
      llenarMesesCl();
    }
    await cargarCola();
  }

  function llenarAcrsCl() {
    const region = $('cl-region').value;
    const acrs = (st.cl.acrs || []).filter((t) => t.region === region);
    $('cl-acr').innerHTML = acrs.map((t) => `<option value="${t.codigo}">${esc(t.nombre)}</option>`).join('');
  }

  function llenarMesesCl() {
    const per = st.cl.periodos.get($('cl-acr').value) || [];
    $('cl-mes').innerHTML = per.map((p) => `<option value="${p.anio}-${p.mes}">${MESES[p.mes - 1]} ${p.anio} (${p.alertas})</option>`).join('');
  }

  async function cargarCola() {
    const acr = $('cl-acr').value;
    const ambito = $('cl-ambito').value || 'ambos';
    const [anio, mes] = ($('cl-mes').value || '-').split('-');
    if (!acr || !anio) return;
    const geo = await api(`/alertas?acr=${acr}&ambito=${ambito}&anio=${anio}&mes=${mes}`);
    st.cl.geo = geo;
    st.cl.cola = geo.features.map((f) => f.properties)
      .sort((x, y) => (y.con_imagen - x.con_imagen) || (y.estado === 'pendiente') - (x.estado === 'pendiente') || y.superficie_ha - x.superficie_ha);
    dibujarAlertas(geo.features);
    st.acr = acr;
    await cargarLimitesOficiales();
    capaLimites.setStyle(capaLimites.options.style);
    if (mapa.hasLayer(capaAlertas)) capaAlertas.bringToFront();
    if (mapa.hasLayer(capaPuntos)) capaPuntos.bringToFront();
    enfocarAcr();
    $('cl-form').hidden = true;
    await propuestasRedCargar();
    renderCola();
  }

  function renderCola() {
    const cola = st.cl.cola;
    const pend = cola.filter((p) => p.estado === 'pendiente' && !st.cl.duda[p.codigo]).length;
    const hechas = cola.filter((p) => p.estado === 'validada').length;
    const duda = cola.filter((p) => p.estado === 'pendiente' && st.cl.duda[p.codigo]).length;
    $('cl-cola-cab').innerHTML = `<span><b>${pend}</b> por clasificar · ${hechas} guardadas · ${duda} en duda</span><span>${cola.filter((p) => p.con_imagen).length} con Sentinel-2</span>`;
    $('cl-cola').innerHTML = `<div class="progreso"><i style="width:${cola.length ? ((cola.length - pend) / cola.length) * 100 : 0}%"></i></div>` + cola.map((p) => {
      const hecha = st.cl.hechas[p.codigo];
      const lectura = !hecha && p.estado === 'pendiente' ? lecturaRed(p.codigo) : null;
      const c = hecha ? hecha.resultado : (lectura ? lectura.resultado : clase(p));
      const rotulo = hecha ? `✓ ${TEXTO[c]}` : (lectura ? `Red · ${lectura.causaNombre}` : TEXTO[c]);
      const mini = p.con_imagen ? `style="background-image:url('${API}/alertas/${p.codigo}/imagen/despues.png')"` : '';
      return `<button class="item" data-c="${esc(p.codigo)}"><span class="miniatura" ${mini}>${p.con_imagen ? '' : '<i class="fas fa-satellite"></i>'}</span>
        <span><strong>${esc(p.codigo)}</strong><small>${fecha(p.fecha_imagen)} · ${p.ambito === 'ZI' ? 'ZI' : 'ACR'} · ${p.con_imagen ? 'imagen lista' : 'sin imagen aún'}</small>
        <span class="chip" style="--c:${COLOR[c]};margin-top:5px">${esc(rotulo)}</span></span>
        <span class="ha">${num(p.superficie_ha)}<small>ha</small></span></button>`;
    }).join('');
    $('cl-cola').querySelectorAll('.item').forEach((b) => (b.onclick = () => abrirClasificacion(b.dataset.c)));
    const filas = cola.map((p) => {
      const hecha = st.cl.hechas[p.codigo];
      const lectura = !hecha && p.estado === 'pendiente' ? lecturaRed(p.codigo) : null;
      const causa = hecha?.causaNombre || p.causa || lectura?.causaNombre || (p.estado === 'pendiente' ? 'Pendiente' : '');
      return `<tr><td>${esc(p.codigo)}</td><td>${p.ambito === 'ZI' ? 'ZI' : 'ACR'}</td><td>${num(p.lon, 5)}</td><td>${num(p.lat, 5)}</td><td>${esc(causa)}</td><td>${hecha ? 'Clasificada en sesión' : (p.estado === 'pendiente' ? 'Pendiente' : 'Validada')}</td></tr>`;
    }).join('');
    $('cl-cola').insertAdjacentHTML('beforeend', `<div class="cl-tabla-wrap"><table class="cl-tabla"><thead><tr><th>Código</th><th>Ámbito</th><th>X</th><th>Y</th><th>Causa</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table></div>
      <button type="button" class="btn-sec" id="cl-csv" style="margin-top:8px"><i class="fas fa-download"></i> Descargar coordenadas</button>`);
    $('cl-csv').onclick = () => {
      const header = ['codigo', 'ambito', 'x', 'y', 'causa', 'estado'];
      const lineas = [header.join(',')].concat(cola.map((p) => {
        const hecha = st.cl.hechas[p.codigo];
        const lectura = !hecha && p.estado === 'pendiente' ? lecturaRed(p.codigo) : null;
        const causa = hecha?.causaNombre || p.causa || lectura?.causaNombre || '';
        const estado = p.estado === 'pendiente' && st.cl.duda[p.codigo] ? 'en_duda' : p.estado;
        return [p.codigo, p.ambito === 'ZI' ? 'ZI' : 'ACR', p.lon, p.lat, `"${String(causa).replaceAll('"', '""')}"`, estado].join(',');
      }));
      const blob = new Blob(['\ufeff' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'alertas-clasificar.csv' });
      a.click();
      URL.revokeObjectURL(a.href);
    };
  }

  async function abrirClasificacion(codigo) {
    st.cl.idx = st.cl.cola.findIndex((p) => p.codigo === codigo);
    const p = st.cl.cola[st.cl.idx];
    if (!p) return;
    const previa = st.cl.hechas[codigo];
    const ya = p.estado === 'validada';
    await propuestasRedCargar();
    const lectura = !previa && !ya ? lecturaRed(codigo) : null;
    Object.assign(st.cl, {
      resultado: previa?.resultado || (ya ? p.resultado : null) || lectura?.resultado || null,
      causa: previa?.causa || (ya ? p.causa_id : null) || lectura?.causa || null,
      conf: previa?.conf || (!ya && lectura ? lectura.conf : 1),
      bosque: previa?.bosque || 1,
      desdeRed: Boolean(lectura),
    });
    $('cl-conclusion').value = previa?.conclusion || '';
    $('cl-codigo').textContent = p.codigo;
    $('cl-codigo-nota').textContent = notaCodigo(p.codigo);
    pintarPropuesta('cl-red', codigo);
    $('cl-sub').textContent = `${ha(p.superficie_ha)} · detectada el ${fecha(p.fecha_imagen)} · ${p.ambito === 'ZI' ? 'Zona de Influencia' : 'Dentro del ACR'}`;
    $('cl-cola').hidden = true; $('cl-cola-cab').hidden = true; $('cl-form').hidden = false;
    if ($('cl-guia')) $('cl-guia').open = false;
    requestAnimationFrame(() => $('cl-form').scrollIntoView({ block: 'start' }));
    $('cl-comparador').innerHTML = '<div class="sin-imagen"><i class="fas fa-spinner fa-spin"></i>Cargando imágenes…</div>';
    pintarForm();
    if (ed.capa) terminarEdicion();
    const feat = st.cl.geo.features.find((f) => f.properties.codigo === codigo);
    const escenas = await api(`/alertas/${codigo}/evidencia`);
    st.escenas = escenas;
    st.alerta = codigo;
    comparador($('cl-comparador'), escenas, feat?.geometry, codigo);
    const hayImagen = escenas.some((e) => e.momento === 'despues' && e.recorte);
    if ($('cl-mapa-nota')) {
      $('cl-mapa-nota').textContent = hayImagen
        ? 'La imagen Sentinel de después está en el mapa, debajo del polígono. Arrastra los vértices para corregirlo.'
        : 'Esta alerta todavía no tiene imagen Sentinel en el mapa. El polígono se edita sobre el fondo.';
    }
    if (ed.habilitada) await editar();
    else {
      verEscena(hayImagen ? 'despues' : '', true);
      resaltar(codigo);
    }
  }

  function pintarForm() {
    $('cl-resultado').querySelectorAll('.op').forEach((b) => b.classList.toggle('sel', b.dataset.v === st.cl.resultado));
    $('cl-bloque-causa').hidden = st.cl.resultado !== 'antropica';
    $('cl-causas').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', +b.dataset.v === st.cl.causa));
    $('cl-conf').querySelectorAll('button').forEach((b) => b.classList.toggle('activo', +b.dataset.v === st.cl.conf));
    $('cl-bosque').querySelectorAll('button').forEach((b) => b.classList.toggle('activo', +b.dataset.v === st.cl.bosque));
    $('cl-guardar').disabled = !st.cl.resultado || (st.cl.resultado === 'antropica' && !st.cl.causa);
  }

  $('cl-resultado').querySelectorAll('.op').forEach((b) => (b.onclick = () => elegirResultado(b.dataset.v)));
  function elegirResultado(v) {
    st.cl.resultado = v;
    st.cl.desdeRed = false;
    if (v !== 'antropica') st.cl.causa = null;
    pintarForm();
    pintarPropuesta('cl-red', st.alerta);
  }

  function cerrarForm() {
    if (ed.capa) terminarEdicion();
    verEscena('');
    $('cl-form').hidden = true; $('cl-cola').hidden = false; $('cl-cola-cab').hidden = false;
    renderCola();
  }
  $('cl-cerrar').onclick = cerrarForm;

  function siguiente() {
    const cola = st.cl.cola;
    for (let k = 1; k <= cola.length; k++) {
      const p = cola[(st.cl.idx + k) % cola.length];
      if (p.estado === 'pendiente' && !st.cl.duda[p.codigo]) return abrirClasificacion(p.codigo);
    }
    const duda = cola.filter((p) => p.estado === 'pendiente' && st.cl.duda[p.codigo]).length;
    toast(duda ? `No quedan pendientes nuevas. ${duda} siguen en duda.` : 'Bandeja completa. No quedan alertas pendientes en este periodo.');
    cerrarForm();
  }

  function saltar() {
    const p = st.cl.cola[st.cl.idx];
    if (p && p.estado === 'pendiente') st.cl.duda[p.codigo] = true;
    siguiente();
  }

  async function guardar() {
    if ($('cl-guardar').disabled || st.cl.guardando) return;
    const p = st.cl.cola[st.cl.idx];
    const especialista = ($('cl-especialista').value || '').trim() || 'Sin nombre';
    localStorage.setItem('atd-especialista', $('cl-especialista').value.trim());
    const causaNombre = st.catalogos?.causas?.find((c) => c.id === st.cl.causa)?.nombre
      || (st.cl.resultado === 'natural' ? 'Natural' : st.cl.resultado === 'falsa' ? 'Falsa alerta' : '');
    const conclusion = $('cl-conclusion').value.trim();
    st.cl.guardando = true;
    $('cl-guardar').disabled = true;
    try {
      const r = await fetch(`${API}/alertas/${p.codigo}/clasificacion`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': tokenCsrf() },
        body: JSON.stringify({
          resultado: st.cl.resultado,
          causaId: st.cl.causa,
          confiabilidadId: st.cl.conf,
          tipoBosqueId: st.cl.bosque,
          conclusion,
          especialista,
        }),
      });
      if (r.status === 401 || r.status === 403) {
        $('cl-guardar').disabled = false;
        irAlLogin();
        return;
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar');
      p.estado = 'validada';
      p.resultado = j.resultado || st.cl.resultado;
      p.causa = j.causa || causaNombre;
      p.causa_id = j.causaId || st.cl.causa;
      delete st.cl.duda[p.codigo];
      st.cl.hechas[p.codigo] = {
        resultado: st.cl.resultado, causa: p.causa_id, causaNombre: p.causa, conf: st.cl.conf,
        bosque: st.cl.bosque, conclusion, especialista,
      };
      const caja = $('cl-ultimo');
      caja.hidden = false;
      caja.innerHTML = `<b>Guardada en la base</b><br>
        ${esc(p.codigo)} · ${esc(TEXTO[st.cl.resultado])}${p.causa && st.cl.resultado === 'antropica' ? ' · ' + esc(p.causa) : ''}<br>
        Especialista: ${esc(especialista)}<br>
        ${conclusion ? 'Conclusión: ' + esc(conclusion) + '<br>' : ''}
        Si cierra el navegador, esta decisión sigue en la alerta. La conclusión sale en el PDF.`;
      const m = marcas.get(p.codigo);
      if (m) {
        m.p = { ...m.p, estado: 'validada', resultado: st.cl.resultado, causa: p.causa };
        m.poli.setStyle(estiloAlerta(m.p, false));
        m.punto.setStyle({ fillColor: COLOR[st.cl.resultado] });
      }
      toast(`${p.codigo} quedó guardada como "${TEXTO[st.cl.resultado]}"`);
      siguiente();
    } catch (e) {
      toast(e.message);
      pintarForm();
    } finally {
      st.cl.guardando = false;
    }
  }

  $('cl-guardar').onclick = guardar;
  $('cl-saltar').onclick = saltar;

  document.addEventListener('keydown', (e) => {
    if (st.modo !== 'clasificar' || $('cl-form').hidden || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'a') elegirResultado('antropica');
    else if (k === 'n') elegirResultado('natural');
    else if (k === 'f') elegirResultado('falsa');
    else if (k === 'u' || k === 's') saltar();
    else if (k === 'enter') guardar();
    else if (k === 'escape') cerrarForm();
  });

  /* ====================================================== GENERAL */
  $('btn-panel').onclick = () => {
    const oculto = $('panel').classList.toggle('oculto');
    document.body.classList.toggle('sin-panel', oculto);
    $('btn-panel').querySelector('i').className = oculto ? 'fas fa-angles-right' : 'fas fa-angles-left';
    setTimeout(() => mapa.invalidateSize(), 320);
  };
  $('btn-acerca').onclick = () => $('dlg-acerca').showModal();
  $('acerca-guia').onclick = () => { $('dlg-acerca').close(); $('dlg-tutorial').showModal(); };
  const recordarTutorial = () => {
    try { localStorage.setItem('atd-tutorial', $('tut-siempre').checked ? 'si' : 'no'); } catch (e) {}
  };
  $('dlg-tutorial').addEventListener('close', recordarTutorial);
  try {
    if (localStorage.getItem('atd-tutorial') !== 'no') $('dlg-tutorial').showModal();
  } catch (e) {}
  $('btn-tema').onclick = () => {
    const oscuro = document.documentElement.dataset.tema === 'oscuro';
    if (oscuro) delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = 'oscuro';
    try { localStorage.setItem('atd-tema', oscuro ? 'claro' : 'oscuro'); } catch (e) {}
  };
  const guia = $('cl-guia');
  if (guia) {
    try { if (localStorage.getItem('atd-guia') === 'cerrada') guia.open = false; } catch (e) {}
    guia.addEventListener('toggle', () => {
      try { localStorage.setItem('atd-guia', guia.open ? 'abierta' : 'cerrada'); } catch (e) {}
    });
  }

  // Enlace directo desde el reporte PDF: /?alerta=LOR-2026-0205
  async function abrirEnlace(codigo) {
    if (!/^[A-Z]{3}-\d{4}-\d{4,6}$/.test(codigo)) return;
    const d = (await api(`/alertas/${codigo}`)).properties;
    const t = st.territorios.find((x) => x.codigo === d.acr);
    if (!t) return;
    await elegirRegion(t.region);
    await elegirAcr(d.acr);
    const idx = st.eje.findIndex((p) => p.anio === d.anio && p.mes === d.mes);
    if (idx >= 0) {
    $('f-desde').value = String(idx);
    $('f-hasta').value = String(idx);
    st.calAnio = d.anio;
    calAncla = null;
    pintarEtiquetasPeriodo();
    }
    st.anio = d.anio; st.mes = d.mes;
    await cargarResumen();
    desbloquear(3);
    await verAlerta(codigo);
  }

  (async function iniciar() {
    sincronizacion();
    cargarLimitesOficiales().catch(() => {});
    cargarPropuesta();
    try {
      st.territorios = await api('/territorios');
      llenarRegiones();
      try {
        st.catalogos = await api('/catalogos');
        $('f-causa').innerHTML = '<option value="">Todas</option>' + st.catalogos.causas
          .map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
      } catch { /* el filtro de causa queda en Todas */ }
      const enlace = new URLSearchParams(location.search).get('alerta');
      if (enlace) {
        await abrirEnlace(enlace).catch(() => toast('No se encontró la alerta del enlace'));
      } else if ($('f-region').options.length) {
        const loreto = [...$('f-region').options].find((op) => /loreto/i.test(op.value) || /loreto/i.test(op.textContent));
        $('f-region').value = (loreto || $('f-region').options[0]).value;
        await alCambiarRegion();
      }
    } catch (e) {
      $('f-error').hidden = false;
      $('f-error').textContent = 'No se pudo conectar con el servicio ATD.';
    }
  })();
})();
