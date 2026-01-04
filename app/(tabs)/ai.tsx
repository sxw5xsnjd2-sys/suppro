import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Screen } from "@/components/layout/Screen";
import { Header } from "@/components/layout/Header";
import { colors, spacing } from "@/theme";
import { useChatStore } from "@/store/aiStore";

// Placeholder – we’ll implement this later
async function sendChatToLLM(prompt: string): Promise<string> {
  return "This is a placeholder AI response.";
}

export default function AIScreen() {
  const { messages, status, addMessage, setStatus, clearMessages } =
    useChatStore();
  const [input, setInput] = useState("");

  const onSend = async () => {
    if (!input.trim()) return;

    const userText = input.trim();
    setInput("");

    addMessage({ role: "user", content: userText });
    setStatus("loading");

    try {
      const response = await sendChatToLLM(userText);
      addMessage({ role: "assistant", content: response });
      setStatus("idle");
    } catch (e) {
      setStatus("error", "Failed to get response");
      addMessage({
        role: "assistant",
        content: "Sorry — something went wrong. Please try again.",
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
      <Pressable onPress={clearMessages} style={styles.refreshRow}>
        <Text style={styles.refreshText}>Refresh chat</Text>
      </Pressable>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === "user" ? styles.userBubble : styles.aiBubble,
            ]}
          >
            <Text
              style={[
                styles.text,
                item.role === "user" ? styles.userText : styles.aiText,
              ]}
            >
              {item.content}
            </Text>
          </View>
        )}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about supplements or symptoms…"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
            editable={status !== "loading"}
          />
          <Pressable
            onPress={onSend}
            disabled={status === "loading"}
            style={[
              styles.sendButton,
              status === "loading" && styles.sendDisabled,
            ]}
          >
            <Text style={styles.sendText}>
              {status === "loading" ? "…" : "Send"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  bubble: {
    maxWidth: "85%",
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: 12,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.brand.primary,
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.background.card,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  userText: {
    color: colors.text.inverse,
  },
  aiText: {
    color: colors.text.primary,
  },
  inputRow: {
    flexDirection: "row",
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.background.app,
  },
  input: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.background.card,
    color: colors.text.primary,
    marginRight: spacing.sm,
  },
  sendButton: {
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.brand.primary,
  },
  sendDisabled: {
    opacity: 0.6,
  },
  sendText: {
    color: colors.text.inverse,
    fontWeight: "600",
  },

  refreshRow: {
    alignSelf: "flex-end",
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    marginRight: spacing.md,
  },

  refreshText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text.muted,
  },
});
