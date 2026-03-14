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
}) {
  return (
    <View style={styles.backdrop}>
      <View pointerEvents="none" style={styles.backdropLayer}>
        <AppBackdrop />
      </View>
      <View pointerEvents="none" style={styles.scrim} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
        style={styles.keyboard}
      >
        <View style={[styles.content, contentStyle]}>
          <PrimaryCard style={[styles.card, cardStyle]}>{children}</PrimaryCard>
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
  content: {
    width: "100%",
    maxWidth: appTheme.modal.maxWidth,
    alignSelf: "center",
  },
  card: {
    maxHeight: appTheme.modal.cardMaxHeight,
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
  },
});
