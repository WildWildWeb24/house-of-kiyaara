// Initialize window.Woolman object
if (typeof window.Woolman == 'undefined') {
  window.Woolman = {};
}

/* ---------------------------------------
 * Focus‑trap helpers
 ----------------------------------------*/

// store all handler fns *and* run‑time data in one object
const trapFocusHandlers = {};

// will hold the element that had focus *before* the trap
let previouslyFocusedElement = null;

function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll(
      "summary, a:not([tabindex^='-']), button:enabled:not([tabindex^='-']), [tabindex]:not([tabindex^='-']), [draggable], area, input:not([type=hidden]):enabled, select:enabled, textarea:enabled, object, iframe"
    )
  );
}

function trapFocus(container) {
  // Remove any existing trap first
  removeTrapFocus();

  // Remember what was focused *before* we trap (if it’s outside)
  const current = document.activeElement;
  previouslyFocusedElement =
    current && !container.contains(current) ? current : null;

  /* ---------- calculate first / last focusable ---------- */
  function setFocusableElements() {
    const elements = getFocusableElements(container);
    trapFocusHandlers.first = elements[0];
    trapFocusHandlers.last = elements[elements.length - 1];
  }
  setFocusableElements();   // initialise once

  /* ---------- listeners ---------- */
  trapFocusHandlers.focusin = (event) => {
    if (
      event.target !== container &&
      event.target !== trapFocusHandlers.last &&
      event.target !== trapFocusHandlers.first
    ) return;

    document.addEventListener('keydown', trapFocusHandlers.keydown);
  };

  trapFocusHandlers.focusout = () =>
    document.removeEventListener('keydown', trapFocusHandlers.keydown);

  trapFocusHandlers.keydown = (event) => {
    if (event.code.toUpperCase() !== 'TAB') return;

    // TAB forward on the last element  → loop to first
    if (event.target === trapFocusHandlers.last && !event.shiftKey) {
      event.preventDefault();
      trapFocusHandlers.first?.focus();
    }

    // SHIFT+TAB on the first element → loop to last
    if (
      (event.target === container || event.target === trapFocusHandlers.first) &&
      event.shiftKey
    ) {
      event.preventDefault();
      trapFocusHandlers.last?.focus();
    }
  };

  /* ---------- attach listeners ---------- */
  document.addEventListener('focusout', trapFocusHandlers.focusout);
  document.addEventListener('focusin', trapFocusHandlers.focusin);

  /* ----------  Watch for DOM changes  ---------- */
  const observer = new MutationObserver(() => {
    setFocusableElements();                  // refresh first / last

    // If focus was lost because the element was removed, restore it:
    if (!container.contains(document.activeElement)) {
      trapFocusHandlers.first?.focus();
    }
  });

  observer.observe(container, { childList: true, subtree: true });

  /* expose a way to stop observing when the trap is removed */
  trapFocusHandlers.disconnect = () => observer.disconnect();

  /* ---------- expose a public "refresh" method ---------- */
  trapFocusHandlers.update = setFocusableElements;

  /* ---------- move initial focus ---------- */
  trapFocusHandlers.first?.focus();
}

function removeTrapFocus(elementToFocus = null) {
  document.removeEventListener('focusin', trapFocusHandlers.focusin);
  document.removeEventListener('focusout', trapFocusHandlers.focusout);
  document.removeEventListener('keydown', trapFocusHandlers.keydown);

  trapFocusHandlers.disconnect?.();

  // prefer the explicit argument, otherwise fall back to previously‑focused element
  if (!elementToFocus && previouslyFocusedElement?.isConnected) {
    elementToFocus = previouslyFocusedElement;
  }

  if (elementToFocus) elementToFocus.focus();

  // clean up
  previouslyFocusedElement = null;
  delete trapFocusHandlers.first;
  delete trapFocusHandlers.last;
  delete trapFocusHandlers.update;
}


/* ---------------------------------------
 * Other helpers
 ----------------------------------------*/

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function throttle(fn, wait) {
  let t = false;
  return (...args) => {
    if (!t) {
      fn.apply(this, args)
      t = true;
      setTimeout(() => t = false, wait)
    }
  }
}

/* ---------------------------------------
 * Woolman Common
 ----------------------------------------*/

Woolman.bind = function (fn, scope) {
  return function () {
    return fn.apply(scope, arguments);
  };
};

// -------
// Common: Init
Woolman.init = function () {
  Woolman.ModalsAndDrawers.init();
  Woolman.Header.init();
  Woolman.CustomClassInstanses.init();

  // Attach theme editor listeners
  if (!Shopify || !Shopify.designMode) return;

  let lastSelection = {
    sectionId: undefined,
    blockId: undefined
  };

  // Load is called when something is changed within section settings
  document.addEventListener('shopify:section:load', (evt) => {
    const sectionId = 'shopify-section-' + evt.detail.sectionId
    if (sectionId === Woolman.Header.cache.section.id) {
      Woolman.ModalsAndDrawers.init();
      Woolman.Header.init();
    }

    if (document.querySelector(`[data-modal][data-section-id="${evt.detail.sectionId}"]`)) {
      Woolman.ModalsAndDrawers.showModalOrDrawer(document.querySelector(`[data-modal][data-section-id="${evt.detail.sectionId}"]`).id);
    }

    console.log('shopify:section:load sectionId', evt.detail.sectionId)
    console.log('lastSelection', lastSelection)
  })

  document.addEventListener('shopify:block:select', (evt) => {
    const sectionId = 'shopify-section-' + evt.detail.sectionId
    const blocks = document.getElementById(sectionId).querySelectorAll('[data-shopify-editor-block]')
    const selectedBlock = [...blocks].find(x => JSON.parse(x.dataset.shopifyEditorBlock).id === evt.detail.blockId);
    if (sectionId === Woolman.Header.cache.section.id) {
      if (selectedBlock) {
        // Make sure menu is open
        Woolman.Header.cache.openButton.click();

        // Select menu item
        const accordion = selectedBlock.closest('[data-accordion-item]').querySelector('input');
        const label = selectedBlock.closest('[data-accordion-item]').querySelector('label');
        if (!accordion.checked) label.click();
      }
    } else if (sectionId.includes('modal') && document.getElementById(sectionId).querySelector('[data-modal]')) {
      if (selectedBlock) {
        Woolman.ModalsAndDrawers.showModalOrDrawer(document.getElementById(sectionId).querySelector('[data-modal]').id);
      }
    }

    lastSelection.sectionId = evt.detail.sectionId;
    lastSelection.blockId = evt.detail.blockId;
    console.log('shopify:block:select', evt.detail.sectionId, evt.detail.blockId)
    console.log('lastSelection', lastSelection)
  })

  document.addEventListener('shopify:section:unload', (evt) => {
    console.log('shopify:section:unload sectionId', evt.detail.sectionId)
  })

  document.addEventListener('shopify:section:select', (evt) => {
    console.log('shopify:section:select', evt.detail.sectionId)
    lastSelection = {
      sectionId: evt.detail.sectionId,
      blockId: evt.detail.blockId
    }

    if (evt.detail.sectionId.includes('modal') && document.querySelector(`[data-modal][data-section-id="${evt.detail.sectionId}"]`)) {
      Woolman.ModalsAndDrawers.showModalOrDrawer(document.querySelector(`[data-modal][data-section-id="${evt.detail.sectionId}"]`).id);
    }

    console.log('lastSelection', lastSelection)
  })

  document.addEventListener('shopify:section:deselect', (evt) => {
    console.log('shopify:section:deselect', evt.detail.sectionId)
    lastSelection = {
      sectionId: undefined,
      blockId: undefined
    }

    if (evt.detail.sectionId.includes('modal') && document.querySelector(`[data-modal][data-section-id="${evt.detail.sectionId}"]`)) {
      Woolman.ModalsAndDrawers.closeModalOrDrawer(document.querySelector(`[data-modal][data-section-id="${evt.detail.sectionId}"]`).id);
    }

    console.log('lastSelection', lastSelection)
  })
};

// -------
// Common: Utility library
Woolman.Utils = {
  debugMode: true,
  prepareQueryParams: () => {
    Shopify.queryParams = Shopify.queryParams || {};

    // Preserve existing query parameters
    if (location.search.length) {
      const params = location.search.slice(1).split('&');
      for (let i = 0; i < params.length; i++) {
        const keyValue = params[i].split('=');
        // Spaces are reverted back after the decode, since in component-facets.js we'll use URLSearchParams() method and we don't want to double decode the spaces
        if (keyValue.length) {
          Shopify.queryParams[decodeURIComponent(keyValue[0])] = decodeURIComponent(keyValue[1]).replaceAll('+', ' ');
        }
      }
    }

    return Shopify.queryParams;
  },
  formatMoney(cents, format) {
    const default_money_format = theme.settings.moneyFormat || '€{{amount}}';
    if (typeof cents == 'string') {
      cents = cents.replace('.', '');
    }

    var value = '';
    var placeholderRegex = /\{\{\s*(\w+)\s*\}\}/;
    var formatString = format || default_money_format;

    function defaultOption(opt, def) {
      return typeof opt == 'undefined' ? def : opt;
    }

    function formatWithDelimiters(number, precision, thousands, decimal) {
      precision = defaultOption(precision, 2);
      thousands = defaultOption(thousands, ',');
      decimal = defaultOption(decimal, '.');

      if (isNaN(number) || number == null) {
        return 0;
      }

      number = (number / 100.0).toFixed(precision);

      var parts = number.split('.'),
        dollars = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1' + thousands),
        cents = parts[1] ? decimal + parts[1] : '';

      return dollars + cents;
    }

    switch (formatString.match(placeholderRegex)[1]) {
      case 'amount':
        value = formatWithDelimiters(cents, 2);
        break;
      case 'amount_no_decimals':
        value = formatWithDelimiters(cents, 0);
        break;
      case 'amount_with_comma_separator':
        value = formatWithDelimiters(cents, 2, '.', ',');
        break;
      case 'amount_no_decimals_with_comma_separator':
        value = formatWithDelimiters(cents, 0, '.', ',');
        break;
    }

    return formatString.replace(placeholderRegex, value);
  },
};

