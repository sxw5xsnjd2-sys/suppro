import React from "react";
import SettingsScreen from "./(modals)/modal/settings";
import { RevenueCatProvider } from "@/features/subscriptions/RevenueCatProvider";

export default function SettingsRoute() {
  return (
    <RevenueCatProvider>
      <SettingsScreen />
    </RevenueCatProvider>
  );
}
