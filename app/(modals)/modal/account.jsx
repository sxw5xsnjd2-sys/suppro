import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppFormField,
  AppHeader,
  AppSectionCard,
  AppTextInput,
} from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import ExitIcon from "@/assets/icons/profile/exit.svg";
import { supabase } from "@src/lib/supabase";
import {
  clearLocalPersistedAppData,
  DELETE_ACCOUNT_FUNCTION_NAME,
  loadCurrentAccountProfile,
} from "@src/lib/account";

function providerLabel(provider) {
  if (provider === "email") return "Email login";
  if (provider === "apple") return "Apple login";
  return "Authenticated";
}

export default function AccountScreen() {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState({
    name: "",
    email: "",
    provider: null,
    canChangePassword: false,
  });
  const [accountError, setAccountError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadAccount = async () => {
      setAccountError("");

      try {
        const nextAccount = await loadCurrentAccountProfile();
        if (mounted) {
          setAccount(nextAccount);
        }
      } catch (error) {
        if (mounted) {
          setAccountError(
            error instanceof Error
              ? error.message
              : "Could not load account details."
          );
        }
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

  const passwordValidationError = useMemo(() => {
    if (!newPassword && !confirmPassword) return "";
    if (newPassword.length < 6) {
      return "Password must be at least 6 characters.";
    }
    if (newPassword !== confirmPassword) {
      return "Passwords do not match.";
    }
    return "";
  }, [confirmPassword, newPassword]);

  const canSubmitPassword =
    account.canChangePassword &&
    !savingPassword &&
    Boolean(newPassword) &&
    Boolean(confirmPassword) &&
    !passwordValidationError;

  const handlePasswordUpdate = async () => {
    if (!canSubmitPassword) return;

    setPasswordError("");
    setPasswordSuccess("");
    setSavingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw new Error(error.message || "Could not update password.");
      }

      setPasswordSuccess("Password updated.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPasswordError(
        error instanceof Error
          ? error.message
          : "Could not update password. Please try again."
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut || deletingAccount) return;

    setAccountError("");
    setSigningOut(true);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw new Error(error.message || "Could not sign out.");
      }

      router.replace("/login");
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

      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        console.error("Failed to clear local auth session", signOutError);
      }

      await clearLocalPersistedAppData();
      router.dismissAll();
      router.replace("/");
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

  const profileName = account.name || "Not provided";
  const profileEmail = account.email || "Not available";

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
              Profile, access, and account actions
            </Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
      bottomInsetOffset={96}
      minBottomPadding={120}
    >
      <AppSectionCard title="Profile">
        <AppFormField label="Name" style={styles.readOnlyField}>
          <AppTextInput value={profileName} editable={false} />
        </AppFormField>
        <AppFormField
          label="Email"
          helperText={
            loading
              ? "Loading account details..."
              : providerLabel(account.provider)
          }
          style={styles.readOnlyField}
        >
          <AppTextInput value={profileEmail} editable={false} />
        </AppFormField>
        {accountError ? (
          <Text style={styles.errorText}>{accountError}</Text>
        ) : null}

        <View style={styles.profileActions}>
          <AppButton
            onPress={handleSignOut}
            disabled={signingOut || deletingAccount}
            variant="primary"
            style={[
              styles.actionButton,
              (signingOut || deletingAccount) && styles.actionButtonDisabled,
            ]}
            accessibilityLabel="Sign out"
            contentStyle={styles.actionButtonContent}
          >
            <ExitIcon
              width={16}
              height={16}
              color="#FFFFFF"
              fill="#FFFFFF"
              stroke="#FFFFFF"
              strokeWidth={0.6}
            />
            <Text style={styles.actionButtonText}>
              {signingOut ? "Signing out..." : "Sign out"}
            </Text>
          </AppButton>

          <AppButton
            label={deletingAccount ? "Deleting..." : "Delete my account"}
            onPress={confirmDeleteAccount}
            disabled={deletingAccount || signingOut}
            variant="danger"
            style={[
              styles.actionButton,
              (deletingAccount || signingOut) && styles.actionButtonDisabled,
            ]}
          />
        </View>
      </AppSectionCard>

      {account.canChangePassword ? (
        <AppSectionCard
          title="Change password"
          subtitle="Available for email-password accounts only."
        >
          <AppFormField label="New password" style={styles.field}>
            <AppTextInput
              value={newPassword}
              onChangeText={(value) => {
                setPasswordSuccess("");
                setPasswordError("");
                setNewPassword(value);
              }}
              placeholder="At least 6 characters"
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
              autoComplete="password-new"
              accessibilityLabel="New password"
            />
          </AppFormField>
          <AppFormField
            label="Confirm new password"
            style={styles.field}
            errorText={passwordError || passwordValidationError || ""}
            helperText={passwordSuccess || ""}
            helperTextStyle={styles.successText}
          >
            <AppTextInput
              value={confirmPassword}
              onChangeText={(value) => {
                setPasswordSuccess("");
                setPasswordError("");
                setConfirmPassword(value);
              }}
              placeholder="Repeat password"
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
              autoComplete="password-new"
              accessibilityLabel="Confirm new password"
            />
          </AppFormField>
          <AppButton
            label={savingPassword ? "Saving..." : "Update password"}
            onPress={handlePasswordUpdate}
            disabled={!canSubmitPassword}
            variant="primary"
            style={[
              styles.actionButton,
              !canSubmitPassword && styles.actionButtonDisabled,
            ]}
          />
        </AppSectionCard>
      ) : null}
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
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
  readOnlyField: {
    marginBottom: spacing.md,
  },
  profileActions: {
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  field: {
    marginBottom: spacing.sm,
  },
  actionButton: {
    width: "100%",
    marginTop: spacing.xs,
    minHeight: 52,
  },
  actionButtonContent: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    marginTop: spacing.xs,
    color: appTheme.colors.danger,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodyMedium,
  },
  successText: {
    color: appTheme.colors.successStrong,
  },
});
