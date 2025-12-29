import React from "react";
import { Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SupplementRoute } from "@/types/Supplement";
import { colors } from "@/theme";

type Props = {
  route: SupplementRoute;
  size?: number;
};

export function Icon({ route, size = 28 }: Props) {
  // Liquid → Ionicons
  if (route === "liquid") {
    return (
      <Ionicons name="water-outline" size={size} color={colors.icon.muted} />
    );
  }

  // Everything else → local PNGs
  const source = (() => {
    switch (route) {
      case "tablet":
        return require("./pill.png");
      case "powder":
        return require("./powder.png");
      case "topical":
        return require("./cream.png");
      case "injectable":
        return require("./syringe.png");
      default:
        return require("./pill.png");
    }
  })();

  return (
    <Image
      source={source}
      style={{
        width: size,
        height: size,
        resizeMode: "contain",
      }}
    />
  );
}
