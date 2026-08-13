# Embedded asset manifests

These manifests are extracted from the released store binaries and are used by
`ota:publish` with Expo's `assets:verify` command. Publishing fails before any
upload when an exported update references an asset that is neither selected for
the OTA nor embedded in the corresponding binary.

- `ios.json`: extract from the first signed MySafeMenu binary containing the
  self-hosted update configuration.
- `android.json`: extract from the first signed MySafeMenu binary containing
  the self-hosted update configuration.

Replace the matching manifest whenever a new store binary becomes the minimum
supported binary. Do not hand-edit these generated JSON files.
