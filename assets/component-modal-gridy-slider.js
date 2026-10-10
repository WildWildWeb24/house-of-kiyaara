if (!customElements.get('modal-gridy-slider-parent')) {
  customElements.define('modal-gridy-slider-parent', class ModalGridySliderParent extends HTMLElement {
    constructor() {
      super();
    }

    connectedCallback() {
      // Move self to direct child of #MainContent once connected
      const mainContent = document.querySelector('#MainContent');
      if (mainContent && this.parentNode !== mainContent) {
        mainContent.appendChild(this);
      }
    }
  });
}
