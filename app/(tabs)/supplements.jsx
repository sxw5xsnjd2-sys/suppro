import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppHeader,
  ChatFloatingButton,
  EmptyStateCard,
  PrimaryCard,
} from "@/components/common/ui";
import { BenefitIconBadge } from "@/features/supplements/components/BenefitIconBadge";
import {
  getBenefitIconComponent,
} from "@/features/supplements/benefits";
import { useSubscriptionAccess } from "@/features/subscriptions/useSubscriptionAccess";
import { appTheme, spacing, typography } from "@/theme";
import { supabase } from "@src/lib/supabase";

const BENEFIT_BADGE_COLORS = {
  "Anti-aging": "#F2E4D8",
  "Anti-inflammatory": "#F4DDD6",
  "Blood pressure control": "#DDEAF4",
  "Blood sugar control": "#E7E4F7",
  "Bone health": "#E7F0E1",
  "Cardiovascular health": "#DCEAF2",
  "Cholesterol support": "#E0EDF5",
  "Cognitive support": "#E5E0F4",
  "Concentration enhancing": "#E6DFF6",
  "Digestive health": "#E6F1DF",
  "Endurance enhancing": "#F6E3D3",
  "Energy enhancing": "#F7E7D1",
  "Exercise recovery": "#F4E0D4",
  "Female fertility": "#F3DCE6",
  "Female hormone balance": "#F1D9E3",
  "Female sexual arousal": "#F4D9E1",
  "Hair health": "#EFE6D8",
  "Immune health": "#E1EEDB",
  "Injury recovery": "#F2DED4",
  "Joint health": "#E7ECD8",
  "Lymphatic/swelling support": "#DFEFE5",
  "Male fertility": "#DCE4F3",
  "Male sexual performance": "#E2DDF5",
  "Memory enhancing": "#E4DEF3",
  "Mood support": "#EADCF2",
  "Skin health": "#F2E2D8",
  "Sleep support": "#E7E1F4",
  "Stress relief": "#ECDFF1",
  "Strength enhancing": "#F4E1D5",
  "Testosterone boosting": "#E3DDF2",
  "Urine system health": "#DFEEE8",
  "Weight management": "#F4E8CF",
};

function normalizeBenefits(rows) {
  const byLabel = {};

  for (const row of rows ?? []) {
    const benefits = Array.isArray(row?.supplement_benefits)
      ? row.supplement_benefits
      : [];

    for (const benefit of benefits) {
      const label =
        typeof benefit?.label === "string" ? benefit.label.trim() : "";

      if (!label) continue;

      if (!byLabel[label]) {
        byLabel[label] = {
          label,
          icon: benefit?.icon ?? null,
        };
        continue;
      }

      if (!byLabel[label].icon && benefit?.icon) {
        byLabel[label].icon = benefit.icon;
      }
    }
  }

  return Object.values(byLabel).sort((left, right) =>
    left.label.localeCompare(right.label)
  );
}

function BenefitListItem({ item, showBorder, requireSubscriptionAccess }) {
  const Icon = getBenefitIconComponent(item.label);
  const badgeColor =
    BENEFIT_BADGE_COLORS[item.label] ?? appTheme.colors.iconSurfaceMuted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityHint={`Open supplement rankings for ${item.label}.`}
      onPress={() => {
        if (!requireSubscriptionAccess("benefit_ranking")) {
          return;
        }

        router.push({
          pathname: "/benefit-ranking",
          params: { label: item.label },
        });
      }}
      style={({ pressed }) => [
        styles.benefitItem,
        showBorder && styles.benefitItemBorder,
        pressed && styles.benefitItemPressed,
      ]}
    >
      <View style={styles.benefitLeft}>
        <BenefitIconBadge
          label={item.label}
          color={badgeColor}
          Icon={Icon}
          size={18}
          containerSize={32}
          borderRadius={10}
        />
        <Text style={styles.benefitLabel}>{item.label}</Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={appTheme.colors.textSecondary}
      />
    </Pressable>
  );
}

function SupplementResultItem({ item, showBorder, requireSubscriptionAccess }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.name}
      accessibilityHint={`Open supplement details for ${item.name}.`}
      onPress={() => {
        if (!requireSubscriptionAccess("supplement_info")) {
          return;
        }

        router.push({
          pathname: "/(modals)/modal/supplement-info",
          params: { id: item.id, name: item.name },
        });
      }}
      style={({ pressed }) => [
        styles.searchResultItem,
        showBorder && styles.searchResultBorder,
        pressed && styles.searchResultPressed,
      ]}
    >
      <View style={styles.searchResultCopy}>
        <Text style={styles.searchResultName}>{item.name}</Text>
        <Text style={styles.searchResultMeta}>Supplement</Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={appTheme.colors.textSecondary}
      />
    </Pressable>
  );
}

