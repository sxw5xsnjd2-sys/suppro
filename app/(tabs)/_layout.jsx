import React from "react";
import { View, Pressable, StyleSheet, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs, router } from "expo-router";
import { appTheme, typography } from "@/theme";
import HomeIcon from "@/assets/icons/tab/home.svg";
import SupplementsIcon from "@/assets/icons/tab/supplements.svg";
import HealthIcon from "@/assets/icons/tab/health.svg";
import MessagesIcon from "@/assets/icons/tab/messages.svg";

const VISIBLE_TABS = ["index", "supplements", "health", "ai"];

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
  return <MessagesIcon {...iconProps} />;
}

function TabItem({ route, label, focused, navigation }) {
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
  const visibleRoutes = VISIBLE_TABS.map((name) =>
    state.routes.find((route) => route.name === name)
  ).filter(Boolean);
  const currentRouteName = state.routes[state.index]?.name;
  const leftTabs = visibleRoutes.slice(0, 2);
  const rightTabs = visibleRoutes.slice(2);

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
        {leftTabs.map(renderTab)}
        <View style={styles.centerSlot} />
        {rightTabs.map(renderTab)}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add supplement"
        onPress={() => router.push("/modal/supplement")}
        style={({ pressed }) => [
          styles.fab,
          { top: -appTheme.tabBar.fabOffset },
          pressed && styles.fabPressed,
        ]}
      >
        <LinearGradient
          colors={appTheme.tabBar.fabGradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.fabInner}
        >
          <View style={styles.plus} />
          <View style={[styles.plus, styles.plusVertical]} />
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
            title: "Chat",
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
            href: null,
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
  centerSlot: {
    flex: 1,
  },
  tabLabel: {
    fontSize: appTheme.tabBar.labelSize,
    textAlign: "center",
    width: "100%",
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
  fab: {
    position: "absolute",
    left: "50%",
    marginLeft: -(appTheme.tabBar.fabSize / 2),
    zIndex: 20,
  },
  fabPressed: {
    opacity: 0.88,
  },
  fabInner: {
    width: appTheme.tabBar.fabSize,
    height: appTheme.tabBar.fabSize,
    borderRadius: appTheme.tabBar.fabSize / 2,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: appTheme.tabBar.fabBorderColor,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 13.2,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  plus: {
    position: "absolute",
    width: appTheme.tabBar.plusSize,
    height: appTheme.tabBar.plusThickness,
    backgroundColor: appTheme.tabBar.plusColor,
    borderRadius: 2,
  },
  plusVertical: {
    transform: [{ rotate: "90deg" }],
  },
});
