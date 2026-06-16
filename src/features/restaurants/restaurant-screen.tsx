import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  Flag,
  MessageCircle,
  MessageSquarePlus,
  Plus,
  Search,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/icon-button";
import { MenuItemDetailsModal } from "@/components/menu-item-details-modal";
import { ModalScreen } from "@/components/modal-screen";
import { RestaurantLogo } from "@/components/restaurant-logo";
import { ScreenBackground } from "@/components/screen-background";
import { allergyOptions } from "@/constants/allergies";
import { colors, radius, spacing } from "@/constants/theme";
import { getRestaurantBrand } from "@/data/brand-assets";
import { type MenuItem, type Restaurant } from "@/data/restaurants";
import {
  CommunityContributionModal,
  type ContributionMode,
} from "@/features/community/community-contribution-modal";
import { type CommunityComment } from "@/features/community/community-service";
import { useRestaurantCommunity } from "@/features/community/use-restaurant-community";
import { useAllergyProfile } from "@/features/profile/allergy-profile-context";
import { useRestaurantData } from "@/features/restaurants/restaurant-data-context";
import { getMenuItemSafety, getRestaurantSafety } from "@/lib/safety";

type MenuFilter = "all" | "ok" | "caution" | "avoid";
type RestaurantTab = "official" | "community";
type MenuCategoryFilter = "all" | string;
type MenuListRow =
  | { id: string; type: "header"; category: string; count: number }
  | { id: string; type: "item"; item: MenuItem; last: boolean }
  | { id: string; type: "empty" };

const filters: Array<{ id: MenuFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "ok", label: "Looks OK" },
  { id: "caution", label: "Review" },
  { id: "avoid", label: "Avoid" },
];

export function RestaurantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedAllergyIds } = useAllergyProfile();
  const { getRestaurantById } = useRestaurantData();
  const [activeTab, setActiveTab] = useState<RestaurantTab>("official");
  const [filter, setFilter] = useState<MenuFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<MenuCategoryFilter>("all");
  const [contributionItem, setContributionItem] = useState<MenuItem | null>(null);
  const [contributionMode, setContributionMode] = useState<ContributionMode | null>(null);
  const [menuQuery, setMenuQuery] = useState("");
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const restaurant = getRestaurantById(id);
  const community = useRestaurantCommunity(restaurant?.id ?? "");
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

      const matchesStatus =
        filter === "all" ||
        (filter === "ok" && safety.status === "ok") ||
        (filter === "caution" && safety.status === "caution") ||
        (filter === "avoid" && safety.status === "avoid");

      if (!matchesStatus) {
        return false;
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
  const communitySnapshot = community.data ?? { comments: [], items: [] };
  const openContribution = (mode: ContributionMode, item: MenuItem | null = null) => {
    setContributionItem(item);
    setContributionMode(mode);
  };
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
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <View style={styles.nav}>
          <IconButton Icon={ChevronLeft} label="Back" onPress={goBack} />
          <View style={styles.navActions}>
            <SourceBadge onPress={() => setSourceModalVisible(true)} restaurant={restaurant} />
            <Pressable
              accessibilityRole="button"
              onPress={() => Linking.openURL(restaurant.guideUrl)}
              style={styles.sourceButton}
            >
              <ExternalLink color={colors.primary} size={20} strokeWidth={2.35} />
            </Pressable>
          </View>
        </View>

        <FlatList
          ListHeaderComponent={
            <>
              <View style={[styles.heroCard, { backgroundColor: `${brand.color}14` }]}>
                <RestaurantLogo brand={brand} borderRadius={22} size={72} />
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

              <RestaurantTabs activeTab={activeTab} onSelect={setActiveTab} />

              {activeTab === "official" ? (
                <>
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
              ) : (
                <CommunityTab
                  comments={communitySnapshot.comments}
                  isLoading={community.isFetching}
                  items={communitySnapshot.items}
                  onAddItem={() => openContribution("menu-item")}
                  onCommentRestaurant={() => openContribution("comment")}
                  onCommentItem={(item) => openContribution("comment", item)}
                  onPressItem={setSelectedItem}
                  onReportRestaurant={() => openContribution("report")}
                  onReportItem={(item) => openContribution("report", item)}
                  selectedAllergyIds={selectedAllergyIds}
                />
              )}
            </>
          }
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom + 78, 94) },
          ]}
          data={activeTab === "official" ? menuRows : []}
          initialNumToRender={16}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          maxToRenderPerBatch={18}
          renderItem={renderMenuRow}
          showsVerticalScrollIndicator={false}
          windowSize={9}
        />

        <View
          pointerEvents="none"
          style={[styles.floatingDisclaimer, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          <Text style={styles.floatingDisclaimerText}>
            Confirm official allergen information with staff before ordering.
          </Text>
        </View>

        <MenuItemDetailsModal
          item={selectedItem}
          onComment={(item) => {
            setSelectedItem(null);
            openContribution("comment", item);
          }}
          onClose={() => setSelectedItem(null)}
          onReport={(item) => {
            setSelectedItem(null);
            openContribution("report", item);
          }}
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
        <SourceInfoModal
          onClose={() => setSourceModalVisible(false)}
          restaurant={restaurant}
          visible={sourceModalVisible}
        />
      </SafeAreaView>
    </ScreenBackground>
  );
}

