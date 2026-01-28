document.addEventListener('DOMContentLoaded', function() {
  const vatRegionSelect = document.getElementById('vatRegion');
  const vatRateSelect = document.getElementById('vatRate');
  const customRateDiv = document.getElementById('customRateDiv');
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

  let isEnabled = false;
  let saveTimeout = null;
  let savedCustomRate = '';
  let savedCustomCurrency = '';

  SettingsManager.populateRegionSelect(vatRegionSelect, true);
  
  const defaultRegion = SettingsManager.detectDefaultRegion();
  vatRegionSelect.value = defaultRegion;
  SettingsManager.populateCountrySelect(vatRateSelect, defaultRegion);
  
  const defaultCountryCode = SettingsManager.detectDefaultCountryCode();
  const hasDefaultCountry = Array.from(vatRateSelect.options).some(opt => opt.value === defaultCountryCode);
  if (hasDefaultCountry) {
    vatRateSelect.value = defaultCountryCode;
  } else if (vatRateSelect.options.length > 0) {
    vatRateSelect.value = vatRateSelect.options[0].value;
  }
  
  loadSettings();

  initSectionDropdowns();

  vatRegionSelect.addEventListener('change', handleRegionChange);
  vatRateSelect.addEventListener('change', handleVatRateChange);
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
    let lastSavedStateJson = '';
    let dirty = false;
    let writeVersion = 0;

    function getSectionState() {
      const state = {};
      document.querySelectorAll('.vat-section[id]').forEach(function(section) {
        state[section.id] = section.classList.contains('vat-section--collapsed');
      });
      return state;
    }

    function persistSectionState(state) {
      if (!state || Object.keys(state).length === 0) return;
      const nextJson = JSON.stringify(state);
      if (nextJson === lastSavedStateJson) return;

      lastSavedStateJson = nextJson;
      dirty = true;
      writeVersion += 1;
      const thisWriteVersion = writeVersion;

      chrome.storage.local.set({ [STORAGE_KEY]: state }, function() {
        if (chrome.runtime.lastError) {
          ErrorHandler.storage('Failed to save popup section state', chrome.runtime.lastError);
          return;
        }
        // Only clear dirty if this was the most recent write.
        if (thisWriteVersion === writeVersion) {
          dirty = false;
        }
      });
    }

    function saveSectionStatesIfChanged() {
      persistSectionState(getSectionState());
    }

    function bestEffortSaveOnClose() {
      if (!dirty) return;
      saveSectionStatesIfChanged();
    }

    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') {
        bestEffortSaveOnClose();
      }
    });

    window.addEventListener('pagehide', function() {
      bestEffortSaveOnClose();
    });

    chrome.storage.local.get([STORAGE_KEY], function(result) {
      if (chrome.runtime.lastError) {
        ErrorHandler.storage('Failed to load popup section state', chrome.runtime.lastError);
      }
      const saved = result[STORAGE_KEY] || {};
      document.querySelectorAll('.vat-section[id]').forEach(function(section) {
        if (saved[section.id]) {
          section.classList.add('vat-section--collapsed');
          var h = section.querySelector('.vat-section-header');
          if (h) h.setAttribute('aria-expanded', 'false');
        }
      });

      // Seed lastSavedStateJson from the effective state after restore,
      // so we don't write again unless something actually changes.
      lastSavedStateJson = JSON.stringify(getSectionState());
      dirty = false;

      var container = document.querySelector('.vat-container--popup');
      if (container) {
        // Force a reflow to ensure styles are applied before removing loading class
        // This prevents transitions from firing during initial render
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
          saveSectionStatesIfChanged();
          
          // Smooth scroll into view when opening
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

  function handleRegionChange() {
    const regionId = vatRegionSelect.value;
    SettingsManager.populateCountrySelect(vatRateSelect, regionId);
    
    if (vatRateSelect.options.length > 0) {
      vatRateSelect.value = vatRateSelect.options[0].value;
    }
    
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
    
    const countryCode = SettingsManager.getCountryCode(vatRateSelect);
    let vatRate;
    if (vatRateSelect.value === 'custom') {
      vatRate = parseFloat(customRateInput.value) || 23;
    } else {
      vatRate = SettingsManager.getRate(countryCode);
    }
    
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
    const newEnabled = !isEnabled;
    chrome.storage.sync.set({ enabled: newEnabled }, function() {
      if (chrome.runtime.lastError) {
        ErrorHandler.storage('Failed to save enabled state', chrome.runtime.lastError);
        showError('Failed to save. Try again.');
        return;
      }
      
      isEnabled = newEnabled;
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
      
      if (vatRateSelect.value === 'custom' && vatCalculator && vatCalculator.style.display !== 'none') {
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
    customRateDiv.style.display = vatRateSelect.value === 'custom' ? 'block' : 'none';
    updateSaveButtonVisibility();
  }

  function updateSaveButtonVisibility() {
    if (vatRateSelect.value !== 'custom') {
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
    
    const countryCode = SettingsManager.getCountryCode(vatRateSelect);
    let currency;
    if (vatRateSelect.value === 'custom') {
      currency = customCurrencyInput.value.trim() || '€';
    } else {
      currency = SettingsManager.getCurrency(countryCode);
    }

    if (calculatorBruttoMode.checked) {
      calculatorResultLabel.textContent = 'NET';
      if (amount <= 0 || vatRate <= 0) {
        calculatorResultValue.textContent = '0.00' + currency;
        calculatorResultVat.textContent = '';
      } else {
        const netto = amount / (1 + vatRate / 100);
        const vatAmount = amount - netto;
        calculatorResultValue.innerHTML = netto.toFixed(2) + currency + ' <span class="vat-calculator-result-vat">(VAT: ' + vatAmount.toFixed(2) + currency + ')</span>';
        calculatorResultVat.textContent = '';
      }
    } else {
      calculatorResultLabel.textContent = 'GROSS';
      if (amount <= 0 || vatRate <= 0) {
        calculatorResultValue.textContent = '0.00' + currency;
        calculatorResultVat.textContent = '';
      } else {
        const brutto = amount * (1 + vatRate / 100);
        const vatAmount = brutto - amount;
        calculatorResultValue.innerHTML = brutto.toFixed(2) + currency + ' <span class="vat-calculator-result-vat">(VAT: ' + vatAmount.toFixed(2) + currency + ')</span>';
        calculatorResultVat.textContent = '';
      }
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
      // Update status indicator to reflect calculator visibility
      if (!isEnabled) {
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
      
      if (result.vatRegion) {
        vatRegionSelect.value = result.vatRegion;
        SettingsManager.populateCountrySelect(vatRateSelect, result.vatRegion);
      } else {
        const fallbackRegion = SettingsManager.detectDefaultRegion();
        vatRegionSelect.value = fallbackRegion;
        SettingsManager.populateCountrySelect(vatRateSelect, fallbackRegion);
      }
      
      if (result.vatRate) {
        vatRateSelect.value = result.vatRate;
      } else {
        const fallbackCountryCode = SettingsManager.detectDefaultCountryCode();
        const hasFallbackCountry = Array.from(vatRateSelect.options).some(opt => opt.value === fallbackCountryCode);
        if (hasFallbackCountry) {
          vatRateSelect.value = fallbackCountryCode;
        } else if (vatRateSelect.options.length > 0) {
          vatRateSelect.value = vatRateSelect.options[0].value;
        }
      }
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
        isEnabled = result.enabled;
        updateStatusIndicator(result.enabled);
      } else {
        isEnabled = false;
        updateStatusIndicator(false);
      }
      updateCustomRateVisibility();
      updateCalculatorVisibility();
      updateSaveButtonVisibility();
    });
  }

  function saveSettings(showSuccessMessage, onSuccessCallback) {
    const vatRegion = vatRegionSelect.value;
    const vatRate = vatRateSelect.value;
    const customRate = customRateInput.value;
    const customCurrency = customCurrencyInput.value.trim().substring(0, 4);
    const countryCode = SettingsManager.getCountryCode(vatRateSelect);
    
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
