import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GenLayer Gateway",
    short_name: "GL Gateway",
    description: "Interchain adjudication for applications and autonomous agents.",
    start_url: "/",
    display: "standalone",
    background_color: "#07100d",
    theme_color: "#64ffb4",
    icons: [
      { src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
  };
}
