export const designSystem = {
  colors: {
    background: "#F4F7FB",
    textPrimary: "#0F172A",
    textSecondary: "#64748B",
    textMuted: "#94A3B8",
    border: "rgba(255,255,255,0.18)",
  },
  gradients: {
    primary:
      "linear-gradient(135deg, #6D28D9 0%, #7C3AED 25%, #2563EB 60%, #06B6D4 100%)",
    secondary: "linear-gradient(135deg, #8B5CF6 0%, #6366F1 50%, #0EA5E9 100%)",
    sidebar: "linear-gradient(180deg, #0B1023 0%, #111936 100%)",
  },
  surfaces: {
    card: "rgba(255,255,255,0.78)",
    glassBlur: "blur(18px)",
  },
  shadow: {
    soft: "0 10px 35px rgba(15,23,42,0.08)",
    glow: "0 0 30px rgba(124,58,237,0.18)",
    hover: "0 20px 40px rgba(37,99,235,0.18)",
  },
  radius: {
    card: 24,
    element: 18,
    control: 14,
  },
  spacing: [4, 8, 12, 16, 24, 32, 48, 64] as const,
  motion: {
    fast: "0.2s",
    normal: "0.28s",
    slow: "0.35s",
  },
} as const;

export type DesignSystem = typeof designSystem;
