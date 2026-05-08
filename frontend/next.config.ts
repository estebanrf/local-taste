import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true
  },
  trailingSlash: false,
  transpilePackages: ["react-leaflet", "leaflet"],
};

export default nextConfig;
