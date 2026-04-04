<?php
/**
 * Admin settings page template for PNpbrain Widget.
 * Included by pnpbrain_render_settings_page() in pnpbrain-widget.php.
 * All variables are already declared in that function scope.
 *
 * @var string  $backend_url
 * @var string  $public_token
 * @var string  $primary_color
 * @var string  $bot_name
 * @var string  $welcome_msg
 * @var bool    $auto_inject
 */

defined( 'ABSPATH' ) || exit;
?>
<div class="wrap pnpbrain-settings">
    <h1><?php esc_html_e( 'PNpbrain Widget Settings', 'pnpbrain-widget' ); ?></h1>

    <?php settings_errors( PNPBRAIN_WIDGET_OPTION ); ?>

    <form method="post" action="options.php">
        <?php settings_fields( 'pnpbrain_widget_group' ); ?>

        <table class="form-table" role="presentation">

            <tr>
                <th scope="row">
                    <label for="pnpbrain_backend_url">
                        <?php esc_html_e( 'Backend URL', 'pnpbrain-widget' ); ?>
                    </label>
                </th>
                <td>
                    <input
                        type="url"
                        id="pnpbrain_backend_url"
                        name="<?php echo esc_attr( PNPBRAIN_WIDGET_OPTION ); ?>[backend_url]"
                        value="<?php echo esc_attr( $backend_url ); ?>"
                        class="regular-text"
                        placeholder="https://api.yourdomain.com"
                        autocomplete="off"
                    />
                    <p class="description">
                        <?php esc_html_e( 'The URL of your self-hosted PNpbrain backend (apps/backend). Must begin with https://.', 'pnpbrain-widget' ); ?>
                    </p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="pnpbrain_public_token">
                        <?php esc_html_e( 'Public Token', 'pnpbrain-widget' ); ?>
                    </label>
                </th>
                <td>
                    <input
                        type="text"
                        id="pnpbrain_public_token"
                        name="<?php echo esc_attr( PNPBRAIN_WIDGET_OPTION ); ?>[public_token]"
                        value="<?php echo esc_attr( $public_token ); ?>"
                        class="regular-text"
                        placeholder="pnpbrain_public.xxxxx.yyyyy"
                        autocomplete="off"
                    />
                    <p class="description">
                        <?php esc_html_e( 'Use the public chat token from your PNpbrain Admin dashboard.', 'pnpbrain-widget' ); ?>
                    </p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="pnpbrain_bot_name">
                        <?php esc_html_e( 'Bot Name', 'pnpbrain-widget' ); ?>
                    </label>
                </th>
                <td>
                    <input
                        type="text"
                        id="pnpbrain_bot_name"
                        name="<?php echo esc_attr( PNPBRAIN_WIDGET_OPTION ); ?>[bot_name]"
                        value="<?php echo esc_attr( $bot_name ); ?>"
                        class="regular-text"
                        maxlength="60"
                    />
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="pnpbrain_welcome_message">
                        <?php esc_html_e( 'Welcome Message', 'pnpbrain-widget' ); ?>
                    </label>
                </th>
                <td>
                    <input
                        type="text"
                        id="pnpbrain_welcome_message"
                        name="<?php echo esc_attr( PNPBRAIN_WIDGET_OPTION ); ?>[welcome_message]"
                        value="<?php echo esc_attr( $welcome_msg ); ?>"
                        class="large-text"
                        maxlength="200"
                    />
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="pnpbrain_primary_color">
                        <?php esc_html_e( 'Primary Colour', 'pnpbrain-widget' ); ?>
                    </label>
                </th>
                <td>
                    <input
                        type="color"
                        id="pnpbrain_primary_color"
                        name="<?php echo esc_attr( PNPBRAIN_WIDGET_OPTION ); ?>[primary_color]"
                        value="<?php echo esc_attr( $primary_color ); ?>"
                    />
                    <p class="description">
                        <?php esc_html_e( 'Accent colour for the chat button and header.', 'pnpbrain-widget' ); ?>
                    </p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <?php esc_html_e( 'Auto-inject on all pages', 'pnpbrain-widget' ); ?>
                </th>
                <td>
                    <label>
                        <input
                            type="checkbox"
                            id="pnpbrain_auto_inject"
                            name="<?php echo esc_attr( PNPBRAIN_WIDGET_OPTION ); ?>[auto_inject]"
                            value="1"
                            <?php checked( $auto_inject ); ?>
                        />
                        <?php esc_html_e( 'Show the chat widget on every page automatically.', 'pnpbrain-widget' ); ?>
                    </label>
                    <p class="description">
                        <?php esc_html_e( 'Leave unchecked to embed manually using the shortcode [pnpbrain_widget].', 'pnpbrain-widget' ); ?>
                    </p>
                </td>
            </tr>

        </table>

        <?php submit_button( __( 'Save Settings', 'pnpbrain-widget' ) ); ?>
    </form>

    <hr />

    <h2><?php esc_html_e( 'Manual Embed', 'pnpbrain-widget' ); ?></h2>
    <p>
        <?php esc_html_e( 'Place this shortcode on any page or post:', 'pnpbrain-widget' ); ?>
        <code>[pnpbrain_widget]</code>
    </p>
    <p>
        <?php esc_html_e( 'Or override settings per-instance:', 'pnpbrain-widget' ); ?>
        <code>[pnpbrain_widget public_token="your-token" backend_url="https://api.example.com" bot_name="Aria"]</code>
    </p>

    <h2><?php esc_html_e( 'Connection Status', 'pnpbrain-widget' ); ?></h2>
    <?php if ( empty( $backend_url ) || empty( $public_token ) ) : ?>
        <p class="pnpbrain-status pnpbrain-status--warn">
            &#9888; <?php esc_html_e( 'Not configured. Enter your Backend URL and Public Token above.', 'pnpbrain-widget' ); ?>
        </p>
    <?php else : ?>
        <p class="pnpbrain-status pnpbrain-status--ok">
            &#10003; <?php
                printf(
                    /* translators: %s: backend URL */
                    esc_html__( 'Connected to %s', 'pnpbrain-widget' ),
                    '<strong>' . esc_html( $backend_url ) . '</strong>'
                );
            ?>
        </p>
    <?php endif; ?>
</div>

<style>
.pnpbrain-settings .pnpbrain-status { padding: .6em 1em; border-radius: 4px; display: inline-block; }
.pnpbrain-settings .pnpbrain-status--ok   { background: #d1fae5; color: #065f46; }
.pnpbrain-settings .pnpbrain-status--warn { background: #fef9c3; color: #713f12; }
</style>
