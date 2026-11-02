/**
 * Free products — tiered auto-add-to-cart
 * ------------------------------------------------
 * Each gift (sticker pack, greeting cards, scarf ...) has its own threshold. A gift is added when:
 *   cart value (excluding all gift lines) >= gift threshold
 *   AND at least one non-gift item belongs to the eligible collection ("All Products (Sitewide - Auto)")
 * Otherwise any line of that gift is removed.
 *
 * A gift can have several products (e.g. the scarf has one $0 product per color). The first product is the
 * default; the customer can switch via the swatches rendered by snippets/cart-free-scarf-chooser.liquid
 * (buttons with [data-gift-swatch]). Gift data comes from window.freeProductConfig.gifts
 * (rendered by snippets/free-product-gifts.liquid).
 *
 * Hooks the cart write endpoints (fetch + XHR) so it works from any Add to Cart entry point, with a slow
 * visibility-aware poll as a backstop. It cannot catch "Buy it now" / Shop Pay buttons, which skip the
 * cart entirely. Gift quantity is locked to 1 (stepper hidden + force-corrected). Any line of a gift
 * product is treated as a gift line, so it can't stay in a non-qualifying cart even if added from the
 * console.
 */
(function () {
  var CONFIG = window.freeProductConfig || {};
  var PRODUCT_PROPERTY_KEY = '_free_product';
  var SYNC_HEADER = 'X-Free-Product-Sync';
  var ELIGIBLE_IDS = (CONFIG.eligibleProductIds || []).map(Number);

  var GIFTS = (CONFIG.gifts || []).map(function (g) {
    var gift = {
      key: g.key,
      threshold: Number(g.threshold) || 0,
      products: g.products || []
    };
    gift.productIds = gift.products.map(function (p) { return Number(p.productId); });
    gift.variantIds = gift.products.map(function (p) { return Number(p.variantId); });
    return gift;
  }).filter(function (g) { return g.products.length > 0; });
  if (!GIFTS.length) return;

  var COMPARE_AT_BY_VARIANT = {};
  var COMPARE_AT_BY_PRODUCT = {};
  GIFTS.forEach(function (g) {
    g.products.forEach(function (p) {
      var cap = Number(p.compareAtPrice) || 0;
      if (cap > 0) {
        if (p.variantId) COMPARE_AT_BY_VARIANT[Number(p.variantId)] = cap;
        if (p.productId) COMPARE_AT_BY_PRODUCT[Number(p.productId)] = cap;
      }
    });
  });

  // Include compare-at prices for any cart items rendered by Liquid
  var CART_CAP = CONFIG.cartCompareAtPrices || {};
  Object.keys(CART_CAP).forEach(function (vid) {
    var cap = Number(CART_CAP[vid]) || 0;
    if (cap > 0) {
      COMPARE_AT_BY_VARIANT[Number(vid)] = cap;
    }
  });

  var FETCHING_HANDLES = {};
  function fetchProductCompareAt(handle) {
    if (!handle || FETCHING_HANDLES[handle]) return;
    FETCHING_HANDLES[handle] = true;
    try {
      var cached = sessionStorage.getItem('hok_cap_' + handle);
      if (cached) {
        var map = JSON.parse(cached);
        Object.keys(map).forEach(function (k) { COMPARE_AT_BY_VARIANT[Number(k)] = Number(map[k]); });
        return;
      }
    } catch (e) {}

    fetch('/products/' + handle + '.js')
      .then(function (res) { return res.json(); })
      .then(function (prod) {
        if (!prod || !Array.isArray(prod.variants)) return;
        var map = {};
        prod.variants.forEach(function (v) {
          var cap = Number(v.compare_at_price) || 0;
          if (cap > 0) {
            COMPARE_AT_BY_VARIANT[Number(v.id)] = cap;
            map[v.id] = cap;
          }
        });
        try { sessionStorage.setItem('hok_cap_' + handle, JSON.stringify(map)); } catch (e) {}
      })
      .catch(function () {});
  }

  function ensureCartCompareAtPrices(cart) {
    if (!cart || !Array.isArray(cart.items)) return;
    cart.items.forEach(function (item) {
      var vid = Number(item.variant_id || item.id);
      if (!COMPARE_AT_BY_VARIANT[vid] && item.handle) {
        fetchProductCompareAt(item.handle);
      }
    });
  }

  function getOrFetchCompareAt(item) {
    if (!item) return 0;
    var vid = Number(item.variant_id || item.id);
    var pid = Number(item.product_id);
    var cap = COMPARE_AT_BY_VARIANT[vid] || COMPARE_AT_BY_PRODUCT[pid] || 0;
    if (cap > 0) return cap;

    if (!item.handle) return 0;
    try {
      var cached = sessionStorage.getItem('hok_cap_' + item.handle);
      if (cached) {
        var map = JSON.parse(cached);
        Object.keys(map).forEach(function (k) { COMPARE_AT_BY_VARIANT[Number(k)] = Number(map[k]); });
        if (COMPARE_AT_BY_VARIANT[vid]) return COMPARE_AT_BY_VARIANT[vid];
      }
    } catch (e) {}

    // Fallback sync fetch if user clicks checkout before async fetch completes
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/products/' + item.handle + '.js', false);
      xhr.send();
      if (xhr.status === 200) {
        var prod = JSON.parse(xhr.responseText);
        if (prod && Array.isArray(prod.variants)) {
          var saveMap = {};
          prod.variants.forEach(function (v) {
            var vcap = Number(v.compare_at_price) || 0;
            if (vcap > 0) {
              COMPARE_AT_BY_VARIANT[Number(v.id)] = vcap;
              saveMap[v.id] = vcap;
            }
          });
          try { sessionStorage.setItem('hok_cap_' + item.handle, JSON.stringify(saveMap)); } catch (e) {}
          return COMPARE_AT_BY_VARIANT[vid] || 0;
        }
      }
    } catch (e) {}

    return 0;
  }

  function enrichCartForRazorpay(cart) {
    if (!cart || !Array.isArray(cart.items)) return cart;
    // Keep paid products at the top and free gifts below them
    cart.items.sort(function (a, b) {
      var aGift = isGiftItem(a);
      var bGift = isGiftItem(b);
      if (aGift === bGift) return 0;
      return aGift ? 1 : -1;
    });
    // Only expose compare_at_price (Razorpay uses it for the strike-through, for paid items and free
    // gifts alike). Do NOT touch original_price / original_line_price (Razorpay adds those into the
    // Grand Total), total_discount or discount allocations (Razorpay then refuses coupon codes).
    cart.items.forEach(function (item) {
      var cap = getOrFetchCompareAt(item);
      var currentPrice = Number(item.price != null ? item.price : item.line_price);
      if (cap > currentPrice) {
        item.compare_at_price = cap;
      }
    });
    return cart;
  }

  function enrichRazorpayOptions(opts) {
    if (!opts || typeof opts !== 'object') return opts;
    if (opts.shopify_cart) enrichCartForRazorpay(opts.shopify_cart);
    if (opts.cart && Array.isArray(opts.cart.line_items)) {
      opts.cart.line_items.sort(function (a, b) {
        var aGift = isGiftItem(a);
        var bGift = isGiftItem(b);
        if (aGift === bGift) return 0;
        return aGift ? 1 : -1;
      });
      opts.cart.line_items.forEach(function (li) {
        var cap = giftCompareAt(li);
        if (cap > 0) {
          li.compare_at_price = cap;
        }
      });
    }
    return opts;
  }

  function hookRazorpayPrototype(Rzp) {
    if (typeof Rzp !== 'function' || !Rzp.prototype || Rzp.prototype.__freeProductHooked) return;
    var origOpen = Rzp.prototype.open;
    if (typeof origOpen !== 'function') return;
    Rzp.prototype.open = function () {
      try {
        if (typeof this.get === 'function') enrichRazorpayOptions(this.get());
      } catch (e) {}
      return origOpen.apply(this, arguments);
    };
    Rzp.prototype.__freeProductHooked = true;
  }

  (function installRazorpayHook() {
    if (typeof window.Razorpay === 'function') {
      hookRazorpayPrototype(window.Razorpay);
    }
    try {
      var internal = window.Razorpay;
      Object.defineProperty(window, 'Razorpay', {
        configurable: true,
        enumerable: true,
        get: function () {
          if (typeof internal === 'function') hookRazorpayPrototype(internal);
          return internal;
        },
        set: function (val) {
          internal = val;
          if (typeof val === 'function') hookRazorpayPrototype(val);
        }
      });
    } catch (e) {}
  })();

  var busy = false;
  var queued = false;
  var lastCart = null; // most recent cart snapshot, lets a swatch click skip the initial /cart.js read
  var pendingWrites = 0; // theme cart writes currently in flight

  function mark(headers) {
    headers = headers || {};
    headers[SYNC_HEADER] = '1';
    return headers;
  }

  // Opt-in debug log: open any page with ?fpdebug=1 (or localStorage.freeProductDebug = '1').
  var DEBUG = /[?&]fpdebug=1/.test(location.search);
  try { DEBUG = DEBUG || localStorage.getItem('freeProductDebug') === '1'; } catch (e) {}
  function dbg(msg) { if (DEBUG) console.log('[free-product ' + Math.round(performance.now()) + 'ms] ' + msg); }

  function getCart() {
    return fetch('/cart.js', { headers: mark({}) }).then(function (r) { return r.json(); }).then(function (c) {
      lastCart = c;
      ensureCartCompareAtPrices(c);
      updateHeaderTracker(c);
      return c;
    });
  }

  function giftOf(item) {
    for (var i = 0; i < GIFTS.length; i++) {
      if (GIFTS[i].productIds.indexOf(item.product_id) !== -1) return GIFTS[i];
    }
    return null;
  }
  function isGiftItem(item) { return !!giftOf(item); }

  // Cart value without any gift line, and whether a non-gift item is in the eligible collection.
  function totals(cart) {
    var total = 0;
    var hasEligible = false;
    cart.items.forEach(function (item) {
      if (isGiftItem(item)) return;
      total += item.line_price;
      if (ELIGIBLE_IDS.indexOf(item.product_id) !== -1) hasEligible = true;
    });
    return { total: total, hasEligible: hasEligible };
  }

  function qualifies(gift, t) {
    return t.total >= gift.threshold && t.hasEligible;
  }

  function choiceKey(gift) { return 'freeProductChoice_' + gift.key; }

  function chosenVariant(gift, lines) {
    var stored = null;
    try { stored = Number(sessionStorage.getItem(choiceKey(gift))); } catch (e) {}
    if (gift.variantIds.indexOf(stored) !== -1) return stored;
    if (lines.length && gift.variantIds.indexOf(lines[0].variant_id) !== -1) return lines[0].variant_id;
    return gift.variantIds[0]; // first product is the default
  }

  function itemFor(variantId) {
    var props = {};
    props[PRODUCT_PROPERTY_KEY] = 'true';
    return { id: variantId, quantity: 1, properties: props };
  }

  function postAdd(items) {
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: mark({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ items: items })
    });
  }

  // One request for all new gifts; if it fails (e.g. one variant sold out) fall back to one by one.
  function addGifts(variantIds) {
    if (!variantIds.length) return Promise.resolve();
    return postAdd(variantIds.map(itemFor)).then(function (r) {
      if (r && r.ok) return;
      console.warn('[free-product] batch add failed', r && r.status);
      return variantIds.reduce(function (chain, id) {
        return chain.then(function () {
          return postAdd([itemFor(id)]).then(function (res) {
            if (res && !res.ok) {
              // forget a choice that can't be added so the default is used next time
              GIFTS.forEach(function (g) {
                if (g.variantIds.indexOf(id) !== -1) { try { sessionStorage.removeItem(choiceKey(g)); } catch (e) {} }
              });
            }
          });
        });
      }, Promise.resolve());
    });
  }

  function setQuantity(line, qty) {
    return fetch('/cart/change.js', {
      method: 'POST',
      headers: mark({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: line.key, quantity: qty })
    });
  }

  function removeLines(lines) {
    return lines.reduce(function (chain, line) {
      return chain.then(function () { return setQuantity(line, 0); });
    }, Promise.resolve());
  }

  function refreshCartUI() {
    dbg('re-render cart (our refresh)');
    document.dispatchEvent(new CustomEvent('cart:refresh'));

    // The theme's cart drawer is a <cart-items id="cart-items"> element with its own refresh method,
    // which re-renders lines, tracker and swatches without a reload.
    var cartItems = document.getElementById('cart-items');
    if (cartItems && typeof cartItems.renderAndShowItems === 'function') {
      try {
        var result = cartItems.renderAndShowItems(true);
        return (result && typeof result.then === 'function') ? result : Promise.resolve();
      } catch (e) {
        console.warn('[free-product] renderAndShowItems failed, falling back to generic refresh', e);
      }
    }

    return fetch('/cart?sections=cart-drawer,cart-icon-bubble,cart-live-region-text')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (sections) {
        if (!sections) return;
        Object.keys(sections).forEach(function (id) {
          var el = document.getElementById(id);
          if (!el) return;
          var tmp = document.createElement('div');
          tmp.innerHTML = sections[id];
          var replacement = tmp.querySelector('#' + id) || tmp.firstElementChild;
          if (replacement) el.replaceWith(replacement);
        });
      })
      .catch(function () {});
  }

  // Disables the gift lines' quantity stepper (matched by data-index = cart position).
  function lockQuantityControls(cart) {
    var inputs = document.querySelectorAll('input[name="updates[]"][data-index]');
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      var item = cart.items[parseInt(input.getAttribute('data-index'), 10) - 1];
      if (!item || !isGiftItem(item)) continue;

      input.readOnly = true;
      input.setAttribute('tabindex', '-1');
      input.setAttribute('aria-disabled', 'true');
      input.style.pointerEvents = 'none';

      var wrapper = input.closest('quantity-input') || input.parentElement;
      if (!wrapper) continue;
      var buttons = wrapper.querySelectorAll('button[name="plus"], button[name="minus"]');
      for (var b = 0; b < buttons.length; b++) {
        buttons[b].disabled = true;
        buttons[b].setAttribute('aria-disabled', 'true');
        buttons[b].style.opacity = '0.35';
        buttons[b].style.pointerEvents = 'none';
      }
    }
  }

  // Works out what every gift needs and runs it. Returns a promise if the cart was changed, else null.
  function applyRules(cart) {
    var t = totals(cart);
    var removes = [];
    var fixes = [];
    var adds = [];

    GIFTS.forEach(function (gift) {
      var lines = cart.items.filter(function (i) { return giftOf(i) === gift; });
      if (!qualifies(gift, t)) {
        removes = removes.concat(lines);
        return;
      }
      var want = chosenVariant(gift, lines);
      var keep = null;
      lines.forEach(function (l) { if (!keep && l.variant_id === want) keep = l; });
      lines.forEach(function (l) { if (l !== keep) removes.push(l); });
      if (!keep) adds.push(want);
      else if (keep.quantity !== 1) fixes.push(keep);
    });

    if (!removes.length && !fixes.length && !adds.length) return null;
    dbg('apply: remove ' + removes.length + ', fix ' + fixes.length + ', add ' + adds.length);
    return removeLines(removes)
      .then(function () {
        return fixes.reduce(function (chain, line) {
          return chain.then(function () { return setQuantity(line, 1); });
        }, Promise.resolve());
      })
      .then(function () { return addGifts(adds); });
  }

  function sync() {
    if (busy) { queued = true; return; }
    busy = true;
    getCart()
      .then(function (cart) {
        lockQuantityControls(cart);
        var change = applyRules(cart);
        if (!change) return;
        return change.then(refreshCartUI).then(getCart).then(lockQuantityControls);
      })
      .catch(function (err) { console.warn('[free-product] sync failed', err); })
      .finally(function () {
        busy = false;
        if (queued) { queued = false; sync(); }
      });
  }

  // Fast color swap: add the new color first (so the cart never has 0 of that gift), then remove the old
  // line. 3 requests (add, remove, re-render) instead of the full sync's 5.
  function swapGift(oldLine, variantId, chooser) {
    busy = true;
    postAdd([itemFor(variantId)])
      .then(function (r) {
        if (!r.ok) throw new Error('add failed ' + r.status);
        return setQuantity(oldLine, 0);
      })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        lastCart = cart;
        return refreshCartUI().then(function () { lockQuantityControls(cart); });
      })
      .catch(function (err) {
        console.warn('[free-product] swap failed, falling back to full sync', err);
        GIFTS.forEach(function (g) { try { sessionStorage.removeItem(choiceKey(g)); } catch (e) {} });
        queued = true;
      })
      .finally(function () {
        if (chooser) chooser.style.opacity = '';
        busy = false;
        if (queued) { queued = false; sync(); }
      });
  }

  // --- Color swatches ---
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-gift-swatch]');
    if (!btn) return;
    e.preventDefault();
    var variantId = Number(btn.getAttribute('data-variant-id'));
    var gift = null;
    GIFTS.forEach(function (g) { if (g.variantIds.indexOf(variantId) !== -1) gift = g; });
    if (!gift) return;
    try { sessionStorage.setItem(choiceKey(gift), String(variantId)); } catch (err) {}
    // Instant visual feedback, before any network call
    var all = btn.parentNode.querySelectorAll('[data-gift-swatch]');
    for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-pressed', all[i] === btn ? 'true' : 'false');

    var lines = lastCart ? lastCart.items.filter(function (it) { return giftOf(it) === gift; }) : [];
    if (!busy && lines.length === 1 && lines[0].variant_id !== variantId && qualifies(gift, totals(lastCart))) {
      var chooser = btn.closest('.gift-scarf-chooser');
      if (chooser) chooser.style.opacity = '0.6';
      swapGift(lines[0], variantId, chooser);
    } else {
      sync();
    }
  });

  // Matches /cart/add, /cart/change, /cart/update, /cart/clear with or without ".js" (this theme's
  // routes.cart_change_url / cart_update_url have no ".js").
  var CART_WRITE_RE = /\/cart\/(add|change|update|clear)(\.js)?(\?|$)/;
  function isCartWrite(url) {
    return CART_WRITE_RE.test(String(url || ''));
  }

  function updateDrawerEmptyState(cart) {
    var drawer = document.getElementById('drawer-cart');
    if (!drawer) return;
    var header = drawer.querySelector('.drawer-header');
    var isEmpty = (cart && typeof cart.item_count === 'number' && cart.item_count === 0) ||
                  !!drawer.querySelector('.empty-cart-notice');
    if (isEmpty) {
      drawer.classList.add('is-empty');
      if (header) header.classList.add('is-empty');
    } else {
      drawer.classList.remove('is-empty');
      if (header) header.classList.remove('is-empty');
    }
  }

  // Header gift tracker strip: re-renders the header section server-side (Section Rendering API) so the
  // strip is the exact same markup/messages as the cart tracker (cart-free-scarf-tracker.liquid).
  // Only fetches when the cart actually changed (subtotal / lines / quantities).
  var headerTrackerSig = null;
  var headerTrackerSeq = 0;
  function cartSignature(cart) {
    if (!cart || !cart.items) return 'empty';
    return cart.items_subtotal_price + '|' + cart.items.map(function (i) { return i.key + ':' + i.quantity; }).join(',');
  }
  // Live gift trackers outside the cart: the header strip and the homepage Freebie Section.
  // Each is re-rendered server-side (Section Rendering API, one request for all) so it always shows
  // exactly what the cart tracker shows.
  function liveTrackerTargets() {
    var targets = [];
    var strip = document.getElementById('HeaderTrackerStrip');
    if (strip && strip.getAttribute('data-section-id')) {
      targets.push({ id: strip.getAttribute('data-section-id'), selector: '#HeaderTrackerStrip .header-tracker-strip__inner' });
    }
    var sections = document.querySelectorAll('[data-live-tracker][data-section-id]');
    for (var i = 0; i < sections.length; i++) {
      var sid = sections[i].getAttribute('data-section-id');
      targets.push({ id: sid, selector: '#' + sections[i].id + ' [data-live-tracker-inner]' });
    }
    return targets;
  }
  function domTrackersMatchSubtotal(subtotal) {
    var want = String(subtotal || 0);
    var els = document.querySelectorAll('#HeaderTrackerStrip [data-cart-subtotal], [data-live-tracker] [data-cart-subtotal]');
    if (!els.length) return true;
    for (var i = 0; i < els.length; i++) {
      if (els[i].getAttribute('data-cart-subtotal') !== want) return false;
    }
    return true;
  }
  function updateHeaderTracker(cart) {
    var targets = liveTrackerTargets();
    if (!targets.length) return;
    if (cart === undefined) return; // page load: server-rendered markup is already correct
    var sig = cartSignature(cart);
    var domMatches = domTrackersMatchSubtotal(cart.items_subtotal_price);
    if (headerTrackerSig === null && domMatches) { headerTrackerSig = sig; return; } // first known cart matches DOM
    if (sig === headerTrackerSig && domMatches) return;
    headerTrackerSig = sig;
    var ids = [];
    targets.forEach(function (t) { if (ids.indexOf(t.id) === -1) ids.push(t.id); });
    var seq = ++headerTrackerSeq;
    var root = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';
    fetch(root + '?sections=' + ids.slice(0, 5).map(encodeURIComponent).join(','), { headers: mark({}) })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (seq !== headerTrackerSeq || !json) return;
        targets.forEach(function (t) {
          if (!json[t.id]) return;
          var doc = new DOMParser().parseFromString(json[t.id], 'text/html');
          var fresh = doc.querySelector(t.selector);
          var current = document.querySelector(t.selector);
          if (fresh && current) {
            current.innerHTML = fresh.innerHTML;
            if (fresh.hasAttribute('data-cart-subtotal')) {
              current.setAttribute('data-cart-subtotal', fresh.getAttribute('data-cart-subtotal'));
            }
          }
        });
      })
      .catch(function (err) { console.warn('[free-product] live tracker refresh failed', err); });
  }

  // True when the cart has lines but every one of them is a free gift (paid items are gone).
  function onlyFreeLines(cart) {
    return !!cart && cart.items && cart.items.length > 0 && cart.items.every(isGiftItem);
  }

  // Instantly empty a cart that only holds free gifts: one request, no extra cart read.
  function clearFree() {
    if (busy) { queued = true; return; }
    busy = true;
    fetch('/cart/clear.js', { method: 'POST', headers: mark({ 'Content-Type': 'application/json' }) })
      .then(function () {
        lastCart = null;
        updateHeaderTracker({ items: [], items_subtotal_price: 0 });
        return refreshCartUI();
      })
      .catch(function (err) { console.warn('[free-product] clear failed', err); })
      .finally(function () {
        busy = false;
        if (queued) { queued = false; sync(); }
      });
  }

  // Reads the cart JSON returned by a theme cart write (change/update/clear return the full cart;
  // add returns only the added lines, so it has no item_count) and reacts immediately.
  function onCartWrite(cart) {
    if (cart && typeof cart.item_count === 'number') {
      lastCart = cart;
      ensureCartCompareAtPrices(cart);
      updateDrawerEmptyState(cart);
      updateHeaderTracker(cart);
      if (onlyFreeLines(cart)) { clearFree(); return; }
    }
    sync();
  }

  // Waits (max ~5 s) until a running sync finishes.
  function waitIdle() {
    return new Promise(function (resolve) {
      var waited = 0;
      (function check() {
        if (!busy || waited > 5000) return resolve();
        waited += 50;
        setTimeout(check, 50);
      })();
    });
  }

  // Runs the rules right now WITHOUT re-rendering: used while the theme's own add-to-cart response is
  // being held, so the theme's single render already contains the free gifts.
  function ensureBeforeRender() {
    if (busy) return waitIdle();
    busy = true;
    dbg('ensure gifts before theme render');
    return getCart()
      .then(function (cart) {
        var change = applyRules(cart);
        return change ? change.then(getCart) : null;
      })
      .catch(function (err) { console.warn('[free-product] pre-render sync failed', err); })
      .finally(function () {
        busy = false;
        dbg('ensure done');
        if (queued) { queued = false; sync(); }
      });
  }

  // --- Patch fetch: AJAX add-to-cart from home page, PDP, sticky ATC, cart drawer, etc. ---
  var originalFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isOwn = init && init.headers && (init.headers[SYNC_HEADER] || (init.headers.get && init.headers.get(SYNC_HEADER)));
    var promise = originalFetch.apply(this, arguments);
    if (DEBUG && /section_id=/.test(url)) dbg('theme/section render request: ' + url);
    if (!isOwn && /\/cart\.js(\?|$)/.test(url)) {
      return promise.then(function (res) {
        if (!res || !res.ok) return res;
        return res.clone().json().then(function (cart) {
          ensureCartCompareAtPrices(cart);
          enrichCartForRazorpay(cart);
          return new Response(JSON.stringify(cart), {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers
          });
        }, function () { return res; });
      });
    }
    if (isCartWrite(url) && !isOwn) {
      pendingWrites++;
      var isAdd = /\/cart\/add/.test(url);
      var settle = function () { pendingWrites = Math.max(0, pendingWrites - 1); };
      return promise.then(function (res) {
        if (isAdd) {
          // Hold the theme's add response until the gifts are in (capped at 4 s), so the theme's own
          // re-render shows the product AND the gifts in one go instead of 2-3 reloads.
          var held = res.ok ? Promise.race([ensureBeforeRender(), new Promise(function (r) { setTimeout(r, 4000); })]) : Promise.resolve();
          return held.then(function () {
            settle();
            dbg('release theme add response');
            setTimeout(sync, 1500); // backstop check; does nothing if the cart is already right
            return res;
          });
        }
        settle();
        res.clone().json().then(onCartWrite, function () { sync(); });
        return res;
      }, function (err) { settle(); throw err; });
    }
    return promise;
  };

  // --- Patch XMLHttpRequest: some themes/apps still use XHR for cart calls ---
  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__freeProductCartWrite = isCartWrite(url);
    this.__freeProductIsAdd = /\/cart\/add/.test(String(url || ''));
    return originalOpen.apply(this, arguments);
  };
  var originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (this.__freeProductCartWrite) {
      var xhr = this;
      this.addEventListener('loadend', function () {
        var cart = null;
        if (!xhr.__freeProductIsAdd && (xhr.responseType === '' || xhr.responseType === 'text')) {
          try { cart = JSON.parse(xhr.responseText); } catch (e) {}
        }
        onCartWrite(cart);
      });
    }
    return originalSend.apply(this, arguments);
  };

  // --- Checkout guard: never let Buy Now / Checkout run on a cart that only holds free gifts
  // (Razorpay shows "Your cart is empty" for a zero-value cart). Capture phase, so this runs before the
  // Razorpay button's own handler. If a theme cart write is still in flight the click is also held back;
  // the customer can simply click again once the cart has settled. ---
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest(
      'button[name="checkout"], [name="checkout"], magic-checkout-btn, .magic-cart-btn, .magic-cart-btn__parent, a[href*="/checkout"]'
    );
    if (!t) return;
    if (pendingWrites > 0 || onlyFreeLines(lastCart)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (onlyFreeLines(lastCart)) clearFree(); else sync();
    }
  }, true);

  // --- Plain (non-AJAX) <form action="/cart/add"> submit that causes a real page load ---
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form && form.action && form.action.indexOf('/cart/add') !== -1) {
      try { sessionStorage.setItem('freeProductPendingSync', '1'); } catch (err) {}
    }
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    updateDrawerEmptyState();
    updateHeaderTracker();
    var drawer = document.getElementById('drawer-cart');
    if (drawer && window.MutationObserver) {
      var mo = new MutationObserver(function () { updateDrawerEmptyState(lastCart); });
      mo.observe(drawer, { childList: true, subtree: true });
    }
    sync();
    try {
      if (sessionStorage.getItem('freeProductPendingSync')) {
        sessionStorage.removeItem('freeProductPendingSync');
        sync();
      }
    } catch (e) {}
  });

  ['cart:updated', 'cart:refresh', 'cart:build', 'CartUpdate'].forEach(function (evt) {
    document.addEventListener(evt, function () { sync(); });
  });
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      headerTrackerSig = null;
      sync();
    }
  });

  // Backstop: other scripts may overwrite fetch/XHR after this file runs, so re-check periodically
  // (skipped while the tab is hidden).
  setInterval(function () { if (!document.hidden) sync(); }, 8000);
})();
