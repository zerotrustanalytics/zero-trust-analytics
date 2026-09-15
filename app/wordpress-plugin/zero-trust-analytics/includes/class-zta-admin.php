<?php
/**
 * Admin functionality
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * ZTA_Admin Class
 */
class ZTA_Admin {

    /**
     * Constructor
     */
    public function __construct() {
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_styles'));
    }

    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        add_options_page(
            __('Zero Trust Analytics Settings', 'zero-trust-analytics'),
            __('Zero Trust Analytics', 'zero-trust-analytics'),
            'manage_options',
            'zero-trust-analytics',
            array($this, 'render_settings_page')
        );
    }

    /**
     * Register settings
     */
    public function register_settings() {
        register_setting(
            'zta_settings_group',
            'zta_settings',
            array($this, 'sanitize_settings')
        );

        // General Settings Section
        add_settings_section(
            'zta_general_section',
            __('General Settings', 'zero-trust-analytics'),
            array($this, 'general_section_callback'),
            'zero-trust-analytics'
        );

        // Site ID Field
        add_settings_field(
            'site_id',
            __('Site ID', 'zero-trust-analytics'),
            array($this, 'site_id_callback'),
            'zero-trust-analytics',
            'zta_general_section'
        );

        // Enabled Field
        add_settings_field(
            'enabled',
            __('Enable Tracking', 'zero-trust-analytics'),
            array($this, 'enabled_callback'),
            'zero-trust-analytics',
            'zta_general_section'
        );

        // Privacy Settings Section
        add_settings_section(
            'zta_privacy_section',
            __('Privacy Settings', 'zero-trust-analytics'),
            array($this, 'privacy_section_callback'),
            'zero-trust-analytics'
        );

        // Exclude Logged In Users
        add_settings_field(
            'exclude_logged_in',
            __('Exclude Logged-In Users', 'zero-trust-analytics'),
            array($this, 'exclude_logged_in_callback'),
            'zero-trust-analytics',
            'zta_privacy_section'
        );

        // Exclude Roles
        add_settings_field(
            'exclude_roles',
            __('Exclude User Roles', 'zero-trust-analytics'),
            array($this, 'exclude_roles_callback'),
            'zero-trust-analytics',
            'zta_privacy_section'
        );

        // Respect DNT
        add_settings_field(
            'respect_dnt',
            __('Respect Do Not Track', 'zero-trust-analytics'),
            array($this, 'respect_dnt_callback'),
            'zero-trust-analytics',
            'zta_privacy_section'
        );

        // Advanced Settings Section
        add_settings_section(
            'zta_advanced_section',
            __('Advanced Settings', 'zero-trust-analytics'),
            array($this, 'advanced_section_callback'),
            'zero-trust-analytics'
        );

        // Script URL
        add_settings_field(
            'script_url',
            __('Script URL', 'zero-trust-analytics'),
            array($this, 'script_url_callback'),
            'zero-trust-analytics',
            'zta_advanced_section'
        );
    }

    /**
     * Sanitize settings
     */
    public function sanitize_settings($input) {
        $sanitized = array();

        // Site ID - required
        $sanitized['site_id'] = isset($input['site_id']) ? sanitize_text_field($input['site_id']) : '';

        // Enabled
        $sanitized['enabled'] = isset($input['enabled']) ? (bool) $input['enabled'] : false;

        // Exclude logged in users
        $sanitized['exclude_logged_in'] = isset($input['exclude_logged_in']) ? (bool) $input['exclude_logged_in'] : false;

        // Exclude roles
        $sanitized['exclude_roles'] = isset($input['exclude_roles']) && is_array($input['exclude_roles'])
            ? array_map('sanitize_text_field', $input['exclude_roles'])
            : array();

        // Respect DNT
        $sanitized['respect_dnt'] = isset($input['respect_dnt']) ? (bool) $input['respect_dnt'] : true;

        // Script URL
        $sanitized['script_url'] = isset($input['script_url'])
            ? esc_url_raw($input['script_url'])
            : 'https://ztas.io/js/analytics.js';

        // Validation: Show error if enabled but no site ID
        if ($sanitized['enabled'] && empty($sanitized['site_id'])) {
            add_settings_error(
                'zta_settings',
                'missing_site_id',
                __('Site ID is required when tracking is enabled.', 'zero-trust-analytics'),
                'error'
            );
        }

        return $sanitized;
    }

    /**
     * Enqueue admin styles
     */
    public function enqueue_admin_styles($hook) {
        if ('settings_page_zero-trust-analytics' !== $hook) {
            return;
        }
        wp_enqueue_style('zta-admin', ZTA_PLUGIN_URL . 'admin/css/admin.css', array(), ZTA_VERSION);
    }

    /**
     * Render settings page
     */
    public function render_settings_page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        include ZTA_PLUGIN_DIR . 'admin/settings-page.php';
    }

    /**
     * Section callbacks
     */
    public function general_section_callback() {
        echo '<p>' . esc_html__('Configure your Zero Trust Analytics tracking settings.', 'zero-trust-analytics') . '</p>';
    }

    public function privacy_section_callback() {
        echo '<p>' . esc_html__('Control which users are tracked on your site.', 'zero-trust-analytics') . '</p>';
    }

    public function advanced_section_callback() {
        echo '<p>' . esc_html__('Advanced configuration options. Only change these if you know what you\'re doing.', 'zero-trust-analytics') . '</p>';
    }

    /**
     * Field callbacks
     */
    public function site_id_callback() {
        $settings = Zero_Trust_Analytics::get_settings();
        $value = isset($settings['site_id']) ? $settings['site_id'] : '';
        ?>
        <input type="text" name="zta_settings[site_id]" id="zta_site_id" value="<?php echo esc_attr($value); ?>" class="regular-text" required>
        <p class="description">
            <?php esc_html_e('Your unique Site ID from Zero Trust Analytics. Required to enable tracking.', 'zero-trust-analytics'); ?>
        </p>
        <?php
    }

    public function enabled_callback() {
        $settings = Zero_Trust_Analytics::get_settings();
        $value = isset($settings['enabled']) ? $settings['enabled'] : true;
        ?>
        <label for="zta_enabled">
            <input type="checkbox" name="zta_settings[enabled]" id="zta_enabled" value="1" <?php checked($value, true); ?>>
            <?php esc_html_e('Enable Zero Trust Analytics tracking on your site', 'zero-trust-analytics'); ?>
        </label>
        <?php
    }

    public function exclude_logged_in_callback() {
        $settings = Zero_Trust_Analytics::get_settings();
        $value = isset($settings['exclude_logged_in']) ? $settings['exclude_logged_in'] : false;
        ?>
        <label for="zta_exclude_logged_in">
            <input type="checkbox" name="zta_settings[exclude_logged_in]" id="zta_exclude_logged_in" value="1" <?php checked($value, true); ?>>
            <?php esc_html_e('Do not track logged-in users', 'zero-trust-analytics'); ?>
        </label>
        <p class="description">
            <?php esc_html_e('When enabled, any logged-in user will not be tracked.', 'zero-trust-analytics'); ?>
        </p>
        <?php
    }

    public function exclude_roles_callback() {
        $settings = Zero_Trust_Analytics::get_settings();
        $excluded_roles = isset($settings['exclude_roles']) ? $settings['exclude_roles'] : array();
        $roles = wp_roles()->get_names();
        ?>
        <fieldset>
            <legend class="screen-reader-text"><?php esc_html_e('Exclude User Roles', 'zero-trust-analytics'); ?></legend>
            <?php foreach ($roles as $role_key => $role_name): ?>
                <label for="zta_exclude_role_<?php echo esc_attr($role_key); ?>">
                    <input type="checkbox"
                           name="zta_settings[exclude_roles][]"
                           id="zta_exclude_role_<?php echo esc_attr($role_key); ?>"
                           value="<?php echo esc_attr($role_key); ?>"
                           <?php checked(in_array($role_key, $excluded_roles)); ?>>
                    <?php echo esc_html($role_name); ?>
                </label><br>
            <?php endforeach; ?>
        </fieldset>
        <p class="description">
            <?php esc_html_e('Users with these roles will not be tracked, even if logged-in tracking is enabled.', 'zero-trust-analytics'); ?>
        </p>
        <?php
    }

    public function respect_dnt_callback() {
        $settings = Zero_Trust_Analytics::get_settings();
        $value = isset($settings['respect_dnt']) ? $settings['respect_dnt'] : true;
        ?>
        <label for="zta_respect_dnt">
            <input type="checkbox" name="zta_settings[respect_dnt]" id="zta_respect_dnt" value="1" <?php checked($value, true); ?>>
            <?php esc_html_e('Respect Do Not Track browser header', 'zero-trust-analytics'); ?>
        </label>
        <p class="description">
            <?php esc_html_e('When enabled, users with DNT header will not be tracked.', 'zero-trust-analytics'); ?>
        </p>
        <?php
    }

    public function script_url_callback() {
        $settings = Zero_Trust_Analytics::get_settings();
        $value = isset($settings['script_url']) ? $settings['script_url'] : 'https://ztas.io/js/analytics.js';
        ?>
        <input type="url" name="zta_settings[script_url]" id="zta_script_url" value="<?php echo esc_attr($value); ?>" class="regular-text">
        <p class="description">
            <?php esc_html_e('Custom analytics script URL. Only change this if instructed to do so.', 'zero-trust-analytics'); ?>
        </p>
        <?php
    }
}
