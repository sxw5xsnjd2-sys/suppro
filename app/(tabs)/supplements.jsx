import React, { useEffect, useState } from "react";
import { Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppHeader,
  EmptyStateCard,
  StatusPill,
} from "@/components/common/ui";
import { SupplementCard } from "@/features/supplements/components/SupplementCard";
import { appTheme, typography } from "@/theme";
import { useSupplementsStore } from "@/features/supplements/store";
import { getSupplementRatings } from "@src/data/getSupplementRatings";
import { getRatingStyle } from "@/utils/ratingStyles";

function EmptyState() {
  return (
    <EmptyStateCard
      title="No supplements added"
      description="Add your stack to manage dosage and schedule reminders."
    />
  );
}

export default function SupplementsScreen() {
  const supplements = useSupplementsStore((s) => s.supplements);
  const [ratingByCatalog, setRatingByCatalog] = useState({});
  const sorted = [...supplements].sort((a, b) => a.timeMinutes - b.timeMinutes);

  useEffect(() => {
    let active = true;
    const catalogIds = Array.from(
      new Set(sorted.map((s) => s.catalogId).filter(Boolean))
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
  }, [sorted]);

  const iconColorFor = (catalogId) => {
    if (!catalogId) return undefined;
    const score = ratingByCatalog[catalogId];
    if (typeof score !== "number") return undefined;
    return getRatingStyle(score).gradient[0];
  };

  return (
    <BackdropScreen
      header={
        <AppHeader
          title="SUPPLEMENTS"
          titleStyle={styles.headerTitle}
          titleAccessory={
            <StatusPill
              label={`${sorted.length} TOTAL`}
              tone="neutral"
              style={styles.headerCount}
            />
          }
          bottomSlot={
            <Text style={styles.headerSubtitle}>Your complete stack</Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
    >
      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        sorted.map((s) => (
          <SupplementCard
            key={s.id}
            name={s.name}
            subtitle={s.dose ? `${s.dose} · ${s.time}` : s.time}
            route={s.route}
            iconBackgroundColor={iconColorFor(s.catalogId)}
            showCheckbox={false}
            onInfoPress={() =>
              router.push({
                pathname: "/modal/supplement-info",
                params: { id: s.catalogId, name: s.name },
              })
            }
            onPress={() =>
              router.push({
                pathname: "/modal/supplement",
                params: { id: s.id },
              })
            }
          />
        ))
      )}
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    color: appTheme.colors.textPrimary,
  },
  headerCount: {
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  headerBottom: {
    marginTop: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
});
