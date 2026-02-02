document.addEventListener('DOMContentLoaded', function() {
  const vatRegionSelect = document.getElementById('vatRegion');
  const vatRateSelectElement = document.getElementById('vatRate');
  const customRateContainer = document.getElementById('customRateDiv');
  const customRateInput = document.getElementById('customRate');
  const customCurrencyInput = document.getElementById('customCurrency');
  const saveCustomRateBtn = document.getElementById('saveCustomRateBtn');
  const statusIndicator = document.getElementById('statusIndicator');
  const messageContainer = document.getElementById('messageContainer');
  const toggleBtn = document.getElementById('toggleBtn');
  const optionsBtn = document.getElementById('optionsBtn');
  const vatCalculator = document.getElementById('vatCalculator');
  const calculatorBruttoMode = document.getElementById('calculatorBruttoMode');
  const calculatorAmount = document.getElementById('calculatorAmount');
  const calculatorVatRate = document.getElementById('calculatorVatRate');
  const calculatorResultLabel = document.getElementById('calculatorResultLabel');
  const calculatorResultValue = document.getElementById('calculatorResultValue');
  const calculatorResultVat = document.getElementById('calculatorResultVat');

  let enabled = false;
  let saveTimeout = null;
  let savedCustomRate = '';
  let savedCustomCurrency = '';

  function showInjectMessage(message, container) {
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'vat-status vat-status--error vat-status--toast';
    div.textContent = '⚠ ' + message;
    container.appendChild(div);
    setTimeout(function() { div.remove(); }, 3000);
  }

  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (!tabs || tabs.length === 0) {
      showInjectMessage('Open a webpage first', messageContainer);
      return;
    }
    const tab = tabs[0];
    const url = (tab.url || '').toLowerCase();
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
        url.startsWith('edge://') || url.startsWith('moz-extension://') ||
        url.startsWith('about:') || url.startsWith('extension://')) {
      showInjectMessage('Can\'t run on this page', messageContainer);
      return;
    }
    const scriptFiles = ['scripts/error-handler.js', 'scripts/config.js', 'scripts/content.js'];
    const cssFiles = ['styles/fonts.css', 'styles/variables.css', 'styles/components.css', 'styles/content.css'];
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: scriptFiles })
      .then(function() {
        return chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: cssFiles });
      })
      .catch(function() {
        showInjectMessage('Can\'t run on this page', messageContainer);
      });
  });

  SettingsManager.initializeRegionCountrySelects(vatRegionSelect, vatRateSelectElement, true);
  
  loadSettings();

  initSectionDropdowns();

  vatRegionSelect.addEventListener('change', handleRegionChange);
  vatRateSelectElement.addEventListener('change', handleVatRateChange);
  customRateInput.addEventListener('input', handleCustomRateInput);
  customCurrencyInput.addEventListener('input', updateSaveButtonVisibility);
  toggleBtn.addEventListener('click', handleToggleClick);
  optionsBtn.addEventListener('click', handleOptionsClick);
  saveCustomRateBtn.addEventListener('click', handleSaveCustomRateClick);
  
  if (calculatorBruttoMode) {
    calculatorBruttoMode.addEventListener('change', updateCalculator);
  }
  if (calculatorAmount) {
    calculatorAmount.addEventListener('input', updateCalculator);
  }
  if (calculatorVatRate) {
    calculatorVatRate.addEventListener('input', updateCalculator);
  }
  function initSectionDropdowns() {
    const STORAGE_KEY = 'popupSections';

    function saveSectionState() {
      const state = {};
      document.querySelectorAll('.vat-section[id]').forEach(function(section) {
        state[section.id] = section.classList.contains('vat-section--collapsed');
      });
      chrome.storage.local.set({ [STORAGE_KEY]: state }, function() {
        if (chrome.runtime.lastError) {
          ErrorHandler.storage('Failed to save popup section state', chrome.runtime.lastError);
        }
      });
    }

    function loadSectionState() {
      chrome.storage.local.get([STORAGE_KEY], function(result) {
        if (chrome.runtime.lastError) {
          ErrorHandler.storage('Failed to load popup section state', chrome.runtime.lastError);
        }
        const saved = result[STORAGE_KEY] || {};
        document.querySelectorAll('.vat-section[id]').forEach(function(section) {
          if (saved[section.id]) {
            section.classList.add('vat-section--collapsed');
            const header = section.querySelector('.vat-section-header');
            if (header) {
              header.setAttribute('aria-expanded', 'false');
            }
          }
        });

        const container = document.querySelector('.vat-container--popup');
        if (container) {
          container.offsetHeight;
          requestAnimationFrame(function() {
            container.classList.remove('vat-popup-loading-sections');
          });
        }

        const headers = document.querySelectorAll('.vat-section-header');
        headers.forEach(function(header) {
          const section = header.closest('.vat-section');
          const body = section && section.querySelector('.vat-section-body');
          if (!section || !body) return;

          function toggle() {
            const wasCollapsed = section.classList.contains('vat-section--collapsed');
            const isCollapsed = section.classList.toggle('vat-section--collapsed');
            header.setAttribute('aria-expanded', !isCollapsed);
            saveSectionState();
            
            if (wasCollapsed && !isCollapsed) {
              requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                  header.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                });
              });
            }
          }

          header.addEventListener('click', function() {
            toggle();
            header.blur();
          });
          header.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggle();
            }
          });
        });
      });
    }

    loadSectionState();
  }

  function handleRegionChange() {
    SettingsManager.handleRegionChange(vatRegionSelect, vatRateSelectElement);
    updateCustomRateVisibility();
    updateCalculatorVatRate();
    saveSettings();
  }

  function handleVatRateChange() {
    updateCustomRateVisibility();
    updateCalculatorVatRate();
    saveSettings();
  }

  function updateCalculatorVatRate() {
    if (!vatCalculator || vatCalculator.style.display === 'none') {
      return;
    }
    
    const vatRate = SettingsManager.getSelectedVatRate(vatRateSelectElement, customRateInput);
    
    if (calculatorVatRate) {
      calculatorVatRate.value = vatRate;
      updateCalculator();
    }
  }

  function handleCustomRateInput() {
    const validation = SettingsManager.validateVATRate(customRateInput.value);
    if (!validation.valid) {
      customRateInput.style.borderColor = '#d40000';
      customRateInput.title = validation.error;
    } else {
      customRateInput.style.borderColor = '#801834';
      customRateInput.title = '';
    }
    
    updateSaveButtonVisibility();
    
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    
    saveTimeout = setTimeout(() => {
      saveSettings();
    }, 500);
  }

  function handleToggleClick() {
    const newEnabled = !enabled;
    chrome.storage.sync.set({ enabled: newEnabled }, function() {
      if (chrome.runtime.lastError) {
        ErrorHandler.storage('Failed to save enabled state', chrome.runtime.lastError);
        showError('Failed to save. Try again.');
        return;
      }
      
      enabled = newEnabled;
      updateStatusIndicator(newEnabled);
    });
  }

  function handleOptionsClick() {
    chrome.runtime.openOptionsPage();
  }

  function handleSaveCustomRateClick() {
    saveSettings(true, () => {
      savedCustomRate = customRateInput.value.trim();
      savedCustomCurrency = customCurrencyInput.value.trim();
      updateSaveButtonVisibility();
      
      if (vatRateSelectElement.value === CONSTANTS.CUSTOM_RATE_VALUE && vatCalculator && vatCalculator.style.display !== 'none') {
        updateCalculatorVatRate();
        updateCalculator();
      }
    });
  }

  function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'vat-status vat-status--error vat-status--toast';
    errorDiv.textContent = '⚠ ' + message;
    messageContainer.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 3000);
  }

  function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'vat-status vat-status--success vat-status--toast';
    successDiv.textContent = '✓ ' + message;
    messageContainer.appendChild(successDiv);
    setTimeout(() => successDiv.remove(), 3000);
  }

  function updateCustomRateVisibility() {
    customRateContainer.style.display = vatRateSelectElement.value === CONSTANTS.CUSTOM_RATE_VALUE ? 'block' : 'none';
    updateSaveButtonVisibility();
  }

  function updateSaveButtonVisibility() {
    if (vatRateSelectElement.value !== CONSTANTS.CUSTOM_RATE_VALUE) {
      saveCustomRateBtn.style.display = 'none';
      return;
    }

    const currentRate = customRateInput.value.trim();
    const currentCurrency = customCurrencyInput.value.trim();
    
    const rateMatches = currentRate === savedCustomRate;
    const currencyMatches = currentCurrency === savedCustomCurrency;
    
    saveCustomRateBtn.style.display = (rateMatches && currencyMatches) ? 'none' : 'block';
  }

  function updateCalculator() {
    if (!vatCalculator || vatCalculator.style.display === 'none') {
      return;
    }

    const amount = parseFloat(calculatorAmount.value) || 0;
    const vatRate = parseFloat(calculatorVatRate.value) || 0;
    const currency = SettingsManager.getSelectedCurrency(vatRateSelectElement, customCurrencyInput);
    const fromGross = calculatorBruttoMode.checked;
    
    const result = SettingsManager.calculateVAT(amount, vatRate, fromGross);
    
    calculatorResultLabel.textContent = fromGross ? 'NET' : 'GROSS';
    
    if (amount <= 0 || vatRate <= 0) {
      calculatorResultValue.textContent = '0.00' + currency;
      calculatorResultVat.textContent = '';
    } else {
      const displayValue = fromGross ? result.net : result.gross;
      calculatorResultValue.innerHTML = displayValue.toFixed(2) + currency + ' <span class="vat-calculator-result-vat">(VAT: ' + result.vat.toFixed(2) + currency + ')</span>';
      calculatorResultVat.textContent = '';
    }
  }

  function updateCalculatorVisibility() {
    if (!vatCalculator) {
      return;
    }

    SettingsManager.loadSettings(['showCalculator'], (result, error) => {
      if (!error && result.showCalculator) {
        vatCalculator.style.display = 'block';
        updateCalculatorVatRate();
      } else {
        vatCalculator.style.display = 'none';
      }
      if (!enabled) {
        updateStatusIndicator(false);
      }
    });
  }

  function updateStatusIndicator(enabled) {
    statusIndicator.textContent = '';
    statusIndicator.className = enabled 
      ? 'vat-status-indicator vat-status-indicator--enabled' 
      : 'vat-status-indicator vat-status-indicator--disabled';
    
    const calculatorVisible = vatCalculator && vatCalculator.style.display !== 'none';
    const statusText = document.createTextNode(enabled ? 'ENABLED' : (calculatorVisible ? 'OFF (calculator only)' : 'OFF'));
    statusIndicator.appendChild(statusText);
    
    const dot = document.createElement('span');
    dot.className = 'vat-status-dot';
    statusIndicator.appendChild(dot);
    
    toggleBtn.textContent = enabled ? 'Disable' : 'Enable';
  }

  function loadSettings() {
    SettingsManager.loadSettings(['vatRegion', 'vatRate', 'customRate', 'customCurrency', 'enabled', 'showCalculator'], (result, error) => {
      if (error) {
        showError('Failed to load settings. Try again.');
        return;
      }
      
      SettingsManager.applyRegionCountrySettings(vatRegionSelect, vatRateSelectElement, result);
      
      if (result.customRate) {
        customRateInput.value = result.customRate;
        savedCustomRate = result.customRate;
      } else {
        savedCustomRate = '';
      }
      if (result.customCurrency) {
        customCurrencyInput.value = result.customCurrency;
        savedCustomCurrency = result.customCurrency;
      } else {
        savedCustomCurrency = '';
      }
      if (result.enabled !== undefined) {
        enabled = result.enabled;
        updateStatusIndicator(result.enabled);
      } else {
        enabled = false;
        updateStatusIndicator(false);
      }
      updateCustomRateVisibility();
      updateCalculatorVisibility();
      updateSaveButtonVisibility();
    });
  }

  function saveSettings(showSuccessMessage, onSuccessCallback) {
    const vatRegion = vatRegionSelect.value;
    const vatRate = vatRateSelectElement.value;
    const customRate = customRateInput.value;
    const customCurrency = customCurrencyInput.value.trim().substring(0, 4);
    const countryCode = SettingsManager.getCountryCode(vatRateSelectElement);
    
    const prepared = SettingsManager.prepareSettingsForSave(vatRate, customRate, countryCode, { 
      vatRegion: vatRegion,
      customCurrency: customCurrency 
    });
    
    if (prepared.error) {
      showError(prepared.error);
      return;
    }
    
    if (prepared.sanitizedCustomRate !== customRate) {
      customRateInput.value = prepared.sanitizedCustomRate;
    }
    
    SettingsManager.saveSettings(prepared.settings, (error) => {
      if (error) {
        showError('Failed to save. Try again.');
      } else {
        if (showSuccessMessage) {
          showSuccess('Settings saved');
        }
        if (onSuccessCallback) {
          onSuccessCallback();
        }
      }
    });
  }
});
