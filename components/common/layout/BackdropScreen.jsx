import React, { useRef, useState } from "react";
import { Animated, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBackdrop } from "@/components/common/ui";
import { appTheme } from "@/theme";
import {
  COMPACT_TITLE_HEADER_TRIGGER_OFFSET,
  CompactTitleHeader,
} from "../ui/CompactTitleHeader";

export function BackdropScreen({
  children,
  header,
  headerBehavior = "fixed",
  collapsedTitle,
  contentStyle,
  scrollContentStyle,
  scrollViewRef,
  bottomInsetOffset = 120,
  minBottomPadding = 132,
  showsVerticalScrollIndicator = false,
  nestedScrollEnabled = false,
  keyboardShouldPersistTaps,
  keyboardDismissMode,
  scrollable = true,
  onHeaderHeightChange,
  floatingSlot,
}) {
  const insets = useSafeAreaInsets();
  const isCollapsibleHeader =
    headerBehavior === "collapsible" &&
    scrollable &&
    Boolean(header) &&
    Boolean(collapsedTitle);
  const [headerHeight, setHeaderHeight] = useState(0);
  const collapsedHeaderAnimation = useRef(new Animated.Value(0)).current;
  const isCollapsedRef = useRef(false);
  const bottomPadding = Math.max(
    insets.bottom + bottomInsetOffset,
    minBottomPadding
  );

  const toggleCollapsedHeader = (nextCollapsed) => {
    if (isCollapsedRef.current === nextCollapsed) return;
    isCollapsedRef.current = nextCollapsed;
    Animated.timing(collapsedHeaderAnimation, {
      toValue: nextCollapsed ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  const handleHeaderLayout = (event) => {
    const nextHeight = event.nativeEvent.layout.height;
    setHeaderHeight(nextHeight);
    onHeaderHeightChange?.(nextHeight);
  };

  const handleScroll = (event) => {
    if (!isCollapsibleHeader || headerHeight <= 0) return;
    const threshold = Math.max(
      0,
      headerHeight - COMPACT_TITLE_HEADER_TRIGGER_OFFSET
    );
    toggleCollapsedHeader(event.nativeEvent.contentOffset.y >= threshold);
  };

  const collapsedHeaderStyle = {
    opacity: collapsedHeaderAnimation,
    transform: [
      {
        translateY: collapsedHeaderAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [-8, 0],
        }),
      },
    ],
  };

  return (
    <View style={styles.screen}>
      <AppBackdrop />

      {header && !isCollapsibleHeader ? (
        <View
          style={styles.fixedHeader}
          onLayout={handleHeaderLayout}
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
          nestedScrollEnabled={nestedScrollEnabled}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          keyboardDismissMode={keyboardDismissMode}
          onScroll={isCollapsibleHeader ? handleScroll : undefined}
          scrollEventThrottle={isCollapsibleHeader ? 16 : undefined}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: isCollapsibleHeader ? 0 : headerHeight,
              paddingBottom: bottomPadding,
            },
            scrollContentStyle,
          ]}
        >
          {isCollapsibleHeader ? (
            <View onLayout={handleHeaderLayout}>{header}</View>
          ) : null}
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

      {floatingSlot ? (
        <View pointerEvents="box-none" style={styles.floatingSlot}>
          {floatingSlot}
        </View>
      ) : null}

      {isCollapsibleHeader ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.collapsedHeader, collapsedHeaderStyle]}
        >
          <CompactTitleHeader title={collapsedTitle} />
        </Animated.View>
      ) : null}
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
  floatingSlot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  collapsedHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
});
