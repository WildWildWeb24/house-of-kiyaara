/**
 * Checkout guard (2026-11-02). Blocks checkout ONLY when:
 *   free: cart has items but total is Rs0 / no line priced above Rs0 / only free gifts
 *   busy: a cart update is in flight (theme qty change, freebie sync, or a qty edit waiting for the debounce)
 * Listens on window in the CAPTURE phase for submit (form#cart) and click (checkout buttons, Magic buttons),
 * so it runs before Magic Checkout's own handlers and also catches Enter-key submits and re-rendered buttons.
 * When no reason applies it does nothing (no preventDefault), so Magic Checkout handles normal carts as before.
 * Cart state comes from [data-checkout-guard] in snippets/cart-footer.liquid (re-rendered on every cart change)
 * plus window.HOKFreeProduct (assets/free-product.js) when the freebie engine is active.
 */
(function () {
  if (window.__hokCheckoutGuard) return;
  window.__hokCheckoutGuard = true;

  var CLICK_SELECTOR = 'button[name="checkout"], input[name="checkout"], magic-checkout-btn, .magic-cart-btn, .magic-cart-btn__parent, a[href*="/checkout"]';
  var QTY_BUSY_MS = 3000;
  var lastQtyEdit = 0;

  ['input', 'change'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      var t = e.target;
      if (t && t.matches && t.matches('input[name="updates[]"]')) lastQtyEdit = Date.now();
    }, true);
  });

  function num(v) { var n = Number(v); return isNaN(n) ? -1 : n; }

  function reason() {
    var fp = window.HOKFreeProduct;
    var m = document.querySelector('[data-checkout-guard]');
    if (fp && typeof fp.isOnlyFree === 'function' && fp.isOnlyFree()) return 'free';
    if (m && num(m.getAttribute('data-item-count')) > 0 &&
        (num(m.getAttribute('data-total')) === 0 || num(m.getAttribute('data-paid-lines')) === 0)) return 'free';
    if (document.querySelector('cart-items.is-processing')) return 'busy';
    if (fp && typeof fp.isBusy === 'function' && fp.isBusy()) return 'busy';
    // Replaced (2026-11-02-freebie-fix): previously had no QTY_BUSY_MS cap on input[name="updates[]"] mismatch:
    // var q = document.querySelectorAll('input[name="updates[]"]');
    // for (var i = 0; i < q.length; i++) {
    //   if (q[i].type !== 'hidden' && q[i].value !== q[i].getAttribute('value')) return 'busy';
    // }
    if (lastQtyEdit > 0 && Date.now() - lastQtyEdit < QTY_BUSY_MS) {
      var q = document.querySelectorAll('input[name="updates[]"]');
      for (var i = 0; i < q.length; i++) {
        if (q[i].type !== 'hidden' && q[i].value !== q[i].getAttribute('value')) return 'busy';
      }
    }
    return null;
  }

  function showMessage(r) {
    var el = document.querySelector('[data-checkout-guard-msg]');
    if (!el) return;
    var text = r === 'free' ? el.getAttribute('data-msg-free') : el.getAttribute('data-msg-busy');
    if (!text) return;
    el.textContent = text;
    el.hidden = false;
  }

  function block(e, r) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    showMessage(r);
    if (r === 'free' && window.HOKFreeProduct && typeof window.HOKFreeProduct.resync === 'function') {
      try { window.HOKFreeProduct.resync(); } catch (err) {}
    }
  }

  window.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest(CLICK_SELECTOR);
    if (!t) return;
    var r = reason();
    if (r) block(e, r);
  }, true);

  window.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.id !== 'cart') return;
    var s = e.submitter;
    if (s && s.name && s.name !== 'checkout') return; // not a checkout submission
    var r = reason();
    if (r) block(e, r);
  }, true);
})();
