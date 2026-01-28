document.addEventListener('DOMContentLoaded', function() {
  const vatRegionSelect = document.getElementById('vatRegion');
  const vatRateSelect = document.getElementById('vatRate');
  const customRateDiv = document.getElementById('customRateDiv');
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

  SettingsManager.populateRegionSelect(vatRegionSelect);
  
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

  vatRegionSelect.addEventListener('change', handleRegionChange);
  vatRateSelect.addEventListener('change', handleVatRateChange);
  customRateInput.addEventListener('input', handleCustomRateInput);
  customRateInput.addEventListener('change', handleCustomRateChange);
  customCurrencyInput.addEventListener('input', updatePreview);
  showVatBreakdownCheckbox.addEventListener('change', updatePreview);
  saveBtn.addEventListener('click', handleSaveClick);
  detectLanguageBtn.addEventListener('click', handleDetectLanguage);
  function handleDetectLanguage() {
    const detectedRegion = SettingsManager.detectDefaultRegion();
    const detectedCountryCode = SettingsManager.detectDefaultCountryCode();
    
    vatRegionSelect.value = detectedRegion;
    SettingsManager.populateCountrySelect(vatRateSelect, detectedRegion);
    
    const hasDetectedCountry = Array.from(vatRateSelect.options).some(opt => opt.value === detectedCountryCode);
    if (hasDetectedCountry) {
      vatRateSelect.value = detectedCountryCode;
    } else if (vatRateSelect.options.length > 0) {
      vatRateSelect.value = vatRateSelect.options[0].value;
    }
    
    updateCustomRateVisibility();
    updatePreview();
    showStatus('Language and region detected', 'success');
  }

  function handleRegionChange() {
    const regionId = vatRegionSelect.value;
    SettingsManager.populateCountrySelect(vatRateSelect, regionId);
    
    if (vatRateSelect.options.length > 0) {
      vatRateSelect.value = vatRateSelect.options[0].value;
    }
    
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

  function handleCustomRateChange() {
    if (previewTimeout) {
      clearTimeout(previewTimeout);
      previewTimeout = null;
    }
    updatePreview();
  }

  function handleSaveClick() {
    saveSettings();
  }

  function updateCustomRateVisibility() {
    customRateDiv.style.display = vatRateSelect.value === 'custom' ? 'block' : 'none';
  }

  function updatePreview() {
    const countryCode = SettingsManager.getCountryCode(vatRateSelect);
    const vatRate = vatRateSelect.value === 'custom' ? 
      parseInt(customRateInput.value, 10) || 23 : 
      SettingsManager.getRate(countryCode);
    
    let currency;
    if (vatRateSelect.value === 'custom') {
      currency = customCurrencyInput.value.trim() || '€';
    } else {
      currency = SettingsManager.getCurrency(countryCode);
    }
    
    if (vatRateSelect.value === 'custom') {
      const validation = SettingsManager.validateVATRate(customRateInput.value);
      if (!validation.valid) {
        previewPriceSpan.textContent = '-- ' + currency;
        previewVatLineDiv.textContent = 'VAT --%: -- ' + currency;
        return;
      }
    }
    
    const priceWithVat = 199.99;
    const priceWithoutVat = priceWithVat / (1 + vatRate / 100);
    const vatAmount = priceWithVat - priceWithoutVat;
    
    previewOriginalPriceSpan.textContent = priceWithVat.toFixed(2) + ' ' + currency;
    previewPriceSpan.textContent = priceWithoutVat.toFixed(2) + ' ' + currency;
    previewVatLineDiv.textContent = `VAT ${vatRate}%: ${vatAmount.toFixed(2)} ${currency}`;
    
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
      
      if (result.vatRegion) {
        vatRegionSelect.value = result.vatRegion;
        SettingsManager.populateCountrySelect(vatRateSelect, result.vatRegion);
      } else {
        const defaultRegion = SettingsManager.detectDefaultRegion();
        vatRegionSelect.value = defaultRegion;
        SettingsManager.populateCountrySelect(vatRateSelect, defaultRegion);
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
    const vatRate = vatRateSelect.value;
    const customRate = customRateInput.value;
    const customCurrency = customCurrencyInput.value.trim().substring(0, 4);
    const countryCode = SettingsManager.getCountryCode(vatRateSelect);

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
