import React from "react";
import { View, Pressable, StyleSheet, Image } from "react-native";
import { Tabs, router } from "expo-router";
import { colors, spacing } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: colors.brand.primary,
          tabBarInactiveTintColor: colors.text.muted,
          tabBarStyle: {
            backgroundColor: colors.background.card,
            borderTopColor: colors.border.subtle,
            height: 64,
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
              <Image
                source={require("@/components/icons/home.png")}
                style={[styles.tabIcon, { tintColor: color }]}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="supplements"
          options={{
            title: "Supplements",
            tabBarIcon: ({ color }) => (
              <Image
                source={require("@/components/icons/supplements.png")}
                style={[styles.tabIcon, { tintColor: color }]}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="health"
          options={{
            title: "Health",
            tabBarIcon: ({ color }) => (
              <Image
                source={require("@/components/icons/health.png")}
                style={[styles.tabIcon, { tintColor: color }]}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="protocols"
          options={{
            title: "Protocols",
            tabBarIcon: ({ color }) => (
              <Image
                source={require("@/components/icons/protocols.png")}
                style={[styles.tabIcon, { tintColor: color }]}
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
        <View style={styles.fabInner}>
          <View style={styles.plus} />
          <View style={[styles.plus, styles.plusVertical]} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
    zIndex: 20,
  },
  fabInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brand.primary,
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
  tabIcon: {
    width: 22,
    height: 22,
    resizeMode: "contain",
  },
});
