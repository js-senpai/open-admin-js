const nodeExternals = require("webpack-node-externals");

/** @param {import("webpack").Configuration} options */
module.exports = function configureWebpack(options) {
  return {
    ...options,
    externals: [
      nodeExternals({
        allowlist: [/^@openadminjs\//, /^openid-client(?:\/|$)/, /^oauth4webapi(?:\/|$)/, /^jose(?:\/|$)/],
      }),
    ],
  };
};
