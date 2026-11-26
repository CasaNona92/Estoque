import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { Abertura } from "@/components/abertura";
import { RegistrarSW } from "@/components/pwa";
import { NOME_LOJA } from "@/lib/loja";
import { ProvedorDicas } from "@/components/ui/menus";
import "./globals.css";

const fonteUi = Manrope({ subsets: ["latin"], variable: "--fonte-ui", display: "swap" });
const fonteSerif = Fraunces({ subsets: ["latin"], variable: "--fonte-serif", display: "swap", axes: ["opsz"] });

const NOME = NOME_LOJA;

export const metadata: Metadata = {
  title: { default: NOME, template: `%s · ${NOME}` },
  description: "Estoque e vitrine da loja",
  applicationName: NOME,
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: NOME, statusBarStyle: "default" },
  icons: { icon: "/icons/icone-192.png", apple: "/icons/icone-192.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F6F3" },
    { media: "(prefers-color-scheme: dark)", color: "#12141A" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const loja = await cookies();
  const tema = loja.get("tema")?.value === "escuro" ? "dark" : "";
  // abertura animada: uma vez por sessão do navegador
  const mostrarAbertura = !loja.get("abertura");
  return (
    <html lang="pt-BR" className={`${fonteUi.variable} ${fonteSerif.variable} ${tema}`} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        {mostrarAbertura && <Abertura />}
        <ProvedorDicas>{children}</ProvedorDicas>
        <Toaster
          position="top-center"
          closeButton
          toastOptions={{
            classNames: {
              toast: "!rounded-2xl !border-border !bg-card !text-foreground !shadow-media !font-sans",
              description: "!text-muted-foreground",
              actionButton: "!bg-primary !text-primary-foreground !rounded-lg !h-8 !px-3",
            },
          }}
        />
        <RegistrarSW />
      </body>
    </html>
  );
}
