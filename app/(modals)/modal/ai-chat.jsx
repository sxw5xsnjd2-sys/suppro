import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  GradientHeader,
  PrimaryCard,
} from "@/components/common/ui";
import { resolveBackNavigationAction } from "@/features/subscriptions/accessPolicy";
import { useSubscriptionAccess } from "@/features/subscriptions/useSubscriptionAccess";
import { appTheme, spacing, typography } from "@/theme";
import { useChatStore } from "@/features/ai/store";
import { useSupplementsStore } from "@/features/supplements/store";
import { isSupplementScheduledOnDate } from "@/features/supplements/schedule";
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
import { normalizeEdgeFunctionError } from "@src/lib/edgeFunctionErrors";
import { SUPABASE_URL } from "@src/lib/runtimeConfig";
import {
  sanitizeAiChatReply,
  stripBasicMarkdown,
} from "@src/lib/aiChatResponse";

const CHAT_WINDOW_DAYS = 30;
const MAX_CONTEXT_ENTRIES = 200;
const MAX_CONVERSATION_MESSAGES = 12;
const MAX_SUPPLEMENTS_PER_BENEFIT = 5;
const SUGGESTED_PROMPTS = [
  "What did I miss this week?",
  "How consistent has my supplement routine been?",
  "Summarize my adherence trend",
  "Any supplements I haven't logged today?",
];
const BENEFIT_TONE_RANK = {
  gold: 0,
  silver: 1,
  bronze: 2,
};

function buildEvidenceCatalog(rows) {
  const byBenefit = {};
  const benefitRoutes = {};
  const bySupplement = {};
  const normalizedRows = (rows ?? [])
    .filter((row) => row && row.id)
    .map((row, index) => {
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

      const benefitEntries = Array.isArray(row.supplement_benefits)
        ? row.supplement_benefits
            .map((item) => {
              const label =
                typeof item?.label === "string" ? item.label.trim() : "";
              const rankingScore = Number.isFinite(item?.score)
                ? item.score
                : Number.isFinite(item?.benefit_score)
                ? item.benefit_score
                : Number.isFinite(item?.ranking_score)
                ? item.ranking_score
                : null;

              if (!label) return null;

              return {
                label,
                rankingScore,
                icon: item?.icon ?? null,
              };
            })
            .filter(Boolean)
        : [];

      return {
        id: row.id,
        sourceIndex: index,
        name,
        evidenceScore:
          typeof row.evidence_score === "number" &&
          Number.isFinite(row.evidence_score)
            ? row.evidence_score
            : null,
        benefits: benefitEntries.map((item) => item.label),
        benefitEntries,
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

    row.benefitEntries.forEach((benefit) => {
      if (!byBenefit[benefit.label]) byBenefit[benefit.label] = [];
      byBenefit[benefit.label].push({
        id: row.id,
        name: row.name,
        evidenceScore: row.evidenceScore,
        rankingScore: benefit.rankingScore,
        icon: benefit.icon,
        sourceIndex: row.sourceIndex,
      });
    });
  });

  Object.keys(byBenefit).forEach((benefit) => {
    benefitRoutes[benefit] = `/benefit-ranking?label=${encodeURIComponent(
      benefit
    )}`;
    byBenefit[benefit] = byBenefit[benefit]
      .sort((a, b) => {
        const rankingDelta = (b.rankingScore ?? -1) - (a.rankingScore ?? -1);
        if (rankingDelta !== 0) {
          return rankingDelta;
        }

        const toneDelta =
          (BENEFIT_TONE_RANK[a.icon] ?? Number.MAX_SAFE_INTEGER) -
          (BENEFIT_TONE_RANK[b.icon] ?? Number.MAX_SAFE_INTEGER);
        if (toneDelta !== 0) {
          return toneDelta;
        }

        const evidenceDelta = (b.evidenceScore ?? -1) - (a.evidenceScore ?? -1);
        if (evidenceDelta !== 0) {
          return evidenceDelta;
        }

        const nameDelta = String(a.name).localeCompare(String(b.name));
        if (nameDelta !== 0) {
          return nameDelta;
        }

        return (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0);
      })
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
    benefitRoutes,
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
      isSupplementScheduledOnDate(supplement, date)
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
    frequencyLabel: supplement.frequencyLabel ?? null,
    scheduleType: supplement.scheduleType ?? null,
    intervalDays: supplement.intervalDays ?? null,
    scheduleAnchorDate: supplement.scheduleAnchorDate ?? null,
    startDate: supplement.startDate ?? null,
    endDate: supplement.endDate ?? null,
    catalogId: supplement.catalogId ?? null,
    catalogType: supplement.catalogType ?? null,
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

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const displayContent = isUser
    ? stripBasicMarkdown(message.content)
    : sanitizeAiChatReply(message.content);

  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.messageBubbleUser : styles.messageBubbleAssistant,
        ]}
      >
        <Text style={styles.messageEyebrow}>
          {isUser ? "You" : "Suppro AI"}
        </Text>
        <Text style={styles.messageText}>{displayContent}</Text>
      </View>
    </View>
  );
}

