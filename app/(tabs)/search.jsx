import React from "react";
import { useLocalSearchParams } from "expo-router";
import { SupplementSearchContent } from "@/features/search/components/SupplementSearchContent";

function asString(value) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default function SearchTabScreen() {
  const params = useLocalSearchParams();
  return (
    <SupplementSearchContent
      presentation="tab"
      mode="info"
      initialQuery={asString(params.initialQuery)}
    />
  );
}