// -------
// Common: Header component
Woolman.Header = {
  selectors: {
    header: 'MainHeader',
    toolbar: "ToolBar",
    cartBlip: '[data-cart-count]'
  },
  cache: {
    header: undefined,
    toolbar: undefined,
    cartBlip: undefined,
    section: undefined,
    openButton: undefined
  },

  init: function () {
    this.cache.header = document.getElementById(this.selectors.header);
    this.cache.toolbar = document.getElementById(this.selectors.toolbar);
    this.cache.cartBlip = document.querySelectorAll(this.selectors.cartBlip);
    this.cache.section = this.cache.header.closest('.shopify-section');
    this.cache.openButton = this.cache.header.querySelector('[data-open="drawer-menu"]');

    // -- NEW: Set the CSS variable on load
    this.setHeaderHeightVar();

    // -- NEW: Listen to the resize event and recalculate header height
    window.addEventListener('resize', throttle(this.setHeaderHeightVar.bind(this), 40));

    // Update cart blip when product is added to cart.
    document.addEventListener('ajaxProduct:added', this.updateCartBlip.bind(this));
    document.addEventListener('cart:update', this.updateCartBlip.bind(this));

    if (this.cache.header.dataset.stickyBehavior === 'none') return;
    this.initStickyBehavior(this.cache.header.dataset.stickyBehavior);
  },


  setHeaderHeightVar: function () {
    if (!this.cache.header) return;
    const headerHeight = this.cache.header.offsetHeight;
    const toolbarHeight = this.cache.toolbar.offsetHeight;
    document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);
    document.documentElement.style.setProperty('--toolbar-height', `${toolbarHeight}px`);
  },

  initStickyBehavior(behaviorType) {
    const stickyConfig = {
      headerHeight: this.cache.header.clientHeight + 1,
      toolbarHeight: this.cache.toolbar.clientHeight + 1,
      behavior: behaviorType
    }

    document.documentElement.classList.add('sticky-header-initialized', `sticky-header-${behaviorType}`);

    if (behaviorType === 'scroll' || behaviorType === 'fixed') {
      // One-time check if the page is loaded with scroll position
      if (window.scrollY >= 300) {
        document.documentElement.classList.add('sticky-header-show');
      }

      let prevScroll = window.scrollY || document.documentElement.scrollTop;
      let curScroll;
      let direction = 0;
      let prevDirection = 0;

      /*
      ** Find the direction of scroll
      ** 0 - initial, 1 - up, 2 - down
      */

      const toggleStickyHeader = (direction, curScroll) => {
        if ((direction === 1) || curScroll < stickyConfig.headerHeight) {
          document.documentElement.classList.remove('sticky-header-hide')
        } else if (direction === 2 && curScroll > stickyConfig.headerHeight) {
          document.documentElement.classList.add('sticky-header-hide')
        }

        prevDirection = direction;
      }

      const handleScroll = throttle(() => {
        curScroll = window.scrollY || document.documentElement.scrollTop;

        if (curScroll >= 300) {
          document.documentElement.classList.add('sticky-header-show');
        } else {
          document.documentElement.classList.remove('sticky-header-show');
        }

        // Reset classes when at the top of the page
        if (curScroll === 0) {
          document.documentElement.classList.remove('sticky-header-show', 'sticky-header-hide');
          return;
        }

        if (curScroll > prevScroll) {
          direction = 2; // user scrolling down
        } else {
          direction = 1; // user scrolling up
        }

        // Toggle header visibility based on scroll direction and behavior type
        if (direction !== prevDirection && behaviorType === 'scroll') {
          toggleStickyHeader(direction, curScroll);
        } else if (behaviorType === 'scroll' && direction === 2 && curScroll >= 900) {
          // Hide header when scrolling down and past the threshold
          toggleStickyHeader(direction, curScroll);
        }

        prevScroll = curScroll
      }, 40);

      window.addEventListener('scroll', handleScroll);
    }
  },

  async updateCartBlip(e) {
    const cart = e.detail && e.detail.cart && e.detail.cart.item_count || await (async function () {
      const res = await fetch('/cart.json');
      const cart = await res.json();
      return cart;
    })();

    this.cache.cartBlip.forEach((blip) => {
      blip.textContent = cart.item_count || 0;
      if (cart && cart.item_count == 0) {
        blip.setAttribute('hidden', true);
        blip.closest('.cart-button').classList.remove('has-count-visible');
      } else {
        blip.removeAttribute('hidden')
        blip.closest('.cart-button').classList.add('has-count-visible');
      }

      // Update notification cart amount at the same time (if present)
      const total_in_notification = document.querySelector('#cart-notification-link .cart-total');
      if (total_in_notification) {
        total_in_notification.textContent = cart.item_count;
      }
    })
  }
};

// -------
// Common: Modals & drawers library
Woolman.ModalsAndDrawers = {
  settings: {
    selectors: {
      modalLink: 'button[data-open*="modal"]:not(.quick-view-link):not(.quick-add-link)',
      drawerLink: 'button[data-open*="drawer"]',
    },
  },
  focusTraps: {},
  init: function () {
    // Init open event listeners
    document.querySelectorAll(this.settings.selectors.modalLink).forEach((modalLink) => {
      modalLink.addEventListener('click', (event) => {
        const targetId = event.currentTarget.dataset.open.split('?')[0];
        const slideIndex = event.currentTarget.dataset.open.split('?slide=')[1];
        const scrollToId = event.currentTarget.dataset.open.split('?scroll=')[1];
        this.showModalOrDrawer(targetId, parseInt(slideIndex), scrollToId);
      });
    });

    document.querySelectorAll(this.settings.selectors.drawerLink).forEach((drawerLink) => {
      drawerLink.addEventListener('click', (event) => {
        const targetId = event.currentTarget.dataset.open.split('?')[0];
        this.showModalOrDrawer(targetId);
      });
    });

    // Init close event listeners
    const closeBtns = document.querySelectorAll('[data-close]');
    if (closeBtns) {
      closeBtns.forEach((closeBtn) => {
        closeBtn.addEventListener('click', this.closeModalOrDrawerOrDrawerFromEvent.bind(this));
      });
    }

    const overlays = document.querySelectorAll('[data-overlay]');
    if (overlays) {
      overlays.forEach((overlay) => {
        overlay.addEventListener('click', this.closeModalOrDrawerOrDrawerFromEvent.bind(this));
      });
    }

    // Escape to close all
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' || event.keyCode === 27) {
        // Find all open drawers and modals
        const openElements = document.querySelectorAll('.drawer.is-open, .modal.is-open');
        removeTrapFocus();

        openElements.forEach((element) => {
          // Each open modal/drawer should have an ID you can pass to closeModalOrDrawer
          const targetId = element.id;
          Woolman.ModalsAndDrawers.closeModalOrDrawer(targetId);
        });
      }
    });
  },
  /**
   *
   * @param {string} targetId - ID of modal or drawer element, e.g. modal-geo, drawer-menu
   * @param {int} slideIndex - Index of a Gridy Slider slide inside the opened modal - (sliding motion)
   * @param {string} scrollToId - ID of a Gridy Slider slide inside the opened modal - (no motion)
   * Traps focus to modal and disables body scrolling.
   */
  showModalOrDrawer: function (targetId, slideIndex, scrollToId) {
    const targetElement = document.getElementById(targetId);
    if (!targetElement && Woolman.Utils.debugMode) {
      console.warn('No modal/drawer element specified');
    }
    if (!targetElement) {
      return;
    }

    if (targetElement.classList.contains('is-open')) return;

    targetElement.classList.add('initialized', 'is-open');
    document.body.classList.add('overflow-hidden');
    document.documentElement.classList.add('overlay-open');

    setTimeout(() => {
      trapFocus(targetElement);

      // Focus on drawerSearchInput if it exists
      const drawerSearchInput = targetElement.querySelector('#drawerSearchInput');
      if (drawerSearchInput) {
        drawerSearchInput.focus();
      }
    }, 600);

    if (slideIndex) {
      const gridySlider = targetElement.querySelector('gridy-slider');
      if (gridySlider) {
        gridySlider.scrollToSlide(slideIndex - 1, 'instant');
        // Play videos with data-autoplay in the target slide
        setTimeout(() => {
          const targetSlide = gridySlider.slides[slideIndex - 1];
          if (targetSlide) {
            this.playAutoplayVideosInSlide(targetSlide);
          }
        }, 100);
      }
    } else if (scrollToId) {
      const gridySlider = targetElement.querySelector('gridy-slider');
      if (gridySlider) {
        gridySlider.scrollToSlideByID(scrollToId, 'instant');
        // Play videos with data-autoplay in the target slide
        setTimeout(() => {
          const targetSlide = document.getElementById(scrollToId);
          if (targetSlide) {
            this.playAutoplayVideosInSlide(targetSlide);
          }
        }, 100);
      }
    }
  },
  /**
   * Plays all videos with data-autoplay attribute in a given slide element
   * @param {HTMLElement} slideElement - The slide element containing videos
   */
  playAutoplayVideosInSlide: function (slideElement) {
    if (!slideElement) return;

    // Find the first video with data-autoplay attribute and play it
    const video = slideElement.querySelector('video[data-autoplay]');
    if (video && video.paused) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          // AbortError is expected when play() is interrupted
          if (error.name !== 'AbortError') {
            console.error('Video play error:', error);
          }
        });
      }
    }
  },
  closeModalOrDrawer: function (targetId) {
    const targetElement = document.getElementById(targetId);
    if (!targetElement) return;

    pauseMediaInElement(targetElement);
    targetElement.classList.remove('is-open');
    document.body.classList.remove('overflow-hidden');
  },
  closeModalOrDrawerOrDrawerFromEvent: function (event) {
    event.preventDefault();
    removeTrapFocus();

    const parentElement = event.currentTarget.closest('[data-parent]');
    if (!parentElement) return;

    pauseMediaInElement(parentElement);
    parentElement.classList.remove('is-open');
    document.body.classList.remove('overflow-hidden');
    document.documentElement.classList.remove('overlay-open');
  }
};

