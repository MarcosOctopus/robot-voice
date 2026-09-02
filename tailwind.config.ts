import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a1a",
        panel: "#12122a",
        neon: "#00f0ff",
        accent: "#0066ff",
        speaking: "#ffc864",
        listening: "#00ffb4",
        thinking: "#00f0ff",
        danger: "#ff4d6d",
      },
      animation: {
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "pulse-fast": "pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
export default config;
