/*
 * ZALUVO — experiencia de tienda (escritorio primero)
 * Hero · 01 Promos · 02 Tienda (hall de puertas → pasillo 3D en primera persona) · 03 Carrito/Checkout · 04 Mayorista · 05 Contacto
 *
 * Seguridad en el navegador:
 *  - Nunca se inserta HTML con datos de usuario (todo por textContent / createElement).
 *  - El precio que se ve es solo informativo: el servidor recalcula todo con catalog.js.
 *  - Sin cuentas ni contraseñas. Los datos del comprador quedan solo en SU navegador (localStorage)
 *    si marca "recordar mis datos".
 */
(function () {
  'use strict';

  var Z = window.ZALUVO;
  var C = Z.CATALOG;
  var IMG = window.ZALUVO_IMG || {};
  var CATS = C.categories.filter(function (c) { return c.active; });
  var P = C.products.filter(function (p) { return CATS.some(function (c) { return c.id === p.category; }); });
  var IS_FILE = location.protocol === 'file:';
  var IS_LOCALHOST = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var BRAND = {}; // imágenes de marca (data URI) para dibujar en el 3D
  var PIMG = {}; // fotos de producto (Image) para dibujar pósters y puertas

  /* ================= utilidades ================= */
  function $(s, r) { return (r || document).querySelector(s); }
  function byCat(id) { return P.filter(function (p) { return p.category === id; }); }
  function catName(id) { var c = CATS.filter(function (x) { return x.id === id; })[0]; return c ? c.name : ''; }
  function img(p) { return p.image; }
  function tex(path) { return IMG[path] || path; }
  function fmt(n) { return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hexA(hex, a) {
    var h = String(hex || '#4A6FA5').replace('#', '');
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function el(tag, props) {
    var e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'style') e.style.cssText = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(e, arguments[i]);
    return e;
  }
  function append(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(e, x); }); return; }
    e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  function icon(id, cls) {
    var NS = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(NS, 'svg');
    if (cls) s.setAttribute('class', cls);
    s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS(NS, 'use');
    u.setAttribute('href', '#' + id);
    s.appendChild(u);
    return s;
  }
  function waLink(msg) {
    return 'https://wa.me/' + encodeURIComponent(C.store.whatsapp) + '?text=' + encodeURIComponent(msg || C.store.whatsappGreeting);
  }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return (b + 256).toString(16).slice(1); }).join('');
  }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var K = { cart: 'zaluvo.cart.v1', cust: 'zaluvo.customer.v1', last: 'zaluvo.lastOrder.v1' };
  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
    return new Promise(function (res) {
      var ta = el('textarea', { style: 'position:fixed;opacity:0' }); ta.value = t;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.remove(); res();
    });
  }
  // Salto instantáneo (sin "pasear" por el pasillo 3D).
  function jumpTo(sel, force) {
    if (!force && Store && Store.locked()) { Store.nudgeExit(); return; } // inmersivo: se sale por una puerta
    var t = typeof sel === 'string' ? $(sel) : sel;
    if (!t) return;
    var y = t.getBoundingClientRect().top + window.scrollY;
    if (t.id !== 'tienda') y -= 72; // alto del header
    window.scrollTo({ top: sel === '#top' ? 0 : Math.max(0, y), behavior: 'auto' });
  }
  function colorSwatch(p, c) {
    // "Como en la foto" usa la foto del producto como muestra.
    return c.hex ? 'background:' + c.hex : 'background-image:url("' + p.image + '")';
  }

  /* ================= carrito (estado) ================= */
  // Cada línea: {id, color, qty}. Mismo modelo en otro color = otra línea.
  var cart = sanitize(store.get(K.cart, []));
  var reqId = null; // id anti doble-envío del checkout en curso

  function keyOf(i) { return i.id + '|' + i.color; }
  function sanitize(a) {
    var out = [];
    if (!Array.isArray(a)) return out;
    a.forEach(function (i) {
      var p = i && Z.findProduct(String(i.id));
      var q = Math.floor(Number(i && i.qty));
      if (!p || !p.stock || !(q > 0)) return;
      var c = Z.findColor(p, i.color) || Z.colorsOf(p)[0];
      var k = p.id + '|' + c.id;
      var ex = out.filter(function (o) { return keyOf(o) === k; })[0];
      if (ex) ex.qty = Math.min(ex.qty + q, C.limits.maxQtyPerItem);
      else out.push({ id: p.id, color: c.id, qty: Math.min(q, C.limits.maxQtyPerItem) });
    });
    return out.slice(0, C.limits.maxLines);
  }
  function saveCart() { store.set(K.cart, cart); reqId = null; }
  function units() { return cart.reduce(function (s, i) { return s + i.qty; }, 0); }
  function calc(delivery) { return cart.length ? Z.computeOrder(cart, delivery) : null; }

  function addToCart(id, color, qty) {
    var p = Z.findProduct(id); if (!p) return;
    var c = Z.findColor(p, color); if (!c) return;
    var k = id + '|' + c.id;
    var ex = cart.filter(function (i) { return keyOf(i) === k; })[0];
    if (ex) ex.qty = Math.min(ex.qty + qty, C.limits.maxQtyPerItem);
    else cart.push({ id: id, color: c.id, qty: Math.min(qty, C.limits.maxQtyPerItem) });
    saveCart(); renderCart();
    var pill = $('#cartPill'); pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
  }
  function setQty(k, q) {
    cart = cart.map(function (i) { return keyOf(i) === k ? { id: i.id, color: i.color, qty: Math.min(q, C.limits.maxQtyPerItem) } : i; })
      .filter(function (i) { return i.qty > 0; });
    saveCart(); renderCart();
  }
  function clearCart() { cart = []; saveCart(); renderCart(); }

  window.addEventListener('storage', function (e) {
    if (e.key === K.cart) { cart = sanitize(store.get(K.cart, [])); renderCart(); }
  });

  function goCheckout() {
    PV.close(true);
    if (Store && Store.locked()) Store.release();
    jumpTo('#carrito', true); // muestra la sección 03: qué compraste, cantidades y total (el envío se calcula después)
  }
  function goStore(cat) {
    if (Store && Store.locked()) { if (cat) Store.enterAisle(cat); else Store.showHall(); return; }
    jumpTo('#tienda');
    if (!Store) return;
    if (cat) Store.enterAisle(cat); else Store.showHall();
  }

  /* ================= header / navegación / whatsapp ================= */
  function initChrome() {
    var hdr = $('#hdr');
    function onScroll() { hdr.classList.toggle('solid', window.scrollY > 40); }
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    $('#cartPill').addEventListener('click', function () { jumpTo('#carrito'); });
    Array.prototype.forEach.call(document.querySelectorAll('a[data-jump]'), function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var h = a.getAttribute('href');
        if (h === '#tienda') goStore(); else jumpTo(h);
      });
    });
    $('#waFab').href = waLink();
    $('#waFooter').href = waLink();
    $('#waWholesale').href = waLink('Hola ZALUVO! Quiero recibir la lista mayorista.');
  }

  /* ================= HERO ================= */
  function initHero() {
    var media = $('#heroMedia'), copy = $('#heroCopy'), dots = $('#heroDots');
    var slides = C.hero || [];
    var DUR = 7000, cur = -1, timer = null;
    slides.forEach(function (s, k) {
      var sl = el('div', { class: 'slide' });
      if (s.video) {
        var v = el('video', { playsinline: true, preload: 'auto', poster: s.image });
        v.muted = true;
        // WebM (más liviano) y MP4 de respaldo: el navegador usa el que pueda reproducir.
        var srcs = [s.video.replace(/\.mp4$/, '.webm'), s.video].filter(function (x, i, a) { return a.indexOf(x) === i; });
        srcs.forEach(function (src, i) {
          var so = el('source', { src: src, type: /\.webm$/.test(src) ? 'video/webm' : 'video/mp4' });
          if (i === srcs.length - 1) so.addEventListener('error', function () { if (cur === k) { clearTimeout(timer); timer = setTimeout(next, DUR); } });
          v.appendChild(so);
        });
        v.addEventListener('ended', function () { if (cur === k) next(); });
        sl.appendChild(v);
      } else {
        sl.appendChild(el('img', { src: s.image, alt: '' }));
      }
      media.appendChild(sl);
      dots.appendChild(el('button', { role: 'tab', 'aria-label': 'Publicidad ' + (k + 1), onclick: function () { show(k); } }, el('i')));
    });

    function renderCopy(s) {
      copy.classList.remove('in');
      copy.textContent = '';
      var lines = String(s.title).split('|');
      var title = el('h1', { class: 'hero-title anim' + (lines.length > 1 ? ' small' : '') });
      if (s.title === 'ZALUVO') title.appendChild(el('img', { class: 'hero-logo', src: 'assets/brand/logotipo-white.png', alt: 'ZALUVO' }));
      else lines.forEach(function (l, j) { if (j) title.appendChild(el('br')); title.appendChild(document.createTextNode(l)); });
      var sub = el('p', { class: 'hero-sub anim' });
      var parts = String(s.sub).split('. ');
      if (parts.length === 2) { sub.appendChild(document.createTextNode(parts[0] + '. ')); sub.appendChild(el('b', { text: parts[1] })); }
      else sub.textContent = s.sub;
      append(copy, [
        el('p', { class: 'eyebrow anim', text: s.kicker }),
        title, sub,
        el('div', { class: 'hero-cta anim' },
          el('button', { class: 'btn btn-light', onclick: function () { goStore(); } }, s.cta, icon('i-arrow')),
          el('button', { class: 'btn btn-ghost', onclick: function () { jumpTo('#promos'); } }, 'Ver promos'))
      ]);
      requestAnimationFrame(function () { requestAnimationFrame(function () { copy.classList.add('in'); }); });
    }
    // Orden aleatorio: al terminar, pasa a otro al azar (nunca repite el mismo seguido).
    function next() {
      if (slides.length < 2) { show(Math.max(0, cur)); return; }
      var k; do { k = Math.floor(Math.random() * slides.length); } while (k === cur);
      show(k);
    }
    function show(k) {
      var changed = k !== cur;
      cur = k;
      var dur = DUR;
      Array.prototype.forEach.call(media.children, function (c, j) {
        c.classList.toggle('on', j === k);
        var v = c.querySelector('video');
        if (!v) return;
        if (j === k) {
          try { v.currentTime = 0; } catch (e) {}
          var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
          if (v.duration) dur = v.duration * 1000;
        } else v.pause();
      });
      dots.style.setProperty('--dur', dur + 'ms');
      Array.prototype.forEach.call(dots.children, function (d, j) {
        d.classList.remove('on'); void d.offsetWidth; if (j === k) d.classList.add('on');
      });
      if (changed) renderCopy(slides[k]);
      clearTimeout(timer);
      if (!slides[k].video) timer = setTimeout(next, DUR);
    }
    if (slides.length) show(Math.floor(Math.random() * slides.length));
  }


  /* ================= 01 · PROMOS ================= */
  function promoAction(a) {
    if (a === 'store') goStore();
    else if (a && a.indexOf('door:') === 0) goStore(a.slice(5));
    else if (a === 'checkout') goCheckout();
    else if (a === 'whatsapp') window.open(waLink('Hola ZALUVO! Quiero recibir la lista mayorista.'), '_blank', 'noopener');
  }
  // Promos: carteles en coverflow (no son botones). Giran solos; la ruedita del costado los hace girar.
  var PromoCF = null;
  function renderPromos() {
    var track = $('#pcfTrack'), dots = $('#pcfDots'), dial = $('#pcfDial'), wheel = $('#pcfWheel');
    var list = C.promos || [];
    track.textContent = ''; dots.textContent = '';
    var cards = list.map(function (pr, i) {
      var c = el('div', { class: 'pcard' + (pr.hot ? ' hot' : ''), 'aria-hidden': 'true' },
        el('div', { class: 'pc-in' },
          el('span', { class: 'tag', text: pr.tag }),
          el('h3', { text: pr.title }),
          el('p', { text: pr.text }),
          el('img', { class: 'pc-logo', src: 'assets/brand/logotipo-white.png', alt: '' })),
        pr.image ? el('img', { class: 'pc-img', src: pr.image, alt: '' }) : null,
        el('span', { class: 'pc-num', text: pad(i + 1) }));
      track.appendChild(c);
      dots.appendChild(el('i'));
      return c;
    });
    var cur = 0, n = cards.length, rot = 0, timer = null;
    function off(i) { var d = i - cur; if (d > n / 2) d -= n; if (d < -n / 2) d += n; return d; }
    function layout() {
      cards.forEach(function (c, i) {
        var o = off(i), a = Math.abs(o);
        c.style.transform = 'translateX(' + (o * 58) + '%) translateZ(' + (a ? -260 - (a - 1) * 120 : 0) + 'px) rotateY(' + (o === 0 ? 0 : (o < 0 ? 52 : -52)) + 'deg)';
        c.style.opacity = a > 2 ? 0 : (a === 0 ? 1 : 0.7 - (a - 1) * 0.35);
        c.style.zIndex = 10 - a;
        c.classList.toggle('side', a !== 0);
      });
      Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('on', i === cur); });
      wheel.style.backgroundPositionY = rot + 'px';
    }
    function step(d) { cur = (cur + d + n) % n; rot += d * 26; layout(); restart(); }
    function restart() { clearTimeout(timer); timer = setTimeout(function () { step(1); }, 3200); }
    var acc = 0;
    dial.addEventListener('wheel', function (e) {
      e.preventDefault();
      acc += e.deltaY; if (Math.abs(acc) > 60) { step(acc > 0 ? 1 : -1); acc = 0; }
    }, { passive: false });
    var dy = null;
    dial.addEventListener('pointerdown', function (e) { dy = e.clientY; try { dial.setPointerCapture(e.pointerId); } catch (x) {} });
    dial.addEventListener('pointermove', function (e) {
      if (dy == null) return;
      var d = e.clientY - dy; wheel.style.backgroundPositionY = (rot + d) + 'px';
      if (Math.abs(d) > 46) { step(d > 0 ? 1 : -1); dy = e.clientY; }
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) { dial.addEventListener(ev, function () { dy = null; layout(); }); });
    layout(); restart();
    var phrase = ['No inventamos productos', 'Los hacemos deseables', '1 lente ' + fmt(C.unitPrice)].concat((C.packs || []).map(function (k) { return k.units + ' por ' + fmt(k.price); })).concat(['Envío gratis desde ' + C.shipping.freeFromUnits + ' lentes', 'Onda · Precio · Volumen']);
    var mq = $('#mq'); mq.textContent = '';
    for (var r = 0; r < 4; r++) phrase.forEach(function (w) { append(mq, [w, el('i', { text: '✦' })]); });
  }


  /* ================= 02 · TIENDA 3D: hall de puertas + pasillos ================= */
  var Store = null;

  function renderFallback() {
    var fb = $('#storeFallback'); fb.textContent = '';
    CATS.forEach(function (c) {
      append(fb, [el('p', { class: 'eyebrow', style: 'margin-top:30px', text: c.name }),
        el('div', { class: 'fb-grid' }, byCat(c.id).map(function (p) {
          return el('button', { onclick: function () { PV.open(p.id); } }, el('img', { src: p.image, alt: '' }), el('b', { text: p.code + ' · ' + p.name }), el('div', { text: fmt(p.price) }));
        }))]);
    });
  }

  function initStore() {
    var section = $('#tienda'), stage = $('#storeStage'), canvas = $('#storeCanvas');
    var T = window.THREE;
    function fallback() { section.classList.add('nogl'); renderFallback(); return null; }
    if (!T) return fallback();
    var renderer;
    try { renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' }); }
    catch (e) { return fallback(); }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    var BG = 0x060913, H = 3.8;
    var camera = new T.PerspectiveCamera(60, 1, 0.05, 140);
    camera.rotation.order = 'YXZ';
    var maxAniso = renderer.capabilities.getMaxAnisotropy();

    /* --- utilidades de textura --- */
    function ctex(w, h, draw) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = maxAniso;
      return t;
    }
    function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function fitText(g, txt, maxW, size, weight) {
      var s = size; g.font = weight + ' ' + s + 'px Montserrat, sans-serif';
      while (g.measureText(txt).width > maxW && s > 12) { s -= 2; g.font = weight + ' ' + s + 'px Montserrat, sans-serif'; }
      return s;
    }
    function drawLogo(g, key, x, y, w) {
      var im = BRAND[key]; if (!im) return 0;
      var h = w * im.height / im.width; g.drawImage(im, x, y, w, h); return h;
    }
    var loader = new T.TextureLoader();
    var texCache = {}, fitList = [];
    function fitPlane(m, t) {
      var a = (t && t.zAspect) || 0.45;
      m.scale.set(m.userData.w, m.userData.w * a, 1);
      m.userData.base = m.scale.clone();
    }
    function ptex(p) {
      if (!texCache[p.id]) {
        texCache[p.id] = loader.load(tex(p.image), function (t) {
          t.zAspect = t.image.height / t.image.width;
          fitList.forEach(function (m) { if (m.userData.pid === p.id) fitPlane(m, t); });
        });
        texCache[p.id].encoding = T.sRGBEncoding;
        texCache[p.id].anisotropy = maxAniso;
      }
      return texCache[p.id];
    }
    function productPlane(p, w) {
      var t = ptex(p);
      var m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.03, side: T.DoubleSide, toneMapped: false }));
      m.userData = { pid: p.id, w: w };
      fitPlane(m, t.zAspect ? t : null);
      fitList.push(m);
      return m;
    }
    var glowTex = ctex(128, 128, function (g) {
      var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
    var stripGlowTex = ctex(64, 256, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      var v = g.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.15, 'rgba(0,0,0,0)'); v.addColorStop(0.85, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, w, h);
    });

    /* --- entorno para reflejos (metal del carrito, piso brillante) --- */
    var envMap = (function () {
      var pm = new T.PMREMGenerator(renderer);
      var es = new T.Scene();
      es.background = new T.Color(0x0a1020);
      var mk = function (w, h, x, y, z, ry, rx, col) {
        var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: col, side: T.DoubleSide }));
        m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); es.add(m);
      };
      for (var i = -3; i <= 3; i++) mk(0.6, 10, i * 2.2, 5, 0, 0, Math.PI / 2, 0xffffff);
      mk(12, 3, 0, 1.5, -8, 0, 0, 0x2a4a7a); mk(12, 3, 0, 1.5, 8, Math.PI, 0, 0x1a2a48);
      mk(8, 2, -8, 2, 0, Math.PI / 2, 0, 0xff6a2b); mk(8, 2, 8, 2, 0, -Math.PI / 2, 0, 0x4a6fa5);
      var rt = pm.fromScene(es, 0.03);
      pm.dispose();
      return rt.texture;
    })();

    /* --- materiales compartidos --- */
    var M = {
      chrome: new T.MeshStandardMaterial({ color: 0xe8edf5, metalness: 1, roughness: 0.18, envMap: envMap, envMapIntensity: 1.2 }),
      satin: new T.MeshStandardMaterial({ color: 0x2a3550, metalness: 0.7, roughness: 0.35, envMap: envMap }),
      navyGloss: new T.MeshStandardMaterial({ color: 0x0b1b33, metalness: 0.2, roughness: 0.3, envMap: envMap }),
      cream: new T.MeshStandardMaterial({ color: 0xf1eee7, metalness: 0, roughness: 0.4, envMap: envMap, envMapIntensity: 0.4 }),
      orange: new T.MeshStandardMaterial({ color: 0xff6a2b, metalness: 0.1, roughness: 0.35, envMap: envMap, envMapIntensity: 0.5 }),
      dark: new T.MeshStandardMaterial({ color: 0x0c1220, metalness: 0.3, roughness: 0.5, envMap: envMap, envMapIntensity: 0.5 })
    };
    function led(col) { return new T.MeshBasicMaterial({ color: col, toneMapped: false }); }

    function floorMaterial(rx, ry) {
      var t = ctex(1024, 1024, function (g, w, h) {
        g.fillStyle = '#0d1424'; g.fillRect(0, 0, w, h);
        var id = g.getImageData(0, 0, w, h), d = id.data;
        for (var i = 0; i < d.length; i += 4) { var n = (Math.random() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
        g.putImageData(id, 0, 0);
        g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3;
        for (var k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * 512, 0); g.lineTo(k * 512, h); g.stroke(); g.beginPath(); g.moveTo(0, k * 512); g.lineTo(w, k * 512); g.stroke(); }
        g.strokeStyle = 'rgba(255,255,255,.04)'; g.lineWidth = 1;
        for (var q = 0; q <= 2; q++) { g.beginPath(); g.moveTo(q * 512 + 2, 0); g.lineTo(q * 512 + 2, h); g.stroke(); }
      });
      t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry);
      return new T.MeshStandardMaterial({ map: t, color: 0x9aa6bd, roughness: 0.32, metalness: 0.15, envMap: envMap, envMapIntensity: 0.28 });
    }
    function wallMaterial(len, tint) {
      var t = ctex(512, 512, function (g, w, h) {
        g.fillStyle = '#0a1120'; g.fillRect(0, 0, w, h);
        for (var i = 0; i < 8; i++) {
          var gr = g.createLinearGradient(i * 64, 0, i * 64 + 64, 0);
          gr.addColorStop(0, 'rgba(255,255,255,.035)'); gr.addColorStop(0.5, 'rgba(255,255,255,.0)'); gr.addColorStop(1, 'rgba(0,0,0,.35)');
          g.fillStyle = gr; g.fillRect(i * 64, 0, 64, h);
        }
        var v = g.createLinearGradient(0, 0, 0, h);
        v.addColorStop(0, tint || 'rgba(74,111,165,.18)'); v.addColorStop(0.6, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.4)');
        g.fillStyle = v; g.fillRect(0, 0, w, h);
      });
      t.wrapS = T.RepeatWrapping; t.repeat.set(len / 3, 1);
      return new T.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0.1 });
    }
    function ceilingMaterial(rx, ry) {
      var t = ctex(512, 512, function (g, w, h) {
        g.fillStyle = '#05080f'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#0c1322'; g.fillRect(24, 24, w - 48, h - 48);
        g.fillStyle = '#05080f'; g.fillRect(40, 40, w - 80, h - 80);
      });
      t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry);
      return new T.MeshStandardMaterial({ map: t, roughness: 1 });
    }
    function ceilingLight(scene, x, z, len, width) {
      var l = new T.Mesh(new T.BoxGeometry(width || 0.22, 0.04, len), led(0xf2f6ff));
      l.position.set(x, H - 0.03, z); scene.add(l);
      var halo = new T.Mesh(new T.PlaneGeometry((width || 0.22) * 6, len * 1.08), new T.MeshBasicMaterial({ map: stripGlowTex, color: 0x9fb4ff, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false }));
      halo.rotation.x = Math.PI / 2; halo.position.set(x, H - 0.05, z); scene.add(halo);
      var refl = new T.Mesh(new T.PlaneGeometry((width || 0.22) * 4, len * 0.9), new T.MeshBasicMaterial({ map: stripGlowTex, color: 0x6f8fd0, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false }));
      refl.rotation.x = -Math.PI / 2; refl.position.set(x, 0.006, z); scene.add(refl);
    }

    /* --- el carrito en primera persona (común a hall y pasillos) --- */
    var cartG = new T.Group(); camera.add(cartG);
    (function buildCart() {
      function V(x, y, z) { return new T.Vector3(x, y, z); }
      function rod(a, b, r, mat, seg) {
        var v = new T.Vector3().subVectors(b, a), len = v.length();
        var m = new T.Mesh(new T.CylinderGeometry(r, r, len, seg || 14), mat);
        m.position.copy(a).addScaledVector(v, 0.5);
        m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v.normalize());
        cartG.add(m); return m;
      }
      function ball(p, r, mat) { var s = new T.Mesh(new T.SphereGeometry(r, 16, 12), mat); s.position.copy(p); cartG.add(s); return s; }
      var hy = -0.43, hz = -0.74;
      // manija: barra cromada + grip navy + tapas naranjas
      rod(V(-0.52, hy, hz), V(0.52, hy, hz), 0.014, M.chrome);
      rod(V(-0.3, hy, hz), V(0.3, hy, hz), 0.024, M.navyGloss, 24);
      ball(V(-0.3, hy, hz), 0.026, M.orange); ball(V(0.3, hy, hz), 0.026, M.orange);
      var plate = ctex(512, 110, function (g, w, h) {
        g.fillStyle = '#FF6A2B'; rrect(g, 0, 0, w, h, 30); g.fill();
        if (BRAND.logotipo) { var lh = 64, lw = lh * BRAND.logotipo.width / BRAND.logotipo.height; g.drawImage(BRAND.logotipo, (w - lw) / 2, 23, lw, lh); }
      });
      var plateM = new T.Mesh(new T.PlaneGeometry(0.17, 0.037), new T.MeshBasicMaterial({ map: plate, transparent: true, toneMapped: false }));
      plateM.position.set(0, hy + 0.028, hz - 0.01); plateM.rotation.x = -0.95; cartG.add(plateM);
      var rimY = -0.5, bY = -0.9, zA = -1.02, zB = -1.98, rx = 0.47, bx = 0.4;
      [-1, 1].forEach(function (s) {
        rod(V(s * 0.52, hy, hz), V(s * rx, rimY, zA), 0.013, M.chrome);
        rod(V(s * rx, rimY, zA), V(s * rx, rimY, zB), 0.012, M.chrome);
        rod(V(s * rx, rimY, zA), V(s * bx, bY, zA - 0.06), 0.009, M.chrome);
        rod(V(s * rx, rimY, zB), V(s * bx, bY, zB + 0.06), 0.009, M.chrome);
        rod(V(s * bx, bY, zA - 0.06), V(s * bx, bY, zB + 0.06), 0.008, M.chrome);
        ball(V(s * rx, rimY, zA), 0.018, M.orange); ball(V(s * rx, rimY, zB), 0.018, M.orange);
      });
      rod(V(-rx, rimY, zA), V(rx, rimY, zA), 0.012, M.chrome);
      rod(V(-rx, rimY, zB), V(rx, rimY, zB), 0.012, M.chrome);
      // rejilla fina
      var wire = [];
      for (var t = 0; t <= 1.0001; t += 1 / 16) {
        var zz = zA + (zB - zA) * t, zb = zz + 0.06 * (1 - 2 * t);
        wire.push(-rx, rimY, zz, -bx, bY, zb, rx, rimY, zz, bx, bY, zb, -bx, bY, zb, bx, bY, zb);
      }
      for (var u = 0; u <= 1.0001; u += 1 / 14) {
        var xx = -rx + 2 * rx * u, xb = -bx + 2 * bx * u;
        wire.push(xx, rimY, zB, xb, bY, zB + 0.06, xx, rimY, zA, xb, bY, zA - 0.06, xb, bY, zA - 0.06, xb, bY, zB + 0.06);
      }
      for (var hh = 1; hh < 4; hh++) {
        var y = rimY + (bY - rimY) * hh / 4, xr = rx + (bx - rx) * hh / 4, za = zA - 0.06 * hh / 4, zb2 = zB + 0.06 * hh / 4;
        wire.push(-xr, y, za, xr, y, za, -xr, y, zb2, xr, y, zb2, -xr, y, za, -xr, y, zb2, xr, y, za, xr, y, zb2);
      }
      var wg = new T.BufferGeometry(); wg.setAttribute('position', new T.Float32BufferAttribute(wire, 3));
      cartG.add(new T.LineSegments(wg, new T.LineBasicMaterial({ color: 0xc9d3e2, transparent: true, opacity: 0.6 })));
      // placa frontal de la canasta
      var badge = ctex(512, 160, function (g, w, h) {
        g.fillStyle = '#0B1B33'; rrect(g, 0, 0, w, h, 40); g.fill();
        g.strokeStyle = '#FF6A2B'; g.lineWidth = 8; rrect(g, 6, 6, w - 12, h - 12, 34); g.stroke();
        if (BRAND.logotipo) { var lh = 80, lw = lh * BRAND.logotipo.width / BRAND.logotipo.height; g.drawImage(BRAND.logotipo, (w - lw) / 2, 40, lw, lh); }
      });
      var bm = new T.Mesh(new T.PlaneGeometry(0.34, 0.106), new T.MeshBasicMaterial({ map: badge, transparent: true, toneMapped: false }));
      bm.position.set(0, (rimY + bY) / 2 + 0.03, zB + 0.035); cartG.add(bm);
      var cl = new T.PointLight(0xffffff, 0.8, 3, 2); cl.position.set(0, 0.2, -0.8); camera.add(cl);
    })();
    var basket = new T.Group(); cartG.add(basket);
    var drops = [];
    function basketAdd(pid, animate) {
      if (basket.children.length >= 16) return;
      var p = Z.findProduct(pid); if (!p) return;
      var m = productPlane(p, 0.3);
      var n = basket.children.length;
      var ty = -0.8 + Math.floor(n / 5) * 0.05;
      m.rotation.set(-1.1 + Math.random() * 0.3, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6);
      m.position.set(-0.28 + Math.random() * 0.56, animate ? -0.25 : ty, -1.15 - Math.random() * 0.6);
      basket.add(m);
      if (animate) drops.push({ m: m, ty: ty, v: 0 });
    }
    function syncBasket() {
      while (basket.children.length) basket.remove(basket.children[0]);
      cart.forEach(function (i) { for (var q = 0; q < i.qty; q++) basketAdd(i.id, false); });
    }

    /* --- HALL DE PUERTAS --- */
    var DOORS = CATS.map(function (c) { return { id: c.id, name: c.name, active: true }; })
      .concat((C.upcoming || []).map(function (n) { return { id: 'up-' + n, name: n, active: false }; }));
    var hall = (function buildHall() {
      var scene = new T.Scene();
      scene.background = new T.Color(BG);
      scene.fog = new T.Fog(BG, 11, 42);
      var WZ = -6, SPX = 3.3, n = DOORS.length, HH = 5.4;
      // piso y techo del hall: solo hasta la pared (detrás de cada puerta está su pasillo)
      var floor = new T.Mesh(new T.PlaneGeometry(30, 16), floorMaterial(8, 4.3));
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, WZ + 8); scene.add(floor);
      // pared con huecos reales para cada puerta
      var wmat = wallMaterial(30, 'rgba(255,106,43,.08)');
      var DW = 2.2, DH = 3.44, xs = DOORS.map(function (d, i) { return (i - (n - 1) / 2) * SPX; });
      function wallPiece(x0, x1, y0, y1) {
        if (x1 - x0 < 0.001 || y1 - y0 < 0.001) return;
        var m = new T.Mesh(new T.PlaneGeometry(x1 - x0, y1 - y0), wmat);
        m.position.set((x0 + x1) / 2, (y0 + y1) / 2, WZ - 0.1); scene.add(m);
      }
      wallPiece(-15, 15, DH, 8);
      var cx = -15;
      xs.forEach(function (x) { wallPiece(cx, x - DW / 2, 0, DH); cx = x + DW / 2; });
      wallPiece(cx, 15, 0, DH);
      var ceil = new T.Mesh(new T.PlaneGeometry(30, 16), ceilingMaterial(10, 5.6));
      ceil.rotation.x = Math.PI / 2; ceil.position.set(0, HH, WZ + 8); scene.add(ceil);
      for (var k = -3; k <= 3; k++) {
        var st = new T.Mesh(new T.BoxGeometry(0.08, 0.03, 14), led(0xdfe8ff)); st.position.set(k * 2.2, HH - 0.03, -1); scene.add(st);
        var rf = new T.Mesh(new T.PlaneGeometry(0.5, 12), new T.MeshBasicMaterial({ map: stripGlowTex, color: 0x6f8fd0, transparent: true, opacity: 0.12, blending: T.AdditiveBlending, depthWrite: false }));
        rf.rotation.x = -Math.PI / 2; rf.position.set(k * 2.2, 0.006, -1); scene.add(rf);
      }
      // zócalo LED en la pared
      var base = new T.Mesh(new T.BoxGeometry(30, 0.03, 0.03), led(0x4a6fa5)); base.position.set(0, 0.08, WZ - 0.05); scene.add(base);
      // slogan sobre las puertas
      var slog = ctex(2048, 160, function (g, w, h) {
        g.textAlign = 'center'; g.fillStyle = 'rgba(243,241,236,.9)';
        fitText(g, 'NO INVENTAMOS PRODUCTOS. LOS HACEMOS DESEABLES.', w - 80, 84, '900');
        g.fillText('NO INVENTAMOS PRODUCTOS. LOS HACEMOS DESEABLES.', w / 2, 112);
      });
      var slogM = new T.Mesh(new T.PlaneGeometry(12, 0.94), new T.MeshBasicMaterial({ map: slog, transparent: true, toneMapped: false, opacity: 0.16 }));
      slogM.position.set(0, 4.95, WZ - 0.05); scene.add(slogM);
      scene.add(new T.HemisphereLight(0x9fb4ff, 0x080a12, 0.35));
      scene.add(new T.AmbientLight(0xffffff, 0.1));
      scene.environment = null;
      var doors = [], clickable = [];
      DOORS.forEach(function (d, i) {
        var x = (i - (n - 1) / 2) * SPX;
        var edgeCol = d.active ? 0xff6a2b : 0x39414f;
        [[-1.2], [1.2]].forEach(function (f) {
          var post = new T.Mesh(new T.BoxGeometry(0.18, 3.7, 0.34), M.satin); post.position.set(x + f[0], 1.85, WZ); scene.add(post);
          var edge = new T.Mesh(new T.BoxGeometry(0.025, 3.45, 0.02), led(edgeCol)); edge.position.set(x + f[0] * 0.935, 1.73, WZ + 0.18); scene.add(edge);
        });
        var beam = new T.Mesh(new T.BoxGeometry(2.58, 0.2, 0.34), M.satin); beam.position.set(x, 3.6, WZ); scene.add(beam);
        var beamEdge = new T.Mesh(new T.BoxGeometry(2.22, 0.025, 0.02), led(edgeCol)); beamEdge.position.set(x, 3.47, WZ + 0.18); scene.add(beamEdge);
        var lightTex = ctex(256, 400, function (g, w, h) {
          var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, d.active ? '#ffb48a' : '#333');
          g.fillStyle = gr; g.fillRect(0, 0, w, h);
        });
        if (!d.active) { // las puertas "próximamente" no tienen pasillo detrás
          var glowP = new T.Mesh(new T.PlaneGeometry(2.2, 3.44), new T.MeshBasicMaterial({ map: lightTex, toneMapped: false }));
          glowP.position.set(x, 1.72, WZ - 0.3); scene.add(glowP);
        }
        var cat = d.active ? byCat(d.id) : [];
        var feat = cat.filter(function (p) { return p.featured; })[0] || cat[0];
        var face = ctex(640, 1000, function (g, w, h) {
          if (d.active) {
            var gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#163a6b'); gr.addColorStop(1, '#0B1B33');
            g.fillStyle = gr; g.fillRect(0, 0, w, h);
            var rg = g.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, w * 0.7);
            rg.addColorStop(0, hexA(feat ? feat.color : '#4A6FA5', 0.55)); rg.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = rg; g.fillRect(0, 0, w, h);
            g.strokeStyle = 'rgba(243,241,236,.18)'; g.lineWidth = 3; g.strokeRect(26, 26, w - 52, h - 52);
            drawLogo(g, 'logotipo', w / 2 - 110, 70, 220);
            var pim = feat && PIMG[feat.id];
            if (pim) { g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 40; g.shadowOffsetY = 24; var iw = w * 0.86, ih = iw * pim.height / pim.width; g.drawImage(pim, (w - iw) / 2, h * 0.4 - ih / 2, iw, ih); g.restore(); }
            g.fillStyle = '#F3F1EC'; g.textAlign = 'center';
            var fs = fitText(g, d.name.toUpperCase(), w - 90, 80, '900');
            g.fillText(d.name.toUpperCase(), w / 2, h * 0.7);
            g.font = '600 30px Montserrat, sans-serif'; g.fillStyle = 'rgba(243,241,236,.7)';
            g.fillText(cat.length + ' modelos', w / 2, h * 0.7 + fs * 0.7);
            g.fillStyle = '#FF6A2B'; rrect(g, w / 2 - 140, h * 0.83, 280, 80, 40); g.fill();
            g.fillStyle = '#fff'; g.font = '800 32px Montserrat, sans-serif'; g.fillText('ENTRAR  →', w / 2, h * 0.83 + 52);
          } else {
            var g2 = g.createLinearGradient(0, 0, 0, h); g2.addColorStop(0, '#1a1e27'); g2.addColorStop(1, '#0e1117');
            g.fillStyle = g2; g.fillRect(0, 0, w, h);
            g.save(); g.translate(w / 2, h * 0.52); g.rotate(-0.32);
            g.fillStyle = '#FFB400'; g.fillRect(-w, -54, w * 2, 108);
            g.fillStyle = '#12151c'; for (var s = -w; s < w; s += 72) { g.beginPath(); g.moveTo(s, -54); g.lineTo(s + 36, -54); g.lineTo(s - 12, 54); g.lineTo(s - 48, 54); g.fill(); }
            g.restore();
            g.fillStyle = '#F3F1EC'; g.textAlign = 'center'; fitText(g, d.name.toUpperCase(), w - 90, 78, '900');
            g.fillText(d.name.toUpperCase(), w / 2, h * 0.26);
            g.font = '800 36px Montserrat, sans-serif'; g.fillStyle = '#FFB400';
            g.fillText('PRÓXIMAMENTE', w / 2, h * 0.8);
            drawLogo(g, 'isotipo', w / 2 - 50, h * 0.86, 100);
          }
        });
        var sideMat = d.active ? M.navyGloss : M.dark;
        var faceMat = new T.MeshStandardMaterial({ map: face, roughness: 0.35, metalness: 0.1, envMap: envMap, envMapIntensity: 0.35, emissive: 0xffffff, emissiveMap: face, emissiveIntensity: 0.55 });
        var pivot = new T.Group(); pivot.position.set(x - 1.1, 0, WZ + 0.06); scene.add(pivot);
        var panel = new T.Mesh(new T.BoxGeometry(2.2, 3.44, 0.08), [sideMat, sideMat, sideMat, sideMat, faceMat, sideMat]);
        panel.position.set(1.1, 1.72, 0); pivot.add(panel);
        var handle = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.7, 12), M.chrome); handle.position.set(1.95, 1.7, 0.1); pivot.add(handle);
        var sign = ctex(1024, 220, function (g, w, h) {
          g.fillStyle = d.active ? '#0B1B33' : '#12151c'; rrect(g, 0, 0, w, h, 24); g.fill();
          g.strokeStyle = d.active ? 'rgba(255,106,43,.9)' : 'rgba(243,241,236,.15)'; g.lineWidth = 6; rrect(g, 8, 8, w - 16, h - 16, 18); g.stroke();
          g.textAlign = 'center'; g.fillStyle = d.active ? '#7FA3D6' : '#5b6479'; g.font = '700 34px Montserrat, sans-serif';
          g.fillText(d.active ? ('P A S I L L O   0 ' + (i + 1)) : 'P R O N T O', w / 2, 72);
          g.fillStyle = d.active ? '#F3F1EC' : '#8a93a5'; fitText(g, d.name.toUpperCase(), w - 80, 84, '900');
          g.fillText(d.name.toUpperCase(), w / 2, 166);
        });
        var signM = new T.Mesh(new T.PlaneGeometry(2.6, 0.56), new T.MeshBasicMaterial({ map: sign, transparent: true, toneMapped: false }));
        signM.position.set(x, 4.15, WZ + 0.02); scene.add(signM);
        var mat = new T.Mesh(new T.PlaneGeometry(2.8, 1.8), new T.MeshBasicMaterial({ map: glowTex, color: new T.Color(d.active ? 0xff6a2b : 0x39414f), transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false }));
        mat.rotation.x = -Math.PI / 2; mat.position.set(x, 0.01, WZ + 0.9); scene.add(mat);
        if (d.active) { var L = new T.PointLight(0xffe2cc, 1.2, 7, 2); L.position.set(x, 4.2, WZ + 1.8); scene.add(L); }
        panel.userData = { door: i };
        clickable.push(panel);
        doors.push({ d: d, x: x, pivot: pivot, open: 0, target: 0, shake: 0 });
      });
      // Todo el hall en un grupo, y una COPIA idéntica que se usa para el loop sin cortes:
      // al salir por la puerta del fondo del pasillo se entra a esta copia, y al llegar al
      // mismo punto de vista se cambia al hall real (se ve exactamente igual).
      var root = new T.Group();
      scene.children.slice().forEach(function (c) { if (!(c.isHemisphereLight || c.isAmbientLight)) root.add(c); });
      scene.add(root);
      var copy = root.clone(); copy.visible = false; scene.add(copy);
      return { scene: scene, doors: doors, clickable: clickable, WZ: WZ, copy: copy };
    })();

    /* --- PÓSTER de cada tótem (01, 02, 03…) --- */
    function posterTexture(p, num) {
      return ctex(768, 1152, function (g, w, h) {
        var base = g.createLinearGradient(0, 0, 0, h);
        base.addColorStop(0, '#0f1e38'); base.addColorStop(1, '#060a14');
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        // banda diagonal de color
        g.save(); g.translate(w / 2, h * 0.42); g.rotate(-0.42);
        var band = g.createLinearGradient(-w, 0, w, 0);
        band.addColorStop(0, hexA(p.color, 0)); band.addColorStop(0.5, hexA(p.color, 0.55)); band.addColorStop(1, hexA(p.color, 0));
        g.fillStyle = band; g.fillRect(-w * 1.2, -150, w * 2.4, 300);
        g.fillStyle = 'rgba(255,106,43,.9)'; g.fillRect(-w * 1.2, 168, w * 2.4, 10);
        g.restore();
        var rg = g.createRadialGradient(w / 2, h * 0.42, 20, w / 2, h * 0.42, w * 0.7);
        rg.addColorStop(0, hexA(p.color, 0.45)); rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg; g.fillRect(0, 0, w, h);
        // número gigante
        g.textAlign = 'right'; g.font = '900 330px Montserrat, sans-serif';
        g.lineWidth = 3; g.strokeStyle = 'rgba(243,241,236,.28)'; g.strokeText(pad(num), w - 30, 330);
        // logo + código
        g.textAlign = 'left'; drawLogo(g, 'logotipo', 48, 56, 190);
        g.font = '700 22px Montserrat, sans-serif'; g.fillStyle = 'rgba(243,241,236,.6)';
        g.fillText(p.code + '  ·  ' + catName(p.category).toUpperCase(), 48, 132);
        // producto
        var im = PIMG[p.id];
        if (im) { g.save(); g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 60; g.shadowOffsetY = 40; var iw = w * 0.94, ih = iw * im.height / im.width; g.drawImage(im, (w - iw) / 2, h * 0.47 - ih / 2, iw, ih); g.restore(); }
        // nombre + precio
        g.fillStyle = '#F3F1EC';
        var fs = fitText(g, p.name.toUpperCase(), w - 96, 120, '900');
        g.fillText(p.name.toUpperCase(), 48, h * 0.78);
        g.font = '500 24px Montserrat, sans-serif'; g.fillStyle = 'rgba(243,241,236,.7)';
        g.fillText('Lentes de sol · ' + catName(p.category), 48, h * 0.78 + 44);
        g.fillStyle = '#FF6A2B'; rrect(g, 48, h * 0.86, 290, 86, 43); g.fill();
        g.fillStyle = '#fff'; g.font = '800 44px Montserrat, sans-serif'; g.fillText(fmt(p.price), 76, h * 0.86 + 58);
        var best = (C.packs || [])[0];
        g.font = '800 26px Montserrat, sans-serif'; g.fillStyle = '#F3F1EC'; g.textAlign = 'right';
        if (best) g.fillText(best.units + ' por ' + fmt(best.price), w - 48, h * 0.86 + 40);
        g.font = '500 18px Montserrat, sans-serif'; g.fillStyle = 'rgba(243,241,236,.6)';
        g.fillText('mezclando modelos', w - 48, h * 0.86 + 66);
        g.strokeStyle = 'rgba(243,241,236,.18)'; g.lineWidth = 3; g.strokeRect(18, 18, w - 36, h - 36);
      });
    }

    /* --- PASILLO por categoría --- */
    var aisles = {};
    function buildAisle(catId) {
      var scene = new T.Group(); // el pasillo vive en el mismo mundo que el hall, detrás de su puerta
      var HALF = 2.8, SP = 5.6, Z0 = -5;
      var list = byCat(catId);
      var picks = list.filter(function (p) { return p.featured; });
      list.forEach(function (p) { if (picks.length < 8 && picks.indexOf(p) < 0) picks.push(p); });
      var stations = picks.map(function (p, k) { return { z: Z0 - k * SP, side: k % 2 ? 1 : -1, p: p }; });
      var N = stations.length;
      var zEnd = stations[N - 1].z - 9, zFront = 8;
      var LEN = zFront - zEnd, zMid = (zFront + zEnd) / 2;
      var clickable = [], floaters = [], shelfIdx = 0;

      var floor = new T.Mesh(new T.PlaneGeometry(HALF * 2, LEN), floorMaterial(1.4, LEN / 4));
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, zMid); scene.add(floor);
      // alfombra central con el isotipo
      var runTex = ctex(256, 512, function (g, w, h) {
        g.fillStyle = '#0b1b33'; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(255,106,43,.9)'; g.lineWidth = 6; g.beginPath(); g.moveTo(10, 0); g.lineTo(10, h); g.moveTo(w - 10, 0); g.lineTo(w - 10, h); g.stroke();
        g.globalAlpha = 0.12; drawLogo(g, 'isotipo', w / 2 - 60, h / 2 - 30, 120); g.globalAlpha = 1;
      });
      runTex.wrapT = T.RepeatWrapping; runTex.repeat.set(1, LEN / 2.2);
      var runner = new T.Mesh(new T.PlaneGeometry(1.5, LEN), new T.MeshStandardMaterial({ map: runTex, roughness: 0.9 }));
      runner.rotation.x = -Math.PI / 2; runner.position.set(0, 0.004, zMid); scene.add(runner);
      var ceil = new T.Mesh(new T.PlaneGeometry(HALF * 2, LEN), ceilingMaterial(2, LEN / 2.8));
      ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, zMid); scene.add(ceil);
      var wm = wallMaterial(LEN);
      [-1, 1].forEach(function (s) {
        var w = new T.Mesh(new T.PlaneGeometry(LEN, H), wm);
        w.rotation.y = -s * Math.PI / 2; w.position.set(s * HALF, H / 2, zMid); scene.add(w);
        var base = new T.Mesh(new T.BoxGeometry(0.03, 0.03, LEN), led(0x4a6fa5)); base.position.set(s * (HALF - 0.03), 0.07, zMid); scene.add(base);
        var top = new T.Mesh(new T.BoxGeometry(0.03, 0.03, LEN), led(0xff6a2b)); top.position.set(s * (HALF - 0.03), H - 0.35, zMid); scene.add(top);
        var cove = new T.Mesh(new T.PlaneGeometry(LEN, 0.8), new T.MeshBasicMaterial({ map: glowTex, color: 0xff6a2b, transparent: true, opacity: 0.12, blending: T.AdditiveBlending, depthWrite: false }));
        cove.rotation.y = -s * Math.PI / 2; cove.position.set(s * (HALF - 0.02), H - 0.35, zMid); scene.add(cove);
      });
      for (var cz = zFront - 2; cz > zEnd + 1; cz -= SP) ceilingLight(scene, 0, cz, 3.4, 0.24);
      // pared de entrada (vista desde adentro) con el hueco de la puerta
      var fw = wallMaterial(6);
      [[-HALF, -1.1, 0, 3.44], [1.1, HALF, 0, 3.44], [-HALF, HALF, 3.44, H]].forEach(function (r) {
        var m = new T.Mesh(new T.PlaneGeometry(r[1] - r[0], r[3] - r[2]), fw);
        m.rotation.y = Math.PI; m.position.set((r[0] + r[1]) / 2, (r[2] + r[3]) / 2, zFront); scene.add(m);
      });

      stations.forEach(function (st, i) {
        var s = st.side, p = st.p, z = st.z;
        // TÓTEM
        var totem = new T.Group();
        totem.position.set(s * 2.1, 0, z - 0.2);
        totem.rotation.y = -s * 1.05;
        scene.add(totem);
        var plinth = new T.Mesh(new T.BoxGeometry(1.3, 0.14, 0.5), M.satin); plinth.position.y = 0.07; totem.add(plinth);
        var plLed = new T.Mesh(new T.BoxGeometry(1.3, 0.02, 0.02), led(new T.Color(p.color))); plLed.position.set(0, 0.14, 0.26); totem.add(plLed);
        var body = new T.Mesh(new T.BoxGeometry(1.18, 2.9, 0.16), M.navyGloss); body.position.y = 1.6; totem.add(body);
        var poster = posterTexture(p, i + 1);
        var face = new T.Mesh(new T.PlaneGeometry(1.1, 1.65), new T.MeshBasicMaterial({ map: poster, toneMapped: false }));
        face.position.set(0, 1.62, 0.081); face.userData = { pid: p.id }; totem.add(face); clickable.push(face);
        [-1, 1].forEach(function (k) {
          var e = new T.Mesh(new T.BoxGeometry(0.02, 2.9, 0.02), led(0xff6a2b)); e.position.set(k * 0.6, 1.6, 0.07); totem.add(e);
        });
        var cap = new T.Mesh(new T.BoxGeometry(1.22, 0.06, 0.2), M.chrome); cap.position.y = 3.08; totem.add(cap);
        var hl = new T.Mesh(new T.PlaneGeometry(2.2, 2.2), new T.MeshBasicMaterial({ map: glowTex, color: new T.Color(p.color), transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false }));
        hl.rotation.x = -Math.PI / 2; hl.position.set(0, 0.01, 0.7); totem.add(hl);

        // pedestal redondo con el lente flotando
        var px = s * 1.35;
        var ped = new T.Mesh(new T.CylinderGeometry(0.34, 0.38, 0.95, 40), M.cream);
        ped.position.set(px, 0.475, z + 0.6); ped.userData = { pid: p.id }; scene.add(ped); clickable.push(ped);
        var ring = new T.Mesh(new T.TorusGeometry(0.345, 0.012, 8, 48), led(new T.Color(p.color)));
        ring.rotation.x = Math.PI / 2; ring.position.set(px, 0.955, z + 0.6); scene.add(ring);
        var glow = new T.Mesh(new T.PlaneGeometry(1.4, 1.4), new T.MeshBasicMaterial({ map: glowTex, color: new T.Color(p.color), transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false }));
        glow.rotation.x = -Math.PI / 2; glow.position.set(px, 0.962, z + 0.6); scene.add(glow);
        var beam = new T.Mesh(new T.CylinderGeometry(0.3, 0.34, 1.1, 32, 1, true), new T.MeshBasicMaterial({ color: new T.Color(p.color), transparent: true, opacity: 0.07, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
        beam.position.set(px, 1.5, z + 0.6); scene.add(beam);
        var tag = ctex(512, 200, function (g) {
          g.fillStyle = '#0B1B33'; rrect(g, 0, 0, 512, 200, 30); g.fill();
          g.fillStyle = '#7FA3D6'; g.font = '700 26px Montserrat, sans-serif'; g.fillText(pad(i + 1) + ' · ' + p.code, 30, 50);
          g.fillStyle = '#F3F1EC'; fitText(g, p.name.toUpperCase(), 452, 50, '900'); g.fillText(p.name.toUpperCase(), 30, 110);
          g.fillStyle = '#FF6A2B'; g.font = '800 46px Montserrat, sans-serif'; g.fillText(fmt(p.price), 30, 170);
        });
        var tagM = new T.Mesh(new T.PlaneGeometry(0.5, 0.195), new T.MeshBasicMaterial({ map: tag, transparent: true, toneMapped: false }));
        tagM.position.set(px, 0.62, z + 0.6 + 0.37); tagM.userData = { pid: p.id }; scene.add(tagM); clickable.push(tagM);

        var prod = productPlane(p, 1.05);
        prod.position.set(px, 1.5, z + 0.6);
        prod.rotation.y = -s * 0.45;
        prod.userData.baseY = 1.5; prod.userData.baseRot = -s * 0.45; prod.userData.phase = i * 0.9;
        scene.add(prod); clickable.push(prod); floaters.push(prod);

        var light = new T.PointLight(0xffffff, 1.3, 7, 2);
        light.position.set(s * 1.1, 3.0, z + 1.2); scene.add(light);

        // estantería retroiluminada enfrente
        var o = -s;
        var back = ctex(512, 256, function (g, w, h) {
          var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1b3560'); gr.addColorStop(1, '#0a1428');
          g.fillStyle = gr; g.fillRect(0, 0, w, h);
          var rg = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.6); rg.addColorStop(0, 'rgba(159,180,255,.25)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = rg; g.fillRect(0, 0, w, h);
        });
        var bp = new T.Mesh(new T.PlaneGeometry(4.7, 2.0), new T.MeshBasicMaterial({ map: back, toneMapped: false }));
        bp.rotation.y = -o * Math.PI / 2; bp.position.set(o * (HALF - 0.04), 1.55, z); scene.add(bp);
        var frame = new T.Mesh(new T.BoxGeometry(0.06, 2.12, 4.82), M.satin); frame.position.set(o * (HALF - 0.02), 1.55, z); scene.add(frame);
        var shelfHead = ctex(1024, 96, function (g, w, h) {
          g.fillStyle = '#0B1B33'; g.fillRect(0, 0, w, h);
          g.fillStyle = '#F3F1EC'; g.font = '800 44px Montserrat, sans-serif'; g.textAlign = 'center';
          g.fillText(catName(catId).toUpperCase() + '  ·  ' + list.length + ' MODELOS', w / 2, 64);
        });
        var sh = new T.Mesh(new T.PlaneGeometry(4.7, 0.44), new T.MeshBasicMaterial({ map: shelfHead, toneMapped: false }));
        sh.rotation.y = -o * Math.PI / 2; sh.position.set(o * (HALF - 0.05), 2.8, z); scene.add(sh);
        [0.85, 1.45, 2.05].forEach(function (y) {
          var board = new T.Mesh(new T.BoxGeometry(0.42, 0.035, 4.6), M.cream);
          board.position.set(o * (HALF - 0.23), y, z); scene.add(board);
          var edge = new T.Mesh(new T.BoxGeometry(0.01, 0.012, 4.6), led(0xff6a2b));
          edge.position.set(o * (HALF - 0.44), y + 0.012, z); scene.add(edge);
          for (var c = 0; c < 5; c++) {
            var pp = list[shelfIdx++ % list.length];
            var m = productPlane(pp, 0.62);
            m.position.set(o * (HALF - 0.28), y + 0.17, z - 1.8 + c * 0.9);
            m.rotation.y = -o * 0.97;
            scene.add(m); clickable.push(m);
          }
        });
      });

      var ci = CATS.map(function (c) { return c.id; }).indexOf(catId) + 1;
      var sign = ctex(1400, 280, function (g, w, h) {
        g.fillStyle = '#0B1B33'; rrect(g, 0, 0, w, h, 30); g.fill();
        g.strokeStyle = '#FF6A2B'; g.lineWidth = 6; rrect(g, 10, 10, w - 20, h - 20, 22); g.stroke();
        g.fillStyle = '#7FA3D6'; g.font = '700 40px Montserrat, sans-serif'; g.textAlign = 'center';
        g.fillText(('PASILLO 0' + ci + '  ·  LENTES').split('').join(' '), w / 2, 92);
        g.fillStyle = '#F3F1EC'; fitText(g, catName(catId).toUpperCase(), w - 100, 120, '900');
        g.fillText(catName(catId).toUpperCase(), w / 2, 214);
      });
      var signM = new T.Mesh(new T.PlaneGeometry(4.4, 0.88), new T.MeshBasicMaterial({ map: sign, transparent: true, toneMapped: false }));
      signM.position.set(0, H - 0.72, Z0 + 3); scene.add(signM);
      [-1, 1].forEach(function (k) { var c = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.3, 6), M.chrome); c.position.set(k * 2, H - 0.13, Z0 + 3); scene.add(c); });

      var endTex = ctex(1400, 280, function (g, w, h) {
        g.textAlign = 'center';
        if (BRAND.logotipo) { var lw = 360, lh = lw * BRAND.logotipo.height / BRAND.logotipo.width; g.drawImage(BRAND.logotipo, (w - lw) / 2, 30, lw, lh); }
        g.font = '800 40px Montserrat, sans-serif'; g.fillStyle = '#FF6A2B';
        g.fillText('NO INVENTAMOS PRODUCTOS. LOS HACEMOS DESEABLES.', w / 2, 220);
      });
      // pared del fondo con hueco real para la puerta de salida
      var EW0 = 1.9 / 2 + 0.16, EH0 = 2.75 + 0.16;
      [[-HALF, -EW0, 0, H], [EW0, HALF, 0, H], [-EW0, EW0, EH0, H]].forEach(function (r) {
        var m = new T.Mesh(new T.PlaneGeometry(r[1] - r[0], r[3] - r[2]), wm);
        m.position.set((r[0] + r[1]) / 2, (r[2] + r[3]) / 2, zEnd); scene.add(m);
      });
      var endM = new T.Mesh(new T.PlaneGeometry(2.8, 0.2 * 2.8), new T.MeshBasicMaterial({ map: endTex, transparent: true, toneMapped: false }));
      endM.position.set(0, H - 0.4, zEnd + 0.03); scene.add(endM);
      // PUERTA DE SALIDA: vuelve a la elección de puertas (loop)
      var EW = 1.9, EH = 2.75, ez = zEnd + 0.08;
      [[-EW / 2 - 0.08, EH / 2 + 0.04, 0.16, EH + 0.08], [EW / 2 + 0.08, EH / 2 + 0.04, 0.16, EH + 0.08], [0, EH + 0.08, EW + 0.32, 0.16]].forEach(function (f) {
        var fr = new T.Mesh(new T.BoxGeometry(f[2], f[3], 0.22), M.satin); fr.position.set(f[0], f[1], ez); scene.add(fr);
      });
      var exEdge = new T.Mesh(new T.BoxGeometry(EW + 0.04, 0.025, 0.02), led(0xff6a2b)); exEdge.position.set(0, EH + 0.005, ez + 0.12); scene.add(exEdge);
      var exTex = ctex(560, 800, function (g, w, h) {
        var gg = g.createLinearGradient(0, 0, 0, h); gg.addColorStop(0, '#FF7A3D'); gg.addColorStop(1, '#c23f12');
        g.fillStyle = gg; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 4; g.strokeRect(22, 22, w - 44, h - 44);
        drawLogo(g, 'isotipo', w / 2 - 60, 90, 120);
        g.fillStyle = '#fff'; g.textAlign = 'center';
        g.font = '900 150px Montserrat, sans-serif'; g.fillText('↻', w / 2, 400);
        fitText(g, 'VOLVER A', w - 80, 64, '900'); g.fillText('VOLVER A', w / 2, 520);
        fitText(g, 'LAS PUERTAS', w - 80, 64, '900'); g.fillText('LAS PUERTAS', w / 2, 590);
        g.font = '600 26px Montserrat, sans-serif'; g.fillStyle = 'rgba(255,255,255,.85)';
        g.fillText('Elegí otro pasillo', w / 2, 660);
      });
      var exPivot = new T.Group(); exPivot.position.set(-EW / 2, 0, ez + 0.02); scene.add(exPivot);
      var exMat = new T.MeshStandardMaterial({ map: exTex, emissive: 0xffffff, emissiveMap: exTex, emissiveIntensity: 0.6, roughness: 0.4 });
      var exPanel = new T.Mesh(new T.BoxGeometry(EW, EH, 0.06), [M.dark, M.dark, M.dark, M.dark, exMat, M.dark]);
      exPanel.position.set(EW / 2, EH / 2, 0); exPanel.userData = { exit: true }; exPivot.add(exPanel); clickable.push(exPanel);
      var exGlow = new T.Mesh(new T.PlaneGeometry(3, 2), new T.MeshBasicMaterial({ map: glowTex, color: 0xff6a2b, transparent: true, opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false }));
      exGlow.rotation.x = -Math.PI / 2; exGlow.position.set(0, 0.012, zEnd + 1); scene.add(exGlow);
      var exit = { pivot: exPivot, open: 0, target: 0 };

      var door = hall.doors.filter(function (d) { return d.d.id === catId; })[0];
      var offX = door ? door.x : 0, offZ = hall.WZ - 0.12 - zFront;
      scene.position.set(offX, 0, offZ);
      scene.visible = false;
      hall.scene.add(scene);
      stations.forEach(function (st) { st.wz = st.z + offZ; });
      return { cat: catId, group: scene, door: door, exit: exit, zEnd: zEnd, offX: offX, offZ: offZ, stations: stations, N: N, Z0: Z0, CAM_START: 4, CAM_END: zEnd + 4.6, clickable: clickable, floaters: floaters };
    }

    /* --- estado: un solo mundo, recorrido continuo con el scroll (sin cortes) --- */
    var world = hall.scene; world.add(camera);
    var cur = null, visible = false, paused = false, busy = false, domMode = '';
    var phase = 0, last = performance.now();
    var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    var anim = null; // scroll animado {from, to, t0, dur}
    var hudBar = $('#hudBar'), hudCount = $('#hudCount'), hudHint = $('#hudHint'), hudCat = $('#hudCat'), hudAisle = $('#hudAisle'), endEl = $('#aisleEnd');
    var HALL_CAM = new T.Vector3(0, 1.95, 6.2);
    var camPos = HALL_CAM.clone(), camTarget = new T.Vector3();
    var ENTRY = 1.0;   // pantallas de scroll: de las puertas al inicio del pasillo
    var HOLD_A = 0.4;  // pausa al entrar al pasillo
    var HOLD_B = 0.9;  // pausa al final, frente a la puerta de salida
    var exiting = null; // animación de salida por la puerta del fondo (loop a las puertas)
    var fadeEl = $('#fade');
    camera.position.copy(HALL_CAM);

    // MODO INMERSIVO: al abrir una puerta la página queda "trabada" en la tienda.
    // La rueda del mouse / teclado mueven el carrito (scroll virtual), no la página.
    // Se sale solo cruzando una puerta: volviendo por la de entrada o por la naranja del fondo.
    var vs = 0, locked = false, overEnd = 0, overStart = 0, hintT = null, holdLeft = 0;
    function sectionTop() { return section.getBoundingClientRect().top + window.scrollY; }
    function entryPx() { return window.innerHeight * ENTRY; }
    function aislePx() { return cur ? cur.N * 0.8 * window.innerHeight : 1; }
    function totalPx() { return cur ? window.innerHeight * (ENTRY + HOLD_A + HOLD_B) + aislePx() : 1; }
    function scrollIn() { return cur ? vs : 0; }
    function setHeight() { section.style.height = '100vh'; }
    function lock() {
      if (locked) return;
      locked = true; overEnd = 0; overStart = 0;
      window.scrollTo(0, sectionTop());
      document.documentElement.classList.add('zl-locked');
    }
    var unlockedAt = 0;
    function unlock() {
      locked = false; unlockedAt = performance.now();
      document.documentElement.classList.remove('zl-locked');
    }
    function setDomMode(m) {
      if (m === domMode) return;
      domMode = m;
      section.setAttribute('data-mode', m);
      $('#storeAux').textContent = m === 'hall' || !cur ? 'Elegí tu pasillo' : catName(cur.cat);
    }
    function animVs(to, dur, cb) { anim = { from: vs, to: to, t0: performance.now(), dur: dur || 1500, cb: cb }; }

    // rueda / teclado mientras está trabado
    function push(delta) {
      if (!locked || !cur || exiting || busy || anim || PV.isOpen()) return;
      var tot = totalPx();
      if (vs >= tot - 1 && delta > 0) { overEnd += delta; if (overEnd > window.innerHeight * 0.45) exitLoop(); return; }
      if (vs <= 1 && delta < 0) { overStart -= delta; if (overStart > window.innerHeight * 0.25) leaveByEntrance(); return; }
      overEnd = 0; overStart = 0;
      vs = Math.max(0, Math.min(tot, vs + delta));
    }
    window.addEventListener('wheel', function (e) {
      if (!locked) {
        if (performance.now() - unlockedAt < 800) { e.preventDefault(); return; } // pausa al salir: no "vuela" la página
        // PARADA en la tienda: al pasar scrolleando (bajando o subiendo) la página se frena
        // en el hall de puertas y hay que girar ~2 clicks más para seguir.
        if (PV.isOpen() || e.target.closest('.pv,.modal,.pcf-dial')) return;
        var top = section.getBoundingClientRect().top, vh = window.innerHeight, dy = e.deltaY;
        if (Math.abs(top) <= 2) {
          if (holdLeft > 0) { e.preventDefault(); holdLeft -= Math.min(Math.abs(dy), 120); }
          return;
        }
        if ((dy > 0 && top > 0 && top < vh * 0.9) || (dy < 0 && top < 0 && top > -vh * 0.9)) {
          e.preventDefault();
          holdLeft = 180; // ≈ 2 clicks de rueda
          window.scrollTo({ top: sectionTop(), behavior: 'smooth' });
        } else holdLeft = 0;
        return;
      }
      if (PV.isOpen() || e.target.closest('.pv,.modal')) return;
      e.preventDefault();
      var d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1);
      push(Math.max(-220, Math.min(220, d)));
    }, { passive: false });
    window.addEventListener('keydown', function (e) {
      if (!locked || PV.isOpen() || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      var k = e.key, step = window.innerHeight * 0.18;
      if (k === 'ArrowDown' || k === 'PageDown' || k === ' ') { e.preventDefault(); push(k === 'ArrowDown' ? step : step * 2.5); }
      else if (k === 'ArrowUp' || k === 'PageUp') { e.preventDefault(); push(k === 'ArrowUp' ? -step : -step * 2.5); }
      else if (k === 'Home' || k === 'End') e.preventDefault();
    });

    function selectAisle(catId) {
      var a = aisles[catId] || (aisles[catId] = buildAisle(catId));
      if (cur && cur !== a) cur.group.visible = false;
      cur = a; a.group.visible = true;
      hudCat.textContent = catName(catId).toUpperCase();
      hudAisle.textContent = 'Pasillo 0' + (CATS.map(function (c) { return c.id; }).indexOf(catId) + 1) + ' · Lentes';
      hall.doors.forEach(function (d) { d.target = d === a.door ? -1.75 : 0; });
      vs = 0;
      return a;
    }
    function goIn(delay) {
      busy = true;
      setTimeout(function () { busy = false; animVs(entryPx() + 4, 2000); }, delay || 0);
    }
    function openDoor(i) {
      var d = hall.doors[i]; if (!d || busy) return;
      if (!d.d.active) { d.shake = 1; return; }
      tip.classList.remove('on');
      lock();
      if (cur && cur.door === d) { goIn(0); return; }
      selectAisle(d.d.id); goIn(350);
    }
    function enterAisle(catId) {
      var i = -1;
      hall.doors.forEach(function (d, k) { if (d.d.id === catId) i = k; });
      if (i < 0) return;
      window.scrollTo(0, sectionTop());
      if (cur && cur.cat === catId) { lock(); vs = entryPx() + 4; return; }
      openDoor(i);
    }
    // Se retrocede hasta las puertas: la puerta se cierra y se libera la página.
    function closeAisle() {
      if (!cur) return;
      var old = cur;
      old.door.target = 0;
      cur = null; vs = 0; anim = null;
      setTimeout(function () { if (cur !== old) old.group.visible = false; }, 900);
      setDomMode('hall');
      unlock();
    }
    function leaveByEntrance() { if (!exiting) animVs(0, 700, closeAisle); }
    // Salida rápida (checkout / menú): cierra todo sin animación larga.
    function release() {
      if (exiting) { exiting = null; hall.copy.visible = false; }
      if (cur) {
        var old = cur;
        old.exit.target = 0; old.exit.open = 0; old.exit.pivot.rotation.y = 0;
        old.door.target = 0; old.door.open = 0; old.door.pivot.rotation.y = 0;
        old.group.visible = false;
      }
      cur = null; vs = 0; anim = null;
      camTarget.copy(HALL_CAM); camPos.copy(HALL_CAM); camera.position.copy(HALL_CAM);
      setDomMode('hall'); endEl.classList.remove('on');
      unlock();
    }
    // Loop: cruzar la puerta del fondo y volver a la elección de puertas.
    function exitLoop() {
      if (!cur || exiting) return;
      anim = null;
      var exitZ = cur.offZ + cur.zEnd;
      hall.copy.position.set(cur.offX, 0, exitZ - 0.05 - 10);
      hall.copy.visible = true;
      exiting = { t0: performance.now(), z0: camPos.z, x0: camPos.x, y0: camPos.y, endZ: hall.copy.position.z + HALL_CAM.z };
      cur.exit.target = -1.75;
      endEl.classList.remove('on');
    }
    function finishLoop() {
      var old = cur;
      old.exit.target = 0; old.exit.open = 0; old.exit.pivot.rotation.y = 0;
      old.door.target = 0; old.door.open = 0; old.door.pivot.rotation.y = 0;
      old.group.visible = false;
      hall.copy.visible = false;
      cur = null; vs = 0;
      camTarget.set(HALL_CAM.x + mouse.x * 0.35, HALL_CAM.y, HALL_CAM.z);
      camPos.copy(camTarget); camera.position.copy(camTarget);
      setDomMode('hall');
      exiting = null;
      unlock();
    }
    function showHall() {
      if (!cur) { window.scrollTo(0, sectionTop()); return; }
      animVs(0, Math.min(2800, 900 + vs * 0.25), closeAisle);
    }

    // puertas accesibles (botones)
    var hd = $('#hallDoors');
    DOORS.forEach(function (d, i) {
      hd.appendChild(el('button', { disabled: !d.active, text: d.active ? d.name : d.name + ' · pronto', onclick: function () { openDoor(i); } }));
    });
    $('#hudBack').addEventListener('click', showHall);
    $('#endBack').addEventListener('click', exitLoop);
    $('#endCheckout').addEventListener('click', goCheckout);

    /* --- interacción --- */
    var ray = new T.Raycaster(), ndc = new T.Vector2(), hovered = null;
    var tip = $('#tip');
    function inHall() { return !cur || scrollIn() < entryPx() * 0.5; }
    function targets() { return inHall() ? hall.clickable : cur.clickable; }
    stage.addEventListener('pointermove', function (e) {
      var r = stage.getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      mouse.tx = ndc.x; mouse.ty = ndc.y;
      if (busy || anim || exiting) return;
      ray.setFromCamera(ndc, camera);
      var hit = ray.intersectObjects(targets(), false)[0];
      var obj = hit && hit.distance < 16 ? hit.object : null;
      if (obj !== hovered) {
        if (hovered && hovered.userData.base) hovered.scale.copy(hovered.userData.base);
        hovered = obj;
        stage.style.cursor = obj ? 'pointer' : '';
        if (obj && obj.userData.pid) {
          var p = Z.findProduct(obj.userData.pid);
          tip.querySelector('small').textContent = p.code;
          tip.querySelector('b').textContent = p.name;
          tip.querySelector('span').textContent = fmt(p.price);
          tip.querySelector('em').textContent = 'Click para ver';
          tip.classList.add('on');
        } else if (obj && obj.userData.door != null) {
          var dd = DOORS[obj.userData.door];
          tip.querySelector('small').textContent = dd.active ? 'PASILLO' : 'PRÓXIMAMENTE';
          tip.querySelector('b').textContent = dd.name;
          tip.querySelector('span').textContent = dd.active ? byCat(dd.id).length + ' modelos' : '';
          tip.querySelector('em').textContent = dd.active ? 'Click para entrar' : 'Muy pronto en ZALUVO';
          tip.classList.add('on');
        } else if (obj && obj.userData.exit) {
          tip.querySelector('small').textContent = 'SALIDA';
          tip.querySelector('b').textContent = 'Volver a las puertas';
          tip.querySelector('span').textContent = '';
          tip.querySelector('em').textContent = 'Click para elegir otro pasillo';
          tip.classList.add('on');
        } else tip.classList.remove('on');
      }
      if (obj) { tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px'; }
    });
    stage.addEventListener('pointerleave', function () { mouse.tx = 0; mouse.ty = 0; tip.classList.remove('on'); });
    stage.addEventListener('click', function (e) {
      if (!hovered || busy || e.target.closest('button,.mini')) return;
      tip.classList.remove('on');
      if (hovered.userData.exit) exitLoop();
      else if (hovered.userData.door != null) openDoor(hovered.userData.door);
      else if (hovered.userData.pid) PV.open(hovered.userData.pid);
    });

    /* --- loop --- */
    function resize() {
      var w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      
    }
    window.addEventListener('resize', resize); resize();
    setHeight();
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }, { rootMargin: '100px' }).observe(section);
    function ease(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
    function smooth(k) { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); }

    function frame(now) {
      requestAnimationFrame(frame);
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (anim) {
        var ka = Math.min(1, (now - anim.t0) / anim.dur);
        vs = anim.from + (anim.to - anim.from) * ease(ka);
        if (ka >= 1) { var cb = anim.cb; anim = null; if (cb) cb(); }
      }
      if (locked && Math.abs(section.getBoundingClientRect().top) > 1) window.scrollTo(0, sectionTop());
      if (!visible || paused) return;
      var tt = now / 1000;
      mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 3);
      mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 3);

      var s = cur ? scrollIn() : 0, e = entryPx(), vh = window.innerHeight;
      var tEntry = cur ? Math.min(1, s / e) : 0; // 0 = frente a las puertas, 1 = inicio del pasillo
      var u = cur && s > e + HOLD_A * vh ? Math.min(1, (s - e - HOLD_A * vh) / aislePx()) : 0; // con pausa al entrar y al final
      var look = smooth((tEntry - 0.35) / 0.65); // cuánto "mira" como en el pasillo
      setDomMode(!cur || tEntry < 0.55 ? 'hall' : 'aisle');

      // puertas
      hall.doors.forEach(function (d) {
        var hov = hovered && hovered.userData.door != null && hall.doors[hovered.userData.door] === d;
        var tg = d.target || (hov && d.d.active ? -0.28 : 0);
        d.open += (tg - d.open) * Math.min(1, dt * 2.6);
        d.shake = Math.max(0, d.shake - dt * 2);
        d.pivot.rotation.y = d.open + Math.sin(tt * 40) * 0.03 * d.shake;
      });

      // cámara
      if (!cur) {
        camTarget.set(HALL_CAM.x + mouse.x * 0.35, HALL_CAM.y + Math.sin(tt * 0.8) * 0.01, HALL_CAM.z);
      } else if (s <= e) {
        var p1x = cur.offX, p1z = hall.WZ + 2.2, p2z = cur.offZ + cur.CAM_START;
        var k = tEntry, a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k;
        camTarget.set(
          a * (HALL_CAM.x + mouse.x * 0.35 * (1 - k)) + b * p1x + c * cur.offX,
          a * HALL_CAM.y + b * 1.8 + c * 1.62,
          a * HALL_CAM.z + b * p1z + c * p2z);
      } else {
        var lz = cur.CAM_START + (cur.CAM_END - cur.CAM_START) * u;
        camTarget.set(cur.offX, 1.62, cur.offZ + lz);
      }
      if (cur) {
        cur.exit.open += (cur.exit.target - cur.exit.open) * Math.min(1, dt * 2.6);
        cur.exit.pivot.rotation.y = cur.exit.open;
      }
      if (exiting && cur) {
        var kx = Math.min(1, (now - exiting.t0) / 3400), ek = ease(kx), sk = smooth((kx - 0.45) / 0.55);
        camTarget.set(
          exiting.x0 + (cur.offX + mouse.x * 0.35 - exiting.x0) * sk,
          exiting.y0 + (HALL_CAM.y - exiting.y0) * sk,
          exiting.z0 + (exiting.endZ - exiting.z0) * ek);
        look = 1 - sk;
        if (kx >= 1 && !exiting.done) { exiting.done = true; finishLoop(); }
      }
      var prevZ = camPos.z;
      if (exiting) camPos.copy(camTarget); else camPos.lerp(camTarget, Math.min(1, dt * 5));
      var speed = Math.abs(camPos.z - prevZ) / Math.max(dt, 0.001);
      phase += dt * Math.min(speed, 6) * 1.6;
      var bob = cur ? look : 0;
      camera.position.set(camPos.x + Math.sin(phase * 0.5) * 0.02 * bob, camPos.y + Math.sin(phase) * 0.018 * bob, camPos.z);
      camera.rotation.y = -mouse.x * (0.12 + 0.3 * look);
      camera.rotation.x = mouse.y * (0.06 + 0.08 * look) - 0.02 - 0.03 * look;
      cartG.rotation.z = Math.sin(phase * 0.5) * 0.008 * bob;
      cartG.position.y = Math.sin(phase) * 0.004 * bob;

      if (cur) {
        cur.floaters.forEach(function (m) {
          m.position.y = m.userData.baseY + Math.sin(tt * 1.4 + m.userData.phase) * 0.06;
          m.rotation.y = m.userData.baseRot + Math.sin(tt * 0.7 + m.userData.phase) * 0.18;
        });
        hudBar.style.transform = 'scaleY(' + u.toFixed(4) + ')';
        var idx = 0, best = 1e9;
        cur.stations.forEach(function (st, j) { var dd = Math.abs(st.wz - (camera.position.z - 2.5)); if (dd < best) { best = dd; idx = j; } });
        hudCount.textContent = pad(idx + 1) + ' / ' + pad(cur.N);
        if (!hintT || hudHint.textContent.indexOf('Para salir') < 0) hudHint.style.opacity = u > 0.04 ? 0 : 1;
        endEl.classList.toggle('on', u > 0.985 && !exiting);
      }
      if (hovered && hovered.userData.base) hovered.scale.copy(hovered.userData.base).multiplyScalar(1.12);
      for (var d = drops.length - 1; d >= 0; d--) {
        var o = drops[d];
        o.v += dt * 5; o.m.position.y -= o.v * dt * 2;
        if (o.m.position.y <= o.ty) { o.m.position.y = o.ty; drops.splice(d, 1); }
      }
      renderer.render(world, camera);
    }
    setDomMode('hall');
    syncBasket();
    requestAnimationFrame(frame);

    return {
      showHall: showHall,
      release: release,
      nudgeExit: function () {
        var b = $('#hudBack'); b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
        hudHint.textContent = 'Para salir, volvé por la puerta o cruzá la puerta naranja del fondo';
        hudHint.style.opacity = 1;
        clearTimeout(hintT); hintT = setTimeout(function () { hudHint.textContent = 'Scrolleá para avanzar ↓ · Tocá un lente'; }, 3200);
      },
      locked: function () { return locked; },
      enterAisle: enterAisle,
      mode: function () { return cur && !inHall() ? 'aisle' : 'hall'; },
      drop: function (pid, qty) { for (var q = 0; q < Math.min(qty, 6); q++) setTimeout(function () { basketAdd(pid, true); }, 250 + q * 140); },
      sync: syncBasket,
      setPaused: function (b) { paused = b; if (!b) last = performance.now(); }
    };
  }

  /* ================= VISTA DE PRODUCTO (lente en "3D", colores, agregar, volver / checkout) ================= */
  var PV = (function () {
    var root = $('#pv'), stage = $('#pvStage');
    var fImg = $('#pvFront'), sImg = $('#pvSide'), gImg = $('#pvGroup'), floorEl = $('#pvFloor');
    var p = null, color = null, qty = 1, isOpen = false, lastFocus = null;
    var ang = 0, angT = 0, tiltX = 0, tiltY = 0, tX = 0, tY = 0, drag = null, view = 'front', pending = 0;
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function render() {
      if (!isOpen) return;
      requestAnimationFrame(render);
      if (!drag) ang += (angT - ang) * 0.14;
      tiltX += (tX - tiltX) * 0.08; tiltY += (tY - tiltY) * 0.08;
      if (view === 'group') {
        fImg.style.opacity = 0; sImg.style.opacity = 0; gImg.style.opacity = 1;
        gImg.style.transform = 'translateY(-50%) rotateY(' + (tiltX * 0.6) + 'deg) rotateX(' + (tiltY * 0.6) + 'deg)';
        floorEl.style.transform = 'scaleX(1)';
        return;
      }
      var a = ang, abs = Math.abs(a);
      var fo = clamp(1 - (abs - 32) / 26, 0, 1), so = clamp((abs - 32) / 26, 0, 1);
      fImg.style.opacity = fo;
      fImg.style.transform = 'translateY(-50%) rotateY(' + (a + tiltX) + 'deg) rotateX(' + tiltY + 'deg)';
      var sa = a - (a >= 0 ? 90 : -90);
      sImg.style.opacity = so;
      sImg.style.transform = 'translateY(-50%) rotateY(' + (sa + tiltX) + 'deg) rotateX(' + tiltY + 'deg)' + (a < 0 ? ' scaleX(-1)' : '');
      gImg.style.opacity = 0;
      floorEl.style.transform = 'scaleX(' + (0.7 + 0.3 * Math.abs(Math.cos(a * Math.PI / 180))) + ')';
    }
    function setView(v) {
      if (v === 'side') { view = 'front'; angT = 90; }
      else if (v === 'front') { view = 'front'; angT = 0; }
      else view = 'group';
      syncViews();
    }
    function syncViews() {
      var cur = view === 'group' ? 'group' : (Math.abs(angT) > 45 ? 'side' : 'front');
      Array.prototype.forEach.call($('#pvViews').children, function (b) { b.classList.toggle('on', b.getAttribute('data-v') === cur); });
    }
    Array.prototype.forEach.call($('#pvViews').children, function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); setView(b.getAttribute('data-v')); });
    });

    stage.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;
      if (view === 'group') view = 'front';
      drag = { x: e.clientX, a0: ang };
      try { stage.setPointerCapture(e.pointerId); } catch (x) {}
    });
    stage.addEventListener('pointermove', function (e) {
      var r = stage.getBoundingClientRect();
      tX = ((e.clientX - r.left) / r.width - 0.5) * 16;
      tY = -((e.clientY - r.top) / r.height - 0.5) * 10;
      if (drag) { ang = angT = clamp(drag.a0 + (e.clientX - drag.x) * 0.45, -100, 100); }
    });
    function endDrag() {
      if (!drag) return;
      drag = null;
      angT = Math.abs(ang) < 45 ? 0 : (ang > 0 ? 90 : -90);
      syncViews();
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('pointerleave', function () { tX = 0; tY = 0; });

    function renderColors() {
      var box = $('#pvColors'); box.textContent = '';
      Z.colorsOf(p).forEach(function (c) {
        box.appendChild(el('button', { class: c.id === color.id ? 'on' : '', role: 'radio', 'aria-checked': String(c.id === color.id), 'aria-label': c.name, title: c.name,
          onclick: function () { color = c; renderColors(); } }, el('i', { style: colorSwatch(p, c) })));
      });
      $('#pvColorName').textContent = color.name;
      stage.style.setProperty('--glow', hexA(color.hex || p.color, 0.6));
    }
    function renderDeal() {
      var u = units();
      $('#pvDeal').textContent = u ? Z.dealText(u) : (C.packs || []).map(function (k) { return k.units + ' por ' + fmt(k.price); }).join(' · ');
    }
    function setQ(q) { qty = clamp(q, 1, C.limits.maxQtyPerItem); $('#pvQty').textContent = qty; }

    function open(pid) {
      var np = Z.findProduct(pid); if (!np) return;
      p = np; color = Z.colorsOf(p)[0]; setQ(1); pending = 0;
      ang = angT = 0; view = 'front'; syncViews();
      fImg.src = p.image; fImg.alt = p.code + ' ' + p.name + ' de frente';
      sImg.src = p.side || p.image; sImg.alt = p.name + ' de perfil';
      if (p.group) { gImg.src = p.group; gImg.alt = p.name + ' colores'; }
      $('#pvViews').querySelector('[data-v="group"]').style.display = p.group ? '' : 'none';
      $('#pvCode').textContent = p.code + '  ·  ' + catName(p.category);
      $('#pvName').textContent = p.name;
      $('#pvDesc').textContent = p.desc;
      $('#pvPrice').textContent = fmt(p.price);
      $('#pvAfter').classList.remove('on');
      $('#pvAdd').lastChild.textContent = 'Agregar al carrito';
      var inAisle = Store && Store.mode() === 'aisle';
      $('#pvBack').lastChild.textContent = inAisle ? 'Volver al pasillo' : 'Volver';
      $('#pvBack2').textContent = inAisle ? 'Volver al pasillo' : 'Seguir mirando';
      renderColors(); renderDeal();
      lastFocus = document.activeElement;
      isOpen = true;
      root.classList.add('open'); root.setAttribute('aria-hidden', 'false');
      document.documentElement.style.overflow = 'hidden';
      if (Store) Store.setPaused(true);
      requestAnimationFrame(render);
      setTimeout(function () { $('#pvAdd').focus(); }, 60);
    }
    function close(skipDrop) {
      if (!isOpen) return;
      isOpen = false;
      root.classList.remove('open'); root.setAttribute('aria-hidden', 'true');
      document.documentElement.style.overflow = '';
      if (Store) {
        Store.setPaused(false);
        if (pending && !skipDrop && Store.mode() === 'aisle') Store.drop(p.id, pending);
        else if (pending) Store.sync();
      }
      if (pending) { var m = $('#mini'); m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump'); }
      pending = 0;
      if (lastFocus && lastFocus.focus && !skipDrop) lastFocus.focus();
    }
    function add() {
      addToCart(p.id, color.id, qty);
      pending += qty;
      $('#pvAfterTxt').textContent = 'Agregado: ' + qty + ' × ' + p.name + ' · ' + color.name;
      $('#pvAfter').classList.remove('on'); void $('#pvAfter').offsetWidth; $('#pvAfter').classList.add('on');
      $('#pvAdd').lastChild.textContent = 'Agregar otro';
      setQ(1); renderDeal();
    }
    $('#pvMinus').addEventListener('click', function () { setQ(qty - 1); });
    $('#pvPlus').addEventListener('click', function () { setQ(qty + 1); });
    $('#pvAdd').addEventListener('click', add);
    $('#pvBack').addEventListener('click', function () { close(); });
    $('#pvBack2').addEventListener('click', function () { close(); });
    $('#pvClose').addEventListener('click', function () { close(); });
    $('#pvCheckout').addEventListener('click', goCheckout);
    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') { view = 'front'; angT = angT <= -45 ? -90 : (angT >= 45 ? 0 : -90); syncViews(); }
      else if (e.key === 'ArrowRight') { view = 'front'; angT = angT >= 45 ? 90 : (angT <= -45 ? 0 : 90); syncViews(); }
    });
    return { open: open, close: close, isOpen: function () { return isOpen; } };
  })();

  /* ================= 03 · CARRITO ================= */
  function renderCart() {
    var c = calc(null);
    $('#pillCount').textContent = units();
    $('#pillTotal').textContent = fmt(c ? c.total : 0);

    var lines = $('#lines'); lines.textContent = '';
    if (!cart.length) {
      append(lines, el('div', { class: 'empty' },
        el('b', { text: 'Tu carrito está vacío' }),
        'Entrá a un pasillo y elegí tus lentes. Llevando más, pagás menos.',
        el('div', null, el('button', { class: 'btn btn-dark', onclick: function () { goStore(); } }, 'Ir a la tienda', icon('i-arrow')))));
    } else {
      c.lines.forEach(function (l) {
        var p = Z.findProduct(l.id), col = Z.findColor(p, l.color), k = l.id + '|' + l.color;
        append(lines, el('div', { class: 'line' },
          el('div', { class: 'th' }, el('img', { src: img(p), alt: '' })),
          el('div', { class: 'nm' }, el('small', { text: p.code }), el('b', { text: p.name }),
            el('span', null, el('i', { style: colorSwatch(p, col) }), col.name + ' · ' + fmt(p.price) + ' c/u')),
          el('div', { class: 'step' },
            el('button', { 'aria-label': 'Menos', text: '−', onclick: function () { setQty(k, l.qty - 1); } }),
            el('output', { text: l.qty }),
            el('button', { 'aria-label': 'Más', text: '+', onclick: function () { setQty(k, l.qty + 1); } })),
          el('div', { class: 'lt money', text: fmt(l.total) }),
          el('button', { class: 'rm', 'aria-label': 'Quitar ' + p.name, onclick: function () { setQty(k, 0); } }, icon('i-trash'))));
      });
    }
    var more = $('#cartMore'); more.textContent = '';
    CATS.forEach(function (cat) { more.appendChild(el('button', { text: '+ ' + cat.name, onclick: function () { goStore(cat.id); } })); });

    var sum = $('#sum'); sum.textContent = '';
    var u = units();
    var nudge = null;
    if (c) {
      var packTxt = c.packs.filter(function (k) { return k.name !== 'Unidad'; }).map(function (k) { return k.count + '× ' + k.name; }).join(' + ');
      if (c.deal) nudge = el('div', { class: 'nudge' + (/gratis a todo/.test(c.deal) && !/Sumá/.test(c.deal) ? ' done' : '') }, packTxt ? el('b', { text: 'Tenés ' + packTxt + '. ' }) : null, c.deal + '.');
      else if (packTxt) nudge = el('div', { class: 'nudge done', text: 'Tenés ' + packTxt + '. Ahorrás ' + fmt(c.discount) + '.' });
    }
    append(sum, [
      el('h3', { text: 'Resumen' }),
      el('div', { class: 'r' }, el('span', { text: 'Subtotal (' + u + (u === 1 ? ' unidad)' : ' unidades)') }), el('span', { class: 'money', text: fmt(c ? c.subtotal : 0) })),
      c && c.discount ? el('div', { class: 'r dis' }, el('span', { text: 'Precio pack (ahorrás ' + c.discountPct + '%)' }), el('span', { class: 'money', text: '− ' + fmt(c.discount) })) : null,
      el('div', { class: 'r' }, el('span', { text: 'Envío' }), el('span', { text: u >= (C.shipping.freeFromUnits || Infinity) ? 'Gratis a todo el país' : 'Se calcula en el checkout' })),
      el('div', { class: 'r tot' }, el('span', { text: 'Total' }), el('span', { class: 'money', text: fmt(c ? c.total : 0) })),
      nudge,
      el('button', { class: 'btn btn-accent', disabled: !cart.length, onclick: function () { Checkout.open(); } }, 'Checkout', icon('i-arrow')),
      el('p', { class: 'note', text: 'Sin cuentas ni contraseñas. Pagás con Mercado Pago o transferencia.' }),
      el('div', { class: 'pays' }, el('span', { text: 'Mercado Pago' }), el('span', { text: 'Transferencia' }))
    ]);

    renderLastOrder();
    renderMini(c);
    if (Store && Store.sync && !(PV && PV.isOpen())) Store.sync();
  }

  function renderMini(c) {
    var m = $('#mini'); m.textContent = '';
    if (!cart.length) { m.classList.remove('on'); return; }
    var u = units();
    var ul = el('ul');
    cart.slice(0, 8).forEach(function (i) {
      var p = Z.findProduct(i.id), col = Z.findColor(p, i.color);
      ul.appendChild(el('li', { title: p.name + ' · ' + col.name }, el('img', { src: p.image, alt: '' }), el('b', { text: i.qty }), col.hex ? el('i', { style: 'background:' + col.hex }) : null));
    });
    append(m, [
      el('h4', null, 'Tu carrito', el('span', { text: u + (u === 1 ? ' unidad' : ' unidades') })),
      ul,
      el('div', { class: 'tot' }, 'Total', el('b', { class: 'money', text: fmt(c.total) })),
      c.deal ? el('div', { class: 'deal', text: c.deal }) : null,
      el('button', { class: 'btn btn-accent', onclick: goCheckout }, 'Checkout', icon('i-arrow'))
    ]);
    m.classList.add('on');
  }

  function renderLastOrder() {
    var box = $('#lastOrder'); box.textContent = '';
    var lo = store.get(K.last, null);
    if (!lo || !lo.id) return;
    var d = new Date(lo.date || Date.now());
    append(box, el('div', { class: 'lastorder' },
      el('div', null, 'Tu último pedido: ', el('b', { text: lo.id }), ' · ' + fmt(lo.total) + ' · ' + (lo.method === 'mp' ? 'Mercado Pago' : 'Transferencia') + ' · ' + d.toLocaleDateString('es-AR')),
      lo.method === 'transfer'
        ? el('button', { text: 'Ver datos de pago', onclick: function () { Checkout.showTransfer(lo.id, lo.total); } })
        : el('a', { href: waLink('Hola! Consulto por mi pedido ' + lo.id), target: '_blank', rel: 'noopener noreferrer', text: 'Consultar' })));
  }

  /* ================= CHECKOUT ================= */
  var Checkout = (function () {
    var modal = $('#modal'), sheet = $('#sheet');
    var st = { method: 'ship', pay: 'mp', busy: false, calc: null };
    var cust = Object.assign({ name: '', email: '', phone: '', dni: '', province: 'Buenos Aires', city: '', cp: '', address: '', notes: '' }, store.get(K.cust, {}) || {});
    var remember = !!store.get(K.cust, null) || true;
    if (store.get('zaluvo.method', null) === 'pickup') st.method = 'pickup';

    function openModal() {
      modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
      document.documentElement.style.overflow = 'hidden';
      if (Store) Store.setPaused(true);
    }
    function close() {
      if (st.busy) return;
      modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true');
      document.documentElement.style.overflow = '';
      if (Store) Store.setPaused(false);
    }
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('open')) close(); });

    function frame(stepN, title, sub) {
      sheet.textContent = '';
      append(sheet, el('button', { class: 'x', 'aria-label': 'Cerrar', onclick: close }, icon('i-x')));
      if (stepN) {
        var s = el('div', { class: 'steps', 'aria-hidden': 'true' });
        for (var i = 1; i <= 3; i++) s.appendChild(el('i', { class: i <= stepN ? 'on' : '' }));
        sheet.appendChild(s);
      }
      if (title) sheet.appendChild(el('h2', { id: 'mTitle', text: title }));
      if (sub) sheet.appendChild(el('p', { class: 'sub', text: sub }));
    }

    /* --- paso 1: datos --- */
    function field(name, label, opts) {
      opts = opts || {};
      var input;
      if (opts.select) {
        input = el('select', { id: 'f_' + name, name: name });
        opts.select.forEach(function (o) { input.appendChild(el('option', { value: o, text: o, selected: o === cust[name] })); });
      } else if (opts.area) {
        input = el('textarea', { id: 'f_' + name, name: name, maxlength: opts.max || 300, placeholder: opts.ph || '' });
        input.value = cust[name] || '';
      } else {
        input = el('input', { id: 'f_' + name, name: name, type: opts.type || 'text', autocomplete: opts.ac || 'on', inputmode: opts.im || null, maxlength: opts.max || 120, placeholder: opts.ph || '' });
        input.value = cust[name] || '';
      }
      return el('div', { class: 'f' + (opts.full ? ' full' : ''), 'data-f': name },
        el('label', { for: 'f_' + name, text: label }), input, el('div', { class: 'e' }));
    }
    function stepData() {
      openModal();
      frame(1, '¿A dónde lo mandamos?', 'Sin cuentas ni contraseñas. Solo lo necesario para que te llegue.');
      var seg = el('div', { class: 'seg', role: 'radiogroup' },
        el('button', { class: st.method === 'ship' ? 'on' : '', role: 'radio', 'aria-checked': String(st.method === 'ship'), onclick: function () { readForm(); st.method = 'ship'; stepData(); } },
          'Envío a domicilio', el('small', { text: 'A todo el país' })),
        el('button', { class: st.method === 'pickup' ? 'on' : '', role: 'radio', 'aria-checked': String(st.method === 'pickup'), onclick: function () { readForm(); st.method = 'pickup'; stepData(); } },
          C.shipping.pickup.label, el('small', { text: 'Sin costo · coordinamos por WhatsApp' })));
      var fields = el('div', { class: 'fields' },
        field('name', 'Nombre y apellido', { full: true, ac: 'name', max: 80 }),
        field('email', 'Email', { type: 'email', ac: 'email', max: 120 }),
        field('phone', 'WhatsApp / Teléfono', { type: 'tel', ac: 'tel', im: 'tel', max: 30, ph: '223 1234567' }),
        field('dni', 'DNI (opcional)', { im: 'numeric', max: 12, ac: 'off' }),
        st.method === 'ship' ? field('cp', 'Código postal', { ac: 'postal-code', max: 10, ph: '7600' }) : null,
        st.method === 'ship' ? field('province', 'Provincia', { select: C.provinces }) : null,
        st.method === 'ship' ? field('city', 'Ciudad', { ac: 'address-level2', max: 60 }) : null,
        st.method === 'ship' ? field('address', 'Calle, número, piso/depto', { full: true, ac: 'street-address', max: 120 }) : null,
        field('notes', 'Notas (opcional)', { full: true, area: true, max: 300, ph: 'Horario, referencias…' }));
      var hp = el('div', { class: 'hp', 'aria-hidden': 'true' }, el('label', { for: 'f_company', text: 'Empresa' }), el('input', { id: 'f_company', name: 'company', tabindex: '-1', autocomplete: 'off' }));
      var chk = el('input', { type: 'checkbox', id: 'f_remember' }); chk.checked = remember;
      append(sheet, [seg, fields, hp,
        el('label', { class: 'chk', for: 'f_remember' }, chk, 'Recordar mis datos en este dispositivo'),
        el('div', { class: 'acts' },
          el('button', { class: 'linkbtn', text: 'Seguir comprando', onclick: close }),
          el('button', { class: 'btn btn-dark', onclick: toSummary }, st.method === 'ship' ? 'Calcular envío' : 'Continuar', icon('i-arrow')))]);
      var first = sheet.querySelector('input'); if (first && !first.value) setTimeout(function () { first.focus(); }, 60);
    }
    function readForm() {
      ['name', 'email', 'phone', 'dni', 'cp', 'province', 'city', 'address', 'notes'].forEach(function (k) {
        var f = $('#f_' + k); if (f) cust[k] = f.value.trim();
      });
      var r = $('#f_remember'); if (r) remember = r.checked;
    }
    function setErr(name, msg) {
      var f = sheet.querySelector('[data-f="' + name + '"]'); if (!f) return;
      f.classList.toggle('err', !!msg); f.querySelector('.e').textContent = msg || '';
    }
    function validate() {
      var ok = true;
      function chk(name, cond, msg) { setErr(name, cond ? '' : msg); if (!cond) ok = false; }
      chk('name', cust.name.length >= 3, 'Ingresá tu nombre y apellido');
      chk('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cust.email), 'Email inválido');
      var d = cust.phone.replace(/\D/g, '');
      chk('phone', d.length >= 8 && d.length <= 15, 'Teléfono inválido');
      chk('dni', !cust.dni || /^\d{7,9}$/.test(cust.dni.replace(/\D/g, '')), 'DNI inválido');
      if (st.method === 'ship') {
        chk('cp', !!Z.shippingZone(cust.cp), 'Código postal inválido');
        chk('city', cust.city.length >= 2, 'Ingresá la ciudad');
        chk('address', cust.address.length >= 4, 'Ingresá la dirección');
      }
      return ok;
    }
    function toSummary() {
      readForm();
      if (!validate()) { var e = sheet.querySelector('.f.err input,.f.err select'); if (e) e.focus(); return; }
      if (remember) { store.set(K.cust, cust); store.set('zaluvo.method', st.method); } else { store.del(K.cust); store.del('zaluvo.method'); }
      st.honeypot = ($('#f_company') || {}).value || '';
      try { st.calc = calc({ method: st.method, cp: cust.cp }); }
      catch (e) { setErr('cp', e.message); return; }
      stepSummary();
    }

    /* --- paso 2: resumen y pago --- */
    function stepSummary() {
      var c = st.calc;
      frame(2, 'Revisá y pagá', st.method === 'ship' ? 'Envío a ' + cust.city + ' (' + c.zone.label + ')' : C.shipping.pickup.label);
      var rs = el('div', { class: 'rs' });
      c.lines.forEach(function (l) {
        append(rs, el('div', { class: 'r' }, el('span', { text: l.qty + ' × ' + l.code + ' ' + l.name + ' · ' + l.colorName }), el('span', { class: 'money', text: fmt(l.total) })));
      });
      if (c.discount) append(rs, el('div', { class: 'r dis' }, el('span', { text: 'Precio pack (ahorrás ' + c.discountPct + '%)' }), el('span', { class: 'money', text: '− ' + fmt(c.discount) })));
      append(rs, el('div', { class: 'r' }, el('span', { text: 'Envío' }), el('span', { class: 'money', text: c.shipping === 0 ? 'Gratis' : fmt(c.shipping) })));
      append(rs, el('div', { class: 'r tot' }, el('span', { text: 'Total' }), el('span', { class: 'money', text: fmt(c.total) })));
      function payBtn(id, ic, icCls, title, sub) {
        return el('button', { class: st.pay === id ? 'on' : '', role: 'radio', 'aria-checked': String(st.pay === id), onclick: function () { st.pay = id; stepSummary(); } },
          el('span', { class: 'ic' + (icCls ? ' ' + icCls : ''), text: ic }), el('b', { text: title }), el('small', { text: sub }));
      }
      var payBtnEl = el('button', { class: 'btn btn-accent', id: 'payNow', onclick: pay },
        'Checkout · ' + fmt(c.total), icon('i-arrow'));
      append(sheet, [rs,
        el('div', { class: 'paysel', role: 'radiogroup', 'aria-label': 'Medio de pago' },
          payBtn('mp', 'MP', '', 'Mercado Pago', 'Tarjeta, débito, dinero en cuenta. Te llevamos a Mercado Pago.'),
          payBtn('transfer', '$', 'tr', 'Transferencia', 'Te damos alias, CBU y un código de pedido.')),
        el('div', { class: 'acts' },
          el('button', { class: 'linkbtn', text: '← Cambiar datos', onclick: stepData }),
          payBtnEl)]);
    }

    function localDemo() {
      return IS_FILE;
    }
    function localOrderId() {
      var a = new Uint8Array(3); crypto.getRandomValues(a);
      return 'ZLV-LOCAL-' + Array.prototype.map.call(a, function (b) { return (b + 256).toString(16).slice(1); }).join('').toUpperCase();
    }

    function pay() {
      if (st.busy) return;
      var btn = $('#payNow');
      st.busy = true; btn.disabled = true; btn.textContent = ''; btn.appendChild(el('span', { class: 'spin' })); btn.appendChild(document.createTextNode(' Procesando…'));
      if (!reqId) reqId = uid();
      var body = {
        items: cart.map(function (i) { return { id: i.id, color: i.color, qty: i.qty }; }),
        delivery: { method: st.method },
        customer: cust,
        payment: st.pay,
        expectedTotal: st.calc.total,
        clientRequestId: reqId,
        company: st.honeypot
      };
      if (localDemo()) { setTimeout(function () { st.busy = false; demoResult(); }, 900); return; }

      fetch('api/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
        .then(function (r) {
          if (r.status === 404 && (IS_LOCALHOST || /\.netlify\.app$/.test(location.hostname))) return { demo: true }; // vista previa sin servidor de pagos
          return r.json().catch(function () { return { ok: false, error: 'Respuesta inválida del servidor' }; }).then(function (d) { d.status = r.status; return d; });
        })
        .then(function (d) {
          st.busy = false;
          if (d.demo) return demoResult();
          if (d.status === 409 && d.calc) { st.calc = d.calc; stepSummary(); return; }
          if (!d.ok) return stepError(d.error || 'No pudimos registrar el pedido.');
          var lo = { id: d.orderId, total: d.total, method: st.pay, date: Date.now() };
          store.set(K.last, lo);
          if (st.pay === 'mp') {
            if (typeof d.redirect === 'string' && /^https:\/\/([a-z0-9-]+\.)*mercadopago\.com(\.ar)?\//i.test(d.redirect)) {
              location.href = d.redirect;
            } else stepError('No pudimos abrir Mercado Pago.');
          } else {
            clearCart();
            showTransfer(d.orderId, d.total, d.transfer);
          }
        })
        .catch(function () { st.busy = false; stepError('No hay conexión con la tienda. Probá de nuevo en un momento.'); });
    }

    // MODO LOCAL (abriendo index.html directo): no hay servidor, se simula para probar la experiencia.
    function demoResult() {
      var id = localOrderId(), total = st.calc.total;
      store.set(K.last, { id: id, total: total, method: st.pay, date: Date.now() });
      if (st.pay === 'transfer') { clearCart(); showTransfer(id, total, null, true); return; }
      frame(3, 'Modo prueba local', 'Acá se abriría Mercado Pago. En Netlify esto es real; ahora solo simulamos el resultado.');
      append(sheet, el('div', { class: 'acts' },
        el('button', { class: 'btn btn-ghost', style: 'color:var(--ink);border-color:#d8d4ca', text: 'Simular rechazo', onclick: function () { result('rechazado', id); } }),
        el('button', { class: 'btn btn-dark', text: 'Simular pago aprobado', onclick: function () { result('aprobado', id); } })));
    }

    function stepError(msg) {
      frame(0, 'Algo no salió', msg);
      sheet.insertBefore(el('div', { class: 'big-ok e' }, icon('i-alert')), sheet.querySelector('h2'));
      var list = cart.map(function (i) { var p = Z.findProduct(i.id), cc = Z.findColor(p, i.color); return i.qty + 'x ' + p.code + ' ' + p.name + ' (' + (cc ? cc.name : '') + ')'; }).join(', ');
      append(sheet, el('div', { class: 'acts' },
        el('a', { class: 'wa-inline', href: waLink('Hola ZALUVO! Quiero comprar: ' + list), target: '_blank', rel: 'noopener noreferrer' }, icon('i-wa'), 'Comprar por WhatsApp'),
        el('button', { class: 'btn btn-dark', text: 'Reintentar', onclick: stepSummary })));
    }

    /* --- transferencia --- */
    function showTransfer(id, total, tr, demo) {
      tr = tr || C.store.transfer;
      openModal();
      frame(3, 'Pedido reservado', 'Transferí el total y mandanos el comprobante. Tu pedido se confirma cuando se acredita.');
      sheet.insertBefore(el('div', { class: 'big-ok w' }, icon('i-clock')), sheet.querySelector('h2'));
      function kv(label, value, copy) {
        var b = copy ? el('button', { text: 'Copiar' }) : null;
        if (b) b.addEventListener('click', function () { copyText(String(copy)).then(function () { b.textContent = 'Copiado'; b.classList.add('ok'); setTimeout(function () { b.textContent = 'Copiar'; b.classList.remove('ok'); }, 1800); }); });
        return el('div', { class: 'kv' }, el('div', null, el('small', { text: label }), el('b', { text: value })), b);
      }
      var data = el('div', null,
        kv('Pedido (poné este código en el concepto)', id, id),
        kv('Monto exacto', fmt(total), String(Math.round(total))),
        kv('Alias', tr.alias, tr.alias),
        kv('CBU', tr.cbu, tr.cbu),
        kv('Titular · Banco', tr.holder + ' · ' + tr.bank, null));
      var box = el('div', { class: 'tbox' });
      var isPhone = window.matchMedia('(max-width: 900px)').matches;
      if (!isPhone && window.qrcode && !IS_FILE) {
        var url = location.origin + location.pathname + '?transferencia=' + encodeURIComponent(id) + '&monto=' + Math.round(total);
        var qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
        box.appendChild(el('div', null, el('div', { class: 'qr' }, el('img', { src: qr.createDataURL(6, 2), alt: 'QR con los datos de transferencia' })),
          el('p', { class: 'qr-cap', text: 'Escaneá con el celu y copiá los datos desde tu home banking' })));
      } else if (!isPhone) {
        box.appendChild(el('div', null, el('div', { class: 'qr' }, el('b', { style: 'font-size:13px;text-align:center;color:#6b7386', text: 'El QR aparece cuando la tienda está online' }))));
      } else box.style.gridTemplateColumns = '1fr';
      box.appendChild(data);
      append(sheet, [box,
        demo ? el('p', { class: 'sub', style: 'margin-top:14px;color:#d14b12', text: 'Modo prueba local: el pedido no se registró en la planilla.' }) : null,
        el('div', { class: 'acts' },
          el('a', { class: 'wa-inline', href: waLink('Hola ZALUVO! Te mando el comprobante del pedido ' + id + ' por ' + fmt(total)), target: '_blank', rel: 'noopener noreferrer' }, icon('i-wa'), 'Enviar comprobante'),
          el('button', { class: 'btn btn-dark', text: 'Listo', onclick: close }))]);
    }

    /* --- resultado Mercado Pago --- */
    function result(estado, id) {
      openModal();
      var lo = store.get(K.last, null);
      if (estado === 'aprobado') {
        clearCart();
        if (lo && lo.id === id) { lo.status = 'aprobado'; store.set(K.last, lo); }
        frame(3, '¡Listo, es tuyo!', 'Recibimos tu pago. Te escribimos por WhatsApp para coordinar la entrega.');
        sheet.insertBefore(el('div', { class: 'big-ok' }, icon('i-check')), sheet.querySelector('h2'));
      } else if (estado === 'pendiente') {
        frame(3, 'Pago en proceso', 'Mercado Pago está procesando tu pago. Te avisamos cuando se acredite.');
        sheet.insertBefore(el('div', { class: 'big-ok w' }, icon('i-clock')), sheet.querySelector('h2'));
      } else {
        frame(0, 'El pago no se completó', 'No se cobró nada. Tu carrito sigue guardado: podés intentar de nuevo o pagar por transferencia.');
        sheet.insertBefore(el('div', { class: 'big-ok e' }, icon('i-alert')), sheet.querySelector('h2'));
      }
      append(sheet, [
        el('div', { class: 'kv' }, el('div', null, el('small', { text: 'Pedido' }), el('b', { text: id }))),
        el('div', { class: 'acts' },
          el('a', { class: 'wa-inline', href: waLink('Hola ZALUVO! Consulto por mi pedido ' + id), target: '_blank', rel: 'noopener noreferrer' }, icon('i-wa'), 'WhatsApp'),
          estado === 'rechazado' && cart.length
            ? el('button', { class: 'btn btn-dark', text: 'Reintentar', onclick: function () { stepData(); } })
            : el('button', { class: 'btn btn-dark', text: 'Seguir mirando', onclick: close }))]);
    }

    return {
      open: function () { if (!cart.length) return; stepData(); },
      showTransfer: showTransfer,
      result: result
    };
  })();


  /* ================= parámetros de URL (vuelta de MP / QR) ================= */
  function handleParams() {
    var q = new URLSearchParams(location.search);
    var pedido = q.get('pedido'), estado = q.get('estado');
    var tr = q.get('transferencia'), monto = q.get('monto');
    var validId = function (s) { return /^ZLV-[A-Z0-9-]{4,24}$/.test(s || ''); };
    if (validId(pedido) && /^(aprobado|pendiente|rechazado)$/.test(estado || '')) {
      Checkout.result(estado, pedido);
    } else if (validId(tr) && /^\d{1,9}$/.test(monto || '')) {
      Checkout.showTransfer(tr, Number(monto));
    }
    if (pedido || tr) history.replaceState(null, '', location.pathname + location.hash);
  }

  /* ================= reveal ================= */
  function initReveal() {
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    Array.prototype.forEach.call(document.querySelectorAll('.rv'), function (n) { io.observe(n); });
  }

  /* ================= arranque ================= */
  initChrome();
  initHero();
  renderPromos();
  renderCart();
  initReveal();
  handleParams();
  function loadImg(src) {
    return new Promise(function (res) {
      if (!src) return res(null);
      var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src;
    });
  }
  var fontsReady = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('900 60px Montserrat'), document.fonts.load('800 60px Montserrat'), document.fonts.load('700 30px Montserrat')]) : Promise.resolve();
  var brandReady = Promise.all(['logotipo', 'isologo', 'isotipo'].map(function (k) {
    return loadImg(IMG['brand/' + k]).then(function (im) { if (im) BRAND[k] = im; });
  }));
  var doorsReady = Promise.all(P.map(function (p) {
    return loadImg(tex(p.image)).then(function (im) { if (im) PIMG[p.id] = im; });
  }));
  Promise.race([Promise.all([fontsReady, brandReady, doorsReady]), new Promise(function (r) { setTimeout(r, 2500); })]).then(function () {
    Store = initStore();
    renderCart();
  });
})();
