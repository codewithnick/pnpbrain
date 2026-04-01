=== GCFIS Widget ===
Contributors: gcfis
Tags: chat, ai, customer-support, widget, chatbot
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Embed the GCFIS AI chat widget on any WordPress site with zero configuration. Connect to your own self-hosted backend.

== Description ==

GCFIS Widget integrates the General Customer Facing Intelligent System directly into your WordPress site.

**Features:**
* One-line embed via shortcode `[gcfis_widget]`
* Auto-inject on all pages via Settings toggle
* Settings page to configure Backend URL and Business ID
* Respects WordPress GDPR / consent flows via filter hooks
* Minified JS bundle included — no CDN dependency
* Works with any WordPress theme

== Installation ==

1. Upload the `gcfis-widget` folder to `/wp-content/plugins/`
2. Activate the plugin through the **Plugins** menu in WordPress
3. Go to **Settings → GCFIS Widget** and enter your Backend URL and Business ID
4. Either enable **Auto-inject on all pages** or use the shortcode `[gcfis_widget]`

== Frequently Asked Questions ==

= Where do I get a Business ID? =
Log in to your GCFIS Admin dashboard and copy your Business ID from the API settings.

= Can I use the shortcode inside a page builder? =
Yes. `[gcfis_widget]` works in any shortcode-compatible block, Elementor, Divi, WPBakery, etc.

= Does the widget load any external scripts? =
No. The JS bundle is fully self-contained and served from your WordPress install.

== Changelog ==

= 1.0.0 =
* Initial release

== Upgrade Notice ==

= 1.0.0 =
Initial release.
