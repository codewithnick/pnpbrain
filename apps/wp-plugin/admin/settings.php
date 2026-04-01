<?php
/**
 * Admin settings page template for GCFIS Widget.
 * Included by gcfis_render_settings_page() in gcfis-widget.php.
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
<div class="wrap gcfis-settings">
    <h1><?php esc_html_e( 'GCFIS Widget Settings', 'gcfis-widget' ); ?></h1>

    <?php settings_errors( GCFIS_WIDGET_OPTION ); ?>

    <form method="post" action="options.php">
        <?php settings_fields( 'gcfis_widget_group' ); ?>

        <table class="form-table" role="presentation">

            <tr>
                <th scope="row">
                    <label for="gcfis_backend_url">
                        <?php esc_html_e( 'Backend URL', 'gcfis-widget' ); ?>
                    </label>
                </th>
                <td>
                    <input
                        type="url"
                        id="gcfis_backend_url"
                        name="<?php echo esc_attr( GCFIS_WIDGET_OPTION ); ?>[backend_url]"
                        value="<?php echo esc_attr( $backend_url ); ?>"
                        class="regular-text"
                        placeholder="https://api.yourdomain.com"
                        autocomplete="off"
                    />
                    <p class="description">
                        <?php esc_html_e( 'The URL of your self-hosted GCFIS backend (apps/backend). Must begin with https://.', 'gcfis-widget' ); ?>
                    </p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="gcfis_public_token">
                        <?php esc_html_e( 'Public Token', 'gcfis-widget' ); ?>
                    </label>
                </th>
                <td>
                    <input
                        type="text"
                        id="gcfis_public_token"
                        name="<?php echo esc_attr( GCFIS_WIDGET_OPTION ); ?>[public_token]"
                        value="<?php echo esc_attr( $public_token ); ?>"
                        class="regular-text"
                        placeholder="gcfis_public.xxxxx.yyyyy"
                        autocomplete="off"
                    />
                    <p class="description">
                        <?php esc_html_e( 'Use the public chat token from your GCFIS Admin dashboard.', 'gcfis-widget' ); ?>
                    </p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="gcfis_bot_name">
                        <?php esc_html_e( 'Bot Name', 'gcfis-widget' ); ?>
                    </label>
                </th>
                <td>
                    <input
                        type="text"
                        id="gcfis_bot_name"
                        name="<?php echo esc_attr( GCFIS_WIDGET_OPTION ); ?>[bot_name]"
                        value="<?php echo esc_attr( $bot_name ); ?>"
                        class="regular-text"
                        maxlength="60"
                    />
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="gcfis_welcome_message">
                        <?php esc_html_e( 'Welcome Message', 'gcfis-widget' ); ?>
                    </label>
                </th>
                <td>
                    <input
                        type="text"
                        id="gcfis_welcome_message"
                        name="<?php echo esc_attr( GCFIS_WIDGET_OPTION ); ?>[welcome_message]"
                        value="<?php echo esc_attr( $welcome_msg ); ?>"
                        class="large-text"
                        maxlength="200"
                    />
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="gcfis_primary_color">
                        <?php esc_html_e( 'Primary Colour', 'gcfis-widget' ); ?>
                    </label>
                </th>
                <td>
                    <input
                        type="color"
                        id="gcfis_primary_color"
                        name="<?php echo esc_attr( GCFIS_WIDGET_OPTION ); ?>[primary_color]"
                        value="<?php echo esc_attr( $primary_color ); ?>"
                    />
                    <p class="description">
                        <?php esc_html_e( 'Accent colour for the chat button and header.', 'gcfis-widget' ); ?>
                    </p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <?php esc_html_e( 'Auto-inject on all pages', 'gcfis-widget' ); ?>
                </th>
                <td>
                    <label>
                        <input
                            type="checkbox"
                            id="gcfis_auto_inject"
                            name="<?php echo esc_attr( GCFIS_WIDGET_OPTION ); ?>[auto_inject]"
                            value="1"
                            <?php checked( $auto_inject ); ?>
                        />
                        <?php esc_html_e( 'Show the chat widget on every page automatically.', 'gcfis-widget' ); ?>
                    </label>
                    <p class="description">
                        <?php esc_html_e( 'Leave unchecked to embed manually using the shortcode [gcfis_widget].', 'gcfis-widget' ); ?>
                    </p>
                </td>
            </tr>

        </table>

        <?php submit_button( __( 'Save Settings', 'gcfis-widget' ) ); ?>
    </form>

    <hr />

    <h2><?php esc_html_e( 'Manual Embed', 'gcfis-widget' ); ?></h2>
    <p>
        <?php esc_html_e( 'Place this shortcode on any page or post:', 'gcfis-widget' ); ?>
        <code>[gcfis_widget]</code>
    </p>
    <p>
        <?php esc_html_e( 'Or override settings per-instance:', 'gcfis-widget' ); ?>
        <code>[gcfis_widget public_token="your-token" backend_url="https://api.example.com" bot_name="Aria"]</code>
    </p>

    <h2><?php esc_html_e( 'Connection Status', 'gcfis-widget' ); ?></h2>
    <?php if ( empty( $backend_url ) || empty( $public_token ) ) : ?>
        <p class="gcfis-status gcfis-status--warn">
            &#9888; <?php esc_html_e( 'Not configured. Enter your Backend URL and Public Token above.', 'gcfis-widget' ); ?>
        </p>
    <?php else : ?>
        <p class="gcfis-status gcfis-status--ok">
            &#10003; <?php
                printf(
                    /* translators: %s: backend URL */
                    esc_html__( 'Connected to %s', 'gcfis-widget' ),
                    '<strong>' . esc_html( $backend_url ) . '</strong>'
                );
            ?>
        </p>
    <?php endif; ?>
</div>

<style>
.gcfis-settings .gcfis-status { padding: .6em 1em; border-radius: 4px; display: inline-block; }
.gcfis-settings .gcfis-status--ok   { background: #d1fae5; color: #065f46; }
.gcfis-settings .gcfis-status--warn { background: #fef9c3; color: #713f12; }
</style>
