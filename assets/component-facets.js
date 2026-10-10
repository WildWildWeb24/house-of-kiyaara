Woolman.Utils.prepareQueryParams();
Woolman.Collection = document.querySelector('[data-ajax-parent]');

/**
 * Generates search params from form data for filtering collection or search results.
 * @param {HTMLElement} formElement - Form element to turn into search params.
 * @returns
 */
const generateSearchParamsFromFormData = (formElement) => {
  const checkboxesToKeep = {};
  for (const element of formElement.elements) {
    const key = element.getAttribute('name');
    if (!key || !key.includes('filter')) continue;

    const value = element.value;
    const inputType = element.getAttribute('type');

    if (value === '') continue;

    // If this is a price range input, and both gte and lte are at their min/max, skip them
    if (
      (key === 'filter.v.price.gte' || key === 'filter.v.price.lte') &&
      formElement.querySelector('[name="filter.v.price.gte"]') &&
      formElement.querySelector('[name="filter.v.price.lte"]')
    ) {
      const minInput = formElement.querySelector('[name="filter.v.price.gte"]');
      const maxInput = formElement.querySelector('[name="filter.v.price.lte"]');
      const minValue = minInput ? minInput.getAttribute('min') : null;
      const maxValue = maxInput ? maxInput.getAttribute('max') : null;
      const valGte = minInput ? minInput.value : null;
      const valLte = maxInput ? maxInput.value : null;

      if (
        minValue !== null && maxValue !== null &&
        valGte === minValue && valLte === maxValue
      ) {
        // Skip both min and max values by not processing these keys
        continue;
      }
    }

    if (inputType == 'checkbox') {
      if (element.checked) {
        if (!checkboxesToKeep[key]) {
          checkboxesToKeep[key] = [value];
          continue;
        } else {
          checkboxesToKeep[key].push(value);
          continue;
        }
      }

      if (Shopify.queryParams[key] && !checkboxesToKeep[key]) {
        delete Shopify.queryParams[key];
      }
      continue;
    } else {
      Shopify.queryParams[key] = value;
    }
  }

  if (Object.entries(checkboxesToKeep).length > 0) {
    for (const [key, value] of Object.entries(checkboxesToKeep)) {
      Shopify.queryParams[key] = value.join(',');
    }
  }

  return Shopify.queryParams;
};

/**
 * This function fetches fresh collection page via AJAX request to collection's url.
 * @param {Array} selectors - Array of HTML element selectors to update.
 */
const getCollectionAJAX = async (selectors) => {
  Shopify.queryParams.page = 1;
  const CollectionURLSearchParams = getCollectionURLSearchParams(),
        url = location.pathname + '?' + CollectionURLSearchParams;

  if (selectors) {
    try {
      const res = await fetch(url);
      const body = await res.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(body, 'text/html');

      for (const selector of selectors) {
        if (!document.querySelector(selector) || !doc.querySelector(selector)) continue;
        document.querySelector(selector).innerHTML = doc.querySelector(selector).innerHTML;

        // Update apply number
        if (selector === '#product-grid-ajax') {
          let filteredCount = parseInt(doc.querySelector(selector).dataset.filteredCount, 10),
              context = doc.querySelector(selector).dataset.context,
              zeroResultsMsg = document.getElementById('facets-no-results-message'),
              resultsStringOne = window.themeStrings.product_count_simple_one,
              resultsStringOther = window.themeStrings.product_count_simple_other;

          if (context === 'search') {
            resultsStringOne = window.themeStrings.results_with_count_one;
            resultsStringOther = window.themeStrings.results_with_count_other;
          }

          if (filteredCount === 0) {
            document.getElementById('apply-count').innerHTML = resultsStringOther.replace('[count]', filteredCount);
            zeroResultsMsg.classList.remove('hide');
          } else if (filteredCount === 1) {
            document.getElementById('apply-count').innerHTML = resultsStringOne.replace('[count]', filteredCount);
            zeroResultsMsg.classList.add('hide');
          } else {
            document.getElementById('apply-count').innerHTML = resultsStringOther.replace('[count]', filteredCount);
            zeroResultsMsg.classList.add('hide');
          }
        }
      }

      window.history.replaceState('', '', url);
      Woolman.Collection.classList.remove('processing');

    } catch (err) {
      location.search = CollectionURLSearchParams;
    }
  } else {
    location.search = CollectionURLSearchParams;
  }
};

/**
 * Returns URL for current collection. Utilizes URL parameters to save user's filters, sorting and pagination.
 * @returns
 */
const getCollectionURLSearchParams = () => {
  return new URLSearchParams(Object.entries(Shopify.queryParams)).toString().replaceAll(/%2C/g, ',');
};

