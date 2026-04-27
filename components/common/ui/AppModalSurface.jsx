import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { appTheme } from "@/theme";
import { AppBackdrop } from "./AppBackdrop";
import { PrimaryCard } from "./PrimaryCard";

export function AppModalSurface({
  children,
  cardStyle,
  contentStyle,
  keyboardVerticalOffset = 0,
  fullscreen = false,
}) {
  return (
    <View style={[styles.backdrop, fullscreen && styles.backdropFullscreen]}>
      <View pointerEvents="none" style={styles.backdropLayer}>
        <AppBackdrop />
      </View>
      <View pointerEvents="none" style={styles.scrim} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
        style={[styles.keyboard, fullscreen && styles.keyboardFullscreen]}
      >
        <View style={[styles.content, fullscreen && styles.contentFullscreen, contentStyle]}>
          <PrimaryCard style={[styles.card, fullscreen && styles.cardFullscreen, cardStyle]}>
            {children}
          </PrimaryCard>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: appTheme.modal.sidePadding,
    paddingVertical: appTheme.modal.sidePadding,
  },
  backdropFullscreen: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  backdropLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: appTheme.modal.scrim,
  },
  keyboard: {
    width: "100%",
  },
  keyboardFullscreen: {
    flex: 1,
  },
  content: {
    width: "100%",
    maxWidth: appTheme.modal.maxWidth,
    alignSelf: "center",
  },
  contentFullscreen: {
    flex: 1,
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  card: {
    maxHeight: appTheme.modal.cardMaxHeight,
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
  },
  cardFullscreen: {
    flex: 1,
    maxHeight: "100%",
    borderRadius: 0,
  },
});
