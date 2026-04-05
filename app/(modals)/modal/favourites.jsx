import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  EmptyStateCard,
  PrimaryCard,
  SectionTitle,
  StatusPill,
} from "@/components/common/ui";
import FavouriteIcon from "@/assets/icons/profile/favourite.svg";
import { appTheme, spacing, typography } from "@/theme";
import { getSupplementById } from "@src/data/getSupplement";
import { getHeartedSupplementIds } from "@/features/supplements/favouritesStorage";

function FavouriteRow({ item, showBorder }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.name}
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
            {item.verified ? "Verified supplement" : "User submitted supplement"}
          </Text>
        </View>
      </View>

      <StatusPill
        label={item.verified ? "VERIFIED" : "COMMUNITY"}
        tone={item.verified ? "success" : "neutral"}
        style={styles.rowPill}
        textStyle={styles.rowPillText}
      />
    </Pressable>
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
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    setFavourites(valid);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    loadFavourites();
  }, [isFocused, loadFavourites]);

  const verifiedCount = useMemo(
    () => favourites.filter((item) => item.verified).length,
    [favourites]
  );

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
      <PrimaryCard style={styles.summaryCard}>
        <View style={styles.summaryLead}>
          <View style={styles.iconShell}>
            <FavouriteIcon
              width={18}
              height={18}
              color={appTheme.colors.textStrong}
              fill={appTheme.colors.textStrong}
              stroke={appTheme.colors.textStrong}
              strokeWidth={0.55}
            />
          </View>

          <View style={styles.summaryCopy}>
            <StatusPill
              label={loading ? "SYNCING" : `${favourites.length} SAVED`}
              tone="neutral"
            />
            <Text style={styles.summaryTitle}>Saved stack</Text>
            <Text style={styles.summaryBody}>
              {loading
                ? "Refreshing your saved supplement list."
                : favourites.length === 0
                ? "No favourites yet. Save supplements from their detail page."
                : `${verifiedCount} verified supplements ready to revisit.`}
            </Text>
          </View>
        </View>
      </PrimaryCard>

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
        <PrimaryCard style={styles.listCard}>
          <SectionTitle
            title="Supplements"
            subtitle="Open any saved item to see its evidence and details."
            style={styles.listHeader}
          />

          <View style={styles.listBody}>
            {favourites.map((item, index) => (
              <FavouriteRow
                key={item.id}
                item={item}
                showBorder={index < favourites.length - 1}
              />
            ))}
          </View>
        </PrimaryCard>
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
  summaryCard: {
    marginBottom: spacing.sm,
  },
  summaryLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconShell: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  summaryTitle: {
    marginTop: spacing.xs,
    fontSize: 22,
    lineHeight: 26,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.5,
  },
  summaryBody: {
    marginTop: spacing.xs,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  listCard: {
    paddingBottom: 0,
    overflow: "hidden",
  },
  listHeader: {
    paddingHorizontal: 0,
    paddingBottom: spacing.md,
  },
  listBody: {
    marginHorizontal: -appTheme.card.padding,
  },
  row: {
    minHeight: 78,
    paddingHorizontal: appTheme.card.paddingSpacious,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
  },
  rowPressed: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: appTheme.colors.surfaceAccent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 15,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  rowPill: {
    alignSelf: "center",
  },
  rowPillText: {
    fontSize: 11,
  },
});
