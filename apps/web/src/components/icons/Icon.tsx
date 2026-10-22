import type { LucideIcon, LucideProps } from "lucide-react";
export function Icon({ icon: Glyph, size = 16, strokeWidth = 1.5, ...props }: LucideProps & { icon: LucideIcon }) { return <Glyph aria-hidden="true" focusable="false" size={size} strokeWidth={strokeWidth} {...props} />; }
