import React, { forwardRef } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { appTheme, typography } from "@/theme";

export const AppTextInput = forwardRef(function AppTextInput(
  {
    style,
    inputStyle,
    leftAccessory,
    rightAccessory,
    containerStyle,
    multiline = false,
    editable = true,
    ...props
  },
  ref
) {
  return (
    <View
      style={[
        styles.root,
        multiline && styles.rootMultiline,
        !editable && styles.rootDisabled,
        containerStyle,
      ]}
    >
      {leftAccessory ? <View style={styles.accessory}>{leftAccessory}</View> : null}
      <TextInput
        ref={ref}
        editable={editable}
        multiline={multiline}
        placeholderTextColor={appTheme.input.placeholder}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          !editable && styles.inputDisabled,
          inputStyle,
          style,
        ]}
        {...props}
      />
      {rightAccessory ? <View style={styles.accessory}>{rightAccessory}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: appTheme.input.height,
    borderRadius: appTheme.input.radius,
    backgroundColor: appTheme.input.background,
    paddingHorizontal: 14,
  },
  rootMultiline: {
    alignItems: "flex-start",
    paddingVertical: 12,
  },
  rootDisabled: {
    opacity: 0.72,
  },
  accessory: {
    justifyContent: "center",
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.input.text,
    paddingVertical: 0,
  },
  inputMultiline: {
    minHeight: 72,
    paddingTop: 0,
    textAlignVertical: "top",
  },
  inputDisabled: {
    color: appTheme.colors.textMuted,
  },
});
