function isExtensionPage() {
  const protocol = window.location.protocol;
  const href = window.location.href;
  return protocol === 'chrome:' || 
         protocol === 'chrome-extension:' ||
         protocol === 'moz-extension:' ||
         protocol === 'extension:' ||
         href.includes('chrome://') ||
         href.includes('chrome-extension://') ||
         href.includes('moz-extension://') ||
         href.includes('extension://');
}

if (typeof window.VATCalculator === 'undefined') {
window.VATCalculator = class VATCalculator {
  constructor() {
    this.MAX_PRICE = 1000000;
    this.MIN_PRICE = 1;
    this.RESCAN_DEBOUNCE_MS = CONSTANTS.RESCAN_DEBOUNCE_MS;
    this.MAX_PRICE_ELEMENTS = CONSTANTS.MAX_PRICE_ELEMENTS;
    
    this.enabled = false;
    this.vatRate = CONSTANTS.DEFAULT_VAT_RATE;
    this.countryCode = this.detectCountryCode();
    this.customCurrency = '';
    this.isCustomRate = false;
    this.watchChanges = true;
    this.showVATBreakdown = true;
    this.priceElements = [];
    this.tooltip = null;
    this.rescanTimeout = null;
    this.initialRescanTimeout = null;
    this.isScanning = false;
    this.mutationObserver = null;
    this.init();
  }

  init() {
    this.loadSettings();
    
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;
      
      let needsUpdate = false;
      let needsRescan = false;
      
      try {
        if (changes.enabled) {
          this.enabled = changes.enabled.newValue;
          this.toggleExtension();
          needsUpdate = true;
        }
        
        if (changes.vatRate || changes.vatRateNumber || changes.customRate) {
          const vatRate = changes.vatRate ? changes.vatRate.newValue : (this.isCustomRate ? CONSTANTS.CUSTOM_RATE_VALUE : 'unknown');
          this.isCustomRate = vatRate === CONSTANTS.CUSTOM_RATE_VALUE;
          
          let newRate;
          if (changes.vatRateNumber) {
            newRate = changes.vatRateNumber.newValue;
          } else if (this.isCustomRate) {
            const customRate = changes.customRate ? changes.customRate.newValue : '';
            newRate = parseInt(customRate, 10) || CONSTANTS.DEFAULT_VAT_RATE;
          } else {
            newRate = this.vatRate; // Keep existing rate
          }
          
          if (newRate !== this.vatRate) {
            this.vatRate = newRate;
            needsUpdate = true;
          }
        }
        
        if (changes.customCurrency) {
          this.customCurrency = changes.customCurrency.newValue || '';
          needsUpdate = true;
        }
        
        if (changes.countryCode && changes.countryCode.newValue !== this.countryCode) {
          this.countryCode = changes.countryCode.newValue;
          needsUpdate = true;
        }
        
        if (changes.watchChanges !== undefined && changes.watchChanges.newValue !== this.watchChanges) {
          this.watchChanges = changes.watchChanges.newValue;
          if (this.watchChanges) {
            this.observeChanges();
          } else if (this.mutationObserver) {
            this.mutationObserver.disconnect();
          }
        }
        
        if (changes.showVATBreakdown !== undefined && changes.showVATBreakdown.newValue !== this.showVATBreakdown) {
          this.showVATBreakdown = changes.showVATBreakdown.newValue;
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          this.updatePriceElements();
        }
        
        if (needsRescan) {
          this.scanForPrices();
        }
      } catch (error) {
        ErrorHandler.runtime('Error handling storage change', error);
      }
    });
  }

  loadSettings() {
    chrome.storage.sync.get(['vatRate', 'vatRateNumber', 'customRate', 'customCurrency', 'enabled', 'countryCode', 'watchChanges', 'showVATBreakdown'], (result) => {
      if (chrome.runtime.lastError) {
        ErrorHandler.storage('Failed to load settings', chrome.runtime.lastError);
        return;
      }
      
      if (result.vatRate) {
        this.isCustomRate = result.vatRate === CONSTANTS.CUSTOM_RATE_VALUE;
        if (result.vatRateNumber) {
          this.vatRate = result.vatRateNumber;
        } else if (this.isCustomRate) {
          this.vatRate = parseInt(result.customRate, 10) || CONSTANTS.DEFAULT_VAT_RATE;
        } else {
          this.vatRate = CONSTANTS.DEFAULT_VAT_RATE;
        }
      }
      if (result.customCurrency) {
        this.customCurrency = result.customCurrency;
      }
      if (result.countryCode) {
        this.countryCode = result.countryCode;
      }
      if (result.enabled !== undefined) {
        this.enabled = result.enabled;
      } else {
        this.enabled = true;
      }
      if (result.watchChanges !== undefined) {
        this.watchChanges = result.watchChanges;
      }
      if (result.showVATBreakdown !== undefined) {
        this.showVATBreakdown = result.showVATBreakdown;
      }
      this.updatePriceElements();
      this.scanForPrices();
      this.updatePriceElements();
      if (this.initialRescanTimeout) clearTimeout(this.initialRescanTimeout);
      this.initialRescanTimeout = setTimeout(() => {
        this.initialRescanTimeout = null;
        try { this.scanForPrices(); this.updatePriceElements(); } catch (e) { ErrorHandler.runtime('Delayed rescan failed', e); }
      }, 2000);
      this._scheduleLoadRescan();
      if (this.watchChanges) {
        this.observeChanges();
      }
    });
  }

  _scheduleLoadRescan() {
    const runRescan = () => {
      try { this.scanForPrices(); this.updatePriceElements(); } catch (e) { ErrorHandler.runtime('Load rescan failed', e); }
    };
    if (document.readyState === 'complete') {
      setTimeout(runRescan, 300);
    } else {
      window.addEventListener('load', () => setTimeout(runRescan, 300), { once: true });
    }
    this._lateRescanTimeout = setTimeout(runRescan, 5000);
  }

  cleanupPriceElements() {
    const validElements = [];
    
    for (let i = 0; i < this.priceElements.length; i++) {
      const element = this.priceElements[i];
      
      if (!element) continue;
      
      if (document.contains(element)) {
        validElements.push(element);
      } else {
        this.removeHoverEvents(element);
      }
    }
    
    this.priceElements = validElements;
  }
  
  removeHoverEvents(element) {
    if (!element) return;
    const capture = true;
    if (element._vatMouseEnter) {
      element.removeEventListener('mouseenter', element._vatMouseEnter, capture);
      delete element._vatMouseEnter;
    }
    if (element._vatMouseLeave) {
      element.removeEventListener('mouseleave', element._vatMouseLeave, capture);
      delete element._vatMouseLeave;
    }
    if (element._vatMouseMove) {
      element.removeEventListener('mousemove', element._vatMouseMove, capture);
      delete element._vatMouseMove;
    }
  }

  isElementVisible(element) {
    if (!element) return false;
    return element.offsetParent !== null;
  }

  getCurrencyRegexSource() {
    return (typeof CURRENCY_REGEX_SOURCE !== 'undefined' && CURRENCY_REGEX_SOURCE)
      ? CURRENCY_REGEX_SOURCE
      : 'zł|PLN|€|EUR|\\$|USD|£|GBP|kr|Kč|lei|лв|₴|Br|Ft|kn';
  }

  scanPriceContainers() {
    const currencyPart = this.getCurrencyRegexSource();
    const seen = new Set();
    const schemes = [
      {
        containerSelectors: ['[class*="price-template__large"]', '[class*="price-template"][class*="large"]', '[class*="price-template"]'],
        totalSel: '[class*="--total"]',
        decimalSel: '[class*="--decimal"]',
        currencySel: '[class*="--currency"]'
      },
      {
        containerSelectors: ['.main-price', '[class*="main-price"]'],
        totalSel: '.whole, [class*="whole"]',
        decimalSel: '.cents, [class*="cents"]',
        currencySel: '.currency, [class*="currency"]'
      }
    ];
    for (const scheme of schemes) {
      for (const selector of scheme.containerSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (this.priceElements.length >= this.MAX_PRICE_ELEMENTS) break;
          if (el.closest('.vat-price-container') || el.classList.contains('vat-price-container')) continue;
          if (seen.has(el)) continue;
          seen.add(el);
          const totalSpan = el.querySelector(scheme.totalSel);
          const decimalSpan = el.querySelector(scheme.decimalSel);
          const currencySpan = el.querySelector(scheme.currencySel);
          if (!totalSpan || !totalSpan.textContent.trim()) continue;
          const totalText = totalSpan.textContent.trim().replace(/\s/g, '');
          const decimalText = decimalSpan ? decimalSpan.textContent.trim() : '00';
          const currencyText = currencySpan ? currencySpan.textContent.trim() : 'zł';
          if (!/^\d+$/.test(totalText)) continue;
          const decimalNorm = /^\d{1,2}$/.test(decimalText) ? decimalText.padStart(2, '0').slice(0, 2) : '00';
          const priceText = totalText + ',' + decimalNorm + ' ' + currencyText;
          const price = this.parsePrice(priceText);
          if (price <= 0 || price >= this.MAX_PRICE) continue;
          if (!this.validatePrice(priceText, totalText + ',' + decimalNorm, price)) continue;
          if (!this.isElementVisible(el)) continue;
          try {
            el.dataset.vatProcessed = 'true';
            el.dataset.price = price;
            el.dataset.originalText = priceText;
            el.classList.add('vat-price-container');
            el.classList.add(this.enabled ? 'vat-enabled' : 'vat-disabled');
            this.addHoverEvents(el);
            this.priceElements.push(el);
          } catch (err) {
            ErrorHandler.runtime('Container price setup failed', err);
          }
        }
      }
    }

    const dataPriceSelectors = ['.product-price', '[class*="product-price"]'];
    for (const selector of dataPriceSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (this.priceElements.length >= this.MAX_PRICE_ELEMENTS) break;
        if (el.closest('.vat-price-container') || el.classList.contains('vat-price-container')) continue;
        if (seen.has(el)) continue;
        const dataPrice = el.getAttribute('data-price');
        if (!dataPrice || dataPrice.trim() === '') continue;
        const price = parseFloat(dataPrice.replace(/\s/g, '').replace(',', '.'));
        if (isNaN(price) || price <= 0 || price >= this.MAX_PRICE) continue;
        let currencyText = 'zł';
        const dataDefault = el.getAttribute('data-default') || el.getAttribute('data-default-price-gross') || '';
        const dataCurrencyRe = (typeof CURRENCY_REGEX_SOURCE !== 'undefined' && CURRENCY_REGEX_SOURCE)
          ? new RegExp('(?:' + CURRENCY_REGEX_SOURCE + ')', 'i')
          : /(?:zł|PLN|€|EUR|\$|USD|£|GBP|kr|Kč|lei|лв|₴|Br|Ft|kn)/i;
        const currencyMatch = dataDefault.match(dataCurrencyRe);
        if (currencyMatch) currencyText = currencyMatch[0];
        else {
          const textContent = (el.textContent || '').trim();
          const textCurrencyMatch = textContent.match(dataCurrencyRe);
          if (textCurrencyMatch) currencyText = textCurrencyMatch[0];
        }
        const totalText = Math.floor(price).toString();
        const decimalPart = price % 1;
        const decimalNorm = decimalPart > 0 ? Math.round(decimalPart * 100).toString().padStart(2, '0').slice(0, 2) : '00';
        const priceText = totalText + ',' + decimalNorm + ' ' + currencyText;
        if (!this.validatePrice(priceText, totalText + ',' + decimalNorm, price)) continue;
        if (!this.isElementVisible(el)) continue;
        seen.add(el);
        try {
          el.dataset.vatProcessed = 'true';
          el.dataset.price = price;
          el.dataset.originalText = priceText;
          el.classList.add('vat-price-container');
          el.classList.add(this.enabled ? 'vat-enabled' : 'vat-disabled');
          this.addHoverEvents(el);
          this.priceElements.push(el);
        } catch (err) {
          ErrorHandler.runtime('Container price setup failed', err);
        }
      }
    }

    const dataNamePriceSelectors = ['[data-name="productPrice"]', '[data-name*="productPrice"]'];
    const ariaPricePattern4to7 = new RegExp('(\\d{4,7}(?:[.,]\\d{2})?)\\s*(?:' + currencyPart + ')', 'gi');
    const ariaPricePattern = new RegExp('(\\d{1,3}(?:[\\s,.]\\d{3}){0,4}(?:[.,]\\d{2})?)\\s*(?:' + currencyPart + ')', 'gi');
    const ariaPricePatternCurrencyFirst = new RegExp('(?:' + currencyPart + ')\\s*(\\d{1,3}(?:[\\s,.]\\d{3}){0,4}(?:[.,]\\d{2})?)', 'gi');
    for (const selector of dataNamePriceSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (this.priceElements.length >= this.MAX_PRICE_ELEMENTS) break;
        if (el.closest('.vat-price-container') || el.classList.contains('vat-price-container')) continue;
        if (seen.has(el)) continue;
        let priceSource = el.getAttribute('aria-label') || '';
        if (!priceSource) {
          const ariaEl = el.querySelector('[aria-label*="zł"], [aria-label*="PLN"], [aria-label*="€"], [aria-label*="EUR"], [aria-label*="$"], [aria-label*="£"]');
          if (ariaEl) priceSource = ariaEl.getAttribute('aria-label') || '';
        }
        if (!priceSource) priceSource = (el.textContent || '').trim();
        if (priceSource.length < 3) continue;
        ariaPricePattern4to7.lastIndex = 0;
        let match = ariaPricePattern4to7.exec(priceSource);
        if (!match) {
          ariaPricePattern.lastIndex = 0;
          match = ariaPricePattern.exec(priceSource);
        }
        if (!match) {
          ariaPricePatternCurrencyFirst.lastIndex = 0;
          match = ariaPricePatternCurrencyFirst.exec(priceSource);
        }
        if (!match) continue;
        const priceText = match[1];
        const price = this.parsePrice(priceText);
        if (price <= 0 || price >= this.MAX_PRICE) continue;
        if (!this.validatePrice(priceSource, priceText, price)) continue;
        if (!this.isElementVisible(el)) continue;
        seen.add(el);
        try {
          el.dataset.vatProcessed = 'true';
          el.dataset.price = price;
          el.dataset.originalText = match[0].trim();
          el.classList.add('vat-price-container');
          el.classList.add(this.enabled ? 'vat-enabled' : 'vat-disabled');
          this.addHoverEvents(el);
          this.priceElements.push(el);
        } catch (err) {
          ErrorHandler.runtime('Container price setup failed', err);
        }
      }
    }

    const textPricePattern4to7 = new RegExp('(\\d{4,7}(?:[.,]\\d{2})?)\\s*(?:' + currencyPart + ')', 'gi');
    const textPricePattern = new RegExp('(\\d{1,3}(?:[\\s,.]\\d{3}){0,4}(?:[.,]\\d{2})?)\\s*(?:' + currencyPart + ')', 'gi');
    const textPricePatternCurrencyFirst = new RegExp('(?:' + currencyPart + ')\\s*(\\d{1,3}(?:[\\s,.]\\d{3}){0,4}(?:[.,]\\d{2})?)', 'gi');
    const textPriceSelectors = [
      '[class*="__price"]', '[class*="-price"]', '[class*="price"]',
      '[class*="cena"]', '[class*="preis"]', '[class*="prix"]', '[class*="precio"]', '[class*="prezzo"]', '[class*="valor"]',
      '[class*="pris"]', '[class*="fiyat"]', '[class*="cijena"]', '[class*="hinta"]', '[class*="prijs"]',
      '[data-testid*="price"]', '[data-testid*="Price"]',
      '[aria-label*="€"]', '[aria-label*="$"]', '[aria-label*="£"]', '[aria-label*="zł"]', '[aria-label*="kr"]', '[aria-label*="R$"]', '[aria-label*="¥"]', '[aria-label*="₹"]', '[aria-label*="₽"]', '[aria-label*="₺"]', '[aria-label*="PLN"]', '[aria-label*="EUR"]', '[aria-label*="USD"]'
    ];
    for (const selector of textPriceSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (this.priceElements.length >= this.MAX_PRICE_ELEMENTS) break;
        if (el.closest('.vat-price-container') || el.classList.contains('vat-price-container')) continue;
        if (seen.has(el)) continue;
        const text = (el.textContent || '').trim();
        if (text.length < 3) continue;
        textPricePattern4to7.lastIndex = 0;
        let match = textPricePattern4to7.exec(text);
        if (!match) {
          textPricePattern.lastIndex = 0;
          match = textPricePattern.exec(text);
        }
        if (!match) {
          textPricePatternCurrencyFirst.lastIndex = 0;
          match = textPricePatternCurrencyFirst.exec(text);
        }
        if (!match) continue;
        const priceText = match[1];
        const price = this.parsePrice(priceText);
        if (price <= 0 || price >= this.MAX_PRICE) continue;
        if (!this.validatePrice(text, priceText, price)) continue;
        if (!this.isElementVisible(el)) continue;
        seen.add(el);
        try {
          el.dataset.vatProcessed = 'true';
          el.dataset.price = price;
          el.dataset.originalText = match[0].trim();
          el.classList.add('vat-price-container');
          el.classList.add(this.enabled ? 'vat-enabled' : 'vat-disabled');
          this.addHoverEvents(el);
          this.priceElements.push(el);
        } catch (err) {
          ErrorHandler.runtime('Container price setup failed', err);
        }
      }
    }
  }

  scanForPrices() {
    if (this.isScanning) return;
    if (isExtensionPage()) return;
    
    this.cleanupPriceElements();
    if (!this.enabled) return;
    
    this.isScanning = true;

    try {
      this.scanPriceContainers();

      const currencyPart = this.getCurrencyRegexSource();
      const pricePatterns = [
        new RegExp('(\\d{4,7}(?:[.,]\\d{2})?)\\s*(?:' + currencyPart + ')', 'gi'),
        new RegExp('(\\d{1,3}(?:[\\s,.]\\d{3}){0,4}(?:[.,]\\d{2})?)\\s*(?:' + currencyPart + ')', 'gi'),
        new RegExp('(?:' + currencyPart + ')\\s*(\\d{1,3}(?:[\\s,.]\\d{3}){0,4}(?:[.,]\\d{2})?)', 'gi'),
        /(?:price|cost|amount|total|sum|cena|preis|prix|precio|prezzo|valor|pris|fiyat|cijena|hinta|prijs):\s*(\d{1,3}(?:[\s,.]\d{3}){0,4}(?:[.,]\d{2})?)/gi,
        /(\d{1,3}(?:[\s,.]\d{3}){1,4}(?:[.,]\d{2})?(?![\da-zA-Z])|\d{4,7}(?:[.,]\d{2})(?![\da-zA-Z]))/g
      ];

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            
            const tagName = parent.tagName;
            if (tagName === 'SCRIPT' || tagName === 'STYLE' || 
                tagName === 'NOSCRIPT' || tagName === 'TEXTAREA') {
              return NodeFilter.FILTER_REJECT;
            }
            
            const text = node.textContent;
            if (!text || text.trim().length < 2) {
              return NodeFilter.FILTER_REJECT;
            }
            
            if (parent.classList.contains('vat-price-element') || 
                parent.classList.contains('vat-tooltip') ||
                parent.classList.contains('vat-price-container') ||
                parent.closest('.vat-price-container')) {
              return NodeFilter.FILTER_REJECT;
            }
            
            return NodeFilter.FILTER_ACCEPT;
          }
        },
        false
      );

      const processedNodes = new Set();
      const nodesToProcess = [];

      let node;
      let nodeCount = 0;
      
      while (node = walker.nextNode()) {
        nodeCount++;
        if (nodeCount > CONSTANTS.MAX_SCAN_NODES) {
          ErrorHandler.performance('Too many nodes detected, stopping scan', { nodeCount });
          break;
        }
        
        if (processedNodes.has(node) || !document.contains(node)) {
          continue;
        }
        
        if (node.parentElement && !this.isElementVisible(node.parentElement)) {
          continue;
        }
        
        const text = node.textContent;
        if (!text || text.trim().length < 2) {
          continue;
        }
        
        for (const pattern of pricePatterns) {
          let match;
          pattern.lastIndex = 0;
          while ((match = pattern.exec(text)) !== null) {
            const priceText = match[1];
            const price = this.parsePrice(priceText);
            if (price > 0 && price < this.MAX_PRICE && this.validatePrice(text, priceText, price)) {
              nodesToProcess.push({
                node: node,
                price: price,
                startIndex: match.index,
                length: match[0].length
              });
              processedNodes.add(node);
              break;
            }
          }
        }
      }

      const maxElementsToProcess = Math.min(nodesToProcess.length, this.MAX_PRICE_ELEMENTS - this.priceElements.length);
      
      for (let i = 0; i < maxElementsToProcess; i++) {
        const item = nodesToProcess[i];
        if (item.node && 
            item.node.parentNode && 
            document.contains(item.node) && 
            document.contains(item.node.parentNode)) {
          
          this.createPriceElement(item.node, item.price, item.startIndex, item.length);
        }
      }
    } finally {
      this.isScanning = false;
    }
  }

  validatePrice(text, priceText, price) {
    if (price < this.MIN_PRICE) return false;
    
    const context = text.toLowerCase();
    const priceLower = priceText.toLowerCase();
    
    const falsePositives = [
      'kurier', 'gls', 'dpd', 'ups', 'fedex', 'dhl', 'paczkomat', 'inpost',
      'przedpłata', 'dostawa', 'wysyłka', 'opłata', 'koszt', 'shipping', 'delivery',
      'order', 'zamówienie', 'invoice', 'faktura',
      'version', 'ver', 'v.', 'build', 'release',
      'telefon', 'phone', 'fax', 'postal', 'kod pocztowy',
      'nip', 'regon', 'krs',
      'page', 'strona', 'line', 'linia', 'row', 'wiersz', 'column', 'kolumna',
      'date', 'data', 'time', 'czas', 'hour', 'godzina', 'year', 'rok',
      'qty', 'quantity', 'ilość', 'szt', 'pcs', 'pieces', 'units'
    ];
    const wordBoundaryFalsePositives = ['nr', 'numer', 'number', 'id', 'kod', 'code', 'ref', 'reference', 'tel', 'zip'];
    
    const productKeywords = [
      'ryzen', 'intel', 'core', 'xeon', 'celeron', 'pentium', 'athlon',
      'geforce', 'radeon', 'nvidia', 'amd', 'gtx', 'rtx', 'rx',
      'iphone', 'galaxy', 'pixel', 'oneplus', 'xiaomi', 'redmi',
      'model', 'serie', 'series', 'gen', 'generation',
      'ddr', 'ssd', 'hdd', 'nvme', 'pcie', 'usb', 'hdmi',
      'thread', 'ripper', 'threadripper', 'epyc'
    ];
    
    const priceIndex = context.indexOf(priceLower);
    if (priceIndex !== -1) {
      const contextBefore = context.substring(Math.max(0, priceIndex - 100), priceIndex);
      const contextAfter = context.substring(priceIndex, Math.min(context.length, priceIndex + 100));
      const surroundingContext = contextBefore + contextAfter;
      
      for (const fp of falsePositives) {
        if (surroundingContext.includes(fp)) {
          return false;
        }
      }
      for (const w of wordBoundaryFalsePositives) {
        const re = new RegExp('(?:^|[^a-zA-Z\u00c0-\u024f])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|[^a-zA-Z\u00c0-\u024f])', 'i');
        if (re.test(surroundingContext)) {
          return false;
        }
      }
      
      const currencyRe = (typeof CURRENCY_REGEX_SOURCE !== 'undefined' && CURRENCY_REGEX_SOURCE)
        ? new RegExp(CURRENCY_REGEX_SOURCE, 'i')
        : /zł|PLN|€|EUR|\$|USD|£|GBP|kr|Kč|lei|лв|₴|Br|Ft|kn/i;
      const hasCurrencySymbol = currencyRe.test(text);
      if (!hasCurrencySymbol) {
        for (const pk of productKeywords) {
          if (surroundingContext.includes(pk)) {
            return false;
          }
        }
      }
    }
    
    const priceStartIndex = text.indexOf(priceText);
    const contextWindow = text.substring(
      Math.max(0, priceStartIndex - 20), 
      Math.min(text.length, priceStartIndex + priceText.length + 20)
    );
    
    if (/%/.test(contextWindow)) return false;
    if (/\d+\s*[x×]\s*\d+/i.test(contextWindow)) return false;
    if (/\b\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}\b/.test(contextWindow)) return false;
    if (/\d{1,2}:\d{2}(?::\d{2})?/.test(contextWindow)) return false;
    const ctxCurrencyRe = (typeof CURRENCY_REGEX_SOURCE !== 'undefined' && CURRENCY_REGEX_SOURCE)
      ? new RegExp('(?:' + CURRENCY_REGEX_SOURCE + ')|price|cost|cena', 'i')
      : /price|cost|€|\$|£|zł/i;
    if (/\bv?\d+\.\d+(?:\.\d+)?\b/i.test(contextWindow) && !ctxCurrencyRe.test(contextWindow)) return false;
    if (/build\s*\d+/i.test(contextWindow)) return false;
    
    const afterPriceIndex = priceStartIndex + priceText.length;
    if (afterPriceIndex < text.length) {
      const charAfter = text.charAt(afterPriceIndex);
      if (/[a-zA-Z]/.test(charAfter)) {
        return false;
      }
    }
    
    if (priceStartIndex > 0) {
      const charBefore = text.charAt(priceStartIndex - 1);
      if (/[a-zA-Z]/.test(charBefore)) {
        return false;
      }
    }
    
    const ctxPriceRe = (typeof CURRENCY_REGEX_SOURCE !== 'undefined' && CURRENCY_REGEX_SOURCE)
      ? new RegExp('(?:' + CURRENCY_REGEX_SOURCE + ')|price|cost|cena', 'i')
      : /price|cost|€|\$|£|zł|cena/i;
    if (/\b[a-zA-Z]{1,4}\d+[a-zA-Z]*\b/.test(contextWindow) && !ctxPriceRe.test(contextWindow)) {
      return false;
    }
    
    return true;
  }

  parsePrice(priceText) {
    const stripCurrencyRe = (typeof CURRENCY_REGEX_SOURCE !== 'undefined' && CURRENCY_REGEX_SOURCE)
      ? new RegExp('(?:' + CURRENCY_REGEX_SOURCE + ')', 'gi')
      : /(?:zł|PLN|€|EUR|\$|USD|£|GBP|kr|Kč|lei|лв|₴|Br|Ft|kn)/gi;
    let normalized = priceText.replace(stripCurrencyRe, '').trim();
    normalized = normalized.replace(/\s/g, '');
    
    if (!normalized || !/\d/.test(normalized)) return 0;
    
    const dotCount = (normalized.match(/\./g) || []).length;
    const commaCount = (normalized.match(/,/g) || []).length;
    const hasNoSeparators = dotCount === 0 && commaCount === 0;
    const hasMultipleDots = dotCount > 1;
    const hasMultipleCommas = commaCount > 1;
    const hasBothSeparators = dotCount > 0 && commaCount > 0;
    
    if (hasNoSeparators) {
      const num = parseFloat(normalized);
      return isNaN(num) ? 0 : num;
    }
    
    if (hasMultipleDots && commaCount === 0) {
      const num = parseFloat(normalized.replace(/\./g, ''));
      return isNaN(num) ? 0 : num;
    }
    
    if (hasMultipleCommas && dotCount === 0) {
      const num = parseFloat(normalized.replace(/,/g, ''));
      return isNaN(num) ? 0 : num;
    }
    
    if (hasBothSeparators) {
      const lastDot = normalized.lastIndexOf('.');
      const lastComma = normalized.lastIndexOf(',');
      
      if (lastDot > lastComma) {
        const num = parseFloat(normalized.replace(/,/g, ''));
        return isNaN(num) ? 0 : num;
      } else {
        const num = parseFloat(normalized.replace(/\./g, '').replace(',', '.'));
        return isNaN(num) ? 0 : num;
      }
    }
    
    if (dotCount === 1) {
      return this.parseSingleSeparator(normalized, '.');
    }
    
    if (commaCount === 1) {
      return this.parseSingleSeparator(normalized, ',');
    }
    
    return 0;
  }

  parseSingleSeparator(normalized, separator) {
    const parts = normalized.split(separator);
    
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return 0;
    }
    
    const integerPart = parts[0];
    const fractionalPart = parts[1];
    
    const isDecimal = fractionalPart.length <= 2;
    const isThousands = fractionalPart.length === 3 && integerPart.length <= 3;
    
    if (isDecimal && !isThousands) {
      const num = parseFloat(normalized.replace(',', '.'));
      return isNaN(num) ? 0 : num;
    }
    
    if (isThousands && !isDecimal) {
      const num = parseFloat(normalized.replace(separator, ''));
      return isNaN(num) ? 0 : num;
    }
    
    if (fractionalPart.length > 3) {
      const num = parseFloat(normalized.replace(separator, ''));
      return isNaN(num) ? 0 : num;
    }
    
    const useCommaFormat = this.getDecimalSeparatorForCountry() === ',';
    const isComma = separator === ',';
    
    if (isComma && useCommaFormat) {
      const num = parseFloat(normalized.replace(',', '.'));
      return isNaN(num) ? 0 : num;
    }
    
    if (isComma && !useCommaFormat) {
      const num = parseFloat(normalized.replace(',', ''));
      return isNaN(num) ? 0 : num;
    }
    
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
  }

  getDecimalSeparatorForCountry() {
    const commaCountries = new Set(['DE', 'RO', 'SK', 'PL', 'ES', 'IT', 'PT', 'FR', 
                                     'NL', 'BE', 'AT', 'CZ', 'SI', 'LV', 'FI', 'DK', 'SE']);
    return commaCountries.has(this.countryCode) ? ',' : '.';
  }

  createPriceElement(textNode, price, startIndex, length) {
    try {
      if (!textNode || !textNode.parentNode || !document.contains(textNode)) {
        ErrorHandler.dom('Text node not found or not in DOM');
        return;
      }

      if (textNode.nodeType !== Node.TEXT_NODE) {
        ErrorHandler.dom('Node is not a text node', { nodeType: textNode.nodeType });
        return;
      }

      const parent = textNode.parentNode;
      if (!parent || !document.contains(parent)) {
        ErrorHandler.dom('Parent node not found or not in DOM');
        return;
      }

      const text = textNode.nodeValue || textNode.textContent || '';
      if (!text || startIndex < 0 || length <= 0 || startIndex + length > text.length) {
        ErrorHandler.domDebug('Text node modified since scan, skipping', {
          textLength: text ? text.length : 0,
          startIndex,
          length
        });
        return;
      }

      const priceText = text.substring(startIndex, startIndex + length);
      if (!priceText || priceText.trim().length === 0) {
        ErrorHandler.dom('Extracted price text is empty');
        return;
      }

      const existingElements = parent.querySelectorAll('[data-vat-price="' + price + '"]');
      for (let elem of existingElements) {
        if (elem.textContent.trim() === priceText.trim()) {
          ErrorHandler.dom('Price already processed');
          return;
        }
      }

      try {
        const range = document.createRange();
        range.setStart(textNode, startIndex);
        range.setEnd(textNode, startIndex + length);

        const span = document.createElement('span');
        span.className = this.enabled ? 'vat-price-element vat-enabled' : 'vat-price-element vat-disabled';
        span.dataset.price = price;
        span.dataset.originalText = priceText;

        range.surroundContents(span);

        this.addHoverEvents(span);
        this.priceElements.push(span);

      } catch (rangeError) {
        ErrorHandler.dom('Range API failed, using fallback', rangeError);

        if (!parent.dataset.vatProcessed) {
          parent.dataset.vatProcessed = 'true';
          parent.dataset.vatPrice = price;
          parent.dataset.vatOriginalText = priceText;
          parent.classList.add('vat-price-container');
          parent.classList.add(this.enabled ? 'vat-enabled' : 'vat-disabled');

          this.addHoverEvents(parent);
          this.priceElements.push(parent);
        }
      }

    } catch (error) {
      ErrorHandler.runtime('Error in createPriceElement', error);
      return;
    }
  }

  addHoverEvents(element) {
    const mouseEnterHandler = (e) => {
      if (this.enabled) {
        this.showTooltip(e.target, e);
      }
    };
    
    const mouseLeaveHandler = (e) => {
      const container = e.target.closest && e.target.closest('.vat-price-container');
      if (!container || !e.relatedTarget || !container.contains(e.relatedTarget)) {
        this.hideTooltip();
      }
    };
    
    const mouseMoveHandler = (e) => {
      if (this.enabled && this.tooltip) {
        this.updateTooltipPosition(e);
      }
    };
    
    element._vatMouseEnter = mouseEnterHandler;
    element._vatMouseLeave = mouseLeaveHandler;
    element._vatMouseMove = mouseMoveHandler;
    
    const useCapture = true;
    element.addEventListener('mouseenter', mouseEnterHandler, useCapture);
    element.addEventListener('mouseleave', mouseLeaveHandler, useCapture);
    element.addEventListener('mousemove', mouseMoveHandler, useCapture);
  }

  showTooltip(element, event) {
    const container = element.closest && element.closest('.vat-price-container') ? element.closest('.vat-price-container') : element;
    if (!container || !container.dataset || container.dataset.price === undefined) return;
    this.hideTooltip();
    const price = parseFloat(container.dataset.price);
    if (isNaN(price)) return;
    const priceWithoutVAT = this.calculatePriceWithoutVAT(price);
    const vatAmount = Math.round((price - priceWithoutVAT) * 100) / 100;
    const currency = this.getCurrencySymbol(container.dataset.originalText);
    
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'vat-tooltip';
    
    const content = document.createElement('div');
    content.className = 'vat-tooltip-content';
    
    const title = document.createElement('div');
    title.className = 'vat-tooltip-title';
    title.textContent = 'Excl. VAT';
    content.appendChild(title);
    
    const priceDiv = document.createElement('div');
    priceDiv.className = 'vat-tooltip-price';
    priceDiv.textContent = `${priceWithoutVAT.toFixed(2)} ${currency}`;
    content.appendChild(priceDiv);
    
    if (this.showVATBreakdown) {
      const vatDiv = document.createElement('div');
      vatDiv.className = 'vat-tooltip-vat';
      vatDiv.textContent = `VAT ${this.vatRate}%: ${vatAmount.toFixed(2)} ${currency}`;
      content.appendChild(vatDiv);
    }
    
    this.tooltip.appendChild(content);
    document.body.appendChild(this.tooltip);
    this.updateTooltipPosition(event);
  }

  hideTooltip() {
    const toRemove = this.tooltip;
    this.tooltip = null;
    if (toRemove) {
      toRemove.classList.add('vat-hiding');
      setTimeout(() => {
        if (toRemove.parentNode) {
          toRemove.remove();
        }
      }, 150);
    }
  }

  updateTooltipPosition(event) {
    if (!this.tooltip) return;
    
    const rect = this.tooltip.getBoundingClientRect();
    const OFFSET_X = 15;
    const OFFSET_Y = 15;
    const EDGE_PADDING = 10;
    
    let x = event.clientX + OFFSET_X;
    let y = event.clientY + OFFSET_Y;
    
    if (x + rect.width + EDGE_PADDING > window.innerWidth) {
      x = event.clientX - rect.width - OFFSET_X;
    }
    
    if (y + rect.height + EDGE_PADDING > window.innerHeight) {
      y = event.clientY - rect.height - OFFSET_Y;
    }
    
    x = Math.max(EDGE_PADDING, Math.min(x, window.innerWidth - rect.width - EDGE_PADDING));
    y = Math.max(EDGE_PADDING, Math.min(y, window.innerHeight - rect.height - EDGE_PADDING));
    
    this.tooltip.style.left = x + 'px';
    this.tooltip.style.top = y + 'px';
  }

  calculatePriceWithoutVAT(priceWithVAT) {
    const net = priceWithVAT / (1 + this.vatRate / 100);
    return Math.round(net * 100) / 100;
  }

  getCurrencySymbol(originalText) {
    if (this.isCustomRate) {
      return this.customCurrency || CONSTANTS.DEFAULT_CURRENCY;
    }
    
    if (!originalText) {
      return this.getCurrencyByCountryCode(this.countryCode);
    }
    
    if (originalText.includes('zł') || originalText.includes('PLN')) return 'zł';
    if (originalText.includes('€') || originalText.includes('EUR')) return '€';
    if (originalText.includes('$') || originalText.includes('USD')) return '$';
    if (originalText.includes('£') || originalText.includes('GBP')) return '£';
    if (originalText.includes('kr') || originalText.includes('SEK') || originalText.includes('DKK') || originalText.includes('NOK')) return 'kr';
    if (originalText.includes('Kč') || originalText.includes('CZK')) return 'Kč';
    if (originalText.includes('₴') || originalText.includes('UAH')) return '₴';
    if (originalText.includes('Br') || originalText.includes('BYN')) return 'Br';
    if (originalText.includes('Ft') || originalText.includes('HUF')) return 'Ft';
    if (originalText.includes('lei') || originalText.includes('RON')) return 'lei';
    if (originalText.includes('лв') || originalText.includes('BGN')) return 'лв';
    if (originalText.includes('kn') || originalText.includes('HRK')) return '€';
    if (originalText.includes('¥') || originalText.includes('CNY') || originalText.includes('JPY')) return '¥';
    if (originalText.includes('₹') || originalText.includes('INR')) return '₹';
    if (originalText.includes('R$') || originalText.includes('BRL')) return 'R$';
    if (originalText.includes('₽') || originalText.includes('RUB')) return '₽';
    if (originalText.includes('₺') || originalText.includes('TRY')) return '₺';
    if (originalText.includes('₩') || originalText.includes('KRW')) return '₩';
    if (originalText.includes('฿') || originalText.includes('THB')) return '฿';
    if (originalText.includes('₫') || originalText.includes('VND')) return '₫';
    if (originalText.includes('₱') || originalText.includes('PHP')) return '₱';
    if (originalText.includes('Rp') || originalText.includes('IDR')) return 'Rp';
    if (originalText.includes('₪') || originalText.includes('ILS')) return '₪';
    if (originalText.includes('CHF')) return 'CHF';
    if (originalText.includes('₵') || originalText.includes('GHS')) return '₵';
    if (originalText.includes('₦') || originalText.includes('NGN')) return '₦';
    if (originalText.includes('R') && (originalText.includes('ZAR') || /(?:\s|^)R(?:\s|$)/.test(originalText))) return 'R';
    return this.getCurrencyByCountryCode(this.countryCode);
  }

  getCurrencyByCountryCode(countryCode) {
    if (!countryCode) return CONSTANTS.DEFAULT_CURRENCY;
    const regions = VAT_CONFIG?.regions ?? [];
    
    for (const region of regions) {
      const country = region.countries.find(c => c.code === countryCode);
      if (country) {
        return country.currency;
      }
    }
    return CONSTANTS.DEFAULT_CURRENCY;
  }

  detectCountryCode() {
    const locale = navigator.language || navigator.userLanguage || 'en-US';
    const [lang, country] = locale.split('-');
    const languageCode = lang?.toLowerCase() ?? 'en';
    const countryCode = country?.toUpperCase();
    
    const regions = VAT_CONFIG?.regions ?? [];
    if (regions.length === 0) return 'GB';
    
    const validCountryCodes = [];
    regions.forEach(region => {
      region.countries.forEach(country => {
        validCountryCodes.push(country.code);
      });
    });
    
    if (countryCode && validCountryCodes.includes(countryCode)) {
      return countryCode;
    }
    
    return VAT_CONFIG?.languageToCountry?.[languageCode] ?? 'GB';
  }

  updatePriceElements() {
    this.priceElements.forEach(element => {
      if (element && document.contains(element)) {
        if (this.enabled) {
          element.classList.add('vat-enabled');
          element.classList.remove('vat-disabled');
        } else {
          element.classList.add('vat-disabled');
          element.classList.remove('vat-enabled');
        }
      }
    });
  }

  toggleExtension() {
    this.updatePriceElements();
    
    if (!this.enabled) {
      this.hideTooltip();
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
      }
    } else {
      if (this.watchChanges && !this.mutationObserver) {
        this.observeChanges();
      }
    }
  }

  observeChanges() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    
    if (!this.watchChanges) return;
    
    this.mutationObserver = new MutationObserver((mutations) => {
      let shouldRescan = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              shouldRescan = true;
            } else if (node.nodeType === Node.ELEMENT_NODE &&
                       node.textContent && 
                       node.textContent.trim().length > 0 && 
                       !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.nodeName)) {
              shouldRescan = true;
            }
          });
        }
      });
      
      if (shouldRescan) {
        clearTimeout(this.rescanTimeout);
        this.rescanTimeout = setTimeout(() => {
          try {
            this.scanForPrices();
          } catch (error) {
            ErrorHandler.runtime('Error during rescan', error);
          }
        }, this.RESCAN_DEBOUNCE_MS);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(this._visibilityRescanTimeout);
        this._visibilityRescanTimeout = setTimeout(() => {
          try { this.scanForPrices(); this.updatePriceElements(); } catch (e) { ErrorHandler.runtime('Visibility rescan failed', e); }
        }, 400);
      }
    });

    try {
      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    } catch (error) {
      ErrorHandler.runtime('Failed to set up mutation observer', error);
    }
  }

  cleanup() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    
    if (this.rescanTimeout) {
      clearTimeout(this.rescanTimeout);
      this.rescanTimeout = null;
    }
    if (this.initialRescanTimeout) {
      clearTimeout(this.initialRescanTimeout);
      this.initialRescanTimeout = null;
    }
    if (this._visibilityRescanTimeout) {
      clearTimeout(this._visibilityRescanTimeout);
      this._visibilityRescanTimeout = null;
    }
    if (this._lateRescanTimeout) {
      clearTimeout(this._lateRescanTimeout);
      this._lateRescanTimeout = null;
    }
    this.hideTooltip();
    
    this.priceElements.forEach(element => {
      this.removeHoverEvents(element);
    });
    
    this.priceElements = [];
  }
};
}

if (window.__vatOffDocument !== document) {
  window.__vatOffDocument = document;
  if (!isExtensionPage()) {
    function initVATCalculator() {
      if (!document.body) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initVATCalculator, { once: true });
        } else {
          setTimeout(initVATCalculator, 10);
        }
        return;
      }
      new window.VATCalculator();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initVATCalculator, { once: true });
    } else {
      initVATCalculator();
    }
  }
}
