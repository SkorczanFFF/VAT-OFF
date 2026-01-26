# VAT-OFF Chrome Extension

A Chrome extension that automatically detects prices on web pages and displays the price without VAT when you hover over them. Supports 100+ countries with region-based selection, custom VAT rates, and real-time price detection.

## Features

### Core Functionality
- **Automatic Price Detection**: Intelligently scans web pages for price numbers in various formats
- **Hover Tooltip**: Shows price without VAT when hovering over detected prices
- **VAT Breakdown**: Optional display of VAT amount in tooltip
- **Real-time Updates**: Works with dynamically loaded content via MutationObserver

### VAT Configuration
- **100+ Countries**: Support for countries across 7 regions:
  - European Union (27 countries)
  - Other Europe (16 countries)
  - Asia (19 countries)
  - Americas (24 countries)
  - Africa (21 countries)
  - Middle East (7 countries)
  - Oceania (7 countries)
- **Region/Country Selector**: Two-level selection for easy navigation
- **Custom VAT Rate**: Set your own VAT percentage (1-100%) with custom currency symbol
- **Auto-detection**: Automatically detects default country based on browser locale

### User Interface
- **Compact Popup**: Quick access to enable/disable and change VAT rate
- **Full Options Page**: Comprehensive settings with live preview
- **Status Indicators**: Visual feedback for extension state
- **Toast Notifications**: Success/error messages for user actions

### Technical Features
- **Dynamic Content Monitoring**: Watches for new content and scans additional prices
- **Smart Price Parsing**: Handles various number formats (commas, dots, spaces, currency symbols)
- **Performance Optimized**: Limits processing to prevent DOM bloat
- **Error Handling**: Comprehensive error logging and user feedback

## Installation

### From Source (Developer Mode)

1. **Download or clone this repository**
   ```bash
   git clone <repository-url>
   cd VAT-OFF
   ```

2. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions/`
   - Or: Menu → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle "Developer mode" in the top right corner

4. **Load the Extension**
   - Click "Load unpacked"
   - Select the `VAT-OFF` folder (the one containing `manifest.json`)

5. **Verify Installation**
   - The extension should appear in your extensions list
   - You should see the VAT-OFF icon in your browser toolbar

## Usage

### Quick Start

1. **Enable the Extension**
   - Click the VAT-OFF icon in your browser toolbar
   - Click "Enable Extension" button
   - The status indicator will show "ENABLED"

2. **Select Your Country**
   - Choose a region from the dropdown (e.g., "EU")
   - Select your country from the country dropdown
   - The extension will automatically use that country's VAT rate

3. **Browse Websites**
   - Visit any website with prices
   - Hover over detected price numbers
   - See the price without VAT in a tooltip

### Custom VAT Rate

1. **Open Popup or Options**
   - Click the extension icon (popup) or right-click → Options

2. **Select "Custom Rate"**
   - Choose "Custom Rate" from the country dropdown

3. **Enter Details**
   - Enter VAT rate (1-100%)
   - Enter currency symbol (max 4 characters)
   - Click "SAVE SETTINGS"

### Advanced Settings

Access the full options page by right-clicking the extension icon and selecting "Options":

- **Watch for Dynamic Content**: Automatically scan for new prices when content is added to the page
- **Show VAT Breakdown**: Display the VAT amount in the hover tooltip
- **Tooltip Preview**: See how the tooltip will look with your current settings

## Supported Price Formats

The extension recognizes various price formats and currency symbols:

### Number Formats
- `599,99 zł` (Polish format with comma)
- `768.00 €` (European format with dot)
- `$1,234.56` (US format with thousands separator)
- `£99.99` (UK format)
- `12 000` (Numbers with spaces)
- `1234.56` (Plain numbers)

### Currency Symbols
The extension recognizes currency symbols from the selected country, including:
- European: €, £, zł, kr, Kč, lei, лв, Ft, ₴, Br
- Asian: ¥, ₩, ₹, ₨, ৳, ฿, ₫, ₱, Rp
- Americas: $, R$, ₲, S/, ₡
- And many more...

## Supported Countries

### European Union (27 countries)
Austria, Belgium, Bulgaria, Croatia, Cyprus, Czech Republic, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta, Netherlands, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, Sweden

### Other Europe (16 countries)
Albania, Andorra, Belarus, Bosnia & Herzegovina, Iceland, Liechtenstein, Moldova, Monaco, Montenegro, North Macedonia, Norway, Russia, Serbia, Switzerland, Turkey, Ukraine, United Kingdom

### Asia (19 countries)
Bangladesh, Bhutan, Cambodia, China, India, Indonesia, Japan, Kazakhstan, Laos, Nepal, Pakistan, Philippines, Singapore, South Korea, Sri Lanka, Taiwan, Tajikistan, Thailand, Uzbekistan, Vietnam

### Americas (24 countries)
Argentina, Barbados, Belize, Bolivia, Brazil, Canada, Chile, Colombia, Costa Rica, Dominican Republic, Ecuador, El Salvador, Guatemala, Guyana, Haiti, Honduras, Jamaica, Mexico, Nicaragua, Panama, Paraguay, Peru, Trinidad & Tobago, Uruguay, Venezuela

### Africa (21 countries)
Algeria, Angola, Botswana, Cameroon, Egypt, Ethiopia, Ghana, Kenya, Madagascar, Mauritius, Morocco, Mozambique, Namibia, Nigeria, Rwanda, Senegal, South Africa, Tanzania, Tunisia, Uganda, Zambia, Zimbabwe

### Middle East (7 countries)
Bahrain, Israel, Jordan, Lebanon, Oman, Saudi Arabia, United Arab Emirates

### Oceania (7 countries)
Australia, Fiji, New Zealand, Papua New Guinea, Samoa, Tonga, Vanuatu

## How It Works

### Price Detection
1. **Page Scan**: On page load, the extension scans the DOM for text nodes containing price patterns
2. **Pattern Matching**: Uses regex patterns to identify numbers that look like prices
3. **Validation**: Filters out false positives (phone numbers, dates, version numbers, etc.)
4. **Element Wrapping**: Wraps detected prices in special elements for hover detection

### VAT Calculation
The extension calculates price without VAT using the formula:
```
Price Without VAT = Price With VAT / (1 + VAT Rate / 100)
```

Example: If a price is 123.00 with 23% VAT:
```
Price Without VAT = 123.00 / (1 + 23/100) = 123.00 / 1.23 = 100.00
```

### Tooltip Display
- Appears on mouse hover over detected prices
- Shows price without VAT
- Optionally shows VAT breakdown (amount and percentage)
- Automatically positions to stay within viewport
- Uses currency symbol from selected country or custom currency

## Technical Details

### Architecture
- **Manifest Version**: 3 (latest Chrome extension standard)
- **Permissions**: 
  - `storage`: For saving user settings
  - `activeTab`: For accessing page content
- **Content Scripts**: Injected into all HTTP/HTTPS pages
- **Storage**: Uses Chrome's sync storage for cross-device settings

### File Structure
```
VAT-OFF/
├── manifest.json              # Extension configuration
├── popup.html                 # Extension popup UI
├── options.html               # Settings page
├── scripts/
│   ├── config.js              # VAT rates and country data (100+ countries)
│   ├── content.js             # Main content script (price detection)
│   ├── error-handler.js       # Error logging utility
│   ├── options.js             # Options page functionality
│   ├── popup.js               # Popup functionality
│   └── settings.js             # Settings management utility
├── styles/
│   ├── variables.css          # CSS variables and form controls
│   ├── components.css         # Shared component styles
│   ├── content.css            # Content script styles
│   ├── options.css            # Options page styles
│   └── popup.css              # Popup styles
└── icons/
    ├── icon16.png             # Extension icon (16x16)
    ├── icon48.png             # Extension icon (48x48)
    ├── icon128.png            # Extension icon (128x128)
    └── settings.svg            # Settings icon
