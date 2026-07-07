import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSubscriptionAccess } from "@/features/subscriptions/useSubscriptionAccess";
import { appTheme } from "@/theme";
import MessagesIcon from "@/assets/icons/tab/messages.svg";

export function ChatFloatingButton({ style }) {
  const insets = useSafeAreaInsets();
  const { requireSubscriptionAccess } = useSubscriptionAccess();

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom: Math.max(insets.bottom, 0) - 10,
        },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open AI chat"
        onPress={() => {
          if (!requireSubscriptionAccess("ai_chat")) {
            return;
          }

          router.push("/ai-chat");
        }}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
      >
        <LinearGradient
          colors={appTheme.tabBar.fabGradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.buttonInner}
        >
          <MessagesIcon
            width={24}
            height={24}
            color={appTheme.tabBar.plusColor}
            fill={appTheme.tabBar.plusColor}
            stroke={appTheme.tabBar.plusColor}
            strokeWidth={0.55}
          />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: appTheme.screen.sidePadding,
  },
  button: {
    borderRadius: appTheme.tabBar.fabSize / 2,
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonInner: {
    width: appTheme.tabBar.fabSize,
    height: appTheme.tabBar.fabSize,
    borderRadius: appTheme.tabBar.fabSize / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: appTheme.tabBar.fabBorderColor,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
});