export function AiChatScreen({ presentation = "screen" }) {
  const {
    hasActiveAccess,
    isResolved,
    openSubscriptionPaywall,
    requireSubscriptionAccess,
  } = useSubscriptionAccess();
  const insets = useSafeAreaInsets();
  const isModal = presentation === "modal";
  const isTab = presentation === "tab";
  const { height: windowHeight } = useWindowDimensions();
  const [composerHeight, setComposerHeight] = useState(0);
  const [keyboardInset, setKeyboardInset] = useState(0);
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
  const [clearConfirmVisible, setClearConfirmVisible] = useState(false);
  const [evidenceCatalog, setEvidenceCatalog] = useState({
    topOverall: [],
    byBenefit: {},
    benefitRoutes: {},
    bySupplement: {},
  });
  const scrollRef = useRef(null);
  const safeBackAction = useMemo(
    () =>
      resolveBackNavigationAction({
        canGoBack: typeof router.canGoBack === "function" && router.canGoBack(),
        fallbackHref: "/",
      }),
    []
  );

  useEffect(() => {
    if (hasActiveAccess || !isResolved) {
      return;
    }

    openSubscriptionPaywall({ replace: true });
  }, [hasActiveAccess, isResolved, openSubscriptionPaywall]);

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
    if (!hasActiveAccess) {
      setEvidenceCatalog({
        topOverall: [],
        byBenefit: {},
        benefitRoutes: {},
        bySupplement: {},
      });
      return;
    }

    let active = true;

    publicSupabase
      .from("supplements")
      .select(
        "id, name, status, evidence_score, supplement_benefits(label, supplement_name, score, icon)"
      )
      .in("status", ["approved", "pending"])
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
            benefitRoutes: {},
            bySupplement: {},
          });
          return;
        }
        setEvidenceCatalog(buildEvidenceCatalog(data ?? []));
      });

    return () => {
      active = false;
    };
  }, [hasActiveAccess]);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [composerHeight, keyboardInset, messages, status]);

  useEffect(() => {
    const getRelativeKeyboardInset = (event) => {
      const keyboardTop = event?.endCoordinates?.screenY;
      if (!Number.isFinite(keyboardTop)) {
        return 0;
      }

      return Math.max(0, windowHeight - keyboardTop - insets.bottom);
    };

    const handleKeyboardChange = (event) => {
      setKeyboardInset(getRelativeKeyboardInset(event));
    };

    const handleKeyboardHide = () => {
      setKeyboardInset(0);
    };

    const frameEvent =
      Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const frameSubscription = Keyboard.addListener(
      frameEvent,
      handleKeyboardChange
    );
    const hideSubscription = Keyboard.addListener(
      hideEvent,
      handleKeyboardHide
    );

    return () => {
      frameSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom, windowHeight]);

  const navigateBack = useCallback(() => {
    if (safeBackAction.type === "back") {
      router.back();
      return;
    }

    router.replace(safeBackAction.href);
  }, [safeBackAction]);

  const sendQuestion = useCallback(async (questionInput) => {
    if (!requireSubscriptionAccess("ai_chat")) {
      return;
    }

    const question = String(questionInput ?? "").trim();
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
        const errorText = await response.text();
        const normalizedError = normalizeEdgeFunctionError({
          status: response.status,
          responseText: errorText,
          retryAfterHeader: response.headers.get("Retry-After"),
          fallbackMessage: "AI chat is unavailable right now. Please try again.",
          unauthorizedMessage: "Please sign in to use AI chat.",
          serviceUnavailableMessage:
            "AI chat is unavailable right now. Please try again.",
        });
        throw new Error(normalizedError.message);
      }

      const data = await response.json();

      const reply =
        typeof data?.reply === "string"
          ? sanitizeAiChatReply(data.reply)
          : "";
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
  }, [
    addMessage,
    chatStatsInput,
    requireSubscriptionAccess,
    messages,
    setStatus,
    status,
  ]);

  const sendMessage = useCallback(() => {
    sendQuestion(draft);
  }, [draft, sendQuestion]);

  const openClearConfirmation = useCallback(() => {
    Keyboard.dismiss();
    setClearConfirmVisible(true);
  }, []);

  const closeClearConfirmation = useCallback(() => {
    setClearConfirmVisible(false);
  }, []);

  const confirmClearMessages = useCallback(() => {
    clearMessages();
    setClearConfirmVisible(false);
  }, [clearMessages]);

  const sendSuggestedPrompt = useCallback(
    (prompt) => {
      setDraft(prompt);
      sendQuestion(prompt);
    },
    [sendQuestion]
  );

  const isLoading = status === "loading";
  const hasMessages = messages.length > 0;
  const canSend = draft.trim().length > 0 && !isLoading;
  const composerBottomSpacing = isModal
    ? Math.max(insets.bottom, spacing.sm)
    : 0;
  const composerBottomOffset = Math.max(keyboardInset, composerBottomSpacing);
  const composerReservedSpace =
    composerHeight + composerBottomOffset + spacing.sm;

  if (!hasActiveAccess) {
    return <BackdropScreen scrollable={false} />;
  }

  return (
    <>
      <BackdropScreen
        scrollable={false}
        bottomInsetOffset={0}
        minBottomPadding={0}
        contentStyle={styles.screenContent}
        header={
          hasMessages ? (
            <GradientHeader
              insetPreset={isModal ? "modal" : "screen"}
              topInsetOffset={2}
              bottomPadding={4}
            >
              <View style={styles.conversationHeaderRow}>
                {isTab ? (
                  <View style={styles.headerSide} />
                ) : (
                  <View style={styles.headerSide}>
                    <Pressable
                      onPress={navigateBack}
                      accessibilityRole="button"
                      accessibilityLabel="Go back"
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.backButton,
                        pressed && styles.backButtonPressed,
                      ]}
                    >
                      <Ionicons
                        name="chevron-back"
                        size={21}
                        color="#1E2C4A"
                      />
                    </Pressable>
                  </View>
                )}

                <View pointerEvents="none" style={styles.conversationHeaderTitleWrap}>
                  <Text style={styles.conversationHeaderTitle}>Suppro AI</Text>
                </View>

                <View style={[styles.headerSide, styles.headerSideEnd]}>
                  <Pressable
                    onPress={openClearConfirmation}
                    accessibilityRole="button"
                    accessibilityLabel="Clear conversation"
                    hitSlop={16}
                    pressRetentionOffset={16}
                    style={({ pressed }) => [
                      styles.headerAction,
                      pressed && styles.headerActionPressed,
                    ]}
                  >
                    <Text style={styles.headerActionText}>Clear</Text>
                  </Pressable>
                </View>
              </View>
            </GradientHeader>
          ) : (
            <AppHeader
              insetPreset={isModal ? "modal" : "screen"}
              leftSlot={
                isTab ? null : (
                  <Pressable
                    onPress={navigateBack}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.backButton,
                      pressed && styles.backButtonPressed,
                    ]}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={21}
                      color="#1E2C4A"
                    />
                  </Pressable>
                )
              }
              title={null}
              titleAccessory={
                null
              }
              titleStyle={styles.headerTitle}
              bottomPadding={12}
            />
          )
        }
      >
        <View style={styles.chatShell}>
          {hasMessages ? (
            <ScrollView
              ref={scrollRef}
              style={styles.messagesScroll}
              contentContainerStyle={[
                styles.messagesContent,
                {
                  paddingBottom: composerReservedSpace,
                },
              ]}
              keyboardShouldPersistTaps="never"
              keyboardDismissMode={
                Platform.OS === "ios" ? "interactive" : "on-drag"
              }
              showsVerticalScrollIndicator={false}
            >
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              {isLoading ? (
                <MessageBubble
                  message={{
                    id: "thinking",
                    role: "assistant",
                    content: "Thinking…",
                  }}
                />
              ) : null}
            </ScrollView>
          ) : (
            <Pressable
              onPress={Keyboard.dismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss keyboard"
              style={styles.emptyStatePressable}
            >
              <View style={styles.emptyState}>
                <LinearGradient
                  colors={appTheme.tabBar.fabGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroMark}
                >
                  <Image
                    source={require("@/assets/icons/Supprologo.png")}
                    style={styles.heroLogo}
                    resizeMode="contain"
                  />
                </LinearGradient>
                <Text style={styles.heroTitle}>Ask Suppro AI</Text>
                <Text style={styles.heroSubtitle}>
                  Get quick answers using your saved schedule, adherence history,
                  and tracked health metrics.
                </Text>

                <View style={styles.promptStack}>
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <Pressable
                      key={prompt}
                      onPress={() => sendSuggestedPrompt(prompt)}
                      accessibilityRole="button"
                      accessibilityLabel={`Ask: ${prompt}`}
                      style={({ pressed }) => [
                        styles.promptChip,
                        pressed && styles.promptChipPressed,
                      ]}
                    >
                      <Text style={styles.promptText}>{prompt}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.heroDisclaimer}>
                  Educational only, not medical advice. Talk to a clinician
                  before starting or changing supplements. AI can make mistakes.
                </Text>
              </View>
            </Pressable>
          )}

          <View
            onLayout={(event) => {
              const nextHeight = event.nativeEvent.layout.height;
              if (nextHeight !== composerHeight) {
                setComposerHeight(nextHeight);
              }
            }}
            style={[
              styles.composerCard,
              styles.composerCardFloating,
              isTab && styles.composerCardTab,
              {
                bottom: composerBottomOffset,
              },
            ]}
          >
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.composerRow}>
              <View style={styles.composerField}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Ask a question…"
                  placeholderTextColor={appTheme.input.placeholder}
                  multiline
                  maxLength={700}
                  style={styles.input}
                  textAlignVertical="center"
                  onFocus={() => {
                    requestAnimationFrame(() => {
                      scrollRef.current?.scrollToEnd({ animated: true });
                    });
                  }}
                />
                <Pressable
                  onPress={sendMessage}
                  disabled={!canSend}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                  style={({ pressed }) => [
                    styles.sendButton,
                    !canSend && styles.sendButtonDisabled,
                    pressed && canSend && styles.sendButtonPressed,
                  ]}
                >
                  {isLoading ? (
                    <Text style={styles.sendButtonText}>…</Text>
                  ) : (
                    <Ionicons
                      name="arrow-up"
                      size={18}
                      color={canSend ? "#FFFFFF" : appTheme.colors.textMuted}
                    />
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </BackdropScreen>

      <Modal
        visible={clearConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={closeClearConfirmation}
      >
        <View style={styles.confirmModalRoot}>
          <Pressable
            style={styles.confirmModalBackdrop}
            onPress={closeClearConfirmation}
            accessibilityRole="button"
            accessibilityLabel="Close clear chat confirmation"
          />
          <View style={styles.confirmModalContent}>
            <PrimaryCard style={styles.confirmModalCard}>
            <Text style={styles.confirmModalTitle}>
              Are you sure you want to clear your chat history?
            </Text>
            <Text style={styles.confirmModalBody}>
              This removes the current conversation from this device.
            </Text>
            <View style={styles.confirmModalActions}>
              <AppButton
                label="Cancel"
                onPress={closeClearConfirmation}
                variant="overlay"
                size="sm"
                style={styles.confirmModalButton}
              />
              <AppButton
                label="Clear"
                onPress={confirmClearMessages}
                variant="primary"
                size="sm"
                style={styles.confirmModalButton}
              />
            </View>
            </PrimaryCard>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function AiChatModal() {
  return <AiChatScreen presentation="screen" />;
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  backButtonPressed: {
    opacity: 0.72,
  },
  headerTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0,
    fontFamily: typography.fontFamily.heading,
    fontWeight: "800",
  },
  conversationHeaderRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerSide: {
    minWidth: 56,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerSideEnd: {
    alignItems: "flex-end",
  },
  conversationHeaderTitleWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  conversationHeaderTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0,
    fontFamily: typography.fontFamily.heading,
    fontWeight: "800",
  },
  headerAction: {
    minHeight: 32,
    minWidth: 56,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerActionPressed: {
    opacity: 0.72,
  },
  headerActionText: {
    fontSize: 13,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  confirmModalRoot: {
    flex: 1,
  },
  confirmModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  confirmModalContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: appTheme.modal.sidePadding,
    paddingVertical: appTheme.modal.sidePadding,
  },
  confirmModalCard: {
    width: "100%",
    maxWidth: appTheme.modal.maxWidth,
    alignSelf: "center",
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  confirmModalTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: typography.fontFamily.heading,
    color: appTheme.colors.textPrimary,
    textAlign: "center",
  },
  confirmModalBody: {
    marginTop: spacing.sm,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
    textAlign: "center",
  },
  confirmModalActions: {
    flexDirection: "row",
    width: "100%",
    gap: spacing.sm,
    marginTop: spacing.lg,
    alignItems: "stretch",
  },
  confirmModalButton: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  chatShell: {
    flex: 1,
  },
  messagesScroll: {
    flex: 1,
    marginHorizontal: -appTheme.screen.sidePadding,
  },
  messagesContent: {
    paddingTop: 6,
    paddingHorizontal: 20,
    paddingBottom: spacing.lg,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingBottom: spacing.lg,
  },
  emptyStatePressable: {
    flex: 1,
  },
  heroMark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    marginBottom: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  heroLogo: {
    width: 34,
    height: 34,
    tintColor: "#000000",
  },
  heroTitle: {
    fontSize: 25,
    lineHeight: 31,
    letterSpacing: -0.4,
    fontFamily: typography.fontFamily.headingBlack,
    fontWeight: "900",
    color: appTheme.colors.textPrimary,
    textAlign: "center",
  },
  heroSubtitle: {
    maxWidth: 280,
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
    textAlign: "center",
  },
  promptStack: {
    width: "100%",
    gap: 8,
    marginTop: 22,
  },
  promptChip: {
    width: "100%",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    backgroundColor: appTheme.colors.surface,
  },
  promptChipPressed: {
    opacity: 0.78,
  },
  promptText: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: typography.fontFamily.body,
    color: "#1E2C4A",
    textAlign: "left",
  },
  heroDisclaimer: {
    maxWidth: 280,
    marginTop: 20,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.textSecondary,
    textAlign: "center",
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
    maxWidth: "86%",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(20,20,20,0.06)",
  },
  messageBubbleAssistant: {
    backgroundColor: appTheme.colors.surface,
  },
  messageBubbleUser: {
    backgroundColor: "#F1EEF9",
  },
  messageEyebrow: {
    marginBottom: 5,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: typography.fontFamily.heading,
    letterSpacing: 0,
    color: appTheme.colors.textTertiary,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textStrong,
  },
  composerCard: {
    left: -appTheme.screen.sidePadding,
    right: -appTheme.screen.sidePadding,
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 20,
    backgroundColor: "#E7E1DD",
  },
  composerCardFloating: {
    position: "absolute",
  },
  composerCardTab: {
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
    width: "100%",
  },
  composerField: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
    maxHeight: 132,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 30,
    maxHeight: 108,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.input.text,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignSelf: "flex-end",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.textStrong,
  },
  sendButtonDisabled: {
    backgroundColor: "#E7E1DD",
  },
  sendButtonPressed: {
    opacity: 0.86,
  },
  sendButtonText: {
    fontSize: 14,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: "#FFFFFF",
  },
});
