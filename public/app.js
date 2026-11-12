const $ = id => document.getElementById(id);
const form = $('audit-form');
const states = {
  'Correcto':'good', 'Parcial':'partial', 'Con errores':'error',
  'No detectado':'absent', 'No verificable':'unknown', 'No aplica':''
};
const controls = [
  ['consent','Banner de cookies y recorrido','Abrir el sitio en una ventana nueva. Si aparece un banner, probar aceptar y rechazar en sesiones separadas. Registrar qué páginas se recorrieron y derivar la validación técnica si hace falta.','Vi el banner y recorrí inicio, producto y carrito. Falta validar qué etiquetas cambian al rechazar.'],
  ['ga4','GA4 · Navegación y eventos','Abrir un producto y agregarlo al carrito. Si se tiene acceso a GA4, buscar esas acciones en Tiempo real o DebugView de la cuenta.','Vi la visita al producto y el agregado al carrito en GA4.'],
  ['purchase','GA4 · Compra de prueba','Confirmar en GA4 una compra de prueba autorizada. Si falta autorización o acceso, marcar No verificable y dejar el motivo.','Falta coordinar el pedido de prueba con Proyectos.'],
  ['gtm','GTM · Contenedor y etiquetas','Revisar el ID que muestra el escaneo o Tag Assistant. Proyectos puede confirmar las etiquetas activadas y la versión publicada.','Aparece el contenedor. Falta confirmar qué etiquetas activa.'],
  ['clarity','Clarity · Carga y grabaciones','Revisar el indicio del escaneo. Si se puede acceder a Clarity, navegar por la tienda y buscar la sesión en Grabaciones del proyecto de la marca.','Aparece en GTM. Falta confirmar una grabación en el proyecto.'],
  ['pixel','Meta Pixel · Eventos del navegador','Abrir un producto y agregarlo al carrito. Revisar si aparecen ViewContent y AddToCart en la extensión de Meta o en Probar eventos.','Vi ViewContent y AddToCart. Falta cotejar el origen de datos.'],
  ['capi','Meta CAPI · Eventos del servidor','Si la cuenta usa CAPI, pedir a Proyectos o Paid que confirme los eventos de servidor y si Meta cuenta una sola vez la misma acción.','Falta acceso al Administrador de eventos para confirmar CAPI.']
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
let savedFields = {};
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
$('follow').innerHTML = fields(follow.map(([n,...rest]) => ['follow-'+n,...rest]));
$('checks').innerHTML = controls.map(([key,title,hint,example]) => '<article class="check" id="control-'+key+'"><div><h3>'+title+'</h3><p>'+hint+'</p></div>'
  +'<select aria-label="Estado de '+title+'" name="state-'+key+'">'+options(Object.keys(states),'Pendiente')+'</select>'
  +'<label class="check-note">Nota o enlace a evidencia (opcional)<textarea maxlength="800" name="note-'+key+'" placeholder="'+escapeHtml('Ej.: '+example)+'"></textarea></label>'
  +(key === 'clarity' ? '<details id="clarity-guide" class="clarity-guide"><summary>Cómo comprobar Clarity si el escaneo no lo encuentra</summary>'
    +'<ol class="list"><li><strong>Si se tiene acceso al proyecto:</strong> abrir la tienda, interactuar con una página y buscar esa sesión en Grabaciones de Clarity.</li>'
    +'<li><strong>Para Proyectos, desde el navegador:</strong> abrir F12 → Red, filtrar por <code>clarity.ms</code>, recargar y navegar con el consentimiento que corresponda. Una solicitud <code>POST …/collect</code> indica envío desde el navegador. La grabación en el proyecto confirma recepción.</li>'
    +'<li><strong>Para Proyectos, desde GTM:</strong> usar Vista previa o Tag Assistant, buscar la etiqueta de Clarity entre las activadas y revisar el ID del proyecto. Confirmar también en el sitio publicado, ya que la vista previa puede usar un borrador.</li></ol>'
    +'<p>Si solo hay un indicio del escaneo, marcar Parcial y registrar qué falta. Si no se pudo hacer ninguna comprobación, marcar No verificable.</p>'
    +'<p><a href="https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup" target="_blank" rel="noopener">Guía de Microsoft</a> · <a href="https://support.google.com/tagmanager/answer/6107056" target="_blank" rel="noopener">Guía de Google Tag Manager</a></p></details>' : '')
  +'</article>').join('');
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
    +escapeHtml(signalSummary(signal,scanData))+'</p>'
    +(signal.ids.length ? '<p>'+signal.ids.map(escapeHtml).join(' · ')+'</p>' : '')
    +(signal.name === 'Clarity' ? '<p><a href="#clarity-guide" data-clarity-help>Cómo verificarlo</a></p>' : '')+'</div>').join('')+'</div>'
    +'<details><summary>Páginas y señales del escaneo</summary><ul class="list">'
    +scanData.pages.map(page => '<li>'+escapeHtml(page.url)+' · '+escapeHtml(page.result)+'</li>').join('')
    +scanData.signals.filter(s => s.pages.length).map(s => '<li>'+escapeHtml(s.name)+' · '+s.pages.map(escapeHtml).join(', ')+'</li>').join('')
    +'</ul><p class="hint">El escaneo no confirma ejecución, consentimiento, recepción ni eventos del servidor.</p></details>';
  node.querySelector('[data-clarity-help]')?.addEventListener('click',() => { $('clarity-guide').open = true; });
}
function signalSummary(signal,data) {
  if (signal.name !== 'Clarity') return signal.pages.length ? 'Indicio en '+signal.pages.length+' página(s)' : 'Sin indicios en el HTML';
  const sources = [];
  if (signal.pages.length) sources.push('HTML de '+signal.pages.length+' página(s)');
  if (signal.containers?.length) sources.push('GTM publicado ('+signal.containers.join(', ')+')');
  if (sources.length) return 'Indicio en '+sources.join(' y ')+' · falta confirmar actividad';
  const inspected = data.clarityGtm?.filter(c => c.checked).length ?? 0;
  return (inspected ? 'Sin indicios en HTML ni en los contenedores consultados' : 'Sin indicios en el HTML')+' · verificar al navegar';
}
function reset(record = null) {
  scanRequest?.abort();
  scanRequest = null;
  $('scan').disabled = false;
  form.reset();
  for (const box of form.querySelectorAll('details')) box.open = false;
  $('save-status').textContent = 'Historial guardado en este navegador.';
  currentId = record?.id ?? null;
  savedFields = record?.fields ?? {};
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
    'state-consent':'Correcto','note-consent':'Se probó aceptación y rechazo.',
    'state-ga4':'Correcto','note-ga4':'Se vieron view_item y add_to_cart en DebugView. Captura DEMO-01.',
    'state-purchase':'No verificable','note-purchase':'Falta coordinar un pedido de prueba.',
    'state-gtm':'Correcto','note-gtm':'GTM-DEMO01. Se revisaron las etiquetas de la versión publicada.',
    'state-clarity':'Parcial','note-clarity':'Hay indicios en GTM. Falta confirmar una grabación de prueba.',
    'state-pixel':'Correcto','note-pixel':'PageView y AddToCart recibidos.',
    'state-capi':'No verificable','note-capi':'Falta acceso al origen de datos.',
    'follow-priority':'Alta','follow-assignee':'Proyectos','follow-next':'Coordinar compra de prueba y acceso a Meta para comprobar CAPI.'
  },
  scan:{
    finalUrl:'https://tienda.example/',
    pages:['/','/categorias/calzado','/productos/zapatilla'].map(p => ({url:'https://tienda.example'+p,result:'HTML revisado (ejemplo)'})),
    signals:[...([['GA4','G-DEMO123'],['GTM','GTM-DEMO01'],['Meta Pixel','123456789000000']]
      .map(([name,id]) => ({name,ids:[id],pages:['https://tienda.example/']}))),
      {name:'Clarity',ids:['demo123'],pages:[],containers:['GTM-DEMO01']}]
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
  return {id:currentId, example:isExample, updatedAt:new Date().toISOString(),
    fields:{...savedFields,...Object.fromEntries(new FormData(form))}, scan:scanData};
}
function validateBasics() {
  for (const name of ['url','brand','meta-owner']) {
    const input = form.elements.namedItem(name);
    input.value = input.value.trim();
  }
  if (!form.reportValidity()) return false;
  try {
    cleanUrl($('url').value);
    return true;
  } catch {
    $('url').setCustomValidity('Ingresar una URL de sitio válida.');
    $('url').reportValidity();
    $('url').setCustomValidity('');
    return false;
  }
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
    return '<li><strong>'+title+'</strong> · <span class="'+(states[state] || '')+'">'+escapeHtml(state || 'Pendiente')+'</span>'
      +(f['note-'+id] ? '<div>'+escapeHtml(f['note-'+id])+'</div>' : '')+detail+'</li>';
  }).join('');
  const scan = record.scan ? '<h3>Escaneo preliminar</h3><p>URL final · '+escapeHtml(record.scan.finalUrl)+'</p><ul>'
    +record.scan.pages.map(p => '<li>'+escapeHtml(p.url)+' · '+escapeHtml(p.result)+'</li>').join('')
    +record.scan.signals.map(s => '<li>'+escapeHtml(s.name)+' · '+escapeHtml(signalSummary(s,record.scan))+
      (s.ids.length ? ' · '+s.ids.map(escapeHtml).join(', ') : '')+'</li>').join('')+'</ul><p>Revisión del HTML público. La ejecución y recepción se validan por separado.</p>' : '';
  return '<p><strong>'+escapeHtml(f.brand || 'Cuenta sin nombre')+'</strong> · '+escapeHtml(f.platform || 'Plataforma por confirmar')+'</p>'
    +'<p>'+escapeHtml(f.url || 'URL pendiente')+(record.example ? ' · Ejemplo ficticio' : '')+'</p>'
    +'<p>Registro · '+escapeHtml(new Date(record.updatedAt).toLocaleString('es-AR'))+'</p>'
    +'<ul>'+rows(metadata,'meta-')+'</ul>'+scan+'<h3>Resultados por control</h3><ul>'+lines+'</ul>'
    +'<h3>Derivación y seguimiento</h3><ul>'+(rows(follow,'follow-') || '<li>Pendiente de registrar</li>')+'</ul>';
}
$('report').onclick = () => {
  if (!validateBasics()) return;
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
  if (!validateBasics()) return;
  const record = snapshot();
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

