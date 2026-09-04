import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@gateway/protocol"],
  typedRoutes: true,
  experimental: {
    useTypeScriptCli: false,
  },
};

export default nextConfig;
