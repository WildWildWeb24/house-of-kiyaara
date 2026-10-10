if (customElements.get('quick-view') === undefined) {

  customElements.define('quick-view', class QuickView extends HTMLElement {
    constructor() {
      'use strict';
      super();

      this.processingQuickViewRequest = false;
      this.button = this.querySelector('button');

      if (!this.button) {
        console.error('Quick view button not found');
        return;
      }

      this.quickViewTargetId = this.button.dataset.open;
      this.quickViewProductHandle = this.button.dataset.productHandle;

      // Extract product ID from modal/drawer ID (format: modal-{productId}-product or drawer-{productId}-product)
      const targetIdMatch = this.quickViewTargetId.match(/(?:modal|drawer)-(\d+)-product/);
      const productId = targetIdMatch ? targetIdMatch[1] : this.quickViewProductHandle;

      // Set missing dataset properties
      this.dataset.product = productId;
      this.dataset.url = this.button.dataset.url || window.location.origin + '/products/' + this.quickViewProductHandle;

      this.button.addEventListener('click', this.onQuickViewRequest.bind(this));
    }

    async onQuickViewRequest(event) {
      event.preventDefault();
      if (this.processingQuickViewRequest === true) {
        return;
      }

      this.button.classList.add('loading');

      // Check if the view already exists -> Open it
      const currentQuickView = document.getElementById(this.quickViewTargetId);
      if (currentQuickView) {
        Woolman.ModalsAndDrawers.showModalOrDrawer(this.quickViewTargetId);
        this.button.classList.remove('loading');
        return;
      }

      // If the view does not exist, fetch it
      this.processingQuickViewRequest = true;

      // Remove any existing quick views to prevent duplicates
      document.querySelectorAll('[data-quick-view]').forEach((quickView) => {
        quickView.remove();
      });

      try {
        const rootUrl = window.routes.root == '/' ? '/' : window.routes.root + '/';
        const res = await fetch(`${rootUrl}products/${this.quickViewProductHandle}?view=quick-view`);

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const quickViewElement = doc.body.firstChild;
        document.body.appendChild(quickViewElement);

        if (window.ProductModel) window.ProductModel.loadShopifyXR();

        this.quickView = quickViewElement;
        this.hookEvents();

        setTimeout(() => {
          this.button.classList.remove('loading');
          Woolman.ModalsAndDrawers.showModalOrDrawer(this.quickViewTargetId);
        }, 100);
      } catch (error) {
        console.error('Error loading quick view:', error);
        this.button.classList.remove('loading');
        this.processingQuickViewRequest = false;
      }
    }

    hookEvents() {
      const closeButton = this.quickView.querySelector('[data-close]');
      if (closeButton) {
        closeButton.addEventListener('click', (e) => {
          Woolman.ModalsAndDrawers.closeModalOrDrawerOrDrawerFromEvent(e);
          setTimeout(() => this.cleanupQuickView(), 300);
        });
      }

      const overlay = this.quickView.querySelector('[data-overlay]');
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          Woolman.ModalsAndDrawers.closeModalOrDrawerOrDrawerFromEvent(e);
          setTimeout(() => this.cleanupQuickView(), 300);
        });
      }

      const productForm = document.getElementById(`product-form-${this.dataset.product}`);
      if (productForm) {
        productForm.addEventListener('submit', this.handleSubmit.bind(this));
      }

      this.processingQuickViewRequest = false;
    }

    async handleSubmit() {
      const overlay = this.quickView.querySelector('[data-overlay]');
      if (overlay) {
        overlay.click();
      }
      Woolman.ModalsAndDrawers.closeModalOrDrawer(this.quickViewTargetId);

      // Clean up the quick view after a short delay to allow the modal/drawer to close
      setTimeout(() => {
        this.cleanupQuickView();
      }, 300);
    }

    cleanupQuickView() {
      if (this.quickView && this.quickView.parentNode) {
        // Remove event listeners before removing the element

        const closeButton = this.quickView.querySelector('[data-close]');
        if (closeButton) {
          closeButton.removeEventListener('click', Woolman.ModalsAndDrawers.closeModalOrDrawerOrDrawerFromEvent);
        }

        const overlay = this.quickView.querySelector('[data-overlay]');
        if (overlay) {
          overlay.removeEventListener('click', Woolman.ModalsAndDrawers.closeModalOrDrawerOrDrawerFromEvent);
        }

        const productForm = document.getElementById(`product-form-${this.dataset.product}`);
        if (productForm) {
          productForm.removeEventListener('submit', this.handleSubmit.bind(this));
        }

        this.quickView.remove();
        this.quickView = null;
      }
    }
  });

}

