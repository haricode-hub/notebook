import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../apps/web/src/", import.meta.url));
const failures = [];
const allowedColorFiles = new Set(["app/globals.css"]);
const extensions = new Set([".tsx", ".ts", ".css"]);
const walk = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (extensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) files.push(path);
  }
  return files;
};

const files = await walk(root);
for (const path of files) {
  const name = relative(root, path).replaceAll("\\", "/");
  if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
  const text = await readFile(path, "utf8");
  if (!allowedColorFiles.has(name) && /(?:#[\da-f]{3,8}\b|\brgba?\s*\()/i.test(text)) failures.push(`${name}: raw color; use a semantic design token`);
  if (/\b(?:bg-gradient-to-[\w-]+|from-(?:purple|violet|pink|blue)-\d+|to-(?:purple|violet|pink|blue)-\d+)\b/.test(text)) failures.push(`${name}: decorative gradient utility`);
  if (/\bbackdrop-blur(?:-[\w-]+)?\b/.test(text)) failures.push(`${name}: blur must use the material component`);
  if (/\b(?:text|bg|border|divide)-(?:slate|gray|zinc|neutral|stone|purple|violet|fuchsia|pink|indigo|sky|amber|rose|red|green|yellow|orange|blue)-\d+\b/.test(text)) failures.push(`${name}: palette utility; use a semantic token`);
  if (/\b(?:rounded-2xl|rounded-3xl|shadow-xl|shadow-2xl)\b/.test(text)) failures.push(`${name}: banned radius or shadow utility`);
  if (/\b(?:text-(?:xs|sm|base|lg|xl|[2-9]xl)|font-(?:bold|extrabold|black))\b/.test(text)) failures.push(`${name}: default type scale or heavy font weight; use the design type tokens`);
  if (/\b(?:w|h|min-h|max-h|min-w|max-w|size|p|px|py|pt|pb|m|mx|my|mt|mb|gap)-\[(?!68ch\])[^\]]+\]/.test(text)) failures.push(`${name}: arbitrary layout value; use a named layout token`);
  if (/\b(?:rounded|shadow)(?:-\[[^\]]+\])?\b/.test(text) && /(?:rounded-\[[^\]]+\]|shadow-\[[^\]]+\])/.test(text)) failures.push(`${name}: arbitrary radius or shadow; use a design token`);
  if (/\p{Extended_Pictographic}/u.test(text)) failures.push(`${name}: emoji or pictographic glyph; use an icon or text label`);
  const iconImports = [...text.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/g)].flatMap((match) => match[1].split(",").map((item) => item.trim()).filter((item) => /^[A-Z][A-Za-z0-9]*$/.test(item)));
  if (iconImports.some((icon) => new RegExp(`<${icon}(?=[\\s/>])`).test(text))) failures.push(`${name}: render icons through components/icons/Icon`);
}

const globals = await readFile(join(root, "app/globals.css"), "utf8");
const layout = await readFile(join(root, "app/layout.tsx"), "utf8");
for (const [token, description] of [["--font-serif", "Source Serif 4"], ["--font-sans", "Geist"], ["--font-mono", "Geist Mono"]]) {
  if (!globals.includes(token)) failures.push(`globals.css: missing ${token}`);
  if (!layout.includes(description.replace("Source Serif 4", "Source_Serif_4").replace("Geist Mono", "Geist_Mono"))) failures.push(`layout.tsx: ${description} is not loaded with next/font`);
}
for (const token of ["--bg-canvas", "--bg-surface", "--text-primary", "--text-secondary", "--accent", "--border-default", "--radius-sm", "--radius-md", "--radius-lg"]) {
  if (!globals.includes(token)) failures.push(`globals.css: missing design token ${token}`);
}
if (!globals.includes('[data-theme="dark"]')) failures.push("globals.css: dark theme tokens are missing");
if (!globals.includes("prefers-reduced-motion")) failures.push("globals.css: reduced-motion preference is missing");

if (failures.length) {
  console.error(`Design audit failed (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Design audit passed: ${files.length} source files checked for semantic colors, font loading, theme tokens, motion preferences, gradients, blur utilities, and icon wrapper use.`);
}
