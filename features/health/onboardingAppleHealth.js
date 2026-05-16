import { Platform } from "react-native";
import {
  isAppleHealthAvailable,
  requestAppleHealthPermissions,
} from "./appleHealth";

export async function requestOnboardingAppleHealthPermissions() {
  if (Platform.OS !== "ios") {
    return false;
  }

  const available = await isAppleHealthAvailable().catch(() => false);
  if (!available) {
    return false;
  }

  await requestAppleHealthPermissions();
  return true;
}
