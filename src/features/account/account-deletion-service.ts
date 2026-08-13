import { generateClient } from "aws-amplify/data";

import type { Schema } from "../../../amplify/data/resource";

const accountClient = generateClient<Schema>();

export async function deleteMyAccount() {
  const result = await accountClient.mutations.deleteMyAccount();

  if (result.errors?.length || result.data !== true) {
    throw new Error(result.errors?.[0]?.message ?? "Your account could not be deleted.");
  }
}
