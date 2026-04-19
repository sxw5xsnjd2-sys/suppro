import { router } from "expo-router";

function goBack() {
  if (typeof router.canGoBack === "function" && router.canGoBack()) {
    router.back();
    return true;
  }

  return false;
}

export function leaveScannerScreen() {
  if (goBack()) {
    return;
  }

  router.replace("/");
}

export function leaveTopLevelScanModal() {
  if (!goBack()) {
    router.replace("/");
    return;
  }

  requestAnimationFrame(() => {
    if (goBack()) {
      return;
    }

    router.replace("/");
  });
}
