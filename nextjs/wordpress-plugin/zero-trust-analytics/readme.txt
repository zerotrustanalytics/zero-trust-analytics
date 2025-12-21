=== Zero Trust Analytics ===
Contributors: zerotrust
Tags: analytics, privacy, gdpr, tracking, statistics
Requires at least: 5.0
Tested up to: 6.7
Requires PHP: 7.2
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Privacy-first analytics without cookies or personal data collection. GDPR compliant, lightweight, and easy to use.

== Description ==

Zero Trust Analytics is a privacy-focused analytics solution that provides essential website insights without compromising user privacy. Unlike traditional analytics tools, we don't use cookies, don't collect personal data, and are fully GDPR compliant out of the box.

### Why Zero Trust Analytics?

* **Privacy First**: No cookies, no personal data collection, no tracking across sites
* **GDPR Compliant**: Fully compliant without cookie banners or consent forms
* **Lightweight**: Minimal impact on page load times
* **Accurate Data**: Get the insights you need without the privacy concerns
* **Respect User Choice**: Optional Do Not Track header support
* **Simple Setup**: Enter your Site ID and start tracking in seconds

### Features

* **Easy Integration**: Automatic script injection in your site's header
* **Privacy Controls**:
  * Exclude logged-in users from tracking
  * Exclude specific user roles (admin, editor, etc.)
  * Respect Do Not Track browser header
* **Flexible Configuration**: Custom script URL support for advanced users
* **Clean Dashboard**: Simple, intuitive settings page
* **Zero Cookies**: No cookies stored on user devices
* **No Personal Data**: We don't collect IP addresses, user agents, or any personally identifiable information

### How It Works

1. Sign up for a free account at [ztas.io](https://ztas.io)
2. Get your unique Site ID from the dashboard
3. Install this plugin and enter your Site ID
4. Enable tracking and save - you're done!

The plugin automatically injects the tracking script on all frontend pages while respecting your privacy settings. View your analytics dashboard at [ztas.io](https://ztas.io).

### Privacy & Compliance

Zero Trust Analytics is designed to be privacy-first:

* **No Cookies**: We don't use cookies at all
* **No Personal Data**: We don't collect IP addresses, user agents, or any PII
* **GDPR Compliant**: No consent required as we don't process personal data
* **Transparent**: Open source plugin code for full transparency
* **User Control**: Respects Do Not Track and provides user exclusion options

### Support

Need help? We're here for you:

* [Documentation](https://docs.ztas.io)
* [Support Forum](https://ztas.io/support)
* [Feature Requests](https://ztas.io/feature-requests)

== Installation ==

### Automatic Installation

1. Log in to your WordPress admin panel
2. Navigate to Plugins > Add New
3. Search for "Zero Trust Analytics"
4. Click "Install Now" and then "Activate"
5. Go to Settings > Zero Trust Analytics
6. Enter your Site ID and configure your preferences
7. Save changes

### Manual Installation

1. Download the plugin ZIP file
2. Log in to your WordPress admin panel
3. Navigate to Plugins > Add New > Upload Plugin
4. Choose the ZIP file and click "Install Now"
5. Activate the plugin
6. Go to Settings > Zero Trust Analytics
7. Enter your Site ID and configure your preferences
8. Save changes

### Getting Your Site ID

1. Sign up for a free account at [ztas.io](https://ztas.io)
2. Create a new site in your dashboard
3. Copy your Site ID
4. Paste it into the plugin settings

== Frequently Asked Questions ==

= Do I need a Zero Trust Analytics account? =

Yes, you need a free account at [ztas.io](https://ztas.io) to get your Site ID. The plugin handles the integration, but the analytics service is provided by Zero Trust Analytics.

= Is Zero Trust Analytics really free? =

Yes! We offer a generous free tier that works for most small to medium websites. Premium plans are available for high-traffic sites with additional features.

= Will this slow down my website? =

No. The tracking script is extremely lightweight (< 2KB) and loads asynchronously with the `defer` attribute, so it won't block page rendering.

= Do I need a cookie consent banner? =

No! Since Zero Trust Analytics doesn't use cookies and doesn't collect personal data, you don't need cookie consent banners for our tracking.

= Is this GDPR compliant? =

Yes, Zero Trust Analytics is fully GDPR compliant. We don't collect any personal data, so there's no need for consent or privacy notices specific to our analytics.

= Can I exclude myself from tracking? =

Yes! You can exclude logged-in users, specific user roles, or even respect the Do Not Track browser header. Configure these options in Settings > Zero Trust Analytics.

= What data does Zero Trust Analytics collect? =

We collect only aggregate, anonymous data: page views, referrers, browser types (without versions), device types, and country-level location (no cities or precise locations). No IP addresses, no user agents, no personal data.

= Can I use this with other analytics tools? =

Absolutely! Zero Trust Analytics works alongside Google Analytics, Matomo, or any other analytics solution. Many users use us as a privacy-friendly alternative or complement.

= What happens if I deactivate the plugin? =

The tracking script will stop being injected immediately. Your historical data remains safe in your Zero Trust Analytics dashboard.

= Can I customize the tracking script? =

Advanced users can customize the script URL in the Advanced Settings section. This is useful for self-hosting or custom configurations.

== Screenshots ==

1. Main settings page with Site ID configuration
2. Privacy settings for user exclusions
3. Advanced settings for custom configurations
4. Tracking status indicator
5. Clean, intuitive admin interface

== Changelog ==

= 1.0.0 - 2025-01-01 =
* Initial release
* Site ID configuration
* Auto-inject tracking script
* Exclude logged-in users option
* Exclude user roles option
* Do Not Track header support
* Custom script URL support
* Clean admin interface
* WordPress.org submission

== Upgrade Notice ==

= 1.0.0 =
Initial release of Zero Trust Analytics for WordPress. Simple, privacy-first analytics for your website.

== Privacy Policy ==

Zero Trust Analytics for WordPress plugin itself does not collect any data. All analytics data is processed by the Zero Trust Analytics service according to their privacy policy at https://ztas.io/privacy.

The plugin:
* Does not use cookies
* Does not collect personal data
* Does not store data in your WordPress database (except plugin settings)
* Only sends page view data to Zero Trust Analytics servers when tracking is enabled

== Additional Info ==

**Development**
* GitHub: https://github.com/zerotrust/wordpress-plugin
* Report issues: https://github.com/zerotrust/wordpress-plugin/issues

**About Zero Trust Analytics**
Zero Trust Analytics is on a mission to provide website analytics that respects user privacy. We believe you shouldn't have to choose between insights and privacy.

Visit us at [ztas.io](https://ztas.io)
