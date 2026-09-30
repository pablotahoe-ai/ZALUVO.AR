'use strict';
/*
 * ZALUVO — utilidades del servidor (solo corren en Netlify Functions, nunca en el navegador).
 * Variables de entorno (Netlify → Site settings → Environment variables):
 *   SITE_URL              https://tu-dominio (sin barra final)
 *   MP_ACCESS_TOKEN       Access Token de producción de Mercado Pago (APP_USR-...)
 *   MP_WEBHOOK_SECRET     "Clave secreta" de Webhooks en el panel de MP (valida la firma x-signature)
 *   SHEETS_WEBHOOK_URL    URL del Web App de Google Apps Script (termina en /exec)
 *   SHEETS_SECRET         Clave compartida con el Apps Script (larga y aleatoria)
 */
const crypto = require('crypto');

const MAX_BODY = 16 * 1024;

const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function json(status, data) {
  return { statusCode: status, headers: SECURITY_HEADERS, body: JSON.stringify(data) };
}

function env(name, required) {
  const v = process.env[name];
  if (required && !v) throw Object.assign(new Error('Falta configurar ' + name), { code: 'CONFIG' });
  return v || '';
}

function siteUrl() {
  return env('SITE_URL', true).replace(/\/+$/, '');
}

// Solo aceptamos pedidos desde nuestro propio dominio.
function sameOrigin(event) {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  if (!origin) return true; // algunos navegadores no lo mandan en same-origin; CSP + SameSite cubren el resto
  try { return new URL(origin).origin === new URL(siteUrl()).origin; } catch (e) { return false; }
}

function parseBody(event) {
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  if (raw.length > MAX_BODY) throw Object.assign(new Error('Pedido demasiado grande'), { code: 'INPUT' });
  try { return JSON.parse(raw || '{}'); } catch (e) { throw Object.assign(new Error('JSON inválido'), { code: 'INPUT' }); }
}

// Limpia texto: sin caracteres de control, recorta, largo máximo.
function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function bad(msg) { return Object.assign(new Error(msg), { code: 'INPUT' }); }

function validateCustomer(c, method) {
  c = c || {};
  const out = {
    name: clean(c.name, 80),
    email: clean(c.email, 120).toLowerCase(),
    phone: clean(c.phone, 30).replace(/[^\d+]/g, ''),
    dni: clean(c.dni, 12).replace(/\D/g, ''),
    province: clean(c.province, 40),
    city: clean(c.city, 60),
    cp: clean(c.cp, 10).toUpperCase().replace(/\s/g, ''),
    address: clean(c.address, 120),
    notes: clean(c.notes, 300)
  };
  if (out.name.length < 3) throw bad('Nombre inválido');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out.email)) throw bad('Email inválido');
  const digits = out.phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) throw bad('Teléfono inválido');
  if (out.dni && (out.dni.length < 7 || out.dni.length > 9)) throw bad('DNI inválido');
  if (method === 'ship') {
    if (out.city.length < 2) throw bad('Ciudad inválida');
    if (out.address.length < 4) throw bad('Dirección inválida');
    if (!out.province) throw bad('Provincia inválida');
  }
  return out;
}

function newOrderId() {
  const d = new Date(Date.now() - 3 * 3600 * 1000); // hora Argentina
  const ymd = d.toISOString().slice(2, 10).replace(/-/g, '');
  return 'ZLV-' + ymd + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 9000);
  try { return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal })); }
  finally { clearTimeout(t); }
}

// Envía una acción al Apps Script de la planilla. Devuelve el JSON de respuesta.
async function sheets(action, payload) {
  const url = env('SHEETS_WEBHOOK_URL', true);
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script acepta mejor text/plain
    body: JSON.stringify({ secret: env('SHEETS_SECRET', true), action: action, data: payload }),
    redirect: 'follow'
  }, 12000);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('Respuesta inválida de la planilla'); }
  if (!data.ok) throw new Error('Planilla: ' + (data.error || 'error'));
  return data;
}

function safeEqual(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

module.exports = { json, env, siteUrl, sameOrigin, parseBody, clean, validateCustomer, newOrderId, fetchWithTimeout, sheets, safeEqual, bad };
