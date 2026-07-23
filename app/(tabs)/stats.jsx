import React from "react";
import { Redirect } from "expo-router";
import { getMeCompatibilityHref } from "@src/lib/routeCompatibility";

export default function StatsCompatibilityRoute() {
  return <Redirect href={getMeCompatibilityHref("stats")} />;
}
