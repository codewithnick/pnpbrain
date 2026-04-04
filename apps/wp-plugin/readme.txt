=== PNpbrain Widget ===
Contributors: pnpbrain
Tags: chat, ai, customer-support, widget, chatbot
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Embed the PNpbrain AI chat widget on any WordPress site with zero configuration. Connect to your own self-hosted backend.

== Description ==

PNpbrain Widget integrates the General Customer Facing Intelligent System directly into your WordPress site.

**Features:**
* One-line embed via shortcode `[pnpbrain_widget]`
* Auto-inject on all pages via Settings toggle
* Settings page to configure Backend URL and Public Token
* Respects WordPress GDPR / consent flows via filter hooks
* Minified JS bundle included — no CDN dependency
* Works with any WordPress theme

== Installation ==

1. Upload the `pnpbrain-widget` folder to `/wp-content/plugins/`
2. Activate the plugin through the **Plugins** menu in WordPress
3. Go to **Settings → PNpbrain Widget** and enter your Backend URL and Public Token
4. Either enable **Auto-inject on all pages** or use the shortcode `[pnpbrain_widget]`

== Frequently Asked Questions ==

= Where do I get a Public Token? =
Log in to your PNpbrain Admin dashboard and copy your public chat token from the API settings.

= Can I use the shortcode inside a page builder? =
Yes. `[pnpbrain_widget]` works in any shortcode-compatible block, Elementor, Divi, WPBakery, etc.

= Does the widget load any external scripts? =
No. The JS bundle is fully self-contained and served from your WordPress install.

== Changelog ==

= 1.0.0 =
* Initial release

== Upgrade Notice ==

= 1.0.0 =
Initial release.
