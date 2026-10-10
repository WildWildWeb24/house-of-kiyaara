
// Function that adds 'in-viewport' class to any .shopify-section when it enters the viewport
// Uses IntersectionObserver API for the detection
// https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
(function addInViewportClass(elements) {
  const threshold = Shopify || Shopify.designMode === true ? 0 : 0.15;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        if (!entry.target.classList.contains('ignore-section-animation')) {
          entry.target.classList.add('section-anim-in');
        }
        entry.target.classList.add('section-in-view');
        entry.target.dispatchEvent(new CustomEvent('section:in-viewport'))
      } else {
        entry.target.classList.remove('section-in-view');
      }
    });
  }, {
    root: null,
    rootMargin: '0px',
    threshold: [threshold, 1],
  });

  elements.forEach((el) => {
    observer.observe(el);
  });
})(document.querySelectorAll('.shopify-section'))

// Parallax
const sections = document.querySelectorAll('[data-parallax]');
const activeSections = new Set();

let ticking = false;

function updateParallax() {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

  activeSections.forEach(section => {
    const speed = parseFloat(section.dataset.speed || '0.3');
    const rect = section.getBoundingClientRect();

    const elementCenter = rect.top + rect.height / 2;
    const viewportCenter = viewportHeight / 2;

    const distanceFromCenter = elementCenter - viewportCenter;

    // Multiply by speed and invert if you want opposite direction
    const offset = -distanceFromCenter * speed;

    section.style.setProperty('--offset', `${offset}px`);
  });

  ticking = false;
}

function onScroll() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(updateParallax);
  }
}

// Intersection Observer: controls who is active
const observer = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      const section = entry.target;

      if (entry.isIntersecting) {
        activeSections.add(section);
      } else {
        activeSections.delete(section);
        // Optional: reset offset when out of view
        section.style.setProperty('--offset', `0px`);
      }
    });

    // After (de)activating, do one update so it’s in sync
    onScroll();
  },
  {
    root: null,
    threshold: 0, // trigger as soon as it touches the viewport
  }
);

// Observe all parallax sections
sections.forEach(section => observer.observe(section));

// Single scroll listener for all
window.addEventListener('scroll', onScroll, { passive: true });

// Also run once on load
updateParallax();