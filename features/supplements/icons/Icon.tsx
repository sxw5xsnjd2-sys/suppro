import React from "react";
import { SupplementRoute } from "@/features/supplements/types";

import Pill from "./pill.svg";
import Liquid from "./liquid.svg";
import Powder from "./powder.svg";
import Cream from "./cream.svg";
import Syringe from "./syringe.svg";

type Props = {
  route: SupplementRoute;
  size?: number;
};

const ICONS: Record<SupplementRoute, React.FC<any>> = {
  tablet: Pill,
  liquid: Liquid,
  powder: Powder,
  topical: Cream,
  injectable: Syringe,
};

export function Icon({ route, size = 28 }: Props) {
  const SvgIcon = ICONS[route];
  return <SvgIcon width={size} height={size} strokeWidth={0.55} />;
}
