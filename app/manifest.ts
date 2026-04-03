import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Streak",
    short_name: "Streak",
    description: "Attendance insights and hour bank dashboard for greytHR swipe data.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0c",
    theme_color: "#0b0b0c",
    icons: [
      {
        src: "/streak-logo.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/streak-logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
