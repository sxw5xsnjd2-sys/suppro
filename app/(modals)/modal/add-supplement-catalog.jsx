import { useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, } from "react-native";
import { router } from "expo-router";
import { spacing, colors } from "@/theme";
import { getScopedSupabase } from "@src/lib/supabase";
export default function AddSupplementCatalogModal() {
    const [name, setName] = useState("");
    const [whatIsIt, setWhatIsIt] = useState("");
    const [whyUseIt, setWhyUseIt] = useState("");
    const [risks, setRisks] = useState("");
    const [evidence, setEvidence] = useState("");
    const [saving, setSaving] = useState(false);
    const scrollRef = useRef(null);
    const fieldOffsets = useRef({});
    const nameIsValid = name.trim().length > 0;
    const sanitizedText = (value) => {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
    };
    const registerOffset = (id) => (e) => {
        fieldOffsets.current[id] = e.nativeEvent.layout.y;
    };
    const scrollToField = (id) => {
        const y = fieldOffsets.current[id];
        if (y == null)
            return;
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    };
    const save = async () => {
        if (!nameIsValid)
            return;
        setSaving(true);
        const supabase = await getScopedSupabase();
        const { data, error } = await supabase
            .from("user_supplements")
            .insert({
            name: name.trim(),
            what_is_it: sanitizedText(whatIsIt),
            why_use_it: sanitizedText(whyUseIt),
            risks_and_interactions: sanitizedText(risks),
            evidence_summary: sanitizedText(evidence),
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
            newCatalogId: `user-${data.id}`,
            newCatalogName: data.name,
        });
        setSaving(false);
    };
    return (<KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 48 : 0}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 20, fontWeight: "600", marginBottom: spacing.lg }}>
          Add new supplement
        </Text>

        <LabeledInput id="name" label="Name *" value={name} onChange={setName} onFocus={() => scrollToField("name")} onLayout={registerOffset("name")}/>

        <LabeledMultiline id="whatIsIt" label="What is it? (optional)" value={whatIsIt} onChange={setWhatIsIt} onFocus={() => scrollToField("whatIsIt")} onLayout={registerOffset("whatIsIt")}/>

        <LabeledMultiline id="whyUseIt" label="Why use it? (optional)" value={whyUseIt} onChange={setWhyUseIt} onFocus={() => scrollToField("whyUseIt")} onLayout={registerOffset("whyUseIt")}/>

        <LabeledMultiline id="risks" label="Risks / interactions (optional)" value={risks} onChange={setRisks} onFocus={() => scrollToField("risks")} onLayout={registerOffset("risks")}/>

        <LabeledMultiline id="evidence" label="Evidence summary (optional)" value={evidence} onChange={setEvidence} onFocus={() => scrollToField("evidence")} onLayout={registerOffset("evidence")}/>

        <Pressable onPress={save} disabled={saving || !nameIsValid} style={{
            marginTop: spacing.lg,
            padding: spacing.md,
            borderRadius: 12,
            backgroundColor: colors.brand.primary,
            alignItems: "center",
            opacity: saving || !nameIsValid ? 0.6 : 1,
        }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>
            Save supplement
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>);
}
/* ---------- Small helpers ---------- */
function LabeledInput({ id, label, value, onChange, keyboardType, onFocus, onLayout, }) {
    return (<View style={{ marginBottom: spacing.md }} onLayout={onLayout}>
      <Text style={{ fontWeight: "600", marginBottom: 6 }}>{label}</Text>
      <TextInput nativeID={id} value={value} onChangeText={onChange} keyboardType={keyboardType} onFocus={onFocus} style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 10,
            padding: 12,
        }}/>
    </View>);
}
function LabeledMultiline({ id, label, value, onChange, onFocus, onLayout, }) {
    return (<View style={{ marginBottom: spacing.md }} onLayout={onLayout}>
      <Text style={{ fontWeight: "600", marginBottom: 6 }}>{label}</Text>
      <TextInput nativeID={id} value={value} onChangeText={onChange} multiline onFocus={onFocus} style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 10,
            padding: 12,
            minHeight: 80,
            textAlignVertical: "top",
        }}/>
    </View>);
}
