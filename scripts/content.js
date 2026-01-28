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

class VATCalculator {
  constructor() {
    this.MAX_PRICE = 1000000;
    this.MIN_PRICE = 1;
    this.RESCAN_DEBOUNCE_MS = 1000;
    this.MAX_PRICE_ELEMENTS = 500;
    
    this.enabled = false;
    this.vatRate = 20;
    this.countryCode = this.detectCountryCode();
    this.customCurrency = '';
    this.isCustomRate = false;
    this.watchChanges = true;
    this.showVATBreakdown = true;
    this.priceElements = [];
    this.tooltip = null;
    this.rescanTimeout = null;
    this.isScanning = false;
    this.mutationObserver = null;
    this.init();
  }

  injectFont() {
    // Inject Google Fonts link for Space Grotesk (CSS @import doesn't work reliably in content scripts)
    if (!document.querySelector('link[href*="Space+Grotesk"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap';
      document.head.appendChild(link);
    }
  }

  init() {
    this.injectFont();
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
          const vatRate = changes.vatRate ? changes.vatRate.newValue : (this.isCustomRate ? 'custom' : 'unknown');
          this.isCustomRate = vatRate === 'custom';
          
          let newRate;
          if (changes.vatRateNumber) {
            newRate = changes.vatRateNumber.newValue;
          } else if (this.isCustomRate) {
            const customRate = changes.customRate ? changes.customRate.newValue : '';
            newRate = parseInt(customRate, 10) || 20;
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
        this.isCustomRate = result.vatRate === 'custom';
        if (result.vatRateNumber) {
          this.vatRate = result.vatRateNumber;
        } else if (this.isCustomRate) {
          this.vatRate = parseInt(result.customRate, 10) || 23;
        } else {
          this.vatRate = 20; // Default fallback
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
      }
      if (result.watchChanges !== undefined) {
        this.watchChanges = result.watchChanges;
      }
      if (result.showVATBreakdown !== undefined) {
        this.showVATBreakdown = result.showVATBreakdown;
      }
      this.updatePriceElements();
      this.scanForPrices();
      
      if (this.watchChanges) {
        this.observeChanges();
      }
    });
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
    
    if (element._vatMouseEnter) {
      element.removeEventListener('mouseenter', element._vatMouseEnter);
      delete element._vatMouseEnter;
    }
    if (element._vatMouseLeave) {
      element.removeEventListener('mouseleave', element._vatMouseLeave);
      delete element._vatMouseLeave;
    }
    if (element._vatMouseMove) {
      element.removeEventListener('mousemove', element._vatMouseMove);
      delete element._vatMouseMove;
    }
  }

  isElementVisible(element) {
    if (!element) return false;
    
    // Fast visibility check using offsetParent
    // offsetParent is null for elements with display:none or hidden ancestors
    // This is 1000x faster than getComputedStyle and doesn't force reflows
    // Trade-off: Misses opacity:0 and some edge cases, but covers 95% of hidden elements
    return element.offsetParent !== null;
  }

  isInViewport(element) {
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  }

