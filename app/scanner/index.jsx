import React, { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { AppButton, PrimaryCard } from "@/components/common/ui";
import { leaveScannerScreen } from "@/features/scanner/navigation";
import { appTheme, spacing, typography } from "@/theme";
import { useScannerStore } from "@/features/scanner/store";
import {
  isValidBarcode,
  normalizeBarcode,
} from "@src/data/getOpenFoodFactsProduct";

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

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128"];

export default function ScannerScreen() {
  const params = useLocalSearchParams();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [hasScanned, setHasScanned] = useState(false);
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
    if (!isFocused) return;
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
    if (!isFocused || !permission || hasRequestedRef.current) return;
    if (permission.granted || permission.status !== "undetermined") return;

    hasRequestedRef.current = true;
    requestPermission();
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
  const scannerErrorMessage = "We couldn't connect, please try again";

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
    if (!Number.isFinite(scanSessionId) || scanSessionId <= 0) {
      return;
    }

    router.push({
      pathname: "/scanner/photo-rescue",
      params: {
        scanSessionId: String(scanSessionId),
        origin: scannerOrigin,
      },
    });
  };

  const handleBarcodeScanned = async (event) => {
    if (!isFocused || hasScannedRef.current || hasScanned) return;

    const scannedBarcode = normalizeBarcode(event?.data);

    if (!isValidBarcode(scannedBarcode)) {
      return;
    }

    hasScannedRef.current = true;
    setHasScanned(true);
    await processBarcode(scannedBarcode);

    const nextScanState = useScannerStore.getState();
    const nextScanSessionId = nextScanState.scanSessionId;

    if (!Number.isFinite(nextScanSessionId) || nextScanSessionId <= 0) {
      return;
    }

    if (
      nextScanState.status === "not_found" ||
      nextScanState.status === "error"
    ) {
      return;
    }

    router.push({
      pathname: "/modal/supplement-info",
      params: {
        source: "scanned",
        origin: scannerOrigin,
        scanSessionId: String(nextScanSessionId),
        name:
          nextScanState.product?.productName ||
          nextScanState.product?.name ||
          "Scanned supplement",
      },
    });
  };

  useEffect(() => {
    const camera = cameraRef.current;

    if (!camera || !isFocused) {
      return;
    }

    if (isProcessingScan) {
      Promise.resolve(camera.pausePreview?.()).catch((error) => {
        console.warn("[scanner] failed to pause preview", error);
      });
      return;
    }

    Promise.resolve(camera.resumePreview?.()).catch((error) => {
      console.warn("[scanner] failed to resume preview", error);
    });
  }, [isFocused, isProcessingScan]);

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
    permission.status === "undetermined" ||
    (permissionDenied && permission.canAskAgain)
  ) {
    return (
      <ScannerFallback
        title="Camera access needed"
        description="We use your camera to scan food barcodes and look up product ingredients."
        primaryLabel="Allow camera"
        onPrimaryPress={requestPermission}
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
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
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
        </View>

        <View style={styles.centerContent}>
          <View
            style={[
              styles.scanFrame,
              isProcessingScan && styles.scanFrameProcessing,
            ]}
          />
          <Text style={styles.title}>Scan a barcode</Text>
          <Text
            style={[
              styles.description,
              isProcessingScan && styles.descriptionHidden,
            ]}
          >
            Center the barcode inside the frame. We&apos;ll do the rest.
          </Text>
        </View>
      </View>

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
                accessibilityLabel="Rescan"
                variant="primary"
                onPress={dismissScannerErrorPopup}
                style={styles.notFoundPrimaryButton}
              >
                <Text style={styles.notFoundPrimaryButtonText}>Rescan</Text>
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
    alignItems: "flex-start",
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
