<?php
/**
 * Plugin Name: Zero Trust Analytics
 * Plugin URI: https://ztas.io
 * Description: Privacy-first analytics without cookies or personal data collection.
 * Version: 1.0.0
 * Author: Zero Trust Analytics
 * Author URI: https://ztas.io
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: zero-trust-analytics
 * Domain Path: /languages
 * Requires at least: 5.0
 * Requires PHP: 7.2
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('ZTA_VERSION', '1.0.0');
define('ZTA_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('ZTA_PLUGIN_URL', plugin_dir_url(__FILE__));
define('ZTA_PLUGIN_BASENAME', plugin_basename(__FILE__));

/**
 * Main Zero Trust Analytics Class
 */
class Zero_Trust_Analytics {

    /**
     * The single instance of the class
     */
    private static $instance = null;

    /**
     * Admin class instance
     */
    public $admin = null;

    /**
     * Tracker class instance
     */
    public $tracker = null;

    /**
     * Main Zero_Trust_Analytics Instance
     *
     * Ensures only one instance of Zero_Trust_Analytics is loaded or can be loaded.
     */
    public static function instance() {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    private function __construct() {
        $this->includes();
        $this->init_hooks();
    }

    /**
     * Include required files
     */
    private function includes() {
        require_once ZTA_PLUGIN_DIR . 'includes/class-zta-admin.php';
        require_once ZTA_PLUGIN_DIR . 'includes/class-zta-tracker.php';
    }

    /**
     * Initialize hooks
     */
    private function init_hooks() {
        // Initialize admin
        if (is_admin()) {
            $this->admin = new ZTA_Admin();
        }

        // Initialize tracker
        $this->tracker = new ZTA_Tracker();

        // Activation/Deactivation hooks
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));

        // Add settings link on plugins page
        add_filter('plugin_action_links_' . ZTA_PLUGIN_BASENAME, array($this, 'add_action_links'));
    }

    /**
     * Plugin activation
     */
    public function activate() {
        // Set default options
        $default_options = array(
            'site_id' => '',
            'enabled' => true,
            'exclude_logged_in' => false,
            'exclude_roles' => array(),
            'respect_dnt' => true,
            'script_url' => 'https://ztas.io/js/analytics.js'
        );

        add_option('zta_settings', $default_options);
    }

    /**
     * Plugin deactivation
     */
    public function deactivate() {
        // Cleanup if needed
    }

    /**
     * Add settings link to plugins page
     */
    public function add_action_links($links) {
        $settings_link = sprintf(
            '<a href="%s">%s</a>',
            admin_url('options-general.php?page=zero-trust-analytics'),
            __('Settings', 'zero-trust-analytics')
        );
        array_unshift($links, $settings_link);
        return $links;
    }

    /**
     * Get plugin settings
     */
    public static function get_settings() {
        return get_option('zta_settings', array());
    }

    /**
     * Get specific setting value
     */
    public static function get_setting($key, $default = null) {
        $settings = self::get_settings();
        return isset($settings[$key]) ? $settings[$key] : $default;
    }
}

/**
 * Initialize the plugin
 */
function ZTA() {
    return Zero_Trust_Analytics::instance();
}

// Initialize
ZTA();
