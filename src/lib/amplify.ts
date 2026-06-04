import "react-native-get-random-values";
import "react-native-url-polyfill/auto";

import { Amplify, type ResourcesConfig } from "aws-amplify";

import amplifyOutputs from "../../amplify_outputs.json";

const outputs = amplifyOutputs as Record<string, unknown>;

export const isAmplifyConfigured = Object.keys(outputs).length > 0;

if (isAmplifyConfigured) {
  Amplify.configure(amplifyOutputs as ResourcesConfig);
}