```

### Key Technologies
- **Vanilla JavaScript**: No frameworks, pure ES6+
- **CSS Variables**: Theming system with consistent color palette
- **Chrome Storage API**: Persistent settings across sessions
- **MutationObserver**: Real-time DOM change detection
- **TreeWalker API**: Efficient DOM traversal for price detection

## Privacy

- **No Data Collection**: No data is collected or sent to external servers
- **Local Processing**: All calculations are performed locally in your browser
- **Local Storage**: Settings are stored locally using Chrome's sync storage
- **No Tracking**: No analytics, no telemetry, no tracking of any kind
- **Open Source**: Code is open for inspection

## Troubleshooting

### Extension Not Working
1. **Check Extension Status**
   - Click the extension icon
   - Verify status shows "ENABLED" (not "DISABLED")
   - If disabled, click "Enable Extension"

2. **Refresh the Page**
   - Prices are detected on page load
   - Refresh the page after enabling the extension

3. **Check Browser Compatibility**
   - Requires Chrome, Edge, or other Chromium-based browser
   - Manifest V3 compatible browsers only

### Prices Not Detected
1. **Verify Price Format**
   - Ensure prices match supported formats
   - Check if prices contain currency symbols or are plain numbers

2. **Dynamic Content**
   - Enable "Watch for dynamic content changes" in options
   - Some sites load prices via JavaScript after page load

3. **Page Restrictions**
   - Extension doesn't work on `chrome://` pages
   - Some sites may block content script injection

### Tooltip Not Showing
1. **Enable Extension**
   - Ensure extension is enabled (status shows "ENABLED")

2. **Hover Over Detected Price**
   - Prices must be detected first (scanned on page load)
   - Move mouse directly over the price number

3. **Check Settings**
   - Verify VAT rate is set correctly
   - Check if custom rate is valid (1-100%)

### Settings Not Saving
1. **Check Browser Storage**
   - Ensure Chrome sync storage is available
   - Check browser storage permissions

2. **Validation Errors**
   - Custom VAT rate must be between 1-100%
   - Currency symbol limited to 4 characters
   - Check for error messages in popup/options

## Development

### Prerequisites
- Chrome browser (or Chromium-based)
- No build tools required - runs directly from source

### Running Locally
1. Clone the repository
2. Load as unpacked extension (see Installation)
3. Make changes to files
4. Reload extension in `chrome://extensions/`
5. Refresh target pages to see changes

### Code Style
- **JavaScript**: ES6+, camelCase for variables, PascalCase for classes
- **CSS**: BEM-like naming (`vat-component--modifier`)
- **HTML**: Semantic HTML5, accessible markup

### Testing
- Test on various websites with different price formats
- Test with different VAT rates and currencies
- Test dynamic content detection
- Verify tooltip positioning on different screen sizes

## Contributing

Contributions are welcome! Areas for improvement:
- Additional countries/VAT rates
- Price format detection improvements
- Performance optimizations
- UI/UX enhancements
- Bug fixes

Please ensure code follows existing style and includes appropriate error handling.

## License

This project is open source. Feel free to modify and distribute according to your needs.

## Version

**Current Version**: 1.0.0

### Version History
- **v1.0.0** (Current)
  - Initial release
  - 100+ countries across 7 regions
  - Region/country selector
  - Custom VAT rates with currency
  - Dynamic content monitoring
  - VAT breakdown toggle
  - Comprehensive error handling

## Support

For issues, questions, or contributions, please use the repository's issue tracker.
