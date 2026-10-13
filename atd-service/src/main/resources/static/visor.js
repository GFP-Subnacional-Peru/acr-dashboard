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

  const irAlLogin = () => location.assign('/login.html');
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
    periodos: [], resumen: null, geo: null, filtro: 'todas', alerta: null, escenas: [],
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

  const capaLimites = L.geoJSON(null, {
    style: (f) => {
      const sel = f.properties.codigo === st.acr || f.properties.codigo === (st.acr || '').replace('ACR_', 'ZI_');
      return { color: f.properties.tipo === 'ACR' ? '#2ecc40' : '#b0b6ba', weight: 1.5, opacity: sel || !st.acr ? 1 : .55, fill: false };
    },
    onEachFeature: (f, l) => l.bindTooltip(f.properties.nombre, { sticky: true }),
  }).addTo(mapa);

  const capaAlertas = L.featureGroup().addTo(mapa);
  const capaPuntos = L.featureGroup().addTo(mapa);
  const marcas = new Map();

  function estiloAlerta(p, sel) {
    const c = COLOR[clase(p)];
    return { color: sel ? '#ffffff' : c, weight: sel ? 3 : 1.6, fillColor: c, fillOpacity: sel ? .55 : .4 };
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
    const ver = mapa.getZoom() < 13 && $('c-alertas').checked;
    if (ver && !mapa.hasLayer(capaPuntos)) mapa.addLayer(capaPuntos);
    if (!ver && mapa.hasLayer(capaPuntos)) mapa.removeLayer(capaPuntos);
  }
  mapa.on('zoomend', ajustarPuntos);

  async function cargarLimitesRegion(region) {
    const acrs = st.territorios.filter((t) => t.region === region && t.tipo === 'ACR');
    const colecciones = await Promise.all(acrs.map((t) => api(`/territorios/${t.codigo}/limites`)));
    capaLimites.clearLayers();
    colecciones.forEach((fc) => capaLimites.addData(fc));
    if (capaLimites.getLayers().length) mapa.flyToBounds(capaLimites.getBounds(), encuadre(30));
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
    if (e.target.checked) { geobosques.addTo(mapa); toast('GeoBosques 2026: magenta = última semana, azul = acumulado del año'); } else mapa.removeLayer(geobosques);
  };
  $('c-limites').onchange = (e) => (e.target.checked ? mapa.addLayer(capaLimites) : mapa.removeLayer(capaLimites));
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

  /* ---------- Paso 1: territorio ---------- */
  function renderRegiones() {
    const regiones = [...new Map(st.territorios.map((t) => [t.region, t.regionNombre])).entries()];
    $('regiones').innerHTML = regiones.map(([cod, nom]) => {
      const n = st.territorios.filter((t) => t.region === cod).reduce((s, t) => s + t.alertas, 0);
      const acrs = st.territorios.filter((t) => t.region === cod && t.tipo === 'ACR').length;
      return `<button class="region" data-r="${esc(cod)}"><strong>${esc(nom)}</strong><small>${acrs} ACR · ${num(n, 0)} alertas</small></button>`;
    }).join('');
    $('regiones').querySelectorAll('.region').forEach((b) => (b.onclick = () => elegirRegion(b.dataset.r)));
  }

  async function elegirRegion(region) {
    st.region = region; st.acr = null; st.mes = null;
    $('regiones').querySelectorAll('.region').forEach((b) => b.classList.toggle('sel', b.dataset.r === region));
    const acrs = st.territorios.filter((t) => t.region === region && t.tipo === 'ACR');
    $('acrs').innerHTML = acrs.map((t) => {
      const zi = st.territorios.find((z) => z.codigo === t.codigo.replace('ACR_', 'ZI_'));
      const total = t.alertas + (zi ? zi.alertas : 0);
      return `<button class="acr" data-c="${esc(t.codigo)}"><div><strong>${esc(t.nombre)}</strong><small>${esc(t.codigoOficial)} · ${num(t.areaHa, 0)} ha</small></div>
              <div class="num">${num(total, 0)}<small><br>alertas</small></div></button>`;
    }).join('');
    $('acrs').querySelectorAll('.acr').forEach((b) => (b.onclick = () => elegirAcr(b.dataset.c)));
    $('meses').innerHTML = '<p class="vacio-mini">Seleccione un ACR</p>';
    $('ir-2').disabled = true;
    await cargarLimitesRegion(region);
  }

  async function elegirAcr(codigo) {
    st.acr = codigo;
    $('acrs').querySelectorAll('.acr').forEach((b) => b.classList.toggle('sel', b.dataset.c === codigo));
    enfocarAcr();
    await cargarPeriodos();
  }

  async function cargarPeriodos() {
    st.periodos = await api(`/periodos?acr=${st.acr}&ambito=${st.ambito}`);
    if (!st.periodos.some((p) => p.anio === st.anio && p.mes === st.mes)) {
      st.anio = st.periodos[0]?.anio ?? null;
      st.mes = st.periodos[0]?.mes ?? null;
    }
    $('meses').innerHTML = st.periodos.length
      ? st.periodos.map((p) => `<button class="mes" data-a="${p.anio}" data-m="${p.mes}">${MESES[p.mes - 1].slice(0, 3)} ${p.anio} <small>· ${p.alertas}</small></button>`).join('')
      : '<p class="vacio-mini">Sin alertas en este ámbito</p>';
    $('meses').querySelectorAll('.mes').forEach((b) => (b.onclick = () => { st.anio = +b.dataset.a; st.mes = +b.dataset.m; marcarMes(); }));
    marcarMes();
  }

  function marcarMes() {
    $('meses').querySelectorAll('.mes').forEach((b) => b.classList.toggle('sel', +b.dataset.a === st.anio && +b.dataset.m === st.mes));
    $('ir-2').disabled = !(st.acr && st.mes);
  }

  $('ambito').querySelectorAll('button').forEach((b) => (b.onclick = () => {
    st.ambito = b.dataset.v;
    $('ambito').querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
    if (st.acr) cargarPeriodos();
  }));

  $('ir-2').onclick = async () => { await cargarResumen(); desbloquear(2); };

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

    $('graf-anio').textContent = st.anio;
    const porMes = Array(12).fill(0);
    st.periodos.filter((p) => p.anio === st.anio).forEach((p) => (porMes[p.mes - 1] = p.alertas));
    const max = Math.max(1, ...porMes);
    $('graf-meses').innerHTML = porMes.map((n, i) => `<div data-m="${i + 1}" class="${i + 1 === st.mes ? 'sel' : ''}" title="${MESES[i]}: ${n} alertas">
      <b>${n || ''}</b><i style="height:${(n / max) * 80}%"></i>${MESES[i].slice(0, 1)}</div>`).join('');
    $('graf-meses').querySelectorAll('div').forEach((d) => (d.onclick = async () => {
      const m = +d.dataset.m;
      if (!st.periodos.some((p) => p.anio === st.anio && p.mes === m)) return;
      st.mes = m; marcarMes(); await cargarResumen();
    }));

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
        <span><strong>${esc(p.codigo)}</strong><small>${fecha(p.fecha_imagen)} · ${p.ambito === 'ZI' ? 'Zona de Influencia' : 'ACR'}${p.causa ? ' · ' + esc(p.causa) : ''}</small>
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

  function comparador(cont, escenas, geom) {
    const antes = escenas.find((e) => e.momento === 'antes');
    const despues = escenas.find((e) => e.momento === 'despues');
    if (!antes || !despues) {
      cont.innerHTML = `<div class="sin-imagen"><i class="fas fa-cloud-sun"></i>Aún no hay un par de imágenes Sentinel-2 con nubosidad menor al 30 % para esta alerta.<br>Se generará automáticamente en la próxima actualización.</div>`;
      return;
    }
    cont.innerHTML = `<div class="comparador" style="--pos:50%">
        <img src="${despues.imagen}" alt="Imagen después">
        <img class="antes" src="${antes.imagen}" alt="Imagen antes">
        ${contornoSvg(geom, despues.recorte || antes.recorte)}
        <div class="divisor"></div>
        <span class="rot izq">ANTES<small>${fecha(antes.fecha)}</small></span>
        <span class="rot der">DESPUÉS<small>${fecha(despues.fecha)}</small></span>
        <input type="range" min="0" max="100" value="50" aria-label="Deslizar para comparar">
      </div>
      <p class="sensor-nota">Sensor: Sentinel-2 L2A (Copernicus / Element84). Las fechas ${fecha(antes.fecha)} y ${fecha(despues.fecha)} son automáticas: la escena con nubosidad menor al 30 % más cercana a la detección. En esta pantalla no se elige otro día. El contorno naranja sobre la imagen es el mismo polígono de la alerta.</p>`;
    const c = cont.querySelector('.comparador');
    c.querySelector('input').oninput = (e) => c.style.setProperty('--pos', `${e.target.value}%`);
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
    comparador($('ev-comparador'), escenas, det.geometry);
    $('ev-escena').hidden = !escenas.some((e) => e.recorte);
    verEscena('');
    $('ev-editar').hidden = !ed.habilitada;
    $('ev-ficha').innerHTML = ficha(d, escenas);
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
    ed.habilitada = !!s.editor;
    $('usr-inicial').textContent = s.usuario.charAt(0);
    $('usr-nombre').textContent = s.usuario;
    $('rail-usuario').title = `${s.usuario} · ${s.editor ? 'editor' : 'consulta'}`;
    $('rail-usuario').hidden = false;
    document.querySelector('.rail-btn[data-modo="clasificar"]').hidden = !s.editor;
    if (st.alerta && $('ed-panel').hidden) $('ev-editar').hidden = !ed.habilitada;
  }).catch(() => {});
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
    if (r.status === 401) { irAlLogin(); throw new Error('Sesión vencida'); }
    if (r.status === 403) throw new Error('Su usuario no tiene permiso para editar polígonos');
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
    const lim = await api(`/territorios/${acr}/limites`);
    capaLimites.clearLayers().addData(lim);
    st.acr = acr;
    capaLimites.setStyle(capaLimites.options.style);
    mapa.flyToBounds(capaLimites.getBounds(), encuadre(30));
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
    comparador($('cl-comparador'), await api(`/alertas/${codigo}/evidencia`), feat?.geometry);
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
    st.anio = d.anio; st.mes = d.mes;
    marcarMes();
    await cargarResumen();
    desbloquear(3);
    await verAlerta(codigo);
  }

  (async function iniciar() {
    sincronizacion();
    try {
      st.territorios = await api('/territorios');
      renderRegiones();
      const enlace = new URLSearchParams(location.search).get('alerta');
      if (enlace) await abrirEnlace(enlace).catch(() => toast('No se encontró la alerta del enlace'));
    } catch (e) {
      $('regiones').innerHTML = '<p class="vacio-mini">No se pudo conectar con el servicio ATD.</p>';
    }
  })();
})();
