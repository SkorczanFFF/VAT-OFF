// Shared configuration for VAT rates and country data
// This eliminates duplication between popup.html and options.html

const VAT_CONFIG = {
  countries: [
    { code: 'DE', name: 'Germany', rate: 19, currency: '€' },
    { code: 'RO', name: 'Romania', rate: 19, currency: 'lei' },
    { code: 'GB', name: 'United Kingdom', rate: 20, currency: '£' },
    { code: 'SK', name: 'Slovakia', rate: 20, currency: '€' },
    { code: 'UA', name: 'Ukraine', rate: 20, currency: '₴' },
    { code: 'BY', name: 'Belarus', rate: 20, currency: 'Br' },
    { code: 'HU', name: 'Hungary', rate: 20, currency: 'Ft' },
    { code: 'BG', name: 'Bulgaria', rate: 20, currency: 'лв' },
    { code: 'HR', name: 'Croatia', rate: 20, currency: 'kn' },
    { code: 'LT', name: 'Lithuania', rate: 20, currency: '€' },
    { code: 'EE', name: 'Estonia', rate: 20, currency: '€' },
    { code: 'FR', name: 'France', rate: 20, currency: '€' },
    { code: 'NL', name: 'Netherlands', rate: 21, currency: '€' },
    { code: 'ES', name: 'Spain', rate: 21, currency: '€' },
    { code: 'CZ', name: 'Czech Republic', rate: 21, currency: 'Kč' },
    { code: 'SI', name: 'Slovenia', rate: 21, currency: '€' },
    { code: 'LV', name: 'Latvia', rate: 21, currency: '€' },
    { code: 'AT', name: 'Austria', rate: 21, currency: '€' },
    { code: 'BE', name: 'Belgium', rate: 21, currency: '€' },
    { code: 'IT', name: 'Italy', rate: 22, currency: '€' },
    { code: 'PL', name: 'Poland', rate: 23, currency: 'zł' },
    { code: 'PT', name: 'Portugal', rate: 23, currency: '€' },
    { code: 'FI', name: 'Finland', rate: 24, currency: '€' },
    { code: 'IE', name: 'Ireland', rate: 24, currency: '€' },
    { code: 'SE', name: 'Sweden', rate: 25, currency: 'kr' },
    { code: 'DK', name: 'Denmark', rate: 25, currency: 'kr' }
  ],
  
  // Helper function to get currency by country code
  getCurrencyByCountryCode(countryCode) {
    if (!countryCode) return '€';
    const country = this.countries.find(c => c.code === countryCode);
    return country ? country.currency : '€';
  },
  
  // Helper function to get VAT rate by country code
  getVATRateByCountryCode(countryCode) {
    if (!countryCode) return 20;
    const country = this.countries.find(c => c.code === countryCode);
    return country ? country.rate : 20;
  },
  
  // Helper function to validate country code exists
  isValidCountryCode(countryCode) {
    if (!countryCode) return false;
    return this.countries.some(c => c.code === countryCode);
  },
  
  // Helper function to get country by code
  getCountryByCode(countryCode) {
    return this.countries.find(c => c.code === countryCode) || null;
  },
  
  // Shared validation function for custom VAT rate
  validateCustomRate(rateValue) {
    const rate = parseFloat(rateValue);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return {
        valid: false,
        error: 'VAT rate must be between 0 and 100'
      };
    }
    return {
      valid: true,
      value: rate
    };
  },
  
  // Helper function to populate select dropdown
  populateSelect(selectElement, includeCustomOption = true) {
    // Clear existing options except custom
    selectElement.innerHTML = '';
    
    // Add country options
    this.countries.forEach(country => {
      const option = document.createElement('option');
      option.value = country.rate;
      option.dataset.country = country.code;
      option.textContent = `${country.name} - ${country.rate}%`;
      selectElement.appendChild(option);
    });
    
    // Add custom option at the end
    if (includeCustomOption) {
      const customOption = document.createElement('option');
      customOption.value = 'custom';
      customOption.textContent = 'Custom Rate';
      selectElement.appendChild(customOption);
    }
  },

  /**
   * Detects user's locale and maps it to a country code supported by the extension.
   * Falls back to language-based detection if country code is not in locale string.
   * @returns {string} Two-letter country code (e.g., 'GB', 'DE', 'PL')
   */
  detectDefaultCountryCode() {
    const locale = navigator.language || navigator.userLanguage || 'en-US';
    const languageCode = locale.split('-')[0].toLowerCase();
    const countryCode = locale.split('-')[1]?.toUpperCase();
    
    // Use countries array from config instead of hardcoded list
    const validCountryCodes = this.countries.map(c => c.code);
    
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
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VAT_CONFIG;
}