/**
 * Validates if a URL belongs to YouTube or Vimeo by parsing and checking the hostname.
 * This prevents security risks from malicious URLs that might contain these strings.
 * @param {string} url - The URL to validate
 * @returns {Object|null} - Object with type: 'youtube'|'vimeo' or null if invalid
 */
function validateVideoUrl(url) {
  if (!url || typeof url !== 'string') return null;

  try {
    // Parse the URL to extract the hostname
    const urlObj = new URL(url, window.location.origin);
    const hostname = urlObj.hostname.toLowerCase();

    // Allowed YouTube domains (including subdomains)
    const youtubeDomains = [
      'youtube.com',
      'www.youtube.com',
      'youtu.be',
      'www.youtu.be',
      'youtube-nocookie.com',
      'www.youtube-nocookie.com'
    ];

    // Allowed Vimeo domains (including subdomains)
    const vimeoDomains = [
      'vimeo.com',
      'www.vimeo.com',
      'player.vimeo.com'
    ];

    // Check if hostname matches any allowed domain (exact match or subdomain)
    for (const domain of youtubeDomains) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return { type: 'youtube' };
      }
    }

    for (const domain of vimeoDomains) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return { type: 'vimeo' };
      }
    }

    return null;
  } catch (e) {
    // Invalid URL format
    return null;
  }
}

/**
 * Pauses all <video> elements and sends pause commands to
 * Vimeo/YouTube iframes inside the given container element.
 */
function pauseMediaInElement(container) {
  if (!container) return;

  // Pause HTML5 <video> elements
  const videos = container.querySelectorAll('video');
  videos.forEach((videoEl) => {
    if (!videoEl.paused) {
      videoEl.pause();
    }
  });

  // Look for iframes (Vimeo or YouTube)
  const iframes = container.querySelectorAll('iframe');
  iframes.forEach((iframe) => {
    const src = iframe.src || '';
    const videoType = validateVideoUrl(src);

    if (videoType?.type === 'youtube') {
      // Post message to tell YouTube player to pause
      // Ref: https://developers.google.com/youtube/iframe_api_reference#Events
      iframe.contentWindow?.postMessage(
        JSON.stringify({
          event: 'command',
          func: 'pauseVideo',
          args: [],
        }),
        '*'
      );
    } else if (videoType?.type === 'vimeo') {
      // Post message to tell Vimeo player to pause
      // Ref: https://developer.vimeo.com/player/js-api#universal-embed-code
      iframe.contentWindow?.postMessage(
        JSON.stringify({
          method: 'pause',
        }),
        '*'
      );
    }
  });
}

// -------
// Common: Resize event listener
window.Woolman.window_size = window.innerWidth;
window.addEventListener(
  'resize',
  debounce(() => {
    if (window.innerWidth === window.Woolman.window_size) {
      return;
    }
    window.Woolman.window_size = window.innerWidth;
    document.dispatchEvent(new CustomEvent('woolman:resize'));
  }),
  50
);

// -------
// Common: Responsive video
class ResponsiveVideo {
  constructor(videoElement) {
    this.videoElement = videoElement;
    this.sources = Array.from(videoElement.querySelectorAll('source'));

    // Extract the sources based on data attributes
    this.defaultSource = this.sources.find(source => source.hasAttribute('data-default-video')).src;
    this.mobileSource = this.sources.find(source => source.hasAttribute('data-mobile-video')).src;

    // Bind the checkVideoSource method to the current instance
    this.checkVideoSource = this.checkVideoSource.bind(this);

    // Add event listener for the woolman:resize event
    document.addEventListener('woolman:resize', this.checkVideoSource);
  }

  checkVideoSource() {
    if (window.Woolman.window_size >= 768) {
      if (this.videoElement.src !== this.defaultSource) {
        this.videoElement.src = this.defaultSource;
      }
    } else {
      if (this.videoElement.src !== this.mobileSource) {
        this.videoElement.src = this.mobileSource;
      }
    }
  }
}

// -------
// Common: Autoplay videos play/pause observer
class AutoplayVideosObserver {
  constructor() {
    this.autoplayVideos = document.querySelectorAll('video[autoplay]');
    this.observer = new IntersectionObserver(this.handleIntersection.bind(this), {
      threshold: 0.01
    });

    this.autoplayVideos.forEach((video) => {
      this.observer.observe(video);
    });
  }

  handleIntersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.play();
      } else {
        entry.target.pause();
      }
    });
  }
}

// -------
// Common: Accordion (animations)
class Accordion {
  constructor(detailsElement) {
    if (detailsElement.hasAttribute('data-no-accordion-logic')) {
      return;
    }
    this.detailsElement = detailsElement;
    this.summary = detailsElement.querySelector('summary');
    this.content = detailsElement.querySelector('.content');

    this.animation = null;
    this.isClosing = false;
    this.isExpanding = false;
    this.summary.addEventListener('click', (e) => this.onClick(e));
    this.toggleByViewport();
    document.addEventListener('woolman:resize', this.toggleByViewport.bind(this));
  }

  onClick(e) {
    e.preventDefault();
    this.detailsElement.style.overflow = 'hidden';
    if (this.isClosing || !this.detailsElement.open) {
      this.open();
    } else if (this.isExpanding || this.detailsElement.open) {
      this.shrink();
    }
  }

  shrink() {
    this.isClosing = true;

    const startHeight = `${this.detailsElement.offsetHeight}px`;
    const endHeight = `${this.summary.offsetHeight}px`;

    if (this.animation) {
      this.animation.cancel();
    }

    this.animation = this.detailsElement.animate({
      height: [startHeight, endHeight]
    }, {
      duration: 400,
      easing: 'ease-in-out'
    });

    this.animation.onfinish = () => this.onAnimationFinish(false);
    this.animation.oncancel = () => this.isClosing = false;
  }

  open() {
    this.detailsElement.style.height = `${this.detailsElement.offsetHeight}px`;
    this.detailsElement.open = true;
    window.requestAnimationFrame(() => this.expand());
  }

  expand() {
    this.isExpanding = true;
    const startHeight = `${this.detailsElement.offsetHeight}px`;
    const endHeight = `${this.summary.offsetHeight + this.content.offsetHeight}px`;

    if (this.animation) {
      this.animation.cancel();
    }

    this.animation = this.detailsElement.animate({
      height: [startHeight, endHeight]
    }, {
      duration: 400,
      easing: 'ease-out'
    });
    this.animation.onfinish = () => this.onAnimationFinish(true);
    this.animation.oncancel = () => this.isExpanding = false;
  }

  onAnimationFinish(open) {
    this.detailsElement.open = open;
    this.animation = null;
    this.isClosing = false;
    this.isExpanding = false;
    this.detailsElement.style.height = this.detailsElement.style.overflow = '';
  }

  toggleByViewport() {
    let mobileClose = this.detailsElement.dataset.mobileClose != undefined ? JSON.parse(this.detailsElement.dataset.mobileClose) : false;
    let desktopOpen = this.detailsElement.dataset.desktopOpen != undefined ? JSON.parse(this.detailsElement.dataset.desktopOpen) : false;

    if (window.Woolman.window_size >= 768 && desktopOpen) {
      this.detailsElement.open = true;
    } else if (mobileClose) {
      this.detailsElement.open = false;
    }
  }
};

// -------
// Common: Details Accordions
Woolman.CustomClassInstanses = {
  init: function () {
    // Accordions
    document.querySelectorAll('details').forEach((detailsElement) => {
      new Accordion(detailsElement);
    });
    // Responsive videos
    document.querySelectorAll('video[data-responsive-video]').forEach((videoElement) => {
      new ResponsiveVideo(videoElement);
    });
    // Autoplay videos play/pause observer
    new AutoplayVideosObserver();
  }
};

// Ensure Woolman.init is called after the document content is loaded
document.addEventListener('DOMContentLoaded', function () {
  Woolman.init();
});

