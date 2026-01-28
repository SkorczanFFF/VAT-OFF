const SettingsManager = {
  populateRegionSelect(selectElement, useShortcuts = false) {
    if (typeof VAT_CONFIG === 'undefined' || !VAT_CONFIG || !VAT_CONFIG.regions) return;
    
    selectElement.innerHTML = '';
    
    const shortcuts = {
      'eu': 'EU',
      'europe-other': 'Other Europe',
      'asia': 'Asia',
      'americas': 'Americas',
      'africa': 'Africa',
      'middle-east': 'Mid. East',
      'oceania': 'Oceania'
    };
    
    VAT_CONFIG.regions.forEach(region => {
      const option = document.createElement('option');
      option.value = region.id;
      option.textContent = useShortcuts && shortcuts[region.id] ? shortcuts[region.id] : region.name;
      selectElement.appendChild(option);
    });
  },

  detectDefaultRegion() {
    if (typeof VAT_CONFIG === 'undefined' || !VAT_CONFIG || !VAT_CONFIG.regions) return 'eu';
    
    const locale = navigator.language || navigator.userLanguage || 'en-US';
    const countryCode = locale.split('-')[1]?.toUpperCase();
    
    if (countryCode) {
      const regionId = this.getRegionByCountryCode(countryCode);
      if (regionId) {
        return regionId;
      }
    }
    
    const languageCode = locale.split('-')[0].toLowerCase();
    const mappedCountry = VAT_CONFIG.languageToCountry[languageCode];
    if (mappedCountry) {
      const regionId = this.getRegionByCountryCode(mappedCountry);
      if (regionId) {
        return regionId;
      }
    }
    
    return 'eu';
  },

  populateCountrySelect(selectElement, regionId, includeCustom = true) {
    if (typeof VAT_CONFIG === 'undefined' || !VAT_CONFIG || !VAT_CONFIG.regions) return;
    
    selectElement.innerHTML = '';
    
    if (!regionId) {
      selectElement.disabled = true;
      return;
    }
    
    const region = VAT_CONFIG.regions.find(r => r.id === regionId);
    if (!region) {
      selectElement.disabled = true;
      return;
    }
    
    region.countries.forEach(country => {
      const option = document.createElement('option');
      option.value = country.code;
      option.textContent = `${country.name} - ${country.currency} - ${country.rate}%`;
      selectElement.appendChild(option);
    });
    
    if (includeCustom) {
      const customOption = document.createElement('option');
      customOption.value = 'custom';
      customOption.textContent = 'Custom rate';
      selectElement.appendChild(customOption);
    }
    
    selectElement.disabled = false;
  },

  getRegionByCountryCode(countryCode) {
    if (typeof VAT_CONFIG === 'undefined' || !VAT_CONFIG || !VAT_CONFIG.regions || !countryCode) return null;
    
    for (const region of VAT_CONFIG.regions) {
      const country = region.countries.find(c => c.code === countryCode);
      if (country) {
        return region.id;
      }
    }
    return null;
  },

  validateVATRate(rateValue) {
    const trimmed = String(rateValue).trim();
    
    if (!trimmed) {
      return { valid: false, error: 'VAT rate is required.' };
    }
    
    if (!/^\d+$/.test(trimmed)) {
      return { valid: false, error: 'VAT rate must be a whole number (e.g. 15, 23, 25).' };
    }
    
    const rate = parseInt(trimmed, 10);
    
    if (isNaN(rate)) {
      return { valid: false, error: 'VAT rate must be a valid number.' };
    }
    
    if (rate <= 0) {
      return { valid: false, error: 'VAT rate must be at least 1%.' };
    }
    
    if (rate > 100) {
      return { valid: false, error: 'VAT rate cannot exceed 100%.' };
    }
    
    return { valid: true, value: rate, sanitized: rate.toString() };
  },

  detectDefaultCountryCode() {
    if (typeof VAT_CONFIG === 'undefined' || !VAT_CONFIG || !VAT_CONFIG.regions) return 'GB';
    
    const locale = navigator.language || navigator.userLanguage || 'en-US';
    const languageCode = locale.split('-')[0].toLowerCase();
    const countryCode = locale.split('-')[1]?.toUpperCase();
    
    const validCountryCodes = [];
    VAT_CONFIG.regions.forEach(region => {
      region.countries.forEach(country => {
        validCountryCodes.push(country.code);
      });
    });
    
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
    if (typeof VAT_CONFIG === 'undefined' || !VAT_CONFIG || !VAT_CONFIG.regions || !countryCode) return 20;
    
    for (const region of VAT_CONFIG.regions) {
      const country = region.countries.find(c => c.code === countryCode);
      if (country) {
        return country.rate;
      }
    }
    return 20;
  },

  getCurrency(countryCode) {
    if (typeof VAT_CONFIG === 'undefined' || !VAT_CONFIG || !VAT_CONFIG.regions || !countryCode) return '€';
    
    for (const region of VAT_CONFIG.regions) {
      const country = region.countries.find(c => c.code === countryCode);
      if (country) {
        return country.currency;
      }
    }
    return '€';
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