class SortBySelect extends HTMLElement {
  constructor() {
    'use strict';
    super();

    // Find select element or radio buttons group within the custom element
    this.el = this.querySelector('select') || this.querySelectorAll('input[type="radio"]');
    this.selectors = {
      grid: '#product-grid-ajax',
      pagination: '#pagination-ajax',
    };

    // Initialize value based on current query parameters
    const sortByValue = Shopify.queryParams['sort_by'];
    if (sortByValue) {
      if (this.el instanceof HTMLSelectElement) {
        this.el.value = sortByValue;
      } else if (this.el instanceof NodeList) {
        this.el.forEach(radio => {
          if (radio.value === sortByValue) {
            radio.checked = true;
          }
        });
      }
    }

    // Add event listeners for the select or radio buttons
    if (this.el instanceof HTMLSelectElement) {
      this.el.addEventListener('change', this.onSelectChange.bind(this));
    } else if (this.el instanceof NodeList) {
      this.el.forEach(radio => {
        radio.addEventListener('change', this.onSelectChange.bind(this));
      });
    }
  }

  connectedCallback() {
    this.syncInputs();
  }

  syncInputs() {
    const allSortBySelects = document.querySelectorAll('sort-by');
    if (this.el instanceof NodeList) {
      this.el.forEach(radio => {
        radio.addEventListener('change', () => {
          allSortBySelects.forEach((sortBySelect) => {
            if (sortBySelect !== this) {
              const correspondingRadio = sortBySelect.querySelector(`input[type="radio"][value="${radio.value}"]`);
              if (correspondingRadio) {
                correspondingRadio.checked = radio.checked;
              }
            }
          });
        });
      });
    }
  }

  async onSelectChange(event) {
    Woolman.Collection.classList.add('processing');
    Woolman.Utils.prepareQueryParams();
    const value = event.target.value;
    Shopify.queryParams.sort_by = value;
    await getCollectionAJAX(Object.values(this.selectors));
  }
}

if (customElements.get('sort-by') === undefined) {
  customElements.define('sort-by', SortBySelect);
}

class FacetsForm extends HTMLElement {
  constructor() {
    'use strict';
    super();

    this.el = this.querySelector('form');
    this.selectors = {
      grid: '#product-grid-ajax',
      count: '#products-count-ajax',
      currentFacets: '#current-facets-ajax',
      pagination: '#pagination-ajax',
    };

    const inputs = this.el.querySelectorAll('input');
    inputs.forEach((input) => {
      input.addEventListener('change', debounce(this.onInputChange.bind(this), 150));
    });

    this.el.addEventListener('submit', this.onFormSubmit.bind(this));
  }

  connectedCallback() {
    this.syncInputs();
  }

  syncInputs() {
    const allFacetsForms = document.querySelectorAll('facets-form');
    const inputs = this.el.querySelectorAll('input');

    inputs.forEach((input) => {
      input.addEventListener('change', () => {
        allFacetsForms.forEach((form) => {
          if (form !== this) {
            const correspondingInput = form.querySelector(`input[name="${input.name}"][value="${input.value}"]`);
            if (correspondingInput) {
              correspondingInput.checked = input.checked;
            }
          }
        });
      });
    });
  }

  async onFormSubmit(event) {
    event.preventDefault();
    Woolman.Collection.classList.add('processing');
    Woolman.Utils.prepareQueryParams();
    generateSearchParamsFromFormData(this.el);

    Woolman.ModalsAndDrawers.closeModalOrDrawer(this.closest('[data-drawer]').getAttribute('id'));
    getCollectionAJAX(Object.values(this.selectors));
  }

  async onInputChange() {
    Woolman.Collection.classList.add('processing');
    generateSearchParamsFromFormData(this.el);
    getCollectionAJAX(Object.values(this.selectors));
  }
}

if (customElements.get('facets-form') === undefined) {
  customElements.define('facets-form', FacetsForm);
}

class CurrentFacetButton extends HTMLElement {
  constructor() {
    'use strict';
    super();

    this.selectors = {
      grid: '#product-grid-ajax',
      count: '#products-count-ajax',
      currentFacets: '#current-facets-ajax',
      pagination: '#pagination-ajax',
    };

    this.btn = this.querySelector('a');
    this.btn.addEventListener('click', this.removeFacet.bind(this));
  }

  async removeFacet(event) {
    event.preventDefault();
    if (event.currentTarget.dataset.filterParamName === 'filter.v.price') {
      const price_slider = document.querySelector('price-range-slider');
      delete Shopify.queryParams['filter.v.price.lte'];
      delete Shopify.queryParams['filter.v.price.gte'];
      price_slider.reset();
      getCollectionAJAX(Object.values(this.selectors));
    } else {
      const inputToReset = document.querySelector(`.filter-form [data-key-value="${ event.currentTarget.dataset.filterParamName }:${ event.currentTarget.dataset.filterValue }"]`);
      inputToReset.checked = false;
      inputToReset.dispatchEvent(new Event('change'));
    }
  }
}
if (customElements.get('current-facet-button') === undefined) {
  customElements.define('current-facet-button', CurrentFacetButton);
}