import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  EmptyStateCard,
  EvidenceStatusDot,
  PrimaryCard,
} from "@/components/common/ui";
import {
  SEARCH_DEBOUNCE_MS,
  createLatestSearchRequestGuard,
} from "@/features/search/searchPolicy";
import {
  getUnifiedSearchHistoryItems,
  historyItemToSearchResult,
  loadSearchHistory,
  recordSearchSelectionHistory,
} from "@/features/search/history";
import { useSearchResolutionStore } from "@/features/search/resolutionStore";
import { useSubscriptionAccess } from "@/features/subscriptions/useSubscriptionAccess";
import { resolveBackNavigationAction } from "@/features/subscriptions/accessPolicy";
import { CATALOG_TYPES } from "@/features/supplements/catalog";
import { appTheme, spacing, typography } from "@/theme";
import { createUserCustomSupplement } from "@src/data/searchSupplementCatalog";
import {
  canonicalizeSearchProductSelection,
  resolveSearchProductSelection,
  searchSupplementProducts,
} from "@src/data/searchSupplementProducts";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getRecentSearchKey(item) {
  return `${item.catalogType}-${item.id}`;
}

function getResultMeta(item) {
  if (item.catalogType === CATALOG_TYPES.CUSTOM) {
    return item.linkedSupplementId
      ? "Custom supplement • Linked evidence"
      : "Custom supplement";
  }
  if (item.catalogType === CATALOG_TYPES.ACTIVE_INGREDIENT) {
    return item.matchedAlias
      ? `Matched “${item.matchedAlias}” • Active ingredient`
      : "Active ingredient";
  }

  return trimString(item.brand);
}

function SearchResultCard({ item, onPress, resolving }) {
  const resultMeta = getResultMeta(item);
  const evidenceType =
    item.catalogType === CATALOG_TYPES.ACTIVE_INGREDIENT ||
    (item.catalogType === CATALOG_TYPES.CUSTOM && item.linkedSupplementId)
      ? "Active ingredient evidence"
      : "Overall evidence";
  const ratingLabel = Number.isFinite(item.evidenceScore)
    ? `${Math.round(item.evidenceScore)} out of 100`
    : "Not rated";

  return (
    <PrimaryCard
      onPress={onPress}
      disabled={resolving}
      accessibilityLabel={[item.name, resultMeta, ratingLabel]
        .filter(Boolean)
        .join(". ")}
      style={styles.resultCard}
      pressedStyle={styles.resultCardPressed}
    >
      <View style={styles.resultRow}>
        <View style={styles.resultCopy}>
          <Text style={styles.resultName}>{item.name}</Text>
          {resultMeta ? (
            <Text style={styles.resultMeta}>{resultMeta}</Text>
          ) : null}
        </View>
        <View style={styles.resultEvidence}>
          <EvidenceStatusDot
            score={item.evidenceScore}
            evidenceType={evidenceType}
          />
          <Text style={styles.resultEvidenceText}>
            {resolving ? "Opening…" : ratingLabel}
          </Text>
        </View>
      </View>
    </PrimaryCard>
  );
}

function RecentSearches({ items, onPress }) {
  return (
    <View style={styles.recentSection}>
      <Text style={styles.resultsSummaryTitle}>History</Text>
      <View style={styles.recentList}>
        {items.map((item, index) => {
          const resultMeta = getResultMeta(item);
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
                {resultMeta ? (
                  <Text style={styles.resultMeta}>{resultMeta}</Text>
                ) : null}
              </View>
              <View style={styles.historyEvidence}>
                <EvidenceStatusDot score={item.evidenceScore} />
                <Text style={styles.resultEvidenceText}>
                  {Number.isFinite(item.evidenceScore)
                    ? Math.round(item.evidenceScore)
                    : "Not rated"}
                </Text>
              </View>
            </AppButton>
          );
        })}
      </View>
    </View>
  );
}