function SourceBadge({
  onPress,
  restaurant,
}: {
  onPress: () => void;
  restaurant: Restaurant;
}) {
  const officialCount =
    restaurant.allergenDataStatus?.officialItemCount ??
    restaurant.items.filter((item) => item.allergenSourceType !== "unavailable").length;
  const itemCount = restaurant.items.length;

  return (
    <Pressable
      accessibilityLabel={`Source coverage ${officialCount} of ${itemCount} menu items`}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.sourceButton}
    >
      <CheckCircle2 color={colors.primary} size={20} strokeWidth={2.35} />
    </Pressable>
  );
}

function SourceInfoModal({
  onClose,
  restaurant,
  visible,
}: {
  onClose: () => void;
  restaurant: Restaurant;
  visible: boolean;
}) {
  const sourceUrl = restaurant.sourceUrls?.[0] ?? restaurant.guideUrl;
  const sourceHost = getSourceHost(sourceUrl);
  const officialCount =
    restaurant.allergenDataStatus?.officialItemCount ??
    restaurant.items.filter((item) => item.allergenSourceType !== "unavailable").length;
  const itemCount = restaurant.items.length;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <ModalScreen
        actionIcon={X}
        actionLabel="Close source information"
        headerContent={
          <>
            <Text style={styles.modalKicker}>Source</Text>
            <Text style={styles.modalTitle}>Allergen information</Text>
          </>
        }
        onActionPress={onClose}
      >
        <View style={styles.sourceModalContent}>
          <View style={styles.sourceModalCard}>
            <View style={styles.sourceModalIcon}>
              <CheckCircle2 color={colors.primary} size={24} strokeWidth={2.6} />
            </View>
            <Text style={styles.sourceModalTitle}>
              Official sources for {officialCount}/{itemCount} menu items
            </Text>
            <Text style={styles.sourceModalBody}>
              We use restaurant-published allergen guides, nutrition pages, or official product
              data where available. Community submissions stay separate from official data until
              reviewed.
            </Text>
            <Text style={styles.sourceModalBody}>
              Restaurant recipes and kitchen practices can change, so confirm with the restaurant
              before ordering.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => Linking.openURL(sourceUrl)}
              style={styles.sourceModalLink}
            >
              <ExternalLink color={colors.primary} size={18} strokeWidth={2.35} />
              <Text style={styles.sourceModalLinkText}>Open {sourceHost}</Text>
            </Pressable>
          </View>
        </View>
      </ModalScreen>
    </Modal>
  );
}

