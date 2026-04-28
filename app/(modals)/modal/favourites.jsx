import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  EmptyStateCard,
  PrimaryCard,
} from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import { getSupplementById } from "@src/data/getSupplement";
import { getHeartedSupplementIds } from "@/features/supplements/favouritesStorage";

function FavouriteRow({ item }) {
  return (
    <PrimaryCard
      onPress={() =>
        router.push({
          pathname: "/modal/supplement-info",
          params: { id: item.id, name: item.name },
        })
      }
      style={styles.rowCard}
      pressedStyle={styles.rowCardPressed}
    >
      <Text style={styles.rowTitle}>{item.name}</Text>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={appTheme.colors.textSecondary}
      />
    </PrimaryCard>
  );
}

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
        catalogType: record.data.catalogType ?? null,
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
    <BackdropScreen
      header={
        <AppHeader
          leftSlot={
            <AppButton
              onPress={() => router.back()}
              variant="overlay"
              size="icon"
              accessibilityLabel="Go back"
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={appTheme.colors.textStrong}
              />
            </AppButton>
          }
          title="FAVOURITES"
          titleStyle={styles.headerTitle}
          bottomSlot={
            <Text style={styles.headerSubtitle}>
              Your saved supplements and quick shortcuts
            </Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
      bottomInsetOffset={96}
      minBottomPadding={120}
    >
      {loading ? (
        <EmptyStateCard
          title="Loading favourites"
          description="Pulling in your saved supplements."
        />
      ) : favourites.length === 0 ? (
        <EmptyStateCard
          title="No favourites yet"
          description="Tap the heart in supplement info to save a supplement here."
        />
      ) : (
        <View style={styles.cardsList}>
          {favourites.map((item) => (
            <FavouriteRow key={item.id} item={item} />
          ))}
        </View>
      )}
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    color: appTheme.colors.textPrimary,
  },
  headerBottom: {
    marginTop: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  cardsList: {
    gap: spacing.sm,
  },
  rowCard: {
    minHeight: 78,
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  rowCardPressed: {
    opacity: 0.94,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
});
