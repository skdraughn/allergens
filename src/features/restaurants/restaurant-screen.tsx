import { useLocalSearchParams, useRouter } from "expo-router";
import {
  BadgeInfo,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Ellipsis,
  Globe,
  List as ListIcon,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SquareArrowUp,
  UserRoundCog,
  X,
  type LucideIcon,
} from "lucide-react-native";
import {
  type ComponentProps,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItem,
  type ViewToken,
} from "react-native";
import Animated, {
  Easing as ReanimatedEasing,
  Extrapolation,
  FadeIn,
  FadeInUp,
  FadeOut,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActionBottomSheetModal } from "@/components/action-bottom-sheet-modal";
import { AllergyIconGuideModal } from "@/components/allergy-icon-guide-modal";
import { AllergyIconChips } from "@/components/allergy-icon-chips";
import { IconButtonSurface } from "@/components/icon-button";
import { MenuItemDetailsModal } from "@/components/menu-item-details-modal";
import { ModalIconButton } from "@/components/modal-icon-button";
import { ModalScreen } from "@/components/modal-screen";
import { RestaurantDetailLoader } from "@/components/restaurant-detail-loader";
import { DetailPageShell, DetailPageTopBar } from "@/components/detail-page-shell";
import { RestaurantLogo } from "@/components/restaurant-logo";
import { allergyOptions } from "@/constants/allergies";
import { colors, radius, spacing } from "@/constants/theme";
import {
  getRestaurantBrand,
  getRestaurantBrandBackground,
} from "@/data/brand-assets";
import {
  type AllergyAccommodationPolicy,
  type MenuItem,
  type Restaurant,
} from "@/data/restaurants";
import {
  CommunityContributionModal,
  type ContributionMode,
} from "@/features/community/community-contribution-modal";
import { useRestaurantCommunity } from "@/features/community/use-restaurant-community";
import { useAllergyProfile } from "@/features/profile/allergy-profile-context";
import { AllergyProfileManagerModal } from "@/features/profile/allergy-profile-manager-modal";
import { useRestaurantDetail } from "@/features/restaurants/restaurant-data-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  getRestaurantSearchLocation,
  recordRestaurantVisit,
  type RestaurantSearchLocation,
} from "@/features/restaurants/restaurant-search-service";
import { getMenuItemSafety, hasIngredientIntelligence } from "@/lib/safety";
import { bucketCount, safeErrorCode } from "@/lib/telemetry/schema";
import { telemetry } from "@/lib/telemetry/telemetry";

type MenuFilter = "all" | "ok" | "caution" | "avoid";
type SourceBadgeTone = "intelligence" | "official";
type SourceBadge = { label: string; tone: SourceBadgeTone };
type MenuSectionNavItem = { category: string; count: number; rowIndex: number };
type MenuListRow =
  | {
      id: string;
      type: "header";
      category: string;
      count: number;
      first: boolean;
    }
  | { id: string; type: "item"; item: MenuItem; first: boolean; last: boolean }
  | { id: string; type: "empty" };
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
type AnimatedPressableStyle = ComponentProps<typeof AnimatedPressable>["style"];
type AnimatedViewStyle = ComponentProps<typeof Animated.View>["style"];
const minimumRestaurantLoaderDurationMs = 650;
const menuRowEntranceDelayMs = 18;
const maxAnimatedMenuRowIndex = 8;

