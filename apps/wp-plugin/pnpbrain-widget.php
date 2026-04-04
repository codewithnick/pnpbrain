<?php
/**
 * Plugin Name:       PNpbrain Widget
 * Plugin URI:        https://pnpbrain.io
 * Description:       Embed the PNpbrain AI chat widget on your WordPress site. Configure once, chat everywhere.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            PNpbrain
 * Author URI:        https://pnpbrain.io
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       pnpbrain-widget
 */

defined( 'ABSPATH' ) || exit;

define( 'PNPBRAIN_WIDGET_VERSION', '1.0.0' );
define( 'PNPBRAIN_WIDGET_DIR',     plugin_dir_path( __FILE__ ) );
define( 'PNPBRAIN_WIDGET_URL',     plugin_dir_url( __FILE__ ) );
define( 'PNPBRAIN_WIDGET_OPTION',  'pnpbrain_widget_settings' );

/* ──────────────────────────────────────────────
   1. SETTINGS REGISTRATION
   ────────────────────────────────────────────── */

/**
 * Register plugin settings with WordPress.
 * All values are stored in a single serialized option array.
 */
function pnpbrain_register_settings(): void {
    register_setting(
        'pnpbrain_widget_group',
        PNPBRAIN_WIDGET_OPTION,
        [
            'type'              => 'array',
            'sanitize_callback' => 'pnpbrain_sanitize_settings',
            'default'           => [],
        ]
    );
}
add_action( 'admin_init', 'pnpbrain_register_settings' );

/**
 * Sanitize + validate every field coming from the settings form.
 *
 * @param mixed $raw Raw POST data.
 * @return array<string, string|bool>
 */
function pnpbrain_sanitize_settings( mixed $raw ): array {
    if ( ! is_array( $raw ) ) {
        return [];
    }

    $clean = [];

    // Backend URL — must be a valid HTTPS URL (or empty to clear).
    $backend_url = isset( $raw['backend_url'] ) ? trim( $raw['backend_url'] ) : '';
    if ( $backend_url !== '' && ! filter_var( $backend_url, FILTER_VALIDATE_URL ) ) {
        add_settings_error(
            PNPBRAIN_WIDGET_OPTION,
            'invalid_url',
            __( 'Backend URL must be a valid URL (e.g. https://api.example.com).', 'pnpbrain-widget' )
        );
        $backend_url = '';
    }
    $clean['backend_url'] = esc_url_raw( $backend_url );

    // Public token — opaque token returned by backend.
    $public_token = isset( $raw['public_token'] ) ? trim( sanitize_text_field( $raw['public_token'] ) ) : '';
    if ( $public_token !== '' && ! preg_match( '/^[a-zA-Z0-9_\-.]+$/', $public_token ) ) {
        add_settings_error(
            PNPBRAIN_WIDGET_OPTION,
            'invalid_public_token',
            __( 'Public token may only contain letters, numbers, hyphens, underscores, and dots.', 'pnpbrain-widget' )
        );
        $public_token = '';
    }
    $clean['public_token'] = $public_token;

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

function pnpbrain_add_settings_page(): void {
    add_options_page(
        __( 'PNpbrain Widget Settings', 'pnpbrain-widget' ),
        __( 'PNpbrain Widget', 'pnpbrain-widget' ),
        'manage_options',
        'pnpbrain-widget',
        'pnpbrain_render_settings_page'
    );
}
add_action( 'admin_menu', 'pnpbrain_add_settings_page' );

function pnpbrain_render_settings_page(): void {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }

    $opts          = (array) get_option( PNPBRAIN_WIDGET_OPTION, [] );
    $backend_url   = $opts['backend_url']     ?? '';
    $public_token  = $opts['public_token']    ?? '';
    $primary_color = $opts['primary_color']   ?? '#6366f1';
    $bot_name      = $opts['bot_name']        ?? 'Assistant';
    $welcome_msg   = $opts['welcome_message'] ?? 'Hi! How can I help you today?';
    $auto_inject   = ! empty( $opts['auto_inject'] );

    require PNPBRAIN_WIDGET_DIR . 'admin/settings.php';
}

/* ──────────────────────────────────────────────
   3. FRONTEND SCRIPT ENQUEUE
   ────────────────────────────────────────────── */

/**
 * Produce a stable, cache-busted version string for the asset.
 */
