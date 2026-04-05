import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import { AppButton, AppHeader, PrimaryCard } from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import { useChatStore } from "@/features/ai/store";
import { useSupplementsStore } from "@/features/supplements/store";
import { useHealthStore } from "@/features/health/store";
import { normalizeMetric } from "@/features/health/metricDefinitions";
import {
  getEffectiveEntries,
  getMetricSource,
} from "@/features/health/selectors";
import {
  getAccessTokenOrCreateSession,
  supabase as publicSupabase,
} from "@src/lib/supabase";
import { SUPABASE_URL } from "@src/lib/runtimeConfig";

const CHAT_WINDOW_DAYS = 30;
const MAX_CONTEXT_ENTRIES = 200;
const MAX_CONVERSATION_MESSAGES = 12;
const MAX_SUPPLEMENTS_PER_BENEFIT = 5;

function buildEvidenceCatalog(rows) {
  const byBenefit = {};
  const bySupplement = {};
  const normalizedRows = (rows ?? [])
    .filter((row) => row && row.id)
    .map((row) => {
      const fallbackBenefitName = Array.isArray(row.supplement_benefits)
        ? row.supplement_benefits.find(
            (item) => typeof item?.supplement_name === "string"
          )?.supplement_name
        : null;

      const name =
        typeof row.name === "string" && row.name.trim()
          ? row.name.trim()
          : typeof fallbackBenefitName === "string" &&
            fallbackBenefitName.trim()
          ? fallbackBenefitName.trim()
          : null;

      return {
        id: row.id,
        name,
        evidenceScore:
          typeof row.evidence_score === "number" &&
          Number.isFinite(row.evidence_score)
            ? row.evidence_score
            : null,
        benefits: Array.isArray(row.supplement_benefits)
          ? row.supplement_benefits
              .map((item) =>
                typeof item?.label === "string" ? item.label.trim() : ""
              )
              .filter(Boolean)
          : [],
      };
    })
    .filter((row) => typeof row.name === "string" && row.name);

  normalizedRows.forEach((row) => {
    bySupplement[row.id] = {
      id: row.id,
      name: row.name,
      evidenceScore: row.evidenceScore,
      benefits: row.benefits,
    };

    row.benefits.forEach((benefit) => {
      if (!byBenefit[benefit]) byBenefit[benefit] = [];
      byBenefit[benefit].push({
        id: row.id,
        name: row.name,
        evidenceScore: row.evidenceScore,
      });
    });
  });

  Object.keys(byBenefit).forEach((benefit) => {
    byBenefit[benefit] = byBenefit[benefit]
      .sort((a, b) => (b.evidenceScore ?? -1) - (a.evidenceScore ?? -1))
      .slice(0, MAX_SUPPLEMENTS_PER_BENEFIT);
  });

  const topOverall = normalizedRows
    .slice()
    .sort((a, b) => (b.evidenceScore ?? -1) - (a.evidenceScore ?? -1))
    .slice(0, 12)
    .map((row) => ({
      id: row.id,
      name: row.name,
      evidenceScore: row.evidenceScore,
      benefits: row.benefits,
    }));

  return {
    topOverall,
    byBenefit,
    bySupplement,
  };
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(value) {
  const [year, month, day] = String(value || "")
    .split("-")
    .map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

function addDays(isoDate, amount) {
  const parsed = parseISODate(isoDate);
  parsed.setDate(parsed.getDate() + amount);
  return toISODate(parsed);
}

function listDatesBetween(startDate, endDate) {
  const dates = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function toPercent(taken, planned) {
  if (!planned) return 0;
  return Math.round((taken / planned) * 100);
}

function isScheduledOnDate(supplement, date) {
  if (supplement?.startDate && date < supplement.startDate) return false;
  if (supplement?.endDate && date > supplement.endDate) return false;
  if (
    !Array.isArray(supplement?.daysOfWeek) ||
    supplement.daysOfWeek.length === 0
  ) {
    return true;
  }
  const dayOfWeek = parseISODate(date).getDay();
  return supplement.daysOfWeek.includes(dayOfWeek);
}

function buildChatStatsInput(
  supplements,
  takenTimesByDate,
  healthEntries,
  healthMetrics,
  sourceSettings,
  evidenceCatalog
) {
  const today = toISODate(new Date());
  const startDate = addDays(today, -(CHAT_WINDOW_DAYS - 1));
  const periodDates = listDatesBetween(startDate, today);

  let planned = 0;
  let taken = 0;
  let missed = 0;

  periodDates.forEach((date) => {
    const dayTakenMap = takenTimesByDate?.[date] ?? {};
    const plannedSupplements = (supplements ?? []).filter((supplement) =>
      isScheduledOnDate(supplement, date)
    );
    planned += plannedSupplements.length;
    plannedSupplements.forEach((supplement) => {
      if (dayTakenMap[supplement.id]) taken += 1;
      else missed += 1;
    });
  });

  const supplementContext = (supplements ?? []).map((supplement) => ({
    id: supplement.id,
    name: supplement.name,
    dose: supplement.dose ?? null,
    route: supplement.route ?? null,
    time: supplement.time ?? null,
    daysOfWeek: Array.isArray(supplement.daysOfWeek)
      ? supplement.daysOfWeek
      : [0, 1, 2, 3, 4, 5, 6],
    startDate: supplement.startDate ?? null,
    endDate: supplement.endDate ?? null,
    catalogId: supplement.catalogId ?? null,
  }));

  const metricsContext = (healthMetrics ?? [])
    .map((metric) => normalizeMetric(metric))
    .filter(Boolean)
    .filter((metric) => metric.enabled !== false)
    .map((metric) => ({
      key: metric.key,
      label: metric.label,
      trackerType: metric.trackerType,
      source: getMetricSource({ sourceSettings }, metric.key),
      unit: metric.unit ?? null,
      min: Number.isFinite(metric.min) ? metric.min : null,
      max: Number.isFinite(metric.max) ? metric.max : null,
    }));

  const recentEntries = (healthEntries ?? [])
    .filter((entry) => typeof entry?.date === "string")
    .filter((entry) => entry.date >= startDate && entry.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_CONTEXT_ENTRIES)
    .map((entry) => ({
      id: entry.id,
      type: entry.type,
      value: entry.value,
      note:
        typeof entry.note === "string" && entry.note.trim()
          ? entry.note.trim().slice(0, 180)
          : null,
      date: entry.date,
      source: entry.source ?? "manual",
    }));

  return {
    generatedForDate: today,
    windowDays: CHAT_WINDOW_DAYS,
    adherence: {
      planned,
      taken,
      missed,
      score: toPercent(taken, planned),
    },
    supplements: supplementContext,
    healthMetrics: metricsContext,
    healthEntries: recentEntries,
    evidenceCatalog,
  };
}

function IntroCard() {
  return (
    <PrimaryCard style={styles.introCard}>
      <View pointerEvents="none" style={styles.introGradientWrap}>
        <LinearGradient
          colors={[...appTheme.tabBar.fabGradient, "#FFFFFF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.introGradient}
        />
      </View>

      <Text style={styles.introTitle}>Ask about your supplement data</Text>
      <Text style={styles.introBody}>
        Get quick answers using your saved schedule, adherence history, and
        tracked health metrics.
      </Text>
      <Text style={styles.introDisclaimer}>
        This information is educational only and not medical advice. Talk to a
        qualified clinician before starting or changing supplements. AI can make
        mistakes.
      </Text>
    </PrimaryCard>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";

  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
      <PrimaryCard
        variant={isUser ? "accent" : "default"}
        style={[
          styles.messageBubble,
          isUser ? styles.messageBubbleUser : styles.messageBubbleAssistant,
        ]}
      >
        <Text style={styles.messageEyebrow}>
          {isUser ? "You" : "Suppro AI"}
        </Text>
        <Text style={styles.messageText}>{message.content}</Text>
      </PrimaryCard>
    </View>
  );
}

export function AiChatScreen({ presentation = "screen" }) {
  const insets = useSafeAreaInsets();
  const isModal = presentation === "modal";
  const isTab = presentation === "tab";
  const [headerHeight, setHeaderHeight] = useState(0);
  const supplements = useSupplementsStore((s) => s.supplements);
  const takenTimesByDate = useSupplementsStore((s) => s.takenTimesByDate);
  const healthEntries = useHealthStore((s) => getEffectiveEntries(s));
  const healthMetrics = useHealthStore((s) => s.metrics);
  const sourceSettings = useHealthStore((s) => s.sourceSettings);

  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const error = useChatStore((s) => s.error);
  const addMessage = useChatStore((s) => s.addMessage);
  const setStatus = useChatStore((s) => s.setStatus);
  const clearMessages = useChatStore((s) => s.clearMessages);

  const [draft, setDraft] = useState("");
  const [evidenceCatalog, setEvidenceCatalog] = useState({
    topOverall: [],
    byBenefit: {},
    bySupplement: {},
  });
  const scrollRef = useRef(null);

  const chatStatsInput = useMemo(
    () =>
      buildChatStatsInput(
        supplements,
        takenTimesByDate,
        healthEntries,
        healthMetrics,
        sourceSettings,
        evidenceCatalog
      ),
    [
      supplements,
      takenTimesByDate,
      healthEntries,
      healthMetrics,
      sourceSettings,
      evidenceCatalog,
    ]
  );

  useEffect(() => {
    let active = true;

    publicSupabase
      .from("supplements")
      .select(
        "id, name, evidence_score, supplement_benefits(label, supplement_name)"
      )
      .eq("status", "approved")
      .limit(500)
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) {
          console.error(
            "Failed to load supplement evidence catalog",
            queryError
          );
          setEvidenceCatalog({
            topOverall: [],
            byBenefit: {},
            bySupplement: {},
          });
          return;
        }
        setEvidenceCatalog(buildEvidenceCatalog(data ?? []));
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages, status]);

  const sendMessage = useCallback(async () => {
    const question = draft.trim();
    if (!question || status === "loading") return;

    setDraft("");
    addMessage({ role: "user", content: question });
    setStatus("loading");

    try {
      if (!SUPABASE_URL) {
        throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL");
      }

      const conversation = messages
        .filter((item) => item.role === "user" || item.role === "assistant")
        .slice(-MAX_CONVERSATION_MESSAGES)
        .map((item) => ({
          role: item.role,
          content: item.content,
        }));

      const accessToken = await getAccessTokenOrCreateSession();

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/ai-supplement`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            mode: "chat",
            question,
            conversation,
            stats: chatStatsInput,
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Please sign in to use AI chat.");
        }
        if (response.status === 429) {
          throw new Error(
            "Too many chat requests. Please wait a minute and try again."
          );
        }
        const errorText = await response.text();
        throw new Error(errorText || "AI chat request failed.");
      }

      const data = await response.json();

      const reply = typeof data?.reply === "string" ? data.reply.trim() : "";
      if (!reply) throw new Error("AI response was empty.");

      addMessage({ role: "assistant", content: reply });
      setStatus("idle");
    } catch (sendError) {
      console.error("AI chat request failed", sendError);
      const message =
        sendError instanceof Error && sendError.message
          ? sendError.message
          : "Chat is unavailable right now. Please try again.";
      setStatus("error", message);
    }
  }, [addMessage, chatStatsInput, draft, messages, setStatus, status]);

  const isLoading = status === "loading";
  const canSend = draft.trim().length > 0 && !isLoading;
  const composerBottomSpacing = isModal
    ? Math.max(insets.bottom, spacing.sm)
    : 0;

  return (
    <BackdropScreen
      scrollable={false}
      bottomInsetOffset={0}
      minBottomPadding={0}
      contentStyle={styles.screenContent}
      onHeaderHeightChange={setHeaderHeight}
      header={
        <AppHeader
          insetPreset="modal"
          leftSlot={
            isModal ? (
              <AppButton
                onPress={() => router.back()}
                variant="overlay"
                size="icon"
                accessibilityLabel="Close AI chat"
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={appTheme.colors.textStrong}
                />
              </AppButton>
            ) : null
          }
          rightSlot={
            <Pressable
              onPress={clearMessages}
              accessibilityRole="button"
              accessibilityLabel="Clear conversation"
              hitSlop={8}
              style={({ pressed }) => [
                styles.headerAction,
                pressed && styles.headerActionPressed,
              ]}
            >
              <Text style={styles.headerActionText}>Clear</Text>
            </Pressable>
          }
          title="SUPPRO AI"
          titleStyle={styles.headerTitle}
          bottomSlot={
            <Text style={styles.headerSubtitle}>
              Ask about your supplements and tracked data.
            </Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
    >
      <KeyboardAvoidingView
        style={styles.chatShell}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.messagesScroll}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 ? <IntroCard /> : null}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {isLoading ? (
            <MessageBubble
              message={{
                id: "thinking",
                role: "assistant",
                content: "Thinking...",
              }}
            />
          ) : null}
        </ScrollView>

        <PrimaryCard
          style={[
            styles.composerCard,
            isTab && styles.composerCardTab,
            { marginBottom: composerBottomSpacing },
          ]}
        >
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.composerRow}>
            <View style={styles.inputShell}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask a question..."
                placeholderTextColor={appTheme.input.placeholder}
                multiline
                maxLength={700}
                style={styles.input}
                textAlignVertical="top"
              />
            </View>

            <AppButton
              label={isLoading ? "..." : "Send"}
              onPress={sendMessage}
              disabled={!canSend}
              variant="primary"
              size="md"
              accessibilityLabel="Send message"
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
              textStyle={styles.sendButtonText}
            />
          </View>
        </PrimaryCard>
      </KeyboardAvoidingView>
    </BackdropScreen>
  );
}

export default function AiChatModal() {
  return <AiChatScreen presentation="modal" />;
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
  },
  headerTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 24,
    lineHeight: 22,
    letterSpacing: -0.43,
    fontFamily: typography.fontFamily.headingBlack,
    fontWeight: "900",
  },
  headerBottom: {
    marginTop: 6,
  },
  headerPill: {
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  headerSubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  headerAction: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  headerActionPressed: {
    opacity: 0.72,
  },
  headerActionText: {
    fontSize: 16,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  chatShell: {
    flex: 1,
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingBottom: spacing.sm,
  },
  introCard: {
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  introGradientWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  introGradient: {
    flex: 1,
    opacity: 0.78,
  },
  introTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.45,
  },
  introBody: {
    marginTop: spacing.sm,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  introDisclaimer: {
    marginTop: spacing.md,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.textSecondary,
  },
  messageRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: spacing.sm,
  },
  messageRowUser: {
    justifyContent: "flex-end",
  },
  messageBubble: {
    maxWidth: "88%",
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
  },
  messageBubbleAssistant: {
    backgroundColor: appTheme.colors.surface,
  },
  messageBubbleUser: {
    backgroundColor: appTheme.colors.surfaceAccent,
  },
  messageEyebrow: {
    marginBottom: 6,
    fontSize: 12,
    fontFamily: typography.fontFamily.heading,
    letterSpacing: -0.2,
    color: appTheme.colors.textTertiary,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textStrong,
  },
  composerCard: {
    marginTop: spacing.sm,
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
  },
  composerCardTab: {
    marginTop: spacing.xs,
    marginHorizontal: -appTheme.screen.sidePadding,
    marginBottom: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  errorText: {
    marginBottom: spacing.sm,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.danger,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  inputShell: {
    flex: 1,
    minHeight: 54,
    maxHeight: 132,
    borderRadius: 18,
    backgroundColor: appTheme.input.background,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  input: {
    minHeight: 30,
    maxHeight: 108,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
    color: appTheme.input.text,
  },
  sendButton: {
    alignSelf: "flex-end",
    paddingHorizontal: 18,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 15,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
});
