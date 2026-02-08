import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ScrollView, Alert, Modal, } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius } from "@/theme";
import { SUPPLEMENT_ROUTES, } from "@/features/supplements/types";
import { useSupplementsStore } from "@/features/supplements/store";
import { Icon } from "@/features/supplements/icons/Icon";
import { searchSupplementCatalog } from "@src/data/searchSupplementCatalog";
import { getScopedSupabase } from "@src/lib/supabase";
import { getClientId } from "@src/lib/clientId";
const todayYYYYMMDD = () => new Date().toISOString().split("T")[0];
const isValidISODate = (value) => {
    if (!value)
        return false;
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d)
        return false;
    const dt = new Date(value);
    return (dt instanceof Date &&
        !Number.isNaN(dt.getTime()) &&
        dt.getUTCFullYear() === y &&
        dt.getUTCMonth() + 1 === m &&
        dt.getUTCDate() === d);
};
const formatDisplayDate = (iso) => {
    if (!iso)
        return "Set date";
    if (!isValidISODate(iso))
        return "Invalid date";
    const [, m, d] = iso.split("-").map(Number);
    const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ];
    return `${String(d).padStart(2, "0")}-${months[(m || 1) - 1]}`;
};
const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();
function DatePickerModal({ visible, initialDate, onSelect, onClose, title, }) {
    const parsed = isValidISODate(initialDate)
        ? new Date(initialDate + "T00:00:00")
        : new Date();
    const [year, setYear] = useState(parsed.getFullYear());
    const [month, setMonth] = useState(parsed.getMonth()); // 0-index
    const handleMonthChange = (delta) => {
        setMonth((prev) => {
            const next = prev + delta;
            if (next < 0) {
                setYear((y) => y - 1);
                return 11;
            }
            if (next > 11) {
                setYear((y) => y + 1);
                return 0;
            }
            return next;
        });
    };
    const dayCells = (() => {
        const firstDay = new Date(year, month, 1).getDay(); // 0-6
        const totalDays = daysInMonth(year, month);
        const blanks = Array.from({ length: firstDay }, () => null);
        const days = Array.from({ length: totalDays }, (_, i) => i + 1);
        return [...blanks, ...days];
    })();
    const handleSelectDay = (day) => {
        if (!day)
            return;
        const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        onSelect(iso);
        onClose();
    };
    const monthLabel = new Date(year, month, 1).toLocaleString("en-US", {
        month: "short",
        year: "numeric",
    });
    return (<Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dateModalBackdrop}>
        <View style={styles.dateModalCard}>
          <View style={styles.dateModalHeader}>
            <Pressable onPress={() => handleMonthChange(-1)} hitSlop={8}>
              <Text style={styles.navArrow}>‹</Text>
            </Pressable>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={styles.dateModalTitle}>{title}</Text>
              <Text style={styles.dateModalMonth}>{monthLabel}</Text>
            </View>
            <Pressable onPress={() => handleMonthChange(1)} hitSlop={8}>
              <Text style={styles.navArrow}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (<Text key={`${d}-${idx}`} style={styles.weekday}>
                {d}
              </Text>))}
          </View>

          <View style={styles.calendarGrid}>
            {dayCells.map((day, idx) => {
            const isInitial = day &&
                isValidISODate(initialDate) &&
                `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` === initialDate;
            return (<Pressable key={`${day ?? "blank"}-${idx}`} style={[
                    styles.dayCell,
                    isInitial ? styles.dayCellActive : undefined,
                    !day ? styles.dayCellEmpty : undefined,
                ]} disabled={!day} onPress={() => handleSelectDay(day)}>
                  <Text style={[
                    styles.dayLabel,
                    isInitial ? styles.dayLabelActive : undefined,
                    !day ? styles.dayLabelEmpty : undefined,
                ]}>
                    {day ?? ""}
                  </Text>
                </Pressable>);
        })}
          </View>

          <Pressable onPress={onClose} style={styles.dateModalClose}>
            <Text style={styles.dateModalCloseText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>);
}
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
    const { newCatalogId, newCatalogName } = useLocalSearchParams();
    const { id } = useLocalSearchParams();
    const isEdit = Boolean(id);
    const supplement = useSupplementsStore((s) => id ? s.supplements.find((x) => x.id === id) : undefined);
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
    const initialTimeIndex = Math.max(0, TIME_OPTIONS.findIndex((t) => t.minutes === initialTimeMinutes));
    const initialTimeOffset = Math.max(0, initialTimeIndex * TIME_ITEM_HEIGHT -
        (TIME_PICKER_HEIGHT - TIME_ITEM_HEIGHT) / 2);
    const [name, setName] = useState(supplement?.name ?? "");
    const [matches, setMatches] = useState([]);
    const [catalogId, setCatalogId] = useState(supplement?.catalogId ?? null);
    const [saving, setSaving] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [dose, setDose] = useState(supplement?.dose ?? "");
    const [route, setRoute] = useState(supplement?.route ?? "tablet");
    const [timeMinutes, setTimeMinutes] = useState(initialTimeMinutes);
    const [startDate, setStartDate] = useState(supplement?.startDate ?? supplement?.createdAt ?? todayYYYYMMDD());
    const [endDate, setEndDate] = useState(supplement?.endDate ?? null);
    const [activeDatePicker, setActiveDatePicker] = useState(null);
    const timeScrollRef = useRef(null);
    const hasScrolledInitial = useRef(false);
    const startDateValid = isValidISODate(startDate);
    const endDateValid = !endDate || isValidISODate(endDate);
    const chronologicalValid = !endDate || (startDateValid && endDateValid && endDate >= startDate);
    const canSave = name.trim().length > 0 &&
        startDateValid &&
        endDateValid &&
        chronologicalValid;
    const timeLabel = TIME_OPTIONS.find((t) => t.minutes === timeMinutes)?.label ?? "08:00";
    const [daysOfWeek, setDaysOfWeek] = useState(supplement?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]);
    const toggleDay = (day) => {
        setDaysOfWeek((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort());
    };
    useEffect(() => {
        let active = true;
        if (catalogId) {
            setMatches([]);
            setDropdownOpen(false);
            return;
        }
        if (!name.trim()) {
            setMatches([]);
            setCatalogId(null);
            setDropdownOpen(false);
            return;
        }
        searchSupplementCatalog(name).then((results) => {
            if (active) {
                setMatches(results);
                setDropdownOpen(name.trim().length > 0);
            }
        });
        return () => {
            active = false;
        };
    }, [name, catalogId]);
    useEffect(() => {
        if (newCatalogId && newCatalogName) {
            setName(newCatalogName);
            setCatalogId(newCatalogId);
            setMatches([]);
        }
    }, [newCatalogId, newCatalogName]);
    /* ----------------------------------------
       Save / Delete
    ----------------------------------------- */
    const handleSave = async () => {
        if (!canSave || saving)
            return;
        setSaving(true);
        try {
            const trimmedName = name.trim();
            let resolvedCatalogId = catalogId;
            const needsUserCatalogId = !resolvedCatalogId || resolvedCatalogId.startsWith("custom-");
            if (needsUserCatalogId) {
                const [supabase, clientId] = await Promise.all([
                    getScopedSupabase(),
                    getClientId(),
                ]);
                const findExistingByName = async () => {
                    const { data: exactMatch, error: exactError } = await supabase
                        .from("user_supplements")
                        .select("id")
                        .eq("name", trimmedName)
                        .maybeSingle();
                    if (!exactError && exactMatch?.id) {
                        return `user-${exactMatch.id}`;
                    }
                    const { data: fuzzyMatch, error: fuzzyError } = await supabase
                        .from("user_supplements")
                        .select("id")
                        .ilike("name", trimmedName)
                        .limit(1)
                        .maybeSingle();
                    if (!fuzzyError && fuzzyMatch?.id) {
                        return `user-${fuzzyMatch.id}`;
                    }
                    return null;
                };
                const existingCatalogId = await findExistingByName();
                if (existingCatalogId) {
                    resolvedCatalogId = existingCatalogId;
                }
                else {
                    const { data, error } = await supabase
                        .from("user_supplements")
                        .insert({
                        client_id: clientId,
                        name: trimmedName,
                    })
                        .select("id")
                        .single();
                    if (error) {
                        if (error.code === "23505") {
                            const duplicateCatalogId = await findExistingByName();
                            if (duplicateCatalogId) {
                                resolvedCatalogId = duplicateCatalogId;
                            }
                            else {
                                throw error;
                            }
                        }
                        else {
                            throw error;
                        }
                    }
                    else {
                        resolvedCatalogId = `user-${data.id}`;
                    }
                }
            }
            const payload = {
                name: trimmedName,
                catalogId: resolvedCatalogId,
                dose: dose.trim() || undefined,
                route,
                time: timeLabel,
                timeMinutes,
                daysOfWeek,
                startDate: startDateValid ? startDate : todayYYYYMMDD(),
                endDate: endDateValid ? endDate || null : null,
            };
            if (isEdit && id) {
                updateSupplement(id, payload);
            }
            else {
                addSupplement({
                    id: Date.now().toString(),
                    ...payload,
                });
            }
            router.back();
        }
        catch (error) {
            console.error("Failed to save custom supplement to user_supplements", error);
            Alert.alert("Could not save supplement", "Please try again in a moment.");
        }
        finally {
            setSaving(false);
        }
    };
    const handleDelete = () => {
        if (!id)
            return;
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
        if (index === -1)
            return;
        const centerOffset = index * TIME_ITEM_HEIGHT - (TIME_PICKER_HEIGHT - TIME_ITEM_HEIGHT) / 2;
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
    return (<SafeAreaView style={{ flex: 1, backgroundColor: colors.background.app }} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>

            <Text style={styles.title}>
              {isEdit ? "Edit supplement" : "Add supplement"}
            </Text>

            <Pressable disabled={!canSave || saving} onPress={handleSave}>
              <Text style={[styles.save, (!canSave || saving) && styles.saveDisabled]}>
                {saving ? "Saving..." : "Save"}
              </Text>
            </Pressable>
          </View>

          {/* Form */}
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="always">
            <View style={styles.field}>
              <Text style={styles.label}>Supplement name</Text>

              <TextInput value={name} onChangeText={(text) => {
            setName(text);
            setCatalogId(null); // reset until user selects
            setDropdownOpen(text.trim().length > 0);
        }} placeholder="Type supplement name" onFocus={() => setDropdownOpen(name.trim().length > 0)} onBlur={() => setDropdownOpen(false)} style={styles.input}/>

              {/* Dropdown */}
              {dropdownOpen && name.trim().length > 0 && (<View style={styles.dropdownPanel}>
                  {/* Matching catalog results (if any) */}
                  {matches.map((m) => (<Pressable key={`${m.verified ? "v" : "u"}-${m.id}`} onPress={() => {
                    setName(m.name);
                    setCatalogId(m.id);
                    setMatches([]);
                    setDropdownOpen(false);
                }} style={styles.dropdownItem}>
                      <Text>{m.name}</Text>
                      {!m.verified && (<Text style={styles.unverifiedBadge}>
                          Unverified
                        </Text>)}
                    </Pressable>))}

                  <Pressable onPress={() => {
                setDropdownOpen(false);
                router.push("/(modals)/modal/add-supplement-catalog");
            }} style={[
                styles.dropdownAdd,
                matches.length > 0 && styles.dropdownAddWithBorder,
            ]}>
                    <Text style={styles.dropdownAddText}>+ Add new supplement</Text>
                  </Pressable>

                </View>)}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Dose</Text>
              <TextInput value={dose} onChangeText={setDose} placeholder="e.g. 1 capsule, 2000 IU" placeholderTextColor={colors.text.muted} style={styles.input}/>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Type</Text>

              <View style={styles.routeRow}>
                {SUPPLEMENT_ROUTES.map((r) => (<Pressable key={r.key} onPress={() => setRoute(r.key)} style={[
                styles.routeOption,
                route === r.key && styles.routeOptionActive,
            ]}>
                    <Icon route={r.key} size={18}/>
                    <Text style={[
                styles.routeLabel,
                route === r.key && styles.routeLabelActive,
            ]}>
                      {r.label}
                    </Text>
                  </Pressable>))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Start date</Text>
              <Pressable onPress={() => setActiveDatePicker("start")} style={[
            styles.input,
            styles.dateField,
            (!startDateValid || !chronologicalValid) && styles.inputError,
        ]}>
                <Text style={styles.dateFieldText}>
                  {formatDisplayDate(startDate)}
                </Text>
              </Pressable>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>End date (optional)</Text>
              <Pressable onPress={() => setActiveDatePicker("end")} style={[
            styles.input,
            styles.dateField,
            (!endDateValid || !chronologicalValid) && styles.inputError,
        ]}>
                <Text style={styles.dateFieldText}>
                  {endDate ? formatDisplayDate(endDate) : "Ongoing"}
                </Text>
              </Pressable>
              {endDate && (<Pressable onPress={() => setEndDate(null)} hitSlop={6} style={styles.clearEndDate}>
                  <Text style={styles.clearEndDateText}>Set to ongoing</Text>
                </Pressable>)}
              {(!startDateValid || !endDateValid || !chronologicalValid) && (<Text style={styles.errorText}>
                  {(() => {
                if (!startDateValid)
                    return "Enter a valid start date.";
                if (!endDateValid)
                    return "Enter a valid end date or leave it blank.";
                if (!chronologicalValid)
                    return "End date must be on or after the start date.";
                return "";
            })()}
                </Text>)}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Days</Text>

              <View style={styles.daysRow}>
                {DAYS.map((d) => {
            const active = daysOfWeek.includes(d.value);
            return (<Pressable key={d.value} onPress={() => toggleDay(d.value)} style={[styles.dayPill, active && styles.dayPillActive]}>
                      <Text style={[styles.dayText, active && styles.dayTextActive]}>
                        {d.label}
                      </Text>

                      {!active && <View style={styles.diagonalStrike}/>}
                    </Pressable>);
        })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Time</Text>

              <View style={styles.timePicker}>
                <ScrollView ref={timeScrollRef} showsVerticalScrollIndicator={false} snapToInterval={TIME_ITEM_HEIGHT} decelerationRate="fast" contentOffset={{ x: 0, y: initialTimeOffset }}>
                  {TIME_OPTIONS.map((t) => (<Pressable key={t.minutes} onPress={() => setTimeMinutes(t.minutes)} style={[
                styles.timeOption,
                t.minutes === timeMinutes && styles.timeOptionActive,
            ]}>
                      <Text style={[
                styles.timeText,
                t.minutes === timeMinutes && styles.timeTextActive,
            ]}>
                        {t.label}
                      </Text>
                    </Pressable>))}
                </ScrollView>
              </View>
            </View>

            {isEdit && (<Pressable onPress={handleDelete} style={styles.deleteButton}>
                <Text style={styles.deleteText}>Delete supplement</Text>
              </Pressable>)}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <DatePickerModal visible={activeDatePicker === "start"} initialDate={startDate} onSelect={(iso) => {
            setStartDate(iso);
            if (endDate && iso > endDate) {
                setEndDate(iso);
            }
        }} onClose={() => setActiveDatePicker(null)} title="Select start date"/>

      <DatePickerModal visible={activeDatePicker === "end"} initialDate={endDate ?? startDate} onSelect={(iso) => setEndDate(iso)} onClose={() => setActiveDatePicker(null)} title="Select end date"/>
    </SafeAreaView>);
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
        paddingTop: spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.md,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: colors.border.subtle,
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
        backgroundColor: colors.background.elevated,
        borderRadius: radius.md,
        padding: spacing.md,
        fontSize: 15,
        color: colors.text.primary,
        borderWidth: 1,
        borderColor: colors.border.subtle,
    },
    inputError: {
        borderWidth: 1,
        borderColor: "#DC2626",
    },
    errorText: {
        marginTop: spacing.xs,
        color: colors.status.danger,
        fontSize: 12,
    },
    dateField: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    dateFieldText: {
        fontSize: 15,
        color: colors.text.primary,
    },
    dateModalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.35)",
        justifyContent: "center",
        padding: spacing.lg,
    },
    dateModalCard: {
        backgroundColor: colors.background.card,
        borderRadius: radius.lg,
        padding: spacing.md,
    },
    dateModalHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.sm,
    },
    dateModalTitle: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.text.primary,
    },
    dateModalMonth: {
        marginTop: 2,
        fontSize: 13,
        color: colors.text.secondary,
    },
    navArrow: {
        fontSize: 18,
        color: colors.text.primary,
        paddingHorizontal: spacing.xs,
    },
    weekdayRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: spacing.xs,
    },
    weekday: {
        width: "14.28%",
        textAlign: "center",
        fontSize: 12,
        color: colors.text.secondary,
    },
    calendarGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
    },
    dayCell: {
        width: "14.28%",
        aspectRatio: 1,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.sm,
        marginBottom: spacing.xs / 2,
    },
    dayCellEmpty: {
        backgroundColor: "transparent",
    },
    dayCellActive: {
        backgroundColor: colors.background.header,
    },
    dayLabel: {
        fontSize: 14,
        color: colors.text.primary,
    },
    dayLabelActive: {
        color: colors.text.inverse,
        fontWeight: "600",
    },
    dayLabelEmpty: {
        color: colors.text.secondary,
    },
    dateModalClose: {
        marginTop: spacing.sm,
        alignItems: "center",
    },
    dateModalCloseText: {
        color: colors.text.secondary,
        fontWeight: "600",
    },
    clearEndDate: {
        marginTop: spacing.xs / 2,
        alignSelf: "flex-start",
    },
    clearEndDateText: {
        fontSize: 13,
        color: colors.brand.primary,
        fontWeight: "600",
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
        borderWidth: 1,
        borderColor: colors.border.subtle,
    },
    routeOptionActive: {
        backgroundColor: colors.border.strong,
        borderColor: colors.brand.primary,
    },
    routeLabel: {
        fontSize: 13,
        color: colors.text.secondary,
    },
    routeLabelActive: {
        color: colors.text.primary,
        fontWeight: "600",
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
        backgroundColor: colors.border.strong,
    },
    timeText: {
        fontSize: 16,
        color: colors.text.secondary,
    },
    timeTextActive: {
        color: colors.text.primary,
        fontWeight: "600",
    },
    deleteButton: {
        marginTop: spacing.xl,
        paddingVertical: spacing.md,
        alignItems: "center",
    },
    deleteText: {
        color: colors.status.danger,
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
        borderWidth: 1,
        borderColor: colors.border.subtle,
        alignItems: "center",
        justifyContent: "center",
    },
    dayPillActive: {
        backgroundColor: colors.border.strong,
        borderColor: colors.brand.primary,
    },
    dayText: {
        fontSize: 14,
        color: colors.text.secondary,
        fontWeight: "500",
    },
    dayTextActive: {
        color: colors.text.primary,
        fontWeight: "600",
    },
    diagonalStrike: {
        position: "absolute",
        width: "140%",
        height: 1.5,
        backgroundColor: colors.text.muted,
        transform: [{ rotate: "-45deg" }],
    },
    dropdownPanel: {
        marginTop: 6,
        borderWidth: 1,
        borderRadius: radius.md,
        borderColor: colors.border.subtle,
        backgroundColor: colors.background.card,
        overflow: "hidden",
    },
    dropdownItem: {
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.xs,
    },
    dropdownAdd: {
        padding: 12,
        opacity: 0.75,
    },
    dropdownAddWithBorder: {
        borderTopWidth: 1,
        borderColor: colors.border.subtle,
    },
    dropdownAddText: {
        color: colors.text.secondary,
        fontWeight: "600",
    },
    unverifiedBadge: {
        fontSize: 12,
        color: "#9C6B10",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: "#F9EEC2",
    },
});
