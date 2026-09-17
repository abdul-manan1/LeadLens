import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal server bundle for the Dockerfile (copied from .next/standalone).
  output: "standalone",
  // Native/Node-only packages must not be bundled into route handlers.
  serverExternalPackages: ["@libsql/client", "libsql", "undici"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
