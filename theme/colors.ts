export const colors = {
  // Core brand
  brand: {
    // primary: "#", // Match header blue for buttons + accents
    primary: "#175c91",
    dark: "#0B2C5F", // Deep header blue
  },

  // Backgrounds
  background: {
    app: "#F6F8FC", // Main app background (very light grey)
    header: "#175c91", // Top gradient start
    headerAlt: "#163D7A", // Top gradient end
    card: "#FFFFFF", // White cards
  },

  // Text
  text: {
    primary: "#0F172A", // Almost black (titles)
    secondary: "#475569", // Body / subtitles
    muted: "#94A3B8", // Timestamps, hints
    inverse: "#FFFFFF", // Text on dark blue
  },

  // Borders & dividers
  border: {
    subtle: "#E5EAF3",
  },

  // Status / accents
  status: {
    success: "#22C55E",
    warning: "#FACC15",
    info: "#3B82F6",
  },

  // Icons (soft, not harsh)
  icon: {
    primary: "#1F4FD8",
    muted: "#94A3B8",
    inverse: "#FFFFFF",
  },
};

export const gradients = {
  header: [colors.background.header, colors.background.headerAlt] as const,
};
