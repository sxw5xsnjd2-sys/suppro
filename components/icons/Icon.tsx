import React from "react";
import { Image, StyleSheet } from "react-native";
import { SupplementRoute } from "@/types/Supplement";

type Props = {
  route: SupplementRoute;
  size?: number;
};

const ICONS: Record<SupplementRoute, any> = {
  tablet: require("./pill.png"),
  liquid: require("./liquid.png"),
  powder: require("./powder.png"),
  topical: require("./cream.png"),
  injectable: require("./syringe.png"),
};

export function Icon({ route, size = 28 }: Props) {
  return (
    <Image
      source={ICONS[route]}
      style={[styles.icon, { width: size, height: size }]}
    />
  );
}

const styles = StyleSheet.create({
  icon: {
    resizeMode: "contain",
  },
});