function AddCustomSupplementModal({
  visible,
  initialName,
  saving,
  onClose,
  onSave,
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initialName);
  const [brand, setBrand] = useState("");
  const [servingSize, setServingSize] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!visible) return;
    setName(initialName);
    setBrand("");
    setServingSize("");
    setNotes("");
  }, [initialName, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[
          styles.customModalBackdrop,
          {
            paddingTop: Math.max(insets.top + spacing.lg, spacing.xl),
            paddingBottom: Math.max(insets.bottom + spacing.lg, spacing.lg),
          },
        ]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable
          style={styles.customModalDismissLayer}
          onPress={Keyboard.dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss keyboard"
        />
        <PrimaryCard style={styles.customModalCard}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={
              Platform.OS === "ios" ? "interactive" : "on-drag"
            }
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.customModalHeader}>
              <View style={styles.resultCopy}>
                <Text style={styles.customModalTitle}>
                  Add custom supplement
                </Text>
                <Text style={styles.customModalBody}>
                  Add this to your personal supplement list.
                </Text>
              </View>
              <AppButton
                onPress={onClose}
                variant="overlay"
                size="icon"
                accessibilityLabel="Close custom supplement form"
              >
                <Ionicons
                  name="close"
                  size={18}
                  color={appTheme.colors.textStrong}
                />
              </AppButton>
            </View>
            <View style={styles.customForm}>
              {[
                { value: name, setter: setName, placeholder: "Name" },
                {
                  value: brand,
                  setter: setBrand,
                  placeholder: "Brand (optional)",
                },
                {
                  value: servingSize,
                  setter: setServingSize,
                  placeholder: "Serving size (optional)",
                },
              ].map((field) => (
                <TextInput
                  key={field.placeholder}
                  value={field.value}
                  onChangeText={field.setter}
                  placeholder={field.placeholder}
                  placeholderTextColor="#8B8595"
                  style={styles.customInput}
                  autoCapitalize="words"
                />
              ))}
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Notes (optional)"
                placeholderTextColor="#8B8595"
                style={[styles.customInput, styles.customNotesInput]}
                multiline
                textAlignVertical="top"
              />
            </View>
            <View style={styles.customModalActions}>
              <AppButton
                label="Cancel"
                onPress={onClose}
                variant="ghost"
                style={styles.customModalButton}
              />
              <AppButton
                label={saving ? "Saving..." : "Save"}
                onPress={() => onSave({ name, brand, servingSize, notes })}
                disabled={!trimString(name) || saving}
                variant="primary"
                style={styles.customModalButton}
              />
            </View>
          </ScrollView>
        </PrimaryCard>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AvailabilityNotice({ result, loading }) {
  if (loading) {
    return <Text style={styles.availabilityText}>Searching…</Text>;
  }
  const notices = [];
  if (result?.state === "offline" || result?.state === "offline_partial") {
    notices.push("Offline. Showing locally available results.");
  }
  return notices.length ? (
    <View style={styles.availabilityNotices}>
      {notices.map((notice) => (
        <Text key={notice} style={styles.availabilityText}>
          {notice}
        </Text>
      ))}
    </View>
  ) : null;
}

export function SupplementSearchContent({
  presentation = "standalone",
  mode = "info",
  initialQuery = "",
}) {
  const insets = useSafeAreaInsets();
  const {
    hasActiveAccess,
    isResolved,
    openSubscriptionPaywall,
    requireSubscriptionAccess,
  } = useSubscriptionAccess();
  const createResolutionSession = useSearchResolutionStore(
    (state) => state.createSession,
  );
  const requestGuardRef = useRef(createLatestSearchRequestGuard());
  const selectionControllerRef = useRef(null);
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState({ sections: [], state: "empty" });
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [savingCustom, setSavingCustom] = useState(false);
  const [resolvingId, setResolvingId] = useState("");
  const trimmedQuery = useMemo(() => query.trim(), [query]);
  const standalone = presentation === "standalone";
  const safeBackAction = useMemo(
    () =>
      resolveBackNavigationAction({
        canGoBack: typeof router.canGoBack === "function" && router.canGoBack(),
        fallbackHref: "/",
      }),
    [],
  );

  useEffect(() => {
    if (hasActiveAccess || !isResolved) return;
    openSubscriptionPaywall({ replace: true });
  }, [hasActiveAccess, isResolved, openSubscriptionPaywall]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadSearchHistory()
        .then((items) => {
          if (!active) return;
          setRecentSearches(
            getUnifiedSearchHistoryItems(items)
              .map(historyItemToSearchResult)
              .filter(Boolean),
          );
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  useEffect(() => {
    const requestGuard = requestGuardRef.current;
    requestGuard.cancel();
    if (!hasActiveAccess || !trimmedQuery) {
      setLoading(false);
      setResult({ sections: [], state: "empty" });
      return undefined;
    }

    setLoading(true);
    setResult({ sections: [], state: "loading" });
    const timer = setTimeout(async () => {
      const request = requestGuard.begin();
      try {
        const nextResult = await searchSupplementProducts(trimmedQuery, {
          signal: request.signal,
          requestId: request.requestId,
        });
        if (request.isCurrent() && nextResult.requestId === request.requestId) {
          setResult(nextResult);
          setLoading(false);
        }
      } catch (error) {
        if (error?.name !== "AbortError" && request.isCurrent()) {
          setResult({ sections: [], state: "error" });
          setLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      requestGuard.cancel();
    };
  }, [hasActiveAccess, trimmedQuery]);

  useEffect(
    () => () => {
      requestGuardRef.current.cancel();
      selectionControllerRef.current?.abort();
    },
    [],
  );

  const refreshRecentSearches = (items) => {
    setRecentSearches(
      getUnifiedSearchHistoryItems(items)
        .map(historyItemToSearchResult)
        .filter(Boolean),
    );
  };

  const navigateWithDescriptor = (descriptor) => {
    const target = { pathname: descriptor.pathname, params: descriptor.params };
    if (descriptor.action === "navigate") router.navigate(target);
    else if (descriptor.action === "replace") router.replace(target);
    else router.push(target);
  };

  const handleSelect = async (selectedItem) => {
    if (!requireSubscriptionAccess("supplement_info") || resolvingId) return;
    let item = selectedItem;
    let navigationDescriptor;

    if (
      item.catalogType === CATALOG_TYPES.SUPPLEMENT_PRODUCT &&
      !item.canonicalProductId
    ) {
      selectionControllerRef.current?.abort();
      selectionControllerRef.current = new AbortController();
      setResolvingId(item.id);
      const resolution = await resolveSearchProductSelection(item, {
        signal: selectionControllerRef.current.signal,
      });
      item = resolution.product;
      if (resolution.status !== "resolved" || !item.canonicalProductId) {
        const sessionId = createResolutionSession({
          ...item,
          evidenceScore: null,
        });
        if (!sessionId) {
          setResolvingId("");
          Alert.alert("Could not open product", "Please try again.");
          return;
        }
        navigationDescriptor = {
          action: "push",
          pathname: "/(modals)/modal/supplement-info",
          params: {
            source: "search-resolution",
            resolutionSessionId: sessionId,
            name: item.name,
          },
        };
      }
    }

    item = canonicalizeSearchProductSelection(item);

    if (!navigationDescriptor) {
      navigationDescriptor =
        mode === "picker" || item.catalogType === CATALOG_TYPES.CUSTOM
          ? {
              action: "navigate",
              pathname: "/(modals)/modal/supplement",
              params: {
                newCatalogId: item.id,
                newCatalogName: item.name,
                newCatalogType: item.catalogType,
                newCustomSupplementId: item.customSupplementId ?? "",
              },
            }
          : {
              action: "push",
              pathname: "/(modals)/modal/supplement-info",
              params: { id: item.id, name: item.name },
            };
    }

    try {
      const items = await recordSearchSelectionHistory({
        item,
        navigationDescriptor,
      });
      refreshRecentSearches(items);
    } catch {
      // History failure must not block a valid navigation handoff.
    }
    setResolvingId("");
    navigateWithDescriptor(navigationDescriptor);
  };

  const handleSaveCustomSupplement = async (values) => {
    if (savingCustom) return;
    setSavingCustom(true);
    try {
      const created = await createUserCustomSupplement(values);
      setCustomModalVisible(false);
      await handleSelect(created);
    } catch (error) {
      Alert.alert(
        "Could not add custom supplement",
        error?.message || "Please sign in and try again.",
      );
    } finally {
      setSavingCustom(false);
    }
  };

  const renderEmptyState = () => {
    if (!trimmedQuery) {
      return recentSearches.length ? (
        <RecentSearches items={recentSearches} onPress={handleSelect} />
      ) : (
        <EmptyStateCard
          title="Start typing to search"
          description="Search products, active ingredients, aliases, and your custom supplements."
          style={styles.stateCard}
        />
      );
    }
    if (loading) {
      return (
        <PrimaryCard style={styles.stateCard}>
          <Text style={styles.stateTitle}>Searching…</Text>
        </PrimaryCard>
      );
    }
    if (["offline", "error"].includes(result.state)) {
      return (
        <EmptyStateCard
          title={
            result.state === "offline" ? "You’re offline" : "Search unavailable"
          }
          description="Local and external results could not be loaded. Check your connection and try again."
          style={styles.stateCard}
        />
      );
    }
    return (
      <View>
        <EmptyStateCard
          title="No matches yet"
          description="Try a different ingredient, alias, brand, or product name."
          style={styles.stateCard}
        />
        <AppButton
          label="Add custom supplement"
          onPress={() => setCustomModalVisible(true)}
          variant="primary"
          style={styles.addCustomButton}
        />
      </View>
    );
  };

  if (!hasActiveAccess) return <BackdropScreen scrollable={false} />;

  const header = standalone ? (
    <AppHeader
      insetPreset="screen"
      bottomPadding={8}
      leftSlot={
        <AppButton
          onPress={() => {
            if (safeBackAction.type === "back") router.back();
            else router.replace(safeBackAction.href);
          }}
          variant="overlay"
          size="icon"
          accessibilityLabel="Close supplement search"
        >
          <Ionicons name="close" size={20} color={appTheme.colors.textStrong} />
        </AppButton>
      }
      title="SEARCH SUPPLEMENTS"
      bottomSlot={
        <Text style={styles.headerSubtitle}>
          {mode === "picker"
            ? "Pick an active ingredient, product, or custom supplement."
            : "Browse products, ingredients, and your custom supplements."}
        </Text>
      }
    />
  ) : null;

  return (
    <>
      <BackdropScreen
        scrollable={false}
        bottomInsetOffset={standalone ? 24 : -insets.bottom}
        minBottomPadding={standalone ? 32 : 0}
        contentStyle={[
          styles.screenContent,
          !standalone && { paddingTop: Math.max(insets.top, spacing.lg) },
        ]}
        header={header}
      >
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 48 : 0}
        >
          <SectionList
            style={styles.resultsList}
            sections={trimmedQuery ? (result.sections ?? []) : []}
            keyExtractor={(item) => `${item.catalogType}-${item.id}`}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={
              Platform.OS === "ios" ? "interactive" : "on-drag"
            }
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.resultsContent}
            renderItem={({ item }) => (
              <SearchResultCard
                item={item}
                resolving={resolvingId === item.id}
                onPress={() => handleSelect(item)}
              />
            )}
            ListHeaderComponent={
              <View style={styles.headerContent}>
                {!standalone ? (
                  <Text accessibilityRole="header" style={styles.screenTitle}>
                    Search
                  </Text>
                ) : null}
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
                    autoCapitalize="words"
                    autoFocus={standalone}
                    accessibilityLabel="Search ingredients and supplements"
                  />
                </View>
                {trimmedQuery ? (
                  <>
                    <AvailabilityNotice result={result} loading={loading} />
                    <Text style={styles.resultsSummaryTitle}>Results</Text>
                  </>
                ) : null}
              </View>
            }
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionHeader}>{section.title}</Text>
            )}
            ListEmptyComponent={renderEmptyState}
          />
        </KeyboardAvoidingView>
      </BackdropScreen>
      <AddCustomSupplementModal
        visible={customModalVisible}
        initialName={trimmedQuery}
        saving={savingCustom}
        onClose={() => setCustomModalVisible(false)}
        onSave={handleSaveCustomSupplement}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screenContent: { flex: 1 },
  keyboard: { flex: 1 },
  resultsList: { flex: 1 },
  screenTitle: {
    marginBottom: spacing.md,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: typography.fontFamily.heading,
    letterSpacing: -0.7,
    color: appTheme.colors.textPrimary,
  },
  headerSubtitle: {
    marginTop: spacing.xs,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  resultsContent: { paddingBottom: spacing.xl },
  headerContent: { marginBottom: spacing.md },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchFieldIcon: { marginRight: spacing.sm },
  searchInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textPrimary,
    paddingVertical: 0,
  },
  availabilityText: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  availabilityNotices: { marginTop: spacing.sm, gap: 2 },
  resultsSummaryTitle: {
    marginTop: spacing.md,
    fontSize: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
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
  resultCard: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  resultCardPressed: { opacity: 0.84 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  resultCopy: { flex: 1, minWidth: 0 },
  resultName: {
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textPrimary,
  },
  resultMeta: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  resultEvidence: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  resultEvidenceText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  recentSection: { marginBottom: spacing.md },
  recentList: { marginTop: spacing.sm },
  recentRow: { minHeight: 56, borderRadius: 0, paddingHorizontal: 0 },
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
  historyEvidence: {
    minWidth: 70,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xs,
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
  },
  addCustomButton: { alignSelf: "center", minWidth: 220 },
  customModalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(18,16,22,0.42)",
  },
  customModalDismissLayer: { ...StyleSheet.absoluteFillObject },
  customModalCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "90%",
    alignSelf: "center",
    padding: spacing.lg,
  },
  customModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  customModalTitle: {
    fontSize: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
  },
  customModalBody: {
    marginTop: spacing.xs,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  customForm: { gap: spacing.sm },
  customInput: {
    minHeight: 48,
    borderRadius: appTheme.input.radius,
    backgroundColor: appTheme.input.background,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    fontFamily: typography.fontFamily.body,
    color: appTheme.input.text,
  },
  customNotesInput: { minHeight: 92 },
  customModalActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  customModalButton: { flex: 1 },
});
