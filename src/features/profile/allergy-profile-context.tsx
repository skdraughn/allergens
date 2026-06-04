import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { normalizeAllergyIds } from "@/constants/allergies";

type AllergyProfileState = {
  isLoading: boolean;
  onboardingComplete: boolean;
  selectedAllergyIds: string[];
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
  toggleAllergy: (id: string) => void;
};

const STORAGE_KEY = "allergy-app.profile.v1";

const AllergyProfileContext = createContext<AllergyProfileState | null>(null);

export function AllergyProfileProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [selectedAllergyIds, setSelectedAllergyIds] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) {
          return;
        }

        const profile = JSON.parse(stored) as {
          onboardingComplete?: boolean;
          selectedAllergyIds?: string[];
        };

        setOnboardingComplete(Boolean(profile.onboardingComplete));
        setSelectedAllergyIds(normalizeAllergyIds(profile.selectedAllergyIds ?? []));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(
    async (nextComplete: boolean, nextAllergyIds: string[]) => {
      setOnboardingComplete(nextComplete);
      const normalizedAllergyIds = normalizeAllergyIds(nextAllergyIds);

      setSelectedAllergyIds(normalizedAllergyIds);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          onboardingComplete: nextComplete,
          selectedAllergyIds: normalizedAllergyIds,
        }),
      );
    },
    [],
  );

  const completeOnboarding = useCallback(
    () => persist(true, selectedAllergyIds),
    [persist, selectedAllergyIds],
  );

  const resetOnboarding = useCallback(
    () => persist(false, selectedAllergyIds),
    [persist, selectedAllergyIds],
  );

  const toggleAllergy = useCallback((id: string) => {
    setSelectedAllergyIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : normalizeAllergyIds([...current, id]),
    );
  }, []);

  const value = useMemo(
    () => ({
      completeOnboarding,
      isLoading,
      onboardingComplete,
      resetOnboarding,
      selectedAllergyIds,
      toggleAllergy,
    }),
    [
      completeOnboarding,
      isLoading,
      onboardingComplete,
      resetOnboarding,
      selectedAllergyIds,
      toggleAllergy,
    ],
  );

  return (
    <AllergyProfileContext.Provider value={value}>
      {children}
    </AllergyProfileContext.Provider>
  );
}

export function useAllergyProfile() {
  const context = useContext(AllergyProfileContext);

  if (!context) {
    throw new Error("useAllergyProfile must be used inside AllergyProfileProvider");
  }

  return context;
}
