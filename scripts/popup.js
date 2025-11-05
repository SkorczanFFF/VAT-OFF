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

  // Load saved settings
  chrome.storage.sync.get(['vatRate', 'customRate', 'enabled', 'countryCode'], function(result) {
    if (chrome.runtime.lastError) {
      console.error('VATopia: Storage error loading settings:', chrome.runtime.lastError);
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
    const countryCode = selectedOption ? selectedOption.dataset.country : detectDefaultCountryCode();
    
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
        return;
      }
      // Note: Content scripts will be notified automatically via chrome.storage.onChanged
    });
  }

  function updateStatus(enabled) {
    if (enabled) {
      statusDiv.innerHTML = 'Extension is active<span class="vat-status-dot"></span>';
      statusDiv.className = 'vat-status vat-status-enabled';
      toggleButton.textContent = 'Disable Extension';
    } else {
      statusDiv.innerHTML = 'Extension is disabled<span class="vat-status-dot"></span>';
      statusDiv.className = 'vat-status vat-status-disabled';
      toggleButton.textContent = 'Enable Extension';
    }
  }
});
