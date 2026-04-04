const { version: widgetVersion } = require('../widget/package.json');

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_PNPBRAIN_WIDGET_VERSION:
      process.env.NEXT_PUBLIC_PNPBRAIN_WIDGET_VERSION ?? widgetVersion,
  },
};

module.exports = nextConfig;
