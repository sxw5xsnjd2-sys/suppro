import React from "react";
import { StyleSheet, View } from "react-native";
import { spacing } from "@/theme";
import { PrimaryCard } from "./PrimaryCard";
import { SectionTitle } from "./SectionTitle";

export function AppSectionCard({
  title,
  subtitle,
  action,
  children,
  style,
  headerStyle,
  titleStyle,
  subtitleStyle,
  contentStyle,
  variant = "default",
}) {
  const content = contentStyle ? (
    <View style={contentStyle}>{children}</View>
  ) : (
    children
  );

  return (
    <PrimaryCard variant={variant} style={[styles.card, style]}>
      {title || subtitle || action ? (
        <SectionTitle
          title={title}
          subtitle={subtitle}
          action={action}
          style={[styles.header, headerStyle]}
          titleStyle={titleStyle}
          subtitleStyle={subtitleStyle}
        />
      ) : null}
      {content}
    </PrimaryCard>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  header: {
    marginBottom: spacing.md,
  },
});
