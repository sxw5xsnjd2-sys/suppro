import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors, spacing, radius, shadows } from "@/theme";
import { useChatStore } from "@/features/ai/store";
import { useSupplementsStore } from "@/features/supplements/store";
import { useHealthStore } from "@/features/health/store";
import { normalizeMetric } from "@/features/health/metricDefinitions";
import {
  getAccessTokenOrCreateSession,
  supabase as publicSupabase,
} from "@src/lib/supabase";

const CHAT_WINDOW_DAYS = 30;
const MAX_CONTEXT_ENTRIES = 200;
const MAX_CONVERSATION_MESSAGES = 12;
const MAX_SUPPLEMENTS_PER_BENEFIT = 5;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

function buildEvidenceCatalog(rows) {
  const byBenefit = {};
  const bySupplement = {};
  const normalizedRows = (rows ?? [])
    .filter((row) => row && typeof row.name === "string")
    .map((row) => ({
      id: row.id,
      name: row.name,
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
    }));

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

export function AiChatScreen({ presentation = "modal" }) {
  const insets = useSafeAreaInsets();
  const isModal = presentation === "modal";
  const supplements = useSupplementsStore((s) => s.supplements);
  const takenTimesByDate = useSupplementsStore((s) => s.takenTimesByDate);
  const healthEntries = useHealthStore((s) => s.entries);
  const healthMetrics = useHealthStore((s) => s.metrics);

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
        evidenceCatalog
      ),
    [
      supplements,
      takenTimesByDate,
      healthEntries,
      healthMetrics,
      evidenceCatalog,
    ]
  );

  useEffect(() => {
    let active = true;

    publicSupabase
      .from("supplements")
      .select("id, name, evidence_score, supplement_benefits(label)")
      .limit(500)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Failed to load supplement evidence catalog", error);
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

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.root}>
        <View style={styles.header}>
          {isModal ? (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.headerAction}>Close</Text>
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
          <Text style={styles.headerTitle}>Suppro AI Chat</Text>
          <Pressable onPress={clearMessages} hitSlop={8}>
            <Text style={styles.headerAction}>Clear</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.messagesScroll}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
        >
          {messages.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                Ask about your supplement data
              </Text>
              <Text style={styles.emptyBody}>
                You can ask about adherence, schedules, missed doses, and
                tracked health metrics.
              </Text>
              <Text style={styles.emptyDisclaimer}>
                Disclaimer: This information is educational only and not medical
                advice. Talk to a qualified clinician before starting or
                changing supplements. AI can make mistakes.
              </Text>
            </View>
          ) : null}

          {messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <View
                key={message.id}
                style={[styles.messageRow, isUser && styles.messageRowUser]}
              >
                <View
                  style={[
                    styles.messageBubble,
                    isUser && styles.messageBubbleUser,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      isUser && styles.messageTextUser,
                    ]}
                  >
                    {message.content}
                  </Text>
                </View>
              </View>
            );
          })}

          {isLoading ? (
            <View style={styles.messageRow}>
              <View style={styles.messageBubble}>
                <Text style={styles.messageText}>Thinking…</Text>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 52 : 0}
        >
          <View
            style={[
              styles.inputWrap,
              { paddingBottom: Math.max(insets.bottom, spacing.sm) },
            ]}
          >
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <View style={styles.inputRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask about your supplements and tracked data"
                placeholderTextColor={colors.text.muted}
                multiline
                maxLength={700}
                style={styles.input}
              />
              <Pressable
                onPress={sendMessage}
                disabled={!canSend}
                style={[
                  styles.sendButton,
                  !canSend && styles.sendButtonDisabled,
                ]}
              >
                <Text style={styles.sendText}>
                  {isLoading ? "..." : "Send"}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

export default function AiChatModal() {
  return <AiChatScreen presentation="modal" />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background.app,
  },
  root: {
    flex: 1,
    backgroundColor: colors.background.app,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.background.card,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
  },
  headerAction: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.brand.primary,
  },
  headerSpacer: {
    width: 44,
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    padding: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  emptyCard: {
    backgroundColor: colors.background.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...shadows.card,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
  },
  emptyBody: {
    marginTop: spacing.xs,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  emptyDisclaimer: {
    marginTop: spacing.lg,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  messageRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  messageRowUser: {
    justifyContent: "flex-end",
  },
  messageBubble: {
    maxWidth: "86%",
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  messageBubbleUser: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.primary,
  },
  messageTextUser: {
    color: colors.text.inverse,
  },
  inputWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.background.card,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  errorText: {
    marginBottom: spacing.xs,
    fontSize: 12,
    color: colors.status.danger,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text.primary,
    backgroundColor: colors.background.elevated,
  },
  sendButton: {
    alignSelf: "flex-end",
    borderRadius: 999,
    backgroundColor: colors.brand.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendText: {
    color: colors.text.inverse,
    fontSize: 13,
    fontWeight: "700",
  },
});
