import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      { source: "/insights", destination: "/model-lab", permanent: true },
      { source: "/quiz", destination: "/beat-the-model", permanent: true },
    ];
  },
};

export default nextConfig;
