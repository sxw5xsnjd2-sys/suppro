import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AppButton, PrimaryCard } from "@/components/common/ui";
import { leaveScannerScreen } from "@/features/scanner/navigation";
import { useSubscriptionAccess } from "@/features/subscriptions/useSubscriptionAccess";
import { useScannerStore } from "@/features/scanner/store";
import { appTheme, spacing, typography } from "@/theme";

const cameraModule = (() => {
  try {
    return require("expo-camera");
  } catch (error) {
    return { error };
  }
})();

const CameraView = cameraModule.CameraView ?? null;
const useCameraPermissions =
  cameraModule.useCameraPermissions ??
  (() => [
    {
      granted: false,
      status: "unavailable",
      canAskAgain: false,
    },
    async () => false,
  ]);
const cameraModuleError = cameraModule.error ?? null;

function normalizeIntegerParam(value) {
  if (Array.isArray(value)) {
    return normalizeIntegerParam(value[0]);
  }

  const parsed = Number.parseInt(
    typeof value === "string" ? value : String(value ?? ""),
    10
  );

  return Number.isFinite(parsed) ? parsed : null;
}

function buildPhotoDataUrl(photo) {
  const base64 =
    typeof photo?.base64 === "string" ? photo.base64.trim() : "";

  return base64 ? `data:image/jpeg;base64,${base64}` : "";
}

function goBackOrLeaveScanner() {
  if (typeof router.canGoBack === "function" && router.canGoBack()) {
    router.back();
    return;
  }

  leaveScannerScreen();
}

function PhotoRescueFallback({
  title,
  description,
  primaryLabel,
  onPrimaryPress,
}) {
  return (
    <View style={styles.fallbackScreen}>
      <PrimaryCard style={styles.fallbackCard}>
        <Text style={styles.fallbackTitle}>{title}</Text>
        <Text style={styles.fallbackDescription}>{description}</Text>
        <View style={styles.fallbackActions}>
          <AppButton
            label={primaryLabel}
            variant="primary"
            onPress={onPrimaryPress}
          />
          <AppButton label="Back" variant="ghost" onPress={goBackOrLeaveScanner} />
        </View>
      </PrimaryCard>
    </View>
  );
}

