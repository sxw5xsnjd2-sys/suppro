import React, { useEffect, useMemo, useState } from "react";
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
  StatusPill,
} from "@/components/common/ui";
import { CATALOG_TYPES } from "@/features/supplements/catalog";
import { appTheme, spacing, typography } from "@/theme";
import { searchSupplementCatalog } from "@src/data/searchSupplementCatalog";

function asString(value) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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

        <StatusPill
          label={isActiveIngredient ? "INGREDIENT" : "SUPPLEMENT"}
          tone={isActiveIngredient ? "success" : "neutral"}
          style={styles.resultBadge}
        />
      </View>
    </PrimaryCard>
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

  const trimmedQuery = useMemo(() => query.trim(), [query]);
  const resultCount = useMemo(
    () => sections.reduce((sum, section) => sum + section.data.length, 0),
    [sections]
  );
  const resultCountLabel = loading
    ? "SEARCHING"
    : `${resultCount} ${resultCount === 1 ? "MATCH" : "MATCHES"}`;
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

  const handleSelect = (item) => {
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
                  size={20}
                  color={appTheme.input.icon}
                  style={styles.searchFieldIcon}
                />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search ingredients and supplements"
                  placeholderTextColor={appTheme.input.placeholder}
                  style={styles.searchFieldInput}
                  clearButtonMode="while-editing"
                  autoFocus
                  autoCapitalize="words"
                  accessibilityLabel="Search ingredients and supplements"
                />
              </View>

              {trimmedQuery ? (
                <View style={styles.resultsSummaryRow}>
                  <Text style={styles.resultsSummaryTitle}>Results</Text>
                  <StatusPill
                    label={resultCountLabel}
                    tone="neutral"
                    style={styles.resultsCountPill}
                  />
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
    minHeight: appTheme.input.height,
    borderRadius: appTheme.input.radius,
    backgroundColor: appTheme.input.background,
    paddingHorizontal: 14,
  },
  searchFieldIcon: {
    marginRight: 8,
  },
  searchFieldInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.input.text,
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
  resultsCountPill: {
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  stateCard: {
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  stateTitle: {
    fontSize: 18,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
    marginBottom: spacing.xs,
  },
  stateBody: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
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
  resultBadge: {
    marginLeft: spacing.xs,
  },
});
