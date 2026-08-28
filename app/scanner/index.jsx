import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { AppButton, PrimaryCard } from "@/components/common/ui";
import { useSubscriptionAccess } from "@/features/subscriptions/useSubscriptionAccess";
import { leaveScannerScreen } from "@/features/scanner/navigation";
import { buildScannedSupplementPayload } from "@/features/scanner/buildScannedSupplementPayload";
import {
  createScanRequestId,
  logScanTiming,
} from "@/features/scanner/scanTiming";
import { recordScanHistory } from "@/features/search/history";
import { appTheme, spacing, typography } from "@/theme";
import { useScannerStore } from "@/features/scanner/store";
import {
  isValidBarcode,
  normalizeBarcode,
} from "@src/data/getOpenFoodFactsProduct";
import {
  getScannerFailureCategory,
  SCANNER_FAILURE_CATEGORIES,
} from "@src/lib/scannerFailure";
import {
  createLatencyTrace,
  createLatencyTraceId,
  createLatencyStartMarker,
} from "@src/lib/latencyTelemetry";

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

const BARCODE_TYPES = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "code93",
];

function inferBarcodeType(text) {
  const digits = text.replace(/\D/g, "");
  if (/^\d{13}$/.test(digits)) return "ean13";
  if (/^\d{12}$/.test(digits)) return "upc_a";
  if (/^\d{8}$/.test(digits)) return "ean8";
  return "code128";
}

function buildScanNavigationDescriptor(scanState, scannerOrigin) {
  return {
    action: "push",
    pathname: "/modal/supplement-info",
    params: {
      source: "scanned",
      origin: scannerOrigin,
      scanSessionId: String(scanState.scanSessionId),
      scanRequestId: scanState.scanRequestId || undefined,
      latencyTraceId: scanState.latencyTraceId || undefined,
      name:
        scanState.product?.productName ||
        scanState.product?.name ||
        "Scanned supplement",
    },
  };
}

async function saveUsableScanHistory({
  scanState,
  expectedScanSessionId,
  navigationDescriptor,
}) {
  let overallProductEvidenceScore = null;
  const scanRequestId = scanState.scanRequestId;
  logScanTiming(scanRequestId, "background_scan_history_started", {
    blocksNavigation: false,
  });

  if (scanState.status === "success") {
    try {
      const payload = await buildScannedSupplementPayload(scanState);
      overallProductEvidenceScore = Number.isFinite(payload?.evidence_score)
        ? payload.evidence_score
        : null;
      logScanTiming(scanRequestId, "background_scan_score_calculated", {
        score: overallProductEvidenceScore,
      });
    } catch (error) {
      console.warn("Failed to calculate scan history evidence", error);
    }
  }

  await recordScanHistory({
    scanState,
    expectedScanSessionId,
    overallProductEvidenceScore,
    navigationDescriptor,
  });
  logScanTiming(scanRequestId, "background_scan_history_completed");
}