/* ---------------------------------------
 * Woolman Web Components
 ----------------------------------------*/
class ModalDrawerButton extends HTMLElement {
  constructor() {
    super();
    this.button = this.querySelector('button');
    this.button.addEventListener('click', this.onClick.bind(this));
  }

  onClick(event) {
    event.preventDefault();
    const targetId = this.button.dataset.open.split('?')[0];
    const slideIndex = this.button.dataset.open.split('?slide=')[1];
    const scrollToId = this.button.dataset.open.split('?scroll=')[1];
    Woolman.ModalsAndDrawers.showModalOrDrawer(targetId, parseInt(slideIndex), scrollToId);
  }
}
customElements.define('modal-drawer-button', ModalDrawerButton);

class HeaderDropdown extends HTMLElement {
  constructor() {
    super();
    this.details = this.querySelector('details');
    this.summary = this.querySelector('summary');
    this.header = this.closest('header'); // Define the header element once
    this.timer = null;

    // Bind 'this' so that we can add/remove the listener properly if needed.
    this.handleEscKey = this.handleEscKey.bind(this);

    this.summary.addEventListener('mouseenter', this.openDropdown.bind(this));
    this.details.addEventListener('mouseenter', this.clearCloseTimer.bind(this));
    this.details.addEventListener('mouseleave', this.startCloseTimer.bind(this));
    this.summary.addEventListener('keydown', this.handleKeydown.bind(this));

    this.details.addEventListener('focusout', (event) => {
      // Set small timeout to allow focus to move out of the details element
      setTimeout(() => {
        if (!this.details.contains(document.activeElement)) {
          this.details.open = false;
          if (this.header) {
            this.header.classList.remove('sub-menu-open');
          }
        }
      }, 10);
    });

    // Add an ESC key listener on the document (in a real app, maybe do this once globally)
    document.addEventListener('keydown', this.handleEscKey);
  }

  openDropdown() {
    this.closeOtherDropdowns();
    this.details.open = true;
    if (this.header) {
      this.header.classList.add('sub-menu-open');
    }
  }

  handleEscKey(event) {
    if (event.key === 'Escape') {
      this.closeAllDropdowns();
    }
  }

  closeAllDropdowns() {
    const openDropdowns = document.querySelectorAll('header-dropdown details[open]');
    openDropdowns.forEach((dropdown) => {
      dropdown.open = false;
    });

    const headers = document.querySelectorAll('header');
    headers.forEach((hdr) => hdr.classList.remove('sub-menu-open'));
  }

  closeOtherDropdowns() {
    if (this.header) {
      const otherDropdowns = this.header.querySelectorAll('header-dropdown details[open]');
      otherDropdowns.forEach(dropdown => {
        if (dropdown !== this.details) {
          dropdown.open = false;
          const parentDropdown = dropdown.closest('header-dropdown');
          if (parentDropdown && typeof parentDropdown.clearCloseTimer === 'function') {
            parentDropdown.clearCloseTimer();
          }
        }
      });
    }
  }

  startCloseTimer() {
    this.timer = setTimeout(() => {
      this.details.open = false;
      if (this.header) {
        this.header.classList.remove('sub-menu-open');
      }
    }, 400);
  }

  clearCloseTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  handleKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      // Prevent default behavior to avoid double toggling
      event.preventDefault();
      if (!this.details.open) {
        this.openDropdown();
      } else {
        this.details.open = false;
        if (this.header) {
          this.header.classList.remove('sub-menu-open');
        }
      }
    }
  }
}
customElements.define('header-dropdown', HeaderDropdown);

// Custom element that enhances Localization form functionality.
class LocalizationForm extends HTMLElement {
  constructor() {
    super();
    this.elements = {
      input: this.querySelector('input[name="locale_code"], input[name="country_code"]')
    };

    this.querySelectorAll('a').forEach(item => item.addEventListener('click', this.onItemClick.bind(this)));
  }

  onItemClick(event) {
    event.preventDefault();
    const form = this.querySelector('form');
    this.elements.input.value = event.currentTarget.dataset.value;

    // Filter params fix, replace "%2C" with ","
    let return_to_value = form.querySelector('[name="return_to"]').value;
    let indexOfFilters = return_to_value.indexOf("?filter");
    if (indexOfFilters !== -1) {
      let substringAfterFilters = return_to_value.substring(indexOfFilters);
      let replacedSubstring = substringAfterFilters.replace(/%2C/g, ",");
      form.querySelector('[name="return_to"]').value = return_to_value.substring(0, indexOfFilters) + replacedSubstring;
    }

    if (form) form.submit();
  }
}
customElements.define('localization-form', LocalizationForm);


// Gridy Slider - a custom Woolman built slider.
class GridySlider extends HTMLElement {
  constructor() {
    super();

    this.track = this.querySelector('.gridy-track');
    this.slides = this.querySelectorAll('.gridy-track > *');
    if (!this.track || !this.slides.length) {
      console.error('GridySlider: Track or slides not found.');
      return;
    }

    // Track pending play promises for videos to handle AbortError gracefully
    this.pendingPlayPromises = new WeakMap();

    const child_count = this.track.childElementCount;

    const data_ipr_desktop = parseInt(this.dataset.iprDesktop, 10) || 1;
    const data_ipr_tablet = parseInt(this.dataset.iprTablet, 10) || data_ipr_desktop;
    const data_ipr_mobile = parseInt(this.dataset.iprMobile, 10) || 1;
    const data_init_scroll_to = this.dataset.initScrollTo;
    const data_autoplay = this.dataset.autoplay != undefined ? JSON.parse(this.dataset.autoplay) : false;
    const data_autoplay_delay = parseInt(this.dataset.autoplayDelay, 10) || 5000;
    const data_is_thumbnails_slider = this.dataset.thumbnailsFor != undefined ? true : false;
    const data_indicator = this.dataset.indicator != undefined ? JSON.parse(this.dataset.indicator) : false;
    const data_indicator_type = this.dataset.indicatorType;
    const data_progress_bar = this.dataset.progressBar != undefined ? JSON.parse(this.dataset.progressBar) : false;
    const data_sliding_behavior = this.dataset.slidingBehavior;
    const data_thumbnail_slider = document.getElementById(`thumbnail-${this.id}`);
    const data_track_overflow_visible = this.dataset.overflowVisible != undefined ? true : false;
    const data_inside_modal = this.dataset.insideModal != undefined ? JSON.parse(this.dataset.insideModal) : false;

    this.config = {
      slide_count: child_count,
      current_slide: 0,
      image_cycle_slide: 0,
      active_slide_offset: 0, // used for thumbnails slider

      ipr_desktop: data_ipr_desktop,
      ipr_tablet: data_ipr_tablet,
      ipr_mobile: data_ipr_mobile,
      breakpoint_tablet: 768,
      breakpoint_desktop: 1024,

      arrows: true,
      autoplay: data_autoplay || false,
      autoplay_delay: data_autoplay_delay, // in ms
      timer: null,

      // thumbnails related
      is_thumbnails_slider: data_is_thumbnails_slider,
      thumbnails_for: undefined,
      thumbnail_slider: data_thumbnail_slider,

      indicator: data_indicator,
      indicator_type: data_indicator_type,

      progress_bar: data_progress_bar,

      track_overflow_visible: data_track_overflow_visible,
      sliding_behavior: data_sliding_behavior || 'all',
      inside_modal: data_inside_modal,

      track_padding_left: 0,
      track_padding_right: 0,
      track_width: this.track.scrollWidth
    }

    // Bind methods
    this.clearAutoplayTimer = this.clearAutoplayTimer.bind(this);
    this.autoplayGridy = this.autoplayGridy.bind(this);

    // Initialize currentIPR based on the current viewport width
    this.updateCurrentIPR();

    // Bind the resize handler and add event listener for window resize
    this.boundResizeHandler = this.updateCurrentIPR.bind(this);
    window.addEventListener('resize', this.boundResizeHandler);

    // SCROLL ON INIT (with variant URL)
    if (data_init_scroll_to != undefined) {
      this.scrollToSlideByID(data_init_scroll_to);
    }

    // AUTOPLAY INIT
    if (this.config.autoplay && this.config.sliding_behavior == 'image_cycle') {
      this.config.sliding_behavior = 'all';
      this.slides[this.config.image_cycle_slide].classList.add('show-second-image');
      this.imageCycleGridy();

      // Always "pause" on hover
      this.addEventListener('mouseenter', this.clearImageCycleTimer);
      this.addEventListener('mouseleave', this.imageCycleGridy);

      // "Pause" for touch devices
      this.addEventListener('touchenter', this.clearImageCycleTimer);
      this.addEventListener('touchleave', this.imageCycleGridy);
    } else if (this.config.autoplay) {
      this.autoplayGridy();

      // Always "pause" on hover
      this.addEventListener('mouseenter', this.clearAutoplayTimer);
      this.addEventListener('mouseleave', this.autoplayGridy);

      // "Pause" for touch devices
      this.addEventListener('touchenter', this.clearAutoplayTimer);
      this.addEventListener('touchleave', this.autoplayGridy);
    }

    // THUMBNAILS INIT
    if (this.config.is_thumbnails_slider) {
      this.config.active_slide_offset = 2;
      this.config.thumbnails_for = document.getElementById(this.dataset.thumbnailsFor);
      // Bind the onThumbnailClick method once and store the reference
      this.boundOnThumbnailClick = this.onThumbnailClick.bind(this);
      this.thumbnail = this.querySelectorAll('[data-thumbnail-btn]');
      this.thumbnail.forEach((thumbnail) => {
        thumbnail.addEventListener('click', this.boundOnThumbnailClick);
      });
    }

    // CURRENT SLIDE INDICATORS INIT
    if (this.config.indicator) {
      this.indicator_elements = this.querySelectorAll(`[data-indicator-${this.config.indicator_type}]`);
      this.indicator_current = this.querySelector('[data-indicator-current]');
    }

    // PROGRESS BAR INIT
    if (this.config.progress_bar) {
      this.setTrackWidth();
      document.addEventListener('woolman:resize', this.setTrackWidth.bind(this));

      this.progress_bar = this.querySelector('[data-gridy-progress-bar]');
      this.track.addEventListener('scroll', function () {
        let scrollPosition = (this.track.scrollLeft / this.config.track_width) * 100;
        this.progress_bar.style.setProperty('--scroll-position', `${scrollPosition}%`);
      }
        .bind(this));
    }

    // SCROLL LISTENER (for setting active slide after normal scroll)
    if (!this.config.is_thumbnails_slider) {
      let scrollTimeout;
      this.track.addEventListener('scroll', function () {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(this.afterScrollStops.bind(this), 200);
      }.bind(this));
    }

    // Video playback initialization
    // - skip if slider is inside a modal
    if (!this.config.inside_modal) {
      this.updateSlideVideos();
    }

    // SLIDER INITIALIZED
    this.classList.add('js-initialized');
  }

