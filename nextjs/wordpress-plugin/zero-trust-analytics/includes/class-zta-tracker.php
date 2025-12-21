<?php
/**
 * Tracking functionality
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * ZTA_Tracker Class
 */
class ZTA_Tracker {

    /**
     * Constructor
     */
    public function __construct() {
        add_action('wp_head', array($this, 'inject_tracking_script'), 10);
    }

    /**
     * Inject tracking script into wp_head
     */
    public function inject_tracking_script() {
        // Don't track in admin area
        if (is_admin()) {
            return;
        }

        // Don't track if in customizer preview
        if (is_customize_preview()) {
            return;
        }

        // Get settings
        $settings = Zero_Trust_Analytics::get_settings();

        // Check if tracking is enabled
        if (empty($settings['enabled'])) {
            return;
        }

        // Check if site ID is set
        $site_id = isset($settings['site_id']) ? $settings['site_id'] : '';
        if (empty($site_id)) {
            return;
        }

        // Check if we should exclude this user
        if ($this->should_exclude_user($settings)) {
            return;
        }

        // Check Do Not Track header
        if ($this->should_respect_dnt($settings)) {
            return;
        }

        // Get script URL
        $script_url = isset($settings['script_url']) ? $settings['script_url'] : 'https://ztas.io/js/analytics.js';

        // Output tracking script
        $this->output_tracking_script($script_url, $site_id);
    }

    /**
     * Check if current user should be excluded from tracking
     */
    private function should_exclude_user($settings) {
        // Check if user is logged in
        if (!is_user_logged_in()) {
            return false;
        }

        // Exclude all logged-in users if setting is enabled
        if (!empty($settings['exclude_logged_in'])) {
            return true;
        }

        // Check if user's role is excluded
        $exclude_roles = isset($settings['exclude_roles']) ? $settings['exclude_roles'] : array();
        if (!empty($exclude_roles)) {
            $user = wp_get_current_user();
            $user_roles = (array) $user->roles;

            foreach ($user_roles as $role) {
                if (in_array($role, $exclude_roles)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if Do Not Track header should be respected
     */
    private function should_respect_dnt($settings) {
        // Check if DNT should be respected
        $respect_dnt = isset($settings['respect_dnt']) ? $settings['respect_dnt'] : true;
        if (!$respect_dnt) {
            return false;
        }

        // Check for DNT header
        if (isset($_SERVER['HTTP_DNT']) && $_SERVER['HTTP_DNT'] == '1') {
            return true;
        }

        return false;
    }

    /**
     * Output the tracking script
     */
    private function output_tracking_script($script_url, $site_id) {
        ?>
<!-- Zero Trust Analytics -->
<script>
    window.ztaConfig = {
        siteId: '<?php echo esc_js($site_id); ?>'
    };
</script>
<script defer src="<?php echo esc_url($script_url); ?>"></script>
<!-- End Zero Trust Analytics -->
<?php
    }
}
