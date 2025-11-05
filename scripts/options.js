document.addEventListener('DOMContentLoaded', function() {
  const vatRateSelect = document.getElementById('vatRate');
  const customRateDiv = document.getElementById('customRateDiv');
  const customRateInput = document.getElementById('customRate');
  const previewPrice = document.getElementById('previewPrice');
  const saveButton = document.getElementById('saveButton');
  const statusDiv = document.getElementById('status');
  
  // Behavior checkboxes
  const autoDetect = document.getElementById('autoDetect');
  const watchChanges = document.getElementById('watchChanges');
  const showVATBreakdown = document.getElementById('showVATBreakdown');

  // Populate VAT rate dropdown from config
  VAT_CONFIG.populateSelect(vatRateSelect, true);

  // Load saved settings
  loadSettings();

  // Event listeners
  vatRateSelect.addEventListener('change', updateCustomRateVisibility);
  customRateInput.addEventListener('input', updatePreview);
  vatRateSelect.addEventListener('change', updatePreview);
  customRateInput.addEventListener('change', updatePreview);
  
  saveButton.addEventListener('click', saveSettings);

  function loadSettings() {
    chrome.storage.sync.get([
      'vatRate', 
      'customRate',
      'countryCode',
      'autoDetect',
      'watchChanges',
      'showVATBreakdown'
    ], function(result) {
      if (chrome.runtime.lastError) {
        console.error('VATopia: Storage error loading settings:', chrome.runtime.lastError);
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
      parseFloat(customRateInput.value) || 23 : 
      parseFloat(vatRateSelect.value);
    
    // Validate custom rate (Fix 3.3 - use shared validation)
    if (vatRateSelect.value === 'custom') {
      const validation = VAT_CONFIG.validateCustomRate(customRateInput.value);
      if (!validation.valid) {
        previewPrice.textContent = 'Invalid rate';
        previewPrice.style.color = '#d40000';
        return;
      }
    }
    
    const priceWithVAT = 100;
    const priceWithoutVAT = priceWithVAT / (1 + vatRate / 100);
    
    previewPrice.textContent = priceWithoutVAT.toFixed(2);
    previewPrice.style.color = '#992210';
  }

  function saveSettings() {
    // Validate custom rate before saving (Fix 3.3 - use shared validation)
    if (vatRateSelect.value === 'custom') {
      const validation = VAT_CONFIG.validateCustomRate(customRateInput.value);
      if (!validation.valid) {
        showStatus(validation.error, 'error');
        return;
      }
    }

    // Get country code from selected option
    const selectedOption = vatRateSelect.querySelector(`option[value="${vatRateSelect.value}"]`);
    const countryCode = selectedOption ? selectedOption.dataset.country : VAT_CONFIG.detectDefaultCountryCode();

    const settings = {
      vatRate: vatRateSelect.value,
      customRate: customRateInput.value,
      countryCode: countryCode,
      autoDetect: autoDetect.checked,
      watchChanges: watchChanges.checked,
      showVATBreakdown: showVATBreakdown.checked
    };

    chrome.storage.sync.set(settings, function() {
      if (chrome.runtime.lastError) {
        console.error('VATopia: Storage error saving settings:', chrome.runtime.lastError);
        showStatus('Failed to save settings', 'error');
        return;
      }
      
      showStatus('Settings saved successfully!', 'success');
      // Note: Content scripts will be notified automatically via chrome.storage.onChanged
    });
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    
    setTimeout(function() {
      statusDiv.style.display = 'none';
    }, 3000);
  }
});
