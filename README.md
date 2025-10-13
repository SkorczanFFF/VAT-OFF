# VATonator Chrome Extension

A Chrome extension that automatically detects prices on web pages and displays the price without VAT when you hover over them.

## Features

- **Automatic Price Detection**: Scans web pages for price numbers in various formats (599,99 zł, 768.00 €, etc.)
- **Hover Tooltip**: Shows price without VAT when hovering over detected prices
- **Configurable VAT Rates**: Support for multiple countries' VAT rates (Poland 23%, UK 20%, Germany 19%, etc.)
- **Custom VAT Rate**: Set your own VAT percentage
- **Multiple Currency Support**: Recognizes PLN, EUR, USD, GBP and other currencies
- **Real-time Updates**: Works with dynamically loaded content
- **Dark Theme Support**: Automatically adapts to your system theme

## Installation

### From Source (Developer Mode)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the `vatonator-extension` folder
5. The extension should now appear in your extensions list

### Usage

1. **Enable the Extension**: Click the extension icon in your browser toolbar
2. **Set VAT Rate**: Choose your country's VAT rate or set a custom rate
3. **Browse Websites**: Visit any website with prices
4. **Hover Over Prices**: Move your mouse over detected price numbers to see the price without VAT

## Configuration

### Quick Settings (Popup)
- Click the extension icon to access quick settings
- Toggle the extension on/off
- Change VAT rate
- Access full settings

### Advanced Settings (Options Page)
- Right-click the extension icon and select "Options"
- Configure currency symbols
- Set extension behavior preferences
- Preview calculations

## Supported Price Formats

The extension recognizes various price formats:
- `599,99 zł` (Polish format)
- `768.00 €` (European format)
- `$1,234.56` (US format)
- `£99.99` (UK format)
- `12 000` (Numbers with spaces)
- `1234.56` (Plain numbers)

## VAT Rates by Country

- **Poland**: 23%
- **United Kingdom**: 20%
- **Germany**: 19%
- **Netherlands**: 21%
- **Sweden**: 25%
- **Italy**: 22%
- **Spain**: 21%
- **France**: 20%
- **Custom**: Set your own rate

## How It Works

1. **Price Detection**: The extension scans web pages for numbers that match price patterns
2. **Price Parsing**: Converts various number formats (commas, dots, currency symbols)
3. **VAT Calculation**: Calculates price without VAT using the formula: `Price / (1 + VAT/100)`
4. **Tooltip Display**: Shows the result when hovering over detected prices

## Technical Details

- **Manifest Version**: 3 (latest Chrome extension standard)
- **Permissions**: Storage, Active Tab access
- **Content Scripts**: Injected into all web pages
- **Storage**: Uses Chrome's sync storage for settings

## Privacy

- No data is collected or sent to external servers
- All calculations are performed locally
- Settings are stored locally in your browser

## Troubleshooting

### Extension Not Working
1. Check if the extension is enabled in the popup
2. Refresh the webpage
3. Check if prices are in a supported format

### Prices Not Detected
1. Try refreshing the page
2. Check if the website uses dynamic content loading
3. Verify the price format matches supported patterns

### Tooltip Not Showing
1. Ensure the extension is enabled
2. Check if you're hovering over a detected price (highlighted with dotted underline)
3. Try moving your mouse slightly

## Development

### File Structure
```
vatonator-extension/
├── manifest.json          # Extension configuration
├── popup.html            # Extension popup UI
├── popup.js              # Popup functionality
├── content.js            # Main content script
├── content.css           # Styles for price elements
├── options.html          # Settings page
├── options.js            # Settings functionality
└── icons/                # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Building
No build process required - the extension runs directly from source files.

## License

This project is open source. Feel free to modify and distribute according to your needs.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## Version History

- **v1.0.0**: Initial release with basic VAT calculation functionality
