document.addEventListener('DOMContentLoaded', function() {
  const vatRateSelect = document.getElementById('vatRate');
  const customRateDiv = document.getElementById('customRateDiv');
  const customRateInput = document.getElementById('customRate');
  const statusDiv = document.getElementById('status');
  const toggleButton = document.getElementById('toggleExtension');
  const openOptionsButton = document.getElementById('openOptions');

  // Load saved settings
  chrome.storage.sync.get(['vatRate', 'customRate', 'enabled'], function(result) {
    if (result.vatRate) {
      vatRateSelect.value = result.vatRate;
    }
    if (result.customRate) {
      customRateInput.value = result.customRate;
    }
    if (result.enabled !== undefined) {
      updateStatus(result.enabled);
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
    saveSettings();
  });

  // Toggle extension
  toggleButton.addEventListener('click', function() {
    chrome.storage.sync.get(['enabled'], function(result) {
      const newEnabled = !result.enabled;
      chrome.storage.sync.set({ enabled: newEnabled }, function() {
        updateStatus(newEnabled);
        // Notify content script with error handling
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          if (tabs && tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle', enabled: newEnabled }, function(response) {
              if (chrome.runtime.lastError) {
                console.debug('VATopia: Could not send message to content script:', chrome.runtime.lastError.message);
              }
            });
          }
        });
      });
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

  function saveSettings() {
    const vatRate = vatRateSelect.value;
    const customRate = customRateInput.value;
    
    chrome.storage.sync.set({
      vatRate: vatRate,
      customRate: customRate
    }, function() {
      // Notify content script of settings change with error handling
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'settingsChanged', 
            vatRate: vatRate,
            customRate: customRate
          }, function(response) {
            if (chrome.runtime.lastError) {
              console.debug('VATopia: Could not send settings to content script:', chrome.runtime.lastError.message);
            }
          });
        }
      });
    });
  }

  function updateStatus(enabled) {
    if (enabled) {
      statusDiv.textContent = 'Extension is active';
      statusDiv.className = 'status enabled';
      toggleButton.textContent = 'Disable Extension';
    } else {
      statusDiv.textContent = 'Extension is disabled';
      statusDiv.className = 'status disabled';
      toggleButton.textContent = 'Enable Extension';
    }
  }
});
