document.addEventListener('DOMContentLoaded', function() {
  const vatRateSelect = document.getElementById('vatRate');
  const customRateDiv = document.getElementById('customRateDiv');
  const customRateInput = document.getElementById('customRate');
  const statusDiv = document.getElementById('status');
  const toggleButton = document.getElementById('toggleExtension');
  const openOptionsButton = document.getElementById('openOptions');

  SettingsManager.populateSelect(vatRateSelect);

  let cachedEnabledState = false;
  let saveTimeout = null;

  function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'vat-error-message';
    errorDiv.textContent = message;
    errorDiv.style.cssText = 'background: rgba(220,53,69,0.2); color: #fff; padding: 8px; margin: 8px 0; border: 1px solid #d40000; font-size: 12px;';
    statusDiv.parentNode.insertBefore(errorDiv, statusDiv);
    setTimeout(() => errorDiv.remove(), 5000);
  }

  SettingsManager.loadSettings(['vatRate', 'customRate', 'enabled', 'countryCode'], (result, error) => {
    if (error) {
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
      const selectedOption = vatRateSelect.querySelector(`option[value="${result.vatRate}"]`);
      if (selectedOption && selectedOption.dataset.country) {
        selectedOption.dataset.country = result.countryCode;
      }
    }
    if (result.enabled !== undefined) {
      cachedEnabledState = result.enabled;
      updateStatus(result.enabled);
    } else {
      cachedEnabledState = false;
      updateStatus(false);
    }
    updateCustomRateVisibility();
  });

  vatRateSelect.addEventListener('change', function() {
    updateCustomRateVisibility();
    saveSettings();
  });

  customRateInput.addEventListener('input', function() {
    const validation = SettingsManager.validateVATRate(customRateInput.value);
    if (!validation.valid) {
      customRateInput.style.borderColor = '#d40000';
      customRateInput.title = validation.error;
    } else {
      customRateInput.style.borderColor = '#801834';
      customRateInput.title = '';
    }
    
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    
    saveTimeout = setTimeout(() => {
      saveSettings();
    }, 500);
  });

  toggleButton.addEventListener('click', function() {
    const newEnabled = !cachedEnabledState;
    chrome.storage.sync.set({ enabled: newEnabled }, function() {
      if (chrome.runtime.lastError) {
        ErrorHandler.storage('Failed to save enabled state', chrome.runtime.lastError);
        showError('Failed to save settings. Please try again.');
        return;
      }
      
      cachedEnabledState = newEnabled;
      updateStatus(newEnabled);
    });
  });

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

  function saveSettings() {
    const vatRate = vatRateSelect.value;
    const customRate = customRateInput.value;
    const countryCode = SettingsManager.getCountryCode(vatRateSelect);
    
    const prepared = SettingsManager.prepareSettingsForSave(vatRate, customRate, countryCode);
    
    if (prepared.error) {
      // Don't log validation errors to console - they're expected user input issues
      showError(prepared.error);
      return;
    }
    
    if (prepared.sanitizedCustomRate !== customRate) {
      customRateInput.value = prepared.sanitizedCustomRate;
    }
    
    SettingsManager.saveSettings(prepared.settings, (error) => {
      if (error) {
        showError('Failed to save settings. Please try again.');
      }
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
