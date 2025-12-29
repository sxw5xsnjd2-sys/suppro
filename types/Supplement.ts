export type SupplementRoute =
  | "tablet"
  | "liquid"
  | "topical"
  | "injectable"
  | "powder";

export type Supplement = {
  id: string;
  name: string;
  route: SupplementRoute;
  time: string;
  timeMinutes: number;
  dose?: string;
};

export const SUPPLEMENT_ROUTES: {
  key: SupplementRoute;
  label: string;
}[] = [
  { key: "tablet", label: "Tablet / Capsule" },
  { key: "liquid", label: "Liquid" },
  { key: "powder", label: "Powder" },
  { key: "topical", label: "Topical" },
  { key: "injectable", label: "Injectable" },
];
