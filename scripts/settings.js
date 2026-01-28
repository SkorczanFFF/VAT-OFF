const SettingsManager = {
  populateRegionSelect(selectElement, useShortcuts = false) {
    const regions = VAT_CONFIG?.regions ?? [];
    if (regions.length === 0) return;
    
    selectElement.innerHTML = '';
    
    const shortcuts = {
      'eu': 'EU',
      'europe-other': 'Other EU',
      'asia': 'Asia',
      'americas': 'Americas',
      'africa': 'Africa',
      'middle-east': 'Mid. East',
      'oceania': 'Oceania'
    };
    
    regions.forEach(region => {
      const option = document.createElement('option');
      option.value = region.id;
      option.textContent = useShortcuts && shortcuts[region.id] ? shortcuts[region.id] : region.name;
      selectElement.appendChild(option);
    });
  },

  detectDefaultRegion() {
    const regions = VAT_CONFIG?.regions ?? [];
    if (regions.length === 0) return 'eu';
    
    const { language, country } = this.parseLocale();
    
    if (country) {
      const regionId = this.getRegionByCountryCode(country);
      if (regionId) {
        return regionId;
      }
    }
    
    const mappedCountry = VAT_CONFIG?.languageToCountry?.[language];
    if (mappedCountry) {
      const regionId = this.getRegionByCountryCode(mappedCountry);
      if (regionId) {
        return regionId;
      }
    }
    
    return 'eu';
  },

  populateCountrySelect(selectElement, regionId, includeCustom = true) {
    const regions = VAT_CONFIG?.regions ?? [];
    if (regions.length === 0) return;
    
    selectElement.innerHTML = '';
    
    if (!regionId) {
      selectElement.disabled = true;
      return;
    }
    
    const region = regions.find(r => r.id === regionId);
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
      customOption.value = CONSTANTS.CUSTOM_RATE_VALUE;
      customOption.textContent = 'Custom rate';
      selectElement.appendChild(customOption);
    }
    
    selectElement.disabled = false;
  },

  parseLocale() {
    const locale = navigator.language || navigator.userLanguage || 'en-US';
    const [lang, country] = locale.split('-');
    return {
      language: lang?.toLowerCase() ?? 'en',
      country: country?.toUpperCase() ?? 'US'
    };
  },

  findCountry(countryCode) {
    if (!countryCode) return null;
    const regions = VAT_CONFIG?.regions ?? [];
    
    for (const region of regions) {
      const country = region.countries.find(c => c.code === countryCode);
      if (country) return country;
    }
    return null;
  },

  getRegionByCountryCode(countryCode) {
    if (!countryCode) return null;
    const regions = VAT_CONFIG?.regions ?? [];
    if (regions.length === 0) return null;
    
    for (const region of regions) {
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
    const regions = VAT_CONFIG?.regions ?? [];
    if (regions.length === 0) return 'GB';
    
    const { language, country: localeCountry } = this.parseLocale();
    
    const validCountryCodes = [];
    regions.forEach(region => {
      region.countries.forEach(country => {
        validCountryCodes.push(country.code);
      });
    });
    
    if (localeCountry && validCountryCodes.includes(localeCountry)) {
      return localeCountry;
    }
    
    return VAT_CONFIG?.languageToCountry?.[language] ?? 'GB';
  },

  getCountryCode(selectElement) {
    const value = selectElement.value;
    if (value === CONSTANTS.CUSTOM_RATE_VALUE) {
      return this.detectDefaultCountryCode();
    }
    return value || this.detectDefaultCountryCode();
  },

  getRate(countryCode) {
    return this.findCountry(countryCode)?.rate ?? CONSTANTS.DEFAULT_VAT_RATE;
  },

  getCurrency(countryCode) {
    return this.findCountry(countryCode)?.currency ?? CONSTANTS.DEFAULT_CURRENCY;
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
    
    if (vatRateValue === CONSTANTS.CUSTOM_RATE_VALUE) {
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
  },

  initializeRegionCountrySelects(regionSelect, countrySelect, useShortcuts = false) {
    this.populateRegionSelect(regionSelect, useShortcuts);
    
    const defaultRegion = this.detectDefaultRegion();
    regionSelect.value = defaultRegion;
    this.populateCountrySelect(countrySelect, defaultRegion);
    
    const defaultCountryCode = this.detectDefaultCountryCode();
    const hasDefaultCountry = Array.from(countrySelect.options).some(opt => opt.value === defaultCountryCode);
    if (hasDefaultCountry) {
      countrySelect.value = defaultCountryCode;
    } else if (countrySelect.options.length > 0) {
      countrySelect.value = countrySelect.options[0].value;
    }
  },

  applyRegionCountrySettings(regionSelect, countrySelect, savedSettings) {
    if (savedSettings.vatRegion) {
      regionSelect.value = savedSettings.vatRegion;
      this.populateCountrySelect(countrySelect, savedSettings.vatRegion);
    } else {
      const fallbackRegion = this.detectDefaultRegion();
      regionSelect.value = fallbackRegion;
      this.populateCountrySelect(countrySelect, fallbackRegion);
    }
    
    if (savedSettings.vatRate) {
      countrySelect.value = savedSettings.vatRate;
    } else {
      const fallbackCountryCode = this.detectDefaultCountryCode();
      const hasFallbackCountry = Array.from(countrySelect.options).some(opt => opt.value === fallbackCountryCode);
      if (hasFallbackCountry) {
        countrySelect.value = fallbackCountryCode;
      } else if (countrySelect.options.length > 0) {
        countrySelect.value = countrySelect.options[0].value;
      }
    }
  },

  handleRegionChange(regionSelect, countrySelect) {
    const regionId = regionSelect.value;
    this.populateCountrySelect(countrySelect, regionId);
    
    if (countrySelect.options.length > 0) {
      countrySelect.value = countrySelect.options[0].value;
    }
  },

  getSelectedVatRate(countrySelect, customRateInput) {
    if (countrySelect.value === CONSTANTS.CUSTOM_RATE_VALUE) {
      return parseFloat(customRateInput.value) || CONSTANTS.DEFAULT_VAT_RATE;
    }
    const countryCode = this.getCountryCode(countrySelect);
    return this.getRate(countryCode);
  },

  getSelectedCurrency(countrySelect, customCurrencyInput) {
    if (countrySelect.value === CONSTANTS.CUSTOM_RATE_VALUE) {
      return customCurrencyInput.value.trim() || CONSTANTS.DEFAULT_CURRENCY;
    }
    const countryCode = this.getCountryCode(countrySelect);
    return this.getCurrency(countryCode);
  },

  calculateVAT(amount, vatRate, fromGross = false) {
    if (amount <= 0 || vatRate <= 0) {
      return { net: 0, gross: 0, vat: 0 };
    }
    
    if (fromGross) {
      const net = amount / (1 + vatRate / 100);
      return { net, gross: amount, vat: amount - net };
    } else {
      const gross = amount * (1 + vatRate / 100);
      return { net: amount, gross, vat: gross - amount };
    }
  }
};
