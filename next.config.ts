import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Fotos/notas: URLs pré-assinadas do R2 (bucket privado, acesso pela API S3)
const r2 = "https://*.r2.cloudflarestorage.com";
// OCR (tesseract.js) baixa o worker/núcleo/idioma desses CDNs, só quando o usuário lê um PDF escaneado
const ocr = "https://cdn.jsdelivr.net https://tessdata.projectnaptha.com";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""} https://cdn.jsdelivr.net`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${r2}`,
  "font-src 'self' data:",
  `connect-src 'self' ${r2} ${ocr}${dev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const headersSeguranca = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const config: NextConfig = {
  // A otimização acontece no upload (WebP 1600 px + miniatura 400 px, no navegador)
  images: { unoptimized: true },
  poweredByHeader: false,
  // Sem source maps em produção
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: headersSeguranca },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default config;
