import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({ extend: { classGroups: {
  "font-size": [{ text: ["display", "title-1", "title-2", "title-3", "heading", "body-lg", "body", "small", "caption", "overline"] }],
} } });

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
