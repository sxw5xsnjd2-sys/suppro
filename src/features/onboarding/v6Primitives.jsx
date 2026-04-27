import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, {
  Circle,
  Ellipse,
  G,
  Line,
  Path,
  Rect,
} from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { appTheme, typography } from "@/theme";

export const onboardingV6 = {
  paper: "#FFFFFF",
  surface: "#FFFFFF",
  ink: "#1F1428",
  muted: "#6B5A6E",
  faint: "#A29A9D",
  primaryDk: "#2E1A52",
  accentA: "#E5E1F9",
  accentB: "#F6E2E1",
  accentScanB: "#F4DDE5",
  softer: "#F4EFFA",
  border: "#EAE6F0",
  warnBg: "#FBE7DC",
  warnInk: "#6B3722",
  danger: "#C95757",
  sidePadding: 24,
};

export function OnboardingShell({
  children,
  progress = 0,
  showTopBar = true,
  showBack = true,
  onBack,
  footer,
  scrollable = true,
  keyboardShouldPersistTaps = "handled",
  contentContainerStyle,
}) {
  const insets = useSafeAreaInsets();
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const bodyTopPadding = showTopBar ? 18 : 0;
  const footerBottomPadding = Math.max(insets.bottom + 16, 32);

  return (
    <View style={styles.screen}>
      {showTopBar ? (
        <View
          style={[
            styles.topBar,
            { paddingTop: Math.max(insets.top + 8, 20) },
          ]}
        >
          {showBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={onBack}
              hitSlop={12}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={onboardingV6.ink}
              />
            </Pressable>
          ) : (
            <View style={styles.backButtonSpacer} />
          )}

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.max(2, clampedProgress * 100)}%` },
              ]}
            />
          </View>
          <View style={styles.progressEndSpacer} />
        </View>
      ) : (
        <View style={{ height: Math.max(insets.top, 10) }} />
      )}

      {scrollable ? (
        <ScrollView
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: bodyTopPadding },
            contentContainerStyle,
          ]}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.staticContent,
            { paddingTop: bodyTopPadding },
            contentContainerStyle,
          ]}
        >
          {children}
        </View>
      )}

      {footer ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: footerBottomPadding },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function QuestionHero({ title, subtitle, centered = false, children }) {
  return (
    <View style={[styles.hero, centered && styles.heroCentered]}>
      {children ? <View style={styles.heroGlyph}>{children}</View> : null}
      <Text style={[styles.heroTitle, centered && styles.centerText]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.heroSubtitle, centered && styles.centerText]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function OnboardingCTA({ label, onPress, disabled = false, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.ctaShell,
        disabled && styles.disabled,
        pressed && !disabled && styles.ctaPressed,
        style,
      ]}
    >
      <LinearGradient
        colors={[onboardingV6.accentA, onboardingV6.accentB]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.ctaGradient}
      >
        <Text style={styles.ctaText}>{label}</Text>
        <Svg width={18} height={14} viewBox="0 0 18 14" fill="none">
          <Path
            d="M1 7H16M11 1L17 7L11 13"
            stroke={onboardingV6.ink}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </LinearGradient>
    </Pressable>
  );
}

export function GhostButton({ label, onPress, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.ghostButton,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={styles.ghostButtonText}>{label}</Text>
    </Pressable>
  );
}

function CheckMark({ color = "#FFFFFF", width = 14, height = 11 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 14 11" fill="none">
      <Path
        d="M1 5.5L5 9.5L13 1.5"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function OptionRow({ label, description, selected, onPress, style }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        description && styles.optionRowTall,
        selected && styles.selectedBorder,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? (
          <Text style={styles.rowDescription}>{description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function CheckRow({ label, selected, onPress, style, description }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        description && styles.optionRowTall,
        selected && styles.selectedBorder,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected ? <CheckMark /> : null}
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? (
          <Text style={styles.rowDescription}>{description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function ChipPill({ label, selected, onPress, disabled = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
      {selected ? (
        <View style={styles.chipBadge}>
          <CheckMark width={9} height={7} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function PictoCard({ label, selected, onPress, children }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pictoCard,
        selected && styles.pictoCardSelected,
        pressed && styles.pressed,
      ]}
    >
      {selected ? (
        <View style={styles.pictoBadge}>
          <CheckMark width={10} height={8} />
        </View>
      ) : null}
      <View style={styles.pictoGlyph}>{children}</View>
      <Text style={[styles.pictoLabel, selected && styles.pictoLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function WarningBanner({ children }) {
  return (
    <View style={styles.banner}>
      <View style={styles.bannerIcon}>
        <Text style={styles.bannerIconText}>i</Text>
      </View>
      <Text style={styles.bannerText}>{children}</Text>
    </View>
  );
}

export function SectionEyebrow({ children, style }) {
  return <Text style={[styles.eyebrow, style]}>{children}</Text>;
}

export function GlyphPerson() {
  return (
    <Svg width={120} height={130} viewBox="0 0 120 130" fill="none">
      <Ellipse
        cx={60}
        cy={38}
        rx={22}
        ry={23}
        stroke={onboardingV6.ink}
        strokeWidth={2.4}
      />
      <Path
        d="M65 18C68 20 72 25 72 32M70 22C72 26 73 30 73 34M74 28C75 32 75 36 75 39"
        stroke={onboardingV6.ink}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Path
        d="M16 116C16 88 32 70 60 70C88 70 104 88 104 116"
        stroke={onboardingV6.ink}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <Path
        d="M80 80L80 110M86 84L86 110M92 90L92 110M98 98L98 110"
        stroke={onboardingV6.ink}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function GlyphPills({ size = 110 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 110 110" fill="none">
      <G rotation={-22} origin="55,55">
        <Rect
          x={20}
          y={42}
          width={70}
          height={26}
          rx={13}
          stroke={onboardingV6.ink}
          strokeWidth={2.4}
        />
        <Line
          x1={55}
          y1={42}
          x2={55}
          y2={68}
          stroke={onboardingV6.ink}
          strokeWidth={2.4}
        />
        <Path
          d="M60 48L60 62M66 48L66 62M72 48L72 62M78 48L78 62M84 48L84 62"
          stroke={onboardingV6.ink}
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

export function GlyphHeart() {
  return (
    <Svg width={100} height={92} viewBox="0 0 100 92" fill="none">
      <Path
        d="M50 80C22 60 8 42 8 26C8 14 18 6 30 6C38 6 46 12 50 22C54 12 62 6 70 6C82 6 92 14 92 26C92 42 78 60 50 80Z"
        stroke={onboardingV6.ink}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <Path
        d="M24 22C22 26 22 32 24 36"
        stroke={onboardingV6.ink}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function FormGlyph({ type }) {
  const stroke = onboardingV6.ink;

  if (type === "capsule") {
    return (
      <Svg width={50} height={44} viewBox="0 0 50 44" fill="none">
        <G rotation={-25} origin="25,22">
          <Rect x={6} y={14} width={38} height={16} rx={8} stroke={stroke} strokeWidth={2} />
          <Path d="M25 14V30" stroke={stroke} strokeWidth={2} />
        </G>
      </Svg>
    );
  }

  if (type === "gummy") {
    return (
      <Svg width={48} height={44} viewBox="0 0 48 44" fill="none">
        <Path
          d="M24 6C12 6 6 16 6 24C6 32 12 38 24 38C36 38 42 32 42 24C42 16 36 6 24 6Z"
          stroke={stroke}
          strokeWidth={2}
        />
        <Circle cx={18} cy={20} r={1.6} fill={stroke} />
        <Circle cx={28} cy={22} r={1.6} fill={stroke} />
      </Svg>
    );
  }

  if (type === "powder") {
    return (
      <Svg width={48} height={44} viewBox="0 0 48 44" fill="none">
        <Rect x={10} y={14} width={28} height={22} rx={2} stroke={stroke} strokeWidth={2} />
        <Path d="M14 14V8H34V14" stroke={stroke} strokeWidth={2} />
        <Path d="M16 22H32M16 28H32" stroke={stroke} strokeWidth={1.4} />
      </Svg>
    );
  }

  if (type === "liquid") {
    return (
      <Svg width={40} height={44} viewBox="0 0 40 44" fill="none">
        <Path
          d="M14 6H26V16L32 30C32 36 26 40 20 40C14 40 8 36 8 30L14 16Z"
          stroke={stroke}
          strokeWidth={2}
        />
        <Path d="M16 28C18 30 22 30 24 28" stroke={stroke} strokeWidth={1.6} />
      </Svg>
    );
  }

  if (type === "tincture") {
    return (
      <Svg width={32} height={44} viewBox="0 0 32 44" fill="none">
        <Rect x={10} y={6} width={12} height={6} stroke={stroke} strokeWidth={2} />
        <Rect x={6} y={12} width={20} height={26} rx={3} stroke={stroke} strokeWidth={2} />
        <Path d="M12 22H20M12 28H20" stroke={stroke} strokeWidth={1.4} />
      </Svg>
    );
  }

  return (
    <Svg width={44} height={44} viewBox="0 0 44 44" fill="none">
      <Ellipse cx={22} cy={22} rx={9} ry={14} stroke={stroke} strokeWidth={2} />
      <Path d="M22 8V36" stroke={stroke} strokeWidth={2} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: onboardingV6.paper,
  },
  topBar: {
    paddingHorizontal: onboardingV6.sidePadding,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  backButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonSpacer: {
    width: 24,
    height: 24,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: onboardingV6.softer,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: onboardingV6.primaryDk,
  },
  progressEndSpacer: {
    width: 8,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  staticContent: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: onboardingV6.sidePadding,
    paddingTop: 12,
    backgroundColor: onboardingV6.paper,
  },
  hero: {
    paddingHorizontal: onboardingV6.sidePadding,
  },
  heroCentered: {
    alignItems: "center",
  },
  heroGlyph: {
    marginBottom: 28,
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
    fontFamily: typography.fontFamily.heading,
    color: onboardingV6.ink,
  },
  heroSubtitle: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typography.fontFamily.body,
    color: onboardingV6.muted,
  },
  centerText: {
    textAlign: "center",
  },
  ctaShell: {
    height: 54,
    borderRadius: 14,
    shadowColor: "#5C3FA8",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 5,
  },
  ctaGradient: {
    flex: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.6)",
  },
  ctaText: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodyBold,
    color: onboardingV6.ink,
  },
  ctaPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.86,
  },
  disabled: {
    opacity: 0.35,
  },
  ghostButton: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: onboardingV6.border,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: onboardingV6.muted,
  },
  optionRow: {
    minHeight: 60,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: onboardingV6.border,
    backgroundColor: onboardingV6.surface,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  optionRowTall: {
    minHeight: 76,
    alignItems: "flex-start",
    paddingTop: 14,
    paddingBottom: 14,
  },
  selectedBorder: {
    borderWidth: 1.5,
    borderColor: onboardingV6.primaryDk,
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: onboardingV6.softer,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    backgroundColor: onboardingV6.primaryDk,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: onboardingV6.surface,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: onboardingV6.softer,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: onboardingV6.primaryDk,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontSize: 15.5,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: onboardingV6.ink,
  },
  rowDescription: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: onboardingV6.muted,
  },
  chip: {
    minHeight: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: onboardingV6.border,
    backgroundColor: onboardingV6.softer,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chipSelected: {
    borderWidth: 1.5,
    borderColor: onboardingV6.primaryDk,
    backgroundColor: onboardingV6.surface,
  },
  chipText: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: onboardingV6.ink,
  },
  chipTextSelected: {
    color: onboardingV6.primaryDk,
  },
  chipBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: onboardingV6.primaryDk,
    alignItems: "center",
    justifyContent: "center",
  },
  pictoCard: {
    width: "48%",
    aspectRatio: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: onboardingV6.border,
    backgroundColor: onboardingV6.surface,
    padding: 14,
    alignItems: "center",
    justifyContent: "space-between",
  },
  pictoCardSelected: {
    borderWidth: 1.5,
    borderColor: onboardingV6.primaryDk,
    backgroundColor: onboardingV6.softer,
  },
  pictoBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: onboardingV6.primaryDk,
    alignItems: "center",
    justifyContent: "center",
  },
  pictoGlyph: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pictoLabel: {
    fontSize: 13.5,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: onboardingV6.ink,
  },
  pictoLabelSelected: {
    color: onboardingV6.primaryDk,
  },
  banner: {
    marginHorizontal: onboardingV6.sidePadding,
    marginTop: 20,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: onboardingV6.warnBg,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  bannerIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: onboardingV6.warnInk,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerIconText: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: typography.fontFamily.heading,
    color: onboardingV6.warnInk,
  },
  bannerText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: typography.fontFamily.bodyMedium,
    color: onboardingV6.warnInk,
  },
  eyebrow: {
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontFamily: typography.fontFamily.monoMedium,
    color: onboardingV6.faint,
  },
  pressed: {
    opacity: appTheme.card.pressedOpacity,
  },
});
