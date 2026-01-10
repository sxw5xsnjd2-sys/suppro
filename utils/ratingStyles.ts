export type RatingStyle = {
  gradient: string[];
  border: string;
};

export function getRatingStyle(score: number) {
  if (score < 50) {
    return {
      gradient: [
        "#EF4444", // lighter red edge
        "#FCA5A5", // centre sheen
        "#EF4444",
      ],
      border: "#C53030",
    };
  }

  if (score < 75) {
    return {
      gradient: [
        "#F59E0B", // lighter amber edge
        "#FDE68A", // centre sheen
        "#F59E0B",
      ],
      border: "#C2410C",
    };
  }

  return {
    gradient: [
      "#22C55E", // lighter green edge
      "#86EFAC", // centre sheen
      "#22C55E",
    ],
    border: "#15803D",
  };
}