  connectedCallback() {
    // ARROWS INIT
    if (this.config?.arrows) {
      this.boundOnArrowClick = this.onArrowClick.bind(this);
      this.buttons = this.querySelectorAll('[data-gridy-arrow]');
      this.buttons.forEach((arrowButton) => {
        arrowButton.addEventListener('click', this.boundOnArrowClick);
      });
    }
  }

  setTrackWidth() {
    let track_styles = window.getComputedStyle(this.track);
    this.config.track_padding_left = parseFloat(track_styles.paddingLeft);
    this.config.track_padding_right = parseFloat(track_styles.paddingRight);
    this.config.track_width = this.track.scrollWidth - this.config.track_padding_left - this.config.track_padding_right;
  }

  disconnectedCallback() {
    // Clean up event listeners
    if (this.config?.arrows && this.buttons) {
      this.buttons.forEach((arrowButton) => {
        arrowButton.removeEventListener('click', this.boundOnArrowClick);
      });
    }

    if (this.config?.is_thumbnails_slider && this.thumbnail) {
      this.thumbnail.forEach((thumbnail) => {
        thumbnail.removeEventListener('click', this.boundOnThumbnailClick);
      });
    }

    if (this.config?.autoplay) {
      this.removeEventListener('mouseenter', this.clearAutoplayTimer);
      this.removeEventListener('mouseleave', this.autoplayGridy);
      this.removeEventListener('touchenter', this.clearAutoplayTimer);
      this.removeEventListener('touchleave', this.autoplayGridy);
    }

    // Remove the window resize event listener
    window.removeEventListener('resize', this.boundResizeHandler);
  }

  afterScrollStops() {
    let slideInView = this.firstSlideInView();
    this.config.current_slide = slideInView;
    this.setActiveSlide(this.slides[slideInView + this.config.active_slide_offset]);

    // SYNC BACK TO THUMBNAILS SLIDER
    if (this.config.thumbnail_slider) {
      this.config.thumbnail_slider.scrollToSlide(slideInView);
    }
  }

  autoplayGridy() {
    this.config.timer = setInterval(this.scrollByIPR.bind(this), this.config.autoplay_delay, 'next');
  }

  clearAutoplayTimer() {
    clearInterval(this.config.timer);
    this.config.timer = null;
  }

  imageCycleGridy() {
    this.config.timer = setInterval(this.cyclyImageSlide.bind(this), this.config.autoplay_delay);
  }

  clearImageCycleTimer() {
    clearInterval(this.config.timer);
    this.config.timer = null;
  }

  cyclyImageSlide() {
    // Remove show-second-image class from current image cycle slide
    const currentSlide = this.slides[this.config.image_cycle_slide];
    if (currentSlide) {
      currentSlide.classList.remove('show-second-image');
    }

    // Move to the next image cycle slide
    this.config.image_cycle_slide = (this.config.image_cycle_slide + 1) % this.config.slide_count;

    // Add show-second-image class to the next slide
    const nextSlide = this.slides[this.config.image_cycle_slide];
    if (nextSlide) {
      nextSlide.classList.add('show-second-image');

      // Check if the next slide is visible
      if (!this.isSlideInView(nextSlide)) {
        // Scroll to the next slide if it's not visible
        const nextSlideIndex = Array.from(this.slides).indexOf(nextSlide);
        this.scrollToSlide(nextSlideIndex);
      }
    }
  }


  onThumbnailClick(event) {
    event.preventDefault();
    this.config.current_slide = Array.from(event.currentTarget.parentNode.children).indexOf(event.currentTarget);
    this.config.thumbnails_for.scrollToSlideByID(event.currentTarget.dataset.itemId);
    this.scrollToSlide(this.config.current_slide);
  }

  onArrowClick(event) {
    this.scrollByIPR(event.currentTarget.dataset.direction);
  }

  scrollByIPR(direction) {
    // Note: position 0 is the first slide
    let currentIPR = this.config.currentIPR; // Use the stored IPR value
    let slideMultiplier = this.config.sliding_behavior === 'all' ? currentIPR : 1;
    let newTrackPosition = this.config.current_slide;
    const lastToShow = this.config.slide_count - currentIPR;

    if (direction === 'next') {
      // Default new track position is the old + the slide multiplier
      newTrackPosition = newTrackPosition + slideMultiplier;

      // Handle exceptions (Correct flow on next)
      if (this.config.current_slide == lastToShow) {
        newTrackPosition = 0; // Loop to start if all shown
      } else if (newTrackPosition > lastToShow) {
        newTrackPosition = lastToShow; // Show last items if less than slide multiplier
      }
    } else if (direction === 'prev') {
      // Default new track position is the old - the slide multiplier
      newTrackPosition = newTrackPosition - slideMultiplier;

      // Handle exceptions
      if (this.config.current_slide > 0 && newTrackPosition < 0) {
        newTrackPosition = 0; // Must scroll to first item if before looping to the end
      } else if (newTrackPosition < 0) {
        newTrackPosition = lastToShow; // Loop to end slide past the first item
      }
    }

    this.config.current_slide = newTrackPosition;
    this.scrollToSlide(newTrackPosition);
  }

  scrollToSlide(newPosition, behavior = 'smooth') {
    if (isNaN(newPosition)) {
      return;
    }

    let slidePosWithOffset = newPosition - this.config.active_slide_offset,
      newScrollToSlidePos = slidePosWithOffset > 0 ? slidePosWithOffset : 0;

    const slideInNewScrollToPos = this.slides[newScrollToSlidePos];

    let scrollToLeft = slideInNewScrollToPos.offsetLeft,
      scrollToTop = slideInNewScrollToPos.offsetTop;

    if (this.config.track_overflow_visible) {
      scrollToLeft = this.slides[newScrollToSlidePos].offsetLeft - this.slides[0].offsetLeft;
    }

    this.track.scrollTo({
      left: scrollToLeft,
      top: scrollToTop,
      behavior: behavior,
    });

    this.updateActiveSlide(newPosition);
  }

  scrollToSlideByID(slideID, behavior = 'smooth') {
    const theSlide = document.getElementById(slideID);
    if (!theSlide) {
      console.error(`GridySlider: Slide with ID ${slideID} not found.`);
      return;
    }
    const newPosition = Array.from(theSlide.parentNode.children).indexOf(theSlide);
    this.scrollToSlide(newPosition, behavior);
  }

  setActiveSlide(slide) {
    this.updateActiveSlide(Array.from(this.slides).indexOf(slide));
  }

  updateActiveSlide(newPosition) {
    this.slides.forEach((item) => { item.classList.remove('active') });
    this.slides[newPosition].classList.add('active');

    if (this.config.indicator && this.indicator_elements?.length && this.indicator_current) {
      this.indicator_current.textContent = this.config.current_slide + 1;
      this.indicator_elements.forEach((elem) => { elem.classList.remove('active') });
      this.indicator_elements[this.config.current_slide].classList.add('active');
    }

    // Update video playback for slides based on active range
    this.updateSlideVideos();
  }

  updateCurrentIPR() {
    const viewportWidth = window.innerWidth;
    let newIPR = this.config.ipr_mobile;
    if (viewportWidth >= this.config.breakpoint_desktop) {
      newIPR = this.config.ipr_desktop;
    } else if (viewportWidth >= this.config.breakpoint_tablet) {
      newIPR = this.config.ipr_tablet;
    }
    this.config.currentIPR = newIPR;
  }


  firstSlideInView() {
    let loopIndex = 0;
    for (const slide of this.slides) {
      if (this.isSlideInView(slide)) {
        return loopIndex;
      }
      ++loopIndex;
    }
    return this.config.current_slide;
  }

