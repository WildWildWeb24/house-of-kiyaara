if (!customElements.get('newsletter-popup')) {
  customElements.define('newsletter-popup', class ProductModel extends HTMLElement {
    constructor() {
      super();

      this.key = this.dataset.storageKey;
      this.canSetKey = false;

      // Debug
      // console.log(this.dataset)

      // Check first if we have test mode
      if (this.dataset.testMode === 'true') {
        this.openPopupWithDelay(0);
        return;
      }

      // Check if we have form and if user posted the form
      this.form = this.querySelector('form');
      if (this.form && window.location.href.includes(`customer_posted=true#${this.form.id}`) && !sessionStorage.getItem(this.key + '_submitted')) {
        sessionStorage.setItem(this.key + '_submitted', true);
        this.openPopupWithDelay(0);
        return;
      }

      // Check if we can open the popup at all
      // First we check if frequency is per session and if session storage has the key
      if (this.dataset.frequency === 'once' && sessionStorage.getItem(this.key)) {
        // Is seen in the session => quit
        return;
      } else if (this.dataset.frequency === 'once') {
        // Is not seen in the session => we can proceed
        this.canSetKey = 'session';
        this.openPopupIfAllowed();
        return;
      }

      if (!localStorage.getItem(this.key)) {
        // Popup not seen, show it
        this.canSetKey = 'local';
        this.openPopupIfAllowed()
        return;
      } else if (localStorage.getItem(this.key)) {
        // Popup is seen, but verify if we can see it again
        const frequency = parseInt(this.dataset.frequency.split('_')[0]); // e.g. 3_days => 3

        const timeNow = this.generateTimeStamp();
        const timeThen = parseInt(localStorage.getItem(this.key));
        const timeDiffInDays = (timeNow - timeThen) / (1000 * 3600 * 24);

        /**
         * Testing:
         * localStorage.setItem('woolman-theme-myshopify-com-newsletter-popup-1_day', new Date('1996-1-1').getTime())
         */

        if (timeDiffInDays >= frequency) {
          // We can show it again
          this.canSetKey = 'local';
          this.openPopupIfAllowed()
        }
        return;
      }
    }

    /**
     * Checks if cookie management app is enabled and if user has accepted tracking and then opens modal based on information received
     */
    openPopupIfAllowed() {
      if(!window.Shopify?.customerPrivacy) {
        this.openPopupWithDelay()
      } else {
        if (window.Shopify?.customerPrivacy?.userCanBeTracked() || window.Shopify?.customerPrivacy?.userDataCanBeSold()) {
          this.openPopupWithDelay()
        } else {
          document.addEventListener('trackingConsentAccepted', () => {
            this.openPopupWithDelay()
          })
        }
      }
    }

    /**
     * Opens the modal after a delay
     * @param {number} delay
     */
    openPopupWithDelay(delay) {
      delay = delay || this.dataset.delay;
      if (delay === 0) {
        this.openPopup();
      } else {
        setTimeout(() => {
          this.openPopup();
        }, delay);
      }
    }

    /**
     * Opens the modal if no other modals or drawers are open
     */
    openPopup() {
      // Check if any other drawer or modal is open. If so try to open the newsletter 3s later.
      const bodyHasOverflowHidden = document.body.classList.contains('overflow-hidden');
      if (bodyHasOverflowHidden) {
        // Retry opening modal after 3 seconds
        this.openPopupWithDelay(3000);
        return;
      }

      if (this.canSetKey === 'session') {
        sessionStorage.setItem(this.key, this.generateTimeStamp());
      } else if (this.canSetKey === 'local') {
        localStorage.setItem(this.key, this.generateTimeStamp());
      }
      this.classList.add('is-open');
    }

    /**
     * Generate timestamp
     * @returns {number} UNIX Timestamp
     */
    generateTimeStamp() {
      return new Date().getTime();
    }
  });
}