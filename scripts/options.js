document.addEventListener('DOMContentLoaded', function() {
  const vatRegionSelect = document.getElementById('vatRegion');
  const vatRateSelectElement = document.getElementById('vatRate');
  const customRateContainer = document.getElementById('customRateDiv');
  const customRateInput = document.getElementById('customRate');
  const customCurrencyInput = document.getElementById('customCurrency');
  const saveBtn = document.getElementById('saveButton');
  const statusDiv = document.getElementById('status');
  const detectLanguageBtn = document.getElementById('detectLanguageBtn');
  const watchChangesCheckbox = document.getElementById('watchChanges');
  const showVatBreakdownCheckbox = document.getElementById('showVATBreakdown');
  const showCalculatorCheckbox = document.getElementById('showCalculator');
  const previewPriceSpan = document.getElementById('previewPrice');
  const previewVatLineDiv = document.getElementById('previewVatLine');
  const previewOriginalPriceSpan = document.getElementById('previewOriginalPrice');
  
  let previewTimeout = null;

  SettingsManager.initializeRegionCountrySelects(vatRegionSelect, vatRateSelectElement);
  
  loadSettings();

  vatRegionSelect.addEventListener('change', handleRegionChange);
  vatRateSelectElement.addEventListener('change', handleVatRateChange);
  customRateInput.addEventListener('input', handleCustomRateInput);
  customCurrencyInput.addEventListener('input', updatePreview);
  showVatBreakdownCheckbox.addEventListener('change', updatePreview);
  saveBtn.addEventListener('click', handleSaveClick);
  detectLanguageBtn.addEventListener('click', handleDetectLanguage);
  function handleDetectLanguage() {
    SettingsManager.initializeRegionCountrySelects(vatRegionSelect, vatRateSelectElement);
    updateCustomRateVisibility();
    updatePreview();
    showStatus('Language and region detected', 'success');
  }

  function handleRegionChange() {
    SettingsManager.handleRegionChange(vatRegionSelect, vatRateSelectElement);
    updateCustomRateVisibility();
    updatePreview();
  }

  function handleVatRateChange() {
    updateCustomRateVisibility();
    updatePreview();
  }

  function handleCustomRateInput() {
    if (previewTimeout) {
      clearTimeout(previewTimeout);
    }
    previewTimeout = setTimeout(updatePreview, 300);
  }

  function handleSaveClick() {
    saveSettings();
  }

  function updateCustomRateVisibility() {
    customRateContainer.style.display = vatRateSelectElement.value === CONSTANTS.CUSTOM_RATE_VALUE ? 'block' : 'none';
  }

  function updatePreview() {
    const vatRate = SettingsManager.getSelectedVatRate(vatRateSelectElement, customRateInput);
    const currency = SettingsManager.getSelectedCurrency(vatRateSelectElement, customCurrencyInput);
    
    if (vatRateSelectElement.value === CONSTANTS.CUSTOM_RATE_VALUE) {
      const validation = SettingsManager.validateVATRate(customRateInput.value);
      if (!validation.valid) {
        previewPriceSpan.textContent = '-- ' + currency;
        previewVatLineDiv.textContent = 'VAT --%: -- ' + currency;
        return;
      }
    }
    
    const priceWithVat = 199.99;
    const result = SettingsManager.calculateVAT(priceWithVat, vatRate, true);
    
    previewOriginalPriceSpan.textContent = priceWithVat.toFixed(2) + ' ' + currency;
    previewPriceSpan.textContent = result.net.toFixed(2) + ' ' + currency;
    previewVatLineDiv.textContent = `VAT ${vatRate}%: ${result.vat.toFixed(2)} ${currency}`;
    
    previewVatLineDiv.style.display = showVatBreakdownCheckbox.checked ? 'block' : 'none';
  }

  function showStatus(message, type) {
    const icon = type === 'success' ? '✓' : '⚠';
    statusDiv.textContent = icon + ' ' + message;
    statusDiv.className = `vat-status vat-status--${type} vat-status--large`;
    statusDiv.style.display = 'block';
    
    setTimeout(function() {
      statusDiv.style.display = 'none';
    }, 5000);
  }

  function loadSettings() {
    const keys = ['vatRegion', 'vatRate', 'customRate', 'customCurrency', 'countryCode', 'watchChanges', 'showVATBreakdown', 'showCalculator'];
    
    SettingsManager.loadSettings(keys, (result, error) => {
      if (error) {
        showStatus('Failed to load settings. Try again.', 'error');
        return;
      }
      
      SettingsManager.applyRegionCountrySettings(vatRegionSelect, vatRateSelectElement, result);
      
      if (result.customRate) {
        customRateInput.value = result.customRate;
      }
      if (result.customCurrency) {
        customCurrencyInput.value = result.customCurrency;
      }
      if (result.watchChanges !== undefined) {
        watchChangesCheckbox.checked = result.watchChanges;
      }
      if (result.showVATBreakdown !== undefined) {
        showVatBreakdownCheckbox.checked = result.showVATBreakdown;
      }
      
      updateCustomRateVisibility();
      updatePreview();
    });
  }

  function saveSettings() {
    const vatRegion = vatRegionSelect.value;
    const vatRate = vatRateSelectElement.value;
    const customRate = customRateInput.value;
    const customCurrency = customCurrencyInput.value.trim().substring(0, 4);
    const countryCode = SettingsManager.getCountryCode(vatRateSelectElement);

    const additionalSettings = {
      vatRegion: vatRegion,
      watchChanges: watchChangesCheckbox.checked,
      showVATBreakdown: showVatBreakdownCheckbox.checked,
      showCalculator: showCalculatorCheckbox.checked,
      customCurrency: customCurrency
    };

    const prepared = SettingsManager.prepareSettingsForSave(vatRate, customRate, countryCode, additionalSettings);
    
    if (prepared.error) {
      showStatus(prepared.error, 'error');
      return;
    }

    if (prepared.sanitizedCustomRate !== customRate) {
      customRateInput.value = prepared.sanitizedCustomRate;
    }

    SettingsManager.saveSettings(prepared.settings, (error) => {
      if (error) {
        showStatus('Failed to save. Try again.', 'error');
        return;
      }
      
      showStatus('Settings saved', 'success');
    });
  }
});
