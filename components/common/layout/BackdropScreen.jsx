import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBackdrop } from "@/components/common/ui";
import { appTheme } from "@/theme";

export function BackdropScreen({
  children,
  header,
  contentStyle,
  scrollContentStyle,
  scrollViewRef,
  bottomInsetOffset = 120,
  minBottomPadding = 132,
  showsVerticalScrollIndicator = false,
  scrollable = true,
  onHeaderHeightChange,
}) {
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);
  const bottomPadding = Math.max(
    insets.bottom + bottomInsetOffset,
    minBottomPadding
  );

  return (
    <View style={styles.screen}>
      <AppBackdrop />

      {header ? (
        <View
          style={styles.fixedHeader}
          onLayout={(event) => {
            const nextHeight = event.nativeEvent.layout.height;
            setHeaderHeight(nextHeight);
            onHeaderHeightChange?.(nextHeight);
          }}
        >
          <View pointerEvents="none" style={styles.headerBackdrop}>
            <AppBackdrop />
          </View>
          {header}
        </View>
      ) : null}

      {scrollable ? (
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: headerHeight,
              paddingBottom: bottomPadding,
            },
            scrollContentStyle,
          ]}
        >
          <View style={[styles.content, contentStyle]}>{children}</View>
        </ScrollView>
      ) : (
        <View
          style={[
            styles.staticContent,
            {
              paddingTop: headerHeight,
              paddingBottom: bottomPadding,
            },
            scrollContentStyle,
          ]}
        >
          <View style={[styles.content, styles.staticInnerContent, contentStyle]}>
            {children}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: appTheme.screen.background,
  },
  fixedHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    overflow: "hidden",
  },
  headerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: appTheme.screen.background,
  },
  scrollContent: {
    paddingBottom: appTheme.screen.contentTopSpacing,
  },
  staticContent: {
    flex: 1,
  },
  content: {
    paddingHorizontal: appTheme.screen.sidePadding,
    paddingTop: appTheme.screen.contentTopSpacing,
  },
  staticInnerContent: {
    flex: 1,
  },
});
