import type { MetadataRoute } from "next";
import { NOME_LOJA } from "@/lib/loja";

export default function manifest(): MetadataRoute.Manifest {
  const nome = NOME_LOJA;
  return {
    name: nome,
    short_name: "Casa da Nona",
    description: "Estoque e vitrine da loja",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    orientation: "any",
    background_color: "#FFFFFF",
    theme_color: "#0A47C9",
    icons: [
      { src: "/icons/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
