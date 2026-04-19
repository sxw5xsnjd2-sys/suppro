import React, { useEffect, useMemo, useState } from "react";
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
import { getTrackedSupplementEvidenceScores } from "@/features/supplements/getTrackedSupplementEvidenceScores";
import { openTrackedSupplementInfo } from "@/features/supplements/openTrackedSupplementInfo";
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
  const [ratingBySupplementId, setRatingBySupplementId] = useState({});
  const sorted = useMemo(
    () => [...supplements].sort((a, b) => a.timeMinutes - b.timeMinutes),
    [supplements]
  );

  useEffect(() => {
    let active = true;
    if (sorted.length === 0) {
      setRatingBySupplementId({});
      return;
    }
    getTrackedSupplementEvidenceScores(sorted)
      .then((map) => {
        if (active) setRatingBySupplementId(map);
      })
      .catch(() => {
        if (active) setRatingBySupplementId({});
      });
    return () => {
      active = false;
    };
  }, [sorted]);

  const iconColorFor = (supplementId) => {
    if (!supplementId) return undefined;
    const score = ratingBySupplementId[supplementId];
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
            iconBackgroundColor={iconColorFor(s.id)}
            showCheckbox={false}
            onInfoPress={() => openTrackedSupplementInfo(s)}
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
