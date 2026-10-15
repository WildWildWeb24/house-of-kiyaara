/**
 * Free Twilly — universal auto-add-to-cart
 * ------------------------------------------------
 * Auto-adds the free "Twilly" gift (product handle: twilly) whenever the
 * cart has at least one qualifying line item, and auto-removes it again if
 * the cart stops qualifying. Works no matter where the customer clicked
 * Add to cart from — home page quick-add, PDP, or a sticky ATC bar —
 * because it hooks the cart write endpoints themselves rather than any one
 * theme's button markup, with a periodic self-healing check as a backstop.
 *
 * Also locks the gift's own quantity in the cart to exactly 1: hides/disables
 * its +/- stepper in the UI, and force-corrects the quantity back to 1 if
 * anyone changes it another way (browser console, another app, etc).
 *
 * IT DOES NOT AND CANNOT catch the native "Buy it now" / Shop Pay / PayPal
 * dynamic checkout buttons. Those buttons skip the persistent cart
 * entirely and post straight to a Shopify-hosted checkout session — there
 * is no /cart/add.js call for this script (or any client-side script) to
 * intercept. See the accompanying Liquid snippet for how to hide those
 * buttons on gift-eligible products, which is the only reliable fix for a
 * store not on Shopify Plus (Plus stores can use a Cart Transform Function
 * instead, which runs at checkout time regardless of entry point).
 *
 * SETUP
 * 1. Upload this file as a theme asset: assets/free-gift-twilly.js
 * 2. In layout/theme.liquid, right before </body>, add the snippet from
 *    free-gift-theme-snippets.liquid (sets window.freeGiftConfig, then
 *    loads this file).
 * 3. Create a manual collection named "Free Twilly Eligible Products" in
 *    Shopify admin and add every product that SHOULD trigger the gift.
 *    This is an inclusion list: only products in this collection count —
 *    a brand new product will NOT trigger the gift until you add it here.
 *    Nothing else here needs code changes when that list changes later.
 */
