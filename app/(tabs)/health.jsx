import React from "react";
import { Redirect } from "expo-router";
import { getMeCompatibilityHref } from "@src/lib/routeCompatibility";

export default function HealthCompatibilityRoute() {
  return <Redirect href={getMeCompatibilityHref("health")} />;
}