export default function ScannerPhotoRescueScreen() {
  const {
    hasActiveAccess,
    isResolved,
    openSubscriptionPaywall,
    requireSubscriptionAccess,
  } = useSubscriptionAccess();
  const params = useLocalSearchParams();
  const requestedScanSessionId = normalizeIntegerParam(params.scanSessionId);
  const [permission, requestPermission] = useCameraPermissions();
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [step, setStep] = useState("ingredients");
  const [ingredientsPhoto, setIngredientsPhoto] = useState("");
  const [captureError, setCaptureError] = useState("");
  const cameraRef = useRef(null);

  const [captureFlashVisible, setCaptureFlashVisible] = useState(false);
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const flashScale = useRef(new Animated.Value(0.85)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  const currentScanSessionId = useScannerStore((state) => state.scanSessionId);
  const photoRescueStatus = useScannerStore((state) => state.photoRescueStatus);
  const photoRescueError = useScannerStore((state) => state.photoRescueError);
  const enhanceScanWithPhotos = useScannerStore(
    (state) => state.enhanceScanWithPhotos
  );
  const resetPhotoRescueState = useScannerStore(
    (state) => state.resetPhotoRescueState
  );

  useEffect(() => {
    resetPhotoRescueState();
  }, [resetPhotoRescueState]);

  useEffect(() => {
    if (!cameraModuleError) return;
    console.warn(
      "[scanner-photo-rescue] expo-camera native module is unavailable",
      cameraModuleError
    );
  }, []);

  useEffect(() => {
    if (hasActiveAccess || !isResolved) {
      return;
    }

    openSubscriptionPaywall({ replace: true });
  }, [hasActiveAccess, isResolved, openSubscriptionPaywall]);

  const permissionDenied = useMemo(() => {
    return permission && !permission.granted && permission.status !== "undetermined";
  }, [permission]);

  const effectiveScanSessionId = Number.isFinite(requestedScanSessionId)
    ? requestedScanSessionId
    : currentScanSessionId;
  const isActiveSession =
    Number.isFinite(effectiveScanSessionId) &&
    effectiveScanSessionId === currentScanSessionId;
  const submitting = photoRescueStatus === "processing";
  const visibleError = photoRescueError || captureError;

  const stepLabel = step === "ingredients" ? "Step 1 of 2" : "Step 2 of 2";
  const stepTitle =
    step === "ingredients" ? "Capture the ingredients panel" : "Capture the product front";
  const stepDescription =
    step === "ingredients"
      ? "Fill the frame with the supplement facts or ingredients panel so we can extract the full stack."
      : "Now capture the front label or product name so we can identify the supplement correctly.";
  const captureLabel =
    step === "ingredients"
      ? "Capture ingredients photo"
      : "Capture product photo";

  const showCaptureFlash = (onDone) => {
    setCaptureFlashVisible(true);
    flashScale.setValue(0.85);
    flashOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(flashScale, { toValue: 1, friction: 6, useNativeDriver: true }),
      Animated.timing(flashOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.timing(flashOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
          setCaptureFlashVisible(false);
          onDone?.();
        });
      }, 700);
    });
  };

  const animateCaptureButton = () => {
    buttonScale.setValue(1);
    Animated.sequence([
      Animated.spring(buttonScale, { toValue: 0.88, friction: 8, useNativeDriver: true }),
      Animated.spring(buttonScale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
  };

  const restartFlow = () => {
    setStep("ingredients");
    setIngredientsPhoto("");
    setCaptureError("");
    resetPhotoRescueState();
  };

  const handleCapture = async () => {
    if (!requireSubscriptionAccess("photo_rescue")) {
      return;
    }

    if (submitting) return;

    setCaptureError("");
    animateCaptureButton();

    try {
      const photo = await cameraRef.current?.takePictureAsync({
        base64: true,
        quality: 0.35,
        skipProcessing: true,
      });

      const nextPhoto = buildPhotoDataUrl(photo);
      if (!nextPhoto) {
        throw new Error("We could not capture that photo. Please try again.");
      }

      if (step === "ingredients") {
        setIngredientsPhoto(nextPhoto);
        showCaptureFlash(() => setStep("product"));
        return;
      }

      await enhanceScanWithPhotos({
        scanSessionId: effectiveScanSessionId,
        ingredientsPhoto,
        productPhoto: nextPhoto,
      });

      router.back();
    } catch (error) {
      setCaptureError(
        error instanceof Error
          ? error.message
          : "We could not improve that scan with those photos."
      );
    }
  };

  if (!CameraView) {
    return (
      <PhotoRescueFallback
        title="Camera unavailable"
        description="Photo rescue needs camera support in this build. Restart Expo from the suppro folder and rebuild the app after installing native modules."
        primaryLabel="Back"
        onPrimaryPress={goBackOrLeaveScanner}
      />
    );
  }

  if (!isActiveSession) {
    return (
      <PhotoRescueFallback
        title="Scan expired"
        description="That barcode scan is no longer active. Go back, rescan the barcode, and try the photo rescue flow again."
        primaryLabel="Back"
        onPrimaryPress={goBackOrLeaveScanner}
      />
    );
  }

  if (
    !permission ||
    isRequestingPermission ||
    (permissionDenied && permission.canAskAgain)
  ) {
    return (
      <PhotoRescueFallback
        title="Camera access needed"
        description="We use your camera to capture the ingredient panel and front label for photo rescue."
        primaryLabel="Allow camera"
        onPrimaryPress={async () => {
          setIsRequestingPermission(true);
          try {
            await requestPermission();
          } finally {
            setIsRequestingPermission(false);
          }
        }}
      />
    );
  }

  if (permissionDenied && !permission.canAskAgain) {
    return (
      <PhotoRescueFallback
        title="Camera access blocked"
        description="Camera access is turned off for Suppro. Open system settings to capture ingredient photos."
        primaryLabel="Open settings"
        onPrimaryPress={() => Linking.openSettings()}
      />
    );
  }

  if (!hasActiveAccess) {
    return <View style={styles.screen} />;
  }

  return (
    <View style={styles.screen}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      <View style={styles.overlay}>
        <View style={styles.topBar}>
          <AppButton
            label="Cancel"
            variant="overlay"
            size="md"
            onPress={goBackOrLeaveScanner}
            style={styles.topButton}
            textStyle={styles.topButtonText}
          />
        </View>

        <View style={styles.centerContent}>
          <View style={[styles.stepPill, captureFlashVisible && styles.stepPillSuccess]}>
            <Text style={[styles.stepPillText, captureFlashVisible && styles.stepPillTextSuccess]}>
              {captureFlashVisible ? "✓ Step 1 done" : stepLabel}
            </Text>
          </View>
          <View style={[styles.captureFrame, captureFlashVisible && styles.captureFrameSuccess]}>
            {captureFlashVisible ? (
              <Animated.View
                style={[
                  styles.captureSuccessOverlay,
                  { opacity: flashOpacity, transform: [{ scale: flashScale }] },
                ]}
              >
                <Text style={styles.captureSuccessCheck}>✓</Text>
                <Text style={styles.captureSuccessLabel}>Ingredients captured</Text>
              </Animated.View>
            ) : null}
          </View>
          <Text style={styles.title}>{stepTitle}</Text>
          <Text style={styles.description}>{stepDescription}</Text>
        </View>

        <View style={styles.bottomBar}>
          {step === "product" ? (
            <AppButton
              label="Restart photos"
              variant="ghost"
              onPress={restartFlow}
              disabled={submitting}
              style={styles.restartButton}
              textStyle={styles.restartButtonText}
            />
          ) : (
            <View style={styles.restartSpacer} />
          )}

          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={captureLabel}
              onPress={handleCapture}
              disabled={submitting}
              style={({ pressed }) => [
                styles.captureButton,
                pressed && styles.captureButtonPressed,
                submitting && styles.captureButtonDisabled,
              ]}
            >
              <View style={styles.captureButtonInner} />
            </Pressable>
          </Animated.View>

          <View style={styles.restartSpacer} />
        </View>
      </View>

      {submitting ? (
        <View style={styles.feedbackOverlay}>
          <PrimaryCard style={styles.feedbackCard}>
            <ActivityIndicator color={appTheme.colors.textStrong} />
            <Text style={styles.feedbackTitle}>Improving scan...</Text>
            <Text style={styles.feedbackBody}>
              We&apos;re extracting the ingredient panel and product name from your
              photos now.
            </Text>
          </PrimaryCard>
        </View>
      ) : null}

      {visibleError ? (
        <View style={styles.feedbackOverlay}>
          <PrimaryCard style={styles.feedbackCard}>
            <Text style={styles.feedbackTitle}>Photo rescue failed</Text>
            <Text style={styles.feedbackBody}>{visibleError}</Text>
            <View style={styles.feedbackActions}>
              <AppButton
                label="Retake photos"
                variant="primary"
                onPress={restartFlow}
              />
              <AppButton
                label="Cancel"
                variant="ghost"
                onPress={goBackOrLeaveScanner}
              />
            </View>
          </PrimaryCard>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#050505",
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
    backgroundColor: "rgba(5,5,5,0.28)",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl * 1.4,
    paddingBottom: spacing.xl,
  },
  topBar: {
    alignItems: "flex-start",
  },
  topButton: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  topButtonText: {
    color: "#FFFFFF",
  },
  centerContent: {
    alignItems: "center",
    gap: spacing.md,
  },
  stepPill: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stepPillText: {
    fontSize: 12,
    lineHeight: 14,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: "#FFFFFF",
  },
  captureFrame: {
    width: 286,
    height: 360,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  captureFrameSuccess: {
    borderColor: "#4ADE80",
    borderWidth: 3,
    backgroundColor: "rgba(74,222,128,0.08)",
  },
  captureSuccessOverlay: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  captureSuccessCheck: {
    fontSize: 72,
    lineHeight: 80,
    color: "#4ADE80",
    fontFamily: typography.fontFamily.heading,
  },
  captureSuccessLabel: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: "#FFFFFF",
    textAlign: "center",
  },
  stepPillSuccess: {
    backgroundColor: "rgba(74,222,128,0.25)",
  },
  stepPillTextSuccess: {
    color: "#4ADE80",
  },
  title: {
    textAlign: "center",
    fontSize: 28,
    lineHeight: 32,
    fontFamily: typography.fontFamily.heading,
    color: "#FFFFFF",
    letterSpacing: -0.8,
  },
  description: {
    textAlign: "center",
    maxWidth: 320,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typography.fontFamily.body,
    color: "rgba(255,255,255,0.82)",
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  restartButton: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  restartButtonText: {
    color: "#FFFFFF",
  },
  restartSpacer: {
    width: 108,
  },
  captureButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  captureButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "#FFFFFF",
  },
  feedbackOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    backgroundColor: "rgba(5,5,5,0.42)",
  },
  feedbackCard: {
    width: "100%",
    maxWidth: 360,
    gap: 14,
    paddingVertical: 20,
    paddingHorizontal: 18,
  },
  feedbackTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  feedbackBody: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  feedbackActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  fallbackScreen: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    backgroundColor: appTheme.screen.background,
  },
  fallbackCard: {
    gap: spacing.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  fallbackTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontFamily: typography.fontFamily.heading,
    color: appTheme.colors.textStrong,
  },
  fallbackDescription: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  fallbackActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
});
