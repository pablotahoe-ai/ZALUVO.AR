/*
 * ZALUVO — Catálogo y reglas de precio (FUENTE ÚNICA DE VERDAD)
 * ------------------------------------------------------------
 * Este archivo lo usan DOS lados:
 *   1) El navegador (index.html lo carga con <script src="catalog.js">) → solo para MOSTRAR.
 *   2) El servidor (netlify/functions/create-order.js lo importa) → es quien COBRA.
 * El navegador nunca decide el precio final: el servidor recalcula todo con esta misma función.
 *
 * Para editar productos, precios, descuentos por cantidad o envíos: cambiar SOLO este archivo.
 * Precios en pesos argentinos, enteros (sin centavos).
 */
(function (root) {
  'use strict';

  var CATALOG = {
    version: 1,

    store: {
      name: 'ZALUVO',
      city: 'Mar del Plata',
      currency: 'ARS',
      // TODO(Pablo): reemplazar por el WhatsApp oficial de la tienda (formato internacional sin +).
      whatsapp: '5492235431546',
      whatsappGreeting: 'Hola ZALUVO! Quiero hacer una consulta.',
      instagram: '',
      email: '',
      // Datos públicos de transferencia (se muestran al cliente). TODO(Pablo): completar.
      transfer: {
        alias: 'ZALUVO.TIENDA',
        cbu: '0000000000000000000000',
        holder: 'ZALUVO',
        bank: 'Completar banco'
      }
    },

    // HERO: publicidades. Se reproducen en orden aleatorio y en loop (cuando termina un video pasa a otro al azar).
    // Videos en assets/video/ (1920x1080, sin audio). Los verticales se combinan de a dos en uno horizontal.
    // "image" se usa como póster mientras carga el video (o solo, si no hay video).
    hero: [
      { video: 'assets/video/hero-1.mp4', image: 'assets/video/hero-1.jpg', kicker: 'Nuevos ingresos · Temporada 26/27', title: 'ZALUVO', sub: 'No inventamos productos. Los hacemos deseables.', cta: 'Entrar a la tienda' },
      { video: 'assets/video/hero-2.mp4', image: 'assets/video/hero-2.jpg', kicker: 'Modelo de volumen', title: '1 es una elección.|4, una oportunidad.', sub: '4 lentes por $55.000. Mezclá modelos.', cta: 'Arrancar el recorrido' }
    ],

    // PROMOCIONES (sección debajo del hero, antes de la tienda). Sirven para cualquier accesorio.
    // action: 'store' (abre las puertas) · 'door:<categoria>' (entra directo a ese pasillo) · 'checkout' · 'whatsapp'
    promos: [
      { tag: 'Pack x4', title: '4 lentes por $55.000', text: 'Mezclá modelos y categorías. El carrito arma el pack solo.', image: 'assets/products/front/D25.webp', cta: 'Armar mi pack', action: 'store', hot: true },
      { tag: 'Pack Dúo', title: '2 lentes por $40.000', text: 'Uno para vos, otro para regalar. O para compartir.', image: 'assets/products/front/U05.webp', cta: 'Ver Unisex & Dama', action: 'door:urbanos' },
      { tag: 'Envíos', title: 'Gratis desde 8 lentes', text: 'A todo el país, sea donde sea. Retiro sin cargo en Mar del Plata.', image: 'assets/products/front/D27.webp', cta: 'Ver Deportivos', action: 'door:deportivos' },
      { tag: '1 lente', title: '$35.000 con estuche', text: 'Cada lente viene con su estuche de cartón ZALUVO.', image: 'assets/products/front/U24.webp', cta: 'Entrar a la tienda', action: 'store' }
    ],

    // Colores por categoría (provisorios hasta tener la lista real). Un producto puede tener "colors" propio.
    // TODO(Pablo): cargar los colores reales de cada modelo.
    defaultColors: {
      deportivos: [
        { id: 'foto', name: 'Como en la foto', hex: '' },
        { id: 'humo', name: 'Humo', hex: '#3b4150' },
        { id: 'azul', name: 'Espejado azul', hex: '#2f8cff' },
        { id: 'fuego', name: 'Espejado fuego', hex: '#ff5a2c' }
      ],
      urbanos: [
        { id: 'foto', name: 'Como en la foto', hex: '' },
        { id: 'negro', name: 'Negro', hex: '#16181d' },
        { id: 'carey', name: 'Carey', hex: '#8a5a2b' }
      ]
    },

    // Categorías: hoy solo lentes. Para sumar gorras/bolsos: agregar acá y en products.
    categories: [
      { id: 'deportivos', name: 'Deportivos', active: true },
      { id: 'urbanos', name: 'Unisex & Dama', active: true }
    ],
    // Se muestran como "pronto" en el selector. Pasarlas a categories cuando haya productos.
    upcoming: ['Gorras', 'Bolsos'],

    // TODO(Pablo): nombres y precios PROVISORIOS. Fotos recortadas de los catálogos PDF.
    products: [
      { id: 'd01', code: 'ZLV D01', name: 'Biología', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: true, image: 'assets/products/front/D01.webp', side: 'assets/products/side/D01.webp', group: 'assets/products/group/D01.webp', color: '#64afee' },
      { id: 'd02', code: 'ZLV D02', name: 'Waikiki', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D02.webp', side: 'assets/products/side/D02.webp', group: 'assets/products/group/D02.webp', color: '#788caa' },
      { id: 'd03', code: 'ZLV D03', name: 'Serena', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D03.webp', side: 'assets/products/side/D03.webp', group: 'assets/products/group/D03.webp', color: '#dc9c55' },
      { id: 'd04', code: 'ZLV D04', name: 'Mogotes', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D04.webp', side: 'assets/products/side/D04.webp', group: 'assets/products/group/D04.webp', color: '#6ebbf3' },
      { id: 'd05', code: 'ZLV D05', name: 'Chapadmalal', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: true, image: 'assets/products/front/D05.webp', side: 'assets/products/side/D05.webp', group: 'assets/products/group/D05.webp', color: '#8962d3' },
      { id: 'd06', code: 'ZLV D06', name: 'Varese', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D06.webp', side: 'assets/products/side/D06.webp', group: 'assets/products/group/D06.webp', color: '#ddcf9b' },
      { id: 'd07', code: 'ZLV D07', name: 'La Perla', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D07.webp', side: 'assets/products/side/D07.webp', group: 'assets/products/group/D07.webp', color: '#788caa' },
      { id: 'd08', code: 'ZLV D08', name: 'Playa Grande', category: 'deportivos', desc: 'Lentes de sol deportivos · con estuche', price: 35000, stock: true, featured: false, image: 'assets/products/front/D08.webp', side: 'assets/products/side/D08.webp', group: null, color: '#788caa' },
      { id: 'd09', code: 'ZLV D09', name: 'Cardiel', category: 'deportivos', desc: 'Lentes de sol deportivos · con estuche', price: 35000, stock: true, featured: false, image: 'assets/products/front/D09.webp', side: 'assets/products/side/D09.webp', group: null, color: '#a8c8e9' },
      { id: 'd10', code: 'ZLV D10', name: 'Estrada', category: 'deportivos', desc: 'Lentes de sol deportivos · con estuche', price: 35000, stock: true, featured: false, image: 'assets/products/front/D10.webp', side: 'assets/products/side/D10.webp', group: null, color: '#788caa' },
      { id: 'd11', code: 'ZLV D11', name: 'Bristol', category: 'deportivos', desc: 'Lentes de sol deportivos · con estuche', price: 35000, stock: true, featured: false, image: 'assets/products/front/D11.webp', side: 'assets/products/side/D11.webp', group: null, color: '#788caa' },
      { id: 'd12', code: 'ZLV D12', name: 'Torreón', category: 'deportivos', desc: 'Lentes de sol deportivos · con estuche', price: 35000, stock: true, featured: false, image: 'assets/products/front/D12.webp', side: 'assets/products/side/D12.webp', group: null, color: '#788caa' },
      { id: 'd13', code: 'ZLV D13', name: 'Alfar', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D13.webp', side: 'assets/products/side/D13.webp', group: 'assets/products/group/D13.webp', color: '#788caa' },
      { id: 'd14', code: 'ZLV D14', name: 'Faro', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D14.webp', side: 'assets/products/side/D14.webp', group: 'assets/products/group/D14.webp', color: '#788caa' },
      { id: 'd15', code: 'ZLV D15', name: 'Constitución', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D15.webp', side: 'assets/products/side/D15.webp', group: 'assets/products/group/D15.webp', color: '#f9f665' },
      { id: 'd16', code: 'ZLV D16', name: 'Sun Rider', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D16.webp', side: 'assets/products/side/D16.webp', group: 'assets/products/group/D16.webp', color: '#f8f762' },
      { id: 'd17', code: 'ZLV D17', name: 'Acantilados', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D17.webp', side: 'assets/products/side/D17.webp', group: 'assets/products/group/D17.webp', color: '#788caa' },
      { id: 'd18', code: 'ZLV D18', name: 'Lobería', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D18.webp', side: 'assets/products/side/D18.webp', group: 'assets/products/group/D18.webp', color: '#788caa' },
      { id: 'd19', code: 'ZLV D19', name: 'Mar Chiquita', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D19.webp', side: 'assets/products/side/D19.webp', group: 'assets/products/group/D19.webp', color: '#f7f673' },
      { id: 'd20', code: 'ZLV D20', name: 'Santa Clara', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D20.webp', side: 'assets/products/side/D20.webp', group: 'assets/products/group/D20.webp', color: '#788caa' },
      { id: 'd21', code: 'ZLV D21', name: 'Camet', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D21.webp', side: 'assets/products/side/D21.webp', group: 'assets/products/group/D21.webp', color: '#45a7fa' },
      { id: 'd22', code: 'ZLV D22', name: 'Punta Cantera', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: true, image: 'assets/products/front/D22.webp', side: 'assets/products/side/D22.webp', group: 'assets/products/group/D22.webp', color: '#c4c596' },
      { id: 'd23', code: 'ZLV D23', name: 'Horizonte', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D23.webp', side: 'assets/products/side/D23.webp', group: 'assets/products/group/D23.webp', color: '#d9824a' },
      { id: 'd24', code: 'ZLV D24', name: 'Escollera', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D24.webp', side: 'assets/products/side/D24.webp', group: 'assets/products/group/D24.webp', color: '#72a1da' },
      { id: 'd25', code: 'ZLV D25', name: 'Muelle', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: true, image: 'assets/products/front/D25.webp', side: 'assets/products/side/D25.webp', group: 'assets/products/group/D25.webp', color: '#f0a751' },
      { id: 'd26', code: 'ZLV D26', name: 'Puerto', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D26.webp', side: 'assets/products/side/D26.webp', group: 'assets/products/group/D26.webp', color: '#788caa' },
      { id: 'd27', code: 'ZLV D27', name: 'Banquina', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: true, image: 'assets/products/front/D27.webp', side: 'assets/products/side/D27.webp', group: 'assets/products/group/D27.webp', color: '#3394f0' },
      { id: 'd28', code: 'ZLV D28', name: 'Lobo', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D28.webp', side: 'assets/products/side/D28.webp', group: 'assets/products/group/D28.webp', color: '#788caa' },
      { id: 'd29', code: 'ZLV D29', name: 'Gaviota', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D29.webp', side: 'assets/products/side/D29.webp', group: 'assets/products/group/D29.webp', color: '#f0a543' },
      { id: 'd30', code: 'ZLV D30', name: 'Médano', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D30.webp', side: 'assets/products/side/D30.webp', group: 'assets/products/group/D30.webp', color: '#f3b152' },
      { id: 'd31', code: 'ZLV D31', name: 'Rompiente', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D31.webp', side: 'assets/products/side/D31.webp', group: 'assets/products/group/D31.webp', color: '#788caa' },
      { id: 'd32', code: 'ZLV D32', name: 'Barlovento', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D32.webp', side: 'assets/products/side/D32.webp', group: 'assets/products/group/D32.webp', color: '#2e84ea' },
      { id: 'd33', code: 'ZLV D33', name: 'Sotavento', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D33.webp', side: 'assets/products/side/D33.webp', group: 'assets/products/group/D33.webp', color: '#efb053' },
      { id: 'd34', code: 'ZLV D34', name: 'Marea', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D34.webp', side: 'assets/products/side/D34.webp', group: 'assets/products/group/D34.webp', color: '#788caa' },
      { id: 'd35', code: 'ZLV D35', name: 'Oleaje', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/D35.webp', side: 'assets/products/side/D35.webp', group: 'assets/products/group/D35.webp', color: '#69b3eb' },
      { id: 'd36', code: 'ZLV D36', name: 'Brisa', category: 'deportivos', desc: 'Lentes de sol deportivos · varios colores', price: 35000, stock: true, featured: true, image: 'assets/products/front/D36.webp', side: 'assets/products/side/D36.webp', group: 'assets/products/group/D36.webp', color: '#f3c772' },
      { id: 'u01', code: 'ZLV U01', name: 'Güemes', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U01.webp', side: 'assets/products/side/U01.webp', group: 'assets/products/group/U01.webp', color: '#788caa' },
      { id: 'u02', code: 'ZLV U02', name: 'Alem', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U02.webp', side: 'assets/products/side/U02.webp', group: 'assets/products/group/U02.webp', color: '#788caa' },
      { id: 'u03', code: 'ZLV U03', name: 'Colón', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U03.webp', side: 'assets/products/side/U03.webp', group: 'assets/products/group/U03.webp', color: '#447627' },
      { id: 'u04', code: 'ZLV U04', name: 'Rambla', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: true, image: 'assets/products/front/U04.webp', side: 'assets/products/side/U04.webp', group: 'assets/products/group/U04.webp', color: '#b5c2d7' },
      { id: 'u05', code: 'ZLV U05', name: 'Casino', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: true, image: 'assets/products/front/U05.webp', side: 'assets/products/side/U05.webp', group: 'assets/products/group/U05.webp', color: '#586c7c' },
      { id: 'u06', code: 'ZLV U06', name: 'Hermitage', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U06.webp', side: 'assets/products/side/U06.webp', group: 'assets/products/group/U06.webp', color: '#788caa' },
      { id: 'u07', code: 'ZLV U07', name: 'Los Troncos', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U07.webp', side: 'assets/products/side/U07.webp', group: 'assets/products/group/U07.webp', color: '#788caa' },
      { id: 'u08', code: 'ZLV U08', name: 'Stella Maris', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: true, image: 'assets/products/front/U08.webp', side: 'assets/products/side/U08.webp', group: 'assets/products/group/U08.webp', color: '#8c5c38' },
      { id: 'u09', code: 'ZLV U09', name: 'Chauvín', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U09.webp', side: 'assets/products/side/U09.webp', group: 'assets/products/group/U09.webp', color: '#925f37' },
      { id: 'u10', code: 'ZLV U10', name: 'Mitre', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U10.webp', side: 'assets/products/side/U10.webp', group: 'assets/products/group/U10.webp', color: '#788caa' },
      { id: 'u11', code: 'ZLV U11', name: 'San Carlos', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U11.webp', side: 'assets/products/side/U11.webp', group: 'assets/products/group/U11.webp', color: '#788caa' },
      { id: 'u12', code: 'ZLV U12', name: 'Luro', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U12.webp', side: 'assets/products/side/U12.webp', group: 'assets/products/group/U12.webp', color: '#845633' },
      { id: 'u13', code: 'ZLV U13', name: 'Independencia', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U13.webp', side: 'assets/products/side/U13.webp', group: 'assets/products/group/U13.webp', color: '#9b693d' },
      { id: 'u14', code: 'ZLV U14', name: 'Olavarría', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U14.webp', side: 'assets/products/side/U14.webp', group: 'assets/products/group/U14.webp', color: '#98623a' },
      { id: 'u15', code: 'ZLV U15', name: 'Lomas', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U15.webp', side: 'assets/products/side/U15.webp', group: 'assets/products/group/U15.webp', color: '#976b31' },
      { id: 'u16', code: 'ZLV U16', name: 'Peralta Ramos', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: true, image: 'assets/products/front/U16.webp', side: 'assets/products/side/U16.webp', group: 'assets/products/group/U16.webp', color: '#855b2b' },
      { id: 'u17', code: 'ZLV U17', name: 'Sierra', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U17.webp', side: 'assets/products/side/U17.webp', group: 'assets/products/group/U17.webp', color: '#788caa' },
      { id: 'u18', code: 'ZLV U18', name: 'Laguna', category: 'urbanos', desc: 'Lentes de sol unisex & dama · con estuche', price: 35000, stock: true, featured: false, image: 'assets/products/front/U18.webp', side: 'assets/products/side/U18.webp', group: null, color: '#788caa' },
      { id: 'u19', code: 'ZLV U19', name: 'Atlántico', category: 'urbanos', desc: 'Lentes de sol unisex & dama · con estuche', price: 35000, stock: true, featured: false, image: 'assets/products/front/U19.webp', side: 'assets/products/side/U19.webp', group: null, color: '#788caa' },
      { id: 'u20', code: 'ZLV U20', name: 'Pinar', category: 'urbanos', desc: 'Lentes de sol unisex & dama · con estuche', price: 35000, stock: true, featured: false, image: 'assets/products/front/U20.webp', side: 'assets/products/side/U20.webp', group: null, color: '#788caa' },
      { id: 'u21', code: 'ZLV U21', name: 'Terraza', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U21.webp', side: 'assets/products/side/U21.webp', group: 'assets/products/group/U21.webp', color: '#788caa' },
      { id: 'u22', code: 'ZLV U22', name: 'Mirador', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U22.webp', side: 'assets/products/side/U22.webp', group: 'assets/products/group/U22.webp', color: '#825831' },
      { id: 'u23', code: 'ZLV U23', name: 'Palmera', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U23.webp', side: 'assets/products/side/U23.webp', group: 'assets/products/group/U23.webp', color: '#8d5e3c' },
      { id: 'u24', code: 'ZLV U24', name: 'Aurora', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: true, image: 'assets/products/front/U24.webp', side: 'assets/products/side/U24.webp', group: 'assets/products/group/U24.webp', color: '#788caa' },
      { id: 'u25', code: 'ZLV U25', name: 'Duna', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U25.webp', side: 'assets/products/side/U25.webp', group: 'assets/products/group/U25.webp', color: '#788caa' },
      { id: 'u26', code: 'ZLV U26', name: 'Coral', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U26.webp', side: 'assets/products/side/U26.webp', group: 'assets/products/group/U26.webp', color: '#788caa' },
      { id: 'u27', code: 'ZLV U27', name: 'Nácar', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U27.webp', side: 'assets/products/side/U27.webp', group: 'assets/products/group/U27.webp', color: '#f9f89d' },
      { id: 'u28', code: 'ZLV U28', name: 'Arena', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U28.webp', side: 'assets/products/side/U28.webp', group: 'assets/products/group/U28.webp', color: '#788caa' },
      { id: 'u29', code: 'ZLV U29', name: 'Salitre', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U29.webp', side: 'assets/products/side/U29.webp', group: 'assets/products/group/U29.webp', color: '#788caa' },
      { id: 'u30', code: 'ZLV U30', name: 'Ámbar', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U30.webp', side: 'assets/products/side/U30.webp', group: 'assets/products/group/U30.webp', color: '#788caa' },
      { id: 'u31', code: 'ZLV U31', name: 'Carey', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U31.webp', side: 'assets/products/side/U31.webp', group: 'assets/products/group/U31.webp', color: '#fcfa89' },
      { id: 'u32', code: 'ZLV U32', name: 'Bruma', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: true, image: 'assets/products/front/U32.webp', side: 'assets/products/side/U32.webp', group: 'assets/products/group/U32.webp', color: '#99d2ef' },
      { id: 'u33', code: 'ZLV U33', name: 'Ocaso', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U33.webp', side: 'assets/products/side/U33.webp', group: 'assets/products/group/U33.webp', color: '#788caa' },
      { id: 'u34', code: 'ZLV U34', name: 'Faro Norte', category: 'urbanos', desc: 'Lentes de sol unisex & dama · varios colores', price: 35000, stock: true, featured: false, image: 'assets/products/front/U34.webp', side: 'assets/products/side/U34.webp', group: 'assets/products/group/U34.webp', color: '#eca189' }
    ],

    // PRECIOS POR PACK (se mezclan modelos y categorías). El carrito arma solo la combinación más barata.
    // 1 lente = precio del producto (hoy $35.000, incluye estuche de cartón).
    unitPrice: 35000,
    packs: [
      { units: 4, price: 55000, name: 'Pack x4' },
      { units: 2, price: 40000, name: 'Pack Dúo' }
    ],

    limits: { maxQtyPerItem: 20, maxLines: 20 },

    // Envío. TODO(Pablo): valores de ejemplo. Luego se puede reemplazar por cotización real (Andreani / MP Envíos).
    shipping: {
      freeFromUnits: 8, // envío GRATIS a todo el país desde esta cantidad de lentes
      pickup: { label: 'Retiro en Mar del Plata', cost: 0 },
      zones: [
        { id: 'mdp',  label: 'Mar del Plata',              cost: 3500, cp: [[7600, 7609]] },
        { id: 'amba', label: 'CABA y Gran Buenos Aires',   cost: 6500, cp: [[1000, 1999]] },
        { id: 'pba',  label: 'Provincia de Buenos Aires',  cost: 6500, cp: [[2700, 2999], [6000, 8199]] },
        { id: 'arg',  label: 'Resto del país',             cost: 8900, cp: [[1000, 9999]] }
      ]
    },

    provinces: [
      'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos',
      'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta',
      'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'
    ]
  };

  function findProduct(id) {
    for (var i = 0; i < CATALOG.products.length; i++) {
      if (CATALOG.products[i].id === id) return CATALOG.products[i];
    }
    return null;
  }

  function colorsOf(p) {
    return (p && (p.colors || CATALOG.defaultColors[p.category])) || [{ id: 'foto', name: 'Como en la foto', hex: '' }];
  }
  function findColor(p, id) {
    var list = colorsOf(p);
    if (id == null || id === '') return list[0];
    for (var i = 0; i < list.length; i++) if (list[i].id === String(id)) return list[i];
    return null;
  }

  // Mejor precio para n lentes combinando packs (programación dinámica: siempre la opción más barata).
  function packPlan(n) {
    var U = CATALOG.unitPrice, best = [0], how = [null];
    var opts = [{ units: 1, price: U, name: 'Unidad' }].concat(CATALOG.packs || []);
    for (var i = 1; i <= n; i++) {
      best[i] = Infinity;
      for (var k = 0; k < opts.length; k++) {
        var o = opts[k];
        if (o.units <= i && best[i - o.units] + o.price < best[i]) { best[i] = best[i - o.units] + o.price; how[i] = o; }
      }
    }
    var parts = {}, j = n;
    while (j > 0) { var o2 = how[j]; parts[o2.name] = (parts[o2.name] || 0) + 1; j -= o2.units; }
    var list = [];
    opts.slice().reverse().forEach(function (o) { if (parts[o.name]) list.push({ name: o.name, units: o.units, price: o.price, count: parts[o.name] }); });
    list.sort(function (x, y) { return y.units - x.units; });
    return { total: best[n] || 0, parts: list };
  }
  function packPrice(n) { return packPlan(n).total; }

  // Sugerencia para llevar más: "Sumá 1 y llevás 2 por $40.000", o envío gratis.
  function nextDeal(n) {
    var cur = n ? packPrice(n) / n : Infinity;
    for (var k = 1; k <= 4; k++) {
      var m = n + k, avg = packPrice(m) / m;
      if (avg < cur - 1) return { add: k, units: m, price: packPrice(m), cheaper: packPrice(m) <= packPrice(n) };
    }
    var f = CATALOG.shipping.freeFromUnits;
    if (f && n < f) return { add: f - n, units: f, price: packPrice(f), freeShipping: true };
    return null;
  }
  function dealText(n) {
    var d = nextDeal(n);
    if (!d) return n >= (CATALOG.shipping.freeFromUnits || Infinity) ? 'Tenés envío gratis a todo el país' : '';
    var fm = function (v) { return '$' + Math.round(v).toLocaleString('es-AR'); };
    if (d.freeShipping) return 'Sumá ' + d.add + ' y el envío es gratis a todo el país';
    if (d.cheaper) return 'Sumá ' + d.add + ' y pagás MENOS: ' + d.units + ' por ' + fm(d.price);
    return 'Sumá ' + d.add + ' y llevás ' + d.units + ' por ' + fm(d.price);
  }

  // Código postal argentino: acepta "7600" o CPA "B7600ABC". Devuelve número de 4 dígitos o null.
  function parseCP(cp) {
    var m = String(cp || '').toUpperCase().match(/^[A-Z]?(\d{4})[A-Z]{0,3}$/);
    return m ? parseInt(m[1], 10) : null;
  }

  function shippingZone(cp) {
    var n = parseCP(cp);
    if (n === null) return null;
    var zones = CATALOG.shipping.zones;
    for (var i = 0; i < zones.length; i++) {
      for (var j = 0; j < zones[i].cp.length; j++) {
        if (n >= zones[i].cp[j][0] && n <= zones[i].cp[j][1]) return zones[i];
      }
    }
    return null;
  }

  /**
   * Calcula el pedido. Lanza Error si algo es inválido.
   * items: [{id, color, qty}] · delivery: {method:'ship'|'pickup', cp}
   */
  function computeOrder(items, delivery) {
    if (!Array.isArray(items) || items.length === 0) throw new Error('Carrito vacío');
    if (items.length > CATALOG.limits.maxLines) throw new Error('Demasiados productos');
    var merged = {};
    var order = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var p = findProduct(String(it.id));
      var q = Number(it.qty);
      if (!p) throw new Error('Producto inexistente');
      if (!p.stock) throw new Error('Sin stock: ' + p.code);
      if (!Number.isInteger(q) || q < 1 || q > CATALOG.limits.maxQtyPerItem) throw new Error('Cantidad inválida');
      var col = findColor(p, it.color);
      if (!col) throw new Error('Color inválido: ' + p.code);
      var key = p.id + '|' + col.id;
      if (!merged[key]) { merged[key] = 0; order.push({ key: key, p: p, c: col }); }
      merged[key] += q;
      if (merged[key] > CATALOG.limits.maxQtyPerItem) throw new Error('Cantidad inválida');
    }
    var lines = [], subtotal = 0, units = 0;
    for (var k = 0; k < order.length; k++) {
      var prod = order[k].p, color = order[k].c;
      var qty = merged[order[k].key];
      lines.push({ id: prod.id, color: color.id, colorName: color.name, code: prod.code, name: prod.name, qty: qty, unit: prod.price, total: prod.price * qty });
      subtotal += prod.price * qty;
      units += qty;
    }
    var plan = packPlan(units);
    var discount = Math.max(0, subtotal - plan.total);
    var discountPct = subtotal ? Math.round(discount * 100 / subtotal) : 0;
    var afterDiscount = subtotal - discount;

    var shipping = null, zone = null;
    if (delivery && delivery.method === 'pickup') {
      shipping = CATALOG.shipping.pickup.cost;
      zone = { id: 'pickup', label: CATALOG.shipping.pickup.label };
    } else if (delivery && delivery.method === 'ship') {
      var z = shippingZone(delivery.cp);
      if (!z) throw new Error('Código postal inválido');
      zone = { id: z.id, label: z.label };
      shipping = (CATALOG.shipping.freeFromUnits && units >= CATALOG.shipping.freeFromUnits) ? 0 : z.cost;
    }

    return {
      lines: lines,
      units: units,
      subtotal: subtotal,
      discountPct: discountPct,
      discount: discount,
      shipping: shipping,
      zone: zone,
      total: afterDiscount + (shipping || 0),
      packs: plan.parts,
      deal: dealText(units)
    };
  }

  var API = {
    CATALOG: CATALOG,
    findProduct: findProduct,
    colorsOf: colorsOf,
    findColor: findColor,
    computeOrder: computeOrder,
    shippingZone: shippingZone,
    parseCP: parseCP,
    packPlan: packPlan,
    packPrice: packPrice,
    nextDeal: nextDeal,
    dealText: dealText
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ZALUVO = API;
})(typeof window !== 'undefined' ? window : this);
