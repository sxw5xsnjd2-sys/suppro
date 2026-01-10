// src/types/supplements.ts
export type Supplement = {
  id: string;
  name: string;
  description: string | null;
  what_is_it: string | null;
  why_use_it: string | null;
  risks_and_interactions: string | null;
  evidence: string | null;
  evidence_score: number | null;
};

export type SupplementBenefit = {
  id: string;
  label: string;
  icon: string | null;
};

export type SupplementWithBenefits = Supplement & {
  supplement_benefits: SupplementBenefit[];
};
