import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Screen } from "@/components/common/layout/Screen";
import { Header } from "@/components/common/layout/Header";
import { colors, spacing, radius, shadows } from "@/theme";

export default function AccountScreen() {
  return (
    <Screen
      header={
        <Header
          title="Account"
          subtitle="Account details"
          rightSlot={
            <Pressable onPress={() => router.back()} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.icon.primary} />
            </Pressable>
          }
        />
      }
      scrollable={false}
    >
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>
          <Text style={styles.cardBody}>
            Account details will appear here.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  card: {
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  cardBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text.secondary,
  },
});
