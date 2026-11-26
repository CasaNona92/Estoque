"use client";

import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { guardarUrl, renovarUrls, urlValida } from "@/lib/cliente/urls";
import { cn } from "@/lib/utils";

/**
 * Imagem do R2 por URL pré-assinada, com lazy-loading. Se a URL expirar (ou falhar),
 * pede uma nova uma única vez. Sem foto → um "swatch" elegante na cor da variação.
 */
export function FotoR2({
  chave,
  url,
  expira,
  alt,
  corHex,
  className,
  imgClassName,
  prioridade = false,
  ajuste = "cover",
  arrastavel = false,
}: {
  chave?: string | null;
  url?: string | null;
  expira?: number;
  alt: string;
  corHex?: string | null;
  className?: string;
  imgClassName?: string;
  prioridade?: boolean;
  ajuste?: "cover" | "contain";
  arrastavel?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(() =>
    chave && url ? guardarUrl(chave, url, expira ?? Date.now() + 25 * 60_000) : (url ?? null),
  );
  const [tentou, setTentou] = useState(false);
  const [carregou, setCarregou] = useState(false);

  useEffect(() => {
    if (chave && url) setSrc(guardarUrl(chave, url, expira ?? Date.now() + 25 * 60_000));
    else setSrc(url ?? null);
  }, [chave, url, expira]);

  async function aoFalhar() {
    if (!chave || tentou) {
      setSrc(null);
      return;
    }
    setTentou(true);
    await renovarUrls([chave]);
    setSrc(urlValida(chave));
  }

  if (!src) return <SemFoto corHex={corHex} className={className} />;

  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {/* biome-ignore lint/performance/noImgElement: imagens já otimizadas no upload (images.unoptimized) */}
      <img
        src={src}
        alt={alt}
        loading={prioridade ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={prioridade ? "high" : "auto"}
        draggable={arrastavel}
        onLoad={() => setCarregou(true)}
        onError={aoFalhar}
        className={cn(
          "size-full transition-opacity duration-300",
          ajuste === "cover" ? "object-cover" : "object-contain",
          carregou ? "opacity-100" : "opacity-0",
          imgClassName,
        )}
      />
      {!carregou && <div aria-hidden className="absolute inset-0 animate-pulse bg-muted" />}
    </div>
  );
}

export function SemFoto({ corHex, className }: { corHex?: string | null; className?: string }) {
  return (
    <div
      role="img"
      aria-label="Sem foto"
      className={cn("relative flex items-center justify-center overflow-hidden bg-muted text-muted-foreground", className)}
    >
      {corHex ? (
        <div
          aria-hidden
          className="absolute inset-0 opacity-35"
          style={{ background: `radial-gradient(120% 90% at 30% 20%, ${corHex} 0%, transparent 70%)` }}
        />
      ) : null}
      <ImageIcon className="relative size-[28%] max-h-10 max-w-10 opacity-50" aria-hidden />
    </div>
  );
}