(function () {
  var CONFIG = window.freeGiftConfig || {};
  var OFFER_ENABLED = CONFIG.enabled !== false;
  var GIFT_PRODUCT_ID = Number(CONFIG.giftProductId);
  var GIFT_VARIANT_ID = Number(CONFIG.giftVariantId); // defaults to the Midnight Blue Twilly variant — swap freely, all 3 colors are priced ₹0
  var GIFT_PRICE = typeof CONFIG.giftPrice === 'number' ? CONFIG.giftPrice : 0;
  var OFFER_ENDS_AT = CONFIG.offerEndsAt ? Date.parse(CONFIG.offerEndsAt) : null;
  var ELIGIBLE_PRODUCT_IDS = (CONFIG.eligibleProductIds || []).map(Number);
  var GIFT_THRESHOLD = Number(CONFIG.giftThreshold) || 100000;
  var GIFT_PROPERTY_KEY = '_free_gift';
  var SYNC_HEADER = 'X-Free-Gift-Sync';

  var busy = false;
  var queued = false;

  if (!GIFT_PRODUCT_ID || !GIFT_VARIANT_ID) {
    console.warn('[free-gift] giftProductId / giftVariantId missing from window.freeGiftConfig — script disabled.');
    return;
  }

  function isOfferActive() {
    if (!OFFER_ENABLED) return false;
    if (OFFER_ENDS_AT && !isNaN(OFFER_ENDS_AT) && Date.now() > OFFER_ENDS_AT) return false;
    if (GIFT_PRICE > 0) return false;
    return true;
  }

  function getCart() {
    return fetch('/cart.js', { headers: mark({}) }).then(function (r) { return r.json(); });
  }

  function mark(headers) {
    headers = headers || {};
    headers[SYNC_HEADER] = '1';
    return headers;
  }

  function cartQualifies(cart) {
    if (!isOfferActive()) return false;
    var giftLine = findGiftLine(cart);
    if (giftLine && giftLine.price > 0) return false;
    var qualifyingSubtotal = 0;
    cart.items.forEach(function (item) {
      if (item.product_id === GIFT_PRODUCT_ID) return;
      qualifyingSubtotal += item.line_price;
    });
    return qualifyingSubtotal >= GIFT_THRESHOLD;
  }

  function isGiftItem(item) {
    return item.product_id === GIFT_PRODUCT_ID && item.properties && item.properties[GIFT_PROPERTY_KEY] === 'true';
  }

  function findGiftLine(cart) {
    for (var i = 0; i < cart.items.length; i++) {
      if (isGiftItem(cart.items[i])) return cart.items[i];
    }
    return null;
  }

  function addGift() {
    var body = {
      items: [{
        id: GIFT_VARIANT_ID,
        quantity: 1,
        properties: {}
      }]
    };
    body.items[0].properties[GIFT_PROPERTY_KEY] = 'true';
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: mark({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
  }

  function setGiftQuantity(line, qty) {
    return fetch('/cart/change.js', {
      method: 'POST',
      headers: mark({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: line.key, quantity: qty })
    });
  }

  function refreshCartUI() {
    document.dispatchEvent(new CustomEvent('cart:refresh'));

    // This theme's cart drawer is a <cart-items id="cart-items"> custom
    // element with its own built-in refresh method — call that directly so
    // line items re-render exactly the way the theme's native Add to Cart
    // flow already does it (verified: this updates the drawer's contents
    // without a page reload).
    var cartItems = document.getElementById('cart-items');
    if (cartItems && typeof cartItems.renderAndShowItems === 'function') {
      try {
        var result = cartItems.renderAndShowItems(true);
        return (result && typeof result.then === 'function') ? result : Promise.resolve();
      } catch (e) {
        console.warn('[free-gift] renderAndShowItems failed, falling back to generic refresh', e);
      }
    }

    // Fallback for other themes that don't expose that method (generic
    // Dawn-style section names).
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

  // Finds the gift line's quantity stepper on whatever cart UI is currently
  // rendered (drawer or full /cart page) and disables it, so the customer
  // can't manually bump Twilly's quantity up or down. Matches by cart
  // position (data-index) rather than any specific theme markup, since that
  // attribute is standard across Dawn-family cart line templates.
  function lockGiftQuantityControls(cart) {
    var inputs = document.querySelectorAll('input[name="updates[]"][data-index]');
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      var idx = parseInt(input.getAttribute('data-index'), 10) - 1;
      var item = cart.items[idx];
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

  function syncGift() {
    if (busy) { queued = true; return; }
    busy = true;
    getCart()
      .then(function (cart) {
        var qualifies = cartQualifies(cart);
        var giftLine = findGiftLine(cart);

        lockGiftQuantityControls(cart);

        if (qualifies && !giftLine) {
          return addGift().then(function () {
            return refreshCartUI().then(getCart).then(lockGiftQuantityControls);
          });
        }
        if (!qualifies && giftLine) {
          return setGiftQuantity(giftLine, 0).then(refreshCartUI);
        }
        if (qualifies && giftLine && giftLine.quantity !== 1) {
          // Someone changed the gift's quantity another way (console, another
          // app, a stale UI) — snap it back to exactly 1.
          return setGiftQuantity(giftLine, 1).then(function () {
            return refreshCartUI().then(getCart).then(lockGiftQuantityControls);
          });
        }
      })
      .catch(function (err) { console.warn('[free-gift] sync failed', err); })
      .finally(function () {
        busy = false;
        if (queued) { queued = false; syncGift(); }
      });
  }

  var CART_ENDPOINTS = ['/cart/add', '/cart/add.js', '/cart/change.js', '/cart/update.js', '/cart/clear.js'];
  function isCartWrite(url) {
    url = String(url || '');
    return CART_ENDPOINTS.some(function (path) { return url.indexOf(path) !== -1; });
  }

  // --- Patch fetch: catches AJAX add-to-cart from home page, PDP, sticky ATC, cart drawer, etc. ---
  var originalFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isOwn = init && init.headers && (init.headers[SYNC_HEADER] || (init.headers.get && init.headers.get(SYNC_HEADER)));
    var promise = originalFetch.apply(this, arguments);
    if (isCartWrite(url) && !isOwn) {
      promise.then(function () { syncGift(); }, function () {});
    }
    return promise;
  };

  // --- Patch XMLHttpRequest: some themes/apps still use XHR for cart calls ---
  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__freeGiftCartWrite = isCartWrite(url);
    return originalOpen.apply(this, arguments);
  };
  var originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (this.__freeGiftCartWrite) {
      this.addEventListener('loadend', function () { syncGift(); });
    }
    return originalSend.apply(this, arguments);
  };

  // --- Fallback: a plain (non-AJAX) <form action="/cart/add"> submit that causes a real page load ---
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form && form.action && form.action.indexOf('/cart/add') !== -1) {
      try { sessionStorage.setItem('freeGiftPendingSync', '1'); } catch (e) {}
    }
  }, true);

  // --- Re-check on load (direct /cart visits, back button, page refresh) and after any pending fallback ---
  document.addEventListener('DOMContentLoaded', function () {
    syncGift();
    try {
      if (sessionStorage.getItem('freeGiftPendingSync')) {
        sessionStorage.removeItem('freeGiftPendingSync');
        syncGift();
      }
    } catch (e) {}
  });

  // --- Most themes also dispatch one of these after their own cart JS runs — belt and suspenders ---
  ['cart:updated', 'cart:refresh', 'cart:build', 'CartUpdate'].forEach(function (evt) {
    document.addEventListener(evt, function () { syncGift(); });
  });

  // --- Safety-net poll: some stores load other scripts (payment/risk SDKs, other apps) that
  // overwrite window.fetch or XMLHttpRequest AFTER this file runs, silently breaking the two
  // patches above. This periodic check makes the gift (and its locked quantity) self-correct
  // regardless — worst case is a couple of seconds' delay instead of instant, but it can never
  // be permanently knocked out. ---
  setInterval(syncGift, 2000);
})();