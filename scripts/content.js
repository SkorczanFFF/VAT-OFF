// Utility function to detect user's locale and map to country code
function detectDefaultCountryCode() {
  const locale = navigator.language || navigator.userLanguage || 'en-US';
  const languageCode = locale.split('-')[0].toLowerCase();
  const countryCode = locale.split('-')[1]?.toUpperCase();
  
  // Direct country code mapping
  const validCountryCodes = ['DE', 'RO', 'GB', 'SK', 'UA', 'BY', 'HU', 'BG', 'HR', 'LT', 'EE', 'FR', 'NL', 'ES', 'CZ', 'SI', 'LV', 'AT', 'BE', 'IT', 'PL', 'PT', 'FI', 'IE', 'SE', 'DK'];
  
  if (countryCode && validCountryCodes.includes(countryCode)) {
    return countryCode;
  }
  
  // Language to country fallback mapping
  const languageToCountry = {
    'de': 'DE', 'ro': 'RO', 'en': 'GB', 'sk': 'SK', 'uk': 'UA',
    'be': 'BY', 'hu': 'HU', 'bg': 'BG', 'hr': 'HR', 'lt': 'LT',
    'et': 'EE', 'fr': 'FR', 'nl': 'NL', 'es': 'ES', 'cs': 'CZ',
    'sl': 'SI', 'lv': 'LV', 'it': 'IT', 'pl': 'PL', 'pt': 'PT',
    'fi': 'FI', 'ga': 'IE', 'sv': 'SE', 'da': 'DK'
  };
  
  return languageToCountry[languageCode] || 'GB'; // Default to GB (neutral, widely recognized)
}

// VAT Calculator Content Script
class VATCalculator {
  constructor() {
    // Constants
    this.MAX_PRICE = 1000000;
    this.MIN_PRICE = 1;
    this.RESCAN_DEBOUNCE_MS = 1000;
    this.MAX_PRICE_ELEMENTS = 500;
    
    this.enabled = false;
    this.vatRate = 20; // Default UK VAT rate (neutral default)
    this.countryCode = detectDefaultCountryCode(); // Auto-detect from browser locale
    this.autoDetect = true;
    this.watchChanges = true;
    this.showVATBreakdown = true;
    this.priceElements = [];
    this.tooltip = null;
    this.rescanTimeout = null;
    this.isScanning = false;
    this.init();
  }

