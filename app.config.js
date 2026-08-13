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

module.exports = ({ config }) => {
  const expo = config;
  const omitAssociatedDomains =
    process.env.MYSAFEMENU_LOCAL_IOS_BUILD_WITHOUT_ASSOCIATED_DOMAINS === "1";
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
  const withGoogleUrlType =
    googleIosReversedClientId && !hasGoogleScheme
      ? [
          ...existingUrlTypes,
          {
            CFBundleURLSchemes: [googleIosReversedClientId],
          },
        ]
      : existingUrlTypes;
  const appScheme = String(expo.scheme || "").trim();
  const hasAppScheme = withGoogleUrlType.some((entry) =>
    Array.isArray(entry?.CFBundleURLSchemes)
      ? entry.CFBundleURLSchemes.includes(appScheme)
      : false,
  );
  const mergedUrlTypes =
    appScheme && !hasAppScheme
      ? [...withGoogleUrlType, { CFBundleURLSchemes: [appScheme] }]
      : withGoogleUrlType;
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
  plugins.push("./plugins/with-google-signin-modular-headers");

  return {
    ...expo,
    extra: {
      ...expo.extra,
      socialAuthEndpoint: process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENDPOINT,
    },
    ios: {
      ...expo.ios,
      associatedDomains: omitAssociatedDomains ? undefined : expo.ios?.associatedDomains,
      infoPlist: {
        ...existingInfoPlist,
        CFBundleURLTypes: mergedUrlTypes,
      },
      usesAppleSignIn: true,
    },
    plugins,
  };
};
