import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import { AppButton, AppHeader } from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import ExitIcon from "@/assets/icons/profile/exit.svg";
import { supabase } from "@src/lib/supabase";
import {
  clearLocalPersistedAppData,
  DELETE_ACCOUNT_FUNCTION_NAME,
  isLikelyEmail,
  loadCurrentAccountProfile,
  normalizeEmail,
  signOutAndClearLocalState,
} from "@src/lib/account";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function AccountField({
  label,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize = "sentences",
  autoComplete,
  textContentType,
  editable = true,
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldCard}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={textContentType}
          placeholder={label}
          placeholderTextColor={appTheme.colors.textMuted}
          style={[styles.fieldInput, !editable && styles.fieldInputDisabled]}
        />
      </View>
    </View>
  );
}

export default function AccountScreen() {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState({
    session: null,
    user: null,
    name: "",
    email: "",
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accountError, setAccountError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadAccount = async () => {
      setAccountError("");

      try {
        const nextAccount = await loadCurrentAccountProfile();
        if (!mounted) return;
        setAccount(nextAccount);
        setName(nextAccount.name || "");
        setEmail(nextAccount.email || "");
      } catch (error) {
        if (!mounted) return;
        setAccountError(
          error instanceof Error
            ? error.message
            : "Could not load account details."
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadAccount();

    return () => {
      mounted = false;
    };
  }, []);

  const trimmedName = useMemo(() => trimString(name), [name]);
  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const currentName = trimString(account.name);
  const currentEmail = normalizeEmail(account.email);
  const hasChanges =
    trimmedName !== currentName || normalizedEmail !== currentEmail;
  const nameError = !trimmedName ? "Name is required." : "";
  const emailError = !normalizedEmail
    ? "Email address is required."
    : !isLikelyEmail(normalizedEmail)
    ? "Enter a valid email address."
    : "";
  const canSave =
    !loading &&
    !savingProfile &&
    !signingOut &&
    !deletingAccount &&
    hasChanges &&
    !nameError &&
    !emailError;

  const handleSave = async () => {
    if (!account.user?.id) {
      setAccountError("You must be logged in to update your account.");
      return;
    }

    if (nameError || emailError) {
      setSaveMessage("");
      setAccountError(nameError || emailError);
      return;
    }

    if (!hasChanges) return;

    setAccountError("");
    setSaveMessage("");
    setSavingProfile(true);

    try {
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: account.user.id,
          name: trimmedName || null,
        },
        { onConflict: "id" }
      );

      if (profileError) {
        throw new Error(profileError.message || "Could not update your name.");
      }

      let updatedUser = account.user;
      if (trimmedName !== currentName || normalizedEmail !== currentEmail) {
        const authUpdatePayload = {
          data: {
            ...(account.user?.user_metadata ?? {}),
            full_name: trimmedName,
          },
        };

        if (normalizedEmail !== currentEmail) {
          authUpdatePayload.email = normalizedEmail;
        }

        const { data, error } = await supabase.auth.updateUser(
          authUpdatePayload
        );

        if (error) {
          throw new Error(
            error.message || "Could not update your account details."
          );
        }

        updatedUser = data?.user ?? updatedUser;
      }

      setAccount((current) => ({
        ...current,
        user: updatedUser,
        name: trimmedName,
        email: normalizedEmail,
      }));
      setName(trimmedName);
      setEmail(normalizedEmail);

      if (normalizedEmail !== currentEmail) {
        setSaveMessage(
          "Saved changes. Check your inbox to confirm your new email address."
        );
      } else {
        setSaveMessage("Saved changes.");
      }
    } catch (error) {
      setAccountError(
        error instanceof Error
          ? error.message
          : "Could not update your account. Please try again."
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut || deletingAccount) return;

    setAccountError("");
    setSaveMessage("");
    setSigningOut(true);

    try {
      await signOutAndClearLocalState();
    } catch (error) {
      setAccountError(
        error instanceof Error
          ? error.message
          : "Could not sign out. Please try again."
      );
    } finally {
      setSigningOut(false);
    }
  };

  const performDeleteAccount = async () => {
    if (deletingAccount || signingOut) return;

    setAccountError("");
    setSaveMessage("");
    setDeletingAccount(true);

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error("You must be logged in to delete your account.");
      }

      const { error: invokeError } = await supabase.functions.invoke(
        DELETE_ACCOUNT_FUNCTION_NAME,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (invokeError) {
        throw new Error(
          invokeError.message || "Could not delete your account."
        );
      }

      await signOutAndClearLocalState({
        preserveLoginGate: false,
        removeAccountScopedLocalData: true,
      }).catch(
        async (error) => {
        console.error("Failed to clear local auth session", error);
        await clearLocalPersistedAppData({
          removeAccountScopedLocalData: true,
          preserveSignupCompleted: false,
          accountScopedUserId: account.user?.id ?? null,
        });
        }
      );
      router.replace("/onboarding?mode=first_run");
    } catch (error) {
      setAccountError(
        error instanceof Error
          ? error.message
          : "Could not delete your account. Please try again."
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  const confirmDeleteAccount = () => {
    if (deletingAccount || signingOut) return;

    Alert.alert(
      "Delete account?",
      "This permanently removes your account and clears your device data in Suppro.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: deletingAccount ? "Deleting..." : "Delete account",
          style: "destructive",
          onPress: performDeleteAccount,
        },
      ]
    );
  };

  return (
    <BackdropScreen
      header={
        <AppHeader
          leftSlot={
            <AppButton
              onPress={() => router.back()}
              variant="overlay"
              size="icon"
              accessibilityLabel="Go back"
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={appTheme.colors.textStrong}
              />
            </AppButton>
          }
          title="ACCOUNT"
          titleStyle={styles.headerTitle}
          bottomSlot={
            <Text style={styles.headerSubtitle}>
              Update your profile details
            </Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
      contentStyle={styles.content}
      bottomInsetOffset={96}
      minBottomPadding={120}
    >
      <AccountField
        label="Name"
        value={name}
        onChangeText={(value) => {
          setName(value);
          setAccountError("");
          setSaveMessage("");
        }}
        textContentType="name"
        editable={!loading && !savingProfile}
      />

      <AccountField
        label="Email Address"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          setAccountError("");
          setSaveMessage("");
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        editable={!loading && !savingProfile}
      />

      {accountError ? (
        <Text style={styles.errorText}>{accountError}</Text>
      ) : null}
      {!accountError && saveMessage ? (
        <Text style={styles.successText}>{saveMessage}</Text>
      ) : null}

      <AppButton
        label={savingProfile ? "Saving..." : loading ? "Loading..." : "Save"}
        onPress={handleSave}
        disabled={!canSave}
        variant="accent"
        style={[styles.saveButton, !canSave && styles.disabledButton]}
        textStyle={styles.saveButtonText}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={handleSignOut}
        disabled={signingOut || deletingAccount}
        style={({ pressed }) => [
          styles.signOutRow,
          pressed && styles.rowPressed,
          (signingOut || deletingAccount) && styles.disabledRow,
        ]}
      >
        <View style={styles.signOutCopy}>
          <ExitIcon
            width={20}
            height={20}
            color={appTheme.colors.textStrong}
            fill={appTheme.colors.textStrong}
            stroke={appTheme.colors.textStrong}
            strokeWidth={0.6}
          />
          <Text style={styles.signOutText}>
            {signingOut ? "Signing out..." : "Sign out"}
          </Text>
        </View>

        <Ionicons
          name="chevron-forward"
          size={22}
          color={appTheme.colors.textStrong}
        />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete my account"
        onPress={confirmDeleteAccount}
        disabled={deletingAccount || signingOut}
        style={({ pressed }) => [
          styles.deleteButton,
          pressed && styles.rowPressed,
          (deletingAccount || signingOut) && styles.disabledRow,
        ]}
      >
        <Text style={styles.deleteText}>
          {deletingAccount ? "Deleting..." : "Delete my account"}
        </Text>
      </Pressable>
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  headerTitle: {
    color: appTheme.colors.textPrimary,
  },
  headerBottom: {
    marginTop: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  fieldCard: {
    minHeight: 64,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(32,33,36,0.14)",
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: "center",
  },
  fieldBlock: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  fieldInput: {
    fontSize: 17,
    lineHeight: 22,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
    paddingVertical: 0,
  },
  fieldInputDisabled: {
    color: appTheme.colors.textMuted,
  },
  errorText: {
    color: appTheme.colors.danger,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodyMedium,
  },
  successText: {
    color: appTheme.colors.successStrong,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodyMedium,
  },
  saveButton: {
    minHeight: 56,
    borderRadius: 20,
    marginTop: spacing.xs,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonText: {
    color: appTheme.colors.textStrong,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
  disabledButton: {
    opacity: 0.55,
  },
  signOutRow: {
    marginTop: spacing.xl,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  signOutCopy: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  signOutText: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textStrong,
  },
  deleteButton: {
    alignSelf: "flex-start",
    marginTop: spacing.md,
  },
  deleteText: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: "#E21D10",
  },
  rowPressed: {
    opacity: 0.72,
  },
  disabledRow: {
    opacity: 0.5,
  },
});
