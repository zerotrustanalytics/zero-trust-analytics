# Zero Trust Analytics - WordPress Plugin

Privacy-first analytics for WordPress without cookies or personal data collection.

## Overview

This WordPress plugin integrates [Zero Trust Analytics](https://ztas.io) into your WordPress site with minimal configuration. Simply enter your Site ID and the plugin handles the rest.

## Features

- **One-Click Integration**: Enter your Site ID and start tracking immediately
- **Privacy Controls**:
  - Exclude logged-in users from tracking
  - Exclude specific user roles (admin, editor, etc.)
  - Respect Do Not Track browser header
- **Zero Cookies**: No cookies stored on user devices
- **GDPR Compliant**: No personal data collection
- **Lightweight**: Minimal performance impact
- **Clean Admin UI**: Simple, intuitive settings page

## Installation

### From WordPress.org (Recommended)

1. In your WordPress admin, go to **Plugins > Add New**
2. Search for "Zero Trust Analytics"
3. Click **Install Now**, then **Activate**
4. Go to **Settings > Zero Trust Analytics**
5. Enter your Site ID and configure your preferences

### Manual Installation

1. Download the latest release from the [releases page](https://github.com/zerotrust/wordpress-plugin/releases)
2. Upload the `zero-trust-analytics` folder to `/wp-content/plugins/`
3. Activate the plugin through the **Plugins** menu in WordPress
4. Go to **Settings > Zero Trust Analytics**
5. Enter your Site ID and configure your preferences

### From This Repository

```bash
# Clone into your WordPress plugins directory
cd /path/to/wordpress/wp-content/plugins/
git clone https://github.com/zerotrust/wordpress-plugin.git zero-trust-analytics

# Or download and extract
cd /path/to/wordpress/wp-content/plugins/
curl -L https://github.com/zerotrust/wordpress-plugin/archive/main.zip -o zta.zip
unzip zta.zip
mv wordpress-plugin-main zero-trust-analytics
```

Then activate through the WordPress admin panel.

## Configuration

### Getting Your Site ID

1. Sign up for a free account at [ztas.io](https://ztas.io)
2. Create a new site in your dashboard
3. Copy your Site ID
4. Paste it into the plugin settings at **Settings > Zero Trust Analytics**

### Plugin Settings

Navigate to **Settings > Zero Trust Analytics** to configure:

#### General Settings

- **Site ID**: Your unique identifier from Zero Trust Analytics (required)
- **Enable Tracking**: Toggle tracking on/off

#### Privacy Settings

- **Exclude Logged-In Users**: Don't track any logged-in users
- **Exclude User Roles**: Select specific roles to exclude (admin, editor, etc.)
- **Respect Do Not Track**: Honor browser DNT header

#### Advanced Settings

- **Script URL**: Custom analytics script URL (default: `https://ztas.io/js/analytics.js`)

## How It Works

When enabled, the plugin:

1. Checks if tracking is enabled and Site ID is set
2. Verifies the current user isn't excluded (based on login status or role)
3. Checks Do Not Track header (if enabled)
4. Injects the tracking script in the `<head>` section with `defer` attribute
5. Sends anonymous page view data to Zero Trust Analytics

The script only loads on frontend pages (not in the admin area or customizer).

## Privacy & Compliance

This plugin is designed with privacy as the top priority:

- **No Cookies**: We don't use cookies at all
- **No Personal Data**: No IP addresses, user agents, or PII collected
- **GDPR Compliant**: No consent required as we don't process personal data
- **No Tracking Across Sites**: Each site is tracked independently
- **User Control**: Respects Do Not Track and provides exclusion options

### What Data Is Collected?

Zero Trust Analytics collects only aggregate, anonymous data:

- Page views (URL path only, no query parameters with PII)
- Referrer (anonymized)
- Browser type (without version)
- Device type (desktop, tablet, mobile)
- Country (from IP, but IP is not stored)

We **do not** collect:

- IP addresses
- User agents
- Cookies
- Personal identifiers
- Precise location data

## Requirements

- **WordPress**: 5.0 or higher
- **PHP**: 7.2 or higher
- **Zero Trust Analytics Account**: Free account at [ztas.io](https://ztas.io)

## Development

### File Structure

```
zero-trust-analytics/
├── zero-trust-analytics.php      # Main plugin file
├── includes/
│   ├── class-zta-admin.php       # Admin settings and UI
│   └── class-zta-tracker.php     # Tracking script injection
├── admin/
│   ├── settings-page.php         # Settings page template
│   └── css/admin.css             # Admin styles
├── readme.txt                    # WordPress.org readme
└── README.md                     # This file
```

### Code Standards

This plugin follows:

- [WordPress Coding Standards](https://developer.wordpress.org/coding-standards/wordpress-coding-standards/)
- [WordPress Plugin Guidelines](https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/)
- Security best practices (escaping, sanitization, nonces)

### Security

- All user inputs are sanitized and validated
- All outputs are escaped
- No direct file access allowed
- Settings use WordPress Settings API
- No SQL queries (uses WordPress options API)

## Support

Need help? We've got you covered:

- **Documentation**: [docs.ztas.io](https://docs.ztas.io)
- **Support Forum**: [ztas.io/support](https://ztas.io/support)
- **GitHub Issues**: [github.com/zerotrust/wordpress-plugin/issues](https://github.com/zerotrust/wordpress-plugin/issues)

## Contributing

We welcome contributions! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure your code follows WordPress coding standards and includes appropriate documentation.

## Testing

Before submitting to WordPress.org, test the plugin thoroughly:

```bash
# Install WordPress coding standards
composer require --dev wp-coding-standards/wpcs

# Run PHP CodeSniffer
phpcs --standard=WordPress zero-trust-analytics/

# Test on multiple WordPress versions
# Test on multiple PHP versions (7.2, 7.4, 8.0, 8.1, 8.2)
# Test with different themes
# Test with popular plugins (WooCommerce, etc.)
```

## Changelog

### 1.0.0 - 2025-01-01

- Initial release
- Site ID configuration
- Auto-inject tracking script
- Exclude logged-in users option
- Exclude user roles option
- Do Not Track header support
- Custom script URL support
- Clean admin interface

## License

This plugin is licensed under the GPL v2 or later.

```
Copyright (C) 2025 Zero Trust Analytics

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
```

## Credits

Developed by [Zero Trust Analytics](https://ztas.io)

## Links

- **Website**: [ztas.io](https://ztas.io)
- **Documentation**: [docs.ztas.io](https://docs.ztas.io)
- **Dashboard**: [app.ztas.io](https://app.ztas.io)
- **GitHub**: [github.com/zerotrust/wordpress-plugin](https://github.com/zerotrust/wordpress-plugin)
- **WordPress.org**: [wordpress.org/plugins/zero-trust-analytics](https://wordpress.org/plugins/zero-trust-analytics)
