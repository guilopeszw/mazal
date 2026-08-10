import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The workspace packages have no build step — Node 24 runs their TypeScript directly and
  // `exports` points at `./src/index.ts`. Next has to be told to compile them itself.
  transpilePackages: ["@mazal/contracts", "@mazal/data", "@mazal/engine", "@mazal/meta"],
};

export default nextConfig;
