// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      ".amplify/**",
      ".expo/**",
      "amplify_outputs.json",
      "build-*.ipa",
      "build-*.tar.gz",
      "dist/**",
      "node_modules/**",
    ],
    rules: {
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  }
]);
