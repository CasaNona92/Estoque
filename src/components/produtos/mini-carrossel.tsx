"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useRef, useState } from "react";
import { FotoR2, SemFoto } from "@/components/foto";
import type { CorResumo, FotoResumo } from "@/lib/tipos";
import { cn } from "@/lib/utils";

/** Foto à esquerda com mini carrossel das fotos/cores (setas no hover, arrastar no toque). */
export function MiniCarrossel({
  fotos,
  cores,
  expira,
  alt,
  className,
  prioridade,
}: {
  fotos: FotoResumo[];
  cores: CorResumo[];
  expira: number;
  alt: string;
  className?: string;
  prioridade?: boolean;
}) {
  const [i, setI] = useState(0);
  const inicioX = useRef<number | null>(null);

  if (fotos.length === 0) return <SemFoto corHex={cores[0]?.cor_hex} className={className} />;
  const atual = fotos[Math.min(i, fotos.length - 1)];
  const cor = cores.find((c) => c.id === atual.cor_id);
  const mover = (d: number) => setI((x) => (x + d + fotos.length) % fotos.length);

  return (
    <div
      className={cn("group/carrossel relative overflow-hidden", className)}
      onPointerDown={(e) => {
        inicioX.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (inicioX.current === null) return;
        const dx = e.clientX - inicioX.current;
        inicioX.current = null;
        if (Math.abs(dx) > 25) mover(dx < 0 ? 1 : -1);
      }}
    >
      <FotoR2 key={atual.id} chave={atual.chave_thumb} url={atual.url} expira={expira} alt={`${alt}${cor ? ` — ${cor.nome_cor}` : ""}`} className="size-full" prioridade={prioridade} />
      {fotos.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => mover(-1)}
            aria-label="Foto anterior"
            className="absolute top-1/2 left-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-foreground opacity-0 shadow transition group-hover/carrossel:opacity-100 focus-visible:opacity-100"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => mover(1)}
            aria-label="Próxima foto"
            className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-foreground opacity-0 shadow transition group-hover/carrossel:opacity-100 focus-visible:opacity-100"
          >
            <ChevronRightIcon className="size-4" />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center gap-1">
            {fotos.slice(0, 6).map((f, k) => (
              <span key={f.id} className={cn("size-1.5 rounded-full bg-white/60 shadow", k === i && "bg-white")} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
