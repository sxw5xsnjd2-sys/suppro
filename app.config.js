require("dotenv").config();

module.exports = ({ config }) => {
  const existingPlugins = Array.isArray(config.plugins) ? config.plugins : [];
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
  const hasCameraPlugin = existingPlugins.some((plugin) =>
    Array.isArray(plugin)
      ? plugin[0] === "expo-camera"
      : plugin === "expo-camera"
  );

  const hasWebBrowserPlugin = existingPlugins.some((plugin) =>
    Array.isArray(plugin)
      ? plugin[0] === "expo-web-browser"
      : plugin === "expo-web-browser"
  );

  const plugins = [...existingPlugins];

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

  if (!hasCameraPlugin) {
    plugins.push([
      "expo-camera",
      {
        cameraPermission:
          "Allow $(PRODUCT_NAME) to access your camera to scan food barcodes and ingredients.",
        barcodeScannerEnabled: true,
        recordAudioAndroid: false,
      },
    ]);
  }

  if (!hasWebBrowserPlugin) {
    plugins.push("expo-web-browser");
  }

  return {
    ...config,
    newArchEnabled: true,
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
      goUpcApiKey:
        process.env.EXPO_PUBLIC_GO_UPC_API_KEY ??
        process.env.GO_UPC_API_KEY ??
        "",
      revenueCat: {
        appleApiKey: process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY ?? "",
        googleApiKey: process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY ?? "",
        webApiKey: process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY ?? "",
        entitlementId:
          process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? "Suppro Premium",
        yearlyIdentifier:
          process.env.EXPO_PUBLIC_REVENUECAT_YEARLY_IDENTIFIER ?? "$rc_annual",
      },
    },
  };
};
