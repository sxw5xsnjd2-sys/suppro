// utils/metalStyles.ts
export type MetalGradient = readonly [string, string, ...string[]];

export const metalGradients: Record<
  "bronze" | "silver" | "gold",
  MetalGradient
> = {
  bronze: ["#F2C28B", "#C27A3A", "#8A5524"],
  // silver: ["#FFFFFF", "#D6DAE3", "#B8BCC8"],
  // silver: ["#F5F7FA", "#C9CED6", "#9AA1AB"],
  silver: ["#FFFFFF", "#D1D6DE", "#8F96A3"],
  gold: ["#FFF6CC", "#E3C15F", "#B9972E"],
} as const;
