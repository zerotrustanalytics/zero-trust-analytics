<?php
/**
 * Settings page template
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}
?>

<div class="wrap zta-settings-wrap">
    <h1>
        <span class="zta-logo-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="6" fill="#2271b1"/>
                <path d="M8 12L16 8L24 12V20L16 24L8 20V12Z" stroke="white" stroke-width="2" fill="none"/>
                <circle cx="16" cy="16" r="3" fill="white"/>
            </svg>
        </span>
        <?php echo esc_html(get_admin_page_title()); ?>
    </h1>

    <?php settings_errors('zta_settings'); ?>

    <div class="zta-settings-container">
        <div class="zta-settings-main">
            <form method="post" action="options.php">
                <?php
                settings_fields('zta_settings_group');
                do_settings_sections('zero-trust-analytics');
                submit_button(__('Save Settings', 'zero-trust-analytics'));
                ?>
            </form>
        </div>

        <div class="zta-settings-sidebar">
            <div class="zta-sidebar-box">
                <h3><?php esc_html_e('Getting Started', 'zero-trust-analytics'); ?></h3>
                <ol class="zta-steps">
                    <li><?php esc_html_e('Sign up for a free account at', 'zero-trust-analytics'); ?> <a href="https://ztas.io" target="_blank">ztas.io</a></li>
                    <li><?php esc_html_e('Get your Site ID from the dashboard', 'zero-trust-analytics'); ?></li>
                    <li><?php esc_html_e('Enter your Site ID above', 'zero-trust-analytics'); ?></li>
                    <li><?php esc_html_e('Enable tracking and save settings', 'zero-trust-analytics'); ?></li>
                </ol>
            </div>

            <div class="zta-sidebar-box">
                <h3><?php esc_html_e('Privacy First', 'zero-trust-analytics'); ?></h3>
                <p><?php esc_html_e('Zero Trust Analytics is designed with privacy as the top priority:', 'zero-trust-analytics'); ?></p>
                <ul class="zta-features">
                    <li><?php esc_html_e('No cookies', 'zero-trust-analytics'); ?></li>
                    <li><?php esc_html_e('No personal data collection', 'zero-trust-analytics'); ?></li>
                    <li><?php esc_html_e('GDPR compliant', 'zero-trust-analytics'); ?></li>
                    <li><?php esc_html_e('Respects Do Not Track', 'zero-trust-analytics'); ?></li>
                    <li><?php esc_html_e('Lightweight and fast', 'zero-trust-analytics'); ?></li>
                </ul>
            </div>

            <div class="zta-sidebar-box">
                <h3><?php esc_html_e('Need Help?', 'zero-trust-analytics'); ?></h3>
                <p><?php esc_html_e('Visit our documentation or contact support:', 'zero-trust-analytics'); ?></p>
                <ul class="zta-links">
                    <li><a href="https://docs.ztas.io" target="_blank"><?php esc_html_e('Documentation', 'zero-trust-analytics'); ?></a></li>
                    <li><a href="https://ztas.io/support" target="_blank"><?php esc_html_e('Support', 'zero-trust-analytics'); ?></a></li>
                    <li><a href="https://ztas.io/changelog" target="_blank"><?php esc_html_e('Changelog', 'zero-trust-analytics'); ?></a></li>
                </ul>
            </div>

            <div class="zta-sidebar-box zta-status-box">
                <h3><?php esc_html_e('Tracking Status', 'zero-trust-analytics'); ?></h3>
                <?php
                $settings = Zero_Trust_Analytics::get_settings();
                $site_id = isset($settings['site_id']) ? $settings['site_id'] : '';
                $enabled = isset($settings['enabled']) ? $settings['enabled'] : false;

                if ($enabled && !empty($site_id)) {
                    echo '<div class="zta-status zta-status-active">';
                    echo '<span class="dashicons dashicons-yes-alt"></span> ';
                    echo esc_html__('Active', 'zero-trust-analytics');
                    echo '</div>';
                    echo '<p class="description">' . esc_html__('Analytics tracking is currently active on your site.', 'zero-trust-analytics') . '</p>';
                } else {
                    echo '<div class="zta-status zta-status-inactive">';
                    echo '<span class="dashicons dashicons-warning"></span> ';
                    echo esc_html__('Inactive', 'zero-trust-analytics');
                    echo '</div>';
                    if (empty($site_id)) {
                        echo '<p class="description">' . esc_html__('Please enter your Site ID to enable tracking.', 'zero-trust-analytics') . '</p>';
                    } else {
                        echo '<p class="description">' . esc_html__('Tracking is currently disabled.', 'zero-trust-analytics') . '</p>';
                    }
                }
                ?>
            </div>
        </div>
    </div>
</div>