export function RestaurantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, locationId, snapshotPath } = useLocalSearchParams<{
    id: string;
    locationId?: string;
    snapshotPath?: string;
  }>();
  const { profiles, selectedAllergyIds, selectedProfileIds } =
    useAllergyProfile();
  const [filter, setFilter] = useState<MenuFilter>("all");
  const [contributionItem, setContributionItem] = useState<MenuItem | null>(
    null,
  );
  const [contributionMode, setContributionMode] =
    useState<ContributionMode | null>(null);
  const [iconGuideVisible, setIconGuideVisible] = useState(false);
  const [menuSearchVisible, setMenuSearchVisible] = useState(false);
  const [menuSearchQuery, setMenuSearchQuery] = useState("");
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [pendingFilterSheetOpen, setPendingFilterSheetOpen] = useState(false);
  const [pendingProfileManagerOpen, setPendingProfileManagerOpen] =
    useState(false);
  const [profileManagerVisible, setProfileManagerVisible] = useState(false);
  const [restaurantLocation, setRestaurantLocation] =
    useState<RestaurantSearchLocation | null>(null);
  const [restaurantActionsVisible, setRestaurantActionsVisible] =
    useState(false);
  const [minimumRestaurantLoaderKey, setMinimumRestaurantLoaderKey] = useState<
    string | null
  >(null);
  const [presentedRestaurantKey, setPresentedRestaurantKey] = useState<
    string | null
  >(null);
  const [restaurantContentMountedKey, setRestaurantContentMountedKey] =
    useState<string | null>(null);
  const [compactTitleThreshold, setCompactTitleThreshold] = useState(132);
  const [activeMenuSection, setActiveMenuSection] = useState<string | null>(
    null,
  );
  const [sectionPickerVisible, setSectionPickerVisible] = useState(false);
  const [menuTocVisible, setMenuTocVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [sourceInfoVisible, setSourceInfoVisible] =
    useState<SourceBadgeTone | null>(null);
  const detailTelemetryKeyRef = useRef<string | null>(null);
  const {
    error: restaurantError,
    isLoading: restaurantIsLoading,
    notFound: restaurantNotFound,
    restaurant: loadedRestaurant,
  } = useRestaurantDetail(id, snapshotPath);
  const handleSelectMenuItem = useCallback((item: MenuItem) => {
    const safety = getMenuItemSafety(
      item,
      selectedAllergyIds,
      loadedRestaurant?.officialAllergenProfiles,
    );
    telemetry.track("menu_item_opened", {
      item_status: safety.status,
      menu_item_id: item.id,
      restaurant_id: id,
      source_type: item.allergenSourceType,
    });
    setSelectedItem(item);
  }, [id, loadedRestaurant?.officialAllergenProfiles, selectedAllergyIds]);
  const restaurantLoaderKey = `${id}::${snapshotPath ?? ""}`;
  useEffect(() => {
    if (!loadedRestaurant || detailTelemetryKeyRef.current === restaurantLoaderKey) return;
    detailTelemetryKeyRef.current = restaurantLoaderKey;
    telemetry.track("restaurant_detail_loaded", {
      item_count_bucket: bucketCount(loadedRestaurant.items.length),
      restaurant_id: loadedRestaurant.id,
      source_type: loadedRestaurant.items.some(
        (item) => item.allergenSourceType !== "unavailable",
      )
        ? "official"
        : "ingredient_intelligence",
    });
  }, [loadedRestaurant, restaurantLoaderKey]);
  useEffect(() => {
    if (!restaurantError || detailTelemetryKeyRef.current === `error:${restaurantLoaderKey}`) return;
    detailTelemetryKeyRef.current = `error:${restaurantLoaderKey}`;
    telemetry.track("restaurant_detail_failed", {
      error_code: safeErrorCode(restaurantError),
      restaurant_id: id,
    });
  }, [id, restaurantError, restaurantLoaderKey]);
  useEffect(() => {
    if (!loadedRestaurant || presentedRestaurantKey === restaurantLoaderKey) {
      return;
    }

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setPresentedRestaurantKey(restaurantLoaderKey);
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [loadedRestaurant, presentedRestaurantKey, restaurantLoaderKey]);
  const restaurant =
    presentedRestaurantKey === restaurantLoaderKey
      ? loadedRestaurant
      : undefined;
  const community = useRestaurantCommunity(restaurant?.id ?? "");
  const menuListRef = useRef<FlatList<MenuListRow>>(null);
  const menuViewabilityConfig = useRef({
    itemVisiblePercentThreshold: 35,
  }).current;
  const suppressViewabilityUntilRef = useRef(0);
  const animatedScrollY = useSharedValue(0);
  const menuTocVisibleShared = useSharedValue(false);
  const navTitleAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: interpolate(
        animatedScrollY.value,
        [compactTitleThreshold - 44, compactTitleThreshold + 8],
        [0, 1],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          translateX: interpolate(
            animatedScrollY.value,
            [compactTitleThreshold - 44, compactTitleThreshold + 8],
            [-8, 0],
            Extrapolation.CLAMP,
          ),
        },
      ],
    }),
    [compactTitleThreshold],
  );
  const navButtonAnimatedStyle = useAnimatedStyle(() => {
    const size = interpolate(
      animatedScrollY.value,
      [compactTitleThreshold - 44, compactTitleThreshold + 8],
      [48, 36],
      Extrapolation.CLAMP,
    );

    return {
      borderRadius: size / 2,
      height: size,
      width: size,
    };
  }, [compactTitleThreshold]);
  const navIconAnimatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          scale: interpolate(
            animatedScrollY.value,
            [compactTitleThreshold - 44, compactTitleThreshold + 8],
            [1, 0.84],
            Extrapolation.CLAMP,
          ),
        },
      ],
    }),
    [compactTitleThreshold],
  );
  const navTocAnimatedStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      animatedScrollY.value,
      [compactTitleThreshold - 12, compactTitleThreshold + 36],
      [0, 1],
      Extrapolation.CLAMP,
    );

    return {
      maxHeight: interpolate(progress, [0, 1], [0, 52]),
      transform: [
        {
          translateY: interpolate(progress, [0, 1], [-6, 0]),
        },
      ],
    };
  }, [compactTitleThreshold]);
  const handleMenuScroll = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        animatedScrollY.set(event.contentOffset.y);
        const nextMenuTocVisible =
          event.contentOffset.y >= compactTitleThreshold - 6;

        if (menuTocVisibleShared.value !== nextMenuTocVisible) {
          menuTocVisibleShared.set(nextMenuTocVisible);
          runOnJS(setMenuTocVisible)(nextMenuTocVisible);
        }
      },
    },
    [compactTitleThreshold],
  );
  useEffect(() => {
    if (!id) {
      return;
    }

    let cancelled = false;

    getRestaurantSearchLocation().then((location) => {
      if (cancelled) {
        return;
      }

      setRestaurantLocation(location);
      void recordRestaurantVisit({
        location,
        locationId,
        restaurantId: id,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [id, locationId]);
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/home");
  };

  const menuSafetyByItem = useMemo(() => {
    if (!restaurant) {
      return new Map<MenuItem, ReturnType<typeof getMenuItemSafety>>();
    }

    return new Map(
      restaurant.items.map((item) => [
        item,
        getMenuItemSafety(
          item,
          selectedAllergyIds,
          restaurant.officialAllergenProfiles,
        ),
      ]),
    );
  }, [restaurant, selectedAllergyIds]);
  const summary = useMemo(() => {
    const counts = { avoidCount: 0, cautionCount: 0, okCount: 0 };

    for (const safety of menuSafetyByItem.values()) {
      if (safety.status === "avoid") counts.avoidCount += 1;
      if (safety.status === "caution") counts.cautionCount += 1;
      if (safety.status === "ok") counts.okCount += 1;
    }

    return counts;
  }, [menuSafetyByItem]);
  const filteredItems = useMemo(() => {
    if (!restaurant) {
      return [];
    }

    return restaurant.items.filter((item) => {
      const safety = menuSafetyByItem.get(item);

      return (
        filter === "all" ||
        (filter === "ok" && safety?.status === "ok") ||
        (filter === "caution" && safety?.status === "caution") ||
        (filter === "avoid" && safety?.status === "avoid")
      );
    });
  }, [filter, menuSafetyByItem, restaurant]);

  const menuStructure = useMemo<{
    rows: MenuListRow[];
    sections: MenuSectionNavItem[];
  }>(() => {
    if (filteredItems.length === 0) {
      return { rows: [{ id: "empty", type: "empty" }], sections: [] };
    }

    const sections = new Map<string, MenuItem[]>();

    for (const item of filteredItems) {
      const category = item.category || "Menu";
      sections.set(category, [...(sections.get(category) ?? []), item]);
    }

    const sortedSections = Array.from(sections.entries()).sort(
      ([leftCategory], [rightCategory]) =>
        compareMenuCategories(leftCategory, rightCategory),
    );
    const rows: MenuListRow[] = [];
    const navSections: MenuSectionNavItem[] = [];

    sortedSections.forEach(([category, items], sectionIndex) => {
      const showHeader = sections.size > 1;

      navSections.push({
        category,
        count: items.length,
        rowIndex: rows.length,
      });

      if (showHeader) {
        rows.push({
          id: `header-${category}`,
          type: "header",
          category,
          count: items.length,
          first: sectionIndex === 0,
        });
      }

      rows.push(
        ...items.map((item, index) => ({
          first: index === 0,
          id: item.id,
          item,
          last: index === items.length - 1,
          type: "item" as const,
        })),
      );
    });

    return { rows, sections: navSections };
  }, [filteredItems]);
  const menuRows = menuStructure.rows;
  const menuSections = menuStructure.sections;
  useEffect(() => {
    setActiveMenuSection((current) => {
      if (
        current &&
        menuSections.some((section) => section.category === current)
      ) {
        return current;
      }

      return menuSections[0]?.category ?? null;
    });
  }, [menuSections]);
  const handleViewableMenuRowsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<MenuListRow>[] }) => {
      if (Date.now() < suppressViewabilityUntilRef.current) {
        return;
      }

      const firstSection = viewableItems
        .map((viewableItem) => viewableItem.item)
        .find((row) => row?.type === "header" || row?.type === "item");
      const nextCategory =
        firstSection?.type === "header"
          ? firstSection.category
          : firstSection?.type === "item"
            ? firstSection.item.category || "Menu"
            : null;

      if (nextCategory) {
        setActiveMenuSection(nextCategory);
      }
    },
  ).current;
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinimumRestaurantLoaderKey(restaurantLoaderKey);
    }, minimumRestaurantLoaderDurationMs);

    return () => {
      clearTimeout(timer);
    };
  }, [restaurantLoaderKey]);
  const minimumRestaurantLoaderElapsed =
    minimumRestaurantLoaderKey === restaurantLoaderKey;
  useEffect(() => {
    if (
      !restaurant ||
      !minimumRestaurantLoaderElapsed ||
      restaurantContentMountedKey === restaurantLoaderKey
    ) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      setRestaurantContentMountedKey(restaurantLoaderKey);
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [
    minimumRestaurantLoaderElapsed,
    restaurant,
    restaurantContentMountedKey,
    restaurantLoaderKey,
  ]);
  const showRestaurantLoader =
    !restaurantNotFound &&
    (restaurantIsLoading ||
      !restaurant ||
      !minimumRestaurantLoaderElapsed ||
      restaurantContentMountedKey !== restaurantLoaderKey);
  if (!restaurant) {
    return (
      <DetailPageShell>
          {!showRestaurantLoader ? <DetailPageTopBar style={styles.nav}>
            <AnimatedNavButton
              Icon={ChevronLeft}
              iconStyle={navIconAnimatedStyle}
              label="Back"
              onPress={goBack}
              style={navButtonAnimatedStyle}
            />
          </DetailPageTopBar> : null}
          <View style={styles.empty}>
            {!showRestaurantLoader ? (
              <Text style={styles.title}>Restaurant not found</Text>
            ) : null}
          </View>
          {showRestaurantLoader ? (
            <Animated.View
              key="restaurant-loader-overlay"
              exiting={FadeOut.duration(280).easing(
                ReanimatedEasing.out(ReanimatedEasing.cubic),
              )}
              style={styles.restaurantLoadingOverlay}
            >
              <RestaurantDetailLoader />
            </Animated.View>
          ) : null}
      </DetailPageShell>
    );
  }

  const brand = getRestaurantBrand(restaurant.id, {
    domain: restaurant.domain ?? undefined,
    logoAspectRatio: restaurant.logoAspectRatio ?? undefined,
    logoMonogram: restaurant.logoMonogram ?? undefined,
    logoSvgUrl: restaurant.logoSvgUrl ?? undefined,
    logoUrl: restaurant.logoUrl ?? undefined,
    name: restaurant.name,
  });
  const officialItemCount =
    restaurant.allergenDataStatus?.officialItemCount ??
    restaurant.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length;
  const totalItemCount = restaurant.items.length;
  const filterOptions: { count: number; id: MenuFilter; label: string }[] = [
    { count: totalItemCount, id: "all", label: "All" },
    { count: summary.okCount, id: "ok", label: "Ok" },
    { count: summary.avoidCount, id: "avoid", label: "Avoid" },
    { count: summary.cautionCount, id: "caution", label: "Review" },
  ];
  const allergyReviewSummary = community.data?.summary ?? {
    averageRating: null,
    count: 0,
  };
  const selectedProfiles = profiles.filter((profile) =>
    selectedProfileIds.includes(profile.id),
  );
  const selectedProfileNames = selectedProfiles
    .map((profile) => profile.name)
    .join(" + ");
  const openContribution = (
    mode: ContributionMode,
    item: MenuItem | null = null,
  ) => {
    setContributionItem(item);
    setContributionMode(mode);
  };
  const openReviews = (item?: MenuItem | null) => {
    telemetry.track("review_flow_opened", {
      entry_point: item ? "menu_item_detail" : "restaurant_header",
      menu_item_id: item?.id,
      restaurant_id: restaurant.id,
      scope: item ? "menu_item" : "restaurant",
    });
    router.push({
      params: {
        id: restaurant.id,
        menuItemId: item?.id ?? "",
        snapshotPath: snapshotPath ?? "",
      },
      pathname: item ? "/restaurant-review" : "/restaurant-reviews",
    });
  };
  const openAccommodations = () => {
    telemetry.track("restaurant_accommodation_opened", {
      restaurant_id: restaurant.id,
      source_type: "restaurant_policy",
    });
    router.push({
      params: {
        id: restaurant.id,
        snapshotPath: snapshotPath ?? "",
      },
      pathname: "/restaurant-accommodations",
    });
  };
  const openProfileManager = () => {
    setPendingProfileManagerOpen(true);
    setRestaurantActionsVisible(false);
  };
  const openFilterSheet = () => {
    setPendingFilterSheetOpen(true);
    setRestaurantActionsVisible(false);
  };
  const handleRestaurantActionsDismissComplete = () => {
    if (pendingFilterSheetOpen) {
      setPendingFilterSheetOpen(false);
      setFilterSheetVisible(true);
    }

    if (pendingProfileManagerOpen) {
      setPendingProfileManagerOpen(false);
      setProfileManagerVisible(true);
    }
  };
  const openIconGuide = () => {
    setRestaurantActionsVisible(false);
    setIconGuideVisible(true);
  };
  const openRestaurantWebsite = () => {
    setRestaurantActionsVisible(false);
    telemetry.track("restaurant_website_opened", {
      restaurant_id: restaurant.id,
      source_type: "official_website",
    });
    void Linking.openURL(restaurant.guideUrl);
  };
  const shareRestaurant = async () => {
    setRestaurantActionsVisible(false);
    telemetry.track("restaurant_shared", { restaurant_id: restaurant.id });
    const sharedRestaurantUrl = `https://mysafemenu.com/restaurant/${encodeURIComponent(restaurant.id)}`;
    try {
      await Share.share({
        message: `Check allergy information for ${restaurant.name} in MySafeMenu.\n${sharedRestaurantUrl}\n\nDownload MySafeMenu: https://mysafemenu.com/download`,
        title: `${restaurant.name} on MySafeMenu`,
        url: sharedRestaurantUrl,
      });
    } catch (error) {
      Alert.alert(
        "Unable to share",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };
  const restaurantMeta = getRestaurantMetaLine({
    officialItemCount,
    restaurant,
    totalItemCount,
    userLocation: restaurantLocation,
  });
  const scrollToMenuSection = (section: MenuSectionNavItem) => {
    suppressViewabilityUntilRef.current = Date.now() + 1100;
    setActiveMenuSection(section.category);
    setSectionPickerVisible(false);
    telemetry.track("menu_category_selected", { restaurant_id: restaurant.id });
    menuListRef.current?.scrollToIndex({
      animated: true,
      index: section.rowIndex,
      viewPosition: 0,
    });
  };
  const renderMenuRow: ListRenderItem<MenuListRow> = ({ index, item }) => {
    const entering = FadeInUp.duration(540)
      .delay(220 + Math.min(index, maxAnimatedMenuRowIndex) * menuRowEntranceDelayMs)
      .easing(ReanimatedEasing.bezier(0.16, 1, 0.3, 1));

    if (item.type === "header") {
      return (
        <Animated.View
          entering={entering}
          style={[
            styles.categorySectionHeader,
            item.first && styles.categorySectionHeaderFirst,
          ]}
        >
          <Text style={styles.categorySectionTitle}>{item.category}</Text>
          <Text style={styles.categorySectionCount}>{item.count}</Text>
        </Animated.View>
      );
    }

    if (item.type === "empty") {
      const policyOnly =
        restaurant.items.length === 0 && restaurant.allergyAccommodationPolicy;

      return (
        <Animated.View entering={entering}>
          <View style={styles.emptyMenu}>
            <Text style={styles.emptyMenuTitle}>
              {policyOnly ? "No itemized menu yet" : "No menu matches"}
            </Text>
            <Text style={styles.emptyMenuCopy}>
              {policyOnly
                ? "We found restaurant-level allergy accommodation information, but no item-level menu data yet."
                : "Try another item, category, or allergen."}
            </Text>
          </View>
        </Animated.View>
      );
    }

    return (
      <Animated.View entering={entering}>
        <MenuRow
          first={item.first}
          item={item.item}
          last={item.last}
          onSelect={handleSelectMenuItem}
          safety={menuSafetyByItem.get(item.item)!}
        />
      </Animated.View>
    );
  };

  return (
    <DetailPageShell>
        {!showRestaurantLoader ? <DetailPageTopBar style={styles.nav}>
          <View style={styles.navTopRow}>
            <View style={styles.navLeading}>
              <AnimatedNavButton
                Icon={ChevronLeft}
                iconStyle={navIconAnimatedStyle}
                label="Back"
                onPress={goBack}
                style={navButtonAnimatedStyle}
              />
              <Animated.Text
                maxFontSizeMultiplier={1.1}
                numberOfLines={1}
                style={[styles.navTitle, navTitleAnimatedStyle]}
              >
                {restaurant.name}
              </Animated.Text>
            </View>
            <View style={styles.navActions}>
              <AnimatedNavButton
                Icon={Search}
                iconStyle={navIconAnimatedStyle}
                label="Search menu"
                onPress={() => setMenuSearchVisible(true)}
                style={navButtonAnimatedStyle}
              />
              <AnimatedNavButton
                Icon={Ellipsis}
                iconStyle={navIconAnimatedStyle}
                label="Open restaurant actions"
                onPress={() => setRestaurantActionsVisible(true)}
                size={22}
                strokeWidth={2.65}
                style={navButtonAnimatedStyle}
              />
            </View>
          </View>
          <Animated.View style={[styles.menuTocReveal, navTocAnimatedStyle]}>
            {menuTocVisible ? (
              <MenuTableOfContents
                activeCategory={activeMenuSection}
                onOpenSections={() => setSectionPickerVisible(true)}
                onSelectSection={scrollToMenuSection}
                sections={menuSections}
              />
            ) : null}
          </Animated.View>
        </DetailPageTopBar> : null}

        <Animated.FlatList
          entering={FadeIn.duration(240).easing(
            ReanimatedEasing.out(ReanimatedEasing.cubic),
          )}
          ListHeaderComponent={
            <>
              <Animated.View
                entering={FadeInUp.duration(360).easing(
                  ReanimatedEasing.bezier(0.16, 1, 0.3, 1),
                )}
                onLayout={(event) => {
                  const nextThreshold = Math.max(
                    96,
                    event.nativeEvent.layout.height - 18,
                  );
                  setCompactTitleThreshold((current) =>
                    Math.abs(current - nextThreshold) < 1
                      ? current
                      : nextThreshold,
                  );
                }}
                style={styles.restaurantHeader}
              >
                <View
                  style={[
                    styles.restaurantLogoFrame,
                    { backgroundColor: getRestaurantBrandBackground(brand) },
                  ]}
                >
                  <RestaurantLogo brand={brand} borderRadius={18} size={56} />
                </View>
                <Text
                  maxFontSizeMultiplier={1.05}
                  numberOfLines={2}
                  style={styles.title}
                >
                  {restaurant.name}
                </Text>
                <View style={styles.restaurantHeaderMetaRow}>
                  <Text
                    maxFontSizeMultiplier={1.08}
                    numberOfLines={1}
                    style={styles.restaurantHeaderPlaceMeta}
                  >
                    {restaurantMeta.placeLabel}
                  </Text>
                  <Text style={styles.restaurantHeaderMetaSeparator}> · </Text>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => openReviews()}
                    style={styles.ratingLink}
                  >
                    <Text style={styles.ratingLinkText}>
                      {formatAllergyReviewSummary(allergyReviewSummary)}
                    </Text>
                    <ChevronRight
                      color={colors.coral}
                      size={12}
                      strokeWidth={2.2}
                    />
                  </Pressable>
                </View>
                <View style={styles.sourceBadgeRow}>
                  {restaurantMeta.sourceBadges.map((badge) => (
                    <Pressable
                      accessibilityLabel={`Explain ${badge.label}`}
                      accessibilityRole="button"
                      key={badge.tone}
                      onPress={() => {
                        telemetry.track("source_explanation_opened", {
                          restaurant_id: restaurant.id,
                          source_type: badge.tone,
                        });
                        setSourceInfoVisible(badge.tone);
                      }}
                      style={[
                        styles.sourceBadge,
                        badge.tone === "official"
                          ? styles.sourceBadgeOfficial
                          : styles.sourceBadgeIntelligence,
                      ]}
                    >
                      {badge.tone === "official" ? (
                        <ShieldCheck
                          color={colors.primary}
                          size={13}
                          strokeWidth={2.45}
                        />
                      ) : (
                        <Sparkles
                          color="#B25E00"
                          size={13}
                          strokeWidth={2.45}
                        />
                      )}
                      <Text
                        maxFontSizeMultiplier={1.08}
                        numberOfLines={1}
                        style={[
                          styles.sourceBadgeText,
                          badge.tone === "official"
                            ? styles.sourceBadgeTextOfficial
                            : styles.sourceBadgeTextIntelligence,
                        ]}
                      >
                        {badge.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {restaurant.allergyAccommodationPolicy ? (
                  <AccommodationPolicyCard
                    onPress={openAccommodations}
                    policy={restaurant.allergyAccommodationPolicy}
                  />
                ) : null}
              </Animated.View>

              {totalItemCount > 0 ? (
                <ScrollView
                  contentContainerStyle={styles.filterChipListContent}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.filterChipList}
                >
                  {filterOptions.map((nextFilter) => (
                    <MenuFilterChip
                      active={filter === nextFilter.id}
                      count={nextFilter.count}
                      key={nextFilter.id}
                      label={nextFilter.label}
                      onPress={() => {
                        telemetry.track("menu_filter_selected", {
                          filter: nextFilter.id,
                          restaurant_id: restaurant.id,
                        });
                        setFilter(nextFilter.id);
                      }}
                    />
                  ))}
                </ScrollView>
              ) : null}
            </>
          }
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom + 78, 94) },
          ]}
          data={menuRows}
          ref={menuListRef}
          initialNumToRender={10}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          maxToRenderPerBatch={8}
          onScroll={handleMenuScroll}
          onScrollToIndexFailed={(info) => {
            menuListRef.current?.scrollToOffset({
              animated: true,
              offset: Math.max(0, info.averageItemLength * info.index),
            });
          }}
          onViewableItemsChanged={handleViewableMenuRowsChanged}
          removeClippedSubviews
          renderItem={renderMenuRow}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          updateCellsBatchingPeriod={32}
          viewabilityConfig={menuViewabilityConfig}
          windowSize={9}
        />

        <View
          pointerEvents="none"
          style={[
            styles.floatingDisclaimer,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <Text style={styles.floatingDisclaimerText}>
            Confirm official allergen information with staff before ordering.
          </Text>
        </View>

        <MenuItemDetailsModal
          community={community.data}
          item={selectedItem}
          onComment={(item) => {
            setSelectedItem(null);
            openReviews(item);
          }}
          onClose={() => setSelectedItem(null)}
          onReport={(item) => {
            setSelectedItem(null);
            openContribution("report", item);
          }}
          onViewReviews={(item) => {
            setSelectedItem(null);
            openReviews(item);
          }}
          officialAllergenProfiles={restaurant.officialAllergenProfiles}
          restaurantId={restaurant.id}
          selectedAllergyIds={selectedAllergyIds}
        />
        <CommunityContributionModal
          item={contributionItem}
          mode={contributionMode}
          onClose={() => {
            setContributionItem(null);
            setContributionMode(null);
          }}
          onSignInRequired={() => router.push("/account")}
          restaurant={restaurant}
        />
        <RestaurantActionsSheet
          activeProfileName={selectedProfileNames || "My Profile"}
          onChangeProfile={openProfileManager}
          onClose={() => setRestaurantActionsVisible(false)}
          onDismissComplete={handleRestaurantActionsDismissComplete}
          onOpenFilter={openFilterSheet}
          onOpenIconGuide={openIconGuide}
          onOpenWebsite={openRestaurantWebsite}
          onShare={() => void shareRestaurant()}
          profileCount={selectedProfiles.length}
          selectedAllergyIds={selectedAllergyIds}
          visible={restaurantActionsVisible}
        />
        <MenuFilterSheet
          activeFilter={filter}
          filterOptions={filterOptions}
          onClose={() => setFilterSheetVisible(false)}
          onSelectFilter={(nextFilter) => {
            telemetry.track("menu_filter_selected", {
              filter: nextFilter,
              restaurant_id: restaurant.id,
            });
            setFilter(nextFilter);
            setFilterSheetVisible(false);
          }}
          visible={filterSheetVisible}
        />
        <MenuSectionPickerSheet
          onClose={() => setSectionPickerVisible(false)}
          onSelectSection={scrollToMenuSection}
          sections={menuSections}
          visible={sectionPickerVisible}
        />
        <SourceInfoModal
          onClose={() => setSourceInfoVisible(null)}
          visibleTone={sourceInfoVisible}
        />
        <MenuSearchModal
          items={restaurant.items}
          onClose={() => setMenuSearchVisible(false)}
          onPressItem={(item) => {
            setMenuSearchVisible(false);
            setSelectedItem(item);
          }}
          query={menuSearchQuery}
          restaurantId={restaurant.id}
          officialAllergenProfiles={restaurant.officialAllergenProfiles}
          selectedAllergyIds={selectedAllergyIds}
          setQuery={setMenuSearchQuery}
          visible={menuSearchVisible}
        />
        <AllergyProfileManagerModal
          onClose={() => setProfileManagerVisible(false)}
          visible={profileManagerVisible}
        />
        <AllergyIconGuideModal
          onClose={() => setIconGuideVisible(false)}
          visible={iconGuideVisible}
        />
        {showRestaurantLoader ? (
          <Animated.View
            key="restaurant-loader-overlay"
            exiting={FadeOut.duration(280).easing(
              ReanimatedEasing.out(ReanimatedEasing.cubic),
            )}
            style={styles.restaurantLoadingOverlay}
          >
            <RestaurantDetailLoader />
          </Animated.View>
        ) : null}
    </DetailPageShell>
  );
}

function RestaurantActionsSheet({
  activeProfileName,
  onChangeProfile,
  onClose,
  onDismissComplete,
  onOpenFilter,
  onOpenIconGuide,
  onOpenWebsite,
  onShare,
  profileCount,
  selectedAllergyIds,
  visible,
}: {
  activeProfileName: string;
  onChangeProfile: () => void;
  onClose: () => void;
  onDismissComplete: () => void;
  onOpenFilter: () => void;
  onOpenIconGuide: () => void;
  onOpenWebsite: () => void;
  onShare: () => void;
  profileCount: number;
  selectedAllergyIds: string[];
  visible: boolean;
}) {
  const actions = [
    { Icon: SquareArrowUp, label: "Share", onPress: onShare },
    { Icon: SlidersHorizontal, label: "Filter", onPress: onOpenFilter },
    {
      Icon: UserRoundCog,
      label: "Change Allergy Profiles",
      onPress: onChangeProfile,
      subcontent: (
        <View style={styles.profileActionSummary}>
          <Text
            maxFontSizeMultiplier={1.08}
            numberOfLines={1}
            style={[
              styles.profileActionSublabel,
              styles.profileActionSummaryText,
            ]}
          >
            {activeProfileName} · {profileCount} profile
            {profileCount === 1 ? "" : "s"}
          </Text>
          <AllergyIconChips
            allergyIds={selectedAllergyIds}
            compact
            highlightedIds={[]}
            maxVisible={3}
            overlap
            size={18}
            style={styles.profileActionSummaryIcons}
          />
        </View>
      ),
    },
    { Icon: CircleHelp, label: "Allergy Icon Guide", onPress: onOpenIconGuide },
    { Icon: Globe, label: "View Website", onPress: onOpenWebsite },
  ];

  return (
    <ActionBottomSheetModal
      actions={actions}
      onClose={onClose}
      onDismissComplete={onDismissComplete}
      visible={visible}
    />
  );
}

function MenuFilterSheet({
  activeFilter,
  filterOptions,
  onClose,
  onSelectFilter,
  visible,
}: {
  activeFilter: MenuFilter;
  filterOptions: { count: number; id: MenuFilter; label: string }[];
  onClose: () => void;
  onSelectFilter: (filter: MenuFilter) => void;
  visible: boolean;
}) {
  return (
    <ActionBottomSheetModal
      actions={filterOptions.map((option) => ({
        Icon: option.id === activeFilter ? CheckCircle2 : undefined,
        label: option.label,
        onPress: () => onSelectFilter(option.id),
        subcontent: (
          <Text style={styles.sectionPickerCount}>
            {option.count} item{option.count === 1 ? "" : "s"}
          </Text>
        ),
      }))}
      closeLabel="Cancel"
      onClose={onClose}
      visible={visible}
    />
  );
}

function MenuSectionPickerSheet({
  onClose,
  onSelectSection,
  sections,
  visible,
}: {
  onClose: () => void;
  onSelectSection: (section: MenuSectionNavItem) => void;
  sections: MenuSectionNavItem[];
  visible: boolean;
}) {
  return (
    <ActionBottomSheetModal
      actions={sections.map((section) => ({
        label: section.category,
        onPress: () => onSelectSection(section),
        subcontent: (
          <Text style={styles.sectionPickerCount}>
            {section.count} item{section.count === 1 ? "" : "s"}
          </Text>
        ),
      }))}
      closeLabel="Cancel"
      onClose={onClose}
      scrollable
      visible={visible}
    />
  );
}

function MenuTableOfContents({
  activeCategory,
  onOpenSections,
  onSelectSection,
  sections,
}: {
  activeCategory: string | null;
  onOpenSections: () => void;
  onSelectSection: (section: MenuSectionNavItem) => void;
  sections: MenuSectionNavItem[];
}) {
  const scrollRef = useRef<ScrollView>(null);
  const chipLayoutsRef = useRef(
    new Map<string, { width: number; x: number }>(),
  );
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    if (!activeCategory || viewportWidth <= 0) {
      return;
    }

    const layout = chipLayoutsRef.current.get(activeCategory);

    if (!layout) {
      return;
    }

    const centeredOffset = Math.max(
      0,
      layout.x + layout.width / 2 - viewportWidth / 2,
    );
    scrollRef.current?.scrollTo({ animated: true, x: centeredOffset });
  }, [activeCategory, viewportWidth]);

  if (sections.length === 0) {
    return null;
  }

  return (
    <View style={styles.menuToc}>
      <Pressable
        accessibilityLabel="Open menu sections"
        accessibilityRole="button"
        onPress={onOpenSections}
        style={styles.menuTocListButton}
      >
        <IconButtonSurface renderFallbackUnderGlass={false} />
        <ListIcon color={colors.primary} size={20} strokeWidth={2.35} />
      </Pressable>
      <ScrollView
        contentContainerStyle={styles.menuTocScrollContent}
        horizontal
        onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        ref={scrollRef}
        showsHorizontalScrollIndicator={false}
        style={styles.menuTocScroll}
      >
        {sections.map((section) => {
          const active = section.category === activeCategory;

          return (
            <Pressable
              accessibilityRole="button"
              key={section.category}
              onLayout={(event) => {
                chipLayoutsRef.current.set(section.category, {
                  width: event.nativeEvent.layout.width,
                  x: event.nativeEvent.layout.x,
                });
              }}
              onPress={() => onSelectSection(section)}
              style={styles.menuTocChip}
            >
              <IconButtonSurface
                fallbackColor={active ? colors.primaryLight : undefined}
                renderFallbackUnderGlass={false}
                tintColor={active ? "rgba(0,122,255,0.24)" : null}
              />
              <Text
                maxFontSizeMultiplier={1.08}
                numberOfLines={1}
                style={[
                  styles.menuTocChipText,
                  active && styles.menuTocChipTextActive,
                ]}
              >
                {section.category}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function AccommodationPolicyCard({
  onPress,
  policy,
}: {
  onPress: () => void;
  policy: AllergyAccommodationPolicy;
}) {
  const tone = getAccommodationPolicyTone(policy.status);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.accommodationCard}
    >
      <View
        style={[
          styles.accommodationIconShell,
          { backgroundColor: tone.background },
        ]}
      >
        <BadgeInfo color={tone.color} size={18} strokeWidth={2.45} />
      </View>
      <View style={styles.accommodationCardBody}>
        <View style={styles.accommodationTitleRow}>
          <Text style={[styles.accommodationStatus, { color: tone.color }]}>
            {tone.label}
          </Text>
          {policy.advanceNotice ? (
            <View style={styles.accommodationNoticePill}>
              <CalendarClock
                color={colors.muted}
                size={12}
                strokeWidth={2.25}
              />
              <Text style={styles.accommodationNoticeText}>
                {policy.advanceNotice}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          maxFontSizeMultiplier={1.08}
          numberOfLines={2}
          style={styles.accommodationSummary}
        >
          {policy.summary}
        </Text>
      </View>
      <ChevronRight color={colors.muted} size={16} strokeWidth={2.15} />
    </Pressable>
  );
}

function getAccommodationPolicyTone(
  status: AllergyAccommodationPolicy["status"],
) {
  if (status === "can-accommodate") {
    return {
      background: "#EAF7EF",
      color: "#22863A",
      label: "Can discuss allergies",
    };
  }

  if (status === "partial-accommodation") {
    return {
      background: "#FFF4E2",
      color: "#B25E00",
      label: "Limited accommodations",
    };
  }

  if (status === "cannot-accommodate") {
    return {
      background: "#FFECEE",
      color: "#C6283E",
      label: "Cannot accommodate",
    };
  }

  return {
    background: "#F2F2F7",
    color: colors.muted,
    label: "Policy not found yet",
  };
}

function SourceInfoModal({
  onClose,
  visibleTone,
}: {
  onClose: () => void;
  visibleTone: SourceBadgeTone | null;
}) {
  const [presentedTone, setPresentedTone] = useState<SourceBadgeTone | null>(
    visibleTone,
  );
  const displayTone = visibleTone ?? presentedTone;
  const isOfficial = displayTone === "official";

  useEffect(() => {
    if (visibleTone) {
      setPresentedTone(visibleTone);
    }
  }, [visibleTone]);

  return (
    <Modal
      animationType="slide"
      onDismiss={() => {
        if (!visibleTone) {
          setPresentedTone(null);
        }
      }}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={Boolean(visibleTone)}
    >
      {displayTone ? (
        <ModalScreen
          actionIcon={X}
          actionLabel="Close source explanation"
          headerContent={
            <>
              <Text style={styles.sourceInfoKicker}>Source transparency</Text>
              <Text style={styles.sourceInfoTitle}>
                {isOfficial ? "Official source" : "Ingredient Intelligence"}
              </Text>
            </>
          }
          onActionPress={onClose}
        >
          <ScrollView contentContainerStyle={styles.sourceInfoContent}>
            {isOfficial ? (
              <OfficialSourceExplanation />
            ) : (
              <IngredientIntelligenceExplanation />
            )}
          </ScrollView>
        </ModalScreen>
      ) : null}
    </Modal>
  );
}

function OfficialSourceExplanation() {
  return (
    <View style={styles.sourceInfoCard}>
      <SourceInfoSection title="What this means">
        <Text style={styles.sourceInfoBody}>
          Official source means the allergen information came from the
          restaurant or brand, or from a published nutrition and allergen data
          provider such as Nutritionix. These are sources that are meant to
          reflect the restaurant&apos;s actual menu and ingredients.
        </Text>
      </SourceInfoSection>
      <SourceInfoSection title="How to use it">
        <Text style={styles.sourceInfoBody}>
          We show this separately because it is the closest thing to the
          restaurant telling you what is in the food. The number on the badge
          shows how many menu items have official allergen information in the
          menu snapshot you are viewing. We do not repeat this icon on every
          menu row when official data is the normal source.
        </Text>
      </SourceInfoSection>
      <SourceInfoSection title="Still confirm before ordering">
        <Text style={styles.sourceInfoBody}>
          Menus, suppliers, recipes, and kitchen practices can change. Treat
          official information as the best available published source, then
          confirm with staff before ordering if an allergy could affect your
          health.
        </Text>
      </SourceInfoSection>
    </View>
  );
}

function IngredientIntelligenceExplanation() {
  return (
    <View style={styles.sourceInfoCard}>
      <SourceInfoSection title="What this means">
        <Text style={styles.sourceInfoBody}>
          Ingredient Intelligence is an extra caution layer for menu items where
          official allergen details are missing or incomplete.
        </Text>
      </SourceInfoSection>
      <SourceInfoSection title="What we look at">
        <Text style={styles.sourceInfoBody}>
          We look at the menu item name, description, listed ingredients when
          available, and common dish patterns. For example, pesto often involves
          tree nuts or dairy, and breaded chicken often involves wheat or egg.
        </Text>
      </SourceInfoSection>
      <SourceInfoSection title="What it can and cannot do">
        <Text style={styles.sourceInfoBody}>
          When Ingredient Intelligence identifies one of your selected
          allergens, the item is marked Avoid. It never marks food as safe, and
          it never overrides official restaurant information. The summary count
          shows how many menu items have these inferred allergen signals.
        </Text>
        <View
          style={[
            styles.sourceInfoMarkerRow,
            styles.sourceInfoMarkerRowIntelligence,
          ]}
        >
          <SourceInfoVerdictPreview kind="intelligence" verdict="Avoid" />
          <Text style={styles.sourceInfoMarkerText}>
            This icon appears immediately after the menu item name when
            Ingredient Intelligence contributes the Avoid signal.
          </Text>
        </View>
      </SourceInfoSection>
      <SourceInfoSection title="Still confirm before ordering">
        <Text style={styles.sourceInfoBody}>
          Menus, suppliers, recipes, and kitchen practices can change. Treat
          Ingredient Intelligence as an extra caution signal, then confirm with
          staff before ordering if an allergy could affect your health.
        </Text>
      </SourceInfoSection>
    </View>
  );
}

function SourceInfoSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <View style={styles.sourceInfoSection}>
      <Text style={styles.sourceInfoSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SourceInfoVerdictPreview({
  kind,
  verdict,
}: {
  kind: SourceBadgeTone;
  verdict: string;
}) {
  return (
    <View style={styles.sourceInfoVerdictPreview}>
      {kind === "official" ? (
        <OfficialSourceIconBadge />
      ) : (
        <IngredientIntelligenceIconBadge />
      )}
      <Text style={styles.sourceInfoVerdictPreviewText}>{verdict}</Text>
    </View>
  );
}

function AnimatedNavButton({
  Icon,
  iconStyle,
  label,
  onPress,
  size = 20,
  strokeWidth = 2.35,
  style,
}: {
  Icon: LucideIcon;
  iconStyle: AnimatedViewStyle;
  label: string;
  onPress: () => void;
  size?: number;
  strokeWidth?: number;
  style: AnimatedPressableStyle;
}) {
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.navButton, style]}
    >
      <IconButtonSurface />
      <Animated.View style={iconStyle}>
        <Icon color={colors.primary} size={size} strokeWidth={strokeWidth} />
      </Animated.View>
    </AnimatedPressable>
  );
}

function MenuSearchModal({
  items,
  onClose,
  onPressItem,
  officialAllergenProfiles,
  query,
  restaurantId,
  selectedAllergyIds,
  setQuery,
  visible,
}: {
  items: MenuItem[];
  onClose: () => void;
  onPressItem: (item: MenuItem) => void;
  officialAllergenProfiles?: Restaurant["officialAllergenProfiles"];
  query: string;
  restaurantId: string;
  selectedAllergyIds: string[];
  setQuery: (query: string) => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const debouncedQuery = useDebouncedValue(query, 180);
  const normalizedQuery = debouncedQuery.trim().toLowerCase();
  const hasSearchQuery = normalizedQuery.length > 0;
  const lastReportedQuery = useRef("");
  const matchingItems = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return items
      .map((item, index) => ({
        index,
        item,
        rank: getMenuItemSearchRank(item, normalizedQuery),
      }))
      .filter((result) => result.rank !== null)
      .sort(
        (left, right) => left.rank! - right.rank! || left.index - right.index,
      )
      .map((result) => result.item);
  }, [items, normalizedQuery]);

  useEffect(() => {
    if (!normalizedQuery || lastReportedQuery.current === normalizedQuery) return;
    lastReportedQuery.current = normalizedQuery;
    telemetry.track("menu_search_used", {
      outcome: matchingItems.length > 0 ? "success" : "empty",
      restaurant_id: restaurantId,
      result_count_bucket: bucketCount(matchingItems.length),
    });
  }, [matchingItems.length, normalizedQuery, restaurantId]);

  const renderSearchResult: ListRenderItem<MenuItem> = ({ index, item }) => (
    <MenuRow
      first={index === 0}
      item={item}
      last={index === matchingItems.length - 1}
      onSelect={onPressItem}
      safety={getMenuItemSafety(
        item,
        selectedAllergyIds,
        officialAllergenProfiles,
      )}
    />
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View
        style={[
          styles.searchModalRoot,
          {
            paddingBottom: insets.bottom,
            paddingTop: Math.max(insets.top, spacing.two),
          },
        ]}
      >
        <View style={styles.searchModalHeader}>
          <View style={styles.searchModalField}>
            <Search color={colors.muted} size={19} strokeWidth={2.4} />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              onChangeText={setQuery}
              placeholder="Search menu"
              placeholderTextColor="#8E8E93"
              returnKeyType="search"
              style={styles.searchModalInput}
              value={query}
            />
            {query ? (
              <Pressable
                accessibilityLabel="Clear menu search"
                accessibilityRole="button"
                onPress={() => setQuery("")}
                style={styles.clearSearchButton}
              >
                <X color={colors.muted} size={16} strokeWidth={2.4} />
              </Pressable>
            ) : null}
          </View>
          <ModalIconButton
            Icon={X}
            label="Close menu search"
            onPress={onClose}
          />
        </View>

        <FlatList
          contentContainerStyle={styles.searchResultsContent}
          data={matchingItems}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            hasSearchQuery ? (
              <View style={styles.searchEmptyState}>
                <Text style={styles.searchEmptyTitle}>No menu matches</Text>
                <Text style={styles.searchEmptyCopy}>
                  Try another item, category, or allergen.
                </Text>
              </View>
            ) : null
          }
          renderItem={renderSearchResult}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </Modal>
  );
}

function MenuFilterChip({
  active,
  count,
  label,
  onPress,
}: {
  active: boolean;
  count: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text
        maxFontSizeMultiplier={1.08}
        numberOfLines={1}
        style={[styles.filterCount, active && styles.filterChipTextActive]}
      >
        {count}
      </Text>
      <Text
        maxFontSizeMultiplier={1.08}
        numberOfLines={1}
        style={[styles.filterText, active && styles.filterChipTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const MenuRow = memo(function MenuRow({
  first,
  item,
  last,
  onSelect,
  safety,
}: {
  first: boolean;
  item: MenuItem;
  last: boolean;
  onSelect: (item: MenuItem) => void;
  safety: ReturnType<typeof getMenuItemSafety>;
}) {
  const isAvoid = safety.status === "avoid";
  const isCaution = safety.status === "caution";
  const statusLabel =
    safety.status === "unknown"
      ? "Set allergies"
      : isAvoid
        ? "Avoid"
        : isCaution
          ? "Review"
          : "Ok";
  const primaryNotice = getMenuRowPrimaryNotice(
    item,
    safety,
    safety.status === "unknown" ? 0 : 1,
  );
  const showIngredientIntelligenceMarker = hasIngredientIntelligence(item);
  const rowAllergenIcons = getMenuRowAllergenIconIds(item, safety);
  const highlightedAllergenIds = primaryNotice?.allergenIds ?? [];
  const showNoticeRow = Boolean(primaryNotice) || rowAllergenIcons.length > 0;
  const showVerdict = isAvoid || isCaution;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onSelect(item)}
      style={[
        styles.menuRow,
        first && styles.menuRowTop,
        last ? styles.menuRowBottom : styles.rowDivider,
      ]}
    >
      <View style={styles.menuText}>
        <View style={styles.menuNameRow}>
          <Text style={styles.menuName}>{item.name}</Text>
          {showIngredientIntelligenceMarker ? (
            <IngredientIntelligenceIconBadge />
          ) : null}
        </View>
        {showNoticeRow ? (
          <View style={styles.menuNoticeRow}>
            {primaryNotice ? (
              <Text
                style={[
                  styles.menuNotice,
                  primaryNotice.tone === "avoid" && styles.menuNoticeAvoid,
                ]}
              >
                {primaryNotice.label}
              </Text>
            ) : null}
            {rowAllergenIcons.length > 0 ? (
              <AllergyIconChips
                allergyIds={rowAllergenIcons}
                compact
                crossContact={Boolean(primaryNotice?.crossContact)}
                emptyLabel={null}
                highlightedIds={highlightedAllergenIds}
                maxVisible={6}
                overlap
                overlapOffset={-4}
                preserveOrder
                size={18}
                style={styles.menuNoticeIcons}
              />
            ) : null}
          </View>
        ) : null}
      </View>
      {showVerdict ? (
        <View style={styles.menuVerdictCluster}>
          <View
            accessibilityLabel={statusLabel}
            style={[
              styles.menuStatusPill,
              isAvoid
                ? styles.menuStatusPillAvoid
                : styles.menuStatusPillReview,
            ]}
          >
            <Text
              maxFontSizeMultiplier={1.08}
              numberOfLines={1}
              style={[
                styles.menuStatusText,
                isAvoid
                  ? styles.menuStatusTextAvoid
                  : styles.menuStatusTextReview,
              ]}
            >
              {statusLabel}
            </Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
});

function getMenuRowAllergenIconIds(
  item: MenuItem,
  safety: ReturnType<typeof getMenuItemSafety>,
) {
  const matchedIds = [
    ...safety.directMatches,
    ...safety.cautionMatches,
    ...safety.inferredMatches,
  ];
  const allIds = [
    ...matchedIds,
    ...(item.allergenSourceType !== "unavailable" ? item.allergens : []),
    ...(item.allergenSourceType !== "unavailable" ? (item.mayContain ?? []) : []),
    ...(item.allergenSourceType === "unavailable"
      ? (item.inferredAllergenSignals ?? []).map((signal) => signal.id)
      : []),
  ];

  return Array.from(new Set(allIds));
}

function getMenuRowPrimaryNotice(
  item: MenuItem,
  safety: ReturnType<typeof getMenuItemSafety>,
  selectedAllergyCount: number,
) {
  if (safety.directMatchLabels.length > 0) {
    return {
      label: `Contains ${safety.directMatchLabels.join(", ")}`,
      allergenIds: safety.directMatches,
      crossContact: false,
      kind: "official" as const,
      tone: "avoid" as const,
    };
  }

  if (safety.crossContactMatchLabels.length > 0) {
    return {
      label: `Cross-contact: ${safety.crossContactMatchLabels.join(", ")}`,
      allergenIds: safety.cautionMatches,
      crossContact: true,
      kind: "official" as const,
      tone: "review" as const,
    };
  }

  if (safety.inferredMatchLabels.length > 0) {
    return {
      label: `Ingredient Intelligence: ${safety.inferredMatchLabels.join(", ")}`,
      allergenIds: safety.inferredMatches,
      crossContact: false,
      kind: "inferred" as const,
      tone: "review" as const,
    };
  }

  if (hasIngredientIntelligence(item)) {
    const inferredAllergenIds = Array.from(
      new Set((item.inferredAllergenSignals ?? []).map((signal) => signal.id)),
    );
    const inferredLabels = inferredAllergenIds.map(getAllergenLabel);

    return {
      label:
        inferredLabels.length > 0
          ? `Ingredient Intelligence: ${inferredLabels.join(", ")}`
          : "Ingredient Intelligence: no signals identified",
      allergenIds: inferredAllergenIds,
      crossContact: false,
      kind: "inferred" as const,
      tone: "review" as const,
    };
  }

  if (safety.officialAllergenDataUnavailable && selectedAllergyCount > 0) {
    return {
      label: "Official allergen info unavailable",
      allergenIds: [],
      crossContact: false,
      kind: "unavailable" as const,
      tone: "review" as const,
    };
  }

  return null;
}

function OfficialSourceIconBadge({
  size = "menu",
}: {
  size?: "menu" | "modal";
}) {
  if (size === "menu") {
    return (
      <ShieldCheck
        accessibilityLabel="Official source"
        color={colors.primary}
        size={16}
        strokeWidth={2.35}
        style={styles.officialSourceInlineIcon}
      />
    );
  }

  return (
    <View
      accessibilityLabel="Official source"
      style={[
        styles.officialSourceIconBadge,
        styles.officialSourceIconBadgeModal,
      ]}
    >
      <ShieldCheck color={colors.primary} size={16} strokeWidth={2.45} />
    </View>
  );
}

function IngredientIntelligenceIconBadge({
  size = "menu",
}: {
  size?: "menu" | "modal";
}) {
  if (size === "menu") {
    return (
      <Sparkles
        accessibilityLabel="Ingredient Intelligence"
        color="#B25E00"
        size={15}
        strokeWidth={2.45}
        style={styles.ingredientIntelligenceInlineIcon}
      />
    );
  }

  return (
    <View
      accessibilityLabel="Ingredient Intelligence"
      style={[
        styles.ingredientIntelligenceIconBadge,
        size === "modal" && styles.sourceIconBadgeModal,
      ]}
    >
      <Sparkles
        color="#B25E00"
        size={size === "modal" ? 16 : 14}
        strokeWidth={2.45}
      />
    </View>
  );
}

const menuCategoryOrderRules: { match: RegExp; rank: number }[] = [
  {
    match: /\b(breakfast|brunch|morning|omelet|omelette|pancake|waffle)\b/i,
    rank: 10,
  },
  { match: /\b(appetizer|starter|snack|share|small plate|first)\b/i, rank: 20 },
  { match: /\b(soup|salad|greens?)\b/i, rank: 30 },
  {
    match:
      /\b(lunch|dinner|entree|entrée|main|plate|american|special|classic)\b/i,
    rank: 40,
  },
  {
    match: /\b(burger|sandwich|pizza|pasta|noodle|taco|burrito|bowl)\b/i,
    rank: 50,
  },
  { match: /\b(side|fries|chips|vegetable|crop list)\b/i, rank: 60 },
  { match: /\b(kids|children)\b/i, rank: 70 },
  { match: /\b(dessert|sweet|cake|pie|cookie|ice cream|gelato)\b/i, rank: 80 },
];

const beverageCategoryPattern =
  /\b(?:beverages?|drinks?|refreshments?|soft drinks?|fountain(?: drinks?)?|sodas?|waters?|coffees?|teas?|juices?|lemonades?|smoothies?|shakes?|milkshakes?|slush(?:es|ies)?|cocktails?|mocktails?|wines?|beers?|spirits?|liquor|boba)\b/i;
const beverageCategoryRank = 100;

function compareMenuCategories(leftCategory: string, rightCategory: string) {
  const leftRank = menuCategoryRank(leftCategory);
  const rightRank = menuCategoryRank(rightCategory);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return leftCategory.localeCompare(rightCategory);
}

function menuCategoryRank(category: string) {
  const normalizedCategory = category || "Menu";

  // Beverage sections are always terminal, including mixed labels such as
  // "Breakfast Beverages" that also match an earlier course category.
  if (beverageCategoryPattern.test(normalizedCategory)) {
    return beverageCategoryRank;
  }

  const rule = menuCategoryOrderRules.find((nextRule) =>
    nextRule.match.test(normalizedCategory),
  );

  return rule?.rank ?? 45;
}

function formatAllergyReviewSummary(summary: {
  averageRating: number | null;
  count: number;
}) {
  if (summary.count === 0 || summary.averageRating === null) {
    return "No allergy ratings yet";
  }

  return `${summary.averageRating.toFixed(1)} allergy rating · ${summary.count} review${
    summary.count === 1 ? "" : "s"
  }`;
}

function getRestaurantMetaLine({
  officialItemCount,
  restaurant,
  totalItemCount,
  userLocation,
}: {
  officialItemCount: number;
  restaurant: Restaurant;
  totalItemCount: number;
  userLocation: RestaurantSearchLocation | null;
}) {
  return {
    placeLabel: getRestaurantPlaceLabel(restaurant, userLocation),
    sourceBadges: getRestaurantSourceBadges(
      restaurant,
      officialItemCount,
      totalItemCount,
    ),
  };
}

function getRestaurantPlaceLabel(
  restaurant: Restaurant,
  userLocation: RestaurantSearchLocation | null,
) {
  if (
    userLocation &&
    typeof restaurant.lat === "number" &&
    typeof restaurant.lng === "number"
  ) {
    return formatDistanceMiles(
      haversineMiles(
        userLocation.lat,
        userLocation.lng,
        restaurant.lat,
        restaurant.lng,
      ),
    );
  }

  const region = restaurant.region ?? restaurant.address?.region;
  const city = normalizeCityForRegion(
    restaurant.city ?? restaurant.address?.city,
    region,
  );

  if (city && region) {
    return `${city}, ${region}`;
  }

  return city ?? region ?? "Chain menu";
}

function normalizeCityForRegion(
  city: string | null | undefined,
  region: string | null | undefined,
) {
  if (!city || !region) return city;
  const escapedRegion = region.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return city.replace(new RegExp(`,\\s*${escapedRegion}$`, "i"), "").trim();
}

function getRestaurantSourceBadges(
  restaurant: Restaurant,
  officialItemCount: number,
  totalItemCount: number,
) {
  const inferredItemCount = restaurant.items.filter(
    hasIngredientIntelligence,
  ).length;
  const badges: SourceBadge[] = [];

  if (officialItemCount > 0) {
    badges.push({
      label: `Official source ${officialItemCount}/${totalItemCount}`,
      tone: "official",
    });
  }

  if (inferredItemCount > 0) {
    badges.push({
      label: `Ingredient Intelligence ${inferredItemCount}/${totalItemCount}`,
      tone: "intelligence",
    });
  }

  return badges;
}

function formatDistanceMiles(distanceMiles: number) {
  if (!Number.isFinite(distanceMiles)) {
    return "Nearby";
  }

  return distanceMiles < 10
    ? `${distanceMiles.toFixed(1)} mi`
    : `${Math.round(distanceMiles)} mi`;
}

function haversineMiles(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
) {
  const earthRadiusMiles = 3958.8;
  const startLatRadians = toRadians(startLat);
  const endLatRadians = toRadians(endLat);
  const deltaLat = toRadians(endLat - startLat);
  const deltaLng = toRadians(endLng - startLng);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLatRadians) *
      Math.cos(endLatRadians) *
      Math.sin(deltaLng / 2) ** 2;

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getAllergenLabel(id: string) {
  return allergyOptions.find((option) => option.id === id)?.label ?? id;
}

function getMenuItemSearchRank(item: MenuItem, normalizedQuery: string) {
  const includeInferenceSearchTerms = item.allergenSourceType === "unavailable";

  const weightedFields = [
    { rank: 0, text: item.name },
    { rank: 1, text: item.category },
    { rank: 2, text: item.description },
    { rank: 3, text: item.notes },
    {
      rank: 4,
      text: includeInferenceSearchTerms ? item.inferenceSummary : null,
    },
    ...(includeInferenceSearchTerms ? (item.inferredIngredients ?? []) : []),
    ...item.allergens.map((id) => ({ rank: 2, text: getAllergenLabel(id) })),
    ...(item.mayContain ?? []).map((id) => ({
      rank: 3,
      text: getAllergenLabel(id),
    })),
    ...(includeInferenceSearchTerms
      ? (item.inferredAllergenSignals ?? []).map((signal) => ({
          rank: 3,
          text: getAllergenLabel(signal.id),
        }))
      : []),
  ].map((field) =>
    typeof field === "string" ? { rank: 2, text: field } : field,
  );
  let bestRank: number | null = null;

  for (const field of weightedFields) {
    const text = field.text?.toLowerCase();

    if (!text) {
      continue;
    }

    const fieldRank = getSearchTextRank(text, normalizedQuery);

    if (fieldRank === null) {
      continue;
    }

    const candidateRank = field.rank * 10 + fieldRank;
    bestRank =
      bestRank === null ? candidateRank : Math.min(bestRank, candidateRank);
  }

  if (bestRank !== null) {
    return bestRank;
  }

  const searchable = weightedFields
    .map((field) => field.text)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchable.includes(normalizedQuery) ? 90 : null;
}

function getSearchTextRank(text: string, normalizedQuery: string) {
  if (text.startsWith(normalizedQuery)) {
    return 0;
  }

  const words = text.split(/[^a-z0-9]+/).filter(Boolean);

  if (words.some((word) => word.startsWith(normalizedQuery))) {
    return 1;
  }

  const initials = words.map((word) => word[0]).join("");

  if (initials.startsWith(normalizedQuery)) {
    return 2;
  }

  return text.includes(normalizedQuery) ? 6 : null;
}

const styles = StyleSheet.create({
  accommodationCard: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: "rgba(60,60,67,0.12)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  accommodationCardBody: {
    flex: 1,
    gap: 3,
  },
  accommodationIconShell: {
    alignItems: "center",
    borderRadius: 15,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  accommodationNoticePill: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  accommodationNoticeText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 13,
  },
  accommodationStatus: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16,
  },
  accommodationSummary: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  accommodationTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  allergenGroups: {
    gap: 5,
    marginTop: 5,
  },
  allergenIconChips: {
    marginTop: 0,
  },
  allergenIconGroup: {
    gap: 4,
  },
  allergenIconGroupLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  allergenIconStrip: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  clearSearchButton: {
    alignItems: "center",
    backgroundColor: "rgba(142,142,147,0.14)",
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  categorySectionCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 27,
  },
  categorySectionHeader: {
    alignItems: "center",
    backgroundColor: "transparent",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6,
    paddingTop: 18,
  },
  categorySectionHeaderFirst: {
    paddingTop: 14,
  },
  categorySectionTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 25,
  },
  conflicts: {
    color: "#B25E00",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 5,
  },
  crossContactText: {
    color: "#B25E00",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  crossContactMatch: {
    color: "#B25E00",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  inferredMatch: {
    color: "#265CB9",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  ingredientIntelligenceIconBadge: {
    alignItems: "center",
    backgroundColor: "#FFF6E5",
    borderColor: "rgba(178,94,0,0.2)",
    borderRadius: 7,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  ingredientIntelligenceInlineIcon: {
    marginTop: 1,
  },
  content: {
    paddingBottom: 92,
    paddingHorizontal: spacing.two,
    paddingTop: spacing.two,
  },
  description: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 24,
    marginTop: spacing.two,
  },
  empty: {
    alignItems: "center",
    flex: 1,
    gap: 10,
    justifyContent: "center",
    padding: spacing.three,
  },
  emptyMenu: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: "rgba(17,17,17,0.08)",
    borderCurve: "continuous",
    borderRadius: 22,
    borderWidth: 1,
    boxShadow: "0 10px 28px rgba(17,17,17,0.05)",
    paddingHorizontal: spacing.three,
    paddingVertical: spacing.four,
  },
  emptyMenuCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    textAlign: "center",
  },
  emptyMenuTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  filterCount: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  filterChip: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderColor: "rgba(60,60,67,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: 30,
    paddingHorizontal: 11,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  filterChipList: {
    alignSelf: "stretch",
    marginBottom: spacing.two,
    marginHorizontal: -spacing.two,
  },
  filterChipListContent: {
    gap: 6,
    paddingHorizontal: spacing.two,
  },
  filterText: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  floatingDisclaimer: {
    backgroundColor: "rgba(250,250,252,0.96)",
    borderTopColor: "rgba(60,60,67,0.14)",
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.three,
    paddingTop: 9,
    position: "absolute",
    right: 0,
  },
  floatingDisclaimerText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    textAlign: "center",
  },
  group: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: spacing.two,
    overflow: "hidden",
  },
  headerSourcePill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 5,
    marginTop: 3,
    minHeight: 26,
    paddingHorizontal: 9,
  },
  headerSourceText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  restaurantHeader: {
    alignItems: "center",
    gap: 5,
    marginBottom: spacing.two,
    paddingHorizontal: spacing.two,
    paddingTop: 2,
  },
  restaurantLogoFrame: {
    alignItems: "center",
    borderRadius: 26,
    height: 74,
    justifyContent: "center",
    width: 74,
  },
  restaurantHeaderMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    maxWidth: "100%",
  },
  restaurantHeaderMetaSeparator: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  restaurantHeaderPlaceMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center",
  },
  ratingLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
  },
  ratingLinkText: {
    color: colors.coral,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
  },
  sourceBadge: {
    alignItems: "center",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  sourceBadgeIntelligence: {
    backgroundColor: "#FFF6E5",
    borderColor: "rgba(178,94,0,0.18)",
    borderWidth: 1,
  },
  sourceBadgeOfficial: {
    backgroundColor: colors.primaryLight,
    borderColor: "rgba(0,122,255,0.16)",
    borderWidth: 1,
  },
  sourceBadgeRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
    marginTop: 1,
  },
  sourceBadgeText: {
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 15,
  },
  sourceBadgeTextIntelligence: {
    color: "#B25E00",
  },
  sourceBadgeTextOfficial: {
    color: colors.primary,
  },
  sourceInfoBody: {
    color: "#3C3C43",
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 24,
  },
  sourceInfoCard: {
    gap: 22,
  },
  sourceInfoContent: {
    padding: spacing.three,
    paddingBottom: spacing.four,
    paddingTop: spacing.two,
  },
  sourceInfoKicker: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  sourceInfoMarkerRow: {
    alignItems: "flex-start",
    backgroundColor: "#F6FAFF",
    borderColor: "rgba(0,122,255,0.14)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  sourceInfoMarkerRowIntelligence: {
    backgroundColor: "#FFF8EC",
    borderColor: "rgba(178,94,0,0.16)",
  },
  sourceInfoMarkerText: {
    color: "#3C3C43",
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  sourceInfoVerdictPreview: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.74)",
    borderColor: "rgba(60,60,67,0.1)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  sourceInfoVerdictPreviewText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  sourceInfoSection: {
    gap: 7,
  },
  sourceInfoSectionTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21,
    textTransform: "uppercase",
  },
  sourceInfoTitle: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 31,
  },
  kicker: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 7,
  },
  menuDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
  menuName: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 19,
  },
  menuNameRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 6,
  },
  menuNotice: {
    color: "#6F4B00",
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  menuNoticeAvoid: {
    color: "#B42318",
    fontWeight: "700",
  },
  menuNoticeIcons: {
    flexShrink: 0,
    marginTop: 0,
  },
  menuNoticeRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 3,
  },
  menuToc: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 36,
    paddingBottom: 12,
    paddingHorizontal: spacing.three,
    paddingTop: 8,
  },
  menuTocChip: {
    alignItems: "center",
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 32,
    overflow: "hidden",
    paddingHorizontal: 12,
  },
  menuTocChipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  menuTocChipTextActive: {
    color: colors.primary,
  },
  menuTocListButton: {
    alignItems: "center",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    overflow: "hidden",
    width: 32,
  },
  menuTocReveal: {
    alignSelf: "stretch",
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 44,
  },
  menuTocScroll: {
    flex: 1,
  },
  menuTocScrollContent: {
    alignItems: "center",
    gap: 4,
    paddingRight: spacing.three,
  },
  menuRow: {
    alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderColor: "rgba(17,17,17,0.08)",
    borderCurve: "continuous",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    boxShadow: "0 1px 5px rgba(17,17,17,0.025)",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuRowBottom: {
    borderBottomLeftRadius: 17,
    borderBottomRightRadius: 17,
    borderBottomWidth: 1,
  },
  menuRowTop: {
    borderTopLeftRadius: 17,
    borderTopRightRadius: 17,
    borderTopWidth: 1,
  },
  menuText: {
    flex: 1,
  },
  menuVerdictCluster: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  menuStatusPill: {
    alignItems: "center",
    borderRadius: radius.pill,
    justifyContent: "center",
    marginTop: 0,
    minHeight: 24,
    minWidth: 50,
    paddingHorizontal: 8,
  },
  menuStatusPillAvoid: {
    backgroundColor: "#FFF0F0",
  },
  menuStatusPillOk: {
    backgroundColor: "#F2F2F7",
  },
  menuStatusPillReview: {
    backgroundColor: "#FFF6E5",
  },
  menuStatusText: {
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  menuStatusTextAvoid: {
    color: "#D92D20",
  },
  menuStatusTextOk: {
    color: colors.muted,
  },
  menuStatusTextReview: {
    color: "#B25E00",
  },
  inlineAction: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: spacing.two,
  },
  inlineActionText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  nav: {
    backgroundColor: colors.white,
    minHeight: 64,
    position: "relative",
    zIndex: 4,
  },
  navActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  navButton: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  navLeading: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0,
  },
  navTopRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  navTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
    opacity: 0,
    textAlign: "left",
  },
  notes: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  noListedAllergens: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 5,
  },
  officialSourceIconBadge: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderColor: "rgba(0,122,255,0.18)",
    borderRadius: 7,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    marginTop: 0,
    width: 22,
  },
  officialSourceInlineIcon: {
    marginTop: 2,
  },
  officialSourceIconBadgeModal: {
    borderRadius: 8,
    height: 26,
    width: 26,
  },
  sourceIconBadgeModal: {
    borderRadius: 8,
    height: 26,
    width: 26,
  },
  pendingLabel: {
    alignSelf: "flex-start",
    backgroundColor: "#FFF6E5",
    borderRadius: radius.pill,
    color: "#B25E00",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 10,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  profileActionSublabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 15,
  },
  profileActionSummary: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 0,
  },
  profileActionSummaryIcons: {
    flexShrink: 0,
    marginTop: 0,
  },
  profileActionSummaryText: {
    flexShrink: 1,
    marginTop: 0,
    minWidth: 0,
  },
  rowDivider: {
    borderBottomColor: "rgba(17,17,17,0.075)",
    borderBottomWidth: 1,
  },
  restaurantLoadingOverlay: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: spacing.three,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 20,
  },
  safeArea: {
    flex: 1,
  },
  searchModalField: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 18,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingLeft: 13,
    paddingRight: 8,
  },
  searchModalHeader: {
    alignItems: "center",
    borderBottomColor: "rgba(60,60,67,0.12)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingBottom: 10,
    paddingHorizontal: spacing.two,
    paddingTop: 8,
  },
  searchModalInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    minHeight: 44,
  },
  searchEmptyCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    textAlign: "center",
  },
  searchEmptyState: {
    alignItems: "center",
    paddingHorizontal: spacing.three,
    paddingTop: spacing.four,
  },
  searchEmptyTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  searchModalRoot: {
    backgroundColor: "#FAFAFC",
    flex: 1,
  },
  searchResultsContent: {
    paddingBottom: spacing.four,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  sectionPickerCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 15,
  },
  statusIconBadge: {
    alignItems: "center",
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    marginTop: 1,
    width: 28,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    justifyContent: "center",
    margin: spacing.two,
    marginTop: 0,
    minHeight: 48,
  },
  submitText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 24,
    lineHeight: 30,
  },
  modalKicker: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 29,
  },
  title: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: "800",
    lineHeight: 30,
    marginTop: 4,
    textAlign: "center",
  },
});