export default function ScannerScreen() {
  const {
    hasActiveAccess,
    isResolved,
    openSubscriptionPaywall,
    requireSubscriptionAccess,
  } = useSubscriptionAccess();
  const params = useLocalSearchParams();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [hasScanned, setHasScanned] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualBarcodeText, setManualBarcodeText] = useState("");
  const cameraRef = useRef(null);
  const hasRequestedRef = useRef(false);
  const hasScannedRef = useRef(false);
  const resetScan = useScannerStore((state) => state.resetScan);
  const processBarcode = useScannerStore((state) => state.processBarcode);
  const setPermissionState = useScannerStore(
    (state) => state.setPermissionState
  );
  const scannerStatus = useScannerStore((state) => state.status);
  const scanSessionId = useScannerStore((state) => state.scanSessionId);
  const scannerError = useScannerStore((state) => state.error);
  const sourceParam = Array.isArray(params.source)
    ? params.source[0]
    : params.source;
  const originParam = Array.isArray(params.origin)
    ? params.origin[0]
    : params.origin;
  const scannerOrigin =
    sourceParam === "onboarding" || originParam === "onboarding"
      ? "onboarding"
      : undefined;

  useEffect(() => {
    if (!isFocused) {
      setTorchEnabled(false);
      setManualEntryOpen(false);
      setManualBarcodeText("");
      return;
    }
    resetScan();
    setHasScanned(false);
    hasScannedRef.current = false;
  }, [isFocused, resetScan]);

  useEffect(() => {
    setPermissionState(permission);
  }, [permission, setPermissionState]);

  useEffect(() => {
    if (!cameraModuleError) return;
    console.warn(
      "[scanner] expo-camera native module is unavailable",
      cameraModuleError
    );
  }, []);

  useEffect(() => {
    if (hasActiveAccess || !isResolved) {
      return;
    }

    openSubscriptionPaywall({ replace: true });
  }, [hasActiveAccess, isResolved, openSubscriptionPaywall]);

  useEffect(() => {
    if (!isFocused || !permission || hasRequestedRef.current) return;
    if (permission.granted || permission.status !== "undetermined") return;

    hasRequestedRef.current = true;
    setIsRequestingPermission(true);
    Promise.resolve(requestPermission()).finally(() => {
      setIsRequestingPermission(false);
    });
  }, [isFocused, permission, requestPermission]);

  const permissionDenied = useMemo(() => {
    return (
      permission && !permission.granted && permission.status !== "undetermined"
    );
  }, [permission]);
  const isProcessingScan = hasScanned || scannerStatus === "processing";
  const showProductNotFoundPopup = scannerStatus === "not_found";
  const showScannerErrorPopup = scannerStatus === "error";
  const productNotFoundMessage =
    (typeof scannerError?.message === "string" &&
      scannerError.message.trim()) ||
    "Sorry, we couldn't find that product, please take pictures to add it to the app";
  const scannerErrorCategory = getScannerFailureCategory(scannerError);
  const scannerErrorMessage =
    (typeof scannerError?.message === "string" &&
      scannerError.message.trim()) ||
    "We couldn't connect, please try again.";
  const scannerErrorPrimaryLabel =
    scannerErrorCategory === SCANNER_FAILURE_CATEGORIES.authSessionRequired
      ? "Close"
      : "Rescan";

  const dismissProductNotFoundPopup = () => {
    resetScan();
    setHasScanned(false);
    hasScannedRef.current = false;
  };

  const dismissScannerErrorPopup = () => {
    resetScan();
    setHasScanned(false);
    hasScannedRef.current = false;
  };

  const handleTakePictures = () => {
    if (!requireSubscriptionAccess("photo_rescue")) {
      return;
    }

    if (!Number.isFinite(scanSessionId) || scanSessionId <= 0) {
      return;
    }

    router.push({
      pathname: "/photo-rescue",
      params: {
        entry: "scanner_not_found",
        scanSessionId: String(scanSessionId),
        origin: scannerOrigin,
        latencyTraceId: createLatencyTraceId("photo_improvement"),
        latencyStartedAt: String(createLatencyStartMarker()),
      },
    });
  };

  const handleManualBarcodeSubmit = async () => {
    if (!requireSubscriptionAccess("scanner")) {
      return;
    }

    const expectedScanSessionId =
      useScannerStore.getState().scanSessionId + 1;
    const scanRequestId = createScanRequestId(expectedScanSessionId);
    const latencyTrace = createLatencyTrace({
      traceId: createLatencyTraceId("barcode_scan"),
      flow: "barcode_scan",
      action: "resolve_unknown_barcode",
    });
    const finishAction = latencyTrace.start("client_scan_action_total");
    logScanTiming(scanRequestId, "barcode_detected", {
      detectionSource: "manual",
      rawBarcode: manualBarcodeText,
    });

    const raw = manualBarcodeText.trim().replace(/[\s-]/g, "");
    if (!raw) {
      finishAction({
        resultStatus: "invalid_barcode",
        success: false,
        errorCategory: "invalid_barcode",
      });
      return;
    }

    const barcodeType = inferBarcodeType(raw);

    const barcode = normalizeBarcode(raw, barcodeType);
    logScanTiming(scanRequestId, "barcode_normalized", {
      barcode,
      barcodeType,
    });
    if (!isValidBarcode(barcode, barcodeType)) {
      finishAction({
        resultStatus: "invalid_barcode",
        success: false,
        errorCategory: "invalid_barcode",
      });
      return;
    }

    Keyboard.dismiss();
    setManualEntryOpen(false);
    hasScannedRef.current = true;
    setHasScanned(true);
    await processBarcode(barcode, barcodeType, {
      latencyTraceId: latencyTrace.traceId,
      scanRequestId,
    });

    const finishClientProcessing = latencyTrace.start(
      "client_processing_after_resolution",
    );
    const nextScanState = useScannerStore.getState();
    const nextScanSessionId = nextScanState.scanSessionId;
    if (
      nextScanSessionId !== expectedScanSessionId ||
      !["success", "no_ingredients"].includes(nextScanState.status)
    ) {
      finishClientProcessing({
        resultStatus: nextScanState.status,
        success: nextScanState.status !== "error",
      });
      finishAction({
        resultStatus: nextScanState.status,
        success: ["success", "no_ingredients"].includes(nextScanState.status),
      });
      return;
    }

    const navigationDescriptor = buildScanNavigationDescriptor(
      nextScanState,
      scannerOrigin,
    );
    saveUsableScanHistory({
      scanState: nextScanState,
      expectedScanSessionId,
      navigationDescriptor,
    }).catch((error) => {
      console.error("Failed to save scan history", error);
    });
    logScanTiming(scanRequestId, "navigation_started", {
      pathname: navigationDescriptor.pathname,
    });
    router.push({
      pathname: navigationDescriptor.pathname,
      params: navigationDescriptor.params,
    });
    finishClientProcessing({
      resultStatus: nextScanState.status,
      success: true,
    });
    finishAction({ resultStatus: "navigated", success: true });
  };

  const handleBarcodeScanned = async (event) => {
    if (!requireSubscriptionAccess("scanner")) {
      return;
    }

    if (!isFocused || hasScannedRef.current || hasScanned) return;

    const expectedScanSessionId =
      useScannerStore.getState().scanSessionId + 1;
    const scanRequestId = createScanRequestId(expectedScanSessionId);
    const latencyTrace = createLatencyTrace({
      traceId: createLatencyTraceId("barcode_scan"),
      flow: "barcode_scan",
      action: "resolve_unknown_barcode",
    });
    const finishAction = latencyTrace.start("client_scan_action_total");
    const barcodeType = event?.type;
    logScanTiming(scanRequestId, "barcode_detected", {
      detectionSource: "camera",
      rawBarcode: event?.data,
      barcodeType,
    });
    const scannedBarcode = normalizeBarcode(event?.data, barcodeType);
    logScanTiming(scanRequestId, "barcode_normalized", {
      barcode: scannedBarcode,
      barcodeType,
    });

    if (!isValidBarcode(scannedBarcode, barcodeType)) {
      finishAction({
        resultStatus: "invalid_barcode",
        success: false,
        errorCategory: "invalid_barcode",
      });
      return;
    }

    hasScannedRef.current = true;
    setHasScanned(true);
    await processBarcode(scannedBarcode, barcodeType, {
      latencyTraceId: latencyTrace.traceId,
      scanRequestId,
    });

    const finishClientProcessing = latencyTrace.start(
      "client_processing_after_resolution",
    );
    const nextScanState = useScannerStore.getState();
    const nextScanSessionId = nextScanState.scanSessionId;

    if (
      nextScanSessionId !== expectedScanSessionId ||
      !["success", "no_ingredients"].includes(nextScanState.status)
    ) {
      finishClientProcessing({
        resultStatus: nextScanState.status,
        success: nextScanState.status !== "error",
      });
      finishAction({
        resultStatus: nextScanState.status,
        success: ["success", "no_ingredients"].includes(nextScanState.status),
      });
      return;
    }

    const navigationDescriptor = buildScanNavigationDescriptor(
      nextScanState,
      scannerOrigin,
    );
    saveUsableScanHistory({
      scanState: nextScanState,
      expectedScanSessionId,
      navigationDescriptor,
    }).catch((error) => {
      console.error("Failed to save scan history", error);
    });
    logScanTiming(scanRequestId, "navigation_started", {
      pathname: navigationDescriptor.pathname,
    });
    router.push({
      pathname: navigationDescriptor.pathname,
      params: navigationDescriptor.params,
    });
    finishClientProcessing({
      resultStatus: nextScanState.status,
      success: true,
    });
    finishAction({ resultStatus: "navigated", success: true });
  };

  const handleScannerCameraReady = () => {
    if (!isFocused || !isProcessingScan) return;

    const camera = cameraRef.current;
    Promise.resolve(camera?.pausePreview?.()).catch((error) => {
      console.warn("[scanner] failed to pause preview", error);
    });
  };

  if (!hasActiveAccess) {
    return <View style={styles.screen} />;
  }

  if (!CameraView) {
    return (
      <ScannerFallback
        title="Scanner unavailable"
        description="The camera module is not available in this build yet. Restart Expo from the suppro folder and rebuild the app after installing native modules."
        primaryLabel="Back"
        onPrimaryPress={leaveScannerScreen}
      />
    );
  }

  if (
    !permission ||
    isRequestingPermission ||
    permission.status === "undetermined" ||
    (permissionDenied && permission.canAskAgain)
  ) {
    return (
      <ScannerFallback
        title="Camera access needed"
        description="We use your camera to scan food barcodes and look up product ingredients."
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
      <ScannerFallback
        title="Camera access blocked"
        description="Camera access is turned off for Suppro. Open system settings to enable scanning."
        primaryLabel="Open settings"
        onPrimaryPress={() => Linking.openSettings()}
      />
    );
  }

  return (
    <View style={styles.screen}>
      {isFocused ? (
        <CameraView
          key={isProcessingScan ? "scanner-paused" : "scanner-live"}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
          enableTorch={torchEnabled}
          onCameraReady={handleScannerCameraReady}
          onBarcodeScanned={isProcessingScan ? undefined : handleBarcodeScanned}
        />
      ) : null}

      {isProcessingScan ? <View style={styles.captureFreezeOverlay} /> : null}

      <View style={styles.overlay}>
        <View style={styles.topBar}>
          <AppButton
            label="Close"
            variant="overlay"
            size="md"
            onPress={leaveScannerScreen}
            style={styles.closeButton}
            textStyle={styles.closeButtonText}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              torchEnabled ? "Turn torch off" : "Turn torch on"
            }
            onPress={() => setTorchEnabled((prev) => !prev)}
            style={({ pressed }) => [
              styles.torchButton,
              torchEnabled && styles.torchButtonActive,
              pressed && styles.torchButtonPressed,
            ]}
          >
            <Ionicons
              name={torchEnabled ? "flashlight" : "flashlight-outline"}
              size={20}
              color="#FFFFFF"
            />
          </Pressable>
        </View>

        <View style={styles.centerContent}>
          {!manualEntryOpen ? (
            <View
              style={[
                styles.scanFrame,
                isProcessingScan && styles.scanFrameProcessing,
              ]}
            />
          ) : null}
          {!manualEntryOpen ? (
            <Text style={styles.title}>Scan a barcode</Text>
          ) : null}
          <Text
            style={[
              styles.description,
              (isProcessingScan || manualEntryOpen) && styles.descriptionHidden,
            ]}
          >
            Center the barcode inside the frame. We&apos;ll do the rest.
          </Text>
        </View>
      </View>

      {!isProcessingScan &&
      !showProductNotFoundPopup &&
      !showScannerErrorPopup ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.manualEntryKAV}
        >
          {manualEntryOpen ? (
            <View style={styles.manualEntryRow}>
              <TextInput
                autoFocus
                style={styles.manualEntryInput}
                value={manualBarcodeText}
                onChangeText={setManualBarcodeText}
                placeholder="Enter barcode number"
                placeholderTextColor="rgba(255,255,255,0.45)"
                keyboardType="default"
                returnKeyType="go"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleManualBarcodeSubmit}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Submit barcode"
                onPress={handleManualBarcodeSubmit}
                style={({ pressed }) =>
                  pressed && styles.manualEntrySubmitPressed
                }
              >
                <Ionicons
                  name="arrow-forward-circle"
                  size={38}
                  color="#FFFFFF"
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close barcode entry"
                onPress={() => {
                  Keyboard.dismiss();
                  setManualEntryOpen(false);
                  setManualBarcodeText("");
                }}
                style={({ pressed }) =>
                  pressed && styles.manualEntrySubmitPressed
                }
              >
                <Ionicons
                  name="close-circle"
                  size={38}
                  color="rgba(255,255,255,0.6)"
                />
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setManualEntryOpen(true)}
              style={({ pressed }) => [
                styles.manualEntryPrompt,
                pressed && styles.manualEntryPromptPressed,
              ]}
            >
              <Text style={styles.manualEntryPromptText}>
                Can&apos;t scan the barcode? Enter it here
              </Text>
            </Pressable>
          )}
        </KeyboardAvoidingView>
      ) : null}

      {showProductNotFoundPopup ? (
        <View style={styles.notFoundPopupOverlay}>
          <PrimaryCard style={styles.notFoundPopupCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close product not found"
              hitSlop={8}
              onPress={dismissProductNotFoundPopup}
              style={({ pressed }) => [
                styles.notFoundCloseButton,
                pressed && styles.notFoundCloseButtonPressed,
              ]}
            >
              <Ionicons
                name="close"
                size={18}
                color={appTheme.colors.textStrong}
              />
            </Pressable>

            <View style={styles.notFoundPopupContent}>
              <Text style={styles.notFoundPopupMessage}>
                {productNotFoundMessage}
              </Text>
              <AppButton
                accessibilityLabel="Take pictures"
                variant="primary"
                onPress={handleTakePictures}
                contentStyle={styles.notFoundPrimaryButtonContent}
                style={styles.notFoundPrimaryButton}
              >
                <View style={styles.notFoundPrimaryButtonInner}>
                  <Ionicons
                    name="camera-outline"
                    size={18}
                    color="#FFFFFF"
                    style={styles.notFoundPrimaryButtonIcon}
                  />
                  <Text style={styles.notFoundPrimaryButtonText}>
                    Take pictures
                  </Text>
                </View>
              </AppButton>
            </View>
          </PrimaryCard>
        </View>
      ) : null}

      {showScannerErrorPopup ? (
        <View style={styles.notFoundPopupOverlay}>
          <PrimaryCard style={styles.notFoundPopupCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close scan error"
              hitSlop={8}
              onPress={dismissScannerErrorPopup}
              style={({ pressed }) => [
                styles.notFoundCloseButton,
                pressed && styles.notFoundCloseButtonPressed,
              ]}
            >
              <Ionicons
                name="close"
                size={18}
                color={appTheme.colors.textStrong}
              />
            </Pressable>

            <View style={styles.notFoundPopupContent}>
              <Text style={styles.notFoundPopupMessage}>
                {scannerErrorMessage}
              </Text>
              <AppButton
                accessibilityLabel={scannerErrorPrimaryLabel}
                variant="primary"
                onPress={dismissScannerErrorPopup}
                style={styles.notFoundPrimaryButton}
              >
                <Text style={styles.notFoundPrimaryButtonText}>
                  {scannerErrorPrimaryLabel}
                </Text>
              </AppButton>
            </View>
          </PrimaryCard>
        </View>
      ) : null}
    </View>
  );
}

