if (!customElements.get('product-buy-bar')) {
  class ProductBuyBar extends HTMLElement {
    constructor() {
      "use strict";
      super();

      let classes = { show: "show" };
      let mainProductForm = document.querySelector(".product-form");

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              // In view -> Hide bar
              this.classList.remove(classes.show);
            } else if (window.scrollY > 200) {
              // Out of view AND scrolled a little from top -> Show bar
              this.classList.add(classes.show);
            }
          });
        },
        { threshold: 0.25 }
      );

      observer.observe(mainProductForm);

      // This script is loaded in product-template.liquid --> Footer observer after DOM ready
      document.addEventListener("DOMContentLoaded", function () {
        let siteFooter = document.querySelector("footer.footer");
        if (!siteFooter) return;
        observer.observe(siteFooter);
      });
    }
  }
  customElements.define('product-buy-bar', ProductBuyBar);
}
