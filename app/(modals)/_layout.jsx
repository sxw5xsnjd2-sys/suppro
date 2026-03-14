import { Stack } from "expo-router";
import { appTheme } from "@/theme";

export default function ModalsLayout() {
    return (<Stack screenOptions={{
        headerShown: false,
        presentation: "modal",
        contentStyle: { backgroundColor: appTheme.screen.background },
    }}>
      <Stack.Screen name="modal/supplement" options={{ presentation: "card" }}/>
      <Stack.Screen
        name="modal/add-supplement-catalog"
        options={{ contentStyle: { backgroundColor: appTheme.screen.background } }}
      />
    </Stack>);
}
