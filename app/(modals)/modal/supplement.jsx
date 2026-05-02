import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppFormField,
  AppHeader,
  AppSectionCard,
  PrimaryCard,
} from "@/components/common/ui";
import { appTheme, shadows, spacing, typography } from "@/theme";
import { SUPPLEMENT_ROUTES } from "@/features/supplements/types";
import { useSupplementsStore } from "@/features/supplements/store";
import { Icon } from "@/features/supplements/icons/Icon";
import {
  getSupplementScheduleLabel,
  normalizeSupplementSchedule,
} from "@/features/supplements/schedule";
import { useScannerStore } from "@/features/scanner/store";
import {
  getTrackedScanMatchedIngredients,
  getSupplementLinkedIngredients,
  hasTrackedScanContext,
} from "@/features/supplements/trackedScanContext";
import { getCatalogType, CATALOG_TYPES } from "@/features/supplements/catalog";
import { getSupplementProductLinkedIngredients } from "@src/data/getSupplement";
import { useToastStore } from "@/features/toast/toastStore";

const todayYYYYMMDD = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isValidISODate = (value) => {
  if (!value) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dt = new Date(value);
  return (
    dt instanceof Date &&
    !Number.isNaN(dt.getTime()) &&
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
};

const normalizeIntegerParam = (value) => {
  if (Array.isArray(value)) {
    return normalizeIntegerParam(value[0]);
  }

  const parsed = Number.parseInt(
    typeof value === "string" ? value : String(value ?? ""),
    10
  );

  return Number.isFinite(parsed) ? parsed : null;
};

const formatDisplayDate = (iso) => {
  if (!iso) return "Set date";
  if (!isValidISODate(iso)) return "Invalid date";
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

const trimString = (value) => (typeof value === "string" ? value.trim() : "");

const daysInMonth = (year, monthIndex) =>
  new Date(year, monthIndex + 1, 0).getDate();

function DatePickerModal({ visible, initialDate, onSelect, onClose, title }) {
  const parsed = isValidISODate(initialDate)
    ? new Date(initialDate + "T00:00:00")
    : new Date();
  const [year, setYear] = useState(parsed.getFullYear());
  const [month, setMonth] = useState(parsed.getMonth());

  const handleMonthChange = (delta) => {
    setMonth((prev) => {
      const next = prev + delta;
      if (next < 0) {
        setYear((currentYear) => currentYear - 1);
        return 11;
      }
      if (next > 11) {
        setYear((currentYear) => currentYear + 1);
        return 0;
      }
      return next;
    });
  };

  const dayCells = (() => {
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = daysInMonth(year, month);
    const blanks = Array.from({ length: firstDay }, () => null);
    const days = Array.from({ length: totalDays }, (_, index) => index + 1);
    return [...blanks, ...days];
  })();

  const handleSelectDay = (day) => {
    if (!day) return;
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    onSelect(iso);
    onClose();
  };

  const monthLabel = new Date(year, month, 1).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.dateModalBackdrop}>
        <PrimaryCard style={styles.dateModalCard}>
          <View style={styles.dateModalHeader}>
            <AppButton
              accessibilityLabel="Previous month"
              onPress={() => handleMonthChange(-1)}
              size="icon"
              variant="overlay"
              style={styles.dateNavButton}
            >
              <Text style={styles.navArrow}>‹</Text>
            </AppButton>

            <View style={styles.dateModalHeaderCopy}>
              <Text style={styles.dateModalTitle}>{title}</Text>
              <Text style={styles.dateModalMonth}>{monthLabel}</Text>
            </View>

            <AppButton
              accessibilityLabel="Next month"
              onPress={() => handleMonthChange(1)}
              size="icon"
              variant="overlay"
              style={styles.dateNavButton}
            >
              <Text style={styles.navArrow}>›</Text>
            </AppButton>
          </View>

          <View style={styles.weekdayRow}>
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.weekday}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {dayCells.map((day, index) => {
              const isInitial =
                day &&
                isValidISODate(initialDate) &&
                `${year}-${String(month + 1).padStart(2, "0")}-${String(
                  day
                ).padStart(2, "0")}` === initialDate;

              return (
                <Pressable
                  key={`${day ?? "blank"}-${index}`}
                  disabled={!day}
                  onPress={() => handleSelectDay(day)}
                  style={({ pressed }) => [
                    styles.dayCell,
                    isInitial && styles.dayCellActive,
                    !day && styles.dayCellEmpty,
                    pressed && day && styles.dayCellPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayLabel,
                      isInitial && styles.dayLabelActive,
                      !day && styles.dayLabelEmpty,
                    ]}
                  >
                    {day ?? ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <AppButton
            label="Cancel"
            onPress={onClose}
            variant="ghost"
            size="sm"
            style={styles.dateModalClose}
          />
        </PrimaryCard>
      </View>
    </Modal>
  );
}

const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, index) => {
  const minutes = index * 15;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return {
    minutes,
    label: `${hour.toString().padStart(2, "0")}:${minute
      .toString()
      .padStart(2, "0")}`,
  };
});

const TIME_ITEM_HEIGHT = 44;
const TIME_PICKER_HEIGHT = 176;

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
  const {
    newCatalogId,
    newCatalogName,
    newCatalogType,
    initialName,
    id,
    scanSessionId,
    scanSource,
    toastTarget,
  } = useLocalSearchParams();
  const isEdit = Boolean(id);
  const requestedScanSessionId = normalizeIntegerParam(scanSessionId);
  const currentScannerSessionId = useScannerStore(
    (state) => state.scanSessionId
  );

  const supplement = useSupplementsStore((state) =>
    id ? state.supplements.find((item) => item.id === id) : undefined
  );

  const addSupplement = useSupplementsStore((state) => state.addSupplement);
  const updateSupplement = useSupplementsStore(
    (state) => state.updateSupplement
  );
  const showToast = useToastStore((s) => s.show);
  const deleteSupplement = useSupplementsStore(
    (state) => state.deleteSupplement
  );

  const initialTimeMinutes = supplement?.timeMinutes ?? 8 * 60;
  const initialTimeIndex = Math.max(
    0,
    TIME_OPTIONS.findIndex((option) => option.minutes === initialTimeMinutes)
  );
  const initialTimeOffset = Math.max(
    0,
    initialTimeIndex * TIME_ITEM_HEIGHT -
      (TIME_PICKER_HEIGHT - TIME_ITEM_HEIGHT) / 2
  );
  const initialSchedule = normalizeSupplementSchedule(supplement ?? {});

  const initialScannedName = typeof initialName === "string" ? initialName : "";
  const [name, setName] = useState(supplement?.name ?? initialScannedName);
  const [catalogId, setCatalogId] = useState(supplement?.catalogId ?? null);
  const [catalogType, setCatalogType] = useState(
    supplement?.catalogType ?? getCatalogType(supplement?.catalogId)
  );
  const [saving, setSaving] = useState(false);
  const [dose, setDose] = useState(supplement?.dose ?? "");
  const [route, setRoute] = useState(supplement?.route ?? "tablet");
  const [timeMinutes, setTimeMinutes] = useState(initialTimeMinutes);
  const [startDate, setStartDate] = useState(
    supplement?.startDate ?? supplement?.createdAt ?? todayYYYYMMDD()
  );
  const [endDate, setEndDate] = useState(supplement?.endDate ?? null);
  const [activeDatePicker, setActiveDatePicker] = useState(null);
  const [daysOfWeek, setDaysOfWeek] = useState(
    initialSchedule.daysOfWeek
  );
  const [scheduleType] = useState(initialSchedule.scheduleType);
  const [intervalDays] = useState(initialSchedule.intervalDays);
  const [scheduleAnchorDate] = useState(initialSchedule.scheduleAnchorDate);
  const [frequency] = useState(initialSchedule.frequency);
  const [frequencyLabel] = useState(initialSchedule.frequencyLabel);

  const timeScrollRef = useRef(null);
  const hasScrolledInitial = useRef(false);

  const startDateValid = isValidISODate(startDate);
  const endDateValid = !endDate || isValidISODate(endDate);
  const chronologicalValid =
    !endDate || (startDateValid && endDateValid && endDate >= startDate);
  const canSave =
    name.trim().length > 0 &&
    Boolean(catalogId) &&
    startDateValid &&
    endDateValid &&
    chronologicalValid;
  const timeLabel =
    TIME_OPTIONS.find((option) => option.minutes === timeMinutes)?.label ??
    "08:00";

  const toggleDay = (day) => {
    setDaysOfWeek((previous) =>
      previous.includes(day)
        ? previous.filter((value) => value !== day)
        : [...previous, day].sort()
    );
  };

  useEffect(() => {
    if (newCatalogId && newCatalogName) {
      setName(newCatalogName);
      setCatalogId(newCatalogId);
      setCatalogType(
        typeof newCatalogType === "string"
          ? newCatalogType
          : getCatalogType(newCatalogId)
      );
      return;
    }

    if (initialScannedName && !isEdit) {
      setName(initialScannedName);
      setCatalogId(null);
      setCatalogType(null);
    }
  }, [
    initialScannedName,
    isEdit,
    newCatalogId,
    newCatalogName,
    newCatalogType,
  ]);

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);

    try {
      const trimmedName = name.trim();
      const resolvedCatalogId = catalogId;
      const resolvedCatalogType =
        catalogType ?? getCatalogType(resolvedCatalogId);

      if (!resolvedCatalogId || !resolvedCatalogType) {
        Alert.alert(
          "Choose a supplement",
          "Search and select an active ingredient or supplement product before saving."
        );
        return;
      }

      const schedulePayload =
        scheduleType === "interval"
          ? {
              frequency,
              frequencyLabel,
              scheduleType,
              daysOfWeek: [],
              intervalDays,
              scheduleAnchorDate: scheduleAnchorDate || startDate,
            }
          : scheduleType === "custom"
          ? {
              frequency,
              frequencyLabel,
              scheduleType,
              daysOfWeek,
              intervalDays: null,
              scheduleAnchorDate: null,
            }
          : normalizeSupplementSchedule({
              scheduleType: "weekly",
              daysOfWeek,
            });
      let linkedIngredients = null;
      const payload = {
        name: trimmedName,
        catalogId: resolvedCatalogId,
        catalogType: resolvedCatalogType,
        dose: dose.trim() || undefined,
        route,
        time: timeLabel,
        timeMinutes,
        ...schedulePayload,
        startDate: startDateValid ? startDate : todayYYYYMMDD(),
        endDate: endDateValid ? endDate || null : null,
      };

      const selectedCatalogChanged = Boolean(newCatalogId && newCatalogName);
      const canUseActiveScanContext =
        scanSource === "scanned_product" &&
        !selectedCatalogChanged &&
        Number.isFinite(requestedScanSessionId) &&
        requestedScanSessionId === currentScannerSessionId;

      const activeScannerState = canUseActiveScanContext
        ? useScannerStore.getState()
        : null;
      const activeScanMatchedIngredients =
        activeScannerState?.status === "success" &&
        Array.isArray(activeScannerState?.matchedIngredients)
          ? activeScannerState.matchedIngredients
          : [];
      const activeScanServingSizeText = trimString(
        activeScannerState?.product?.servingSizeText
      );
      let resolvedServingSizeText = null;

      if (activeScanMatchedIngredients.length > 0) {
        payload.scanSource = "scanned_product";
        linkedIngredients = activeScanMatchedIngredients;
        resolvedServingSizeText = activeScanServingSizeText || null;
      } else if (
        isEdit &&
        hasTrackedScanContext(supplement) &&
        !selectedCatalogChanged
      ) {
        payload.scanSource = supplement.scanSource;
        linkedIngredients = getTrackedScanMatchedIngredients(supplement);
        resolvedServingSizeText =
          trimString(supplement?.servingSizeText) || null;
      } else if (resolvedCatalogType === CATALOG_TYPES.SUPPLEMENT_PRODUCT) {
        const productLinkedIngredients =
          await getSupplementProductLinkedIngredients(resolvedCatalogId);
        if (!productLinkedIngredients.length) {
          Alert.alert(
            "Could not add supplement",
            "This supplement product does not have linked active ingredients yet."
          );
          return;
        }
        payload.scanSource = null;
        linkedIngredients = productLinkedIngredients;
      } else if (isEdit && !selectedCatalogChanged) {
        payload.scanSource = supplement?.scanSource ?? null;
        linkedIngredients = getSupplementLinkedIngredients(supplement);
      } else {
        payload.scanSource = null;
      }
      payload.linkedIngredients = linkedIngredients?.length
        ? linkedIngredients
        : null;
      payload.servingSizeText =
        payload.scanSource === "scanned_product"
          ? resolvedServingSizeText
          : null;

      if (isEdit && id) {
        updateSupplement(id, payload);
        router.back();
      } else {
        const resolvedToastTarget =
          typeof toastTarget === "string" && toastTarget.trim().length > 0
            ? toastTarget
            : "global";
        addSupplement({
          id: Date.now().toString(),
          ...payload,
        });
        router.back();
        setTimeout(() => {
          showToast("Added to your stack!", resolvedToastTarget);
        }, 250);
      }
    } catch (error) {
      console.error("Failed to save supplement", error);
      Alert.alert("Could not save supplement", "Please try again in a moment.");
    } finally {
      setSaving(false);
    }
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
    const index = TIME_OPTIONS.findIndex(
      (option) => option.minutes === timeMinutes
    );
    if (index === -1) return;

    const centerOffset =
      index * TIME_ITEM_HEIGHT - (TIME_PICKER_HEIGHT - TIME_ITEM_HEIGHT) / 2;

    timeScrollRef.current?.scrollTo({
      y: Math.max(0, centerOffset),
      animated: hasScrolledInitial.current,
    });

    if (!hasScrolledInitial.current) {
      hasScrolledInitial.current = true;
    }
  }, [timeMinutes]);

  const dateValidationMessage = (() => {
    if (!startDateValid) return "Enter a valid start date.";
    if (!endDateValid) return "Enter a valid end date or leave it blank.";
    if (!chronologicalValid)
      return "End date must be on or after the start date.";
    return "";
  })();

  return (
    <>
      <BackdropScreen
        bottomInsetOffset={72}
        minBottomPadding={96}
        header={
          <AppHeader
            insetPreset="modal"
            bottomPadding={8}
            leftSlot={
              <AppButton
                onPress={() => router.back()}
                variant="overlay"
                size="icon"
                accessibilityLabel="Close supplement editor"
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={appTheme.colors.textStrong}
                />
              </AppButton>
            }
            rightSlot={
              <AppButton
                label={saving ? "Saving..." : "Save"}
                onPress={handleSave}
                disabled={!canSave || saving}
                variant="primary"
                size="sm"
                style={[
                  styles.headerSaveButton,
                  (!canSave || saving) && styles.headerSaveButtonDisabled,
                ]}
                textStyle={styles.headerSaveText}
                accessibilityLabel={
                  saving ? "Saving supplement" : "Save supplement"
                }
              />
            }
            title={isEdit ? "EDIT SUPPLEMENT" : "ADD SUPPLEMENT"}
            titleStyle={styles.headerTitle}
            bottomSlot={
              <Text style={styles.headerSubtitle}>
                {isEdit
                  ? "Update timing, dates, type, and dose."
                  : "Build a supplement routine that fits your stack."}
              </Text>
            }
            bottomSlotStyle={styles.headerBottom}
          />
        }
      >
        <AppSectionCard
          title="Details"
          subtitle="Name and dose"
          style={styles.sectionCard}
          titleStyle={styles.sectionTitle}
          subtitleStyle={styles.sectionSubtitle}
        >
          <AppFormField label="Supplement name">
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/supplement-search",
                  params: {
                    mode: "picker",
                    initialQuery: name.trim(),
                  },
                })
              }
              style={({ pressed }) => [
                styles.searchField,
                pressed && styles.pressedField,
              ]}
            >
              <Ionicons
                name="search"
                size={20}
                color={appTheme.input.icon}
                style={styles.searchFieldIcon}
              />
              <Text
                style={[
                  styles.searchFieldText,
                  !name.trim() && styles.searchFieldPlaceholder,
                ]}
              >
                {name.trim() || "Search supplement catalog"}
              </Text>
            </Pressable>
          </AppFormField>

          <AppFormField label="Dose">
            <TextInput
              value={dose}
              onChangeText={setDose}
              placeholder="e.g. 1 capsule, 2000 IU"
              placeholderTextColor={appTheme.input.placeholder}
              style={styles.textInput}
            />
          </AppFormField>
        </AppSectionCard>

        <AppSectionCard
          title="Type"
          subtitle="Choose how you take it"
          style={styles.sectionCard}
          titleStyle={styles.sectionTitle}
          subtitleStyle={styles.sectionSubtitle}
        >
          <View style={styles.routeRow}>
            {SUPPLEMENT_ROUTES.map((option) => (
              <Pressable
                key={option.key}
                onPress={() => setRoute(option.key)}
                style={({ pressed }) => [
                  styles.routeOption,
                  route === option.key && styles.routeOptionActive,
                  pressed && styles.pressedOption,
                ]}
              >
                {route === option.key ? (
                  <LinearGradient
                    pointerEvents="none"
                    colors={appTheme.tabBar.fabGradient}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.routeOptionGradient}
                  />
                ) : null}
                <View
                  style={[
                    styles.routeIconWrap,
                    route === option.key && styles.routeIconWrapActive,
                  ]}
                >
                  <Icon route={option.key} size={18} />
                </View>
                <Text
                  style={[
                    styles.routeLabel,
                    route === option.key && styles.routeLabelActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </AppSectionCard>

        <AppSectionCard
          title="Schedule"
          subtitle="Dates, days, and time"
          style={styles.sectionCard}
          titleStyle={styles.sectionTitle}
          subtitleStyle={styles.sectionSubtitle}
        >
          <View style={styles.dateRow}>
            <AppFormField
              label="Start date"
              style={styles.dateFieldBlock}
              errorText={
                !startDateValid || !chronologicalValid
                  ? dateValidationMessage
                  : null
              }
            >
              <Pressable
                onPress={() => setActiveDatePicker("start")}
                style={({ pressed }) => [
                  styles.surfaceField,
                  styles.dateField,
                  (!startDateValid || !chronologicalValid) &&
                    styles.surfaceFieldError,
                  pressed && styles.pressedField,
                ]}
              >
                <Text style={styles.dateFieldText}>
                  {formatDisplayDate(startDate)}
                </Text>
              </Pressable>
            </AppFormField>

            <AppFormField
              label="End date"
              style={styles.dateFieldBlock}
              helperText={endDate ? "Tap below to set ongoing." : "Optional"}
              errorText={
                !endDateValid || !chronologicalValid
                  ? dateValidationMessage
                  : null
              }
            >
              <Pressable
                onPress={() => setActiveDatePicker("end")}
                style={({ pressed }) => [
                  styles.surfaceField,
                  styles.dateField,
                  (!endDateValid || !chronologicalValid) &&
                    styles.surfaceFieldError,
                  pressed && styles.pressedField,
                ]}
              >
                <Text style={styles.dateFieldText}>
                  {endDate ? formatDisplayDate(endDate) : "Ongoing"}
                </Text>
              </Pressable>

              {endDate ? (
                <AppButton
                  label="Set to ongoing"
                  onPress={() => setEndDate(null)}
                  variant="ghost"
                  size="sm"
                  style={styles.clearEndDate}
                  textStyle={styles.clearEndDateText}
                />
              ) : null}
            </AppFormField>
          </View>

          {scheduleType === "interval" ? (
            <AppFormField
              label="Schedule"
              helperText="Interval schedules are preserved from onboarding."
            >
              <View style={styles.scheduleSummary}>
                <Ionicons
                  name="repeat-outline"
                  size={18}
                  color={appTheme.colors.textSecondary}
                />
                <Text style={styles.scheduleSummaryText}>
                  {getSupplementScheduleLabel({
                    scheduleType,
                    intervalDays,
                    scheduleAnchorDate,
                    frequency,
                    frequencyLabel,
                  })}
                </Text>
              </View>
            </AppFormField>
          ) : (
            <AppFormField label="Days">
              <View style={styles.daysRow}>
                {DAYS.map((day) => {
                  const active = daysOfWeek.includes(day.value);

                  return (
                    <Pressable
                      key={day.value}
                      accessibilityRole="button"
                      accessibilityState={active ? { selected: true } : {}}
                      onPress={() => toggleDay(day.value)}
                      style={({ pressed }) => [
                        styles.dayPill,
                        active && styles.dayPillActive,
                        pressed && styles.pressedOption,
                      ]}
                    >
                      {active ? (
                        <LinearGradient
                          pointerEvents="none"
                          colors={appTheme.tabBar.fabGradient}
                          start={{ x: 0.5, y: 0 }}
                          end={{ x: 0.5, y: 1 }}
                          style={styles.dayPillGradient}
                        />
                      ) : null}
                      <Text
                        style={[styles.dayText, active && styles.dayTextActive]}
                      >
                        {day.label}
                      </Text>

                      {!active ? <View style={styles.diagonalStrike} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </AppFormField>
          )}

          <AppFormField label="Time">
            <View style={styles.timePicker}>
              <ScrollView
                ref={timeScrollRef}
                showsVerticalScrollIndicator={false}
                snapToInterval={TIME_ITEM_HEIGHT}
                decelerationRate="fast"
                contentOffset={{ x: 0, y: initialTimeOffset }}
              >
                {TIME_OPTIONS.map((option) => (
                  <Pressable
                    key={option.minutes}
                    onPress={() => setTimeMinutes(option.minutes)}
                    style={({ pressed }) => [
                      styles.timeOption,
                      option.minutes === timeMinutes && styles.timeOptionActive,
                      pressed && styles.pressedOption,
                    ]}
                  >
                    {option.minutes === timeMinutes ? (
                      <LinearGradient
                        pointerEvents="none"
                        colors={appTheme.tabBar.fabGradient}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={styles.timeOptionGradient}
                      />
                    ) : null}
                    <Text
                      style={[
                        styles.timeText,
                        option.minutes === timeMinutes && styles.timeTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </AppFormField>
        </AppSectionCard>

        {isEdit ? (
          <AppSectionCard
            title="Delete"
            subtitle="This action cannot be undone."
            style={styles.sectionCard}
            titleStyle={styles.sectionTitle}
            subtitleStyle={styles.sectionSubtitle}
          >
            <AppButton
              label="Delete supplement"
              onPress={handleDelete}
              variant="danger"
              size="md"
              textStyle={styles.deleteText}
            />
          </AppSectionCard>
        ) : null}
      </BackdropScreen>

      <DatePickerModal
        visible={activeDatePicker === "start"}
        initialDate={startDate}
        onSelect={(iso) => {
          setStartDate(iso);
          if (endDate && iso > endDate) {
            setEndDate(iso);
          }
        }}
        onClose={() => setActiveDatePicker(null)}
        title="Select start date"
      />

      <DatePickerModal
        visible={activeDatePicker === "end"}
        initialDate={endDate ?? startDate}
        onSelect={(iso) => setEndDate(iso)}
        onClose={() => setActiveDatePicker(null)}
        title="Select end date"
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    color: appTheme.colors.textPrimary,
  },

  headerBottom: {
    marginTop: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  headerSaveButton: {
    minWidth: 92,
  },
  headerSaveButtonDisabled: {
    opacity: 0.5,
  },
  headerSaveText: {
    fontSize: 15,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
  sectionCard: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 19,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.35,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  surfaceField: {
    minHeight: 52,
    borderRadius: appTheme.card.radius,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    justifyContent: "center",
  },
  surfaceFieldError: {
    borderColor: appTheme.colors.danger,
  },
  pressedField: {
    opacity: 0.84,
  },
  textInput: {
    minHeight: 52,
    borderRadius: appTheme.card.radius,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.input.text,
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderRadius: appTheme.input.radius,
    backgroundColor: appTheme.input.background,
    paddingHorizontal: 14,
  },
  searchFieldIcon: {
    marginRight: 8,
  },
  searchFieldText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textStrong,
  },
  searchFieldPlaceholder: {
    color: appTheme.input.placeholder,
  },
  routeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  routeOption: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  routeOptionActive: {
    backgroundColor: "transparent",
    borderColor: "rgba(20,20,20,0.14)",
    ...shadows.card,
  },
  routeOptionGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  routeIconWrap: {
    position: "relative",
    zIndex: 1,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.iconSurface,
  },
  routeIconWrapActive: {
    backgroundColor: "#FFFFFF",
  },
  routeLabel: {
    position: "relative",
    zIndex: 1,
    fontSize: 13,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.textSecondary,
  },
  routeLabelActive: {
    color: appTheme.colors.textStrong,
    fontFamily: typography.fontFamily.bodySemiBold,
  },
  pressedOption: {
    opacity: 0.78,
  },
  dateRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  dateFieldBlock: {
    flex: 1,
  },
  dateField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateFieldText: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textHeading,
  },
  clearEndDate: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
  },
  clearEndDateText: {
    fontSize: 13,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  daysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  scheduleSummary: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  scheduleSummaryText: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textHeading,
  },
  dayPill: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  dayPillActive: {
    backgroundColor: "transparent",
    borderColor: "rgba(20,20,20,0.14)",
    ...shadows.card,
  },
  dayPillGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
  },
  dayText: {
    position: "relative",
    zIndex: 1,
    fontSize: 14,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textSecondary,
  },
  dayTextActive: {
    color: appTheme.colors.textStrong,
  },
  diagonalStrike: {
    position: "absolute",
    width: "140%",
    height: 1.5,
    backgroundColor: appTheme.colors.textMuted,
    transform: [{ rotate: "-45deg" }],
  },
  timePicker: {
    height: TIME_PICKER_HEIGHT,
    borderRadius: appTheme.card.radius,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    overflow: "hidden",
  },
  timeOption: {
    height: TIME_ITEM_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  timeOptionActive: {
    backgroundColor: "transparent",
    ...shadows.card,
  },
  timeOptionGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  timeText: {
    position: "relative",
    zIndex: 1,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  timeTextActive: {
    color: appTheme.colors.textStrong,
    fontFamily: typography.fontFamily.bodySemiBold,
  },
  deleteText: {
    fontSize: 15,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
  dateModalBackdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: appTheme.modal.sidePadding,
    paddingVertical: appTheme.modal.sidePadding,
    backgroundColor: appTheme.modal.scrim,
  },
  dateModalCard: {
    maxWidth: 420,
    alignSelf: "center",
    width: "100%",
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
  },
  dateModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dateModalHeaderCopy: {
    flex: 1,
    alignItems: "center",
  },
  dateNavButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  dateModalTitle: {
    fontSize: 18,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.3,
  },
  dateModalMonth: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  navArrow: {
    fontSize: 24,
    lineHeight: 24,
    color: appTheme.colors.textStrong,
    fontFamily: typography.fontFamily.body,
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
    fontFamily: typography.fontFamily.heading,
    color: appTheme.colors.textTertiary,
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
    borderRadius: 12,
    marginBottom: spacing.xs / 2,
  },
  dayCellEmpty: {
    backgroundColor: "transparent",
  },
  dayCellActive: {
    backgroundColor: appTheme.colors.textStrong,
  },
  dayCellPressed: {
    opacity: 0.76,
  },
  dayLabel: {
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textHeading,
  },
  dayLabelActive: {
    color: "#FFFFFF",
    fontFamily: typography.fontFamily.bodySemiBold,
  },
  dayLabelEmpty: {
    color: appTheme.colors.textSecondary,
  },
  dateModalClose: {
    alignSelf: "center",
    marginTop: spacing.sm,
  },
});
