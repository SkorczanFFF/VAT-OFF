// VAT Calculator Content Script
class VATCalculator {
  constructor() {
    this.enabled = true;
    this.vatRate = 23; // Default Poland VAT rate
    this.priceElements = [];
    this.tooltip = null;
    this.rescanTimeout = null;
    this.isScanning = false;
    this.init();
  }

  init() {
    // Load settings from storage
    this.loadSettings();
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'toggle') {
        this.enabled = request.enabled;
        this.toggleExtension();
      } else if (request.action === 'settingsChanged') {
        this.updateSettings(request.vatRate, request.customRate);
      }
    });

    // Start scanning for prices
    this.scanForPrices();
    
    // Watch for dynamic content changes
    this.observeChanges();
  }

  loadSettings() {
    chrome.storage.sync.get(['vatRate', 'customRate', 'enabled'], (result) => {
      if (result.vatRate) {
        this.vatRate = result.vatRate === 'custom' ? parseFloat(result.customRate) || 23 : parseFloat(result.vatRate);
      }
      if (result.enabled !== undefined) {
        this.enabled = result.enabled;
      }
      this.updatePriceElements();
    });
  }

  updateSettings(vatRate, customRate) {
    this.vatRate = vatRate === 'custom' ? parseFloat(customRate) || 23 : parseFloat(vatRate);
    this.updatePriceElements();
  }

  scanForPrices() {
    // Prevent concurrent scanning
    if (this.isScanning) {
      return;
    }
    this.isScanning = true;

    try {
      // Regular expressions to match various price formats
      const pricePatterns = [
        /(\d{1,3}(?:[\s,.]\d{3})*(?:[.,]\d{2})?)\s*(?:zł|PLN|€|EUR|\$|USD|£|GBP)/gi, // With currency
        /(?:^|\s)(\d{1,3}(?:[\s,.]\d{3})*(?:[.,]\d{2})?)(?:\s|$)/g, // Just numbers with spaces
        /(?:price|cost|amount|total|sum):\s*(\d{1,3}(?:[\s,.]\d{3})*(?:[.,]\d{2})?)/gi // With price keywords
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
            
            if (price > 0 && price < 1000000) { // Reasonable price range
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
      nodesToProcess.forEach(item => {
        // Additional safety check before processing
        if (item.node && 
            item.node.parentNode && 
            document.contains(item.node) && 
            document.contains(item.node.parentNode)) {
          this.createPriceElement(item.node, item.price, item.startIndex, item.length);
        }
      });
    } finally {
      this.isScanning = false;
    }
  }

  parsePrice(priceText) {
    // Normalize price format - remove spaces and replace comma with dot for decimal
    const normalized = priceText.replace(/\s/g, '').replace(',', '.');
    
    // Handle different number formats
    if (normalized.includes('.')) {
      // Check if it's a decimal separator or thousands separator
      const parts = normalized.split('.');
      if (parts.length === 2 && parts[1].length <= 2) {
        // Likely decimal separator
        return parseFloat(normalized);
      } else {
        // Likely thousands separator
        return parseFloat(normalized.replace(/\./g, ''));
      }
    }
    
    return parseFloat(normalized);
  }

  createPriceElement(textNode, price, startIndex, length) {
    // Use a more robust approach with multiple validation checks
    try {
      // Validate text node
      if (!textNode || !textNode.parentNode || !document.contains(textNode)) {
        return;
      }

      const parent = textNode.parentNode;
      
      // Validate parent
      if (!parent || !document.contains(parent)) {
        return;
      }
      
      const text = textNode.textContent;
      
      // Validate text content
      if (!text || text.length < startIndex + length) {
        return;
      }
      
      const beforeText = text.substring(0, startIndex);
      const priceText = text.substring(startIndex, startIndex + length);
      const afterText = text.substring(startIndex + length);
      
      // Create new elements
      const beforeNode = document.createTextNode(beforeText);
      const afterNode = document.createTextNode(afterText);
      
      const priceSpan = document.createElement('span');
      priceSpan.textContent = priceText;
      priceSpan.className = 'vat-price-element';
      priceSpan.dataset.price = price;
      priceSpan.dataset.originalText = priceText;
      
      // Final validation before DOM manipulation
      if (!document.contains(textNode) || !document.contains(parent)) {
        return;
      }
      
      // Perform DOM manipulation
      parent.replaceChild(beforeNode, textNode);
      parent.insertBefore(priceSpan, beforeNode.nextSibling);
      parent.insertBefore(afterNode, priceSpan.nextSibling);
      
      // Add hover events
      this.addHoverEvents(priceSpan);
      
      this.priceElements.push(priceSpan);
      
    } catch (error) {
      // Completely silent error handling
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
    this.tooltip.innerHTML = `
      <div class="vat-tooltip-content">
        <div class="vat-tooltip-title">Price without VAT</div>
        <div class="vat-tooltip-price">${priceWithoutVAT.toFixed(2)} ${this.getCurrencySymbol(element.dataset.originalText)}</div>
        <div class="vat-tooltip-vat">VAT ${this.vatRate}%: ${(price - priceWithoutVAT).toFixed(2)}</div>
      </div>
    `;
    
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
    
    const x = event.clientX + 10;
    const y = event.clientY - 10;
    
    this.tooltip.style.left = x + 'px';
    this.tooltip.style.top = y + 'px';
  }

  calculatePriceWithoutVAT(priceWithVAT) {
    return priceWithVAT / (1 + this.vatRate / 100);
  }

  getCurrencySymbol(originalText) {
    if (originalText.includes('zł') || originalText.includes('PLN')) return 'zł';
    if (originalText.includes('€') || originalText.includes('EUR')) return '€';
    if (originalText.includes('$') || originalText.includes('USD')) return '$';
    if (originalText.includes('£') || originalText.includes('GBP')) return '£';
    return 'zł'; // Default to PLN
  }

  updatePriceElements() {
    this.priceElements.forEach(element => {
      if (this.enabled) {
        element.style.cursor = 'help';
        element.style.borderBottom = '1px dotted #007bff';
      } else {
        element.style.cursor = 'default';
        element.style.borderBottom = 'none';
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
      
      if (shouldRescan) {
        // Debounce the rescan to avoid excessive processing
        clearTimeout(this.rescanTimeout);
        this.rescanTimeout = setTimeout(() => {
          try {
            this.scanForPrices();
          } catch (error) {
            console.debug('VATonator: Error during rescan:', error);
          }
        }, 1000); // Increased delay to reduce frequency
      }
    });

    try {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    } catch (error) {
      console.debug('VATonator: Error setting up mutation observer:', error);
    }
  }
}

// Initialize the VAT Calculator when the page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new VATCalculator();
  });
} else {
  new VATCalculator();
}
