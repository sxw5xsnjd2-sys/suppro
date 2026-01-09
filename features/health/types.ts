export type HealthMetricType =
  | "sleep"
  | "mood"
  | "energy"
  | "stress"
  | "weight"
  | "resting_hr";

export type HealthEntry = {
  id: string;
  type: HealthMetricType | string; // allow dynamic metrics from user input
  value: number; // always numeric (scale handled by UI)
  date: string; // YYYY-MM-DD
  note?: string;
};

export type MetricRegistryItem = {
  key: string; // e.g. "focus", "sleep_quality"
  label: string; // Display name
  enabled: boolean;
};
