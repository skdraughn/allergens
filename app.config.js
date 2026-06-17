const baseConfig = require("./app.json");

const deriveReversedGoogleIosScheme = (iosClientId) => {
  const normalized = String(iosClientId || "").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.startsWith("com.googleusercontent.apps.")) {
    return normalized;
  }
  if (normalized.endsWith(".apps.googleusercontent.com")) {
    const prefix = normalized.slice(0, -".apps.googleusercontent.com".length);
    return `com.googleusercontent.apps.${prefix}`;
  }
  return "";
};

module.exports = () => {
  const expo = baseConfig.expo;
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "";
  const googleIosReversedClientId =
    process.env.EXPO_PUBLIC_GOOGLE_IOS_REVERSED_CLIENT_ID ||
    deriveReversedGoogleIosScheme(googleIosClientId);
  const existingInfoPlist = expo.ios?.infoPlist || {};
  const existingUrlTypes = Array.isArray(existingInfoPlist.CFBundleURLTypes)
    ? existingInfoPlist.CFBundleURLTypes
    : [];
  const hasGoogleScheme = existingUrlTypes.some((entry) =>
    Array.isArray(entry?.CFBundleURLSchemes)
      ? entry.CFBundleURLSchemes.includes(googleIosReversedClientId)
      : false,
  );
  const mergedUrlTypes =
    googleIosReversedClientId && !hasGoogleScheme
      ? [
          ...existingUrlTypes,
          {
            CFBundleURLSchemes: [googleIosReversedClientId],
          },
        ]
      : existingUrlTypes;
  const plugins = (expo.plugins || []).filter((plugin) => {
    if (typeof plugin === "string") {
      return plugin !== "@react-native-google-signin/google-signin" && plugin !== "expo-apple-authentication";
    }

    if (Array.isArray(plugin)) {
      return plugin[0] !== "@react-native-google-signin/google-signin" && plugin[0] !== "expo-apple-authentication";
    }

    return true;
  });

  plugins.push(
    googleIosReversedClientId
      ? [
          "@react-native-google-signin/google-signin",
          {
            iosUrlScheme: googleIosReversedClientId,
          },
        ]
      : "@react-native-google-signin/google-signin",
  );
  plugins.push("expo-apple-authentication");

  return {
    ...expo,
    extra: {
      ...expo.extra,
      socialAuthEndpoint: process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENDPOINT,
    },
    ios: {
      ...expo.ios,
      infoPlist: {
        ...existingInfoPlist,
        CFBundleURLTypes: mergedUrlTypes,
      },
      usesAppleSignIn: true,
    },
    plugins,
  };
};