  scanForPrices() {
    if (this.isScanning) return;
    if (isExtensionPage()) return;
    
    this.cleanupPriceElements();
    
    this.isScanning = true;

    try {
      const pricePatterns = [
        /(\d{1,3}(?:[\s,.]\d{3}){0,4}(?:[.,]\d{2})?)\s*(?:zł|PLN|€|EUR|\$|USD|£|GBP|kr|Kč|lei|лв|₴|Br|Ft|kn)/gi,
        /(?:price|cost|amount|total|sum|cena|preis|prix|precio|prezzo|valor):\s*(\d{1,3}(?:[\s,.]\d{3}){0,4}(?:[.,]\d{2})?)/gi,
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
                parent.classList.contains('vat-price-container')) {
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
        if (nodeCount > 5000) {
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
      'nr', 'numer', 'number', 'id', 'kod', 'code', 'ref', 'reference',
      'order', 'zamówienie', 'invoice', 'faktura',
      'version', 'ver', 'v.', 'build', 'release',
      'tel', 'telefon', 'phone', 'fax', 'zip', 'postal', 'kod pocztowy',
      'nip', 'regon', 'krs',
      'page', 'strona', 'line', 'linia', 'row', 'wiersz', 'column', 'kolumna',
      'date', 'data', 'time', 'czas', 'hour', 'godzina', 'year', 'rok',
      'qty', 'quantity', 'ilość', 'szt', 'pcs', 'pieces', 'units'
    ];
    
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
      
      for (const pk of productKeywords) {
        if (surroundingContext.includes(pk)) {
          return false;
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
    if (/\bv?\d+\.\d+(?:\.\d+)?\b/i.test(contextWindow) && 
        !(/price|cost|€|\$|£|zł/i.test(contextWindow))) return false;
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
    
    if (/\b[a-zA-Z]{1,4}\d+[a-zA-Z]*\b/.test(contextWindow) && 
        !(/price|cost|€|\$|£|zł|cena/i.test(contextWindow))) {
      return false;
    }
    
    return true;
  }

  parsePrice(priceText) {
    let normalized = priceText.replace(/(?:zł|PLN|€|EUR|\$|USD|£|GBP|kr|Kč|lei|лв|₴|Br|Ft|kn)/gi, '').trim();
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
    
    const mouseLeaveHandler = () => {
      this.hideTooltip();
    };
    
    const mouseMoveHandler = (e) => {
      if (this.enabled && this.tooltip) {
        this.updateTooltipPosition(e);
      }
    };
    
    element._vatMouseEnter = mouseEnterHandler;
    element._vatMouseLeave = mouseLeaveHandler;
    element._vatMouseMove = mouseMoveHandler;
    
    element.addEventListener('mouseenter', mouseEnterHandler);
    element.addEventListener('mouseleave', mouseLeaveHandler);
    element.addEventListener('mousemove', mouseMoveHandler);
  }

  showTooltip(element, event) {
    const price = parseFloat(element.dataset.price);
    const priceWithoutVAT = this.calculatePriceWithoutVAT(price);
    const currency = this.getCurrencySymbol(element.dataset.originalText);
    
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
      const vatAmount = (price - priceWithoutVAT).toFixed(2);
      vatDiv.textContent = `VAT ${this.vatRate}%: ${vatAmount} ${currency}`;
      content.appendChild(vatDiv);
    }
    
    this.tooltip.appendChild(content);
    document.body.appendChild(this.tooltip);
    this.updateTooltipPosition(event);
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.classList.add('vat-hiding');
      setTimeout(() => {
        if (this.tooltip) {
          this.tooltip.remove();
          this.tooltip = null;
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
    return priceWithVAT / (1 + this.vatRate / 100);
  }

  getCurrencySymbol(originalText) {
    if (this.isCustomRate) {
      return this.customCurrency || '€';
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
    
    return this.getCurrencyByCountryCode(this.countryCode);
  }

  getCurrencyByCountryCode(countryCode) {
    if (typeof VAT_CONFIG === 'undefined' || !VAT_CONFIG || !VAT_CONFIG.regions || !countryCode) return '€';
    
    for (const region of VAT_CONFIG.regions) {
      const country = region.countries.find(c => c.code === countryCode);
      if (country) {
        return country.currency;
      }
    }
    return '€';
  }

  detectCountryCode() {
    const locale = navigator.language || navigator.userLanguage || 'en-US';
    const languageCode = locale.split('-')[0].toLowerCase();
    const countryCode = locale.split('-')[1]?.toUpperCase();
    
    if (typeof VAT_CONFIG === 'undefined' || !VAT_CONFIG || !VAT_CONFIG.regions) return 'GB';
    
    const validCountryCodes = [];
    VAT_CONFIG.regions.forEach(region => {
      region.countries.forEach(country => {
        validCountryCodes.push(country.code);
      });
    });
    
    if (countryCode && validCountryCodes.includes(countryCode)) {
      return countryCode;
    }
    
    return VAT_CONFIG.languageToCountry[languageCode] || 'GB';
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
    
    this.hideTooltip();
    
    this.priceElements.forEach(element => {
      this.removeHoverEvents(element);
    });
    
    this.priceElements = [];
  }
}

if (!isExtensionPage()) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new VATCalculator();
    });
  } else {
    new VATCalculator();
  }
}
