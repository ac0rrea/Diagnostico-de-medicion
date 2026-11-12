import http from 'node:http';
import https from 'node:https';
import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 768 * 1024;
const patterns = [
  ['GA4', /(?:googletagmanager\.com\/gtag\/js|google-analytics\.com\/g\/collect|\bG-[A-Z0-9]{5,}\b)/i, /\bG-[A-Z0-9]{5,}\b/gi],
  ['GTM', /(?:googletagmanager\.com\/(?:gtm\.js|ns\.html)|\bGTM-[A-Z0-9]{4,}\b)/i, /\bGTM-[A-Z0-9]{4,}\b/gi],
  ['Clarity', /(?:clarity\.ms\/(?:tag|collect)|clarity\s*\(\s*['"]consentv2)/i, /clarity\.ms\/tag\/([a-z0-9]+)/gi],
  ['Meta Pixel', /(?:connect\.facebook\.net\/[^"'\s]*fbevents\.js|facebook\.com\/tr[/?]|\bfbq\s*\()/i,
    /(?:fbq\s*\(\s*['"]init['"]\s*,\s*['"]|facebook\.com\/tr\?id=)(\d{5,})/gi]
];
const excluded = /(?:^|\/)(?:checkout|checkouts|carrito|cart|basket|carrinho|account|accounts|my-account|mi-cuenta|login|logout|admin|payment|payments|pago|pagos|order|orders|pedido|pedidos|add-to-cart|delete|remove|action)(?:\/|$)/i;
const redirectCodes = new Set([301,302,303,307,308]);

export function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a,b,c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && [0,2].includes(c)) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}
function validUrl(raw,base) {
  const url = new URL(raw,base);
  if (!['https:','http:'].includes(url.protocol) || url.port || url.username || url.password) throw Error('URL pública HTTP o HTTPS requerida.');
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { throw Error('La ruta contiene caracteres inválidos.'); }
  if (excluded.test(path) || /[\\%]/.test(path)) throw Error('La ruta se debe verificar manualmente.');
  url.search = '';
  url.hash = '';
  return url;
}
function siteHost(url) { return url.hostname.replace(/^www\./i,''); }
async function resolvePublic(url) {
  const host = url.hostname;
  if (isIP(host)) {
    if (publicIPv4(host)) return host;
    throw Error('El destino debe usar una dirección pública.');
  }
  if (!host.includes('.') || /\.(?:local|internal|localhost|lan|home|test|example|invalid)$/i.test(host.replace(/\.$/,''))) {
    throw Error('El dominio debe ser público.');
  }
  const addresses = await new Resolver({timeout:650,tries:1}).resolve4(host).catch(() => []);
  if (!addresses.length || !addresses.every(publicIPv4)) throw Error('No se pudo resolver una dirección pública IPv4.');
  return addresses[0];
}
function requestHtml(url,address,signal, script = false) {
  return new Promise((resolve,reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.get(url,{
      signal, agent:false, family:4,
      lookup:(_host, options, done) => options.all ? done(null,[{address,family:4}]) : done(null,address,4),
      headers:{'User-Agent':'WEARE-Medicion/1.0','Accept':script ? 'application/javascript,text/javascript' : 'text/html,application/xhtml+xml','Accept-Encoding':'identity'}
    },response => {
      const code = response.statusCode;
      if (redirectCodes.has(code) && response.headers.location) {
        resolve({redirect:response.headers.location});
        response.destroy();
        return;
      }
      const contentType = script ? /^(?:application|text)\/(?:x-)?javascript\b/i : /^(?:text\/html|application\/xhtml\+xml)\b/i;
      if (code < 200 || code >= 300 || !contentType.test(response.headers['content-type'] ?? '')) {
        resolve({result:(script ? 'Contenedor' : 'HTML')+' no disponible (HTTP '+code+')'});
        response.destroy();
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('error',reject);
      response.on('data',chunk => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          chunks.push(chunk.subarray(0, MAX_BYTES - size + chunk.length));
          resolve({html:Buffer.concat(chunks).toString('utf8'),result:'HTML revisado parcialmente (límite de tamaño)'});
          response.destroy();
        } else chunks.push(chunk);
      });
      response.on('end',() => resolve({html:Buffer.concat(chunks).toString('utf8'),result:'HTML revisado'}));
    });
    request.on('error',reject);
  });
}
async function fetchPage(start, initialHost, globalSignal) {
  let url = start;
  const signal = AbortSignal.any([globalSignal, AbortSignal.timeout(3300)]);
  try {
    for (let hop=0; hop<4; hop++) {
      if (signal.aborted) break;
      if (siteHost(url) !== initialHost) throw Error('Redirección hacia otro dominio. Verificar manualmente.');
      const response = await requestHtml(url,await resolvePublic(url),signal);
      if (!response.redirect) return {url:url.href,...response};
      url = validUrl(response.redirect,url);
    }
  } catch (error) {
    return {url:url.href,result:signal.aborted ? 'Se agotó el tiempo de consulta' : (error.code ? 'El servidor no respondió o rechazó la consulta' : error.message)};
  }
  return {url:url.href,result:'Se agotó el tiempo o el límite de redirecciones'};
}
function priority(url) {
  const p = url.pathname;
  if (/\/(?:products?|productos?|produtos?)\/[^/]+|\/[^/]+\/p\/?$/i.test(p)) return 0;
  if (/\/(?:collections?|categorias?|categories|category|loja|tienda|shop)(?:\/|$)/i.test(p)) return 1;
  return 2;
}
export function selectRoutes(html,base) {
  const found = new Map();
  for (const match of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    try {
      const raw = (match[1] ?? match[2] ?? match[3]).replace(/&amp;/gi,'&');
      if (!raw || raw.startsWith('#') || raw.includes('?')) continue;
      const url = validUrl(raw,base);
      if (url.origin !== base.origin || url.pathname === base.pathname || /\.(?:pdf|xml|json|png|jpe?g|gif|svg|zip|css|js|webp)$/i.test(url.pathname)) continue;
      found.set(url.href,url);
    } catch { /* A link can point outside the supported scan scope. */ }
  }
  const ranked = [...found.values()].sort((a,b) => priority(a)-priority(b));
  const product = ranked.find(url => priority(url) === 0);
  const category = ranked.find(url => priority(url) === 1);
  return [...new Set([category,product,...ranked].filter(Boolean))].slice(0,2);
}
export function summarize(pages) {
  return patterns.map(([name,signal,identifier]) => {
    const detected = pages.filter(p => p.html && signal.test(p.html));
    return {name, pages:detected.map(p => p.url), ids:[...new Set(detected.flatMap(p =>
      Array.from(p.html.matchAll(identifier),m => m[1] ?? m[0])))].slice(0,12)};
  });
}
export function clarityFromContainer(source) {
  const script = source.replace(/\\(?:u00([0-9a-f]{2})|x([0-9a-f]{2}))/gi,
    (match,a,b) => {
      const char = String.fromCharCode(parseInt(a ?? b,16));
      return /[a-z0-9./:_ -]/i.test(char) ? char : match;
    }).replace(/\\\//g,'/');
  const marker = /(?:^|[^a-z0-9.-])(?:[\w-]+\.)*clarity\.ms\/(?:tag\/|collect\b)|Microsoft Clarity\s*-\s*Official/i;
  const ids = [...new Set(Array.from(script.matchAll(/(?:^|[^a-z0-9.-])(?:[\w-]+\.)*clarity\.ms\/tag\/([a-z0-9]+)(?=[?"'\\\s<]|$)/gi),m=>m[1]))].slice(0,12);
  return {hint:marker.test(script),ids};
}
async function inspectClarityGtm(ids,globalSignal) {
  return Promise.all(ids.filter(id => /^GTM-[A-Z0-9]{4,16}$/i.test(id)).slice(0,2).map(async id => {
    const url = new URL('https://www.googletagmanager.com/gtm.js');
    url.searchParams.set('id',id.toUpperCase());
    const signal = AbortSignal.any([globalSignal,AbortSignal.timeout(2200)]);
    try {
      const response = await requestHtml(url,await resolvePublic(url),signal,true);
      if (response.html !== undefined) {
        const details = clarityFromContainer(response.html);
        return {id,checked:true,partial:response.result.includes('parcialmente'),...details};
      }
    } catch { /* An unavailable public container does not invalidate the site scan. */ }
    return {id,checked:false,hint:false,ids:[]};
  }));
}
export default async function scan(request) {
  const respond = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
  if (request.method !== 'POST') return respond({error:'Método no admitido.'},405);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return respond({error:'Enviar una URL en JSON.'},415);
  try {
    const body = await request.text();
    if (body.length > 1000) return respond({error:'La solicitud supera el tamaño permitido.'},413);
    const {url:raw} = JSON.parse(body);
    if (typeof raw !== 'string' || raw.length > 350) return respond({error:'Ingresar una URL válida.'},400);
    const url = validUrl(raw);
    const host = siteHost(url);
    const signal = AbortSignal.timeout(9000);
    const first = await fetchPage(url,host,signal);
    if (first.html === undefined) return respond({error:first.result},422);
    const routes = selectRoutes(first.html,new URL(first.url));
    const pages = [first,...await Promise.all(routes.map(route => fetchPage(route,host,signal)))];
    const signals = summarize(pages);
    const gtm = signals.find(entry => entry.name === 'GTM');
    const clarity = signals.find(entry => entry.name === 'Clarity');
    const clarityGtm = await inspectClarityGtm(gtm.ids,signal);
    const matches = clarityGtm.filter(container => container.hint);
    clarity.containers = matches.map(container => container.id);
    clarity.ids = [...new Set([...clarity.ids,...matches.flatMap(container => container.ids)])].slice(0,12);
    return respond({
      finalUrl:first.url,
      pages:pages.map(({url,result,html}) => ({url,result,ok:html !== undefined})),
      signals,
      clarityGtm
    });
  } catch {
    return respond({error:'Ingresar una URL pública válida para el escaneo.'},400);
  }
}

