export default {
  webpack(config) {
    config.resolve.extensionAlias = {...config.resolve.extensionAlias, ".js": [".js", ".ts", ".tsx"]};
    return config;
  },
  eslint: {
    ignoreDuringBuilds: true
  }
};