  isSlideInView(slide) {
    const containerBounds = this.track.getBoundingClientRect();
    const slideBounds = slide.getBoundingClientRect();

    const isSlideVisible =
      Math.round(slideBounds.top) >= Math.floor(containerBounds.top) &&
      Math.floor(slideBounds.bottom) <= Math.round(containerBounds.bottom) &&
      Math.round(slideBounds.left) >= Math.floor(containerBounds.left) &&
      Math.floor(slideBounds.right) <= Math.round(containerBounds.right);

    return isSlideVisible;
  }

  updateSlideVideos() {
    // Calculate the active range based on current slide and items per row.
    const startIndex = this.config.current_slide;
    const endIndex = startIndex + this.config.currentIPR - 1;

    this.slides.forEach((slide, index) => {
      // Process native <video> elements.
      const videoElements = slide.querySelectorAll('video');
      videoElements.forEach(video => {
        if (index >= startIndex && index <= endIndex) {
          // Active slide: if video should autoplay, then play.
          if ((video.hasAttribute('autoplay') || video.hasAttribute('data-autoplay')) && video.paused) {
            // Cancel any pending play promise before starting a new one
            const pendingPromise = this.pendingPlayPromises.get(video);
            if (pendingPromise) {
              this.pendingPlayPromises.delete(video);
            }

            const playPromise = video.play();
            this.pendingPlayPromises.set(video, playPromise);

            playPromise.catch(err => {
              // Remove from pending promises
              this.pendingPlayPromises.delete(video);

              // AbortError is expected when play() is interrupted by pause()
              // Only log other errors
              if (err.name !== 'AbortError') {
                console.error('Video play error:', err);
              }
            });
          }
        } else {
          // Inactive slide: pause video if playing.
          // Cancel any pending play promise first
          const pendingPromise = this.pendingPlayPromises.get(video);
          if (pendingPromise) {
            this.pendingPlayPromises.delete(video);
          }

          if (!video.paused) {
            video.pause();
          }
        }
      });

      // Process embedded videos via <iframe>.
      const iframeElements = slide.querySelectorAll('iframe');
      iframeElements.forEach(iframe => {
        const src = iframe.getAttribute('src');
        if (!src) return;

        // Validate URL and check if it's a YouTube or Vimeo embed.
        const videoType = validateVideoUrl(src);
        if (videoType) {
          // For these iframes, always pause when slide is not active.
          if (index < startIndex || index > endIndex) {
            if (videoType.type === 'youtube') {
              // Pause YouTube video; requires enablejsapi=1 in URL.
              iframe.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: 'pauseVideo',
                args: ''
              }), '*');
            } else if (videoType.type === 'vimeo') {
              // Pause Vimeo video.
              iframe.contentWindow.postMessage(JSON.stringify({
                method: 'pause'
              }), '*');
            }
          }
        }
      });
    });
  }
}
customElements.define('gridy-slider', GridySlider);

// QuantityInput for + and - button functionality
// Used in: cart items, upsell items
class QuantityInput extends HTMLElement {
  constructor() {
    super();
    this.input = this.querySelector('input');
    this.changeEvent = new Event('change', { bubbles: true });

    this.querySelectorAll('button').forEach((button) => button.addEventListener('click', this.onButtonClick.bind(this)));
  }

  onButtonClick(event) {
    event.preventDefault();
    const previousValue = this.input.value;

    event.target.name === 'plus' ? this.input.stepUp() : this.input.stepDown();
    if (previousValue !== this.input.value) this.input.dispatchEvent(this.changeEvent);
  }
}
customElements.define('quantity-input', QuantityInput);

class ClassWatcher {
  constructor(targetNode, classToWatch, classAddedCallback) {
    this.targetNode = targetNode
    this.classToWatch = classToWatch
    this.classAddedCallback = classAddedCallback
    this.observer = null
    this.lastClassState = targetNode.classList.contains(this.classToWatch)

    this.init()
  }

  init() {
    this.observer = new MutationObserver(this.mutationCallback)
    this.observe()
  }

  observe() {
    this.observer.observe(this.targetNode, { attributes: true })
  }

  disconnect() {
    this.observer.disconnect()
  }

  mutationCallback = (mutationsList) => {
    for (let mutation of mutationsList) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        let currentClassState = mutation.target.classList.contains(this.classToWatch)
        if (this.lastClassState !== currentClassState) {
          this.lastClassState = currentClassState
          if (currentClassState) {
            this.classAddedCallback()
          }
        }
      }
    }
  }
}

class AnimatedNumber extends HTMLElement {
  constructor() {
    super();
    if ('paintWorklet' in CSS && 'registerProperty' in CSS && 'number' in CSS) {
      // Browser should support all necessary CSS features for an animated counter so exit early
      return;
    }

    this.target = this.querySelector('.animation-target');

    // Set a mutation observer on the parent section element to start the animation when element is scrolled into view
    new ClassWatcher(
      this.closest('.shopify-section'),
      'section-in-view',
      this.onClassAdded.bind(this)
    )
  }

  onClassAdded() {
    const isReduced = window.matchMedia(`(prefers-reduced-motion: reduce)`) === true || window.matchMedia(`(prefers-reduced-motion: reduce)`).matches === true;
    const frames = []

    for (let i = 0; i <= +this.dataset.targetNum; i++) {
      // Content only accepts strings as input, thus the double quotation marks inside the template literal
      frames.push({ 'content': `"${i}"` })
    }

    const animation = new Animation(
      new KeyframeEffect(
        this.target,
        frames,
        {
          delay: isReduced ? 0 : +this.dataset.animDelay,
          duration: isReduced ? 0 : +this.dataset.animDuration,
          easing: 'cubic-bezier(.33, 0, .1, 1)',
          fill: 'forwards',
          iterations: 1,
          pseudoElement: '::after'
        }
      ),
      document.timeline
    )

    animation.play();
  }
}
customElements.define('animated-number', AnimatedNumber);

// Tab Container - a custom Woolman built container for content in tabs.
// Usage: <tab-container>
class TabContainer extends HTMLElement {
  constructor() {
    super();

    this.track = this.querySelector('[data-tab-titles]');
    this.slides = this.querySelectorAll('[data-tab-titles] > *');

    this.config = {
      breakpoint_tablet: 768
    }

    this.querySelectorAll('[data-tab-title]').forEach((button) => button.addEventListener('click', this.onButtonClick.bind(this)));
  }

  scrollToTitle(newPosition) {
    if (isNaN(newPosition)) {
      return;
    }

    if (window.innerWidth >= this.config.breakpoint_tablet) {
      return;
    }

    const slideInNewScrollToPos = this.slides[newPosition];
    const scrollToLeft = this.slides[newPosition].offsetLeft - this.slides[0].offsetLeft;
    const scrollToTop = slideInNewScrollToPos.offsetTop;

    this.track.scrollTo({
      left: scrollToLeft,
      top: scrollToTop,
      behavior: "smooth",
    });
  }

  onButtonClick(event) {
    const id = event.target.closest('button').getAttribute('data-tab-title');
    const titleElems = Array.from(this.querySelectorAll('[data-tab-title]'));
    const contentElems = this.querySelectorAll('[data-tab-content]');
    const collectionLinkElems = this.querySelectorAll('[data-tab-collection-link]');
    const elementIndex = titleElems.findIndex(elem => elem.getAttribute('data-tab-title') === id);

    titleElems.forEach(elem => {
      if (elem.getAttribute('data-tab-title') === id) {
        elem.classList.remove('style--subdued');
        elem.classList.add('is-active');
      } else {
        elem.classList.add('style--subdued');
        elem.classList.remove('is-active');
      }
    })

    contentElems.forEach(elem => {
      if (elem.getAttribute('data-tab-content') === id) {
        elem.classList.remove('hidden');
        if (elem.tagName.toLowerCase() === 'gridy-slider') {
          elem.setTrackWidth();
        }
      } else {
        elem.classList.add('hidden');
      }
    })

    collectionLinkElems.forEach(elem => {
      elem.getAttribute('data-tab-collection-link') === id
        ? elem.classList.remove('hidden')
        : elem.classList.add('hidden')
    })

    this.scrollToTitle(elementIndex)
  }
}
customElements.define('tab-container', TabContainer);

// Shipping notification
customElements.define('shipping-notification', class ShippingNotification extends HTMLElement {
  constructor() {
    super();
    this.elementLevelBarFill = null;
    this.elementMessageParagraph = null;
  }

  connectedCallback() {
    const calcInJS = this.hasAttribute('data-calc-in-js');

    this.elementLevelBarFill = this.querySelector('.level-bar-fill');
    this.elementMessageParagraph = this.querySelector('.free-shipping-message');

    if (!this.elementMessageParagraph) {
      console.warn('shipping-notification: .free-shipping-message not found');
      return;
    }

    if (calcInJS) {
      this.updateShippingNotification();
    }
  }

  disconnectedCallback() {
    // Clean up event listeners (if any in future updates)
    // Example: this.removeEventListener('eventName', this.someHandler);
  }

  get freeShippingThreshold() {
    return parseInt(this.dataset.threshold, 10) || 0;
  }

  get cartTotal() {
    return parseInt(this.dataset.cartTotal, 10) || 0;
  }

  updateShippingNotification() {
    console.log('Free shipping check calculated in JS to match the localized currency:', Shopify.currency.active);

    const exchangeRate = parseFloat(Shopify.currency.rate) || 1;
    const cartTotalInLocalCurrency = Math.round(this.cartTotal / exchangeRate);

    if (!this.elementMessageParagraph) return;

    if (cartTotalInLocalCurrency > this.freeShippingThreshold) {
      this.classList.add('threshold-reached');
      this.elementMessageParagraph.innerHTML = window.cartStrings.shipping_free;
      this.elementLevelBarFill.style.setProperty('--fill-width', '100%');
    } else {
      let missingAmount = this.freeShippingThreshold - cartTotalInLocalCurrency;
      let missingPercentage = (cartTotalInLocalCurrency / this.freeShippingThreshold) * 100;
      let message = window.cartStrings.shipping_not_free.replace('[amount]', Woolman.Utils.formatMoney(missingAmount));

      this.classList.remove('threshold-reached');
      this.elementLevelBarFill.style.setProperty('--fill-width', `${missingPercentage}%`);
      this.elementMessageParagraph.innerHTML = message;
    }
  }
});


