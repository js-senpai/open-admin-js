const nodeExternals = require("webpack-node-externals");

/** @param {import("webpack").Configuration} options */
module.exports = function configureWebpack(options) {
  return {
    ...options,
    resolve: {...options.resolve, extensionAlias: {...options.resolve?.extensionAlias, ".js": [".js", ".ts", ".tsx"]}},
    externals: [
      nodeExternals({
        allowlist: [/^@openadminjs\//, /^openid-client(?:\/|$)/, /^oauth4webapi(?:\/|$)/, /^jose(?:\/|$)/],
      }),
    ],
  };
};
