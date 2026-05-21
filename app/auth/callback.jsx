import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";

export default function AuthCallbackScreen() {
  useEffect(() => {
    const timeout = setTimeout(() => {
      router.replace("/login");
    }, 800);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ActivityIndicator />
      <Text style={styles.text}>Completing sign in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    gap: 12,
  },
  text: {
    color: "#6B5A6E",
    fontSize: 15,
  },
});
