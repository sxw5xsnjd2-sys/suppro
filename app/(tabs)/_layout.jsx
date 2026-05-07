import React from "react";
import { View, Pressable, StyleSheet, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSubscriptionAccess } from "@/features/subscriptions/useSubscriptionAccess";
import { appTheme, typography } from "@/theme";
import HomeIcon from "@/assets/icons/tab/home.svg";
import SupplementsIcon from "@/assets/icons/tab/supplements.svg";
import HealthIcon from "@/assets/icons/tab/health.svg";
import AccountIcon from "@/assets/icons/profile/account.svg";

const VISIBLE_TABS = ["index", "supplements", "health", "profile"];

function TabIcon({ routeName, color }) {
  const iconProps = {
    width: appTheme.tabBar.iconSize,
    height: appTheme.tabBar.iconSize,
    color,
    fill: color,
    stroke: color,
    strokeWidth: 0.55,
  };

  if (routeName === "index") return <HomeIcon {...iconProps} />;
  if (routeName === "supplements") return <SupplementsIcon {...iconProps} />;
  if (routeName === "health") return <HealthIcon {...iconProps} />;
  return <AccountIcon {...iconProps} />;
}

function TabItem({ route, label, focused, navigation, requireSubscriptionAccess }) {
  const tintColor = focused
    ? appTheme.tabBar.activeLabelColor
    : appTheme.tabBar.inactiveLabelColor;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={label}
      onPress={() => {
        const event = navigation.emit({
          type: "tabPress",
          target: route.key,
          canPreventDefault: true,
        });

        if (!focused && !event.defaultPrevented) {
          if (
            route.name === "health" &&
            !requireSubscriptionAccess("health_tab")
          ) {
            return;
          }

          navigation.navigate(route.name);
        }
      }}
      onLongPress={() =>
        navigation.emit({
          type: "tabLongPress",
          target: route.key,
        })
      }
      style={({ pressed }) => [
        styles.tabItem,
        pressed && styles.tabItemPressed,
      ]}
    >
      <TabIcon routeName={route.name} color={tintColor} />
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        numberOfLines={1}
        style={[
          styles.tabLabel,
          focused ? styles.tabLabelActive : styles.tabLabelInactive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CustomTabBar({ state, descriptors, navigation, insets }) {
  const { requireSubscriptionAccess } = useSubscriptionAccess();
  const visibleRoutes = VISIBLE_TABS.map((name) =>
    state.routes.find((route) => route.name === name)
  ).filter(Boolean);
  const currentRouteName = state.routes[state.index]?.name;
  const midpoint = Math.ceil(visibleRoutes.length / 2);
  const leftRoutes = visibleRoutes.slice(0, midpoint);
  const rightRoutes = visibleRoutes.slice(midpoint);

  const renderTab = (route) => {
    const options = descriptors[route.key]?.options ?? {};
    const label =
      typeof options.title === "string" && options.title.length > 0
        ? options.title
        : route.name;

    return (
      <TabItem
        key={route.key}
        route={route}
        label={label}
        focused={currentRouteName === route.name}
        navigation={navigation}
        requireSubscriptionAccess={requireSubscriptionAccess}
      />
    );
  };

  return (
    <View
      style={[
        styles.tabBar,
        {
          height: appTheme.tabBar.baseHeight + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 0),
        },
      ]}
    >
      <View style={styles.tabRow}>
        <View style={styles.tabGroup}>{leftRoutes.map(renderTab)}</View>
        <View style={styles.centerSlot} />
        <View style={[styles.tabGroup, styles.rightTabGroup]}>
          {rightRoutes.map(renderTab)}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan product"
        onPress={() => {
          if (!requireSubscriptionAccess("scanner")) {
            return;
          }

          router.push("/scanner");
        }}
        style={({ pressed }) => [
          styles.scanButton,
          {
            top: -appTheme.tabBar.scanButtonTopOffset,
          },
          pressed && styles.scanButtonPressed,
        ]}
      >
        <LinearGradient
          colors={appTheme.tabBar.scanButtonGradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.scanButtonInner}
        >
          <View style={styles.scanButtonContent}>
            <Ionicons
              name="barcode-outline"
              size={40}
              color={appTheme.tabBar.plusColor}
            />
          </View>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <View style={styles.root}>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
          }}
        />

        <Tabs.Screen
          name="supplements"
          options={{
            title: "Supplements",
          }}
        />

        <Tabs.Screen
          name="health"
          options={{
            title: "Health",
          }}
        />

        <Tabs.Screen
          name="ai"
          options={{
            href: null,
          }}
        />

        <Tabs.Screen
          name="stats"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Me",
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabBar: {
    position: "relative",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: appTheme.tabBar.borderColor,
    paddingHorizontal: appTheme.tabBar.horizontalPadding,
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "stretch",
    height: appTheme.tabBar.baseHeight,
  },
  tabGroup: {
    flex: 2,
    flexDirection: "row",
    alignItems: "stretch",
  },
  rightTabGroup: {
    marginLeft: -10,
  },
  centerSlot: {
    flex: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: appTheme.tabBar.itemHorizontalPadding,
    gap: appTheme.tabBar.itemGap,
  },
  tabItemPressed: {
    opacity: 0.76,
  },
  tabLabel: {
    fontSize: appTheme.tabBar.labelSize,
    textAlign: "center",
    width: "100%",
    flexShrink: 1,
  },
  tabLabelActive: {
    fontFamily: typography.fontFamily.bodyBold,
    color: appTheme.tabBar.activeLabelColor,
    lineHeight: 11,
  },
  tabLabelInactive: {
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.tabBar.inactiveLabelColor,
    lineHeight: 12,
  },
  scanButton: {
    position: "absolute",
    left: "52%",
    zIndex: 20,
    marginLeft: -appTheme.tabBar.scanButtonSize / 2,
  },
  scanButtonPressed: {
    opacity: 0.88,
  },
  scanButtonInner: {
    width: appTheme.tabBar.scanButtonSize,
    height: appTheme.tabBar.scanButtonSize,
    borderRadius: appTheme.tabBar.scanButtonSize / 2,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: appTheme.tabBar.scanButtonBorderColor,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 13.2,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  scanButtonContent: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
});
