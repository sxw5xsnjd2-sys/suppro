import React, { useState } from "react";
import { View, StyleSheet, ScrollView, LayoutChangeEvent } from "react-native";
import { colors, spacing } from "@/theme";

type ScreenProps = {
  children: React.ReactNode;
  header?: React.ReactNode;
};

export function Screen({ children, header }: ScreenProps) {
  const [headerHeight, setHeaderHeight] = useState(0);

  const onHeaderLayout = (e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout;
    setHeaderHeight(height);
  };

  return (
    <View style={styles.root}>
      {header ? (
        <View style={styles.headerWrapper} onLayout={onHeaderLayout}>
          {header}
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          header ? { paddingTop: headerHeight + spacing.md } : null,
        ]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.app,
  },
  headerWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
