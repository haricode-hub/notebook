import type { Config } from "tailwindcss";

const config: Config = {
  theme: { extend: {
    colors: {
      canvas: "var(--bg-canvas)", surface: "var(--bg-surface)", raised: "var(--bg-raised)", sunken: "var(--bg-sunken)", hover: "var(--bg-hover)", active: "var(--bg-active)",
      border: { subtle: "var(--border-subtle)", DEFAULT: "var(--border-default)", strong: "var(--border-strong)" },
      fg: { DEFAULT: "var(--text-primary)", secondary: "var(--text-secondary)", tertiary: "var(--text-tertiary)", disabled: "var(--text-disabled)", "on-accent": "var(--text-on-accent)" },
      accent: { DEFAULT: "var(--accent)", hover: "var(--accent-hover)", active: "var(--accent-active)", soft: "var(--accent-soft)", "soft-fg": "var(--accent-soft-text)" },
      success: { DEFAULT: "var(--success)", soft: "var(--success-soft)" }, warning: { DEFAULT: "var(--warning)", soft: "var(--warning-soft)" }, danger: { DEFAULT: "var(--danger)", soft: "var(--danger-soft)" }, info: { DEFAULT: "var(--info)", soft: "var(--info-soft)" },
      src: { pdf: "var(--src-pdf)", web: "var(--src-web)", video: "var(--src-video)", audio: "var(--src-audio)", doc: "var(--src-doc)", text: "var(--src-text)" },
    },
    fontFamily: { serif: ["var(--font-serif)"], sans: ["var(--font-sans)"], mono: ["var(--font-mono)"] },
    fontSize: {
      display: ["36px", { lineHeight: "44px", letterSpacing: "-0.02em", fontWeight: "500" }], "title-1": ["28px", { lineHeight: "36px", letterSpacing: "-0.015em", fontWeight: "500" }], "title-2": ["22px", { lineHeight: "30px", letterSpacing: "-0.01em", fontWeight: "500" }], "title-3": ["18px", { lineHeight: "26px", letterSpacing: "-0.005em", fontWeight: "600" }], heading: ["15px", { lineHeight: "22px", letterSpacing: "-0.005em", fontWeight: "600" }], "body-lg": ["16px", { lineHeight: "26px" }], body: ["14px", { lineHeight: "22px" }], small: ["13px", { lineHeight: "20px" }], caption: ["12px", { lineHeight: "16px", letterSpacing: "0.01em", fontWeight: "500" }], overline: ["11px", { lineHeight: "16px", letterSpacing: "0.06em", fontWeight: "600" }],
    },
    borderRadius: { xs: "4px", sm: "6px", md: "8px", lg: "12px" }, boxShadow: { sm: "var(--shadow-sm)", md: "var(--shadow-md)", lg: "var(--shadow-lg)" }, transitionDuration: { fast: "120ms", base: "180ms", slow: "260ms" }, transitionTimingFunction: { out: "cubic-bezier(.2,.8,.2,1)", in: "cubic-bezier(.4,0,1,1)" },
  } },
};

export default config;
