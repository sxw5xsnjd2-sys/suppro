import React, { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  KeyboardAvoidingView,
  Platform,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  EmptyStateCard,
  PrimaryCard,
} from "@/components/common/ui";
import { CATALOG_TYPES } from "@/features/supplements/catalog";
import { appTheme, spacing, typography } from "@/theme";
import { searchSupplementCatalog } from "@src/data/searchSupplementCatalog";

const RECENT_SUPPLEMENT_SEARCHES_KEY = "recent-supplement-searches";
const MAX_RECENT_SEARCHES = 5;

function asString(value) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getRecentSearchKey(item) {
  return `${item.catalogType}-${item.id}`;
}

function SearchResultCard({ item, onPress }) {
  const isActiveIngredient = item.catalogType === CATALOG_TYPES.ACTIVE_INGREDIENT;

  return (
    <PrimaryCard
      onPress={onPress}
      style={styles.resultCard}
      pressedStyle={styles.resultCardPressed}
    >
      <View style={styles.resultRow}>
        <View style={styles.resultCopy}>
          <Text style={styles.resultName}>{item.name}</Text>
          <Text style={styles.resultMeta}>
            {isActiveIngredient ? "Active ingredient" : "Supplement product"}
          </Text>
        </View>
      </View>
    </PrimaryCard>
  );
}

function RecentSearches({ items, onPress }) {
  return (
    <View style={styles.recentSection}>
      <View style={styles.resultsSummaryRow}>
        <Text style={styles.resultsSummaryTitle}>Recent searches</Text>
      </View>

      <View style={styles.recentList}>
        {items.map((item, index) => {
          const isActiveIngredient =
            item.catalogType === CATALOG_TYPES.ACTIVE_INGREDIENT;

          return (
            <AppButton
              key={getRecentSearchKey(item)}
              onPress={() => onPress(item)}
              variant="ghost"
              size="md"
              style={[
                styles.recentRow,
                index < items.length - 1 && styles.recentRowDivider,
              ]}
              contentStyle={styles.recentRowContent}
            >
              <View style={styles.resultCopy}>
                <Text style={styles.resultName}>{item.name}</Text>
                <Text style={styles.resultMeta}>
                  {isActiveIngredient ? "Active ingredient" : "Supplement product"}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={appTheme.colors.textSecondary}
              />
            </AppButton>
          );
        })}
      </View>
    </View>
  );
}

function LoadingCard() {
  return (
    <PrimaryCard style={styles.stateCard}>
      <Text style={styles.stateTitle}>Searching...</Text>
      <Text style={styles.stateBody}>
        Looking across active ingredients and supplement products.
      </Text>
    </PrimaryCard>
  );
}

