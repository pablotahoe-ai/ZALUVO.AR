# ZALUVO — Tienda online (guía para Codex y Claude)

## Qué es
Tienda de accesorios (hoy: lentes de sol) con experiencia inmersiva, **escritorio primero**:
1. **Hero** con publicidades/videos (config en `catalog.js → hero`). Slogan: "No inventamos productos. Los hacemos deseables."
2. **01 Promos** (`catalog.js → promos`), acciones: store / door:<cat> / checkout / whatsapp.
3. **02 Tienda 3D** (Three.js r128, `vendor/three.min.js`): primero un **hall de puertas** (una por categoría + `upcoming` como "Próximamente"). Al abrir una puerta se entra al **pasillo** de esa categoría: scrollear = avanzar con el carrito. Exhibidores con destacados (`featured: true`) y estanterías con todos los modelos. Hall y pasillos son UN mismo mundo 3D: el scroll lleva de las puertas al pasillo sin cortes (y hacia atrás vuelve a las puertas). Pausas al entrar y al final. Al fondo hay una puerta naranja de salida que hace el loop de vuelta a la elección de puertas. También: checkout. Mini carrito flotante dentro del pasillo.
4. **Vista de producto**: un solo modelo, "3D" (arrastrar gira frente↔perfil), colores (`defaultColors` o `colors` por producto), cantidad, agregar → volver al pasillo (el lente cae en la canasta) o checkout.
5. **03 Carrito + checkout sin login**: datos → envío → Mercado Pago o transferencia. Cada color es una línea distinta.
6. **04 Mayorista**, **05 Contacto**. La navegación salta directo (sin recorrer el pasillo).
WhatsApp flotante siempre visible.

## Archivos
- `index.html` — estructura + CSS. `app.js` — toda la lógica del front.
- `catalog.js` — **fuente única de verdad**: productos, precios, descuentos por cantidad, envíos, datos de transferencia. Lo usa el navegador (mostrar) y el servidor (cobrar).
- `assets/img-data.js` — texturas embebidas (data URI) para que el 3D funcione abriendo `index.html` directo (file://). Regenerar si cambian las fotos.
- `assets/products/{front,side,group}/` — fotos recortadas de los catálogos PDF. `assets/brand/` — logos.
- `netlify/functions/create-order.js` — crea el pedido (recalcula precios), lo guarda en la Sheet y crea la preferencia de MP.
- `netlify/functions/mp-webhook.js` — confirma pagos (firma x-signature + consulta a la API de MP).
- `server/lib.js` — validación y helpers del servidor. `apps-script/Code.gs` — backend de la Google Sheet.
- `netlify.toml` — headers de seguridad (CSP estricta: solo scripts propios), redirects.

## Modo local
Abrir `index.html` con doble clic. El pago se **simula** (se indica en pantalla). Nada se registra.

## Reglas de seguridad (NO romper)
1. El precio lo decide SOLO el servidor (`computeOrder` de `catalog.js`). Nunca confiar en montos del navegador.
2. Nunca `innerHTML` con datos de usuario: usar `el()` / `textContent`.
3. Sin CDNs externos para scripts (CSP `script-src 'self'`). Librerías en `vendor/`.
4. Access Token de MP y claves solo en variables de entorno de Netlify, jamás en el front.
5. Pago aprobado = solo por webhook consultando a la API de MP. El `?estado=aprobado` de la URL es solo visual.
6. Sheet: clave compartida `SECRET`, anti-inyección de fórmulas, dedupe por `clientRequestId`.
7. Sin diálogos nativos (`alert/confirm/prompt`): siempre modales propios.
8. Verificar JS con `node --check` después de cada cambio.

## Checklist de auditoría para Codex
- [ ] `create-order`: validar todos los campos, límites de cantidad, método de pago/entrega, origen.
- [ ] `mp-webhook`: firma, idempotencia, montos (Apps Script compara pagado vs total).
- [ ] CSP y headers en `netlify.toml`.
- [ ] Que ningún archivo interno se publique (`server/`, `apps-script/`, `netlify/`, `AGENTS.md`).
- [ ] Rate limiting de `create-order` (pendiente).

## Variables de entorno (Netlify)
`SITE_URL`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `SHEETS_WEBHOOK_URL`, `SHEETS_SECRET`.

## Pendientes (TODO Pablo)
Nombres y precios reales · WhatsApp oficial · datos de transferencia · valores de descuento y envío · videos del hero (Higgsfield) · versión mobile · IA de WhatsApp 24/7.

## Precios (PRECIOS POR PACK)
1 lente $35.000 (con estuche de cartón) · Pack Dúo 2 por $40.000 · Pack x4 por $55.000. Se mezclan modelos. `catalog.js → packPlan()` arma la combinación más barata (se usa en navegador y servidor). Envío gratis a todo el país desde 8 lentes (`shipping.freeFromUnits`).
