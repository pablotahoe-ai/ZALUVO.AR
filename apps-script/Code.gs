/**
 * ZALUVO — Registro de pedidos en Google Sheets
 * ---------------------------------------------
 * INSTALACIÓN (una sola vez):
 *  1. Crear una Google Sheet nueva → Extensiones → Apps Script → pegar este archivo.
 *  2. Configuración del proyecto (engranaje) → Propiedades del script → agregar:
 *       SECRET       = la misma clave que SHEETS_SECRET en Netlify (larga y aleatoria)
 *       OWNER_EMAIL  = mail donde querés recibir el aviso de cada pedido
 *  3. Ejecutar la función setup() una vez (acepta los permisos).
 *  4. Implementar → Nueva implementación → Aplicación web
 *       Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario
 *     Copiar la URL (/exec) → en Netlify: SHEETS_WEBHOOK_URL.
 *
 * Seguridad: sin la clave SECRET no se puede escribir nada. Los textos se neutralizan para que
 * nadie pueda inyectar fórmulas (=, +, -, @) en la planilla.
 */

var SHEET = 'Pedidos';
var HEADERS = ['Fecha', 'Pedido', 'Estado', 'Pago', 'Total', 'Subtotal', 'Desc. %', 'Descuento', 'Envío', 'Unidades',
  'Productos', 'Nombre', 'Email', 'Teléfono', 'DNI', 'Entrega', 'Zona', 'Provincia', 'Ciudad', 'CP', 'Dirección',
  'Notas', 'MP Pago ID', 'MP Estado', 'Monto pagado', 'Actualizado', 'ClientReq'];

function col(name) { return HEADERS.indexOf(name) + 1; }

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#0B1B33').setFontColor('#ffffff');
  sh.setFrozenRows(1);
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Evita inyección de fórmulas en la planilla.
function safe(v) {
  var s = String(v == null ? '' : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function doGet() { return out({ ok: false, error: 'Solo POST' }); }

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var req = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || req.secret !== secret) return out({ ok: false, error: 'No autorizado' });

    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET);
    if (!sh) { setup(); sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET); }

    if (req.action === 'create') return out(createOrder(sh, req.data));
    if (req.action === 'payment') return out(updatePayment(sh, req.data));
    return out({ ok: false, error: 'Acción inválida' });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function findRow(sh, colName, value) {
  if (!value) return 0;
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, col(colName), last - 1, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]) === String(value)) return i + 2;
  return 0;
}

function createOrder(sh, o) {
  // Doble clic / reintento: mismo ClientReq → mismo pedido.
  var dup = findRow(sh, 'ClientReq', o.clientRequestId);
  if (dup) return { ok: true, orderId: sh.getRange(dup, col('Pedido')).getValue(), duplicate: true };

  var c = o.customer || {};
  var prods = (o.lines || []).map(function (l) { return l.qty + 'x ' + l.code + ' ' + l.name + ' [' + (l.colorName || '-') + '] ($' + l.unit + ')'; }).join(' | ');
  var row = [
    new Date(), o.orderId, 'PENDIENTE DE PAGO', o.payment === 'mp' ? 'Mercado Pago' : 'Transferencia',
    o.total, o.subtotal, o.discountPct, o.discount, o.shipping, o.units, prods,
    c.name, c.email, c.phone, c.dni, o.delivery === 'pickup' ? 'Retiro' : 'Envío', o.zone, c.province, c.city, c.cp,
    c.address, c.notes, '', '', '', new Date(), o.clientRequestId
  ].map(function (v) { return (v instanceof Date || typeof v === 'number') ? v : safe(v); });
  sh.appendRow(row);

  notify('Nuevo pedido ' + o.orderId + ' · $' + o.total,
    'Pedido: ' + o.orderId + '\nPago: ' + row[3] + '\nTotal: $' + o.total + '\n\n' + prods +
    '\n\nCliente: ' + c.name + '\nTel: ' + c.phone + '\nEmail: ' + c.email +
    '\nEntrega: ' + row[15] + ' ' + [c.address, c.city, c.province, c.cp].join(', '));
  return { ok: true, orderId: o.orderId };
}

function updatePayment(sh, p) {
  var r = findRow(sh, 'Pedido', p.orderId);
  if (!r) return { ok: true, warning: 'Pedido no encontrado' };
  var total = Number(sh.getRange(r, col('Total')).getValue());
  var estado;
  if (p.status === 'approved') estado = (Number(p.amount) + 0.5 >= total) ? 'PAGADO' : 'REVISAR MONTO';
  else if (p.status === 'pending' || p.status === 'in_process') estado = 'PAGO PENDIENTE';
  else if (p.status === 'rejected' || p.status === 'cancelled') estado = 'PAGO RECHAZADO';
  else if (p.status === 'refunded' || p.status === 'charged_back') estado = 'DEVUELTO';
  else estado = 'MP: ' + p.status;

  var prev = sh.getRange(r, col('Estado')).getValue();
  if (prev === 'PAGADO' && estado !== 'DEVUELTO') return { ok: true }; // no se "despaga" por avisos viejos
  sh.getRange(r, col('Estado')).setValue(estado);
  sh.getRange(r, col('MP Pago ID')).setValue(safe(p.paymentId));
  sh.getRange(r, col('MP Estado')).setValue(safe(p.status + ' / ' + p.statusDetail));
  sh.getRange(r, col('Monto pagado')).setValue(Number(p.amount) || 0);
  sh.getRange(r, col('Actualizado')).setValue(new Date());
  if (estado !== prev) notify('Pedido ' + p.orderId + ': ' + estado, 'Pedido ' + p.orderId + '\nEstado: ' + estado + '\nMonto: $' + p.amount + '\nMP ID: ' + p.paymentId);
  return { ok: true };
}

function notify(subject, body) {
  var to = PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL');
  if (!to) return;
  try { MailApp.sendEmail(to, '[ZALUVO] ' + subject, body); } catch (e) {}
}
