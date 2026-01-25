document.addEventListener('DOMContentLoaded', function() {
  const vatRateSelect = document.getElementById('vatRate');
  const customRateDiv = document.getElementById('customRateDiv');
  const customRateInput = document.getElementById('customRate');
  const previewPrice = document.getElementById('previewPrice');
  const saveButton = document.getElementById('saveButton');
  const statusDiv = document.getElementById('status');
  
  const autoDetect = document.getElementById('autoDetect');
  const watchChanges = document.getElementById('watchChanges');
  const showVATBreakdown = document.getElementById('showVATBreakdown');
  const previewVatLine = document.getElementById('previewVatLine');
  const previewOriginalPrice = document.getElementById('previewOriginalPrice');
  
  let previewTimeout = null;

  SettingsManager.populateSelect(vatRateSelect);
  loadSettings();

  vatRateSelect.addEventListener('change', updateCustomRateVisibility);
  
  customRateInput.addEventListener('input', function() {
    if (previewTimeout) {
      clearTimeout(previewTimeout);
    }
    previewTimeout = setTimeout(updatePreview, 300);
  });
  
  vatRateSelect.addEventListener('change', updatePreview);
  customRateInput.addEventListener('change', function() {
    if (previewTimeout) {
      clearTimeout(previewTimeout);
      previewTimeout = null;
    }
    updatePreview();
  });
  
  showVATBreakdown.addEventListener('change', updatePreview);
  
  saveButton.addEventListener('click', saveSettings);

  function loadSettings() {
    const keys = ['vatRate', 'customRate', 'countryCode', 'autoDetect', 'watchChanges', 'showVATBreakdown'];
    
    SettingsManager.loadSettings(keys, (result, error) => {
      if (error) {
        showStatus('Failed to load settings', 'error');
        return;
      }
      
      if (result.vatRate) {
        vatRateSelect.value = result.vatRate;
      }
      if (result.customRate) {
        customRateInput.value = result.customRate;
      }
      if (result.autoDetect !== undefined) {
        autoDetect.checked = result.autoDetect;
      }
      if (result.watchChanges !== undefined) {
        watchChanges.checked = result.watchChanges;
      }
      if (result.showVATBreakdown !== undefined) {
        showVATBreakdown.checked = result.showVATBreakdown;
      }
      
      updateCustomRateVisibility();
      updatePreview();
    });
  }

  function updateCustomRateVisibility() {
    if (vatRateSelect.value === 'custom') {
      customRateDiv.style.display = 'block';
    } else {
      customRateDiv.style.display = 'none';
    }
  }

  function updatePreview() {
    const vatRate = vatRateSelect.value === 'custom' ? 
      parseInt(customRateInput.value, 10) || 23 : 
      parseInt(vatRateSelect.value, 10);
    
    // Get currency based on selected country
    const countryCode = SettingsManager.getCountryCode(vatRateSelect);
    const currency = SettingsManager.getCurrency(countryCode);
    
    if (vatRateSelect.value === 'custom') {
      const validation = SettingsManager.validateVATRate(customRateInput.value);
      if (!validation.valid) {
        previewPrice.textContent = '-- ' + currency;
        previewVatLine.textContent = 'Invalid rate';
        return;
      }
    }
    
    const priceWithVAT = 199.99;
    const priceWithoutVAT = priceWithVAT / (1 + vatRate / 100);
    const vatAmount = priceWithVAT - priceWithoutVAT;
    
    // Update preview with correct currency
    previewOriginalPrice.textContent = priceWithVAT.toFixed(2) + ' ' + currency;
    previewPrice.textContent = priceWithoutVAT.toFixed(2) + ' ' + currency;
    previewVatLine.textContent = `VAT ${vatRate}%: ${vatAmount.toFixed(2)} ${currency}`;
    
    // Show/hide VAT breakdown based on checkbox
    previewVatLine.style.display = showVATBreakdown.checked ? 'block' : 'none';
  }

  function saveSettings() {
    const vatRate = vatRateSelect.value;
    const customRate = customRateInput.value;
    const countryCode = SettingsManager.getCountryCode(vatRateSelect);

    const additionalSettings = {
      autoDetect: autoDetect.checked,
      watchChanges: watchChanges.checked,
      showVATBreakdown: showVATBreakdown.checked
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
        showStatus('Failed to save settings', 'error');
        return;
      }
      
      showStatus('Settings saved successfully!', 'success');
    });
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    
    setTimeout(function() {
      statusDiv.style.display = 'none';
    }, 5000);
  }
});
