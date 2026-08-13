const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("@expo/config-plugins");

const POD_DECLARATIONS = [
  "  pod 'GoogleUtilities', :modular_headers => true",
  "  pod 'RecaptchaInterop', :modular_headers => true",
].join("\n");

module.exports = function withGoogleSignInModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, "Podfile");
      const podfile = fs.readFileSync(podfilePath, "utf8");

      if (!podfile.includes("pod 'GoogleUtilities', :modular_headers => true")) {
        const updatedPodfile = podfile.replace(
          /^(target '[^']+' do\n)/m,
          `$1${POD_DECLARATIONS}\n`,
        );

        if (updatedPodfile === podfile) {
          throw new Error("Unable to configure Google Sign-In modular headers in the iOS Podfile.");
        }

        fs.writeFileSync(podfilePath, updatedPodfile);
      }

      return modConfig;
    },
  ]);
};
