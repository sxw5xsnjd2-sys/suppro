import { useRef, useState } from "react";
import {
  Text,
  TextInput,
  Pressable,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import { spacing, radius, shadows, appTheme } from "@/theme";
import { getScopedSupabase } from "@src/lib/supabase";
import { getClientId } from "@src/lib/clientId";

export default function AddSupplementCatalogModal() {
  const params = useLocalSearchParams();
  const initialName =
    typeof params.initialName === "string" ? params.initialName : "";
  const searchMode = typeof params.mode === "string" ? params.mode : "info";
  const [name, setName] = useState(initialName);
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
    if (y == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  };

  const save = async () => {
    if (!nameIsValid) return;

    setSaving(true);
    const [supabase, clientId] = await Promise.all([getScopedSupabase(), getClientId()]);

    const { data, error } = await supabase
      .from("user_supplements")
      .insert({
        client_id: clientId,
        name: name.trim(),
        what_is_it: sanitizedText(whatIsIt),
        why_use_it: sanitizedText(whyUseIt),
        risks_and_interactions: sanitizedText(risks),
        evidence_summary: sanitizedText(evidence),
      })
      .select("id, name")
      .single();

    if (error) {
      if (error.code === "23505") {
        alert("This supplement already exists in the catalog.");
        setSaving(false);
        return;
      }
      console.error(error);
      setSaving(false);
      return;
    }

    router.navigate({
      pathname: "/supplement-search",
      params: {
        mode: searchMode,
        newCatalogId: `user-${data.id}`,
        newCatalogName: data.name,
      },
    });

    setSaving(false);
  };

  return (
    <BackdropScreen
      scrollable={false}
      bottomInsetOffset={0}
      minBottomPadding={0}
      contentStyle={styles.screenContent}
    >
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 48 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Add New Supplement</Text>

          <View style={styles.panel}>
            <LabeledInput
              id="name"
              label="Name *"
              value={name}
              onChange={setName}
              onFocus={() => scrollToField("name")}
              onLayout={registerOffset("name")}
            />

            <LabeledMultiline
              id="whatIsIt"
              label="What is it? (optional)"
              value={whatIsIt}
              onChange={setWhatIsIt}
              onFocus={() => scrollToField("whatIsIt")}
              onLayout={registerOffset("whatIsIt")}
            />

            <LabeledMultiline
              id="whyUseIt"
              label="Why use it? (optional)"
              value={whyUseIt}
              onChange={setWhyUseIt}
              onFocus={() => scrollToField("whyUseIt")}
              onLayout={registerOffset("whyUseIt")}
            />

            <LabeledMultiline
              id="risks"
              label="Risks / interactions (optional)"
              value={risks}
              onChange={setRisks}
              onFocus={() => scrollToField("risks")}
              onLayout={registerOffset("risks")}
            />

            <LabeledMultiline
              id="evidence"
              label="Evidence summary (optional)"
              value={evidence}
              onChange={setEvidence}
              onFocus={() => scrollToField("evidence")}
              onLayout={registerOffset("evidence")}
            />

            <Pressable
              onPress={save}
              disabled={saving || !nameIsValid}
              style={[
                styles.saveButton,
                (saving || !nameIsValid) && styles.saveButtonDisabled,
              ]}
            >
              <Text style={styles.saveText}>
                {saving ? "Saving..." : "Save supplement"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BackdropScreen>
  );
}

function LabeledInput({ id, label, value, onChange, keyboardType, onFocus, onLayout }) {
  return (
    <View style={styles.field} onLayout={onLayout}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        nativeID={id}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        onFocus={onFocus}
        style={styles.input}
        placeholderTextColor={appTheme.colors.textMuted}
      />
    </View>
  );
}

function LabeledMultiline({ id, label, value, onChange, onFocus, onLayout }) {
  return (
    <View style={styles.field} onLayout={onLayout}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        nativeID={id}
        value={value}
        onChangeText={onChange}
        multiline
        onFocus={onFocus}
        style={[styles.input, styles.multiline]}
        placeholderTextColor={appTheme.colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    paddingTop: spacing.sm,
  },
  keyboard: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingBottom: spacing.xl * 2,
    paddingTop: spacing.xs,
    gap: spacing.md,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: appTheme.colors.textStrong,
  },
  panel: {
    backgroundColor: "rgba(255,255,255,0.78)",
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    ...shadows.card,
  },
  field: {
    marginBottom: spacing.md,
  },
  label: {
    fontWeight: "600",
    marginBottom: 6,
    color: appTheme.colors.textBody,
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    borderRadius: radius.md,
    padding: 12,
    color: appTheme.colors.textInput,
    backgroundColor: "rgba(255,255,255,0.72)",
    fontSize: 15,
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  saveButton: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: appTheme.colors.textStrong,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
});
