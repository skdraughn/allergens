const fs = require("node:fs");
const path = require("node:path");

const { withDangerousMod } = require("@expo/config-plugins");

module.exports = function withIosModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const podfilePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "Podfile",
      );
      const podfile = fs.readFileSync(podfilePath, "utf8");

      if (!podfile.includes("use_modular_headers!")) {
        const updatedPodfile = podfile.replace(
          /^(platform :ios[^\n]*\n)/m,
          "$1use_modular_headers!\n",
        );

        if (updatedPodfile === podfile) {
          throw new Error("Could not add use_modular_headers! to the iOS Podfile.");
        }

        fs.writeFileSync(podfilePath, updatedPodfile);
      }

      return modConfig;
    },
  ]);
};
