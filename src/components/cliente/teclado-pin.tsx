"use client";

import { DeleteIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { verificarPin } from "@/app/acoes/conta";
import {
  Dialog,
  DialogCabecalho,
  DialogConteudo,
  DialogDescricao,
  DialogTitulo,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** PIN para sair do Modo Cliente (configurável na Administração). */
export function TecladoPin({ aberto, aoFechar, aoConfirmar }: { aberto: boolean; aoFechar: () => void; aoConfirmar: () => void }) {
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);

  useEffect(() => {
    if (aberto) {
      setPin("");
      setErro(null);
    }
  }, [aberto]);

  async function conferir(valor: string) {
    setConferindo(true);
    const r = await verificarPin(valor);
    setConferindo(false);
    if (r.ok && r.dados) aoConfirmar();
    else {
      setErro(r.ok ? "PIN incorreto." : r.erro);
      setPin("");
    }
  }

  function digitar(d: string) {
    if (conferindo) return;
    setErro(null);
    setPin((p) => (p.length < 8 ? p + d : p));
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <DialogConteudo className="max-w-sm">
        <DialogCabecalho>
          <DialogTitulo>PIN para sair</DialogTitulo>
          <DialogDescricao>Digite o PIN da loja para voltar ao sistema.</DialogDescricao>
        </DialogCabecalho>
        <div className="flex h-12 items-center justify-center gap-3" aria-live="polite" aria-label={`${pin.length} dígitos`}>
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <span key={i} className={cn("size-3.5 rounded-full border-2 border-foreground/40", i < pin.length && "border-foreground bg-foreground")} />
          ))}
        </div>
        {erro && <p role="alert" className="text-center text-perigo text-sm">{erro}</p>}
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" onClick={() => digitar(d)} className="h-16 rounded-2xl bg-muted font-semibold text-2xl transition hover:bg-accent-suave active:scale-95">
              {d}
            </button>
          ))}
          <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} className="flex h-16 items-center justify-center rounded-2xl text-muted-foreground hover:bg-muted" aria-label="Apagar">
            <DeleteIcon className="size-6" />
          </button>
          <button type="button" onClick={() => digitar("0")} className="h-16 rounded-2xl bg-muted font-semibold text-2xl transition hover:bg-accent-suave active:scale-95">
            0
          </button>
          <button
            type="button"
            onClick={() => conferir(pin)}
            disabled={pin.length < 4 || conferindo}
            className="flex h-16 items-center justify-center rounded-2xl bg-primary font-semibold text-primary-foreground disabled:opacity-40"
          >
            {conferindo ? <LoaderCircleIcon className="animate-spin" /> : "OK"}
          </button>
        </div>
      </DialogConteudo>
    </Dialog>
  );
}
