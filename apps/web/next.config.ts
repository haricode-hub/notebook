import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: { tsconfigPath: "tsconfig.build.json" },
};

export default nextConfig;
