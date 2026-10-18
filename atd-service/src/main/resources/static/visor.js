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

  const irAlLogin = () => {
    const d = document.getElementById('dlg-entrar');
    if (!d) { location.assign('/login.html'); return; }
    const csrf = document.getElementById('entrar-csrf');
    if (csrf) csrf.value = tokenCsrf();
    if (!d.open) d.showModal();
  };
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
    periodos: [], periodosPorAcr: {}, eje: [], resumen: null, geo: null, filtro: 'todas', alerta: null, escenas: [],
    pasoMax: 1, modo: 'consulta', catalogos: null,
    cl: { cola: [], idx: -1, hechas: {}, resultado: null, causa: null, conf: 1, bosque: 1 },
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
    style: { color: '#00e5ff', weight: 2.6, fillOpacity: 0 },
  }).addTo(mapa);
  const marcas = new Map();

  function estiloAlerta(p, sel) {
    return {
      color: sel ? '#ffffff' : '#e53935',
      weight: sel ? 3.2 : 2.2,
      fillOpacity: 0,
    };
  }

  function dibujarAlertas(features) {
    capaAlertas.clearLayers();
    capaPuntos.clearLayers();
    marcas.clear();
    features.forEach((f) => {
      const p = f.properties;
      const poli = L.geoJSON(f, { style: () => estiloAlerta(p, false) });
      const punto = L.circleMarker([p.lat, p.lon], {
        radius: 6, color: '#fff', weight: 1.5, fillColor: COLOR[clase(p)], fillOpacity: .95,
      });
      poli.bindTooltip(`${p.codigo} · ${ha(p.superficie_ha)} · un solo polígono`);
      punto.bindTooltip(`${p.codigo} · centro de esta misma alerta`);
      [poli, punto].forEach((l) => {
        l.on('click', () => (st.modo === 'clasificar' ? abrirClasificacion(p.codigo) : verAlerta(p.codigo)));
      });
      capaAlertas.addLayer(poli);
      capaPuntos.addLayer(punto);
      marcas.set(p.codigo, { poli, punto, p });
    });
    capaLimites.bringToFront();
    ajustarPuntos();
  }

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

  function ajustarPuntos() {
    const ver = mapa.getZoom() >= 15 && $('c-alertas').checked;
    if (ver && !mapa.hasLayer(capaPuntos)) mapa.addLayer(capaPuntos);
    if (!ver && mapa.hasLayer(capaPuntos)) mapa.removeLayer(capaPuntos);
    const prop = $('c-propuesta');
    const verProp = mapa.getZoom() >= 13 && (!prop || prop.checked);
    if (verProp && !mapa.hasLayer(capaPropuesta)) mapa.addLayer(capaPropuesta);
    if (!verProp && mapa.hasLayer(capaPropuesta)) mapa.removeLayer(capaPropuesta);
    if (verProp) capaPropuesta.bringToFront();
  }
  mapa.on('zoomend', ajustarPuntos);

  async function cargarLimitesOficiales() {
    if (capaLimites.getLayers().length) return;
    const [acr, zi] = await Promise.all([
      fetch('/limites/acr.geojson').then((r) => r.json()),
      fetch('/limites/zi.geojson').then((r) => r.json()),
    ]);
    capaLimites.addData(acr);
    capaLimites.addData(zi);
    capaLimites.bringToFront();
    const loreto = new Set(['ACR_AA', 'ZI_AA', 'ACR_ANPCH', 'ZI_ANPCH', 'ACR_CTT', 'ZI_CTT', 'ACR_MK', 'ZI_MK']);
    const foco = capaLimites.getLayers().filter((l) => loreto.has(l.feature.properties.codigo));
    if (!st.region && foco.length) mapa.fitBounds(L.featureGroup(foco).getBounds(), encuadre(40));
  }

  function cargarPropuesta() {
    return fetch('/limites/propuesta_loreto.geojson')
      .then((r) => (r.ok ? r.json() : null))
      .then((gj) => {
        if (!gj) return;
        capaPropuesta.addData(gj);
        capaPropuesta.eachLayer((l) => l.bindTooltip(`${l.feature.properties.codigo} · contorno automático`, { sticky: true }));
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
  $('c-alertas').onchange = (e) => { e.target.checked ? mapa.addLayer(capaAlertas) : mapa.removeLayer(capaAlertas); ajustarPuntos(); };
  $('c-geob').onchange = (e) => {
    document.querySelectorAll('.ley-geob').forEach((d) => (d.hidden = !e.target.checked));
    if ($('f-c-geob')) $('f-c-geob').checked = e.target.checked;
    if (e.target.checked) { geobosques.addTo(mapa); toast('GeoBosques 2026: magenta = última semana, azul = acumulado del año'); } else mapa.removeLayer(geobosques);
  };
  if ($('c-geob').checked) geobosques.addTo(mapa);
  $('c-limites').onchange = (e) => (e.target.checked ? mapa.addLayer(capaLimites) : mapa.removeLayer(capaLimites));
  if ($('c-propuesta')) $('c-propuesta').onchange = () => ajustarPuntos();
  document.querySelectorAll('input[name=base]').forEach((r) => (r.onchange = () => {
    mapa.removeLayer(base);
    base = bases[r.value].addTo(mapa);
    base.bringToBack();
    etiquetas.bringToFront();
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

  function pintarEtiquetasPeriodo() {
    const a = st.eje[+$('f-desde').value];
    const b = st.eje[+$('f-hasta').value];
    if (a) $('f-desde-lbl').textContent = etiquetaMes(a);
    if (b) $('f-hasta-lbl').textContent = etiquetaMes(b);
  }

  function armarEje() {
    const puntos = [];
    acrsDeRegion(st.region).forEach((t) => (st.periodosPorAcr[t.codigo] || []).forEach((p) => puntos.push(p)));
    if (!puntos.length) {
      st.eje = [];
      $('f-desde').disabled = true;
      $('f-hasta').disabled = true;
      return;
    }
    const min = puntos.reduce((m, p) => (ym(p) < ym(m) ? p : m));
    const max = puntos.reduce((m, p) => (ym(p) > ym(m) ? p : m));
    const eje = [];
    for (let y = min.anio, m = min.mes; y < max.anio || (y === max.anio && m <= max.mes); ) {
      eje.push({ anio: y, mes: m });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    st.eje = eje;
    $('f-desde').disabled = false;
    $('f-hasta').disabled = false;
    $('f-desde').max = String(eje.length - 1);
    $('f-hasta').max = String(eje.length - 1);
    const anioHoy = new Date().getFullYear();
    let desde = eje.findIndex((p) => p.anio === anioHoy);
    let hasta = -1;
    eje.forEach((p, i) => { if (p.anio === anioHoy) hasta = i; });
    if (desde < 0) { desde = 0; hasta = eje.length - 1; }
    $('f-desde').value = String(desde);
    $('f-hasta').value = String(hasta);
    pintarEtiquetasPeriodo();
    const uno = $('f-acr').value !== 'todas' ? $('f-acr').value : acrsDeRegion(st.region)[0]?.codigo;
    st.periodos = st.periodosPorAcr[uno] || [];
    st.anio = eje[hasta].anio;
    st.mes = eje[hasta].mes;
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
  }

  async function alCambiarAcr() {
    st.acr = $('f-acr').value === 'todas' ? null : $('f-acr').value;
    if (st.acr) enfocarAcr();
    else if (st.region) await cargarLimitesRegion(st.region);
    const uno = st.acr || acrsDeRegion(st.region)[0]?.codigo;
    st.periodos = st.periodosPorAcr[uno] || [];
  }

  function filtroExtra() {
    const q = ($('f-texto').value || '').trim();
    const porCodigo = document.querySelector('input[name="f-por"]:checked')?.value !== 'territorio';
    if (porCodigo && q) return true;
    if (!$('mb-det').hidden) {
      if (+$('f-ha-min').value > 0 || +$('f-ha-max').value < +$('f-ha-max').max) return true;
      if ($('f-resultado').value !== 'todas') return true;
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

  async function buscar() {
    const btn = $('ir-2');
    const previo = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando…';
    try {
      const texto = ($('f-texto').value || '').trim().toUpperCase();
      const porCodigo = document.querySelector('input[name="f-por"]:checked')?.value !== 'territorio';
      if (porCodigo && /^[A-Z]{3}-\d{4}-\d{4,6}$/.test(texto)) {
        await abrirEnlace(texto);
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
      } else if (acrs.length === 1 && meses.length === 1) {
        await cargarResumen();
        const features = (st.geo.features || []).filter(pasaFiltro);
        st.geo.features = features;
        pintarAgregado(features, meses);
        dibujarAlertas(features);
        renderLista();
      } else {
        const features = (await traerAlertas(acrs, meses)).filter(pasaFiltro);
        st.geo = { type: 'FeatureCollection', features };
        st.filtro = 'todas';
        st.resumen = null;
        pintarAgregado(features, meses);
        dibujarAlertas(features);
        renderLista();
      }
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
  }

  function pintarGraficoMeses() {
    $('graf-anio').textContent = st.anio;
    const porMes = Array(12).fill(0);
    const codigos = $('f-acr').value === 'todas' ? acrsElegidos() : [st.acr];
    codigos.forEach((codigo) => {
      (st.periodosPorAcr[codigo] || []).filter((p) => p.anio === st.anio).forEach((p) => { porMes[p.mes - 1] += p.alertas; });
    });
    const desde = st.eje[+$('f-desde').value];
    const hasta = st.eje[+$('f-hasta').value];
    const max = Math.max(1, ...porMes);
    $('graf-meses').innerHTML = porMes.map((n, i) => {
      const cur = st.anio * 12 + (i + 1);
      const sel = desde && hasta && cur >= ym(desde) && cur <= ym(hasta);
      return `<div data-m="${i + 1}" class="${sel ? 'sel' : ''}" title="${MESES[i]}: ${n} alertas">
      <b>${n || ''}</b><i style="height:${(n / max) * 80}%"></i>${MESES[i].slice(0, 1)}</div>`;
    }).join('');
    $('graf-meses').querySelectorAll('div').forEach((d) => (d.onclick = async () => {
      const m = +d.dataset.m;
      const idx = st.eje.findIndex((p) => p.anio === st.anio && p.mes === m);
      if (idx < 0) return;
      $('f-desde').value = String(idx);
      $('f-hasta').value = String(idx);
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
  ordenarRango($('f-desde'), $('f-hasta'), pintarEtiquetasPeriodo);
  ordenarRango($('f-ha-min'), $('f-ha-max'), pintarHa);
  pintarHa();
  $('f-region').onchange = () => alCambiarRegion();
  $('f-acr').onchange = () => alCambiarAcr();
  $('f-ambito').onchange = async () => {
    st.ambito = $('f-ambito').value;
    await cargarPeriodosRegion();
  };
  $('f-lupa').onclick = () => buscar();
  $('f-texto').addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(); });
  $('f-reset').onclick = () => resetFiltros();
  $('ir-2').onclick = () => buscar();
  $('f-c-alertas').onchange = (e) => { $('c-alertas').checked = e.target.checked; $('c-alertas').onchange(e); };
  $('f-c-geob').onchange = (e) => { $('c-geob').checked = e.target.checked; $('c-geob').onchange(e); };
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
  }

  $('ir-3').onclick = () => desbloquear(3);

  /* ---------- Paso 3: lista ---------- */
  function renderLista() {
    const feats = st.geo.features;
    const cuenta = { todas: feats.length, antropica: 0, natural: 0, falsa: 0, pendiente: 0 };
    feats.forEach((f) => cuenta[clase(f.properties)]++);
    $('filtros-res').innerHTML = Object.keys(cuenta).filter((k) => k === 'todas' || cuenta[k]).map((k) =>
      `<button class="filtro ${st.filtro === k ? 'sel' : ''}" data-f="${k}" style="--c:${COLOR[k] || '#1d2b20'}">${k === 'todas' ? '' : '<i></i>'}${k === 'todas' ? 'Todas' : TEXTO[k]} · ${cuenta[k]}</button>`).join('');
    $('filtros-res').querySelectorAll('.filtro').forEach((b) => (b.onclick = () => { st.filtro = b.dataset.f; renderLista(); }));

    const lista = feats.filter((f) => st.filtro === 'todas' || clase(f.properties) === st.filtro)
      .sort((x, y) => y.properties.superficie_ha - x.properties.superficie_ha);
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

  function comparador(cont, escenas, geom, codigo) {
    const antes = escenas.find((e) => e.momento === 'antes');
    const despues = escenas.find((e) => e.momento === 'despues');
    const sugerida = despues?.fecha || antes?.fecha || '';
    const par = (antes && despues) ? `<div class="comparador" style="--pos:50%">
        <img src="${despues.imagen}" alt="Imagen después">
        <img class="antes" src="${antes.imagen}" alt="Imagen antes">
        ${contornoSvg(geom, despues.recorte || antes.recorte)}
        <div class="divisor"></div>
        <span class="rot izq">ANTES<small>${fecha(antes.fecha)}</small></span>
        <span class="rot der">DESPUÉS<small>${fecha(despues.fecha)}</small></span>
        <input type="range" min="0" max="100" value="50" aria-label="Deslizar para comparar">
      </div>
      <p class="sensor-nota">Par del reporte: Sentinel-2 L2A, ${fecha(antes.fecha)} y ${fecha(despues.fecha)}. El contorno es el polígono de la alerta.</p>`
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
    const c = cont.querySelector('.comparador');
    if (c) c.querySelector('input').oninput = (e) => c.style.setProperty('--pos', `${e.target.value}%`);
    if (codigo) buscarSentinel(cont, codigo, sugerida);
  }

  function ficha(d, escenas) {
    const antes = escenas.find((e) => e.momento === 'antes');
    const despues = escenas.find((e) => e.momento === 'despues');
    const filas = [
      ['Superficie', ha(d.superficie_ha)], ['Fecha de detección', fecha(d.fecha_imagen)],
      ['Ámbito', d.ambito === 'ZI' ? 'Zona de Influencia' : 'Dentro del ACR'], ['Zonificación', d.zonificacion],
      ['Causal', d.causa], ['Confiabilidad', d.confiabilidad], ['Tipo de bosque', d.tipo_bosque], ['Sector', d.sector],
      ['Coordenadas', `${num(d.lat, 5)}, ${num(d.lon, 5)}`], ['Fuente de detección', d.fuente],
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
    $('ev-editar').hidden = !ed.habilitada;
    $('ev-ficha').innerHTML = ficha(d, escenas);
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
  function verEscena(momento) {
    if (capaEscena) { mapa.removeLayer(capaEscena); capaEscena = null; }
    $('ev-escena-sel').querySelectorAll('button').forEach((b) => b.classList.toggle('activo', b.dataset.v === momento));
    const e = st.escenas.find((x) => x.momento === momento);
    const fija = $('escena-fija');
    if (!e || !e.recorte) { fija.hidden = true; return; }
    const [x0, y0, x1, y1] = e.recorte;
    const limites = L.latLngBounds(L.CRS.EPSG3857.unproject(L.point(x0, y0)), L.CRS.EPSG3857.unproject(L.point(x1, y1)));
    capaEscena = L.imageOverlay(e.imagen, limites, { pane: 'escena', interactive: false }).addTo(mapa);
    if (!mapa.getBounds().intersects(limites)) mapa.flyToBounds(limites, encuadre(20));
    fija.hidden = false;
    fija.textContent = `Sentinel-2 L2A · ${momento === 'antes' ? 'antes' : 'después'} · ${fecha(e.fecha)} · ${e.escenaId}`;
  }
  $('ev-escena-sel').querySelectorAll('button').forEach((b) => (b.onclick = () => verEscena(b.dataset.v)));

  /* ---------- Edición del polígono ---------- */
  const ed = { habilitada: false, capa: null, codigo: null, herr: 'vertices' };
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
    if (st.alerta && $('ed-panel').hidden) $('ev-editar').hidden = !ed.habilitada;
    if (st.alerta) cargarFotos(st.alerta);
  }).catch(() => {});

  async function cargarFotos(codigo) {
    let fotos = [];
    try { fotos = await api(`/alertas/${codigo}/foto`, true); } catch { fotos = []; }
    const box = $('ev-fotos');
    box.innerHTML = fotos.length ? fotos.map((f) => `
      <figure>
        <img src="${f.url}" alt="Foto de campo de ${esc(codigo)}">
        <figcaption>${esc(f.nota || 'Foto de patrulla')}${f.tomada ? ' · ' + esc(f.tomada) : ''}</figcaption>
        ${ed.habilitada ? `<button type="button" class="btn-sec foto-borrar" data-id="${f.id}">Quitar</button>` : ''}
      </figure>`).join('') : '<p class="ayuda">Todavía no hay foto de campo en esta alerta.</p>';
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
      ? `${fotos.length} foto${fotos.length === 1 ? '' : 's'} de patrulla`
      : 'Sin foto de patrulla';
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
  $('entrar-cancelar').onclick = () => $('dlg-entrar').close();
  if (new URLSearchParams(location.search).has('entrar')) {
    $('entrar-aviso').hidden = false;
    irAlLogin();
  }
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
    verEscena('despues');
    mapa.flyToBounds(ed.capa.getBounds(), { ...encuadre(70), maxZoom: 17 });
    $('ed-orig').textContent = `(antes: ${ha(st.detalle.superficie_ha)})`;
    $('ed-restaurar').hidden = !st.detalle.editada;
    $('ed-panel').hidden = false;
    $('ev-editar').hidden = true;
    aplicarHerramienta();
    actualizarArea();
    $('ed-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function terminarEdicion() {
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
    $('ev-editar').hidden = !ed.habilitada;
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
    if (st.geo) {
      st.geo = await api(`/alertas?acr=${st.acr}&ambito=${st.ambito}&anio=${st.anio}&mes=${st.mes}`, true);
      dibujarAlertas(st.geo.features);
    }
    await verAlerta(codigo, true);
  }

  $('ev-editar').onclick = editar;
  $('ed-herr').querySelectorAll('[data-h]').forEach((b) => (b.onclick = () => { ed.herr = b.dataset.h; aplicarHerramienta(); }));
  $('ed-mas').onclick = () => escalar(1.05);
  $('ed-menos').onclick = () => escalar(1 / 1.05);
  $('ed-cancelar').onclick = terminarEdicion;
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
  $('rep-descargar').onclick = () => {
    const a = Object.assign(document.createElement('a'), { href: urlReporte(), download: '' });
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /* ====================================================== MODO CLASIFICAR */
  function cambiarModo(modo) {
    st.modo = modo;
    document.querySelectorAll('.rail-btn[data-modo]').forEach((b) => b.classList.toggle('activo', b.dataset.modo === modo));
    $('modo-consulta').hidden = modo !== 'consulta';
    $('modo-clasificar').hidden = modo !== 'clasificar';
    $('cab-sub').textContent = modo === 'consulta' ? 'Áreas de Conservación Regional · Consulta de alertas' : 'Bandeja de clasificación · Especialistas regionales';
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
    if (!st.catalogos) {
      st.catalogos = await api('/catalogos');
      $('cl-causas').innerHTML = st.catalogos.causas.filter((c) => c.resultado === 'antropica')
        .map((c) => `<button data-v="${c.id}">${esc(c.nombre)}</button>`).join('');
      $('cl-causas').querySelectorAll('button').forEach((b) => (b.onclick = () => { st.cl.causa = +b.dataset.v; pintarForm(); }));
      $('cl-conf').innerHTML = st.catalogos.confiabilidad.map((c) => `<button data-v="${c.id}">${esc(c.nombre)}</button>`).join('');
      $('cl-bosque').innerHTML = st.catalogos.tipoBosque.map((c) => `<button data-v="${c.id}">${esc(c.nombre)}</button>`).join('');
      $('cl-conf').querySelectorAll('button').forEach((b) => (b.onclick = () => { st.cl.conf = +b.dataset.v; pintarForm(); }));
      $('cl-bosque').querySelectorAll('button').forEach((b) => (b.onclick = () => { st.cl.bosque = +b.dataset.v; pintarForm(); }));

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
    enfocarAcr();
    $('cl-form').hidden = true;
    renderCola();
  }

  function renderCola() {
    const cola = st.cl.cola;
    const pend = cola.filter((p) => p.estado === 'pendiente' && !st.cl.hechas[p.codigo]).length;
    const hechas = cola.filter((p) => st.cl.hechas[p.codigo]).length;
    $('cl-cola-cab').innerHTML = `<span><b>${pend}</b> por clasificar · ${hechas} clasificadas en esta sesión</span><span>${cola.filter((p) => p.con_imagen).length} con Sentinel-2</span>`;
    $('cl-cola').innerHTML = `<div class="progreso"><i style="width:${cola.length ? ((cola.length - pend) / cola.length) * 100 : 0}%"></i></div>` + cola.map((p) => {
      const hecha = st.cl.hechas[p.codigo];
      const c = hecha ? hecha.resultado : clase(p);
      const mini = p.con_imagen ? `style="background-image:url('${API}/alertas/${p.codigo}/imagen/despues.png')"` : '';
      return `<button class="item" data-c="${esc(p.codigo)}"><span class="miniatura" ${mini}>${p.con_imagen ? '' : '<i class="fas fa-satellite"></i>'}</span>
        <span><strong>${esc(p.codigo)}</strong><small>${fecha(p.fecha_imagen)} · ${p.ambito === 'ZI' ? 'ZI' : 'ACR'} · ${p.con_imagen ? 'imagen lista' : 'sin imagen aún'}</small>
        <span class="chip" style="--c:${COLOR[c]};margin-top:5px">${hecha ? '✓ ' : ''}${TEXTO[c]}</span></span>
        <span class="ha">${num(p.superficie_ha)}<small>ha</small></span></button>`;
    }).join('');
    $('cl-cola').querySelectorAll('.item').forEach((b) => (b.onclick = () => abrirClasificacion(b.dataset.c)));
    const filas = cola.map((p) => {
      const hecha = st.cl.hechas[p.codigo];
      const causa = hecha?.causaNombre || p.causa || (p.estado === 'pendiente' ? 'Pendiente' : '');
      return `<tr><td>${esc(p.codigo)}</td><td>${p.ambito === 'ZI' ? 'ZI' : 'ACR'}</td><td>${num(p.lon, 5)}</td><td>${num(p.lat, 5)}</td><td>${esc(causa)}</td><td>${hecha ? 'Clasificada en sesión' : (p.estado === 'pendiente' ? 'Pendiente' : 'Validada')}</td></tr>`;
    }).join('');
    $('cl-cola').insertAdjacentHTML('beforeend', `<div class="cl-tabla-wrap"><table class="cl-tabla"><thead><tr><th>Código</th><th>Ámbito</th><th>X</th><th>Y</th><th>Causa</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table></div>
      <button type="button" class="btn-sec" id="cl-csv" style="margin-top:8px"><i class="fas fa-download"></i> Descargar coordenadas</button>`);
    $('cl-csv').onclick = () => {
      const header = ['codigo', 'ambito', 'x', 'y', 'causa', 'estado'];
      const lineas = [header.join(',')].concat(cola.map((p) => {
        const hecha = st.cl.hechas[p.codigo];
        const causa = hecha?.causaNombre || p.causa || '';
        const estado = hecha ? 'clasificada_sesion' : p.estado;
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
    Object.assign(st.cl, { resultado: previa?.resultado || null, causa: previa?.causa || null, conf: previa?.conf || 1, bosque: previa?.bosque || 1 });
    $('cl-conclusion').value = previa?.conclusion || '';
    $('cl-codigo').textContent = p.codigo;
    $('cl-codigo-nota').textContent = notaCodigo(p.codigo);
    $('cl-sub').textContent = `${ha(p.superficie_ha)} · detectada el ${fecha(p.fecha_imagen)} · ${p.ambito === 'ZI' ? 'Zona de Influencia' : 'Dentro del ACR'}`;
    $('cl-cola').hidden = true; $('cl-cola-cab').hidden = true; $('cl-form').hidden = false;
    $('cl-comparador').innerHTML = '<div class="sin-imagen"><i class="fas fa-spinner fa-spin"></i>Cargando imágenes…</div>';
    resaltar(codigo);
    pintarForm();
    const feat = st.cl.geo.features.find((f) => f.properties.codigo === codigo);
    comparador($('cl-comparador'), await api(`/alertas/${codigo}/evidencia`), feat?.geometry, codigo);
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
    if (v !== 'antropica') st.cl.causa = null;
    pintarForm();
  }

  function cerrarForm() {
    $('cl-form').hidden = true; $('cl-cola').hidden = false; $('cl-cola-cab').hidden = false;
    renderCola();
  }
  $('cl-cerrar').onclick = cerrarForm;

  function siguiente() {
    const cola = st.cl.cola;
    for (let k = 1; k <= cola.length; k++) {
      const p = cola[(st.cl.idx + k) % cola.length];
      if (p.estado === 'pendiente' && !st.cl.hechas[p.codigo]) return abrirClasificacion(p.codigo);
    }
    toast('¡Bandeja completa! No quedan alertas pendientes en este periodo.');
    cerrarForm();
  }

  function guardar() {
    if ($('cl-guardar').disabled) return;
    const p = st.cl.cola[st.cl.idx];
    const especialista = ($('cl-especialista').value || '').trim() || 'Sin nombre';
    localStorage.setItem('atd-especialista', $('cl-especialista').value.trim());
    const causaNombre = st.catalogos?.causas?.find((c) => c.id === st.cl.causa)?.nombre || '';
    const conclusion = $('cl-conclusion').value.trim();
    st.cl.hechas[p.codigo] = {
      resultado: st.cl.resultado, causa: st.cl.causa, causaNombre, conf: st.cl.conf,
      bosque: st.cl.bosque, conclusion, especialista,
    };
    const caja = $('cl-ultimo');
    caja.hidden = false;
    caja.innerHTML = `<b>Última clasificación guardada en esta sesión</b><br>
      ${esc(p.codigo)} · ${esc(TEXTO[st.cl.resultado])}${causaNombre ? ' · ' + esc(causaNombre) : ''}<br>
      Especialista: ${esc(especialista)}<br>
      ${conclusion ? 'Conclusión: ' + esc(conclusion) + '<br>' : ''}
      Ese texto de conclusión es el que va al reporte PDF, sección Conclusión técnica.`;
    const m = marcas.get(p.codigo);
    if (m) {
      const fake = { estado: 'validada', resultado: st.cl.resultado };
      m.p = { ...m.p, ...fake };
      m.poli.setStyle(estiloAlerta(m.p, false));
      m.punto.setStyle({ fillColor: COLOR[st.cl.resultado] });
    }
    toast(`${p.codigo} clasificada como "${TEXTO[st.cl.resultado]}" (demostración, no se guarda aún)`);
    siguiente();
  }
  $('cl-guardar').onclick = guardar;
  $('cl-saltar').onclick = siguiente;

  document.addEventListener('keydown', (e) => {
    if (st.modo !== 'clasificar' || $('cl-form').hidden || e.target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k === 'a') elegirResultado('antropica');
    else if (k === 'n') elegirResultado('natural');
    else if (k === 'f') elegirResultado('falsa');
    else if (k === 's') siguiente();
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
      const enlace = new URLSearchParams(location.search).get('alerta');
      if (enlace) {
        await abrirEnlace(enlace).catch(() => toast('No se encontró la alerta del enlace'));
      } else if ($('f-region').options.length) {
        const loreto = [...$('f-region').options].find((op) => /loreto/i.test(op.value) || /loreto/i.test(op.textContent));
        $('f-region').value = (loreto || $('f-region').options[0]).value;
        await alCambiarRegion();
        await buscar();
      }
    } catch (e) {
      $('f-error').hidden = false;
      $('f-error').textContent = 'No se pudo conectar con el servicio ATD.';
    }
  })();
})();
