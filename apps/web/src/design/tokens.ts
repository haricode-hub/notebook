export const designTokens = {
  type: {
    displayTracking: "-0.02em",
    headingTracking: "-0.015em",
    bodyTracking: "0em",
    smallTracking: "0.01em",
    bodyLineHeight: 1.55,
  },
  radius: { card: "var(--radius-card)", control: "var(--radius-control)" },
  spacing: { 1: "var(--space-1)", 2: "var(--space-2)", 3: "var(--space-3)", 4: "var(--space-4)", 6: "var(--space-6)" },
  material: { thin: "thin", regular: "regular", thick: "thick" },
} as const;