export default function SupplementsScreen() {
  const { hasActiveAccess, requireSubscriptionAccess } = useSubscriptionAccess();
  const [benefits, setBenefits] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [supplementMatches, setSupplementMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showRankingInfo, setShowRankingInfo] = useState(false);
  const trimmedQuery = searchQuery.trim();
  const hasSearchQuery = trimmedQuery.length > 0;

  const filteredBenefits = useMemo(() => {
    if (!hasSearchQuery) return benefits;

    const normalizedQuery = trimmedQuery.toLocaleLowerCase();
    return benefits.filter((item) =>
      item.label.toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [benefits, hasSearchQuery, trimmedQuery]);

  useEffect(() => {
    if (!hasActiveAccess) {
      setBenefits([]);
      setLoading(false);
      setErrorMessage("");
      return;
    }

    let active = true;

    const loadBenefits = async () => {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("supplements")
        .select("supplement_benefits(label, icon)")
        .in("status", ["approved", "pending"]);

      if (!active) return;

      if (error) {
        console.error("Failed to load supplement ranking benefits", error);
        setBenefits([]);
        setErrorMessage("Could not load ranked benefits.");
        setLoading(false);
        return;
      }

      setBenefits(normalizeBenefits(data ?? []));
      setLoading(false);
    };

    loadBenefits();

    return () => {
      active = false;
    };
  }, [hasActiveAccess]);

  useEffect(() => {
    if (!hasActiveAccess) {
      setSupplementMatches([]);
      setSearchLoading(false);
      return;
    }

    if (!hasSearchQuery) {
      setSupplementMatches([]);
      setSearchLoading(false);
      return;
    }

    let active = true;
    setSearchLoading(true);

    supabase
      .from("supplements")
      .select("id, name")
      .in("status", ["approved", "pending"])
      .ilike("name", `%${trimmedQuery}%`)
      .order("name")
      .limit(12)
      .then(({ data, error }) => {
        if (!active) return;

        if (error) {
          console.error("Failed to search ranked supplements", error);
          setSupplementMatches([]);
          return;
        }

        setSupplementMatches(data ?? []);
      })
      .finally(() => {
        if (active) {
          setSearchLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [hasActiveAccess, hasSearchQuery, trimmedQuery]);

  const showEmptySearchState =
    hasSearchQuery &&
    !searchLoading &&
    filteredBenefits.length === 0 &&
    supplementMatches.length === 0;

  return (
    <BackdropScreen
      bottomInsetOffset={72}
      minBottomPadding={96}
      floatingSlot={<ChatFloatingButton />}
      headerBehavior="collapsible"
      collapsedTitle="SUPPLEMENT RANKINGS"
      header={
        <AppHeader
          title="SUPPLEMENT RANKINGS"
          titleStyle={styles.headerTitle}
          titleRowStyle={styles.headerTitleRow}
          titleAccessory={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                showRankingInfo
                  ? "Hide supplement rankings explanation"
                  : "Show supplement rankings explanation"
              }
              accessibilityHint="Explains how supplement ranking evidence and medals work."
              onPress={() => setShowRankingInfo((prev) => !prev)}
              style={({ pressed }) => [
                styles.infoButton,
                pressed && styles.infoButtonPressed,
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={22}
                color={appTheme.colors.textSecondary}
              />
            </Pressable>
          }
          bottomSlot={
            <View style={styles.headerBottomContent}>
              {showRankingInfo ? (
                <View style={styles.infoBubbleWrap}>
                  <View style={styles.infoBubble}>
                    <Text style={styles.infoBubbleText}>
                      Supplements are ranked by the strength of the evidence for
                      that particular benefit. So 1st place has the strongest
                      evidence for that benefit. Gold medals mean robust studies
                      with randomised controlled trials and meta-analyses.
                      Silver medals are less robust studies and bronze medals
                      are poorly conducted studies, or those which have no human
                      studies.
                    </Text>
                  </View>
                </View>
              ) : null}

              <Text style={styles.headerSubtitle}>
                Search ranked supplements or browse benefit rankings
              </Text>
            </View>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
    >
      {hasActiveAccess ? (
        <View style={styles.searchField}>
          <Ionicons
            name="search"
            size={18}
            color="#8B8595"
            style={styles.searchFieldIcon}
          />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search supplements or benefits"
            placeholderTextColor="#8B8595"
            selectionColor="#A6685B"
            style={styles.searchFieldInput}
            autoCapitalize="words"
            clearButtonMode="while-editing"
            accessibilityLabel="Search supplement rankings"
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search supplement rankings"
          onPress={() => requireSubscriptionAccess("supplement_search")}
          style={styles.searchField}
        >
          <Ionicons
            name="search"
            size={18}
            color="#8B8595"
            style={styles.searchFieldIcon}
          />
          <Text style={styles.searchFieldPlaceholder}>
            Search supplements or benefits
          </Text>
        </Pressable>
      )}

      {loading ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>Loading ranked benefits...</Text>
        </View>
      ) : null}

      {!loading && errorMessage ? (
        <EmptyStateCard
          title="Rankings unavailable"
          description={errorMessage}
        />
      ) : null}

      {hasActiveAccess && !loading && !errorMessage && benefits.length === 0 ? (
        <EmptyStateCard
          title="No ranked benefits"
          description="No approved supplement benefits are available yet."
        />
      ) : null}

      {!loading && !errorMessage && hasSearchQuery ? (
        <View style={styles.searchResults}>
          <View style={styles.searchSummaryRow}>
            <Text style={styles.searchSummaryTitle}>Search results</Text>
            {searchLoading ? (
              <ActivityIndicator
                size="small"
                color={appTheme.colors.textSecondary}
              />
            ) : null}
          </View>

          {supplementMatches.length > 0 ? (
            <PrimaryCard style={styles.resultsCard}>
              <Text style={styles.resultsSectionTitle}>Supplements</Text>
              {supplementMatches.map((item, index) => (
                <SupplementResultItem
                  key={item.id}
                  item={item}
                  showBorder={index < supplementMatches.length - 1}
                  requireSubscriptionAccess={requireSubscriptionAccess}
                />
              ))}
            </PrimaryCard>
          ) : null}

          {filteredBenefits.length > 0 ? (
            <PrimaryCard style={styles.resultsCard}>
              <Text style={styles.resultsSectionTitle}>Benefits</Text>
              {filteredBenefits.map((item, index) => (
                <BenefitListItem
                  key={item.label}
                  item={item}
                  showBorder={index < filteredBenefits.length - 1}
                  requireSubscriptionAccess={requireSubscriptionAccess}
                />
              ))}
            </PrimaryCard>
          ) : null}

          {showEmptySearchState ? (
            <EmptyStateCard
              title="No ranking matches"
              description="Try a different supplement or benefit name."
            />
          ) : null}
        </View>
      ) : null}

      {!loading && !errorMessage && !hasSearchQuery && benefits.length > 0 ? (
        <PrimaryCard style={styles.resultsCard}>
          <View style={styles.list}>
            {benefits.map((item, index) => (
              <BenefitListItem
                key={item.label}
                item={item}
                showBorder={index < benefits.length - 1}
                requireSubscriptionAccess={requireSubscriptionAccess}
              />
            ))}
          </View>
        </PrimaryCard>
      ) : null}
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  headerTitleRow: {
    justifyContent: "flex-start",
  },
  headerTitle: {
    color: appTheme.colors.textPrimary,
  },
  headerBottom: {
    marginTop: 6,
  },
  headerBottomContent: {
    gap: 10,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  infoButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  infoButtonPressed: {
    opacity: 0.68,
  },
  infoBubbleWrap: {
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  infoBubble: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(26,24,32,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#1A1820",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  infoBubbleText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
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
    marginBottom: spacing.md,
  },
  searchFieldIcon: {
    marginRight: 8,
  },
  searchFieldInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textPrimary,
    paddingVertical: 0,
  },
  searchFieldPlaceholder: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: "#8B8595",
  },
  stateCard: {
    marginBottom: spacing.md,
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.card.radius,
  },
  stateText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  list: {
    overflow: "hidden",
  },
  searchResults: {
    gap: spacing.md,
  },
  searchSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  searchSummaryTitle: {
    fontSize: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.4,
  },
  resultsCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: "hidden",
  },
  resultsSectionTitle: {
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingTop: appTheme.card.paddingSpacious,
    paddingBottom: spacing.sm,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  benefitItem: {
    minHeight: 72,
    paddingHorizontal: appTheme.card.paddingSpacious,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  benefitItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
  },
  benefitItemPressed: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  benefitLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchResultItem: {
    minHeight: 72,
    paddingHorizontal: appTheme.card.paddingSpacious,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  searchResultBorder: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
  },
  searchResultPressed: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  searchResultCopy: {
    flex: 1,
    minWidth: 0,
  },
  searchResultName: {
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  searchResultMeta: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  benefitLabel: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
});
