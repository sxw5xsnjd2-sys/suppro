import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { supabase } from "@src/lib/supabase";
import { spacing, colors } from "@/theme";

export default function AddSupplementCatalogModal() {
  const [name, setName] = useState("");
  const [evidenceScore, setEvidenceScore] = useState("");
  const [whatIsIt, setWhatIsIt] = useState("");
  const [whyUseIt, setWhyUseIt] = useState("");
  const [risks, setRisks] = useState("");
  const [evidence, setEvidence] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;

    setSaving(true);

    const { data, error } = await supabase
      .from("supplements")
      .insert({
        name: name.trim(),
        what_is_it: whatIsIt.trim(),
        why_use_it: whyUseIt.trim(),
        risks_and_interactions: risks.trim(),
        evidence: evidence.trim(),
        evidence_score: evidenceScore ? Number(evidenceScore) : null,
      })
      .select("id, name")
      .single();

    if (error) {
      // Duplicate name (unique constraint violation)
      if (error.code === "23505") {
        alert("This supplement already exists in the catalog.");
        setSaving(false);
        return;
      }

      console.error(error);
      setSaving(false);
      return;
    }

    // Return to previous modal with new catalog item
    router.back();
    router.setParams({
      newCatalogId: data.id,
      newCatalogName: data.name,
    });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
      <Text
        style={{ fontSize: 20, fontWeight: "600", marginBottom: spacing.lg }}
      >
        Add new supplement
      </Text>

      <LabeledInput label="Name" value={name} onChange={setName} />

      <LabeledInput
        label="Evidence rating (0–100)"
        value={evidenceScore}
        onChange={setEvidenceScore}
        keyboardType="numeric"
      />

      <LabeledMultiline
        label="What is it?"
        value={whatIsIt}
        onChange={setWhatIsIt}
      />

      <LabeledMultiline
        label="Why use it?"
        value={whyUseIt}
        onChange={setWhyUseIt}
      />

      <LabeledMultiline
        label="Risks / interactions"
        value={risks}
        onChange={setRisks}
      />

      <LabeledMultiline
        label="Evidence summary"
        value={evidence}
        onChange={setEvidence}
      />

      <Pressable
        onPress={save}
        disabled={saving}
        style={{
          marginTop: spacing.lg,
          padding: spacing.md,
          borderRadius: 12,
          backgroundColor: colors.brand.primary,
          alignItems: "center",
          opacity: saving ? 0.6 : 1,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "600" }}>
          Save supplement
        </Text>
      </Pressable>
    </ScrollView>
  );
}

/* ---------- Small helpers ---------- */

function LabeledInput({
  label,
  value,
  onChange,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: "numeric";
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ fontWeight: "600", marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 10,
          padding: 12,
        }}
      />
    </View>
  );
}

function LabeledMultiline({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ fontWeight: "600", marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 10,
          padding: 12,
          minHeight: 80,
          textAlignVertical: "top",
        }}
      />
    </View>
  );
}
