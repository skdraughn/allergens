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

import { normalizeAllergyId, normalizeAllergyIds } from "@/constants/allergies";
import { isAmplifyConfigured } from "@/lib/amplify";
import { safeErrorCode } from "@/lib/telemetry/schema";
import { telemetry } from "@/lib/telemetry/telemetry";

import type { Schema } from "../../../amplify/data/resource";

type AllergyProfileState = {
  activeProfileId: string;
  createProfile: () => Promise<AllergyProfile>;
  isLoading: boolean;
  isSyncing: boolean;
  onboardingComplete: boolean;
  profiles: AllergyProfile[];
  activeProfileAllergyIds: string[];
  selectedAllergyIds: string[];
  selectedProfileIds: string[];
  completeOnboarding: () => Promise<void>;
  clearAccountData: () => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  renameProfile: (id: string, name: string) => Promise<void>;
  resetOnboarding: () => Promise<void>;
  switchProfile: (id: string) => Promise<void>;
  syncProfilesFromCloud: () => Promise<void>;
  toggleAllergy: (id: string) => void;
  toggleProfileSelection: (id: string) => Promise<void>;
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState(DEFAULT_PROFILE_ID);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([
    DEFAULT_PROFILE_ID,
  ]);
  const [profiles, setProfiles] = useState<AllergyProfile[]>([
    { id: DEFAULT_PROFILE_ID, name: "My Profile", selectedAllergyIds: [] },
  ]);
  const didHydrateCloudRef = useRef(false);
  const hasUserProfileEditRef = useRef(false);
  const profileStateRef = useRef({
    activeProfileId: DEFAULT_PROFILE_ID,
    onboardingComplete: false,
    profiles: [
      { id: DEFAULT_PROFILE_ID, name: "My Profile", selectedAllergyIds: [] },
    ] as AllergyProfile[],
    selectedProfileIds: [DEFAULT_PROFILE_ID],
  });

  const selectedAllergyIds = useMemo(
    () =>
      normalizeAllergyIds(
        profiles
          .filter((profile) => selectedProfileIds.includes(profile.id))
          .flatMap((profile) => profile.selectedAllergyIds),
      ),
    [profiles, selectedProfileIds],
  );
  const activeProfileAllergyIds = useMemo(
    () =>
      normalizeAllergyIds(
        profiles.find((profile) => profile.id === activeProfileId)?.selectedAllergyIds ?? [],
      ),
    [activeProfileId, profiles],
  );

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
          selectedProfileIds?: string[];
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
        const storedSelectedProfileIds = Array.isArray(profile.selectedProfileIds)
          ? profile.selectedProfileIds.filter((id) =>
              storedProfiles.some((storedProfile) => storedProfile.id === id),
            )
          : [];
        const nextSelectedProfileIds =
          storedSelectedProfileIds.length > 0
            ? storedSelectedProfileIds
            : [nextActiveProfileId];

        profileStateRef.current = {
          activeProfileId: nextActiveProfileId,
          onboardingComplete: nextComplete,
          profiles: storedProfiles,
          selectedProfileIds: nextSelectedProfileIds,
        };
        setOnboardingComplete(nextComplete);
        setProfiles(storedProfiles);
        setActiveProfileId(nextActiveProfileId);
        setSelectedProfileIds(nextSelectedProfileIds);
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
    async (
      nextComplete: boolean,
      nextProfiles: AllergyProfile[],
      nextActiveProfileId: string,
      nextSelectedProfileIds: string[],
    ) => {
      profileStateRef.current = {
        activeProfileId: nextActiveProfileId,
        onboardingComplete: nextComplete,
        profiles: nextProfiles,
        selectedProfileIds: nextSelectedProfileIds,
      };
      setOnboardingComplete(nextComplete);
      setProfiles(nextProfiles);
      setActiveProfileId(nextActiveProfileId);
      setSelectedProfileIds(nextSelectedProfileIds);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          activeProfileId: nextActiveProfileId,
          onboardingComplete: nextComplete,
          profiles: nextProfiles,
          selectedAllergyIds: normalizeAllergyIds(
            nextProfiles
              .filter((profile) => nextSelectedProfileIds.includes(profile.id))
              .flatMap((profile) => profile.selectedAllergyIds),
          ),
          selectedProfileIds: nextSelectedProfileIds,
        }),
      );
    },
    [],
  );

  const syncProfilesFromCloud = useCallback(async () => {
    if (!isAmplifyConfigured) {
      return;
    }

    setIsSyncing(true);
    const trace = telemetry.startTrace("profile_sync");

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

      // Don't let an in-flight initial cloud read overwrite a choice the user
      // has just made in onboarding.
      if (hasUserProfileEditRef.current) {
        trace.stop({ outcome: "cancelled" });
        return;
      }

      if (cloudProfiles.length > 0) {
        const nextActiveProfileId = cloudProfiles.some((profile) => profile.id === activeProfileId)
          ? activeProfileId
          : cloudProfiles[0].id;
        const nextSelectedProfileIds = selectedProfileIds.filter((id) =>
          cloudProfiles.some((profile) => profile.id === id),
        );
        await writeLocalState(
          onboardingComplete,
          cloudProfiles,
          nextActiveProfileId,
          nextSelectedProfileIds.length > 0
            ? nextSelectedProfileIds
            : [nextActiveProfileId],
        );
        trace.stop({ outcome: "success" });
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
        const nextSelectedProfileIds = createdProfiles
          .filter((_, index) => selectedProfileIds.includes(profiles[index].id))
          .map((profile) => profile.id);
        await writeLocalState(
          onboardingComplete,
          createdProfiles,
          createdProfiles[0].id,
          nextSelectedProfileIds.length > 0
            ? nextSelectedProfileIds
            : [createdProfiles[0].id],
        );
      }
      trace.stop({ outcome: "success" });
    } catch (error) {
      trace.stop({ outcome: "failure" });
      telemetry.recordError(error, "profile_sync", {
        errorCode: safeErrorCode(error),
      });
      // Stay on the local profile cache when signed out or offline.
    } finally {
      setIsSyncing(false);
    }
  }, [activeProfileId, onboardingComplete, profiles, selectedProfileIds, writeLocalState]);

  useEffect(() => {
    if (!isLoading && !didHydrateCloudRef.current) {
      didHydrateCloudRef.current = true;
      void syncProfilesFromCloud();
    }
  }, [isLoading, syncProfilesFromCloud]);

  const writeState = useCallback(
    async (
      nextComplete: boolean,
      nextProfiles: AllergyProfile[],
      nextActiveProfileId: string,
      nextSelectedProfileIds: string[],
    ) => {
      await writeLocalState(
        nextComplete,
        nextProfiles,
        nextActiveProfileId,
        nextSelectedProfileIds,
      );

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
      return writeState(
        true,
        state.profiles,
        state.activeProfileId,
        state.selectedProfileIds,
      );
    },
    [writeState],
  );

  const resetOnboarding = useCallback(
    () => {
      const state = profileStateRef.current;
      return writeState(
        false,
        state.profiles,
        state.activeProfileId,
        state.selectedProfileIds,
      );
    },
    [writeState],
  );

  const clearAccountData = useCallback(async () => {
    const defaultProfiles: AllergyProfile[] = [
      { id: DEFAULT_PROFILE_ID, name: "My Profile", selectedAllergyIds: [] },
    ];

    hasUserProfileEditRef.current = false;
    didHydrateCloudRef.current = true;
    await writeLocalState(false, defaultProfiles, DEFAULT_PROFILE_ID, [DEFAULT_PROFILE_ID]);
  }, [writeLocalState]);

  const switchProfile = useCallback(
    async (id: string) => {
      if (!profiles.some((profile) => profile.id === id)) {
        return;
      }

      await writeState(onboardingComplete, profiles, id, selectedProfileIds);
      telemetry.track("profile_switched");
    },
    [onboardingComplete, profiles, selectedProfileIds, writeState],
  );

  const renameProfile = useCallback(
    async (id: string, name: string) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return;
      }

      const nextProfiles = profiles.map((profile) =>
        profile.id === id
          ? {
              ...profile,
              name: trimmedName,
            }
          : profile,
      );

      await writeState(
        onboardingComplete,
        nextProfiles,
        activeProfileId,
        selectedProfileIds,
      );
      telemetry.track("profile_edited");
    },
    [activeProfileId, onboardingComplete, profiles, selectedProfileIds, writeState],
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      if (profiles.length <= 1 || !profiles.some((profile) => profile.id === id)) {
        return;
      }

      const nextProfiles = profiles.filter((profile) => profile.id !== id);
      const nextActiveProfileId =
        activeProfileId === id ? nextProfiles[0].id : activeProfileId;
      const remainingSelectedProfileIds = selectedProfileIds.filter(
        (profileId) => profileId !== id,
      );
      const nextSelectedProfileIds =
        remainingSelectedProfileIds.length > 0
          ? remainingSelectedProfileIds
          : [nextActiveProfileId];

      await writeLocalState(
        onboardingComplete,
        nextProfiles,
        nextActiveProfileId,
        nextSelectedProfileIds,
      );
      telemetry.track("profile_deleted");

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
    [activeProfileId, onboardingComplete, profiles, selectedProfileIds, writeLocalState],
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

    await writeState(
      onboardingComplete,
      nextProfiles,
      nextProfile.id,
      [...selectedProfileIds, nextProfile.id],
    );
    telemetry.track("profile_created");
    return nextProfile;
  }, [onboardingComplete, profiles, selectedProfileIds, writeState]);

  const toggleAllergy = useCallback(
    (id: string) => {
      const state = profileStateRef.current;
      const normalizedId = normalizeAllergyId(id);
      const nextProfiles = state.profiles.map((profile) => {
        if (profile.id !== state.activeProfileId) {
          return profile;
        }

        const currentIds = normalizeAllergyIds(profile.selectedAllergyIds);
        const nextSelectedIds = currentIds.includes(normalizedId)
          ? currentIds.filter((value) => value !== normalizedId)
          : [...currentIds, normalizedId];

        return {
          ...profile,
          selectedAllergyIds: nextSelectedIds,
        };
      });

      hasUserProfileEditRef.current = true;
      telemetry.track("profile_edited");
      void writeState(
        state.onboardingComplete,
        nextProfiles,
        state.activeProfileId,
        state.selectedProfileIds,
      );
    },
    [writeState],
  );

  const toggleProfileSelection = useCallback(
    async (id: string) => {
      if (!profiles.some((profile) => profile.id === id)) {
        return;
      }

      const isSelected = selectedProfileIds.includes(id);
      if (isSelected && selectedProfileIds.length === 1) {
        return;
      }

      const nextSelectedProfileIds = isSelected
        ? selectedProfileIds.filter((profileId) => profileId !== id)
        : [...selectedProfileIds, id];

      await writeState(
        onboardingComplete,
        profiles,
        activeProfileId,
        nextSelectedProfileIds,
      );
      if (!isSelected) telemetry.track("profile_selected");
    },
    [activeProfileId, onboardingComplete, profiles, selectedProfileIds, writeState],
  );

  const value = useMemo(
    () => ({
      activeProfileId,
      activeProfileAllergyIds,
      clearAccountData,
      completeOnboarding,
      createProfile,
      deleteProfile,
      isLoading,
      isSyncing,
      onboardingComplete,
      profiles,
      renameProfile,
      resetOnboarding,
      selectedAllergyIds,
      selectedProfileIds,
      switchProfile,
      syncProfilesFromCloud,
      toggleAllergy,
      toggleProfileSelection,
    }),
    [
      activeProfileId,
      activeProfileAllergyIds,
      clearAccountData,
      completeOnboarding,
      createProfile,
      deleteProfile,
      isLoading,
      isSyncing,
      onboardingComplete,
      profiles,
      renameProfile,
      resetOnboarding,
      selectedAllergyIds,
      selectedProfileIds,
      switchProfile,
      syncProfilesFromCloud,
      toggleAllergy,
      toggleProfileSelection,
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
