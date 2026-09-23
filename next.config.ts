import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep development from generating extra agent instruction files.
  agentRules: false,
};

export default nextConfig;
