'use strict';
/*
 * Webhook de Mercado Pago → /.netlify/functions/mp-webhook
 * 1) Verifica la firma x-signature con MP_WEBHOOK_SECRET (si no coincide: 401).
 * 2) NO confía en el contenido del aviso: consulta el pago directamente a la API de MP con nuestro token.
 * 3) Actualiza la planilla. El Apps Script además compara el monto pagado con el total del pedido.
 */
const crypto = require('crypto');
const L = require('../../server/lib.js');

function verifySignature(event, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) { console.warn('MP_WEBHOOK_SECRET sin configurar: firma no verificada'); return true; }
  const h = event.headers || {};
  const sig = h['x-signature'] || '';
  const reqId = h['x-request-id'] || '';
  let ts = '', v1 = '';
  sig.split(',').forEach(function (part) {
    const kv = part.split('=');
    const k = (kv[0] || '').trim(), v = (kv[1] || '').trim();
    if (k === 'ts') ts = v;
    if (k === 'v1') v1 = v;
  });
  if (!ts || !v1) return false;
  let manifest = '';
  if (dataId) manifest += 'id:' + String(dataId).toLowerCase() + ';';
  if (reqId) manifest += 'request-id:' + reqId + ';';
  manifest += 'ts:' + ts + ';';
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return L.safeEqual(expected, v1);
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };
  try {
    const q = event.queryStringParameters || {};
    let body = {};
    try { body = L.parseBody(event); } catch (e) { body = {}; }
    const type = q.type || q.topic || body.type || body.topic;
    const dataId = q['data.id'] || q.id || (body.data && body.data.id);

    if (!verifySignature(event, dataId)) return { statusCode: 401, body: '' };
    if (type !== 'payment' || !dataId || !/^\d{1,20}$/.test(String(dataId))) return { statusCode: 200, body: '' };

    const res = await L.fetchWithTimeout('https://api.mercadopago.com/v1/payments/' + dataId, {
      headers: { 'Authorization': 'Bearer ' + L.env('MP_ACCESS_TOKEN', true) }
    }, 9000);
    if (!res.ok) { console.error('MP payment fetch', res.status); return { statusCode: 500, body: '' }; } // MP reintenta
    const p = await res.json();

    await L.sheets('payment', {
      orderId: L.clean(p.external_reference, 40),
      paymentId: String(p.id),
      status: L.clean(p.status, 30),
      statusDetail: L.clean(p.status_detail, 60),
      amount: Number(p.transaction_amount) || 0,
      currency: L.clean(p.currency_id, 5),
      method: L.clean(p.payment_method_id, 30)
    });
    return { statusCode: 200, body: '' };
  } catch (e) {
    console.error('mp-webhook', e && e.message);
    return { statusCode: 500, body: '' }; // 500 → Mercado Pago reintenta más tarde
  }
};
