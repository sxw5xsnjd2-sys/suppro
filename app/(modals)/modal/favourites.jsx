import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { Screen } from "@/components/common/layout/Screen";
import { Header } from "@/components/common/layout/Header";
import { colors, spacing, radius, shadows } from "@/theme";
import { getSupplementById } from "@src/data/getSupplement";
import { getHeartedSupplementIds } from "@/features/supplements/favouritesStorage";

export default function FavouritesScreen() {
  const isFocused = useIsFocused();
  const [favourites, setFavourites] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadFavourites = useCallback(async () => {
    setLoading(true);
    const ids = await getHeartedSupplementIds();
    if (ids.length === 0) {
      setFavourites([]);
      setLoading(false);
      return;
    }

    const records = await Promise.all(
      ids.map(async (id) => {
        const data = await getSupplementById(id);
        if (!data?.id || !data?.name) return null;
        return { id, data };
      })
    );

    const valid = records
      .filter(Boolean)
      .map((record) => ({
        id: record.id,
        name: record.data.name,
        verified: record.data.verified ?? false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    setFavourites(valid);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    loadFavourites();
  }, [isFocused, loadFavourites]);

  return (
    <Screen
      header={
        <Header
          title="Favourites"
          subtitle="Your saved supplements"
          rightSlot={
            <Pressable onPress={() => router.back()} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.icon.primary} />
            </Pressable>
          }
        />
      }
    >
      <View style={styles.container}>
        <View style={styles.card}>
          {loading ? (
            <Text style={styles.emptyText}>Loading favourites…</Text>
          ) : favourites.length === 0 ? (
            <Text style={styles.emptyText}>
              No favourites yet. Tap the heart in supplement info to save one.
            </Text>
          ) : (
            favourites.map((item, index) => {
              const showBorder = index < favourites.length - 1;
              return (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    router.push({
                      pathname: "/modal/supplement-info",
                      params: { id: item.id, name: item.name },
                    })
                  }
                  style={({ pressed }) => [
                    styles.row,
                    showBorder && styles.rowBorder,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.rowLeft}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {(item.name?.[0] ?? "S").toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.rowTextWrap}>
                      <Text style={styles.rowTitle}>{item.name}</Text>
                      <Text style={styles.rowMeta}>
                        {item.verified
                          ? "Verified supplement"
                          : "User submitted supplement"}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.icon.muted}
                  />
                </Pressable>
              );
            })
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  card: {
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadows.card,
  },
  row: {
    minHeight: 72,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  rowPressed: {
    backgroundColor: colors.background.elevated,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 13,
    color: colors.text.secondary,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brand.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.brand.dark,
  },
  emptyText: {
    padding: spacing.md,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text.secondary,
    textAlign: "center",
  },
});
