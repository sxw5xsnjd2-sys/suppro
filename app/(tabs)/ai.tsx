import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Animated,
  Keyboard,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/common/layout/Screen";
import { Header } from "@/components/common/layout/Header";
import { colors, spacing, radius, shadows } from "@/theme";
import { useChatStore } from "@/features/ai/store";

async function sendChatToLLM(prompt: string): Promise<string> {
  return "This is a placeholder AI response.";
}

export default function AIScreen() {
  const { messages, status, addMessage, setStatus, clearMessages } =
    useChatStore();

  const insets = useSafeAreaInsets();
  const keyboardShift = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList>(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const scrollToLatest = (animated = true) =>
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));

  const promptCards = [
    "Can you recommend a better stack based on my metrics?",
    "Can you find me latest supplement news?",
    "Can you rate my stack?",
  ];

  // ✅ Keyboard animation effect
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const handleShow = (e: any) => {
      const height = e?.endCoordinates?.height ?? 0;
      const duration = e?.duration ?? 250;
      const target = -Math.max(0, height - insets.bottom);

      setKeyboardHeight(height);
      setKeyboardVisible(true);

      Animated.timing(keyboardShift, {
        toValue: target,
        duration,
        useNativeDriver: true,
      }).start();
      scrollToLatest(false);
    };

    const handleHide = (e: any) => {
      const duration = e?.duration ?? 200;

      setKeyboardHeight(0);
      setKeyboardVisible(false);

      Animated.timing(keyboardShift, {
        toValue: 0,
        duration,
        useNativeDriver: true,
      }).start();
    };

    const showSub = Keyboard.addListener(showEvent, handleShow);
    const hideSub = Keyboard.addListener(hideEvent, handleHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom, keyboardShift]);

  // ✅ Auto-scroll when messages change (MUST be top-level)
  useEffect(() => {
    if (messages.length === 0) return;

    scrollToLatest(true);
  }, [messages.length]);

  useEffect(() => {
    if (keyboardVisible) {
      scrollToLatest(false);
    }
  }, [keyboardVisible]);

  const onSend = async () => {
    if (!input.trim()) return;

    const text = input.trim();
    setInput("");
    addMessage({ role: "user", content: text });
    setStatus("loading");

    try {
      const res = await sendChatToLLM(text);
      addMessage({ role: "assistant", content: res });
      setStatus("idle");
    } catch {
      setStatus("error");
      addMessage({
        role: "assistant",
        content: "Sorry — something went wrong.",
      });
    }
  };

  return (
    <Screen
      scrollable={false}
      header={
        <Header
          title="Suppro AI"
          subtitle="Ask about supplements, symptoms, and your stack"
          centered
        />
      }
    >
      <View style={{ flex: 1 }}>
        <View style={styles.refreshRow}>
          <Pressable onPress={clearMessages}>
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, overflow: "hidden" }}>
          <Animated.View
            style={{
              flex: 1,
              transform: [{ translateY: keyboardShift }],
            }}
          >
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                styles.list,
                {
                  paddingBottom:
                    composerHeight +
                    (keyboardVisible ? keyboardHeight : insets.bottom),
                },
              ]}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.message,
                    item.role === "user" ? styles.user : styles.ai,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      item.role === "user" ? styles.userText : styles.aiText,
                    ]}
                  >
                    {item.content}
                  </Text>
                </View>
              )}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.composerSafe,
              {
                paddingBottom: keyboardVisible ? 0 : insets.bottom,
              },
              { transform: [{ translateY: keyboardShift }] },
            ]}
            onLayout={(e) => setComposerHeight(e.nativeEvent.layout.height)}
          >
            {messages.length === 0 && (
              <View style={styles.promptStack}>
                {promptCards.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setInput(p)}
                    style={styles.promptCard}
                  >
                    <Text style={styles.promptText}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.composer}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask about supplements or symptoms…"
                placeholderTextColor={colors.text.muted}
                style={[styles.input, focused && styles.inputFocused]}
                multiline
                editable={status !== "loading"}
                onFocus={() => {
                  setFocused(true);
                  scrollToLatest(true);
                }}
                onBlur={() => setFocused(false)}
              />

              <Pressable
                onPress={onSend}
                disabled={!input.trim() || status === "loading"}
                style={[
                  styles.send,
                  (!input.trim() || status === "loading") &&
                    styles.sendDisabled,
                ]}
              >
                <Text style={styles.sendArrow}>→</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },

  message: {
    maxWidth: "82%",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  user: {
    alignSelf: "flex-end",
    backgroundColor: colors.brand.primary,
  },
  ai: {
    alignSelf: "flex-start",
    backgroundColor: colors.background.card,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: colors.text.inverse,
  },
  aiText: {
    color: colors.text.primary,
  },

  refreshText: {
    fontSize: 15,
    color: colors.text.muted,
  },

  refreshRow: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    alignItems: "flex-end",
  },

  composerSafe: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },

  promptStack: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  promptCard: {
    backgroundColor: colors.background.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    ...shadows.card,
  },
  promptText: {
    fontSize: 16,
    color: colors.text.secondary,
  },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    padding: spacing.sm,
    ...shadows.card,
  },

  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.background.app,
    color: colors.text.primary,
  },
  inputFocused: {
    minHeight: 72,
  },

  send: {
    width: 44,
    height: 44,
    marginLeft: spacing.sm,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand.primary,
    ...shadows.card,
  },
  sendDisabled: {
    opacity: 0.4,
  },
  sendArrow: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.inverse,
  },
});
