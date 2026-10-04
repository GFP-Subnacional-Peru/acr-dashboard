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

  async function api(ruta) {
    const r = await fetch(API + ruta);
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
  const bases = {
    esri: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri World Imagery' }),
    s2: L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg', { maxZoom: 17, attribution: 'Sentinel-2 cloudless 2024 · EOX (Copernicus)' }),
    topo: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' }),
    gris: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '© OpenStreetMap · CARTO' }),
  };
  let base = bases.esri.addTo(mapa);
  const etiquetas = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: .8 }).addTo(mapa);
  // La caché de teselas de GeoBosques está vacía; el export dinámico sí dibuja la semana vigente.
  const GeoBosquesExport = L.TileLayer.extend({
    getTileUrl(c) {
      const t = this.getTileSize();
      const nw = mapa.options.crs.project(mapa.unproject([c.x * t.x, c.y * t.y], c.z));
      const se = mapa.options.crs.project(mapa.unproject([(c.x + 1) * t.x, (c.y + 1) * t.y], c.z));
      return `${this._url}?bbox=${nw.x},${se.y},${se.x},${nw.y}&bboxSR=3857&imageSR=3857&size=${t.x},${t.y}&format=png32&transparent=true&f=image`;
    },
  });
  const geobosques = new GeoBosquesExport('https://gis.bosques.gob.pe/server/rest/services/Interoperabilidad/alertas_tempranas_2026/MapServer/export', { maxZoom: 19, opacity: .95, attribution: 'ATD GeoBosques · MINAM' });

  const capaLimites = L.geoJSON(null, {
    style: (f) => {
      const sel = f.properties.codigo === st.acr || f.properties.codigo === (st.acr || '').replace('ACR_', 'ZI_');
      return f.properties.tipo === 'ACR'
        ? { color: '#ffee58', weight: sel ? 3 : 1.6, opacity: sel ? 1 : .7, fill: false }
        : { color: '#80deea', weight: sel ? 2.4 : 1.4, opacity: sel ? 1 : .6, dashArray: '7 5', fill: false };
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
      [poli, punto].forEach((l) => {
        l.bindTooltip(`${p.codigo} · ${ha(p.superficie_ha)}`);
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
    const ver = mapa.getZoom() < 14 && $('c-alertas').checked;
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
      $('sync-detalle').textContent = `${num(s.alertas.total, 0)} alertas en el sistema · ${num(s.alertas.por_clasificar, 0)} por clasificar · ${num(s.alertas.con_sentinel2, 0)} con imagen Sentinel-2`;
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
  function comparador(cont, escenas) {
    const antes = escenas.find((e) => e.momento === 'antes');
    const despues = escenas.find((e) => e.momento === 'despues');
    if (!antes || !despues) {
      cont.innerHTML = `<div class="sin-imagen"><i class="fas fa-cloud-sun"></i>Aún no hay un par de imágenes Sentinel-2 sin nubes para esta alerta.<br>Se generará automáticamente en la próxima actualización.</div>`;
      return;
    }
    cont.innerHTML = `<div class="comparador" style="--pos:50%">
        <img src="${despues.imagen}" alt="Imagen después">
        <img class="antes" src="${antes.imagen}" alt="Imagen antes">
        <div class="divisor"></div>
        <span class="rot izq">ANTES<small>${fecha(antes.fecha)}</small></span>
        <span class="rot der">DESPUÉS<small>${fecha(despues.fecha)}</small></span>
        <input type="range" min="0" max="100" value="50" aria-label="Deslizar para comparar">
      </div>`;
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

  async function verAlerta(codigo) {
    if (st.modo !== 'consulta') return;
    st.alerta = codigo;
    const [det, escenas] = await Promise.all([api(`/alertas/${codigo}`), api(`/alertas/${codigo}/evidencia`)]);
    const d = det.properties, c = clase(d);
    st.detalle = d; st.escenas = escenas;
    $('ev-codigo').textContent = d.codigo;
    $('ev-sub').textContent = `${d.acr_nombre} · ${d.region}`;
    $('ev-chip').textContent = TEXTO[c];
    $('ev-chip').style.setProperty('--c', COLOR[c]);
    comparador($('ev-comparador'), escenas);
    $('ev-ficha').innerHTML = ficha(d, escenas);
    const concl = d.conclusion || (d.estado === 'pendiente' ? 'Alerta pendiente de validación técnica: aún no tiene clasificación ni causal definitiva.' : null);
    $('ev-conclusion').hidden = !concl;
    $('ev-conclusion').textContent = concl || '';
    resaltar(codigo);
    renderLista();
    desbloquear(4);
  }
  $('ev-volver').onclick = () => irPaso(3);

  /* ---------- Paso 5: reporte ---------- */
  function renderReporte() {
    const d = st.detalle, e = st.escenas;
    const antes = e.find((x) => x.momento === 'antes'), despues = e.find((x) => x.momento === 'despues');
    $('rep-prev').innerHTML = `<div class="rp-cab">Reporte de alerta ${esc(d.codigo)}<small>${esc(d.acr_nombre)} · ${esc(d.region)}</small></div>
      ${antes && despues ? `<div class="rp-img"><figure style="margin:0"><img src="${antes.imagen}"><figcaption>Antes · ${fecha(antes.fecha)}</figcaption></figure>
      <figure style="margin:0"><img src="${despues.imagen}"><figcaption>Después · ${fecha(despues.fecha)}</figcaption></figure></div>` : ''}
      <div class="ficha">${ficha(d, e)}</div>`;
  }
  $('ir-5').onclick = () => { renderReporte(); desbloquear(5); };

  $('rep-descargar').onclick = () => {
    const d = st.detalle, e = st.escenas, c = clase(d);
    const antes = e.find((x) => x.momento === 'antes'), despues = e.find((x) => x.momento === 'despues');
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Reporte ${esc(d.codigo)}</title>
      <style>
        @page { size: A4; margin: 16mm; }
        body { font-family: Inter, Segoe UI, Arial, sans-serif; color: #1d2b20; font-size: 12px; }
        .cab { background: linear-gradient(120deg,#7cb342,#1b5e20); color:#fff; padding:16px 18px; border-radius:10px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .cab h1 { margin:0; font-size:20px; } .cab p { margin:4px 0 0; opacity:.9; }
        .chip { display:inline-block; padding:3px 10px; border-radius:12px; color:#fff; background:${COLOR[c]}; font-weight:700; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .imgs { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:14px 0; }
        .imgs img { width:100%; border-radius:8px; } figcaption { text-align:center; color:#66756a; margin-top:3px; }
        table { width:100%; border-collapse:collapse; margin-top:8px; } td { border-bottom:1px solid #e3e9e4; padding:6px 8px; }
        td:first-child { color:#66756a; width:38%; }
        .concl { margin-top:14px; padding:10px 12px; border-left:4px solid #2e7d32; background:#f1f8e9; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .pie { margin-top:22px; color:#66756a; font-size:10px; border-top:1px solid #e3e9e4; padding-top:8px; }
      </style></head><body>
      <div class="cab"><h1>Reporte de Alerta Temprana de Deforestación</h1><p>${esc(d.acr_nombre)} · ${esc(d.region)} · Alerta ${esc(d.codigo)}</p></div>
      <p style="margin-top:14px">Resultado: <span class="chip">${TEXTO[c]}</span></p>
      ${antes && despues ? `<div class="imgs"><figure style="margin:0"><img src="${location.origin + antes.imagen}"><figcaption>Antes · Sentinel-2 · ${fecha(antes.fecha)}</figcaption></figure>
      <figure style="margin:0"><img src="${location.origin + despues.imagen}"><figcaption>Después · Sentinel-2 · ${fecha(despues.fecha)}</figcaption></figure></div>` : ''}
      <table>${ficha(d, e).replace(/<div><span>(.*?)<\/span><b>(.*?)<\/b><\/div>/g, '<tr><td>$1</td><td><b>$2</b></td></tr>')}</table>
      <div class="concl"><b>Conclusión técnica:</b> ${esc(d.conclusion || (d.estado === 'pendiente' ? 'Alerta pendiente de validación.' : 'Sin conclusión registrada.'))}</div>
      <div class="pie">Fuente de alertas: GeoBosques (MINAM). Imágenes: Sentinel-2 L2A (Copernicus). Generado el ${new Date().toLocaleString('es-PE')} · GFP Subnacional.</div>
      <script>Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))).then(() => setTimeout(() => print(), 300));<\/script>
      </body></html>`);
    w.document.close();
  };

  /* ====================================================== MODO CLASIFICAR */
  function cambiarModo(modo) {
    st.modo = modo;
    document.querySelectorAll('.rail-btn[data-modo]').forEach((b) => b.classList.toggle('activo', b.dataset.modo === modo));
    $('modo-consulta').hidden = modo !== 'consulta';
    $('modo-clasificar').hidden = modo !== 'clasificar';
    $('cab-sub').textContent = modo === 'consulta' ? 'Áreas de Conservación Regional · Consulta pública' : 'Bandeja de clasificación · Especialistas regionales';
    if (modo === 'clasificar') iniciarClasificacion();
    else if (st.geo) dibujarAlertas(st.geo.features);
  }
  document.querySelectorAll('.rail-btn[data-modo]').forEach((b) => (b.onclick = () => cambiarModo(b.dataset.modo)));

  async function iniciarClasificacion() {
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
      $('cl-acr').innerHTML = conPend.map(([t]) => `<option value="${t.codigo}">${esc(t.nombre)} (${esc(t.regionNombre)})</option>`).join('');
      const inicial = conPend.find(([t]) => t.region === 'cusco') || conPend[0];
      $('cl-acr').value = inicial[0].codigo;
      $('cl-acr').onchange = () => { llenarMesesCl(); cargarCola(); };
      $('cl-mes').onchange = cargarCola;
      llenarMesesCl();
    }
    await cargarCola();
  }

  function llenarMesesCl() {
    const per = st.cl.periodos.get($('cl-acr').value) || [];
    $('cl-mes').innerHTML = per.map((p) => `<option value="${p.anio}-${p.mes}">${MESES[p.mes - 1]} ${p.anio} (${p.alertas})</option>`).join('');
  }

  async function cargarCola() {
    const acr = $('cl-acr').value;
    const [anio, mes] = ($('cl-mes').value || '-').split('-');
    if (!acr || !anio) return;
    const geo = await api(`/alertas?acr=${acr}&ambito=ambos&anio=${anio}&mes=${mes}`);
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
  }

  async function abrirClasificacion(codigo) {
    st.cl.idx = st.cl.cola.findIndex((p) => p.codigo === codigo);
    const p = st.cl.cola[st.cl.idx];
    if (!p) return;
    const previa = st.cl.hechas[codigo];
    Object.assign(st.cl, { resultado: previa?.resultado || null, causa: previa?.causa || null, conf: previa?.conf || 1, bosque: previa?.bosque || 1 });
    $('cl-conclusion').value = previa?.conclusion || '';
    $('cl-codigo').textContent = p.codigo;
    $('cl-sub').textContent = `${ha(p.superficie_ha)} · detectada el ${fecha(p.fecha_imagen)} · ${p.ambito === 'ZI' ? 'Zona de Influencia' : 'ACR'}`;
    $('cl-cola').hidden = true; $('cl-cola-cab').hidden = true; $('cl-form').hidden = false;
    $('cl-comparador').innerHTML = '<div class="sin-imagen"><i class="fas fa-spinner fa-spin"></i>Cargando imágenes…</div>';
    resaltar(codigo);
    pintarForm();
    comparador($('cl-comparador'), await api(`/alertas/${codigo}/evidencia`));
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
    st.cl.hechas[p.codigo] = { resultado: st.cl.resultado, causa: st.cl.causa, conf: st.cl.conf, bosque: st.cl.bosque, conclusion: $('cl-conclusion').value };
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

  (async function iniciar() {
    sincronizacion();
    try {
      st.territorios = await api('/territorios');
      renderRegiones();
    } catch (e) {
      $('regiones').innerHTML = '<p class="vacio-mini">No se pudo conectar con el servicio ATD.</p>';
    }
  })();
})();
