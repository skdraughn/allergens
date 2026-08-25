import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

const activeCatalogPathStorageKey = "mysafemenu.restaurant-catalog.active-path.v1";
export const restaurantCatalogRemoteConfigKey = "restaurant_catalog_path";
const versionedCatalogPathPattern =
  /^restaurant-data\/catalogs\/([a-zA-Z0-9._-]+)\/(summary\.json|restaurants\/([a-zA-Z0-9._-]+)\.json)$/;

type RemoteConfigModule = typeof import("@react-native-firebase/remote-config");

let remoteConfigModule: RemoteConfigModule | null | undefined;
let remoteConfigInitialization: Promise<ReturnType<RemoteConfigModule["getRemoteConfig"]> | null> | null = null;

export function getCatalogBootstrapPath() {
  const configured = Constants.expoConfig?.extra?.restaurantCatalogBootstrapPath;
  const path = typeof configured === "string" ? configured.trim() : "";

  if (!isVersionedCatalogSummaryPath(path)) {
    throw new Error("The restaurant catalog bootstrap path is invalid.");
  }

  return path;
}

export async function getCachedActiveCatalogPath() {
  const path = (await AsyncStorage.getItem(activeCatalogPathStorageKey))?.trim() ?? "";
  return isVersionedCatalogSummaryPath(path) ? path : null;
}

export async function getAuthoritativeCatalogPath() {
  const cachedPath = await getCachedActiveCatalogPath();
  const config = await initializeRemoteConfig();

  if (!config || !remoteConfigModule) {
    // A development client without Firebase must follow the current bundle's
    // immutable bootstrap path. Reusing an older active-path cache here traps
    // the client on a catalog that a newer bundle has explicitly replaced.
    return getCatalogBootstrapPath();
  }

  try {
    await remoteConfigModule.fetchAndActivate(config);
  } catch {
    return cachedPath ?? getCatalogBootstrapPath();
  }

  const path = remoteConfigModule
    .getString(config, restaurantCatalogRemoteConfigKey)
    .trim();
  return isVersionedCatalogSummaryPath(path)
    ? path
    : cachedPath ?? getCatalogBootstrapPath();
}

export async function subscribeToAuthoritativeCatalogPath(
  onPathChanged: (path: string) => void,
) {
  const config = await initializeRemoteConfig();

  if (!config || !remoteConfigModule) {
    return () => undefined;
  }

  return remoteConfigModule.onConfigUpdate(config, {
    complete: () => undefined,
    error: () => undefined,
    next: (update) => {
      if (!update.getUpdatedKeys().has(restaurantCatalogRemoteConfigKey)) return;

      void remoteConfigModule?.activate(config).then(() => {
        const path = remoteConfigModule
          ?.getString(config, restaurantCatalogRemoteConfigKey)
          .trim();
        if (path && isVersionedCatalogSummaryPath(path)) {
          onPathChanged(path);
        }
      });
    },
  });
}

export async function readImmutableCatalogFile(path: string) {
  const file = fileForVersionedCatalogPath(path);
  return file.exists ? file.text() : null;
}

export async function writeImmutableCatalogFile(path: string, contents: string) {
  const destination = fileForVersionedCatalogPath(path);
  const directory = destination.parentDirectory;
  directory.create({ idempotent: true, intermediates: true });

  const temporary = new File(directory, `${destination.name}.pending`);
  temporary.create({ intermediates: true, overwrite: true });
  temporary.write(contents);
  await temporary.move(destination, { overwrite: true });
}

export async function markCatalogActive(path: string) {
  if (!isVersionedCatalogSummaryPath(path)) {
    throw new Error("Cannot activate an invalid restaurant catalog path.");
  }
  await AsyncStorage.setItem(activeCatalogPathStorageKey, path);
}

export function isVersionedCatalogSummaryPath(path: string) {
  const match = versionedCatalogPathPattern.exec(path);
  return Boolean(match && match[2] === "summary.json");
}

export function isVersionedCatalogObjectPath(path: string) {
  return versionedCatalogPathPattern.test(path);
}

async function initializeRemoteConfig() {
  if (remoteConfigInitialization) return remoteConfigInitialization;

  remoteConfigInitialization = (async () => {
    const configuredPlatforms = Constants.expoConfig?.extra?.firebaseConfiguredPlatforms as
      | Partial<Record<"android" | "ios", boolean>>
      | undefined;
    const configured =
      (Platform.OS === "android" || Platform.OS === "ios") &&
      Boolean(configuredPlatforms?.[Platform.OS]);

    if (!configured) return null;

    try {
      // Dynamic loading keeps older development clients on the bootstrap path
      // until they are rebuilt with the Remote Config native module.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      remoteConfigModule = require("@react-native-firebase/remote-config") as RemoteConfigModule;
      const config = remoteConfigModule.getRemoteConfig();
      config.defaultConfig = {
        [restaurantCatalogRemoteConfigKey]: getCatalogBootstrapPath(),
      };
      config.settings = {
        fetchTimeoutMillis: 10_000,
        minimumFetchIntervalMillis: 0,
      };
      await remoteConfigModule.ensureInitialized(config);
      return config;
    } catch {
      remoteConfigModule = null;
      return null;
    }
  })();

  return remoteConfigInitialization;
}

function fileForVersionedCatalogPath(path: string) {
  const match = versionedCatalogPathPattern.exec(path);
  if (!match) throw new Error("Invalid versioned restaurant catalog path.");

  const [, version, relativePath] = match;
  return new File(new Directory(Paths.document, "restaurant-catalogs", version), relativePath);
}
