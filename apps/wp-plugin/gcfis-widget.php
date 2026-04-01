<?php
/**
 * Plugin Name:       GCFIS Widget
 * Plugin URI:        https://gcfis.io
 * Description:       Embed the GCFIS AI chat widget on your WordPress site. Configure once, chat everywhere.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            GCFIS
 * Author URI:        https://gcfis.io
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       gcfis-widget
 */

defined( 'ABSPATH' ) || exit;

define( 'GCFIS_WIDGET_VERSION', '1.0.0' );
define( 'GCFIS_WIDGET_DIR',     plugin_dir_path( __FILE__ ) );
define( 'GCFIS_WIDGET_URL',     plugin_dir_url( __FILE__ ) );
define( 'GCFIS_WIDGET_OPTION',  'gcfis_widget_settings' );

/* ──────────────────────────────────────────────
   1. SETTINGS REGISTRATION
   ────────────────────────────────────────────── */

/**
 * Register plugin settings with WordPress.
 * All values are stored in a single serialized option array.
 */
function gcfis_register_settings(): void {
    register_setting(
        'gcfis_widget_group',
        GCFIS_WIDGET_OPTION,
        [
            'type'              => 'array',
            'sanitize_callback' => 'gcfis_sanitize_settings',
            'default'           => [],
        ]
    );
}
add_action( 'admin_init', 'gcfis_register_settings' );

/**
 * Sanitize + validate every field coming from the settings form.
 *
 * @param mixed $raw Raw POST data.
 * @return array<string, string|bool>
 */
function gcfis_sanitize_settings( mixed $raw ): array {
    if ( ! is_array( $raw ) ) {
        return [];
    }

    $clean = [];

    // Backend URL — must be a valid HTTPS URL (or empty to clear).
    $backend_url = isset( $raw['backend_url'] ) ? trim( $raw['backend_url'] ) : '';
    if ( $backend_url !== '' && ! filter_var( $backend_url, FILTER_VALIDATE_URL ) ) {
        add_settings_error(
            GCFIS_WIDGET_OPTION,
            'invalid_url',
            __( 'Backend URL must be a valid URL (e.g. https://api.example.com).', 'gcfis-widget' )
        );
        $backend_url = '';
    }
    $clean['backend_url'] = esc_url_raw( $backend_url );

    // Business ID — alphanumeric + hyphens/underscores only.
    $business_id = isset( $raw['business_id'] ) ? trim( sanitize_text_field( $raw['business_id'] ) ) : '';
    if ( $business_id !== '' && ! preg_match( '/^[a-zA-Z0-9_\-]+$/', $business_id ) ) {
        add_settings_error(
            GCFIS_WIDGET_OPTION,
            'invalid_business_id',
            __( 'Business ID may only contain letters, numbers, hyphens and underscores.', 'gcfis-widget' )
        );
        $business_id = '';
    }
    $clean['business_id'] = $business_id;

    // Primary colour — must be a valid CSS hex colour or empty.
    $primary_color = isset( $raw['primary_color'] ) ? trim( sanitize_text_field( $raw['primary_color'] ) ) : '#6366f1';
    if ( $primary_color !== '' && ! preg_match( '/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $primary_color ) ) {
        $primary_color = '#6366f1';
    }
    $clean['primary_color'] = $primary_color;

    // Bot name — plain text, max 60 chars.
    $clean['bot_name'] = substr( sanitize_text_field( $raw['bot_name'] ?? 'Assistant' ), 0, 60 );

    // Welcome message — plain text, max 200 chars.
    $clean['welcome_message'] = substr(
        sanitize_text_field( $raw['welcome_message'] ?? 'Hi! How can I help you today?' ),
        0,
        200
    );

    // Auto-inject toggle.
    $clean['auto_inject'] = ! empty( $raw['auto_inject'] );

    return $clean;
}

/* ──────────────────────────────────────────────
   2. ADMIN SETTINGS PAGE
   ────────────────────────────────────────────── */

function gcfis_add_settings_page(): void {
    add_options_page(
        __( 'GCFIS Widget Settings', 'gcfis-widget' ),
        __( 'GCFIS Widget', 'gcfis-widget' ),
        'manage_options',
        'gcfis-widget',
        'gcfis_render_settings_page'
    );
}
add_action( 'admin_menu', 'gcfis_add_settings_page' );

function gcfis_render_settings_page(): void {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }

    $opts          = (array) get_option( GCFIS_WIDGET_OPTION, [] );
    $backend_url   = $opts['backend_url']     ?? '';
    $business_id   = $opts['business_id']     ?? '';
    $primary_color = $opts['primary_color']   ?? '#6366f1';
    $bot_name      = $opts['bot_name']        ?? 'Assistant';
    $welcome_msg   = $opts['welcome_message'] ?? 'Hi! How can I help you today?';
    $auto_inject   = ! empty( $opts['auto_inject'] );

    require GCFIS_WIDGET_DIR . 'admin/settings.php';
}

