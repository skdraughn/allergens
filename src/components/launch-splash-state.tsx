import { createContext, type ReactNode, useContext } from "react";

const LaunchSplashCompleteContext = createContext(true);

export function LaunchSplashCompleteProvider({
  children,
  isComplete,
}: {
  children: ReactNode;
  isComplete: boolean;
}) {
  return (
    <LaunchSplashCompleteContext.Provider value={isComplete}>
      {children}
    </LaunchSplashCompleteContext.Provider>
  );
}

export function useLaunchSplashComplete() {
  return useContext(LaunchSplashCompleteContext);
}
