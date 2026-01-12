import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { Screen } from "@/components/common/layout/Screen";
import { HomeHeader } from "@/features/supplements/components/HomeHeader";
import { SupplementCard } from "@/features/supplements/components/SupplementCard";
import { colors, spacing } from "@/theme";
import { useSupplementsStore } from "@/features/supplements/store";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { searchSupplementCatalog } from "@src/data/searchSupplementCatalog";
import { getSupplementRatings } from "@src/data/getSupplementRatings";
import { getRatingStyle } from "@/utils/ratingStyles";

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No supplements due</Text>
      <Text style={styles.emptyText}>
        You don’t have any supplements scheduled for this day.
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const supplements = useSupplementsStore((s) => s.supplements);
  const selectedDate = useSupplementsStore((s) => s.selectedDate);
  const takenTimesByDate = useSupplementsStore((s) => s.takenTimesByDate);
  const [searchQuery, setSearchQuery] = useState("");
  const [matches, setMatches] = useState<{ id: string; name: string }[]>([]);
  const [ratingByCatalog, setRatingByCatalog] = useState<Record<string, number>>(
    {}
  );

  const todayDay = new Date(selectedDate).getDay();

  const dueSupplements = useMemo(
    () =>
      supplements.filter(
        (s) => Array.isArray(s.daysOfWeek) && s.daysOfWeek.includes(todayDay)
      ),
    [supplements, todayDay]
  );

  const visibleSupplements = useMemo(() => {
    if (!searchQuery.trim()) return dueSupplements;
    const q = searchQuery.toLowerCase();
    return dueSupplements.filter((s) => s.name.toLowerCase().includes(q));
  }, [dueSupplements, searchQuery]);

  const ratingColorFor = (catalogId?: string) => {
    if (!catalogId) return undefined;
    const score = ratingByCatalog[catalogId];
    if (typeof score !== "number") return undefined;
    return getRatingStyle(score).gradient[0];
  };

  const takenTimes = takenTimesByDate[selectedDate] ?? {};

  const toggleTaken = useSupplementsStore((s) => s.toggleTaken);
  const supplementsByTime = visibleSupplements.reduce<
    Record<number, typeof visibleSupplements>
  >((acc, s) => {
    if (!acc[s.timeMinutes]) acc[s.timeMinutes] = [];
    acc[s.timeMinutes].push(s);
    return acc;
  }, {});

  useEffect(() => {
    let active = true;

    const catalogIds = Array.from(
      new Set(visibleSupplements.map((s) => s.catalogId).filter(Boolean))
    );

    if (catalogIds.length === 0) {
      setRatingByCatalog({});
      return;
    }

    getSupplementRatings(catalogIds).then((map) => {
      if (active) setRatingByCatalog(map);
    });

    return () => {
      active = false;
    };
  }, [visibleSupplements]);

  // Supabase search for catalog when typing
  useEffect(() => {
    let active = true;
    if (!searchQuery.trim()) {
      setMatches([]);
      return;
    }

    searchSupplementCatalog(searchQuery).then((results) => {
      if (active) setMatches(results);
    });

    return () => {
      active = false;
    };
  }, [searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  return (
    <Screen
      header={
        <HomeHeader
          searchSlot={
            <View style={styles.searchUtility}>
              <Ionicons
                name="search"
                size={16}
                color={colors.brand.primary}
                style={styles.searchInlineIcon}
              />

              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search supplements…"
                placeholderTextColor={colors.text.muted}
                style={styles.searchInputUtility}
                clearButtonMode="while-editing"
              />
            </View>
          }
        />
      }
    >
      <View style={styles.content}>
        {isSearching ? (
          <View style={styles.searchResults}>
            {matches.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => {
                  setSearchQuery("");
                  setMatches([]);
                  router.push({
                    pathname: "/modal/supplement-info",
                    params: { id: m.id },
                  });
                }}
                style={styles.searchResultItem}
              >
                <Text style={styles.searchResultText}>{m.name}</Text>
              </Pressable>
            ))}

            <Pressable
              onPress={() => {
                setSearchQuery("");
                setMatches([]);
                router.push("/(modals)/modal/add-supplement-catalog");
              }}
              style={[styles.searchResultItem, styles.searchResultAdd]}
            >
              <Text style={styles.searchResultText}>+ Add new supplement</Text>
            </Pressable>
          </View>
        ) : visibleSupplements.length === 0 ? (
          <EmptyState />
        ) : (
          Object.entries(supplementsByTime)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([timeMinutes, items]) => (
              <View key={timeMinutes} style={styles.timeSection}>
                <Text style={styles.timeLabel}>{items[0].time}</Text>
                <View style={styles.cardGroup}>
                  {items.map((s) => (
                    <SupplementCard
                      key={s.id}
                      name={s.name}
                      subtitle={s.dose}
                      route={s.route}
                      iconBorderColor={ratingColorFor(s.catalogId)}
                      taken={Boolean(takenTimes[s.id])}
                      footer={
                        takenTimes[s.id]
                          ? `Taken at ${takenTimes[s.id]}`
                          : undefined
                      }
                      onPress={() => toggleTaken(s.id)}
                      onLongPress={() =>
                        router.push({
                          pathname: "/modal/supplement",
                          params: { id: s.id },
                        })
                      }
                    />
                  ))}
                </View>
              </View>
            ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  timeSection: {
    marginBottom: spacing.xl,
  },
  timeLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  cardGroup: {
    gap: spacing.xs - 20,
  },

  empty: {
    marginTop: -spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.background.card,
    borderRadius: 16,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },

  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
  },

  searchBox: {
    marginBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 4,
    marginHorizontal: spacing.xs - 10,
    marginTop: spacing.xs - 20,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },

  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 15,
    marginLeft: spacing.sm,
  },

  searchUtility: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
    marginHorizontal: -spacing.xs - 16,
    marginTop: spacing.xs - 10,

    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,

    // subtle border + lift
    borderWidth: 1.5,
    borderColor: "rgba(30,64,175,0.25)",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  searchInlineIcon: {
    marginRight: spacing.sm,
  },

  searchInputUtility: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
  },

  searchResults: {
    marginTop: spacing.sm,
    backgroundColor: colors.background.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: "hidden",
  },

  searchResultItem: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },

  searchResultAdd: {
    opacity: 0.8,
  },

  searchResultText: {
    fontSize: 15,
    color: colors.text.primary,
  },
});
