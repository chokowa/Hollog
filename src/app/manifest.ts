import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bocchi SNS",
    short_name: "BocchiSNS",
    description: "Local-first post timeline for private drafting and X handoff",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f1eb",
    theme_color: "#ff7a59",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
