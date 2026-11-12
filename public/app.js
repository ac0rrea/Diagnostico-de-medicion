const $ = id => document.getElementById(id);
const form = $('audit-form');
const states = {
  'Correcto':'good', 'Parcial':'partial', 'Con errores':'error',
  'No detectado':'absent', 'No verificable':'unknown', 'No aplica':''
};
const controls = [
  ['consent','Consentimiento y cobertura','Probar los estados del banner y registrar las rutas recorridas.'],
  ['ga4','GA4 · Eventos y recepción','Comparar el ID y los eventos observados con Tiempo real o DebugView.'],
  ['purchase','GA4 · Compra de prueba','Cotejar transaction_id, valor, moneda y artículos con un pedido autorizado.'],
  ['gtm','GTM · Contenedor y etiquetas','Verificar ID, activación, destino y versión publicada.'],
  ['clarity','Clarity · Señal y sesión','Cotejar proyecto, señal de red y grabación de la sesión de prueba.'],
  ['pixel','Meta Pixel · Eventos y recepción','Revisar ID, eventos y parámetros en navegador y en el Administrador de eventos.'],
  ['capi','Meta CAPI · Recepción y deduplicación','Verificar el canal servidor y event_id compartido cuando corresponda.']
];
const metadata = [
  ['owner','Responsable y área'],['date','Fecha y hora','datetime-local'],['zone','Zona horaria'],
  ['environment','Entorno'],['device','Navegador y dispositivo'],['region','Región'],
  ['consent','Consentimiento y categorías'],['routes','Rutas y dominios de checkout'],['access','Accesos disponibles'],
  ['scope','Alcance y conversiones'],['order','Pedido de prueba anonimizado'],['evidence','Carpeta de evidencias']
];
const follow = [
  ['priority','Prioridad',['Crítica','Alta','Media']],['assignee','Responsable del seguimiento'],['due','Próxima revisión','date'],
  ['ticket','Enlace o ID de Monday'],['next','Hallazgo, impacto y próximo paso','textarea'],['retest','Nueva prueba y resultado','textarea']
];
const key = 'weare-diagnostico-historial-v1';
let currentId = null;
let scanData = null;
let isExample = false;
let scanRequest = null;
let currentReport = null;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options = (values, placeholder) => '<option value="">'+placeholder+'</option>'+values.map(v => '<option>'+escapeHtml(v)+'</option>').join('');
function fields(items) {
  return items.map(([name,label,type]) => {
    const node = Array.isArray(type) ? '<select name="'+name+'">'+options(type,'Seleccionar')+'</select>'
      : type === 'textarea' ? '<textarea maxlength="1200" name="'+name+'"></textarea>'
      : '<input maxlength="300" name="'+name+'" type="'+(type || 'text')+'">';
    return '<label>'+label+node+'</label>';
  }).join('');
}
$('extra').innerHTML = fields(metadata.map(([n,...rest]) => ['meta-'+n,...rest]));
$('follow').innerHTML = fields(follow.map(([n,...rest]) => ['follow-'+n,...rest]));
$('checks').innerHTML = controls.map(([key,title,hint]) => '<article class="check"><div><h3>'+title+'</h3><p>'+hint+'</p></div>'
  +'<select aria-label="Estado de '+title+'" name="state-'+key+'">'+options(Object.keys(states),'Pendiente')+'</select>'
  +'<details><summary>Detalles y evidencia</summary><div class="fields extra">'
  +fields([['route-'+key,'Ruta, acción y condición'],['expected-'+key,'Evento o ID esperado'],['observed-'+key,'Observado / motivo pendiente'],
    ['proof-'+key,'Evidencia, hora o enlace'],['action-'+key,'Próximo paso / responsable']])
  +'</div></details></article>').join('');