  init() {
    // Load settings from storage
    this.loadSettings();
    
    // Listen for storage changes (replaces message broadcasting)
    // This automatically receives updates when popup or options change settings
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;
      
      try {
        // Handle enabled state change
        if (changes.enabled) {
          this.enabled = changes.enabled.newValue;
          this.toggleExtension();
        }
        
        // Handle VAT rate change
        if (changes.vatRate || changes.customRate) {
          const vatRate = changes.vatRate ? changes.vatRate.newValue : this.vatRate;
          const customRate = changes.customRate ? changes.customRate.newValue : '';
          this.vatRate = vatRate === 'custom' ? parseFloat(customRate) || 20 : parseFloat(vatRate);
        }
        
        // Handle country code change
        if (changes.countryCode) {
          this.countryCode = changes.countryCode.newValue;
        }
        
        // Handle behavior settings changes
        if (changes.autoDetect !== undefined) {
          this.autoDetect = changes.autoDetect.newValue;
        }
        if (changes.watchChanges !== undefined) {
          this.watchChanges = changes.watchChanges.newValue;
        }
        if (changes.showVATBreakdown !== undefined) {
          this.showVATBreakdown = changes.showVATBreakdown.newValue;
        }
        
        // Update price elements with new settings
        this.updatePriceElements();
      } catch (error) {
        console.error('VATopia: Error handling storage change:', error);
      }
    });

    // Start scanning for prices only if autoDetect is enabled
    if (this.autoDetect) {
      this.scanForPrices();
    }
    
    // Watch for dynamic content changes only if watchChanges is enabled
    if (this.watchChanges) {
      this.observeChanges();
    }
  }

  loadSettings() {
    chrome.storage.sync.get(['vatRate', 'customRate', 'enabled', 'countryCode', 'autoDetect', 'watchChanges', 'showVATBreakdown'], (result) => {
      if (chrome.runtime.lastError) {
        console.debug('VATopia: Storage error loading settings:', chrome.runtime.lastError);
        return;
      }
      
      if (result.vatRate) {
        this.vatRate = result.vatRate === 'custom' ? parseFloat(result.customRate) || 23 : parseFloat(result.vatRate);
      }
      if (result.countryCode) {
        this.countryCode = result.countryCode;
      }
      if (result.enabled !== undefined) {
        this.enabled = result.enabled;
      }
      if (result.autoDetect !== undefined) {
        this.autoDetect = result.autoDetect;
      }
      if (result.watchChanges !== undefined) {
        this.watchChanges = result.watchChanges;
      }
      if (result.showVATBreakdown !== undefined) {
        this.showVATBreakdown = result.showVATBreakdown;
      }
      this.updatePriceElements();
    });
  }

  scanForPrices() {
    // Prevent concurrent scanning
    if (this.isScanning) {
      return;
    }
    
    // Skip scanning on problematic pages
    if (window.location.protocol === 'chrome:' || 
        window.location.protocol === 'chrome-extension:' ||
        window.location.protocol === 'moz-extension:' ||
        window.location.protocol === 'extension:' ||
        window.location.href.includes('chrome://') ||
        window.location.href.includes('chrome-extension://') ||
        window.location.href.includes('moz-extension://') ||
        window.location.href.includes('extension://')) {
      return;
    }
    
    this.isScanning = true;

    try {
      // Fix 5.1 - Consolidated regex patterns (reduced from 7 to 3 non-overlapping patterns)
      const pricePatterns = [
        // Pattern 1: Currency-based prices (with or without space) - most reliable
        /(\d{1,3}(?:[\s,.]\d{3})*(?:[.,]\d{2})?)\s*(?:zł|PLN|€|EUR|\$|USD|£|GBP|kr|Kč|lei|лв|₴|Br|Ft|kn)/gi,
        // Pattern 2: Keyword-based prices (price:, cost:, etc.)
        /(?:price|cost|amount|total|sum|cena|preis|prix|precio|prezzo|valor):\s*(\d{1,3}(?:[\s,.]\d{3})*(?:[.,]\d{2})?)/gi,
        // Pattern 3: Standalone numbers (4+ digits or with decimal) - least reliable, checked last
        /(\d{1,3}(?:[\s,.]\d{3})+(?:[.,]\d{2})?|\d{4,}(?:[.,]\d{2}))/g
      ];

      // Find all text nodes
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      const processedNodes = new Set(); // Track processed nodes to avoid duplicates
      const nodesToProcess = []; // Collect nodes first, then process them

      let node;
      while (node = walker.nextNode()) {
        // Skip if already processed or if node is not in DOM
        if (processedNodes.has(node) || !document.contains(node)) {
          continue;
        }
        
        // Skip if node is inside a price element we already created
        if (node.parentElement && node.parentElement.classList.contains('vat-price-element')) {
          continue;
        }
        
        const text = node.textContent;
        
        // Skip empty or very short text nodes
        if (!text || text.trim().length < 2) {
          continue;
        }
        
        for (const pattern of pricePatterns) {
          let match;
          const regex = new RegExp(pattern.source, pattern.flags); // Create new regex instance
          while ((match = regex.exec(text)) !== null) {
            const priceText = match[1];
            const price = this.parsePrice(priceText);
            
            if (price > 0 && price < this.MAX_PRICE && this.isValidPrice(text, priceText, price)) { // Reasonable price range and valid context
              nodesToProcess.push({
                node: node,
                price: price,
                startIndex: match.index,
                length: match[0].length
              });
              processedNodes.add(node);
              break; // Only process first match per node
            }
          }
        }
      }

      // Process collected nodes with additional safety checks
      // Limit number of price elements to prevent memory issues
      const maxElementsToProcess = Math.min(nodesToProcess.length, this.MAX_PRICE_ELEMENTS - this.priceElements.length);
      
      for (let i = 0; i < maxElementsToProcess; i++) {
        const item = nodesToProcess[i];
        // Additional safety check before processing
        if (item.node && 
            item.node.parentNode && 
            document.contains(item.node) && 
            document.contains(item.node.parentNode) &&
            item.node.parentNode === item.node.parentNode) { // Ensure parent hasn't changed
          
          // Use requestAnimationFrame to avoid speculative parsing conflicts
          requestAnimationFrame(() => {
            this.createPriceElement(item.node, item.price, item.startIndex, item.length);
          });
        }
      }
    } finally {
      this.isScanning = false;
    }
  }

  isValidPrice(text, priceText, price) {
    // Skip if price is too small (likely not a real price)
    if (price < this.MIN_PRICE) return false;
    
    // Skip if price text is part of a larger word or sentence that doesn't look like a price
    const context = text.toLowerCase();
    const priceLower = priceText.toLowerCase();
    
    // Fix 5.2 - Expanded false positive filters with multilingual support
    const falsePositives = [
      // Shipping/delivery related
      'kurier', 'gls', 'dpd', 'ups', 'fedex', 'dhl', 'paczkomat', 'inpost',
      'przedpłata', 'dostawa', 'wysyłka', 'opłata', 'koszt', 'shipping', 'delivery',
      // ID/reference numbers
      'nr', 'numer', 'number', 'id', 'kod', 'code', 'ref', 'reference',
      'order', 'zamówienie', 'invoice', 'faktura',
      // Version/technical
      'version', 'ver', 'v.', 'build', 'release',
      // Contact/address
      'tel', 'telefon', 'phone', 'fax', 'zip', 'postal', 'kod pocztowy',
      'nip', 'regon', 'krs',
      // Pagination/layout
      'page', 'strona', 'line', 'linia', 'row', 'wiersz', 'column', 'kolumna',
      // Date/time related
      'date', 'data', 'time', 'czas', 'hour', 'godzina', 'year', 'rok',
      // Quantity (not price)
      'qty', 'quantity', 'ilość', 'szt', 'pcs', 'pieces', 'units'
    ];
    
    // Check if the price appears in context with false positive keywords (within 100 chars)
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
    }
    
    // Fix 5.3 - Improved date/time/version detection with more precise patterns
    // Check the immediate context around the price text for better accuracy
    const priceStartIndex = text.indexOf(priceText);
    const contextWindow = text.substring(
      Math.max(0, priceStartIndex - 20), 
      Math.min(text.length, priceStartIndex + priceText.length + 20)
    );
    
    // Date patterns (DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD)
    if (/\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}/.test(contextWindow)) {
      return false;
    }
    
    // Time patterns (HH:MM, HH:MM:SS)
    if (/\d{1,2}:\d{2}(?::\d{2})?/.test(contextWindow)) {
      return false;
    }
    
    // Version patterns (v1.2.3, ver 1.0, version 2.1)
    if (/(?:v|ver|version)\s*\.?\d+[.,]\d+/i.test(contextWindow)) {
      return false;
    }
    
    // Software build numbers
    if (/build\s*\d+/i.test(contextWindow)) {
      return false;
    }
    
    return true;
  }

  parsePrice(priceText) {
    // Fix 5.4 - Improved price parsing logic to handle ambiguous formats
    // Remove currency symbols
    let normalized = priceText.replace(/(?:zł|PLN|€|EUR|\$|USD|£|GBP|kr|Kč|lei|лв|₴|Br|Ft|kn)/gi, '').trim();
    
    // Count separators to determine format
    const dotCount = (normalized.match(/\./g) || []).length;
    const commaCount = (normalized.match(/,/g) || []).length;
    const spaceCount = (normalized.match(/\s/g) || []).length;
    
    // Remove spaces (always thousands separator)
    normalized = normalized.replace(/\s/g, '');
    
    // Determine format based on separator patterns
    if (dotCount === 0 && commaCount === 0) {
      // No separators: "1234" -> 1234
      return parseFloat(normalized);
    }
    
    if (dotCount > 1 || commaCount > 1) {
      // Multiple dots or commas: thousands separators
      // "1.234.567" or "1,234,567" -> 1234567
      return parseFloat(normalized.replace(/[.,]/g, ''));
    }
    
    if (dotCount === 1 && commaCount === 1) {
      // Both separators present
      const dotPos = normalized.lastIndexOf('.');
      const commaPos = normalized.lastIndexOf(',');
      
      if (dotPos > commaPos) {
        // "1,234.56" (US format) -> 1234.56
        return parseFloat(normalized.replace(/,/g, ''));
      } else {
        // "1.234,56" (EU format) -> 1234.56
        return parseFloat(normalized.replace(/\./g, '').replace(',', '.'));
      }
    }
    
    if (dotCount === 1) {
      // Only dot
      const parts = normalized.split('.');
      if (parts[1].length === 2) {
        // "12.34" or "1234.56" -> decimal separator
        return parseFloat(normalized);
      } else if (parts[1].length === 3 && parts[0].length <= 3) {
        // "1.234" or "123.456" -> thousands separator
        return parseFloat(normalized.replace(/\./g, ''));
      } else {
        // Ambiguous, use decimal as default (more common in prices)
        return parseFloat(normalized);
      }
    }
    
    if (commaCount === 1) {
      // Only comma
      const parts = normalized.split(',');
      if (parts[1].length === 2) {
        // "12,34" or "1234,56" -> decimal separator (EU format)
        return parseFloat(normalized.replace(',', '.'));
      } else if (parts[1].length === 3 && parts[0].length <= 3) {
        // "1,234" -> thousands separator
        return parseFloat(normalized.replace(/,/g, ''));
      } else {
        // Ambiguous, treat as decimal (EU format is common)
        return parseFloat(normalized.replace(',', '.'));
      }
    }
    
    // Fallback
    return parseFloat(normalized.replace(',', '.'));
  }

  createPriceElement(textNode, price, startIndex, length) {
    // Use a more precise approach - mark only the specific text range
    try {
      // Validate text node exists and is in DOM
      if (!textNode || !textNode.parentNode || !document.contains(textNode)) {
        console.debug('VATopia: Text node not found or not in DOM');
        return;
      }

      const parent = textNode.parentNode;
      
      // Validate parent exists and is in DOM
      if (!parent || !document.contains(parent)) {
        console.debug('VATopia: Parent node not found or not in DOM');
        return;
      }
      
      const text = textNode.textContent;
      
      // Validate text content
      if (!text || text.length < startIndex + length) {
        console.debug('VATopia: Invalid text content or indices');
        return;
      }
      
      const priceText = text.substring(startIndex, startIndex + length);
      
      // Check if this specific price text is already processed
      const existingElements = parent.querySelectorAll('[data-vat-price="' + price + '"]');
      for (let elem of existingElements) {
        if (elem.textContent.trim() === priceText.trim()) {
          console.debug('VATopia: Price already processed');
          return;
        }
      }
      
      // Use a safer DOM manipulation approach with Range API
      try {
        const range = document.createRange();
        range.setStart(textNode, startIndex);
        range.setEnd(textNode, startIndex + length);
        
        const span = document.createElement('span');
        span.className = 'vat-price-element';
        span.dataset.price = price;
        span.dataset.originalText = priceText;
        
        range.surroundContents(span);
        
        // Add hover events
        this.addHoverEvents(span);
        this.priceElements.push(span);
        
      } catch (rangeError) {
        console.debug('VATopia: Range API failed, using fallback:', rangeError);
        
        // Fallback: mark parent but be more selective
        if (!parent.dataset.vatProcessed) {
          parent.dataset.vatProcessed = 'true';
          parent.dataset.vatPrice = price;
          parent.dataset.vatOriginalText = priceText;
          parent.classList.add('vat-price-container');
          
          // Add hover events to the parent
          this.addHoverEvents(parent);
          this.priceElements.push(parent);
        }
      }
      
    } catch (error) {
      console.debug('VATopia: Error in createPriceElement:', error);
      return;
    }
  }

  addHoverEvents(element) {
    element.addEventListener('mouseenter', (e) => {
      if (this.enabled) {
        this.showTooltip(e.target, e);
      }
    });
    
    element.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });
    
    element.addEventListener('mousemove', (e) => {
      if (this.enabled && this.tooltip) {
        this.updateTooltipPosition(e);
      }
    });
  }

  showTooltip(element, event) {
    const price = parseFloat(element.dataset.price);
    const priceWithoutVAT = this.calculatePriceWithoutVAT(price);
    
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'vat-tooltip';
    
    let tooltipContent = `
      <div class="vat-tooltip-content">
      <div class="vat-tooltip-title">Without VAT</div>
      <div class="vat-tooltip-price">${priceWithoutVAT.toFixed(2)} ${this.getCurrencySymbol(element.dataset.originalText)}</div>`;
    
    if (this.showVATBreakdown) {
      tooltipContent += `<div class="vat-tooltip-vat">VAT ${this.vatRate}%: ${(price - priceWithoutVAT).toFixed(2)}</div>`;
    }
    
    tooltipContent += `</div>`;
    this.tooltip.innerHTML = tooltipContent;
    
    document.body.appendChild(this.tooltip);
    this.updateTooltipPosition(event);
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }

  updateTooltipPosition(event) {
    if (!this.tooltip) return;
    
    const rect = this.tooltip.getBoundingClientRect();
    const TOOLTIP_OFFSET_X = 10;
    const TOOLTIP_OFFSET_Y = -10;
    
    // Calculate position with boundary checking
    let x = event.clientX + TOOLTIP_OFFSET_X;
    let y = event.clientY + TOOLTIP_OFFSET_Y;
    
    // Check right boundary
    if (x + rect.width > window.innerWidth) {
      x = event.clientX - rect.width - TOOLTIP_OFFSET_X;
    }
    
    // Check left boundary
    if (x < 0) {
      x = TOOLTIP_OFFSET_X;
    }
    
    // Check bottom boundary
    if (y + rect.height > window.innerHeight) {
      y = event.clientY - rect.height - TOOLTIP_OFFSET_Y;
    }
    
    // Check top boundary
    if (y < 0) {
      y = TOOLTIP_OFFSET_Y;
    }
    
    this.tooltip.style.left = x + 'px';
    this.tooltip.style.top = y + 'px';
  }

  calculatePriceWithoutVAT(priceWithVAT) {
    return priceWithVAT / (1 + this.vatRate / 100);
  }

  getCurrencySymbol(originalText) {
    // Check for currency symbols in the original text first
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
    if (originalText.includes('kn') || originalText.includes('HRK')) return 'kn';
    
    // If no currency found in text, use country code to determine currency
    // NOTE: This mapping is duplicated from config.js to avoid content script overhead
    // Keep in sync with scripts/config.js
    const countryCurrencyMap = {
      'DE': '€', 'RO': 'lei', 'FR': '€', 'ES': '€', 'IT': '€', 'NL': '€', 'AT': '€', 'BE': '€',
      'SK': '€', 'SI': '€', 'LV': '€', 'LT': '€', 'EE': '€', 'FI': '€', 'IE': '€', 'PT': '€',
      'GB': '£', 'UK': '£',
      'PL': 'zł',
      'SE': 'kr', 'DK': 'kr', 'NO': 'kr',
      'CZ': 'Kč',
      'UA': '₴',
      'BY': 'Br',
      'HU': 'Ft',
      'BG': 'лв',
      'HR': 'kn'
    };
    
    return countryCurrencyMap[this.countryCode] || '€'; // Default to Euro (widely used)
  }

  updatePriceElements() {
    this.priceElements.forEach(element => {
      if (element && document.contains(element)) {
        if (this.enabled) {
          element.style.cursor = 'help';
          element.style.borderBottom = '1px dotted #801834';
          element.style.textDecoration = 'none';
          // Enable hover effects
          element.style.pointerEvents = 'auto';
        } else {
          element.style.cursor = 'default';
          element.style.borderBottom = 'none';
          element.style.textDecoration = 'none';
          // Remove any hover effects and disable pointer events
          element.style.backgroundColor = '';
          element.style.pointerEvents = 'none';
        }
      }
    });
  }

  toggleExtension() {
    this.updatePriceElements();
    if (!this.enabled) {
      this.hideTooltip();
    }
  }

  observeChanges() {
    // Only watch for changes if the setting is enabled
    if (!this.watchChanges) {
      return;
    }
    
    // Watch for new content being added to the page
    const observer = new MutationObserver((mutations) => {
      let shouldRescan = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              shouldRescan = true;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if the element contains text nodes and is not a script/style element
              if (node.textContent && 
                  node.textContent.trim().length > 0 && 
                  !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.nodeName)) {
                shouldRescan = true;
              }
            }
          });
        }
      });
      
      if (shouldRescan && this.autoDetect) {
        // Debounce the rescan to avoid excessive processing
        clearTimeout(this.rescanTimeout);
        this.rescanTimeout = setTimeout(() => {
          try {
            this.scanForPrices();
          } catch (error) {
            console.debug('VATopia: Error during rescan:', error);
          }
        }, this.RESCAN_DEBOUNCE_MS); // Increased delay to reduce frequency
      }
    });

    try {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    } catch (error) {
      console.debug('VATopia: Error setting up mutation observer:', error);
    }
  }
}

// Initialize the VAT Calculator when the page loads
// Skip initialization on extension pages (popup, options, etc.)
if (window.location.protocol === 'chrome-extension:' || 
    window.location.href.includes('chrome-extension://') ||
    window.location.href.includes('moz-extension://') ||
    window.location.href.includes('extension://')) {
  // Don't run on extension pages
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new VATCalculator();
  });
} else {
  new VATCalculator();
}