function RestaurantTabs({
  activeTab,
  onSelect,
}: {
  activeTab: RestaurantTab;
  onSelect: (tab: RestaurantTab) => void;
}) {
  return (
    <View style={styles.tabGroup}>
      {(["official", "community"] as const).map((tab) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === tab }}
          key={tab}
          onPress={() => onSelect(tab)}
          style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
        >
          <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
            {tab === "official" ? "Official" : "Community"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ContributionPanel({
  onAddItem,
  onComment,
  onReport,
}: {
  onAddItem: () => void;
  onComment: () => void;
  onReport: () => void;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.communityRow}>
        <View style={styles.communityIcon}>
          <MessageSquarePlus color={colors.primary} size={22} strokeWidth={2.35} />
        </View>
        <View style={styles.communityText}>
          <Text style={styles.communityTitle}>Contribute to this menu</Text>
          <Text style={styles.communityCopy}>
            Community submissions are reviewed before they appear publicly.
          </Text>
        </View>
      </View>
      <View style={styles.contributionActions}>
        <ContributionButton Icon={Plus} label="Add item" onPress={onAddItem} />
        <ContributionButton Icon={Flag} label="Report" onPress={onReport} />
        <ContributionButton Icon={MessageCircle} label="Comment" onPress={onComment} />
      </View>
    </View>
  );
}

function ContributionButton({
  Icon,
  label,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.contributionButton}>
      <Icon color={colors.primary} size={17} strokeWidth={2.5} />
      <Text style={styles.contributionButtonText}>{label}</Text>
    </Pressable>
  );
}

function CommunityTab({
  comments,
  isLoading,
  items,
  onAddItem,
  onCommentRestaurant,
  onCommentItem,
  onPressItem,
  onReportRestaurant,
  onReportItem,
  selectedAllergyIds,
}: {
  comments: CommunityComment[];
  isLoading: boolean;
  items: MenuItem[];
  onAddItem: () => void;
  onCommentRestaurant: () => void;
  onCommentItem: (item: MenuItem) => void;
  onPressItem: (item: MenuItem) => void;
  onReportRestaurant: () => void;
  onReportItem: (item: MenuItem) => void;
  selectedAllergyIds: string[];
}) {
  const contributionPanel = (
    <ContributionPanel
      onAddItem={onAddItem}
      onComment={onCommentRestaurant}
      onReport={onReportRestaurant}
    />
  );

  if (isLoading && items.length === 0 && comments.length === 0) {
    return (
      <View style={styles.communityTab}>
        {contributionPanel}
        <View style={styles.communityEmpty}>
          <Text style={styles.communityEmptyTitle}>Loading community submissions</Text>
        </View>
      </View>
    );
  }

  if (items.length === 0 && comments.length === 0) {
    return (
      <View style={styles.communityTab}>
        {contributionPanel}
        <View style={styles.communityEmpty}>
          <Text style={styles.communityEmptyTitle}>No community submissions yet</Text>
          <Text style={styles.communityEmptyCopy}>
            Add a menu item, report inaccurate info, or leave a helpful comment.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.communityTab}>
      {contributionPanel}

      {items.length > 0 ? (
        <View style={styles.communitySection}>
          <View style={styles.communitySectionHeader}>
            <Text style={styles.communitySectionTitle}>Community menu items</Text>
            <Text style={styles.communitySectionMeta}>{items.length}</Text>
          </View>
          {items.map((item, index) => (
            <View key={item.id} style={!index ? undefined : styles.rowDivider}>
              <MenuRow
                item={item}
                last
                onPress={() => onPressItem(item)}
                selectedAllergyIds={selectedAllergyIds}
                sourceLabel="Community submitted · not official"
              />
              <View style={styles.communityItemActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onReportItem(item)}
                  style={styles.inlineAction}
                >
                  <Text style={styles.inlineActionText}>Report</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onCommentItem(item)}
                  style={styles.inlineAction}
                >
                  <Text style={styles.inlineActionText}>Comment</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {comments.length > 0 ? (
        <View style={styles.communitySection}>
          <View style={styles.communitySectionHeader}>
            <Text style={styles.communitySectionTitle}>Comments</Text>
            <Text style={styles.communitySectionMeta}>{comments.length}</Text>
          </View>
          {comments.map((comment, index) => (
            <View
              key={comment.id}
              style={[styles.commentRow, index > 0 && styles.rowDivider]}
            >
              <Text style={styles.commentBody}>{comment.body}</Text>
              {comment.allergyContext ? (
                <Text style={styles.commentContext}>{comment.allergyContext}</Text>
              ) : null}
              {comment.communityStatus === "pending" ? (
                <Text style={styles.pendingLabel}>Pending review</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
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
  sourceLabel,
}: {
  item: MenuItem;
  last: boolean;
  onPress: () => void;
  selectedAllergyIds: string[];
  sourceLabel?: string;
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
        {safety.directMatchLabels.length > 0 ? (
          <Text style={styles.conflicts}>Contains {safety.directMatchLabels.join(", ")}</Text>
        ) : null}
        {safety.crossContactMatchLabels.length > 0 ? (
          <Text style={styles.crossContactMatch}>
            Cross-contact {safety.crossContactMatchLabels.join(", ")}
          </Text>
        ) : null}
        {safety.directMatchLabels.length === 0 &&
        safety.crossContactMatchLabels.length === 0 &&
        safety.officialAllergenDataUnavailable &&
        selectedAllergyIds.length > 0 ? (
          <Text style={styles.conflicts}>Official allergen info unavailable</Text>
        ) : null}
        {sourceLabel ? <Text style={styles.sourceLabel}>{sourceLabel}</Text> : null}
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
  const directIcons = getAllergenIcons(item, "direct");
  const crossContactIcons = getAllergenIcons(item, "crossContact");
  const broadCrossContact = hasBroadCrossContact(item);

  if (item.allergenSourceType === "unavailable") {
    return <Text style={styles.noListedAllergens}>Allergen info unavailable</Text>;
  }

  if (directIcons.length === 0 && crossContactIcons.length === 0 && !broadCrossContact) {
    return <Text style={styles.noListedAllergens}>No listed allergens</Text>;
  }

  return (
    <View style={styles.allergenGroups}>
      {directIcons.length > 0 ? (
        <AllergenIconGroup
          icons={directIcons}
          label="Contains"
          selectedAllergyIds={selectedAllergyIds}
        />
      ) : null}
      {crossContactIcons.length > 0 || broadCrossContact ? (
        <AllergenIconGroup
          broad={broadCrossContact}
          icons={crossContactIcons}
          label="Cross-contact"
          selectedAllergyIds={selectedAllergyIds}
        />
      ) : null}
    </View>
  );
}

function AllergenIconGroup({
  broad = false,
  icons,
  label,
  selectedAllergyIds,
}: {
  broad?: boolean;
  icons: ReturnType<typeof getAllergenIcons>;
  label: string;
  selectedAllergyIds: string[];
}) {
  return (
    <View style={styles.allergenIconGroup}>
      <Text style={styles.allergenIconGroupLabel}>{label}</Text>
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
        {broad ? <Text style={styles.crossContactText}>Shared prep risk</Text> : null}
      </View>
    </View>
  );
}

function getAllergenIcons(item: MenuItem, type: "direct" | "crossContact") {
  const source = type === "direct" ? item.allergens : hasBroadCrossContact(item) ? [] : (item.mayContain ?? []);

  return source.flatMap((id) => {
    const option = allergyOptions.find((nextOption) => nextOption.id === id);
    const mayContain = type === "crossContact";

    return option
      ? [
          {
            id,
            label: mayContain
              ? `Cross-contact ${getAllergenLabel(id)}`
              : getAllergenLabel(id),
            option,
            tone: mayContain ? ("mayContain" as const) : ("direct" as const),
          },
        ]
      : [];
  });
}

function hasBroadCrossContact(item: MenuItem) {
  return (item.mayContain ?? []).length >= 8;
}

function getAllergenLabel(id: string) {
  return allergyOptions.find((option) => option.id === id)?.label ?? id;
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
  allergenGroups: {
    gap: 8,
    marginTop: 10,
  },
  allergenIconGroup: {
    gap: 5,
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
  commentBody: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  commentContext: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
  },
  commentRow: {
    padding: spacing.two,
  },
  communityEmpty: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    marginBottom: spacing.two,
    padding: spacing.three,
  },
  communityEmptyCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  communityEmptyTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
  },
  communityItemActions: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: spacing.two,
  },
  communitySection: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: spacing.two,
    overflow: "hidden",
  },
  communitySectionHeader: {
    alignItems: "center",
    backgroundColor: "#FAFAFC",
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.two,
    paddingVertical: 12,
  },
  communitySectionMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  communitySectionTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  communityTab: {
    marginBottom: spacing.two,
  },
  contributionActions: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: spacing.two,
    paddingTop: 12,
  },
  contributionButton: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: 18,
    flex: 1,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 8,
  },
  contributionButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
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
  content: {
    paddingBottom: 92,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.four,
  },
  copyBlock: {
    marginBottom: spacing.three,
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
  navActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
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
  sourceModalBody: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    marginTop: 10,
  },
  sourceModalCard: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    padding: spacing.three,
  },
  sourceModalContent: {
    flex: 1,
    padding: spacing.three,
  },
  sourceModalIcon: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    marginBottom: spacing.two,
    width: 44,
  },
  sourceModalLink: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 7,
    marginTop: spacing.two,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  sourceModalLinkText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "800",
  },
  sourceModalTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28,
  },
  sourceLabel: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 6,
    textTransform: "uppercase",
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
  tabButton: {
    alignItems: "center",
    borderRadius: 20,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
  },
  tabButtonActive: {
    backgroundColor: colors.ink,
  },
  tabGroup: {
    backgroundColor: "#F2F2F7",
    borderRadius: 24,
    flexDirection: "row",
    gap: 4,
    marginBottom: spacing.two,
    padding: 4,
  },
  tabText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "800",
  },
  tabTextActive: {
    color: colors.white,
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
