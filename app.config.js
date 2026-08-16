const fs = require("node:fs");
const path = require("node:path");
const plist = require("@expo/plist").default;

const assertFirebaseAppIdentity = ({ androidFile, androidPackage, iosBundleId, iosFile }) => {
  let iosProjectId = "";
  let androidProjectId = "";

  if (fs.existsSync(iosFile)) {
    const parsed = plist.parse(fs.readFileSync(iosFile, "utf8"));
    if (parsed.BUNDLE_ID !== iosBundleId) {
      throw new Error(
        `Firebase iOS config is registered for ${parsed.BUNDLE_ID || "an unknown app"}; expected ${iosBundleId}.`,
      );
    }
    iosProjectId = String(parsed.PROJECT_ID || "");
  }

  if (fs.existsSync(androidFile)) {
    const parsed = JSON.parse(fs.readFileSync(androidFile, "utf8"));
    const registeredPackages = (parsed.client || [])
      .map((client) => client?.client_info?.android_client_info?.package_name)
      .filter(Boolean);
    if (!registeredPackages.includes(androidPackage)) {
      throw new Error(
        `Firebase Android config is not registered for ${androidPackage}.`,
      );
    }
    androidProjectId = String(parsed.project_info?.project_id || "");
  }

  if (iosProjectId && androidProjectId && iosProjectId !== androidProjectId) {
    throw new Error("Firebase iOS and Android configuration files belong to different projects.");
  }
};

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
  const firebaseIosFile =
    process.env.GOOGLE_SERVICES_PLIST || path.join(__dirname, "GoogleService-Info.plist");
  const firebaseAndroidFile =
    process.env.GOOGLE_SERVICES_JSON || path.join(__dirname, "google-services.json");
  const hasFirebaseIos = fs.existsSync(firebaseIosFile);
  const hasFirebaseAndroid = fs.existsSync(firebaseAndroidFile);
  const hasFirebaseCredentials = hasFirebaseIos || hasFirebaseAndroid;
  if (hasFirebaseCredentials) {
    assertFirebaseAppIdentity({
      androidFile: firebaseAndroidFile,
      androidPackage: expo.android?.package,
      iosBundleId: expo.ios?.bundleIdentifier,
      iosFile: firebaseIosFile,
    });
  }
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

  if (hasFirebaseCredentials) {
    plugins.push([
      "@react-native-firebase/app",
      { ios: { disableSPM: true } },
    ]);
    plugins.push([
      "@react-native-firebase/analytics",
      { ios: { withoutAdIdSupport: true } },
    ]);
    plugins.push("@react-native-firebase/crashlytics");
    plugins.push("@react-native-firebase/perf");
    plugins.push([
      "expo-build-properties",
      { ios: { useFrameworks: "static" } },
    ]);
  }

  return {
    ...expo,
    extra: {
      ...expo.extra,
      firebaseConfigured: hasFirebaseIos && hasFirebaseAndroid,
      firebaseConfiguredPlatforms: {
        android: hasFirebaseAndroid,
        ios: hasFirebaseIos,
      },
      restaurantCatalogBootstrapPath:
        process.env.EXPO_PUBLIC_RESTAURANT_CATALOG_BOOTSTRAP_PATH ||
        "restaurant-data/catalogs/v1-02ad06da3a744d76c659/summary.json",
      socialAuthEndpoint: process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENDPOINT,
    },
    android: {
      ...expo.android,
      googleServicesFile: hasFirebaseAndroid ? firebaseAndroidFile : undefined,
    },
    ios: {
      ...expo.ios,
      associatedDomains: omitAssociatedDomains ? undefined : expo.ios?.associatedDomains,
      googleServicesFile: hasFirebaseIos ? firebaseIosFile : undefined,
      infoPlist: {
        ...existingInfoPlist,
        CFBundleURLTypes: mergedUrlTypes,
      },
      usesAppleSignIn: true,
    },
    plugins,
  };
};
