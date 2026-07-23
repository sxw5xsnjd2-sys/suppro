import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { SupplementSearchContent } from "@/features/search/components/SupplementSearchContent";
import { resolveSupplementSearchRoute } from "@src/lib/routeCompatibility";

export default function SupplementSearchScreen() {
  const params = useLocalSearchParams();
  const resolution = resolveSupplementSearchRoute(params);

  if (resolution.kind === "handoff") {
    return (
      <Redirect
        href={{
          pathname: resolution.pathname,
          params: resolution.params,
        }}
      />
    );
  }

  return (
    <SupplementSearchContent
      presentation="standalone"
      mode="picker"
      initialQuery={resolution.initialQuery}
    />
  );
}