if (customElements.get('quick-add') === undefined) {

  customElements.define('quick-add', class QuickAdd extends HTMLElement {
    constructor() {
      'use strict';
      super();

      this.button = this.querySelector('button');
      this.variantId = this.dataset.variantId;
      this.productId = this.dataset.productId;
      this.cartNotification = document.getElementById('cart-notification');
      this.cartNotificationItem = document.getElementById('cart-notification-item');

      this.button.addEventListener('click', this.quickAddToCart.bind(this));
    }

    async quickAddToCart(event) {
      event.preventDefault();

      if (!this.variantId) {
        console.warn('No variant ID found on the add to cart button');
        return;
      }

      const rootUrl = window.routes.root == '/' ? '/' : window.routes.root + '/';
      const formData = {
        'items': [{
          'id': this.variantId,
          'quantity': 1
        }]
      };

      this.button.setAttribute('disabled', true);
      this.button.classList.add('loading');

      try {
        const response = await fetch(rootUrl + 'cart/add.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formData)
        });

        const json = await response.json();

        if (!response.ok) {
          const errorMessage = typeof json.description === 'string' ? json.description : json.message;
          this.showTooltip(errorMessage);
          throw new Error(`Network response was not ok: ${errorMessage}`);
        }

        if (this.cartNotification) {
          const activeElement = document.activeElement;
          const insideQuickBuy = activeElement && activeElement.closest('.drawer--quick-buy');
          const fallbackFocusTarget = document.querySelector('#MainContent') || document.body;

          this.previouslyFocusedElement = insideQuickBuy ? fallbackFocusTarget : activeElement;

          // Response structure: { "items": [ {...line item...} ] }
          // Get the first line item from the items array
          const cartData = json.items && json.items.length > 0 ? json.items[0] : json;

          this.showCartNotification(cartData);
        }

        const event = new CustomEvent('ajaxProduct:added', {
          detail: { productId: this.productId }
        });
        document.dispatchEvent(event);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        this.button.classList.remove('loading');
        this.button.removeAttribute('disabled');
      }
    }

    showTooltip(message) {
      let tooltip = this.querySelector('.tooltip');
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'tooltip size--tiny style--error';
        this.appendChild(tooltip);
      }
      tooltip.textContent = message;
      tooltip.style.display = 'block';
      setTimeout(() => {
        tooltip.style.display = 'none';
      }, 4000);
    }

    createNotificationItem(product, template) {
      // Define template elments
      const image_elem = template.querySelector('[data-image]');
      const title_elem = template.querySelector('[data-title]');
      const properties_elem = template.querySelector('[data-properties]');
      const price_elem = template.querySelector('[data-price]');

      // Format line item image URL if image exists
      if (product.image && image_elem) {
        const filename = product.image.split('/').pop();
        const lastDotIndex = filename.lastIndexOf('.');
        const newFilename = `${filename.substring(0, lastDotIndex)}_120x${filename.substring(lastDotIndex)}`;
        const url = product.image.replace(filename, newFilename);
        image_elem.setAttribute('src', url);
        image_elem.classList.remove('hide');
      } else if (image_elem) {
        image_elem.classList.add('hide');
      }

      // Fill template elements with product data
      if (title_elem) {
        title_elem.textContent = product.product_title || '';
      }

      if (price_elem && product.price) {
        price_elem.textContent = Woolman.Utils.formatMoney(product.price);
      }

      if (properties_elem && !product.product_has_only_default_variant && product.options_with_values) {
        product.options_with_values.forEach(item => {
          const row = document.createElement("div");
          const nameCell = document.createElement("dt");
          const valueCell = document.createElement("dd");

          nameCell.textContent = item.name + ':';
          valueCell.textContent = item.value;

          row.appendChild(nameCell);
          row.appendChild(valueCell);
          row.classList.add('product-option', 'size--tiny', 'style--subdued');
          properties_elem.appendChild(row);
        })
      }

      return template;
    }

    showCartNotification(cartJson) {
      const notificationTemplate = document.importNode(this.cartNotification.content, true);
      const notificationItemTemplate = document.importNode(this.cartNotificationItem.content, true);

      notificationTemplate.querySelector('[data-notification-title]').textContent = window.variantStrings.itemAdded;
      const singleItem = this.createNotificationItem(cartJson, notificationItemTemplate);
      notificationTemplate.querySelector('[data-items]').appendChild(singleItem);

      if (document.querySelector('.cart-notification')) {
        document.querySelector('.cart-notification').remove();
      }

      document.querySelector('.site-header').appendChild(notificationTemplate);
      const the_notification = document.querySelector('.cart-notification');

      // Set focus to the notification for accessibility
      the_notification.setAttribute('tabindex', '-1');
      the_notification.focus();

      the_notification.querySelector('.notification-close').addEventListener('click', () => {
        the_notification.classList.remove('anim-in');
        if (this.previouslyFocusedElement && this.previouslyFocusedElement.focus) {
          this.previouslyFocusedElement.focus();
        }
      });
      setTimeout(() => {
        the_notification.classList.add('anim-in');
      }, 50);
    }
  });

}