function pnpbrain_asset_version(): string {
    $path = PNPBRAIN_WIDGET_DIR . 'assets/pnpbrain-widget.js';
    return file_exists( $path )
        ? PNPBRAIN_WIDGET_VERSION . '.' . substr( md5_file( $path ), 0, 8 )
        : PNPBRAIN_WIDGET_VERSION;
}

/**
 * Enqueue the widget bundle and pass runtime config via wp_localize_script.
 * Called on wp_enqueue_scripts; also called manually by the shortcode if the
 * script hasn't been enqueued yet.
 */
function pnpbrain_enqueue_widget_script(): void {
    // Only enqueue once.
    if ( wp_script_is( 'pnpbrain-widget', 'enqueued' ) ) {
        return;
    }

    $opts = (array) get_option( PNPBRAIN_WIDGET_OPTION, [] );

    // Don't output anything if the plugin isn't configured.
    if ( empty( $opts['backend_url'] ) || empty( $opts['public_token'] ) ) {
        return;
    }

    wp_enqueue_script(
        'pnpbrain-widget',
        PNPBRAIN_WIDGET_URL . 'assets/pnpbrain-widget.js',
        [],
        pnpbrain_asset_version(),
        [ 'strategy' => 'defer', 'in_footer' => true ]
    );

    /**
     * Filter: pnpbrain_widget_config
     *
     * Allows themes and plugins to override the widget configuration
     * before it is passed to the JS bundle.
     *
     * @param array $config Associative array of widget options.
     */
    $config = apply_filters( 'pnpbrain_widget_config', [
        'backendUrl'           => esc_url_raw( $opts['backend_url'] ),
        'publicToken'          => sanitize_text_field( $opts['public_token'] ),
        'primaryColor'         => $opts['primary_color']   ?? '#6366f1',
        'botName'              => $opts['bot_name']         ?? 'Assistant',
        'welcomeMessage'       => $opts['welcome_message']  ?? 'Hi! How can I help you today?',
        'placeholder'          => $opts['placeholder']      ?? 'Type a message…',
        'assistantAvatarMode'   => $opts['assistant_avatar_mode']   ?? 'initial',
        'assistantAvatarText'   => $opts['assistant_avatar_text']   ?? 'A',
        'assistantAvatarImageUrl' => $opts['assistant_avatar_image_url'] ?? '',
        'showAssistantAvatar'   => isset( $opts['show_assistant_avatar'] ) ? (bool) $opts['show_assistant_avatar'] : true,
        'showUserAvatar'        => ! empty( $opts['show_user_avatar'] ),
        'userAvatarText'        => $opts['user_avatar_text'] ?? 'You',
        'position'              => $opts['position'] ?? 'bottom-right',
        'headerSubtitle'        => $opts['header_subtitle'] ?? 'Online',
        'chatBackgroundColor'   => $opts['chat_background_color'] ?? '#f9fafb',
        'userMessageColor'      => $opts['user_message_color'] ?? '',
        'assistantMessageColor'  => $opts['assistant_message_color'] ?? '#ffffff',
        'borderRadiusPx'        => isset( $opts['border_radius_px'] ) ? (int) $opts['border_radius_px'] : 16,
        'showPoweredBy'         => isset( $opts['show_powered_by'] ) ? (bool) $opts['show_powered_by'] : true,
    ] );

    // wp_localize_script JSON-encodes and escapes the data.
    wp_localize_script( 'pnpbrain-widget', 'PNPBRAIN_CONFIG', $config );
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
function pnpbrain_filter_script_tag( string $tag, string $handle, string $src ): string {
    if ( 'pnpbrain-widget' !== $handle ) {
        return $tag;
    }

    $opts = (array) get_option( PNPBRAIN_WIDGET_OPTION, [] );
    $attrs = [
        'data-public-token'           => esc_attr( $opts['public_token'] ?? '' ),
        'data-backend-url'            => esc_url( $opts['backend_url'] ?? '' ),
        'data-primary-color'          => esc_attr( $opts['primary_color'] ?? '#6366f1' ),
        'data-bot-name'               => esc_attr( $opts['bot_name'] ?? 'Assistant' ),
        'data-welcome-message'        => esc_attr( $opts['welcome_message'] ?? 'Hi! How can I help you today?' ),
        'data-placeholder'            => esc_attr( $opts['placeholder'] ?? 'Type a message…' ),
        'data-assistant-avatar-mode'   => esc_attr( $opts['assistant_avatar_mode'] ?? 'initial' ),
        'data-assistant-avatar-text'   => esc_attr( $opts['assistant_avatar_text'] ?? 'A' ),
        'data-assistant-avatar-image-url' => esc_url( $opts['assistant_avatar_image_url'] ?? '' ),
        'data-show-assistant-avatar'   => ! empty( $opts['show_assistant_avatar'] ) ? 'true' : 'false',
        'data-show-user-avatar'        => ! empty( $opts['show_user_avatar'] ) ? 'true' : 'false',
        'data-user-avatar-text'        => esc_attr( $opts['user_avatar_text'] ?? 'You' ),
        'data-position'                => esc_attr( $opts['position'] ?? 'bottom-right' ),
        'data-header-subtitle'         => esc_attr( $opts['header_subtitle'] ?? 'Online' ),
        'data-chat-background-color'   => esc_attr( $opts['chat_background_color'] ?? '#f9fafb' ),
        'data-user-message-color'      => esc_attr( $opts['user_message_color'] ?? '' ),
        'data-assistant-message-color'  => esc_attr( $opts['assistant_message_color'] ?? '#ffffff' ),
        'data-border-radius-px'        => esc_attr( isset( $opts['border_radius_px'] ) ? (string) $opts['border_radius_px'] : '16' ),
        'data-show-powered-by'         => ! empty( $opts['show_powered_by'] ) ? 'true' : 'false',
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
add_filter( 'script_loader_tag', 'pnpbrain_filter_script_tag', 10, 3 );

/* ──────────────────────────────────────────────
   4. AUTO-INJECT (optional, set in Settings)
   ────────────────────────────────────────────── */

function pnpbrain_maybe_auto_inject(): void {
    $opts = (array) get_option( PNPBRAIN_WIDGET_OPTION, [] );

    if ( empty( $opts['auto_inject'] ) ) {
        return;
    }

    // Bail on admin, login, and REST requests.
    if ( is_admin() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
        return;
    }

    pnpbrain_enqueue_widget_script();
}
add_action( 'wp_enqueue_scripts', 'pnpbrain_maybe_auto_inject' );

/* ──────────────────────────────────────────────
   5. SHORTCODE  [pnpbrain_widget]
   ────────────────────────────────────────────── */

/**
 * Shortcode handler. Enqueues the script (if not already done) and outputs
 * a plain mount-point div. The JS bundle handles rendering into it.
 *
 * Accepted attributes mirror the JS WidgetConfig interface:
 *   public_token, backend_url, primary_color, bot_name, welcome_message,
 *   placeholder, assistant_avatar_mode, assistant_avatar_text,
 *   assistant_avatar_image_url, show_assistant_avatar, show_user_avatar,
 *   user_avatar_text, position, header_subtitle, chat_background_color,
 *   user_message_color, assistant_message_color, border_radius_px, show_powered_by
 *
 * Shortcode-level attributes override Settings values.
 *
 * @param array<string, string>|string $atts Shortcode attributes.
 * @return string HTML output.
 */
function pnpbrain_widget_shortcode( array|string $atts ): string {
    $opts = (array) get_option( PNPBRAIN_WIDGET_OPTION, [] );

    $atts = shortcode_atts(
        [
            'public_token'          => $opts['public_token']          ?? '',
            'backend_url'           => $opts['backend_url']           ?? '',
            'primary_color'         => $opts['primary_color']         ?? '#6366f1',
            'bot_name'              => $opts['bot_name']              ?? 'Assistant',
            'welcome_message'       => $opts['welcome_message']       ?? 'Hi! How can I help you today?',
            'placeholder'           => $opts['placeholder']           ?? 'Type a message…',
            'assistant_avatar_mode'  => $opts['assistant_avatar_mode']  ?? 'initial',
            'assistant_avatar_text'  => $opts['assistant_avatar_text']  ?? 'A',
            'assistant_avatar_image_url' => $opts['assistant_avatar_image_url'] ?? '',
            'show_assistant_avatar'  => isset( $opts['show_assistant_avatar'] ) ? (string) $opts['show_assistant_avatar'] : '1',
            'show_user_avatar'       => ! empty( $opts['show_user_avatar'] ) ? '1' : '0',
            'user_avatar_text'       => $opts['user_avatar_text']       ?? 'You',
            'position'               => $opts['position']               ?? 'bottom-right',
            'header_subtitle'        => $opts['header_subtitle']        ?? 'Online',
            'chat_background_color'  => $opts['chat_background_color']  ?? '#f9fafb',
            'user_message_color'     => $opts['user_message_color']     ?? '',
            'assistant_message_color'=> $opts['assistant_message_color'] ?? '#ffffff',
            'border_radius_px'       => isset( $opts['border_radius_px'] ) ? (string) $opts['border_radius_px'] : '16',
            'show_powered_by'        => ! empty( $opts['show_powered_by'] ) ? '1' : '0',
        ],
        $atts,
        'pnpbrain_widget'
    );

    if ( empty( $atts['public_token'] ) || empty( $atts['backend_url'] ) ) {
        if ( current_user_can( 'manage_options' ) ) {
            return '<p style="color:red;">'
                . esc_html__( 'PNpbrain Widget: Please configure Backend URL and Public Token in Settings → PNpbrain Widget.', 'pnpbrain-widget' )
                . '</p>';
        }
        return '';
    }

    // Enqueue the script (noop if already done).
    pnpbrain_enqueue_widget_script();

    // The div carries the config so the IIFE can read it, since wp_localize_script
    // may have already printed the global with different values.
    $mount_id = 'pnpbrain-widget-' . esc_attr( substr( md5( $atts['public_token'] ), 0, 10 ) );

    return sprintf(
        '<div id="%s" '
        . 'data-pnpbrain-mount="1" '
        . 'data-public-token="%s" '
        . 'data-backend-url="%s" '
        . 'data-primary-color="%s" '
        . 'data-bot-name="%s" '
        . 'data-welcome-message="%s" '
        . 'data-placeholder="%s" '
        . 'data-assistant-avatar-mode="%s" '
        . 'data-assistant-avatar-text="%s" '
        . 'data-assistant-avatar-image-url="%s" '
        . 'data-show-assistant-avatar="%s" '
        . 'data-show-user-avatar="%s" '
        . 'data-user-avatar-text="%s" '
        . 'data-position="%s" '
        . 'data-header-subtitle="%s" '
        . 'data-chat-background-color="%s" '
        . 'data-user-message-color="%s" '
        . 'data-assistant-message-color="%s" '
        . 'data-border-radius-px="%s" '
        . 'data-show-powered-by="%s">'
        . '</div>',
        esc_attr( $mount_id ),
        esc_attr( $atts['public_token'] ),
        esc_url( $atts['backend_url'] ),
        esc_attr( $atts['primary_color'] ),
        esc_attr( $atts['bot_name'] ),
        esc_attr( $atts['welcome_message'] ),
        esc_attr( $atts['placeholder'] ),
        esc_attr( $atts['assistant_avatar_mode'] ),
        esc_attr( $atts['assistant_avatar_text'] ),
        esc_url( $atts['assistant_avatar_image_url'] ),
        esc_attr( $atts['show_assistant_avatar'] ),
        esc_attr( $atts['show_user_avatar'] ),
        esc_attr( $atts['user_avatar_text'] ),
        esc_attr( $atts['position'] ),
        esc_attr( $atts['header_subtitle'] ),
        esc_attr( $atts['chat_background_color'] ),
        esc_attr( $atts['user_message_color'] ),
        esc_attr( $atts['assistant_message_color'] ),
        esc_attr( $atts['border_radius_px'] ),
        esc_attr( $atts['show_powered_by'] )
    );
}
add_shortcode( 'pnpbrain_widget', 'pnpbrain_widget_shortcode' );

/* ──────────────────────────────────────────────
   6. ACTIVATION / DEACTIVATION HOOKS
   ────────────────────────────────────────────── */

register_activation_hook( __FILE__, 'pnpbrain_on_activate' );
function pnpbrain_on_activate(): void {
    // Set sane defaults on first activation.
    if ( get_option( PNPBRAIN_WIDGET_OPTION ) === false ) {
        update_option( PNPBRAIN_WIDGET_OPTION, [
            'backend_url'     => '',
            'public_token'    => '',
            'primary_color'   => '#6366f1',
            'bot_name'        => 'Assistant',
            'welcome_message' => 'Hi! How can I help you today?',
            'auto_inject'     => false,
        ] );
    }
}

register_deactivation_hook( __FILE__, 'pnpbrain_on_deactivate' );
function pnpbrain_on_deactivate(): void {
    // Nothing to tear down — options are kept so re-activation restores settings.
}
