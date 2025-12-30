import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, spacing, radius } from "@/theme";
import { SupplementRoute, SUPPLEMENT_ROUTES } from "@/types/Supplement";
import { useSupplementsStore } from "@/store/supplementStore";
import { Icon } from "@/components/icons/Icon";

/* ----------------------------------------
   Time options (15-minute intervals)
----------------------------------------- */

const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const minutes = i * 15;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  return {
    minutes,
    label: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
  };
});

const TIME_ITEM_HEIGHT = 44;
const TIME_PICKER_HEIGHT = 176;

/* ----------------------------------------
     Days of weel
  ----------------------------------------- */

const DAYS = [
  { label: "S", value: 0 },
  { label: "M", value: 1 },
  { label: "T", value: 2 },
  { label: "W", value: 3 },
  { label: "T", value: 4 },
  { label: "F", value: 5 },
  { label: "S", value: 6 },
];

export default function SupplementModal() {
  /* ----------------------------------------
     Params & mode
  ----------------------------------------- */

  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);

  const supplement = useSupplementsStore((s) =>
    id ? s.supplements.find((x) => x.id === id) : undefined
  );

  /* ----------------------------------------
     Store actions
  ----------------------------------------- */

  const addSupplement = useSupplementsStore((s) => s.addSupplement);
  const updateSupplement = useSupplementsStore((s) => s.updateSupplement);
  const deleteSupplement = useSupplementsStore((s) => s.deleteSupplement);

  /* ----------------------------------------
     Local state
  ----------------------------------------- */

  const initialTimeMinutes = supplement?.timeMinutes ?? 8 * 60;
  const initialTimeIndex = Math.max(
    0,
    TIME_OPTIONS.findIndex((t) => t.minutes === initialTimeMinutes)
  );
  const initialTimeOffset = Math.max(
    0,
    initialTimeIndex * TIME_ITEM_HEIGHT -
      (TIME_PICKER_HEIGHT - TIME_ITEM_HEIGHT) / 2
  );

  const [name, setName] = useState(supplement?.name ?? "");
  const [dose, setDose] = useState(supplement?.dose ?? "");
  const [route, setRoute] = useState<SupplementRoute>(
    supplement?.route ?? "tablet"
  );
  const [timeMinutes, setTimeMinutes] = useState(initialTimeMinutes);
  const timeScrollRef = useRef<ScrollView>(null);
  const hasScrolledInitial = useRef(false);

  const canSave = name.trim().length > 0;

  const timeLabel =
    TIME_OPTIONS.find((t) => t.minutes === timeMinutes)?.label ?? "08:00";

  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    supplement?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]
  );

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  /* ----------------------------------------
     Save / Delete
  ----------------------------------------- */

  const handleSave = () => {
    if (!canSave) return;

    const payload = {
      name: name.trim(),
      dose: dose.trim() || undefined,
      route,
      time: timeLabel,
      timeMinutes,
      daysOfWeek,
    };

    if (isEdit && id) {
      updateSupplement(id, payload);
    } else {
      addSupplement({
        id: Date.now().toString(),
        ...payload,
      });
    }

    router.back();
  };

  const handleDelete = () => {
    if (!id) return;

    Alert.alert("Delete supplement", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteSupplement(id);
          router.back();
        },
      },
    ]);
  };

  useEffect(() => {
    const index = TIME_OPTIONS.findIndex((t) => t.minutes === timeMinutes);
    if (index === -1) return;

    const centerOffset =
      index * TIME_ITEM_HEIGHT -
      (TIME_PICKER_HEIGHT - TIME_ITEM_HEIGHT) / 2;

    timeScrollRef.current?.scrollTo({
      y: Math.max(0, centerOffset),
      animated: hasScrolledInitial.current,
    });

    if (!hasScrolledInitial.current) {
      hasScrolledInitial.current = true;
    }
  }, [timeMinutes]);

  /* ----------------------------------------
     Render
  ----------------------------------------- */

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background.app }}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>

            <Text style={styles.title}>
              {isEdit ? "Edit supplement" : "Add supplement"}
            </Text>

            <Pressable disabled={!canSave} onPress={handleSave}>
              <Text style={[styles.save, !canSave && styles.saveDisabled]}>
                Save
              </Text>
            </Pressable>
          </View>

          {/* Form */}
          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Magnesium glycinate"
                placeholderTextColor={colors.text.muted}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Dose</Text>
              <TextInput
                value={dose}
                onChangeText={setDose}
                placeholder="e.g. 1 capsule, 2000 IU"
                placeholderTextColor={colors.text.muted}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Type</Text>

              <View style={styles.routeRow}>
                {SUPPLEMENT_ROUTES.map((r) => (
                  <Pressable
                    key={r.key}
                    onPress={() => setRoute(r.key)}
                    style={[
                      styles.routeOption,
                      route === r.key && styles.routeOptionActive,
                    ]}
                  >
                    <Icon route={r.key} size={18} />
                    <Text
                      style={[
                        styles.routeLabel,
                        route === r.key && styles.routeLabelActive,
                      ]}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Days</Text>

              <View style={styles.daysRow}>
                {DAYS.map((d) => {
                  const active = daysOfWeek.includes(d.value);

                  return (
                    <Pressable
                      key={d.value}
                      onPress={() => toggleDay(d.value)}
                      style={[styles.dayPill, active && styles.dayPillActive]}
                    >
                      <Text
                        style={[styles.dayText, active && styles.dayTextActive]}
                      >
                        {d.label}
                      </Text>

                      {!active && <View style={styles.diagonalStrike} />}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Time</Text>

              <View style={styles.timePicker}>
                <ScrollView
                  ref={timeScrollRef}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={TIME_ITEM_HEIGHT}
                  decelerationRate="fast"
                  contentOffset={{ x: 0, y: initialTimeOffset }}
                >
                  {TIME_OPTIONS.map((t) => (
                    <Pressable
                      key={t.minutes}
                      onPress={() => setTimeMinutes(t.minutes)}
                      style={[
                        styles.timeOption,
                        t.minutes === timeMinutes && styles.timeOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.timeText,
                          t.minutes === timeMinutes && styles.timeTextActive,
                        ]}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            {isEdit && (
              <Pressable onPress={handleDelete} style={styles.deleteButton}>
                <Text style={styles.deleteText}>Delete supplement</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ----------------------------------------
   Styles
----------------------------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.app,
  },

  header: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  title: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text.primary,
  },

  cancel: {
    fontSize: 15,
    color: colors.text.secondary,
  },

  save: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.brand.primary,
  },

  saveDisabled: {
    opacity: 0.4,
  },

  form: {
    padding: spacing.lg,
  },

  field: {
    marginBottom: spacing.lg,
  },

  label: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },

  input: {
    backgroundColor: colors.background.card,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text.primary,
  },

  routeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },

  routeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background.card,
  },

  routeOptionActive: {
    backgroundColor: colors.background.header,
  },

  routeLabel: {
    fontSize: 13,
    color: colors.text.secondary,
  },

  routeLabelActive: {
    color: colors.text.inverse,
    fontWeight: "500",
  },

  timePicker: {
    height: 176,
    backgroundColor: colors.background.card,
    borderRadius: radius.md,
  },

  timeOption: {
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },

  timeOptionActive: {
    backgroundColor: colors.background.header,
  },

  timeText: {
    fontSize: 16,
    color: colors.text.secondary,
  },

  timeTextActive: {
    color: colors.text.inverse,
    fontWeight: "600",
  },

  deleteButton: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: "center",
  },

  deleteText: {
    color: "#DC2626",
    fontSize: 15,
    fontWeight: "500",
  },

  daysRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },

  dayPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.card,
    alignItems: "center",
    justifyContent: "center",
  },

  dayPillActive: {
    backgroundColor: colors.background.header,
  },

  dayText: {
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: "500",
  },

  dayTextActive: {
    color: colors.text.inverse,
    fontWeight: "600",
  },

  diagonalStrike: {
    position: "absolute",
    width: "140%",
    height: 1.5,
    backgroundColor: colors.text.muted,
    transform: [{ rotate: "-45deg" }],
  },
});
