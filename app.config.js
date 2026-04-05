require("dotenv").config();

module.exports = ({ config }) => {
  const existingPlugins = Array.isArray(config.plugins) ? config.plugins : [];
  const hasDateTimePickerPlugin = existingPlugins.some((plugin) =>
    Array.isArray(plugin)
      ? plugin[0] === "@react-native-community/datetimepicker"
      : plugin === "@react-native-community/datetimepicker"
  );
  const hasAppleHealthPlugin = existingPlugins.some((plugin) =>
    Array.isArray(plugin)
      ? plugin[0] === "react-native-health"
      : plugin === "react-native-health"
  );
  const hasAppleAuthenticationPlugin = existingPlugins.some((plugin) =>
    Array.isArray(plugin)
      ? plugin[0] === "expo-apple-authentication"
      : plugin === "expo-apple-authentication"
  );

  const plugins = [...existingPlugins];

  if (!hasDateTimePickerPlugin) {
    plugins.push("@react-native-community/datetimepicker");
  }

  if (!hasAppleHealthPlugin) {
    plugins.push([
      "react-native-health",
      {
        healthSharePermission:
          "Allow $(PRODUCT_NAME) to read Apple Health data so your metrics stay up to date in Suppro.",
        healthUpdatePermission:
          "Allow $(PRODUCT_NAME) to access Apple Health integration settings.",
      },
    ]);
  }

  if (!hasAppleAuthenticationPlugin) {
    plugins.push("expo-apple-authentication");
  }

  return {
    ...config,
    ios: {
      ...config.ios,
      usesAppleSignIn: true,
      infoPlist: {
        ...(config.ios?.infoPlist ?? {}),
        CFBundleAllowMixedLocalizations: true,
        NSHealthShareUsageDescription:
          "Allow $(PRODUCT_NAME) to read Apple Health data so your metrics stay up to date in Suppro.",
        NSHealthUpdateUsageDescription:
          "Allow $(PRODUCT_NAME) to access Apple Health integration settings.",
      },
      entitlements: {
        ...(config.ios?.entitlements ?? {}),
        "com.apple.developer.healthkit": true,
      },
    },
    plugins,
    extra: {
      ...config.extra,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    },
  };
};
