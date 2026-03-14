import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { appTheme } from "@/theme";

export function AppBackdrop() {
  return (
    <View pointerEvents="none" style={styles.backdrop}>
      <LinearGradient
        colors={appTheme.backdrop.auraColors}
        locations={appTheme.backdrop.auraLocations}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.aura}
      />
      <LinearGradient
        colors={appTheme.backdrop.fadeColors}
        locations={appTheme.backdrop.fadeLocations}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.fade}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  aura: {
    position: "absolute",
    top: -120,
    left: -32,
    right: -32,
    height: 440,
    opacity: 0.72,
    borderBottomLeftRadius: 180,
    borderBottomRightRadius: 180,
    transform: [{ scaleX: 1.08 }],
  },
  fade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 520,
  },
});