/* ──────────────────────────────────────────────
   3. FRONTEND SCRIPT ENQUEUE
   ────────────────────────────────────────────── */

/**
 * Produce a stable, cache-busted version string for the asset.
 */
function gcfis_asset_version(): string {
    $path = GCFIS_WIDGET_DIR . 'assets/gcfis-widget.js';
    return file_exists( $path )
        ? GCFIS_WIDGET_VERSION . '.' . substr( md5_file( $path ), 0, 8 )
        : GCFIS_WIDGET_VERSION;
}

/**
 * Enqueue the widget bundle and pass runtime config via wp_localize_script.
 * Called on wp_enqueue_scripts; also called manually by the shortcode if the
 * script hasn't been enqueued yet.
 */
function gcfis_enqueue_widget_script(): void {
    // Only enqueue once.
    if ( wp_script_is( 'gcfis-widget', 'enqueued' ) ) {
        return;
    }

    $opts = (array) get_option( GCFIS_WIDGET_OPTION, [] );

    // Don't output anything if the plugin isn't configured.
    if ( empty( $opts['backend_url'] ) || empty( $opts['business_id'] ) ) {
        return;
    }

    wp_enqueue_script(
        'gcfis-widget',
        GCFIS_WIDGET_URL . 'assets/gcfis-widget.js',
        [],
        gcfis_asset_version(),
        [ 'strategy' => 'defer', 'in_footer' => true ]
    );

    /**
     * Filter: gcfis_widget_config
     *
     * Allows themes and plugins to override the widget configuration
     * before it is passed to the JS bundle.
     *
     * @param array $config Associative array of widget options.
     */
    $config = apply_filters( 'gcfis_widget_config', [
        'backendUrl'     => esc_url_raw( $opts['backend_url'] ),
        'businessId'     => sanitize_key( $opts['business_id'] ),
        'primaryColor'   => $opts['primary_color']   ?? '#6366f1',
        'botName'        => $opts['bot_name']         ?? 'Assistant',
        'welcomeMessage' => $opts['welcome_message']  ?? 'Hi! How can I help you today?',
    ] );

    // wp_localize_script JSON-encodes and escapes the data.
    wp_localize_script( 'gcfis-widget', 'GCFIS_CONFIG', $config );
}

/**
 * Add the widget configuration as data-* attributes on the script tag itself.
 * This keeps the built embed bundle compatible with both direct script-tag embeds
 * and WordPress-managed enqueues.
 *
 * @param string $tag Script tag HTML.
 * @param string $handle Script handle.
 * @param string $src Script src.
 * @return string
 */
function gcfis_filter_script_tag( string $tag, string $handle, string $src ): string {
    if ( 'gcfis-widget' !== $handle ) {
        return $tag;
    }

    $opts = (array) get_option( GCFIS_WIDGET_OPTION, [] );
    $attrs = [
        'data-business-id'     => esc_attr( $opts['business_id'] ?? '' ),
        'data-backend-url'     => esc_url( $opts['backend_url'] ?? '' ),
        'data-primary-color'   => esc_attr( $opts['primary_color'] ?? '#6366f1' ),
        'data-bot-name'        => esc_attr( $opts['bot_name'] ?? 'Assistant' ),
        'data-welcome-message' => esc_attr( $opts['welcome_message'] ?? 'Hi! How can I help you today?' ),
    ];

    $attr_string = '';
    foreach ( $attrs as $name => $value ) {
        if ( '' === $value ) {
            continue;
        }
        $attr_string .= sprintf( ' %s="%s"', $name, $value );
    }

    return sprintf(
        '<script src="%1$s" id="%2$s-js"%3$s defer></script>',
        esc_url( $src ),
        esc_attr( $handle ),
        $attr_string
    );
}
add_filter( 'script_loader_tag', 'gcfis_filter_script_tag', 10, 3 );

