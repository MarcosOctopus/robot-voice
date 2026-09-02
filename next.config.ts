import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Domínio customizado para dev/HMR quando atrás de tunnel
  allowedDevOrigins: ["robot.miraitohope.com", "localhost"],
};

export default nextConfig;
