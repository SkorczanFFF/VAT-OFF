document.addEventListener('DOMContentLoaded', function() {
  const vatRateSelect = document.getElementById('vatRate');
  const customRateDiv = document.getElementById('customRateDiv');
  const customRateInput = document.getElementById('customRate');
  const customCurrencyInput = document.getElementById('customCurrency');
  const saveCustomRateBtn = document.getElementById('saveCustomRateBtn');
  const statusIndicator = document.getElementById('statusIndicator');
  const messageContainer = document.getElementById('messageContainer');
  const toggleBtn = document.getElementById('toggleBtn');
  const optionsBtn = document.getElementById('optionsBtn');

  let isEnabled = false;
  let saveTimeout = null;

  SettingsManager.populateSelect(vatRateSelect);
  loadSettings();

  vatRateSelect.addEventListener('change', handleVatRateChange);
  customRateInput.addEventListener('input', handleCustomRateInput);
  toggleBtn.addEventListener('click', handleToggleClick);
  optionsBtn.addEventListener('click', handleOptionsClick);
  saveCustomRateBtn.addEventListener('click', handleSaveCustomRateClick);
  function handleVatRateChange() {
    updateCustomRateVisibility();
    saveSettings();
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
        showError('Failed to save settings. Please try again.');
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
    saveSettings(true);
  }

  function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'vat-toast-message vat-error-message';
    errorDiv.textContent = '⚠ ' + message;
    messageContainer.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 3000);
  }

  function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'vat-toast-message vat-success-message';
    successDiv.textContent = '✓ ' + message;
    messageContainer.appendChild(successDiv);
    setTimeout(() => successDiv.remove(), 3000);
  }

  function updateCustomRateVisibility() {
    customRateDiv.style.display = vatRateSelect.value === 'custom' ? 'block' : 'none';
  }

  function updateStatusIndicator(enabled) {
    statusIndicator.textContent = '';
    statusIndicator.className = enabled 
      ? 'vat-status-indicator vat-status-indicator--enabled' 
      : 'vat-status-indicator vat-status-indicator--disabled';
    
    const statusText = document.createTextNode(enabled ? 'Extension is active' : 'Extension is disabled');
    statusIndicator.appendChild(statusText);
    
    const dot = document.createElement('span');
    dot.className = 'vat-status-dot';
    statusIndicator.appendChild(dot);
    
    toggleBtn.textContent = enabled ? 'Disable Extension' : 'Enable Extension';
  }

  function loadSettings() {
    SettingsManager.loadSettings(['vatRate', 'customRate', 'customCurrency', 'enabled'], (result, error) => {
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
      if (result.customCurrency) {
        customCurrencyInput.value = result.customCurrency;
      }
      if (result.enabled !== undefined) {
        isEnabled = result.enabled;
        updateStatusIndicator(result.enabled);
      } else {
        isEnabled = false;
        updateStatusIndicator(false);
      }
      updateCustomRateVisibility();
    });
  }

  function saveSettings(showSuccessMessage) {
    const vatRate = vatRateSelect.value;
    const customRate = customRateInput.value;
    const customCurrency = customCurrencyInput.value.trim().substring(0, 4);
    const countryCode = SettingsManager.getCountryCode(vatRateSelect);
    
    const prepared = SettingsManager.prepareSettingsForSave(vatRate, customRate, countryCode, { customCurrency: customCurrency });
    
    if (prepared.error) {
      showError(prepared.error);
      return;
    }
    
    if (prepared.sanitizedCustomRate !== customRate) {
      customRateInput.value = prepared.sanitizedCustomRate;
    }
    
    SettingsManager.saveSettings(prepared.settings, (error) => {
      if (error) {
        showError('Failed to save settings. Please try again.');
      } else if (showSuccessMessage) {
        showSuccess('Settings saved!');
      }
    });
  }
});
