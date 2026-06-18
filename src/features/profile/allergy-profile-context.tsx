import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { normalizeAllergyIds } from "@/constants/allergies";
import { isAmplifyConfigured } from "@/lib/amplify";

import type { Schema } from "../../../amplify/data/resource";

type AllergyProfileState = {
  activeProfileId: string;
  createProfile: () => Promise<AllergyProfile>;
  isLoading: boolean;
  onboardingComplete: boolean;
  profiles: AllergyProfile[];
  selectedAllergyIds: string[];
  completeOnboarding: () => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  renameProfile: (id: string, name: string) => Promise<void>;
  resetOnboarding: () => Promise<void>;
  switchProfile: (id: string) => Promise<void>;
  syncProfilesFromCloud: () => Promise<void>;
  toggleAllergy: (id: string) => void;
};

export type AllergyProfile = {
  id: string;
  name: string;
  selectedAllergyIds: string[];
};

const STORAGE_KEY = "allergy-app.profile.v1";
const DEFAULT_PROFILE_ID = "default";
const allergyProfileClient = generateClient<Schema>();

const AllergyProfileContext = createContext<AllergyProfileState | null>(null);

export function AllergyProfileProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState(DEFAULT_PROFILE_ID);
  const [profiles, setProfiles] = useState<AllergyProfile[]>([
    { id: DEFAULT_PROFILE_ID, name: "My Profile", selectedAllergyIds: [] },
  ]);
  const didHydrateCloudRef = useRef(false);
  const profileStateRef = useRef({
    activeProfileId: DEFAULT_PROFILE_ID,
    onboardingComplete: false,
    profiles: [
      { id: DEFAULT_PROFILE_ID, name: "My Profile", selectedAllergyIds: [] },
    ] as AllergyProfile[],
  });

  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? {
      id: DEFAULT_PROFILE_ID,
      name: "My Profile",
      selectedAllergyIds: [],
    };
  const selectedAllergyIds = activeProfile.selectedAllergyIds;

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) {
          return;
        }

        const profile = JSON.parse(stored) as {
          activeProfileId?: string;
          onboardingComplete?: boolean;
          profiles?: AllergyProfile[];
          selectedAllergyIds?: string[];
        };
        const storedProfiles =
          Array.isArray(profile.profiles) && profile.profiles.length > 0
            ? profile.profiles.map((storedProfile, index) => ({
                id: storedProfile.id || `${DEFAULT_PROFILE_ID}-${index}`,
                name: storedProfile.name || (index === 0 ? "My Profile" : `Profile ${index + 1}`),
                selectedAllergyIds: normalizeAllergyIds(storedProfile.selectedAllergyIds ?? []),
              }))
            : [
                {
                  id: DEFAULT_PROFILE_ID,
                  name: "My Profile",
                  selectedAllergyIds: normalizeAllergyIds(profile.selectedAllergyIds ?? []),
                },
              ];

        const nextComplete = Boolean(profile.onboardingComplete);
        const nextActiveProfileId = storedProfiles.some(
          (storedProfile) => storedProfile.id === profile.activeProfileId,
        )
          ? profile.activeProfileId!
          : storedProfiles[0].id;

        profileStateRef.current = {
          activeProfileId: nextActiveProfileId,
          onboardingComplete: nextComplete,
          profiles: storedProfiles,
        };
        setOnboardingComplete(nextComplete);
        setProfiles(storedProfiles);
        setActiveProfileId(nextActiveProfileId);
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

  const writeLocalState = useCallback(
    async (nextComplete: boolean, nextProfiles: AllergyProfile[], nextActiveProfileId: string) => {
      profileStateRef.current = {
        activeProfileId: nextActiveProfileId,
        onboardingComplete: nextComplete,
        profiles: nextProfiles,
      };
      setOnboardingComplete(nextComplete);
      setProfiles(nextProfiles);
      setActiveProfileId(nextActiveProfileId);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          activeProfileId: nextActiveProfileId,
          onboardingComplete: nextComplete,
          profiles: nextProfiles,
          selectedAllergyIds:
            nextProfiles.find((profile) => profile.id === nextActiveProfileId)
              ?.selectedAllergyIds ?? [],
        }),
      );
    },
    [],
  );

  const syncProfilesFromCloud = useCallback(async () => {
    if (!isAmplifyConfigured) {
      return;
    }

    try {
      await getCurrentUser();
      const result = await allergyProfileClient.models.AllergyProfile.list();
      const cloudProfiles = (result.data ?? []).map((profile, index) => ({
        id: profile.id,
        name: profile.displayName || (index === 0 ? "My Profile" : `Profile ${index + 1}`),
        selectedAllergyIds: normalizeAllergyIds(
          (profile.allergies ?? []).filter((allergy): allergy is string => Boolean(allergy)),
        ),
      }));

      if (cloudProfiles.length > 0) {
        const nextActiveProfileId = cloudProfiles.some((profile) => profile.id === activeProfileId)
          ? activeProfileId
          : cloudProfiles[0].id;
        await writeLocalState(onboardingComplete, cloudProfiles, nextActiveProfileId);
        return;
      }

      if (profiles.length > 0) {
        const createdProfiles = await Promise.all(
          profiles.map(async (profile) => {
            const created = await allergyProfileClient.models.AllergyProfile.create({
              allergies: profile.selectedAllergyIds,
              displayName: profile.name,
            });

            return {
              id: created.data?.id ?? profile.id,
              name: profile.name,
              selectedAllergyIds: profile.selectedAllergyIds,
            };
          }),
        );
        await writeLocalState(onboardingComplete, createdProfiles, createdProfiles[0].id);
      }
    } catch {
      // Stay on the local profile cache when signed out or offline.
    }
  }, [activeProfileId, onboardingComplete, profiles, writeLocalState]);

  useEffect(() => {
    if (!isLoading && !didHydrateCloudRef.current) {
      didHydrateCloudRef.current = true;
      void syncProfilesFromCloud();
    }
  }, [isLoading, syncProfilesFromCloud]);

  const writeState = useCallback(
    async (nextComplete: boolean, nextProfiles: AllergyProfile[], nextActiveProfileId: string) => {
      await writeLocalState(nextComplete, nextProfiles, nextActiveProfileId);

      if (!isAmplifyConfigured) {
        return;
      }

      try {
        await getCurrentUser();
        await Promise.all(
          nextProfiles.map((profile) => {
            const input = {
              allergies: profile.selectedAllergyIds,
              displayName: profile.name,
            };

            if (profile.id.startsWith("profile-") || profile.id === DEFAULT_PROFILE_ID) {
              return Promise.resolve();
            }

            return allergyProfileClient.models.AllergyProfile.update({
              id: profile.id,
              ...input,
            });
          }),
        );
      } catch {
        // Local state remains the source for guests/offline sessions.
      }
    },
    [writeLocalState],
  );

  const completeOnboarding = useCallback(
    () => {
      const state = profileStateRef.current;
      return writeState(true, state.profiles, state.activeProfileId);
    },
    [writeState],
  );

  const resetOnboarding = useCallback(
    () => {
      const state = profileStateRef.current;
      return writeState(false, state.profiles, state.activeProfileId);
    },
    [writeState],
  );

  const switchProfile = useCallback(
    (id: string) => {
      if (!profiles.some((profile) => profile.id === id)) {
        return Promise.resolve();
      }

      return writeState(onboardingComplete, profiles, id);
    },
    [onboardingComplete, profiles, writeState],
  );

  const renameProfile = useCallback(
    (id: string, name: string) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return Promise.resolve();
      }

      const nextProfiles = profiles.map((profile) =>
        profile.id === id
          ? {
              ...profile,
              name: trimmedName,
            }
          : profile,
      );

      return writeState(onboardingComplete, nextProfiles, activeProfileId);
    },
    [activeProfileId, onboardingComplete, profiles, writeState],
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      if (profiles.length <= 1 || !profiles.some((profile) => profile.id === id)) {
        return;
      }

      const nextProfiles = profiles.filter((profile) => profile.id !== id);
      const nextActiveProfileId =
        activeProfileId === id ? nextProfiles[0].id : activeProfileId;

      await writeLocalState(onboardingComplete, nextProfiles, nextActiveProfileId);

      if (!isAmplifyConfigured || id.startsWith("profile-") || id === DEFAULT_PROFILE_ID) {
        return;
      }

      try {
        await getCurrentUser();
        await allergyProfileClient.models.AllergyProfile.delete({ id });
      } catch {
        // Keep the local delete even if the cloud delete has to retry through a later sync.
      }
    },
    [activeProfileId, onboardingComplete, profiles, writeLocalState],
  );

  const createProfile = useCallback(async () => {
    let nextProfile: AllergyProfile = {
      id: `profile-${Date.now()}`,
      name: `Profile ${profiles.length + 1}`,
      selectedAllergyIds: [],
    };

    if (isAmplifyConfigured) {
      try {
        await getCurrentUser();
        const created = await allergyProfileClient.models.AllergyProfile.create({
          allergies: [],
          displayName: nextProfile.name,
        });

        if (created.data?.id) {
          nextProfile = {
            ...nextProfile,
            id: created.data.id,
          };
        }
      } catch {
        // Guests keep the new profile locally.
      }
    }

    const nextProfiles = [
      ...profiles,
      nextProfile,
    ];

    await writeState(onboardingComplete, nextProfiles, nextProfile.id);
    return nextProfile;
  }, [onboardingComplete, profiles, writeState]);

  const toggleAllergy = useCallback(
    (id: string) => {
      const nextProfiles = profiles.map((profile) => {
        if (profile.id !== activeProfileId) {
          return profile;
        }

        const nextSelectedIds = profile.selectedAllergyIds.includes(id)
          ? profile.selectedAllergyIds.filter((value) => value !== id)
          : normalizeAllergyIds([...profile.selectedAllergyIds, id]);

        return {
          ...profile,
          selectedAllergyIds: nextSelectedIds,
        };
      });

      void writeState(onboardingComplete, nextProfiles, activeProfileId);
    },
    [activeProfileId, onboardingComplete, profiles, writeState],
  );

  const value = useMemo(
    () => ({
      activeProfileId,
      completeOnboarding,
      createProfile,
      deleteProfile,
      isLoading,
      onboardingComplete,
      profiles,
      renameProfile,
      resetOnboarding,
      selectedAllergyIds,
      switchProfile,
      syncProfilesFromCloud,
      toggleAllergy,
    }),
    [
      activeProfileId,
      completeOnboarding,
      createProfile,
      deleteProfile,
      isLoading,
      onboardingComplete,
      profiles,
      renameProfile,
      resetOnboarding,
      selectedAllergyIds,
      switchProfile,
      syncProfilesFromCloud,
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
