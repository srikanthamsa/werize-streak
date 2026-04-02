import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        canvas: "#f5efe5",
        surface: "#fff9ef",
        coral: "#ff7043",
        moss: "#245d4d",
        gold: "#f6bd60",
        fog: "#d9d0c3",
      },
      boxShadow: {
        card: "0 16px 50px rgba(17, 24, 39, 0.12)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at top left, rgba(255, 112, 67, 0.18), transparent 28%), radial-gradient(circle at 80% 20%, rgba(36, 93, 77, 0.16), transparent 22%), linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(255, 249, 239, 0.95))",
      },
    },
  },
  plugins: [],
};

export default config;