export default function SupplementSearchScreen() {
  const params = useLocalSearchParams();
  const mode = asString(params.mode) === "picker" ? "picker" : "info";
  const initialQuery = asString(params.initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);

  const trimmedQuery = useMemo(() => query.trim(), [query]);
  const headerSubtitle =
    mode === "picker"
      ? "Pick an active ingredient or supplement product."
      : "Browse active ingredients and supplement products.";

  useEffect(() => {
    if (!trimmedQuery) {
      setSections([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    searchSupplementCatalog(trimmedQuery)
      .then((nextSections) => {
        if (active) {
          setSections(nextSections);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [trimmedQuery]);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(RECENT_SUPPLEMENT_SEARCHES_KEY)
      .then((raw) => {
        if (!active || !raw) {
          return;
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          return;
        }

        setRecentSearches(
          parsed.filter(
            (item) =>
              item &&
              typeof item === "object" &&
              typeof item.id === "string" &&
              typeof item.name === "string" &&
              typeof item.catalogType === "string"
          )
        );
      })
      .catch((error) => {
        console.error("Failed to load recent supplement searches", error);
      });

    return () => {
      active = false;
    };
  }, []);

  const persistRecentSearches = (nextItems) => {
    setRecentSearches(nextItems);
    AsyncStorage.setItem(
      RECENT_SUPPLEMENT_SEARCHES_KEY,
      JSON.stringify(nextItems)
    ).catch((error) => {
      console.error("Failed to save recent supplement searches", error);
    });
  };

  const saveRecentSearch = (item) => {
    const recentItem = {
      id: item.id,
      name: item.name,
      catalogType: item.catalogType,
    };
    const nextItems = [
      recentItem,
      ...recentSearches.filter(
        (existing) => getRecentSearchKey(existing) !== getRecentSearchKey(recentItem)
      ),
    ].slice(0, MAX_RECENT_SEARCHES);

    persistRecentSearches(nextItems);
  };

  const handleSelect = (item) => {
    saveRecentSearch(item);

    if (mode === "picker") {
      router.navigate({
        pathname: "/(modals)/modal/supplement",
        params: {
          newCatalogId: item.id,
          newCatalogName: item.name,
          newCatalogType: item.catalogType,
        },
      });
      return;
    }

    router.push({
      pathname: "/(modals)/modal/supplement-info",
      params: {
        id: item.id,
        name: item.name,
      },
    });
  };

  const renderEmptyState = () => {
    if (!trimmedQuery) {
      if (recentSearches.length > 0) {
        return (
          <RecentSearches items={recentSearches} onPress={handleSelect} />
        );
      }

      return (
        <EmptyStateCard
          title="Start typing to search"
          description="Search active ingredients and supplement products in one place."
          style={styles.stateCard}
        />
      );
    }

    if (loading) {
      return <LoadingCard />;
    }

    return (
      <EmptyStateCard
        title="No matches yet"
        description="Try a different ingredient or product name."
        style={styles.stateCard}
      />
    );
  };

  return (
    <BackdropScreen
      scrollable={false}
      bottomInsetOffset={24}
      minBottomPadding={32}
      contentStyle={styles.screenContent}
      header={
        <AppHeader
          insetPreset="screen"
          bottomPadding={8}
          leftSlot={
            <AppButton
              onPress={() => router.back()}
              variant="overlay"
              size="icon"
              accessibilityLabel="Close supplement search"
            >
              <Ionicons
                name="close"
                size={20}
                color={appTheme.colors.textStrong}
              />
            </AppButton>
          }
          title="SEARCH SUPPLEMENTS"
          titleStyle={styles.headerTitle}
          bottomSlot={<Text style={styles.headerSubtitle}>{headerSubtitle}</Text>}
          bottomSlotStyle={styles.headerBottom}
        />
      }
    >
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 48 : 0}
      >
        <SectionList
          sections={trimmedQuery ? sections : []}
          keyExtractor={(item) => `${item.catalogType}-${item.id}`}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.resultsContent}
          renderItem={({ item }) => (
            <SearchResultCard item={item} onPress={() => handleSelect(item)} />
          )}
          ListHeaderComponent={
            <View style={styles.headerContent}>
              <View style={styles.searchField}>
                <Ionicons
                  name="search"
                  size={18}
                  color="#8B8595"
                  style={styles.searchFieldIcon}
                />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search ingredients and supplements"
                  placeholderTextColor="#8B8595"
                  selectionColor="#A6685B"
                  style={styles.searchInput}
                  clearButtonMode="while-editing"
                  autoFocus
                  autoCapitalize="words"
                  accessibilityLabel="Search ingredients and supplements"
                />
              </View>

              {trimmedQuery ? (
                <View style={styles.resultsSummaryRow}>
                  <Text style={styles.resultsSummaryTitle}>Results</Text>
                </View>
              ) : null}
            </View>
          }
          renderSectionHeader={({ section }) =>
            section.data.length > 0 ? (
              <Text style={styles.sectionHeader}>{section.title}</Text>
            ) : null
          }
          ListEmptyComponent={renderEmptyState}
        />
      </KeyboardAvoidingView>
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  headerTitle: {
    color: appTheme.colors.textPrimary,
  },
  headerBottom: {
    marginTop: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  resultsContent: {
    paddingBottom: spacing.xl,
  },
  headerContent: {
    marginBottom: spacing.md,
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(26,24,32,0.08)",
    shadowColor: "#1A1820",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchFieldIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textPrimary,
    paddingVertical: 0,
  },
  resultsSummaryRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  resultsSummaryTitle: {
    fontSize: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.4,
  },
  recentSection: {
    marginBottom: spacing.md,
  },
  recentList: {
    backgroundColor: "transparent",
    marginTop: spacing.sm,
  },
  recentRow: {
    minHeight: 56,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: spacing.sm,
  },
  recentRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
  },
  recentRowContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  stateCard: {
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  stateTitle: {
    fontSize: 18,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  stateBody: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
    textAlign: "center",
  },
  resultCard: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  sectionHeader: {
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  resultCardPressed: {
    opacity: 0.84,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  resultCopy: {
    flex: 1,
    minWidth: 0,
  },
  resultName: {
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textPrimary,
    marginBottom: 4,
  },
  resultMeta: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
});