function ScannerFallback({ title, description, primaryLabel, onPrimaryPress }) {
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
          <AppButton
            label="Back"
            variant="ghost"
            onPress={leaveScannerScreen}
          />
        </View>
      </PrimaryCard>
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
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(5,5,5,0.28)",
    paddingHorizontal: spacing.md,
  },
  captureFreezeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,5,5,0.18)",
  },
  topBar: {
    position: "absolute",
    top: spacing.xl * 1.6,
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  torchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  torchButtonActive: {
    backgroundColor: "rgba(255,220,0,0.35)",
  },
  torchButtonPressed: {
    opacity: 0.72,
  },
  closeButton: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  closeButtonText: {
    color: "#FFFFFF",
  },
  centerContent: {
    alignItems: "center",
    gap: spacing.md,
    width: "100%",
  },
  scanFrame: {
    width: 260,
    height: 180,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  scanFrameProcessing: {
    borderColor: "rgba(255,255,255,0.68)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  title: {
    fontSize: 30,
    fontFamily: typography.fontFamily.heading,
    color: "#FFFFFF",
    letterSpacing: -0.8,
  },
  manualEntryKAV: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  manualEntryPrompt: {
    alignSelf: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xl * 1.5,
  },
  manualEntryPromptPressed: {
    opacity: 0.65,
  },
  manualEntryPromptText: {
    fontSize: 14,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    textDecorationLine: "underline",
  },
  manualEntryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xl * 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  manualEntryInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: typography.fontFamily.body,
    color: "#FFFFFF",
    paddingVertical: 6,
  },
  manualEntrySubmitPressed: {
    opacity: 0.65,
  },
  description: {
    maxWidth: 320,
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(255,255,255,0.82)",
    fontFamily: typography.fontFamily.body,
  },
  descriptionHidden: {
    opacity: 0,
  },
  fallbackScreen: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    backgroundColor: appTheme.screen.background,
  },
  fallbackCard: {
    gap: spacing.md,
  },
  fallbackTitle: {
    fontSize: 28,
    color: appTheme.colors.textStrong,
    fontFamily: typography.fontFamily.heading,
    letterSpacing: -0.7,
  },
  fallbackDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: appTheme.colors.textBody,
    fontFamily: typography.fontFamily.body,
  },
  fallbackActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  notFoundPopupOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  notFoundPopupCard: {
    width: "100%",
    maxWidth: 440,
    minHeight: 360,
    alignSelf: "center",
    paddingHorizontal: 28,
    paddingTop: 44,
    paddingBottom: 40,
    borderRadius: 28,
    justifyContent: "center",
  },
  notFoundCloseButton: {
    position: "absolute",
    top: 18,
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F4F4",
    zIndex: 2,
  },
  notFoundCloseButtonPressed: {
    opacity: 0.72,
  },
  notFoundPopupContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  notFoundPopupMessage: {
    textAlign: "center",
    fontSize: 24,
    lineHeight: 32,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textPrimary,
  },
  notFoundPrimaryButton: {
    minWidth: 240,
    minHeight: 56,
  },
  notFoundPrimaryButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  notFoundPrimaryButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  notFoundPrimaryButtonIcon: {
    marginRight: 8,
  },
  notFoundPrimaryButtonText: {
    fontSize: 18,
    lineHeight: 22,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: "#FFFFFF",
  },
});