function setField(name,value) {
  const field = form.elements.namedItem(name);
  if (field) field.value = value ?? '';
}
function progress() {
  const count = controls.filter(([key]) => form.elements.namedItem('state-'+key).value).length;
  $('progress').textContent = count+' / '+controls.length+' registrados';
  for (const [key] of controls) {
    const node = form.elements.namedItem('state-'+key);
    node.className = states[node.value] || '';
  }
}
function cleanUrl(raw) {
  const value = raw.trim();
  if (!value) throw Error('Ingresar la URL pública del sitio.');
  const url = new URL(/^[a-z]+:\/\//i.test(value) ? value : 'https://'+value);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.port) throw Error('Usar una URL pública HTTP o HTTPS sin credenciales ni puerto especial.');
  url.hash = '';
  url.search = '';
  return url.href;
}
function renderScan() {
  const node = $('scan-result');
  node.hidden = !scanData;
  if (!scanData) { node.replaceChildren(); return; }
  node.innerHTML = '<div class="scan-grid">'+scanData.signals.map(signal => '<div class="signal"><h3>'+escapeHtml(signal.name)+'</h3><p>'
    +(signal.pages.length ? 'Indicio en '+signal.pages.length+' página(s)' : 'Sin indicios en el HTML')+'</p>'
    +(signal.ids.length ? '<p>'+signal.ids.map(escapeHtml).join(' · ')+'</p>' : '')+'</div>').join('')+'</div>'
    +'<details><summary>Páginas y señales del escaneo</summary><ul class="list">'
    +scanData.pages.map(page => '<li>'+escapeHtml(page.url)+' · '+escapeHtml(page.result)+'</li>').join('')
    +scanData.signals.filter(s => s.pages.length).map(s => '<li>'+escapeHtml(s.name)+' · '+s.pages.map(escapeHtml).join(', ')+'</li>').join('')
    +'</ul><p class="hint">El escaneo no confirma ejecución, consentimiento, recepción ni eventos del servidor.</p></details>';
}
function reset(record = null) {
  scanRequest?.abort();
  scanRequest = null;
  $('scan').disabled = false;
  form.reset();
  for (const box of form.querySelectorAll('details')) box.open = false;
  $('save-status').textContent = 'Historial guardado en este navegador.';
  currentId = record?.id ?? null;
  scanData = record?.scan ?? null;
  isExample = !!record?.example;
  for (const [name,value] of Object.entries(record?.fields ?? {})) setField(name,value);
  renderScan();
  progress();
  $('scan-status').textContent = isExample ? 'Ejemplo ficticio. Las señales y evidencias son ilustrativas.'
    : scanData ? 'Escaneo guardado para esta URL.' : 'Busca indicios en el HTML público de hasta 3 páginas.';
}
$('demo').onclick = () => reset({
  example:true,
  fields:{
    url:'https://tienda.example',brand:'Tienda Demo',platform:'Tiendanube',
    'meta-owner':'Referente de Paid Media','meta-environment':'Producción (simulada)','meta-device':'Chrome · escritorio',
    'meta-consent':'Aceptación de analítica y marketing','meta-scope':'Inicio, categoría, producto y carrito',
    'state-consent':'Correcto','observed-consent':'Se probó aceptación y rechazo.',
    'state-ga4':'Correcto','expected-ga4':'G-DEMO123 · view_item y add_to_cart','observed-ga4':'Recepción de ambos eventos en DebugView.','proof-ga4':'DEMO-01 · captura de DebugView',
    'state-purchase':'No verificable','observed-purchase':'Falta coordinar un pedido de prueba.',
    'state-gtm':'Correcto','expected-gtm':'GTM-DEMO01','proof-gtm':'DEMO-02 · versión publicada',
    'state-clarity':'Parcial','observed-clarity':'Sesión visible. Falta comprobar cobertura en producto.',
    'state-pixel':'Correcto','observed-pixel':'PageView y AddToCart recibidos.',
    'state-capi':'No verificable','observed-capi':'Falta acceso al origen de datos.',
    'follow-priority':'Alta','follow-assignee':'Proyectos','follow-next':'Coordinar compra de prueba y acceso a Meta para comprobar CAPI.'
  },
  scan:{
    finalUrl:'https://tienda.example/',
    pages:['/','/categorias/calzado','/productos/zapatilla'].map(p => ({url:'https://tienda.example'+p,result:'HTML revisado (ejemplo)'})),
    signals:[['GA4','G-DEMO123'],['GTM','GTM-DEMO01'],['Clarity','demo123'],['Meta Pixel','123456789000000']]
      .map(([name,id]) => ({name,ids:[id],pages:['https://tienda.example/']}))
  }
});
$('url').addEventListener('input', () => {
  if (!scanData && !scanRequest) return;
  scanRequest?.abort();
  scanRequest = null;
  $('scan').disabled = false;
  scanData = null;
  renderScan();
  $('scan-status').textContent = 'La URL cambió. Volver a escanear si corresponde.';
});
$('scan').onclick = async () => {
  const status = $('scan-status');
  let url;
  try { url = cleanUrl($('url').value); } catch (error) { status.textContent = error.message === 'Invalid URL' ? 'Ingresar una URL válida.' : error.message; return; }
  if (location.protocol === 'file:') {
    status.textContent = 'El escaneo real se habilita al ejecutar el proyecto con Netlify. La ficha manual y el ejemplo están disponibles.';
    return;
  }
  const request = new AbortController();
  scanRequest = request;
  const timeout = setTimeout(() => request.abort(), 14000);
  $('scan').disabled = true;
  status.textContent = 'Escaneando el HTML público…';
  try {
    const response = await fetch('/.netlify/functions/scan', {
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:request.signal
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw Error('El escaneo requiere que el proyecto se ejecute con Netlify.');
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'No se pudo escanear esta URL.');
    if (scanRequest !== request) return;
    scanData = data;
    renderScan();
    status.textContent = data.pages.filter(p => p.ok).length+' página(s) con HTML revisado. Los resultados del checklist se completan manualmente.';
  } catch (error) {
    if (scanRequest === request) status.textContent = (error.name === 'AbortError' ? 'El escaneo superó el tiempo disponible.' : error.message)+' Se puede continuar con la ficha manual.';
  } finally {
    clearTimeout(timeout);
    if (scanRequest === request) { scanRequest = null; $('scan').disabled = false; }
  }
};
function snapshot() {
  return {id:currentId, example:isExample, updatedAt:new Date().toISOString(), fields:Object.fromEntries(new FormData(form)), scan:scanData};
}
function history() {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function readReport(record) {
  const f = record.fields;
  const rows = (items,prefix) => items.filter(([id]) => f[prefix+id])
    .map(([id,title]) => '<li><strong>'+title+'</strong> · '+escapeHtml(f[prefix+id])+'</li>').join('');
  const lines = controls.map(([id,title]) => {
    const state = f['state-'+id];
    const detail = [['route-','Escenario'],['expected-','Esperado'],['observed-','Observado'],['proof-','Evidencia'],['action-','Próximo paso']]
      .filter(([prefix]) => f[prefix+id]).map(([prefix,label]) => '<div>'+label+' · '+escapeHtml(f[prefix+id])+'</div>').join('');
    return '<li><strong>'+title+'</strong> · <span class="'+(states[state] || '')+'">'+escapeHtml(state || 'Pendiente')+'</span>'+detail+'</li>';
  }).join('');
  const scan = record.scan ? '<h3>Escaneo preliminar</h3><p>URL final · '+escapeHtml(record.scan.finalUrl)+'</p><ul>'
    +record.scan.pages.map(p => '<li>'+escapeHtml(p.url)+' · '+escapeHtml(p.result)+'</li>').join('')
    +record.scan.signals.map(s => '<li>'+escapeHtml(s.name)+' · '+(s.pages.length ? 'Indicio en '+s.pages.length+' página(s)' : 'Sin indicios en el HTML')+
      (s.ids.length ? ' · '+s.ids.map(escapeHtml).join(', ') : '')+'</li>').join('')+'</ul><p>Revisión del HTML público. La ejecución y recepción se validan por separado.</p>' : '';
  return '<p><strong>'+escapeHtml(f.brand || 'Cuenta sin nombre')+'</strong> · '+escapeHtml(f.platform || 'Plataforma por confirmar')+'</p>'
    +'<p>'+escapeHtml(f.url || 'URL pendiente')+(record.example ? ' · Ejemplo ficticio' : '')+'</p>'
    +'<p>Registro · '+escapeHtml(new Date(record.updatedAt).toLocaleString('es-AR'))+'</p>'
    +'<ul>'+rows(metadata,'meta-')+'</ul>'+scan+'<h3>Resultados por control</h3><ul>'+lines+'</ul>'
    +'<h3>Derivación y seguimiento</h3><ul>'+(rows(follow,'follow-') || '<li>Pendiente de registrar</li>')+'</ul>';
}
$('report').onclick = () => {
  currentReport = snapshot();
  $('report-content').innerHTML = readReport(currentReport);
  $('dialog').showModal();
};
$('close').onclick = () => $('dialog').close();
$('download').onclick = () => {
  const html = '<!doctype html><html lang="es"><meta charset="utf-8"><title>WE ARE | Informe</title>'
    +'<style>body{font:16px/1.55 Arial;max-width:850px;margin:2rem auto;padding:0 1rem;color:#172640}h1{border-top:8px solid #e35a33;padding-top:1rem}li{margin-bottom:.55rem;overflow-wrap:anywhere}.good{color:#116441}.partial{color:#8c4904}.error{color:#9b2428}.absent{color:#444d58}.unknown{color:#384e6c}</style>'
    +'<h1>WE ARE | Informe de diagnóstico</h1>'+readReport(currentReport)+'</html>';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([html], {type:'text/html;charset=utf-8'}));
  link.download = 'WE-ARE-informe-de-diagnostico.html';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
$('save').onclick = () => {
  const record = snapshot();
  if (!record.fields.url.trim() && !record.fields.brand.trim()) {
    $('save-status').textContent = 'Completar la marca o la URL para guardar la auditoría.';
    return;
  }
  record.id ??= globalThis.crypto?.randomUUID?.() ?? String(Date.now());
  try {
    localStorage.setItem(key,JSON.stringify([record,...history().filter(x => x.id !== record.id)]));
    currentId = record.id;
    $('save-status').textContent = 'Auditoría guardada en el historial de este navegador.';
  } catch { $('save-status').textContent = 'El navegador no permitió guardar. Se puede descargar el informe.'; }
};
$('new').onclick = () => { reset(); $('sitio').scrollIntoView(); $('url').focus(); };
function show(view) {
  $('audit').hidden = view !== 'audit';
  $('history').hidden = view !== 'history';
  for (const button of document.querySelectorAll('[data-view]')) {
    if (button.dataset.view === view) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  }
  if (view === 'history') {
    const records = history();
    $('history-list').innerHTML = records.length ? records.map((r,i) => '<article class="history-item"><div><h3>'+escapeHtml(r.fields.brand || r.fields.url)
      +'</h3><p>'+escapeHtml(new Date(r.updatedAt).toLocaleString('es-AR'))+(r.example ? ' · Ejemplo ficticio' : '')
      +'</p></div><button type="button" class="secondary" data-record="'+i+'">Abrir</button></article>').join('') : '<p class="hint">Todavía no hay auditorías guardadas.</p>';
    for (const button of $('history-list').querySelectorAll('[data-record]')) button.onclick = () => { reset(records[button.dataset.record]); show('audit'); };
  }
  window.scrollTo(0,0);
}
for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => show(button.dataset.view);
$('back').onclick = () => show('audit');
form.addEventListener('change',progress);
form.addEventListener('submit',event => event.preventDefault());
progress();

