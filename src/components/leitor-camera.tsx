"use client";

import { CameraOffIcon, LoaderCircleIcon, ScanBarcodeIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogCabecalho, DialogConteudo, DialogDescricao, DialogTitulo } from "@/components/ui/dialog";

type Detector = { detect(fonte: CanvasImageSource): Promise<Array<{ rawValue: string }>> };
declare global {
  interface Window {
    BarcodeDetector?: new (o?: { formats: string[] }) => Detector;
  }
}

const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

/**
 * Lê código de barras pela câmera do tablet: BarcodeDetector (nativo) e,
 * se o navegador não tiver, @zxing/browser carregado sob demanda.
 */
export function LeitorCamera({
  aberto,
  aoFechar,
  aoLer,
  continuo = false,
  titulo = "Ler código de barras",
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoLer: (codigo: string) => void;
  continuo?: boolean;
  titulo?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [estado, setEstado] = useState<"iniciando" | "lendo" | "erro">("iniciando");
  const [ultimo, setUltimo] = useState<string | null>(null);
  const callback = useRef(aoLer);
  callback.current = aoLer;

  useEffect(() => {
    if (!aberto) return;
    let parar = () => {};
    let cancelado = false;
    let ultimaLeitura = { codigo: "", quando: 0 };

    function entregar(codigo: string) {
      const agora = Date.now();
      // evita ler o mesmo código várias vezes seguidas
      if (codigo === ultimaLeitura.codigo && agora - ultimaLeitura.quando < 1500) return;
      ultimaLeitura = { codigo, quando: agora };
      setUltimo(codigo);
      callback.current(codigo);
      if (!continuo) aoFechar();
    }

    (async () => {
      setEstado("iniciando");
      try {
        if (window.BarcodeDetector) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
            audio: false,
          });
          if (cancelado) return stream.getTracks().forEach((t) => t.stop());
          const v = video.current;
          if (!v) return;
          v.srcObject = stream;
          await v.play();
          setEstado("lendo");
          const detector = new window.BarcodeDetector({ formats: FORMATOS });
          let rodando = true;
          parar = () => {
            rodando = false;
            stream.getTracks().forEach((t) => t.stop());
          };
          const laco = async () => {
            if (!rodando) return;
            try {
              const r = await detector.detect(v);
              const c = r.find((x) => /^\d{8,14}$/.test(x.rawValue))?.rawValue;
              if (c) entregar(c);
            } catch {
              // quadro ruim, segue
            }
            if (rodando) setTimeout(laco, 120);
          };
          laco();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const leitor = new BrowserMultiFormatReader();
          const v = video.current;
          if (!v || cancelado) return;
          const controles = await leitor.decodeFromVideoDevice(undefined, v, (resultado) => {
            const c = resultado?.getText();
            if (c && /^\d{8,14}$/.test(c)) entregar(c);
          });
          setEstado("lendo");
          parar = () => controles.stop();
        }
      } catch {
        setEstado("erro");
      }
    })();

    return () => {
      cancelado = true;
      parar();
    };
  }, [aberto, continuo, aoFechar]);

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <DialogConteudo className="max-w-xl">
        <DialogCabecalho>
          <DialogTitulo>{titulo}</DialogTitulo>
          <DialogDescricao>Aponte a câmera para o código de barras. Funciona melhor com boa luz.</DialogDescricao>
        </DialogCabecalho>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
          {/* biome-ignore lint/a11y/useMediaCaption: vídeo da câmera ao vivo, sem áudio */}
          <video ref={video} className="size-full object-cover" playsInline muted />
          {estado === "lendo" && (
            <div aria-hidden className="pointer-events-none absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]">
              <div className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-accent" />
            </div>
          )}
          {estado === "iniciando" && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80">
              <LoaderCircleIcon className="size-8 animate-spin" />
            </div>
          )}
          {estado === "erro" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white">
              <CameraOffIcon className="size-8" />
              <p className="text-sm">Não foi possível abrir a câmera. Verifique a permissão do navegador.</p>
            </div>
          )}
        </div>
        {continuo && ultimo ? (
          <p className="flex items-center gap-2 text-muted-foreground text-sm" aria-live="polite">
            <ScanBarcodeIcon className="size-4" /> Último lido: <span className="font-mono text-foreground">{ultimo}</span>
          </p>
        ) : null}
      </DialogConteudo>
    </Dialog>
  );
}
