import { Hub } from "aws-amplify/utils";
import { getCurrentUser } from "aws-amplify/auth";
import { usePathname } from "expo-router";
import { type PropsWithChildren, useEffect, useRef } from "react";

import { bucketDuration } from "./schema";
import { telemetry, type TelemetryTrace } from "./telemetry";

const startupBeganAt = Date.now();

export function TelemetryProvider({
  children,
  startupReady,
}: PropsWithChildren<{ startupReady: boolean }>) {
  const pathname = usePathname();
  const startupTrace = useRef<TelemetryTrace<"startup_to_interactive"> | null>(null);
  const startupReported = useRef(false);

  useEffect(() => {
    startupTrace.current = telemetry.startTrace("startup_to_interactive");
    void telemetry.initialize().catch((error) => {
      telemetry.track("startup_failed", { error_code: "telemetry_initialization" });
      telemetry.recordError(error, "telemetry_initialization", {
        errorCode: "telemetry_initialization",
      });
    });

    const syncIdentity = async () => {
      try {
        const user = await getCurrentUser();
        await telemetry.setSignedInUserId(user.userId);
      } catch {
        await telemetry.clearIdentity();
      }
    };
    void syncIdentity();

    const cancelHubListener = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signedOut") {
        void telemetry.clearIdentity();
        return;
      }
      if (payload.event === "signedIn" || payload.event === "tokenRefresh") {
        void syncIdentity();
      }
    });

    return cancelHubListener;
  }, []);

  useEffect(() => {
    telemetry.screen(pathname);
  }, [pathname]);

  useEffect(() => {
    if (!startupReady || startupReported.current) return;
    startupReported.current = true;
    const duration = Date.now() - startupBeganAt;
    startupTrace.current?.stop({
      metrics: { duration_ms: duration },
      outcome: "success",
    });
    telemetry.track("startup_completed", {
      duration_bucket: bucketDuration(duration),
    });
  }, [startupReady]);

  return children;
}
