import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs, router } from "expo-router";
import { colors, gradients, spacing } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HomeIcon from "@/assets/icons/tab/home.svg";
import SupplementsIcon from "@/assets/icons/tab/supplements.svg";
import HealthIcon from "@/assets/icons/tab/health.svg";
import StatsIcon from "@/assets/icons/tab/statistics.svg";
export default function TabsLayout() {
    const insets = useSafeAreaInsets();
    return (<View style={{ flex: 1 }}>
      <Tabs screenOptions={{
            headerShown: false,
            tabBarShowLabel: true,
            tabBarActiveTintColor: colors.brand.dark,
            tabBarInactiveTintColor: colors.text.muted,
            tabBarStyle: {
                backgroundColor: colors.background.card,
                borderTopWidth: 0,
                height: 66 + insets.bottom,
                paddingBottom: Math.max(insets.bottom, spacing.xs),
                paddingTop: spacing.xs,
            },
            tabBarLabelStyle: {
                fontSize: 12,
                fontWeight: "600",
                paddingBottom: 2,
            },
            tabBarItemStyle: {
                borderRightWidth: 1,
                borderRightColor: colors.border.subtle,
            },
        }}>
        <Tabs.Screen name="index" options={{
            title: "Home",
            tabBarIcon: ({ color }) => (<HomeIcon width={22} height={22} color={color} fill={color} stroke={color} strokeWidth={0.55}/>),
        }}/>

        <Tabs.Screen name="supplements" options={{
            title: "Supplements",
            tabBarIcon: ({ color }) => (<SupplementsIcon width={22} height={22} color={color} fill={color} stroke={color} strokeWidth={0.55}/>),
        }}/>

        <Tabs.Screen name="health" options={{
            title: "Health",
            tabBarIcon: ({ color }) => (<HealthIcon width={22} height={22} color={color} fill={color} stroke={color} strokeWidth={0.55}/>),
        }}/>

        <Tabs.Screen name="ai" options={{
            title: "Stats",
            tabBarItemStyle: {
                borderRightWidth: 0,
            },
            tabBarIcon: ({ color }) => (<StatsIcon width={22} height={22} color={color} fill={color} stroke={color} strokeWidth={0.55}/>),
        }}/>
      </Tabs>

      {/* Floating Add Button */}
      <Pressable onPress={() => router.push("/modal/supplement")} style={[styles.fab, { bottom: insets.bottom + 58 }]}>
        <LinearGradient colors={gradients.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabInner}>
          <View style={styles.plus}/>
          <View style={[styles.plus, styles.plusVertical]}/>
        </LinearGradient>
      </Pressable>
    </View>);
}
const styles = StyleSheet.create({
    fab: {
        position: "absolute",
        alignSelf: "center",
        zIndex: 20,
    },
    fabInner: {
        width: 58,
        height: 58,
        borderRadius: 29,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: colors.brand.dark,
        shadowOpacity: 0.28,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 10,
    },
    plus: {
        position: "absolute",
        width: 20,
        height: 2.5,
        backgroundColor: colors.text.inverse,
        borderRadius: 2,
    },
    plusVertical: {
        transform: [{ rotate: "90deg" }],
    },
});
