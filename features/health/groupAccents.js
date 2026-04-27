export const GROUP_ACCENTS = {
  Recovery: { tint: "#5E76A8", soft: "#E5EAF5" },
  Cognition: { tint: "#7E5EA8", soft: "#EBE5F5" },
  "Daily wellbeing": { tint: "#5E9DA8", soft: "#E0EEF1" },
  Load: { tint: "#C95757", soft: "#F5DCDC" },
  Symptoms: { tint: "#B86A3A", soft: "#F5E5DA" },
  Training: { tint: "#56823F", soft: "#E0EBDB" },
  Hormones: { tint: "#A8895E", soft: "#F1EAD9" },
  Measurements: { tint: "#1F2E52", soft: "#DFE6F5" },
};

export function accentForMetric(metric) {
  return GROUP_ACCENTS[metric?.group] ?? GROUP_ACCENTS.Measurements;
}
