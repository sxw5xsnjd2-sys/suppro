import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs, router } from "expo-router";
import { colors, gradients } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HomeIcon from "@/assets/icons/tab/home.svg";
import SupplementsIcon from "@/assets/icons/tab/supplements.svg";
import HealthIcon from "@/assets/icons/tab/health.svg";
import AiIcon from "@/assets/icons/tab/robot.svg";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: colors.brand.primary,
          tabBarInactiveTintColor: "rgba(15, 23, 42, 0.35)",
          tabBarStyle: {
            backgroundColor: colors.background.card,
            borderTopColor: colors.border.subtle,
            height: 42 + insets.bottom,
            paddingBottom: Math.max(0, insets.bottom),
            paddingTop: 8,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            paddingBottom: 4,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color }) => (
              <HomeIcon
                width={22}
                height={22}
                color={color}
                fill={color}
                stroke={color}
                strokeWidth={0.55}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="supplements"
          options={{
            title: "Supplements",
            tabBarItemStyle: { marginRight: 12 },
            tabBarIcon: ({ color }) => (
              <SupplementsIcon
                width={22}
                height={22}
                color={color}
                fill={color}
                stroke={color}
                strokeWidth={0.55}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="health"
          options={{
            title: "Health",
            tabBarItemStyle: { marginLeft: 12 },
            tabBarIcon: ({ color }) => (
              <HealthIcon
                width={22}
                height={22}
                color={color}
                fill={color}
                stroke={color}
                strokeWidth={0.55}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="ai"
          options={{
            title: "AI",
            tabBarIcon: ({ color }) => (
              <AiIcon
                width={22}
                height={22}
                color={color}
                fill={color}
                stroke={color}
                strokeWidth={0.55}
              />
            ),
          }}
        />
      </Tabs>

      {/* Floating Add Button */}
      <Pressable
        onPress={() => router.push("/modal/supplement")}
        style={[styles.fab, { bottom: insets.bottom + 8 }]}
      >
        <LinearGradient
          colors={gradients.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabInner}
        >
          <View style={styles.plus} />
          <View style={[styles.plus, styles.plusVertical]} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 20,
  },
  fabInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  plus: {
    position: "absolute",
    width: 24,
    height: 3,
    backgroundColor: colors.text.inverse,
    borderRadius: 2,
  },
  plusVertical: {
    transform: [{ rotate: "90deg" }],
  },
});
