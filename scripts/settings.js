const SettingsManager = {
  populateSelect(selectElement, includeCustom = true) {
    if (typeof VAT_CONFIG === 'undefined' || !VAT_CONFIG) return;
    
    selectElement.innerHTML = '';
    
    VAT_CONFIG.countries.forEach(country => {
      const option = document.createElement('option');
      option.value = country.code;
      option.textContent = `${country.name} - ${country.rate}%`;
      selectElement.appendChild(option);
    });
    
    if (includeCustom) {
      const customOption = document.createElement('option');
      customOption.value = 'custom';
      customOption.textContent = 'Custom Rate';
      selectElement.appendChild(customOption);
    }
  },

  validateVATRate(rateValue) {
    const trimmed = String(rateValue).trim();
    
    if (!trimmed) {
      return { valid: false, error: 'VAT rate is required' };
    }
    
    if (!/^\d+$/.test(trimmed)) {
      return { valid: false, error: 'VAT rate must be a whole number (e.g., 15, 23, 25)' };
    }
    
    const rate = parseInt(trimmed, 10);
    
    if (isNaN(rate)) {
      return { valid: false, error: 'VAT rate must be a valid number' };
    }
    
    if (rate <= 0) {
      return { valid: false, error: 'VAT rate must be at least 1%' };
    }
    
    if (rate > 100) {
      return { valid: false, error: 'VAT rate cannot exceed 100%' };
    }
    
    return { valid: true, value: rate, sanitized: rate.toString() };
  },

  detectDefaultCountryCode() {
    if (typeof VAT_CONFIG === 'undefined' || !VAT_CONFIG) return 'GB';
    
    const locale = navigator.language || navigator.userLanguage || 'en-US';
    const languageCode = locale.split('-')[0].toLowerCase();
    const countryCode = locale.split('-')[1]?.toUpperCase();
    
    const validCountryCodes = VAT_CONFIG.countries.map(c => c.code);
    if (countryCode && validCountryCodes.includes(countryCode)) {
      return countryCode;
    }
    
    return VAT_CONFIG.languageToCountry[languageCode] || 'GB';
  },

  getCountryCode(selectElement) {
    const value = selectElement.value;
    if (value === 'custom') {
      return this.detectDefaultCountryCode();
    }
    return value || this.detectDefaultCountryCode();
  },

  getRate(countryCode) {
    if (typeof VAT_CONFIG === 'undefined' || !VAT_CONFIG || !countryCode) return 20;
    const country = VAT_CONFIG.countries.find(c => c.code === countryCode);
    return country ? country.rate : 20;
  },

  getCurrency(countryCode) {
    if (typeof VAT_CONFIG === 'undefined' || !VAT_CONFIG || !countryCode) return '€';
    const country = VAT_CONFIG.countries.find(c => c.code === countryCode);
    return country ? country.currency : '€';
  },

  loadSettings(keys, callback) {
    chrome.storage.sync.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        ErrorHandler.storage('Failed to load settings', chrome.runtime.lastError);
        callback(null, chrome.runtime.lastError);
        return;
      }
      callback(result, null);
    });
  },

  saveSettings(settings, callback) {
    chrome.storage.sync.set(settings, () => {
      if (chrome.runtime.lastError) {
        ErrorHandler.storage('Failed to save settings', chrome.runtime.lastError);
        callback(chrome.runtime.lastError);
        return;
      }
      callback(null);
    });
  },

  prepareSettingsForSave(vatRateValue, customRateValue, countryCode, additionalSettings = {}) {
    let customRate = customRateValue;
    let vatRateNumber;
    
    if (vatRateValue === 'custom') {
      const validation = this.validateVATRate(customRate);
      if (!validation.valid) {
        return { error: validation.error };
      }
      customRate = validation.sanitized;
      vatRateNumber = parseInt(customRate, 10);
    } else {
      vatRateNumber = this.getRate(vatRateValue);
    }

    return {
      settings: {
        vatRate: vatRateValue,
        vatRateNumber: vatRateNumber,
        customRate: customRate,
        countryCode: countryCode,
        ...additionalSettings
      },
      sanitizedCustomRate: customRate
    };
  }
};
