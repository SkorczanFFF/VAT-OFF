document.addEventListener('DOMContentLoaded', function() {
  const vatRateSelect = document.getElementById('vatRate');
  const customRateDiv = document.getElementById('customRateDiv');
  const customRateInput = document.getElementById('customRate');
  const previewPrice = document.getElementById('previewPrice');
  const saveButton = document.getElementById('saveButton');
  const statusDiv = document.getElementById('status');
  
  // Currency inputs
  const currencyPLN = document.getElementById('currencyPLN');
  const currencyEUR = document.getElementById('currencyEUR');
  const currencyUSD = document.getElementById('currencyUSD');
  const currencyGBP = document.getElementById('currencyGBP');
  
  // Behavior checkboxes
  const autoDetect = document.getElementById('autoDetect');
  const watchChanges = document.getElementById('watchChanges');
  const showVATBreakdown = document.getElementById('showVATBreakdown');

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
      'currencyPLN', 
      'currencyEUR', 
      'currencyUSD', 
      'currencyGBP',
      'autoDetect',
      'watchChanges',
      'showVATBreakdown'
    ], function(result) {
      if (result.vatRate) {
        vatRateSelect.value = result.vatRate;
      }
      if (result.customRate) {
        customRateInput.value = result.customRate;
      }
      if (result.currencyPLN) {
        currencyPLN.value = result.currencyPLN;
      }
      if (result.currencyEUR) {
        currencyEUR.value = result.currencyEUR;
      }
      if (result.currencyUSD) {
        currencyUSD.value = result.currencyUSD;
      }
      if (result.currencyGBP) {
        currencyGBP.value = result.currencyGBP;
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
    
    const priceWithVAT = 100;
    const priceWithoutVAT = priceWithVAT / (1 + vatRate / 100);
    
    previewPrice.textContent = priceWithoutVAT.toFixed(2);
  }

  function saveSettings() {
    const settings = {
      vatRate: vatRateSelect.value,
      customRate: customRateInput.value,
      currencyPLN: currencyPLN.value,
      currencyEUR: currencyEUR.value,
      currencyUSD: currencyUSD.value,
      currencyGBP: currencyGBP.value,
      autoDetect: autoDetect.checked,
      watchChanges: watchChanges.checked,
      showVATBreakdown: showVATBreakdown.checked
    };

    chrome.storage.sync.set(settings, function() {
      showStatus('Settings saved successfully!', 'success');
      
      // Notify all tabs about settings change
      chrome.tabs.query({}, function(tabs) {
        tabs.forEach(function(tab) {
          chrome.tabs.sendMessage(tab.id, { 
            action: 'settingsChanged', 
            settings: settings 
          }, function(response) {
            // Ignore errors for tabs that don't have the content script
            if (chrome.runtime.lastError) {
              // Tab doesn't have content script, ignore
            }
          });
        });
      });
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