// Recommendations
if (!customElements.get('cart-recommendations')) {
  customElements.define('cart-recommendations', class CartRecommendations extends HTMLElement {

    observer = undefined;

    constructor() {
      super();
    }

    connectedCallback() {
      this.loadRecommendations(this.dataset.productId);
      document.addEventListener('ajaxProduct:added', (e) => {
        const productId = e.detail.productId || this.dataset.productId;
        this.loadRecommendations(productId);
      });
      document.addEventListener('cart:update', (e) => {
        const itemCount = e.detail.item_count;
        if (itemCount === 0) {
          this.classList.add('hidden');
        }
      });
    }

    disconnectedCallback() {
      // Clean up event listeners when the element is removed from the DOM
      document.removeEventListener('ajaxProduct:added', this.loadRecommendations);
      document.removeEventListener('cart:update', this.loadRecommendations);
    }

    loadRecommendations(productId) {
      if (!this.dataset.url || !productId || !this.dataset.sectionId) {
        return;
      }
      fetch(`${this.dataset.url}&product_id=${productId}&section_id=${this.dataset.sectionId}`)
        .then((response) => response.text())
        .then((text) => {
          const html = document.createElement('div');
          html.innerHTML = text;
          const recommendations = html.querySelector('cart-recommendations');

          if (recommendations?.innerHTML.trim().length) {
            this.innerHTML = recommendations.innerHTML;
            this.classList.remove('hidden');
          } else {
            this.classList.add('hidden');
          }

          if (html.querySelector('upsell-card')) {
            this.classList.add('products-loaded');
          }
        })
        .catch((e) => {
          console.error(e);
        });
    }
  })
}

if (!customElements.get('product-model')) {
  customElements.define('product-model', class ProductModel extends HTMLElement {
    constructor() {
      super();
      this.loadContent();
    }

    loadContent() {
      Shopify.loadFeatures([
        {
          name: 'model-viewer-ui',
          version: '1.0',
          onLoad: this.setupModelViewerUI.bind(this),
        },
      ]);
    }

    setupModelViewerUI(errors) {
      if (errors) return;
      this.modelViewerUI = new Shopify.ModelViewerUI(this.querySelector('model-viewer'));
      this.dataset.loaded = true;
    }
  });
}

window.ProductModel = {
  loadShopifyXR() {
    Shopify.loadFeatures([
      {
        name: 'shopify-xr',
        version: '1.0',
        onLoad: this.setupShopifyXR.bind(this),
      },
    ]);
  },

  setupShopifyXR(errors) {
    if (errors) return;

    if (!window.ShopifyXR) {
      document.addEventListener('shopify_xr_initialized', () =>
        this.setupShopifyXR()
      );
      return;
    }

    document.querySelectorAll('[id^="ProductJSON-"]').forEach((modelJSON) => {
      window.ShopifyXR.addModels(JSON.parse(modelJSON.textContent));
      modelJSON.remove();
    });


    document.querySelectorAll('.product__xr-button').forEach((btn) => {
      btn.removeAttribute('style');
    });
    window.ShopifyXR.setupXRElements();
  },
};

window.addEventListener('DOMContentLoaded', () => {
  if (window.ProductModel) window.ProductModel.loadShopifyXR();
});

class VariantSelects extends HTMLElement {
  constructor() {
    super();

    const media_template = this.dataset.mediaTemplate || 'default';
    const update_url = this.dataset.updateUrl != undefined ? JSON.parse(this.dataset.updateUrl) : true;

    this.config = {
      media_template: media_template,
      update_url: update_url
    }
  }

  connectedCallback() {
    this.addEventListener('change', this.onVariantChange);
  }

  disconnectedCallback() {
    // Clean up event listeners when the element is removed from the DOM
    this.removeEventListener('change', this.onVariantChange);
  }

  onVariantChange(e) {
    // Check if we need to fetch a different product (for combined listings)
    const { isCombinedProduct, targetUrl } = this.combinedListingCheck(e);

    // Disable the add to cart button while we fetch the new product data
    this.toggleAddButton(true, '');
    const productUrl = targetUrl || this.dataset.url;
    this.updateSelectionMetadata(e);

    // Fetch the product section HTML
    this.fetchProductSection({
      newProductUrl: productUrl,
      callback: isCombinedProduct
        ? this.handleCombinedProduct(targetUrl)
        : this.handleUpdateProductInfo()
    }
    );
  }

  combinedListingCheck(e) {
    const currentUrl = window.location.pathname;
    let targetUrl;

    // For radio buttons, get productUrl from the target
    if (e.target.type === 'radio') {
      targetUrl = e.target.dataset.productUrl;
    }
    // For dropdowns, get productUrl from the selected option
    else if (e.target.tagName === 'SELECT') {
      const selectedOption = e.target.selectedOptions[0];
      targetUrl = selectedOption ? selectedOption.dataset.productUrl : undefined;
    }

    let isCombinedProduct = false;

    if (targetUrl != undefined && currentUrl != targetUrl) {
      isCombinedProduct = true;
    }

    return { isCombinedProduct, targetUrl };
  }

  async fetchProductSection({ newProductUrl, callback }) {
    const params = [];
    const isModal = JSON.parse(this.dataset.modal) || false;
    // Fetch either the full page, main-product section, or quick-view template
    if (isModal) {
      params.push('view=quick-view');
    } else {
      let sectionsToFetch = this.dataset.section;
      if (this.config.media_template === 'big-image') {
        const gallerySectionId = document.querySelector('[data-product-media-gallery]')?.dataset.section;
        if (gallerySectionId) {
          sectionsToFetch += `,${gallerySectionId}`;
        }
      }
      params.push(`sections=${sectionsToFetch}`);
    }
    this.selectedOptionValues = this.getSelectedOptionValues();
    const selectedOptionValues = this.selectedOptionValues?.join(',');
    params.push(`option_values=${selectedOptionValues}`);

    const requestUrl = `${newProductUrl}?${params.join('&')}`;

    fetch(requestUrl)
      .then((response) => response.text())
      .then((responseText) => {
        const sections = isModal ? { [this.dataset.section]: responseText } : JSON.parse(responseText);
        callback(sections)
      })
      .catch((error) => {
        console.error('Error fetching product sections:', error);
      });
  }

  handleCombinedProduct(newProductUrl) {
    return (sections) => {
      const isModal = JSON.parse(this.dataset.modal) || false;
      const mainProductSection = sections[this.dataset.section];
      const html = new DOMParser().parseFromString(mainProductSection, 'text/html');
      if (isModal) {
        const modalContent = this.closest('.drawer-content');
        modalContent.innerHTML = html.querySelector('.drawer-content').innerHTML;
      } else {
        const productElement = this.closest('.main-product');
        productElement.innerHTML = html.querySelector('.main-product').innerHTML;
        window.history.replaceState({}, '', `${newProductUrl}`);
      }
    }
  }

  updateSelectionMetadata(event) {
    const target = event.target;
    const tagName = target.tagName;

    if (tagName === 'SELECT' && target.selectedOptions.length) {
      Array.from(target.options)
        .find((option) => option.getAttribute('selected'))
        .removeAttribute('selected');
      target.selectedOptions[0].setAttribute('selected', 'selected');
    }
  }

  getSelectedOptionValues() {
    return Array.from(this.querySelectorAll('select option[selected], fieldset input:checked')).map(
      ({ dataset }) => dataset.optionValueId
    );
  }

  getSelectedVariant(productInfoNode) {
    const selectedVariant = productInfoNode.querySelector('variant-selects [data-selected-variant]')?.innerHTML;
    return !!selectedVariant ? JSON.parse(selectedVariant) : null;
  }

  handleUpdateProductInfo() {
    return (sections) => {
      const mainProductSection = sections[this.dataset.section];
      const mainProductSectionHtml = new DOMParser().parseFromString(mainProductSection, 'text/html');
      const productMediaGallerySectionId = document.querySelector('[data-product-media-gallery]')?.dataset.section;
      const gallerySection = productMediaGallerySectionId ? sections[productMediaGallerySectionId] : null;
      const gallerySectionHtml = gallerySection ? new DOMParser().parseFromString(gallerySection, 'text/html') : null;

      this.currentVariant = this.getSelectedVariant(mainProductSectionHtml);
      this.updatePickupAvailability();
      this.removeErrorMessage();

      if (!this.currentVariant) {
        this.renderProductInfo(mainProductSectionHtml, gallerySectionHtml);
      } else {
        if (this.config.media_template != 'big-image') {
          this.updateMedia();
        }
        if (this.config.update_url) {
          this.updateURL();
          this.updateShareUrl();
        }
        this.updateVariantInput();
        this.renderProductInfo(mainProductSectionHtml, gallerySectionHtml);
      }
    }
  }

