class CartRemoveButton extends HTMLElement {
  constructor() {
    super();
    this.addEventListener('click', (event) => {
      event.preventDefault();
      this.closest('cart-items').updateQuantity(this.dataset.index, 0);
    });
  }
}
customElements.define('cart-remove-button', CartRemoveButton);

class CartItems extends HTMLElement {
  constructor() {
    super();

    // helper variables
    this.cartTotalValue = 0;
    this.cartTotalDiscount = 0;
    this.cartOriginalPrice = 0;

    // Cart type related
    this.showModalOnAdd = false;
    this.addToCartType = document.documentElement.getAttribute('data-add-to-cart-type');
    if (this.addToCartType === 'drawer') this.showModalOnAdd = true;

    // elements
    this.lineItemStatusElement = document.getElementById('shopping-cart-line-item-status');
    this.currentItemCount = Array.from(this.querySelectorAll('[name="updates[]"]')).reduce((total, quantityInput) => total + parseInt(quantityInput.value), 0);

    // Init items from API to prevent cart content missmatch on browser back/forward commands
    this.renderAndShowItems(false);

    // events
    this.debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, 300);
    this.addEventListener('change', this.debouncedOnChange.bind(this));

    // dev events
    document.addEventListener('ajaxProduct:added', () => {
      this.renderAndShowItems(this.showModalOnAdd);
    })
  }

  /**
   *  Debounced onChange event handler. Updates the cart when the user stops clicking quantity buttons.
   * @param {*} event
   */
  onChange(event) {
    this.updateQuantity(event.target.dataset.index, event.target.value, document.activeElement.getAttribute('name'));
  }

  /**
   * Returns an array of sections to render when the cart is updated. Limit: 5 sections.
   * Does not make the request to the server, only returns the section names to render.
   * @see https://shopify.dev/api/ajax/reference/cart#bundled-section-rendering
   * @returns {Array} Array of sections to render
   */
  getSectionItemsToRender() {
    return ['cart-items', 'cart-shipping-notification', 'cart-note', 'cart-footer'];
  }

  /**
   * This function is always called when the cart is updated.
   * @param {string} newHTML
   * @param {Array} skipSections - Optional array of section names to skip in the render process
   */
  updateCartSections(newHTML, skipSections = []) {
    this.getSectionItemsToRender().forEach((item) => {
      if (skipSections.includes(item)) return; // Skip rendering for sections in the skipSections array

      const elementToReplace = document.getElementById(item);

      if (!elementToReplace) return;

      // replace old with new
      elementToReplace.innerHTML = newHTML.getElementById(item).innerHTML;
    });
  }

  /**
   * Fetches fresh sections from the server and updates the cart. This is called when item is added to cart.
   * @see https://shopify.dev/api/ajax/reference/cart#bundled-section-rendering
   * @returns {Promise} Promise that resolves when the cart is updated
   */
  async renderAndShowItems(showDrawer) {
    const parentDrawer = this.closest('[data-drawer]');

    fetch(`${routes.cart_url}?section_id=main-cart`)
      .then((response) => response.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        this.updateCartSections(html);

        if (!parentDrawer || !showDrawer) return;
        Woolman.ModalsAndDrawers.showModalOrDrawer(parentDrawer.getAttribute('id'))
      })
      .catch((e) => {
        console.error(e);
      });
  }

  /**
   * Updates the quantity of a line item in the cart. This is called when the user changes the quantity of an item in the cart.
   * @param {*} line
   * @param {*} quantity
   * @param {*} name
   */
  async updateQuantity(line, quantity, name) {
    this.enableLoading(line);
    fetch(`${routes.cart_change_url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: `application/json`,
      },
      body: JSON.stringify({
        line: line,
        quantity: quantity,
        sections: 'main-cart',
        sections_url: window.location.pathname,
      }),
    })
      .then((response) => response.json())
      .then((responseJson) => {

        const quantityElement = document.getElementById(`Quantity-${line}`);

        if (responseJson.errors) {
          quantityElement.value = quantityElement.getAttribute('value');
          this.updateLiveRegions(line, responseJson.errors);
          return;
        }

        const event = new CustomEvent('cart:update', { detail: responseJson, });
        document.dispatchEvent(event);

        // Render new items according to response
        const html = new DOMParser().parseFromString(responseJson.sections['main-cart'], 'text/html');
        if (responseJson.item_count === 0) {
          // Update the cart with all sections
          this.updateCartSections(html);
        } else {
          // Update the cart section, but skip the recommendations and note sections
          this.updateCartSections(html, ['cart-note']);
        }

        const lineItem = document.getElementById(`CartItem-${line}`);
        if (lineItem && lineItem.querySelector(`[name="${name}"]`)) lineItem.querySelector(`[name="${name}"]`).focus();
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        this.disableLoading();
      });
  }

  /**
   * Updates the live regions for the cart.
   * @param {*} line
   * @param {*} message
   */
  updateLiveRegions(line, message) {
    const lineItemError =
      document.getElementById(`Line-item-error-${line}`) || document.getElementById(`CartDrawer-LineItemError-${line}`);
    if (lineItemError) {
      lineItemError.querySelector('.cart-item__error-text').innerHTML = message;
      lineItemError.classList.remove('hide');
    }

    this.lineItemStatusElement.setAttribute('aria-hidden', true);

    const cartStatus = document.getElementById('cart-live-region-text');
    cartStatus.setAttribute('aria-hidden', false);

    setTimeout(() => {
      cartStatus.setAttribute('aria-hidden', true);
    }, 1000);
  }

  enableLoading(line) {
    const lineItem = document.getElementById(`CartItem-${line}`);
    this.classList.add('is-processing');
    lineItem.classList.add('loading');
    document.activeElement.blur();
  }

  disableLoading() {
    this.classList.remove('is-processing');
    this.querySelectorAll('.loading').forEach((el) => el.classList.remove('loading'));
  }
}
customElements.define('cart-items', CartItems);

if (!customElements.get('cart-note')) {
  customElements.define('cart-note', class CartNote extends HTMLElement {
    constructor() {
      super();

      this.addEventListener('keyup', debounce((event) => {
        const body = JSON.stringify({ note: event.target.value });
        fetch(`${routes.cart_update_url}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: `application/json`,
          },
          ...{ body }
        });
      }, 300))
    }
  });
};
