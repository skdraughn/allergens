import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  MessageSquarePlus,
  Search,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { IconButton } from "@/components/icon-button";
import { MenuItemDetailsModal } from "@/components/menu-item-details-modal";
import { ScreenBackground } from "@/components/screen-background";
import { allergyOptions } from "@/constants/allergies";
import { colors, radius, spacing } from "@/constants/theme";
import { getRestaurantBrand } from "@/data/brand-assets";
import { type MenuItem, type Restaurant } from "@/data/restaurants";
import { useAllergyProfile } from "@/features/profile/allergy-profile-context";
import { useRestaurantData } from "@/features/restaurants/restaurant-data-context";
import { getMenuItemSafety, getRestaurantSafety } from "@/lib/safety";

type MenuFilter = "all" | "ok" | "avoid";
type MenuCategoryFilter = "all" | string;
type MenuListRow =
  | { id: string; type: "header"; category: string; count: number }
  | { id: string; type: "item"; item: MenuItem; last: boolean }
  | { id: string; type: "empty" };

const filters: Array<{ id: MenuFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "ok", label: "Looks OK" },
  { id: "avoid", label: "Avoid" },
];

export function RestaurantScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedAllergyIds } = useAllergyProfile();
  const { getRestaurantById } = useRestaurantData();
  const [filter, setFilter] = useState<MenuFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<MenuCategoryFilter>("all");
  const [menuQuery, setMenuQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const restaurant = getRestaurantById(id);
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/home");
  };

  const menuCategories = useMemo(() => {
    if (!restaurant) {
      return [];
    }

    const byCategory = new Map<string, number>();

    for (const item of restaurant.items) {
      const category = item.category || restaurant.category;
      byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
    }

    return Array.from(byCategory.entries()).map(([category, count]) => ({
      category,
      count,
    }));
  }, [restaurant]);

  const filteredItems = useMemo(() => {
    if (!restaurant) {
      return [];
    }

    const normalizedQuery = menuQuery.trim().toLowerCase();

    return restaurant.items.filter((item) => {
      const safety = getMenuItemSafety(item, selectedAllergyIds);

      if (categoryFilter !== "all" && item.category !== categoryFilter) {
        return false;
      }

      if (filter === "ok") {
        return safety.status === "ok";
      }

      if (filter === "avoid") {
        return safety.status === "avoid" || safety.status === "caution";
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchable = [
        item.name,
        item.category,
        item.description,
        item.notes,
        ...item.allergens.map(getAllergenLabel),
        ...((item.mayContain ?? []).map(getAllergenLabel)),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [categoryFilter, filter, menuQuery, restaurant, selectedAllergyIds]);

  const menuRows = useMemo<MenuListRow[]>(() => {
    if (filteredItems.length === 0) {
      return [{ id: "empty", type: "empty" }];
    }

    const sections = new Map<string, MenuItem[]>();

    for (const item of filteredItems) {
      const category = item.category || "Menu";
      sections.set(category, [...(sections.get(category) ?? []), item]);
    }

    return Array.from(sections.entries()).flatMap(([category, items]) => {
      const showHeader = categoryFilter === "all" || sections.size > 1;
      const rows: MenuListRow[] = showHeader
        ? [{ id: `header-${category}`, type: "header", category, count: items.length }]
        : [];

      rows.push(
        ...items.map((item, index) => ({
          id: item.id,
          item,
          last: index === items.length - 1,
          type: "item" as const,
        })),
      );

      return rows;
    });
  }, [categoryFilter, filteredItems]);

  if (!restaurant) {
    return (
      <ScreenBackground>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.nav}>
            <IconButton Icon={ChevronLeft} label="Back" onPress={goBack} />
          </View>
          <View style={styles.empty}>
            <Text style={styles.title}>Restaurant not found</Text>
          </View>
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const summary = getRestaurantSafety(restaurant, selectedAllergyIds);
  const brand = getRestaurantBrand(restaurant.id);
  const renderMenuRow: ListRenderItem<MenuListRow> = ({ item }) => {
    if (item.type === "header") {
      return (
        <View style={styles.categorySectionHeader}>
          <Text style={styles.categorySectionTitle}>{item.category}</Text>
          <Text style={styles.categorySectionCount}>{item.count}</Text>
        </View>
      );
    }

    if (item.type === "empty") {
      return (
        <View style={styles.emptyMenu}>
          <Text style={styles.emptyMenuTitle}>No menu matches</Text>
          <Text style={styles.emptyMenuCopy}>Try another item, category, or allergen.</Text>
        </View>
      );
    }

    return (
      <MenuRow
        item={item.item}
        last={item.last}
        onPress={() => setSelectedItem(item.item)}
        selectedAllergyIds={selectedAllergyIds}
      />
    );
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.nav}>
          <IconButton Icon={ChevronLeft} label="Back" onPress={goBack} />
          <Pressable
            accessibilityRole="button"
            onPress={() => Linking.openURL(restaurant.guideUrl)}
            style={styles.sourceButton}
          >
            <ExternalLink color={colors.primary} size={20} strokeWidth={2.35} />
          </Pressable>
        </View>

        <FlatList
          ListFooterComponent={
            <>
              <View style={styles.group}>
                <View style={styles.communityRow}>
                  <View style={styles.communityIcon}>
                    <MessageSquarePlus color={colors.primary} size={22} strokeWidth={2.35} />
                  </View>
                  <View style={styles.communityText}>
                    <Text style={styles.communityTitle}>Submit a menu review</Text>
                    <Text style={styles.communityCopy}>
                      Flag an outdated allergen listing or add a missing item for review.
                    </Text>
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSubmitted(true)}
                  style={styles.submitButton}
                >
                  <Text style={styles.submitText}>
                    {submitted ? "Queued for review" : "Add community note"}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.disclaimer}>
                Use official restaurant allergen guides and staff confirmation before ordering.
              </Text>
            </>
          }
          ListHeaderComponent={
            <>
              <View style={[styles.heroCard, { backgroundColor: `${brand.color}14` }]}>
                <Image source={{ uri: brand.logoUrl }} style={styles.heroLogo} />
              </View>

              <View style={styles.copyBlock}>
                <Text style={styles.kicker}>#{restaurant.rank} · {restaurant.category}</Text>
                <Text style={styles.title}>{restaurant.name}</Text>
                <Text style={styles.description}>{brand.description}</Text>
              </View>

              <View style={styles.summaryGroup}>
                <SummaryMetric label="Avoid" value={summary.avoidCount} tone="warning" />
                <SummaryMetric label="Review" value={summary.cautionCount} tone="caution" />
                <SummaryMetric label="Looks OK" value={summary.okCount} tone="ok" />
              </View>

              <AllergenSourceSummary restaurant={restaurant} />

              <View style={styles.searchGroup}>
                <Search color={colors.muted} size={20} strokeWidth={2.4} />
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setMenuQuery}
                  placeholder="Search menu"
                  placeholderTextColor="#8E8E93"
                  style={styles.searchInput}
                  value={menuQuery}
                />
                {menuQuery ? (
                  <Pressable
                    accessibilityLabel="Clear menu search"
                    accessibilityRole="button"
                    onPress={() => setMenuQuery("")}
                    style={styles.clearSearchButton}
                  >
                    <X color={colors.muted} size={16} strokeWidth={2.4} />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.filters}>
                {filters.map((nextFilter) => (
                  <Pressable
                    accessibilityRole="button"
                    key={nextFilter.id}
                    onPress={() => setFilter(nextFilter.id)}
                    style={[
                      styles.filterButton,
                      filter === nextFilter.id && styles.filterButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        filter === nextFilter.id && styles.filterTextActive,
                      ]}
                    >
                      {nextFilter.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <CategoryRail
                categories={menuCategories}
                onSelect={setCategoryFilter}
                selectedCategory={categoryFilter}
                totalCount={restaurant.items.length}
              />

              <View style={styles.groupTop} />
            </>
          }
          contentContainerStyle={styles.content}
          data={menuRows}
          initialNumToRender={16}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          maxToRenderPerBatch={18}
          renderItem={renderMenuRow}
          showsVerticalScrollIndicator={false}
          windowSize={9}
        />

        <MenuItemDetailsModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          selectedAllergyIds={selectedAllergyIds}
        />
      </SafeAreaView>
    </ScreenBackground>
  );
}

function AllergenSourceSummary({ restaurant }: { restaurant: Restaurant }) {
  const sourceUrl = restaurant.sourceUrls?.[0] ?? restaurant.guideUrl;
  const sourceHost = getSourceHost(sourceUrl);
  const officialCount =
    restaurant.allergenDataStatus?.officialItemCount ??
    restaurant.items.filter((item) => item.allergenSourceType !== "unavailable").length;
  const itemCount = restaurant.items.length;
  const sourceTypes = getRestaurantSourceTypeLabels(restaurant);

  return (
    <View style={styles.sourceSummary}>
      <View style={styles.sourceSummaryIcon}>
        <ExternalLink color={colors.primary} size={18} strokeWidth={2.35} />
      </View>
      <View style={styles.sourceSummaryText}>
        <Text style={styles.sourceSummaryTitle}>Allergen information source</Text>
        <Text style={styles.sourceSummaryBody}>
          Official restaurant sources for {officialCount}/{itemCount} menu items
          {sourceTypes ? ` · ${sourceTypes}` : ""}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => Linking.openURL(sourceUrl)}
          style={styles.sourceSummaryLink}
        >
          <Text style={styles.sourceSummaryLinkText}>Open {sourceHost}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SummaryMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "warning" | "caution" | "ok";
  value: number;
}) {
  const toneStyle =
    tone === "ok" ? styles.metricOk : tone === "caution" ? styles.metricCaution : styles.metricWarn;

  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, toneStyle]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function CategoryRail({
  categories,
  onSelect,
  selectedCategory,
  totalCount,
}: {
  categories: Array<{ category: string; count: number }>;
  onSelect: (category: MenuCategoryFilter) => void;
  selectedCategory: MenuCategoryFilter;
  totalCount: number;
}) {
  if (categories.length <= 1) {
    return null;
  }

  return (
    <View style={styles.categoryRailBlock}>
      <ScrollView
        contentContainerStyle={styles.categoryRail}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <CategoryChip
          active={selectedCategory === "all"}
          count={totalCount}
          label="All categories"
          onPress={() => onSelect("all")}
        />
        {categories.map((category) => (
          <CategoryChip
            active={selectedCategory === category.category}
            count={category.count}
            key={category.category}
            label={category.category}
            onPress={() => onSelect(category.category)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function CategoryChip({
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
      style={[styles.categoryChip, active && styles.categoryChipActive]}
    >
      <Text style={[styles.categoryChipLabel, active && styles.categoryChipLabelActive]}>
        {label}
      </Text>
      <Text style={[styles.categoryChipCount, active && styles.categoryChipCountActive]}>
        {count}
      </Text>
    </Pressable>
  );
}

function MenuCategorySection({
  last,
  onItemPress,
  section,
  selectedAllergyIds,
  showHeader,
}: {
  last: boolean;
  onItemPress: (item: MenuItem) => void;
  section: { category: string; items: MenuItem[] };
  selectedAllergyIds: string[];
  showHeader: boolean;
}) {
  return (
    <View style={!last && styles.categorySectionDivider}>
      {showHeader ? (
        <View style={styles.categorySectionHeader}>
          <Text style={styles.categorySectionTitle}>{section.category}</Text>
          <Text style={styles.categorySectionCount}>{section.items.length}</Text>
        </View>
      ) : null}
      {section.items.map((item, index) => (
        <MenuRow
          item={item}
          key={item.id}
          last={index === section.items.length - 1}
          onPress={() => onItemPress(item)}
          selectedAllergyIds={selectedAllergyIds}
        />
      ))}
    </View>
  );
}

function MenuRow({
  item,
  last,
  onPress,
  selectedAllergyIds,
}: {
  item: MenuItem;
  last: boolean;
  onPress: () => void;
  selectedAllergyIds: string[];
}) {
  const safety = getMenuItemSafety(item, selectedAllergyIds);
  const isAvoid = safety.status === "avoid";
  const isCaution = safety.status === "caution";
  const Icon: LucideIcon = isAvoid || isCaution ? AlertTriangle : CheckCircle2;
  const tone = isAvoid ? "#FF3B30" : isCaution ? "#FF9F0A" : "#34C759";
  const statusLabel =
    safety.status === "unknown"
      ? "Set allergies"
      : isAvoid
        ? "Avoid"
        : isCaution
          ? "Review"
          : "Looks OK";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.menuRow, !last && styles.rowDivider]}
    >
      <View style={styles.menuText}>
        <Text style={styles.menuName}>{item.name}</Text>
        <View style={styles.menuMetaRow}>
          <Text style={styles.menuMeta}>{item.category}</Text>
          <Icon color={tone} size={15} strokeWidth={2.5} />
        </View>
        {safety.matchedLabels.length > 0 ? (
          <Text style={styles.conflicts}>Matches {safety.matchedLabels.join(", ")}</Text>
        ) : null}
        <AllergenIconStrip item={item} selectedAllergyIds={selectedAllergyIds} />
      </View>
      <Text style={[styles.statusLabel, { color: tone }]}>{statusLabel}</Text>
    </Pressable>
  );
}

function AllergenIconStrip({
  item,
  selectedAllergyIds,
}: {
  item: MenuItem;
  selectedAllergyIds: string[];
}) {
  const icons = getAllergenIcons(item);

  if (icons.length === 0) {
    return <Text style={styles.noListedAllergens}>No listed allergens</Text>;
  }

  return (
    <View style={styles.allergenIconStrip}>
      {icons.map((allergen) => {
        const selected = selectedAllergyIds.includes(allergen.id);
        const Icon = allergen.option.Icon;

        return (
          <View
            accessibilityLabel={allergen.label}
            key={`${allergen.tone}-${allergen.id}`}
            style={[
              styles.allergenIconPill,
              { backgroundColor: allergen.option.surface },
              allergen.tone === "mayContain" && styles.mayContainIconPill,
              selected && styles.selectedAllergenIconPill,
            ]}
          >
            <Icon
              color={selected ? "#B42318" : allergen.option.accent}
              size={15}
              strokeWidth={2.4}
            />
          </View>
        );
      })}
    </View>
  );
}

function getAllergenIcons(item: MenuItem) {
  const direct = item.allergens.flatMap((id) => {
    const option = allergyOptions.find((nextOption) => nextOption.id === id);

    return option
      ? [
          {
            id,
            label: getAllergenLabel(id),
            option,
            tone: "direct" as const,
          },
        ]
      : [];
  });
  const mayContain = (item.mayContain ?? []).flatMap((id) => {
    const option = allergyOptions.find((nextOption) => nextOption.id === id);

    return option
      ? [
          {
            id,
            label: `May contain ${getAllergenLabel(id)}`,
            option,
            tone: "mayContain" as const,
          },
        ]
      : [];
  });

  return [...direct, ...mayContain];
}

function getAllergenLabel(id: string) {
  return allergyOptions.find((option) => option.id === id)?.label ?? id;
}

function getRestaurantSourceTypeLabels(restaurant: Restaurant) {
  const labels = Array.from(
    new Set(
      restaurant.items
        .map((item) => item.sourceType)
        .filter((sourceType): sourceType is string => Boolean(sourceType))
        .map(getSourceTypeLabel),
    ),
  );

  if (labels.length === 0) {
    return null;
  }

  return labels.slice(0, 2).join(" + ");
}

function getSourceTypeLabel(sourceType: string) {
  const sourceTypeLabels: Record<string, string> = {
    "html-allergen-matrix": "allergen table",
    "official-api": "restaurant API",
    "pdf-ingredients": "ingredient PDF",
    "pdf-matrix": "PDF guide",
    "product-page": "product pages",
  };

  return sourceTypeLabels[sourceType] ?? sourceType.replaceAll("-", " ");
}

function getSourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "official source";
  }
}

const styles = StyleSheet.create({
  allergenIconPill: {
    alignItems: "center",
    borderRadius: 15,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  allergenIconStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  clearSearchButton: {
    alignItems: "center",
    backgroundColor: "rgba(142,142,147,0.14)",
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  categoryChip: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  categoryChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  categoryChipCount: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  categoryChipCountActive: {
    color: "rgba(255,255,255,0.72)",
  },
  categoryChipLabel: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  categoryChipLabelActive: {
    color: colors.white,
  },
  categoryRail: {
    gap: 8,
    paddingRight: spacing.three,
  },
  categoryRailBlock: {
    marginBottom: spacing.two,
  },
  categorySectionCount: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  categorySectionDivider: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
  },
  categorySectionHeader: {
    alignItems: "center",
    backgroundColor: "#FAFAFC",
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.two,
    paddingVertical: 11,
  },
  categorySectionTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  communityCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
  communityIcon: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  communityRow: {
    flexDirection: "row",
    gap: 12,
    padding: spacing.two,
  },
  communityText: {
    flex: 1,
  },
  communityTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  conflicts: {
    color: "#B25E00",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 5,
  },
  content: {
    paddingBottom: spacing.four,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.four,
  },
  copyBlock: {
    marginBottom: spacing.three,
    paddingHorizontal: spacing.one,
  },
  disclaimer: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.two,
    paddingHorizontal: spacing.one,
  },
  description: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 24,
    marginTop: spacing.two,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.three,
  },
  emptyMenu: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderLeftWidth: 1,
    borderRightWidth: 1,
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
  filterButton: {
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  filterTextActive: {
    color: colors.white,
  },
  filters: {
    flexDirection: "row",
    gap: 8,
    marginBottom: spacing.two,
  },
  group: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: spacing.two,
    overflow: "hidden",
  },
  groupTop: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    height: 12,
    overflow: "hidden",
  },
  heroCard: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 34,
    height: 116,
    justifyContent: "center",
    marginBottom: spacing.three,
    width: 116,
  },
  heroLogo: {
    borderRadius: 22,
    height: 72,
    width: 72,
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
  menuMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  menuMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
  },
  menuName: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  menuRow: {
    alignItems: "flex-start",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: spacing.two,
    paddingVertical: 12,
  },
  menuText: {
    flex: 1,
  },
  mayContainIconPill: {
    borderColor: "rgba(178,94,0,0.24)",
    borderWidth: 1,
  },
  metric: {
    alignItems: "center",
    flex: 1,
    paddingVertical: 15,
  },
  metricCaution: {
    color: "#FF9F0A",
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  metricOk: {
    color: "#34C759",
  },
  metricValue: {
    fontSize: 28,
    fontWeight: "800",
  },
  metricWarn: {
    color: "#FF3B30",
  },
  nav: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.three,
    paddingTop: spacing.one,
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
    marginTop: 10,
  },
  rowDivider: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
  },
  safeArea: {
    flex: 1,
  },
  searchGroup: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 10,
    marginBottom: spacing.two,
    minHeight: 54,
    paddingHorizontal: spacing.two,
  },
  searchInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    minHeight: 54,
  },
  selectedAllergenIconPill: {
    backgroundColor: "#FFE9E7",
    borderColor: "rgba(255,59,48,0.25)",
    borderWidth: 1,
  },
  sourceButton: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  sourceSummary: {
    alignItems: "flex-start",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: spacing.two,
    padding: spacing.two,
  },
  sourceSummaryBody: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: 3,
  },
  sourceSummaryIcon: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: 19,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  sourceSummaryLink: {
    alignSelf: "flex-start",
    marginTop: 8,
  },
  sourceSummaryLinkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  sourceSummaryText: {
    flex: 1,
  },
  sourceSummaryTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: "800",
    maxWidth: 82,
    textAlign: "right",
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
  summaryGroup: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: spacing.two,
    overflow: "hidden",
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "700",
    lineHeight: 40,
  },
});
