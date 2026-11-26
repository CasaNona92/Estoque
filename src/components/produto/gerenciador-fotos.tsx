"use client";

import { ArrowLeftIcon, ArrowRightIcon, CameraIcon, ImagePlusIcon, LoaderCircleIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { definirCorFoto, removerFoto, reordenarFotos } from "@/app/acoes/produtos";
import { FotoR2 } from "@/components/foto";
import { Card, EstadoVazio } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { enviarFoto } from "@/lib/cliente/upload";
import type { CorCompleta, FotoCompleta } from "@/lib/tipos";

/** Upload múltiplo, câmera do tablet, reordenação e associação de cada foto a uma cor. */
export function GerenciadorFotos({
  produtoId,
  fotos: fotosIniciais,
  cores,
  expira,
}: {
  produtoId: string;
  fotos: FotoCompleta[];
  cores: CorCompleta[];
  expira: number;
}) {
  const router = useRouter();
  const [fotos, setFotos] = useState(fotosIniciais);
  const [enviando, setEnviando] = useState<{ atual: number; total: number } | null>(null);
  const [, iniciar] = useTransition();
  const inputFotos = useRef<HTMLInputElement>(null);
  const inputCamera = useRef<HTMLInputElement>(null);
  const [corNovas, setCorNovas] = useState<string>(cores[0]?.id ?? "");

  useEffect(() => setFotos(fotosIniciais), [fotosIniciais]);

  async function enviar(lista: FileList | null) {
    if (!lista?.length) return;
    const arquivos = Array.from(lista).slice(0, 30);
    let ok = 0;
    for (const [i, a] of arquivos.entries()) {
      setEnviando({ atual: i + 1, total: arquivos.length });
      try {
        await enviarFoto(produtoId, corNovas || null, a);
        ok++;
      } catch (e) {
        toast.error(`${a.name}: ${(e as Error).message}`);
      }
    }
    setEnviando(null);
    if (ok) toast.success(`${ok} foto(s) enviada(s)`);
    router.refresh();
  }

  function mover(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= fotos.length) return;
    const nova = [...fotos];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setFotos(nova);
    iniciar(async () => {
      const r = await reordenarFotos({ produtoId, ids: nova.map((f) => f.id) });
      if (!r.ok) toast.error(r.erro);
    });
  }

  function trocarCor(fotoId: string, corId: string) {
    setFotos((l) => l.map((f) => (f.id === fotoId ? { ...f, cor_id: corId || null } : f)));
    iniciar(async () => {
      const r = await definirCorFoto({ fotoId, corId: corId || null });
      if (!r.ok) toast.error(r.erro);
    });
  }

  function apagar(fotoId: string) {
    if (!window.confirm("Remover esta foto?")) return;
    setFotos((l) => l.filter((f) => f.id !== fotoId));
    iniciar(async () => {
      const r = await removerFoto(fotoId);
      if (!r.ok) toast.error(r.erro);
    });
  }

  return (
    <Card className="space-y-5 p-6" id="fotos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Fotos</h2>
          <p className="text-muted-foreground text-sm">A primeira foto de cada cor é a capa. Use as setas para reordenar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={corNovas} onChange={(e) => setCorNovas(e.target.value)} className="h-11 rounded-xl border border-input bg-card px-3 text-sm" aria-label="Cor das novas fotos">
            <option value="">Novas fotos: geral</option>
            {cores.map((c) => (
              <option key={c.id} value={c.id}>
                Novas fotos: {c.nome_cor}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" onClick={() => inputCamera.current?.click()} disabled={Boolean(enviando)}>
            <CameraIcon /> Tirar foto
          </Button>
          <Button type="button" onClick={() => inputFotos.current?.click()} disabled={Boolean(enviando)}>
            {enviando ? <LoaderCircleIcon className="animate-spin" /> : <ImagePlusIcon />}
            {enviando ? `Enviando ${enviando.atual}/${enviando.total}` : "Adicionar fotos"}
          </Button>
          <input ref={inputFotos} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden onChange={(e) => { void enviar(e.target.files); e.target.value = ""; }} />
          <input ref={inputCamera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void enviar(e.target.files); e.target.value = ""; }} />
        </div>
      </div>

      {fotos.length === 0 ? (
        <EstadoVazio icone={<ImagePlusIcon />} titulo="Nenhuma foto ainda" descricao="As fotos são o destaque do produto no Modo Cliente." />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {fotos.map((f, i) => (
            <li key={f.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <FotoR2 chave={f.chave_r2_thumb} url={f.urlThumb} expira={expira} alt={`Foto ${i + 1}`} className="aspect-square w-full" />
              <div className="space-y-2 p-2">
                <select value={f.cor_id ?? ""} onChange={(e) => trocarCor(f.id, e.target.value)} className="h-9 w-full rounded-lg border border-input bg-card px-2 text-xs" aria-label="Cor da foto">
                  <option value="">Geral (todas as cores)</option>
                  {cores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome_cor}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-between">
                  <div className="flex">
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Mover para a esquerda">
                      <ArrowLeftIcon />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => mover(i, 1)} disabled={i === fotos.length - 1} aria-label="Mover para a direita">
                      <ArrowRightIcon />
                    </Button>
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" className="text-perigo" onClick={() => apagar(f.id)} aria-label="Remover foto">
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
