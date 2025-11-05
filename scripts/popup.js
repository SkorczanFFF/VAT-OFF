document.addEventListener('DOMContentLoaded', function() {
  const vatRateSelect = document.getElementById('vatRate');
  const customRateDiv = document.getElementById('customRateDiv');
  const customRateInput = document.getElementById('customRate');
  const statusDiv = document.getElementById('status');
  const toggleButton = document.getElementById('toggleExtension');
  const openOptionsButton = document.getElementById('openOptions');

  // Populate VAT rate dropdown from config
  VAT_CONFIG.populateSelect(vatRateSelect, true);

  // Cache enabled state to avoid unnecessary storage reads (Fix 3.2)
  let cachedEnabledState = false;

  // Fix 7.3 - Add user-facing error messages
  function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'vat-error-message';
    errorDiv.textContent = message;
    errorDiv.style.cssText = 'background: rgba(220,53,69,0.2); color: #fff; padding: 8px; margin: 8px 0; border-radius: 4px; border: 1px solid #d40000; font-size: 12px;';
    statusDiv.parentNode.insertBefore(errorDiv, statusDiv);
    setTimeout(() => errorDiv.remove(), 5000);
  }

  // Load saved settings
  chrome.storage.sync.get(['vatRate', 'customRate', 'enabled', 'countryCode'], function(result) {
    if (chrome.runtime.lastError) {
      console.error('VATopia: Storage error loading settings:', chrome.runtime.lastError);
      showError('Failed to load settings. Please try again.');
      return;
    }
    
    if (result.vatRate) {
      vatRateSelect.value = result.vatRate;
    }
    if (result.customRate) {
      customRateInput.value = result.customRate;
    }
    if (result.countryCode) {
      // Set the country code for the selected option
      const selectedOption = vatRateSelect.querySelector(`option[value="${result.vatRate}"]`);
      if (selectedOption && selectedOption.dataset.country) {
        selectedOption.dataset.country = result.countryCode;
      }
    }
    if (result.enabled !== undefined) {
      cachedEnabledState = result.enabled;
      updateStatus(result.enabled);
    } else {
      // Default to disabled state if no stored value
      cachedEnabledState = false;
      updateStatus(false);
    }
    updateCustomRateVisibility();
  });

  // Handle VAT rate selection
  vatRateSelect.addEventListener('change', function() {
    updateCustomRateVisibility();
    saveSettings();
  });

  // Handle custom rate input
  customRateInput.addEventListener('input', function() {
    validateCustomRate();
    saveSettings();
  });

  // Toggle extension (Fix 3.2 - use cached state instead of fetching again)
  toggleButton.addEventListener('click', function() {
    const newEnabled = !cachedEnabledState;
    chrome.storage.sync.set({ enabled: newEnabled }, function() {
      if (chrome.runtime.lastError) {
        console.error('VATopia: Storage error saving enabled state:', chrome.runtime.lastError);
        showError('Failed to save settings. Please try again.');
        return;
      }
      
      cachedEnabledState = newEnabled;
      updateStatus(newEnabled);
      // Note: Content scripts will be notified automatically via chrome.storage.onChanged
    });
  });

  // Open options page
  openOptionsButton.addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
  });

  function updateCustomRateVisibility() {
    if (vatRateSelect.value === 'custom') {
      customRateDiv.style.display = 'block';
    } else {
      customRateDiv.style.display = 'none';
    }
  }

  // Fix 3.3 - Use shared validation function from config
  function validateCustomRate() {
    const validation = VAT_CONFIG.validateCustomRate(customRateInput.value);
    if (!validation.valid) {
      customRateInput.style.borderColor = '#d40000';
      customRateInput.title = validation.error;
    } else {
      customRateInput.style.borderColor = '#801834';
      customRateInput.title = '';
    }
  }

  function saveSettings() {
    const vatRate = vatRateSelect.value;
    const customRate = customRateInput.value;
    const selectedOption = vatRateSelect.querySelector(`option[value="${vatRate}"]`);
    const countryCode = selectedOption ? selectedOption.dataset.country : VAT_CONFIG.detectDefaultCountryCode();
    
    // Validate custom rate before saving (Fix 3.3 - use shared validation)
    if (vatRate === 'custom') {
      const validation = VAT_CONFIG.validateCustomRate(customRate);
      if (!validation.valid) {
        console.error('VATopia: ' + validation.error);
        return;
      }
    }
    
    chrome.storage.sync.set({
      vatRate: vatRate,
      customRate: customRate,
      countryCode: countryCode
    }, function() {
      if (chrome.runtime.lastError) {
        console.error('VATopia: Storage error saving settings:', chrome.runtime.lastError);
        showError('Failed to save settings. Please try again.');
        return;
      }
      // Note: Content scripts will be notified automatically via chrome.storage.onChanged
    });
  }

  function updateStatus(enabled) {
    statusDiv.textContent = '';
    statusDiv.className = enabled ? 'vat-status vat-status-enabled' : 'vat-status vat-status-disabled';
    
    const statusText = document.createTextNode(enabled ? 'Extension is active' : 'Extension is disabled');
    statusDiv.appendChild(statusText);
    
    const dot = document.createElement('span');
    dot.className = 'vat-status-dot';
    statusDiv.appendChild(dot);
    
    toggleButton.textContent = enabled ? 'Disable Extension' : 'Enable Extension';
  }
});
