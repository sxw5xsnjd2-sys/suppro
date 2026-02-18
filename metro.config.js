const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const { resolve } = require("metro-resolver");

module.exports = (() => {
  const config = getDefaultConfig(__dirname);

  config.transformer.babelTransformerPath = require.resolve(
    "react-native-svg-transformer"
  );

  config.resolver.assetExts = config.resolver.assetExts.filter(
    (ext) => ext !== "svg"
  );
  config.resolver.sourceExts.push("svg");
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName.startsWith("@/")) {
      const appRelative = moduleName.slice(2);
      return resolve(context, path.resolve(__dirname, appRelative), platform);
    }
    if (moduleName.startsWith("@src/")) {
      const srcRelative = moduleName.slice("@src/".length);
      return resolve(
        context,
        path.resolve(__dirname, "src", srcRelative),
        platform
      );
    }
    return resolve(context, moduleName, platform);
  };

  return config;
})();