/* ──────────────────────────────────────────────
   4. AUTO-INJECT (optional, set in Settings)
   ────────────────────────────────────────────── */

function gcfis_maybe_auto_inject(): void {
    $opts = (array) get_option( GCFIS_WIDGET_OPTION, [] );

    if ( empty( $opts['auto_inject'] ) ) {
        return;
    }

    // Bail on admin, login, and REST requests.
    if ( is_admin() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
        return;
    }

    gcfis_enqueue_widget_script();
}
add_action( 'wp_enqueue_scripts', 'gcfis_maybe_auto_inject' );

/* ──────────────────────────────────────────────
   5. SHORTCODE  [gcfis_widget]
   ────────────────────────────────────────────── */

/**
 * Shortcode handler. Enqueues the script (if not already done) and outputs
 * a plain mount-point div. The JS bundle handles rendering into it.
 *
 * Accepted attributes mirror the JS WidgetConfig interface:
 *   business_id, backend_url, primary_color, bot_name, welcome_message
 *
 * Shortcode-level attributes override Settings values.
 *
 * @param array<string, string>|string $atts Shortcode attributes.
 * @return string HTML output.
 */
function gcfis_widget_shortcode( array|string $atts ): string {
    $opts = (array) get_option( GCFIS_WIDGET_OPTION, [] );

    $atts = shortcode_atts(
        [
            'business_id'     => $opts['business_id']     ?? '',
            'backend_url'     => $opts['backend_url']     ?? '',
            'primary_color'   => $opts['primary_color']   ?? '#6366f1',
            'bot_name'        => $opts['bot_name']         ?? 'Assistant',
            'welcome_message' => $opts['welcome_message']  ?? 'Hi! How can I help you today?',
        ],
        $atts,
        'gcfis_widget'
    );

    if ( empty( $atts['business_id'] ) || empty( $atts['backend_url'] ) ) {
        if ( current_user_can( 'manage_options' ) ) {
            return '<p style="color:red;">'
                . esc_html__( 'GCFIS Widget: Please configure Backend URL and Business ID in Settings → GCFIS Widget.', 'gcfis-widget' )
                . '</p>';
        }
        return '';
    }

    // Enqueue the script (noop if already done).
    gcfis_enqueue_widget_script();

    // The div carries the config so the IIFE can read it, since wp_localize_script
    // may have already printed the global with different values.
    $mount_id = 'gcfis-' . esc_attr( sanitize_key( $atts['business_id'] ) );

    return sprintf(
        '<div id="%s" '
        . 'data-gcfis-mount="1" '
        . 'data-business-id="%s" '
        . 'data-backend-url="%s" '
        . 'data-primary-color="%s" '
        . 'data-bot-name="%s" '
        . 'data-welcome-message="%s">'
        . '</div>',
        esc_attr( $mount_id ),
        esc_attr( $atts['business_id'] ),
        esc_url( $atts['backend_url'] ),
        esc_attr( $atts['primary_color'] ),
        esc_attr( $atts['bot_name'] ),
        esc_attr( $atts['welcome_message'] )
    );
}
add_shortcode( 'gcfis_widget', 'gcfis_widget_shortcode' );

/* ──────────────────────────────────────────────
   6. ACTIVATION / DEACTIVATION HOOKS
   ────────────────────────────────────────────── */

register_activation_hook( __FILE__, 'gcfis_on_activate' );
function gcfis_on_activate(): void {
    // Set sane defaults on first activation.
    if ( get_option( GCFIS_WIDGET_OPTION ) === false ) {
        update_option( GCFIS_WIDGET_OPTION, [
            'backend_url'     => '',
            'business_id'     => '',
            'primary_color'   => '#6366f1',
            'bot_name'        => 'Assistant',
            'welcome_message' => 'Hi! How can I help you today?',
            'auto_inject'     => false,
        ] );
    }
}

register_deactivation_hook( __FILE__, 'gcfis_on_deactivate' );
function gcfis_on_deactivate(): void {
    // Nothing to tear down — options are kept so re-activation restores settings.
}
