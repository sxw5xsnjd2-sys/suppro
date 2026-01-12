export type RatingStyle = {
  gradient: readonly [string, string, string];
  border: string;
};

export function getRatingStyle(score: number) {
  if (score < 50) {
    return {
      gradient: ["#EF4444", "#EF4444", "#EF4444"] as const,
      border: "#C53030",
    };
  }

  if (score < 75) {
    return {
      gradient: ["#F59E0B", "#F59E0B", "#F59E0B"] as const,
      border: "#C2410C",
    };
  }

  return {
    gradient: ["#22C55E", "#22C55E", "#22C55E"] as const,
    border: "#15803D",
  };
}