  updateMedia() {
    if (!this.currentVariant) return;
    if (!this.currentVariant.featured_media) return;

    const mediaGridySlider = document.getElementById(`slider-${this.dataset.section}`);
    const thumbnailsGridySlider = document.getElementById(`thumbnail-slider-${this.dataset.section}`);

    if (mediaGridySlider) {
      mediaGridySlider.scrollToSlideByID(
        `item-${this.currentVariant.featured_media.id}`
      );
    }

    if (thumbnailsGridySlider) {
      thumbnailsGridySlider.scrollToSlideByID(`thumbnail-item-${this.currentVariant.featured_media.id}`)
    }

    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    const isGrid = mediaGridySlider?.dataset.desktopEnabled === 'false' ? true : false;
    if (isDesktop && isGrid) {
      document.getElementById(`item-${this.currentVariant.featured_media.id}`)?.scrollIntoView();
    }
  }

  updateURL() {
    if (!this.currentVariant || this.dataset.updateUrl === 'false') return;
    window.history.replaceState({}, '', `${this.dataset.url}?variant=${this.currentVariant.id}`);
  }

  updateShareUrl() {
    const shareButton = document.getElementById(`Share-${this.dataset.section}`);
    if (!shareButton || !shareButton.updateUrl) return;
    shareButton.updateUrl(`${window.shopUrl}${this.dataset.url}?variant=${this.currentVariant.id}`);
  }

  updateVariantInput() {
    const productForms = document.querySelectorAll(`#product-form-${this.dataset.section}, #product-form-installment-${this.dataset.section}, #product-form-${this.dataset.section}-product-buy-bar`);
    productForms.forEach((productForm) => {
      const input = productForm.querySelector('input[name="id"]');
      input.value = this.currentVariant.id;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  updatePickupAvailability() {
    const pickUpAvailability = document.querySelector('pickup-availability');
    if (!pickUpAvailability) return;

    if (this.currentVariant && this.currentVariant.available) {
      pickUpAvailability.fetchAvailability(this.currentVariant.id);
    } else {
      pickUpAvailability.removeAttribute('available');
      pickUpAvailability.innerHTML = '';
    }
  }

  removeErrorMessage() {
    const section = this.closest('section');
    if (!section) return;

    const productForm = section.querySelector('product-form');
    if (productForm) productForm.handleErrorMessage();
  }

  renderProductInfo(mainProductSectionHtml, gallerySectionHtml) {
    /**
     * Updates the innerHTML and visibility of a destination element from a source element
     * @param {Object} options - Configuration object for the update operation
     * @param {string} options.id - The base ID of the elements to update
     * @param {Function} [options.shouldHide=(source) => false] - Function that determines if the destination element should be hidden based on the source element
     * @param {string} [options.sectionId=this.dataset.section] - The section ID to append to the element ID when not using selector mode
     * @param {boolean} [options.selector=false] - Whether to use querySelector (true) or getElementById (false) for element selection
     * @param {Document} [options.htmlDoc=mainProductSectionHtml] - The document or HTML fragment to search for the source element
     */
    const updateSourceFromDestination = ({ id, shouldHide = (source) => false, sectionId = this.dataset.section, selector = false, htmlDoc = mainProductSectionHtml }) => {
      const source = selector ? htmlDoc.querySelector(id) : htmlDoc.getElementById(`${id}-${sectionId}`);
      const destination = selector ? document.querySelector(id) : document.getElementById(`${id}-${sectionId}`);
      if (source && destination) {
        destination.innerHTML = source.innerHTML;
        destination.classList.toggle('hidden', shouldHide(source));
      }
    };

    const productMediaGallerySectionId = document.querySelector('[data-product-media-gallery]')?.dataset.section;
    if (this.config.media_template === 'big-image' && productMediaGallerySectionId) {
      updateSourceFromDestination({
        id: 'ProductMediaGallery',
        shouldHide: ({ classList }) => classList.contains('hidden'),
        sectionId: productMediaGallerySectionId,
        htmlDoc: gallerySectionHtml
      });
      updateSourceFromDestination({
        id: '#modal--zoom-gallery-big-image-gallery .modal-body',
        shouldHide: ({ classList }) => classList.contains('hidden'),
        sectionId: productMediaGallerySectionId,
        selector: true,
        htmlDoc: gallerySectionHtml
      });
    }
    updateSourceFromDestination({ id: 'variant-selects' });
    updateSourceFromDestination({ id: 'price' });
    updateSourceFromDestination({ id: 'buy-bar-info' });
    updateSourceFromDestination({ id: 'big-image' });
    updateSourceFromDestination({ id: 'Sku', shouldHide: ({ classList }) => classList.contains('hidden') });
    updateSourceFromDestination({ id: 'Inventory', shouldHide: ({ innerText }) => innerText === '' });
    updateSourceFromDestination({ id: 'saleBadge', shouldHide: ({ classList }) => classList.contains('hidden') });
    if (this.currentVariant) {
      this.toggleAddButton(!this.currentVariant.available, window.variantStrings.soldOut);
    } else {
      this.setUnavailable();
    }
  }

  toggleAddButton(disable = true, text) {
    const productForm = document.getElementById(`product-form-${this.dataset.section}`);
    if (!productForm) return;
    const addButton = productForm.querySelector('[name="add"]');
    const addButtonText = productForm.querySelector('[name="add"] > span');
    const multiplyButtons = productForm.querySelectorAll('.btn--add-multiplier');
    if (!addButton) return;

    if (disable) {
      addButton.setAttribute('disabled', 'disabled');
      if (text) addButtonText.textContent = text;
      if (multiplyButtons) {
        multiplyButtons.forEach(button => {
          button.disabled = true;
        });
      }
    } else {
      addButton.removeAttribute('disabled');
      if (this.dataset.isPreorder == 'true') {
        addButtonText.textContent = window.variantStrings.preOrder;
      } else {
        addButtonText.textContent = window.variantStrings.addToCart;
      }
      if (multiplyButtons) {
        multiplyButtons.forEach(button => {
          button.removeAttribute('disabled');
        });
      }
    }
  }

  setUnavailable() {
    const button = document.getElementById(`product-form-${this.dataset.section}`);
    const addButton = button.querySelector('[name="add"]');
    const addButtonText = button.querySelector('[name="add"] > span');
    const price = document.getElementById(`price-${this.dataset.section}`);
    if (!addButton) return;
    addButtonText.textContent = window.variantStrings.unavailable;
    if (price) price.classList.add('hidden');

    const button_BuyBar = document.getElementById(
      `product-form-${this.dataset.section}-product-buy-bar`
    );
    const addButton_BuyBar = button_BuyBar.querySelector('[name="add"]');
    const addButtonText_BuyBar = button_BuyBar.querySelector(
      '[name="add"] > span'
    );
    const price_BuyBar = document.getElementById(
      `price-${this.dataset.section}-product-buy-bar`
    );
    if (!addButton_BuyBar) return;
    addButtonText_BuyBar.textContent = window.variantStrings.unavailable;
    if (price_BuyBar) price_BuyBar.classList.add("hidden");

    const inventoryStatus = document.getElementById(`Inventory-${this.dataset.section}`);
    if (inventoryStatus) inventoryStatus.classList.add('hidden');

    const saleBadge = document.getElementById(`saleBadge-${this.dataset.section}`);
    if (saleBadge) saleBadge.classList.add('hidden');
  }
}

customElements.define('variant-selects', VariantSelects);


if (!customElements.get('upsell-card')) {
  class UpsellCard extends HTMLElement {
    constructor() {
      super();
      this.isCartRecommendation = this.hasAttribute('data-cart');
      if (!this.isCartRecommendation) {
        this.select = this.querySelector('select');
        this.image = this.querySelector('.card-media img');

        if (this.select) {
          this.select.addEventListener('change', (event) => {
            const selectedOption = event.target.options[event.target.selectedIndex];
            const newImgSrc = selectedOption.getAttribute('data-variant-img-src');
            if (newImgSrc) { this.updateImage(newImgSrc) }
          });
        }
      }
    }

    updateImage(newImgSrc) {
      if (this.image && newImgSrc) {
        // Sanitize and validate URL to prevent XSS
        // Remove any whitespace and HTML entities
        const sanitized = String(newImgSrc).trim().replace(/[\s<>"']/g, '');

        // Reject dangerous protocols (check anywhere in string, not just start)
        const dangerousProtocols = /^(javascript|data|vbscript|file|about):/i;
        if (dangerousProtocols.test(sanitized)) {
          return; // Reject dangerous URLs
        }

        try {
          // Try to parse as absolute URL
          const url = new URL(sanitized, window.location.origin);
          // Only allow http and https protocols
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            // Use the properly constructed URL to prevent any encoding issues
            this.image.src = url.href;
          }
        } catch (e) {
          // If URL parsing fails, it's likely a relative URL
          // Additional validation: ensure it doesn't contain dangerous patterns
          if (!sanitized.includes('javascript:') &&
              !sanitized.includes('data:') &&
              !sanitized.includes('vbscript:') &&
              !sanitized.includes('<') &&
              !sanitized.includes('>')) {
            // For relative URLs, ensure proper encoding
            this.image.src = sanitized;
          }
        }
      }
    }
  }
  customElements.define('upsell-card', UpsellCard);
}