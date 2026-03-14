import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
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
import { appTheme, spacing, typography } from "@/theme";
import { searchSupplementCatalog } from "@src/data/searchSupplementCatalog";

function asString(value) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function SearchResultCard({ item, onPress }) {
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
            {item.verified ? "Verified catalog" : "Custom supplement"}
          </Text>
        </View>

        <StatusPill
          label={item.verified ? "VERIFIED" : "CUSTOM"}
          tone={item.verified ? "success" : "neutral"}
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
        Looking across the verified catalog and your custom supplements.
      </Text>
    </PrimaryCard>
  );
}

export default function SupplementSearchScreen() {
  const params = useLocalSearchParams();
  const mode = asString(params.mode) === "picker" ? "picker" : "info";
  const initialQuery = asString(params.initialQuery);
  const newCatalogId = asString(params.newCatalogId);
  const newCatalogName = asString(params.newCatalogName);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const handledForwardKey = useRef("");

  const trimmedQuery = useMemo(() => query.trim(), [query]);
  const resultCountLabel = loading
    ? "SEARCHING"
    : `${results.length} ${results.length === 1 ? "MATCH" : "MATCHES"}`;
  const headerSubtitle =
    mode === "picker"
      ? "Pick a supplement for your routine."
      : "Browse the verified catalog and your custom entries.";

  useEffect(() => {
    if (!trimmedQuery) {
      setResults([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    searchSupplementCatalog(trimmedQuery)
      .then((nextResults) => {
        if (active) {
          setResults(nextResults);
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
    if (!newCatalogId || !newCatalogName) return;

    const forwardKey = `${newCatalogId}:${newCatalogName}:${mode}`;
    if (handledForwardKey.current === forwardKey) return;
    handledForwardKey.current = forwardKey;

    if (mode === "picker") {
      router.navigate({
        pathname: "/(modals)/modal/supplement",
        params: {
          newCatalogId,
          newCatalogName,
        },
      });
      return;
    }

    router.navigate({
      pathname: "/(modals)/modal/supplement",
      params: {
        newCatalogId,
        newCatalogName,
      },
    });
  }, [mode, newCatalogId, newCatalogName]);

  const handleSelect = (item) => {
    if (mode === "picker") {
      router.navigate({
        pathname: "/(modals)/modal/supplement",
        params: {
          newCatalogId: item.id,
          newCatalogName: item.name,
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

  const handleAddSupplement = () => {
    router.push({
      pathname: "/(modals)/modal/add-supplement-catalog",
      params: {
        ...(trimmedQuery ? { initialName: trimmedQuery } : {}),
        mode,
      },
    });
  };

  const renderEmptyState = () => {
    if (!trimmedQuery) {
      return (
        <EmptyStateCard
          title="Start typing to search"
          description="Search the verified catalog and your custom supplements in one place."
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
        description="Add it as a new supplement if you can’t find the right match."
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
          topInsetOffset={appTheme.modal.headerTopInsetOffset}
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
        <FlatList
          data={trimmedQuery ? results : []}
          keyExtractor={(item) => `${item.verified ? "v" : "u"}-${item.id}`}
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
                  placeholder="Search supplements"
                  placeholderTextColor={appTheme.input.placeholder}
                  style={styles.searchFieldInput}
                  clearButtonMode="while-editing"
                  autoFocus
                  autoCapitalize="words"
                  accessibilityLabel="Search supplements"
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
          ListEmptyComponent={renderEmptyState}
          ListFooterComponent={
            trimmedQuery ? (
              <PrimaryCard
                onPress={handleAddSupplement}
                style={styles.addCard}
                pressedStyle={styles.resultCardPressed}
              >
                <Text style={styles.addCardText}>+ Add new supplement</Text>
              </PrimaryCard>
            ) : null
          }
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
  addCard: {
    marginTop: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceAccent,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    borderStyle: "dashed",
  },
  addCardText: {
    fontSize: 15,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
});
