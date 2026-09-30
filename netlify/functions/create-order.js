'use strict';
/*
 * POST /api/create-order
 * Crea el pedido: valida TODO, recalcula precios con catalog.js (el navegador no decide el precio),
 * lo registra en la Google Sheet y devuelve:
 *   - Mercado Pago → { orderId, total, redirect: init_point }
 *   - Transferencia → { orderId, total, transfer: {alias, cbu, holder, bank} }
 */
const Z = require('../../catalog.js');
const L = require('../../server/lib.js');

const PAY_METHODS = ['mp', 'transfer'];
const DELIVERY = ['ship', 'pickup'];

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return L.json(405, { ok: false, error: 'Método no permitido' });

  try {
    if (!L.sameOrigin(event)) return L.json(403, { ok: false, error: 'Origen no permitido' });
    const ct = String((event.headers && (event.headers['content-type'] || event.headers['Content-Type'])) || '');
    if (ct.indexOf('application/json') !== 0) return L.json(415, { ok: false, error: 'Formato no soportado' });

    const body = L.parseBody(event);

    // Anti-bots: campo trampa invisible. Si viene lleno, respondemos "ok" falso sin hacer nada.
    if (body.company) return L.json(200, { ok: true, orderId: 'ZLV-000000-000000', total: 0 });

    const method = String(body.delivery && body.delivery.method);
    const pay = String(body.payment);
    if (DELIVERY.indexOf(method) < 0) throw L.bad('Método de entrega inválido');
    if (PAY_METHODS.indexOf(pay) < 0) throw L.bad('Medio de pago inválido');

    const customer = L.validateCustomer(body.customer, method);
    const items = (Array.isArray(body.items) ? body.items : []).map(function (i) {
      return { id: L.clean(i && i.id, 20), color: L.clean(i && i.color, 20), qty: Number(i && i.qty) };
    });

    let calc;
    try { calc = Z.computeOrder(items, { method: method, cp: customer.cp }); }
    catch (e) { throw L.bad(e.message); }

    // Si el navegador mostró otro total (precios viejos en caché), avisamos en vez de cobrar distinto.
    if (body.expectedTotal != null && Number(body.expectedTotal) !== calc.total) {
      return L.json(409, { ok: false, error: 'Los precios se actualizaron. Revisá el total.', total: calc.total, calc: calc });
    }

    const clientRequestId = L.clean(body.clientRequestId, 64).replace(/[^\w-]/g, '');
    const order = {
      orderId: L.newOrderId(),
      clientRequestId: clientRequestId,
      createdAt: new Date().toISOString(),
      payment: pay,
      delivery: method,
      zone: calc.zone ? calc.zone.label : '',
      customer: customer,
      lines: calc.lines,
      units: calc.units,
      subtotal: calc.subtotal,
      discountPct: calc.discountPct,
      discount: calc.discount,
      shipping: calc.shipping,
      total: calc.total
    };

    // 1) Registrar en la planilla (si ya existía por doble clic, devuelve el mismo pedido).
    const saved = await L.sheets('create', order);
    order.orderId = saved.orderId || order.orderId;

    // 2) Medio de pago
    if (pay === 'transfer') {
      return L.json(200, { ok: true, orderId: order.orderId, total: order.total, transfer: Z.CATALOG.store.transfer });
    }

    const site = L.siteUrl();
    const pref = {
      items: [{
        id: order.orderId,
        title: 'ZALUVO · Pedido ' + order.orderId + ' (' + order.units + (order.units === 1 ? ' producto)' : ' productos)'),
        quantity: 1,
        currency_id: 'ARS',
        unit_price: order.total
      }],
      payer: { name: customer.name, email: customer.email },
      external_reference: order.orderId,
      notification_url: site + '/.netlify/functions/mp-webhook',
      back_urls: {
        success: site + '/?pedido=' + order.orderId + '&estado=aprobado',
        pending: site + '/?pedido=' + order.orderId + '&estado=pendiente',
        failure: site + '/?pedido=' + order.orderId + '&estado=rechazado'
      },
      auto_return: 'approved',
      statement_descriptor: 'ZALUVO',
      binary_mode: false,
      expires: true,
      expiration_date_to: new Date(Date.now() + 48 * 3600 * 1000).toISOString()
    };

    const res = await L.fetchWithTimeout('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + L.env('MP_ACCESS_TOKEN', true),
        'Content-Type': 'application/json',
        'X-Idempotency-Key': order.orderId
      },
      body: JSON.stringify(pref)
    }, 10000);
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.init_point) {
      console.error('MP preference error', res.status, data && data.message);
      return L.json(502, { ok: false, error: 'Mercado Pago no respondió. Probá de nuevo o elegí transferencia.', orderId: order.orderId });
    }
    return L.json(200, { ok: true, orderId: order.orderId, total: order.total, redirect: data.init_point });

  } catch (e) {
    if (e.code === 'INPUT') return L.json(400, { ok: false, error: e.message });
    if (e.code === 'CONFIG') { console.error(e.message); return L.json(503, { ok: false, error: 'La tienda está en configuración. Escribinos por WhatsApp.' }); }
    console.error('create-order', e && e.message);
    return L.json(500, { ok: false, error: 'No pudimos registrar el pedido. Probá de nuevo.' });
  }
};
