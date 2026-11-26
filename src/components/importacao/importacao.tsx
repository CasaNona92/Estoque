"use client";

import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FolderOpenIcon,
  ImagesIcon,
  LoaderCircleIcon,
  RotateCwIcon,
  UploadIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { importarLote, type ResultadoLinha } from "@/app/acoes/importacao";
import { Badge, Card, EstadoVazio, Progresso } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { AbaConteudo, AbaGatilho, Abas, AbasLista } from "@/components/ui/menus";
import { baixarModelo, chaveCor, type LinhaLida, lerNomeFoto, lerPlanilha } from "@/lib/cliente/planilha";
import { enviarFoto } from "@/lib/cliente/upload";
import { LIMITES } from "@/lib/magic-bytes";
import { dividirEmLotes } from "@/lib/utils";
import { TAMANHO_LOTE } from "@/lib/validacao";

type Existentes = Record<string, { id: string; cores: Array<{ id: string; nome_cor: string }> }>;

async function consultarExistentes(codigos: string[]): Promise<Existentes> {
  const unicos = [...new Set(codigos)];
  const resultado: Existentes = {};
  for (const lote of dividirEmLotes(unicos, 200)) {
    const r = await fetch("/api/produtos/existentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigos: lote }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro ?? "Falha ao consultar produtos.");
    Object.assign(resultado, (await r.json()).produtos);
  }
  return resultado;
}

export function Importacao() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 lg:py-8">
      <Link href="/produtos" className="mb-4 inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Produtos
      </Link>
      <h1 className="mb-6 font-semibold text-2xl tracking-tight">Importação em massa</h1>
      <Abas defaultValue="planilha">
        <AbasLista>
          <AbaGatilho value="planilha">
            <FileSpreadsheetIcon /> Planilha
          </AbaGatilho>
          <AbaGatilho value="fotos">
            <ImagesIcon /> Fotos em lote
          </AbaGatilho>
        </AbasLista>
        <AbaConteudo value="planilha">
          <ImportarPlanilha />
        </AbaConteudo>
        <AbaConteudo value="fotos">
          <FotosEmLote />
        </AbaConteudo>
      </Abas>
    </div>
  );
}

// ======================================================================= planilha
type Previa = LinhaLida & { acao?: "criar" | "atualizar" | "nova_cor" };
type Lote = { indice: number; linhas: Previa[]; estado: "pendente" | "enviando" | "ok" | "erro"; erro?: string; resultados?: ResultadoLinha[] };

function ImportarPlanilha() {
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa[] | null>(null);
  const [lendo, setLendo] = useState(false);
  const [lotes, setLotes] = useState<Lote[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function ler(f: File | undefined) {
    if (!f) return;
    setLendo(true);
    setLotes(null);
    setPrevia(null);
    try {
      const linhas = await lerPlanilha(f);
      const validas = linhas.filter((l) => l.dados);
      const existentes = validas.length ? await consultarExistentes(validas.map((l) => l.dados?.codigo ?? "")) : {};
      setPrevia(
        linhas.map((l) => {
          if (!l.dados) return l;
          const p = existentes[l.dados.codigo];
          const cor = chaveCor(l.dados.cor || "Padrão");
          const acao = !p ? "criar" : p.cores.some((c) => chaveCor(c.nome_cor) === cor) ? "atualizar" : "nova_cor";
          return { ...l, acao };
        }),
      );
      setArquivo(f.name);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLendo(false);
      if (input.current) input.current.value = "";
    }
  }

  async function enviarLotes(apenas?: number[]) {
    if (!previa) return;
    const validas = previa.filter((l) => l.dados);
    let atual: Lote[] =
      lotes && apenas
        ? lotes
        : dividirEmLotes(validas, TAMANHO_LOTE).map((linhas, indice) => ({ indice, linhas, estado: "pendente" as const }));
    setLotes(atual);
    setEnviando(true);
    for (const lote of atual) {
      if (apenas && !apenas.includes(lote.indice)) continue;
      if (!apenas && lote.estado === "ok") continue;
      atual = atual.map((l) => (l.indice === lote.indice ? { ...l, estado: "enviando" } : l));
      setLotes(atual);
      // se um lote falhar, os outros continuam
      const r = await importarLote(lote.linhas.map((l) => l.dados));
      atual = atual.map((l) =>
        l.indice === lote.indice ? (r.ok ? { ...l, estado: "ok", resultados: r.dados, erro: undefined } : { ...l, estado: "erro", erro: r.erro }) : l,
      );
      setLotes(atual);
    }
    setEnviando(false);
    const falhas = atual.filter((l) => l.estado === "erro").length;
    if (falhas) toast.error(`${falhas} lote(s) com erro. Corrija e tente de novo só os que falharam.`);
    else toast.success("Importação concluída");
  }

  const comErro = previa?.filter((l) => l.erro) ?? [];
  const validas = previa?.filter((l) => l.dados) ?? [];
  const contagem = {
    criar: validas.filter((l) => l.acao === "criar").length,
    nova_cor: validas.filter((l) => l.acao === "nova_cor").length,
    atualizar: validas.filter((l) => l.acao === "atualizar").length,
  };
  const feitos = lotes?.filter((l) => l.estado === "ok" || l.estado === "erro").length ?? 0;
  const falhos = lotes?.filter((l) => l.estado === "erro") ?? [];
  const avisos = lotes?.flatMap((l) => l.resultados ?? []).filter((r) => r.aviso) ?? [];

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="max-w-xl space-y-1">
          <h2 className="font-semibold">1. Baixe o modelo e preencha</h2>
          <p className="text-muted-foreground text-sm">
            Uma linha por produto + cor. Colunas: código, nome, categoria, descrição, cor, cor_hex, código de barras, estoque, estoque mínimo e
            especificações (<span className="font-mono text-xs">Largura: 180 cm; Material: MDF</span>).
          </p>
        </div>
        <Button variant="outline" onClick={() => void baixarModelo()}>
          <DownloadIcon /> Baixar modelo
        </Button>
      </Card>

      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-semibold">2. Envie a planilha</h2>
            <p className="text-muted-foreground text-sm">Ela é lida aqui no aparelho. Nada é gravado antes de você confirmar.</p>
          </div>
          <Button onClick={() => input.current?.click()} disabled={lendo || enviando}>
            {lendo ? <LoaderCircleIcon className="animate-spin" /> : <UploadIcon />} Escolher .xlsx
          </Button>
          <input ref={input} type="file" accept=".xlsx,.csv" hidden onChange={(e) => void ler(e.target.files?.[0])} />
        </div>

        {previa && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="contorno">{arquivo}</Badge>
              <Badge variant="ok">{contagem.criar} produto(s) novo(s)</Badge>
              <Badge variant="acento">{contagem.nova_cor} cor(es) nova(s)</Badge>
              <Badge variant="neutro">{contagem.atualizar} atualização(ões)</Badge>
              {comErro.length > 0 && <Badge variant="zerado">{comErro.length} linha(s) com erro</Badge>}
            </div>
            <div className="max-h-[420px] overflow-auto rounded-2xl border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="sticky top-0 bg-card text-left text-muted-foreground text-xs">
                  <tr className="border-border border-b">
                    <th className="px-3 py-2 font-medium">Linha</th>
                    <th className="px-3 py-2 font-medium">O que acontece</th>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Nome</th>
                    <th className="px-3 py-2 font-medium">Cor</th>
                    <th className="px-3 py-2 text-right font-medium">Estoque</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.map((l) => (
                    <tr key={l.linha} className="border-border/60 border-b last:border-b-0">
                      <td className="px-3 py-2 text-muted-foreground tabular">{l.linha}</td>
                      <td className="px-3 py-2">
                        {l.erro ? (
                          <span className="flex items-center gap-1 text-perigo">
                            <XCircleIcon className="size-4" /> {l.erro}
                          </span>
                        ) : l.acao === "criar" ? (
                          <Badge variant="ok">criar produto</Badge>
                        ) : l.acao === "nova_cor" ? (
                          <Badge variant="acento">nova cor</Badge>
                        ) : (
                          <Badge variant="neutro">atualizar</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono">{l.dados?.codigo ?? "—"}</td>
                      <td className="max-w-64 truncate px-3 py-2">{l.dados?.nome ?? "—"}</td>
                      <td className="px-3 py-2">{l.dados?.cor || (l.dados ? "Padrão" : "—")}</td>
                      <td className="px-3 py-2 text-right tabular">{l.dados?.estoque ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {comErro.length > 0 && <p className="text-muted-foreground text-sm">As linhas com erro serão ignoradas.</p>}
              <Button size="lg" disabled={!validas.length || enviando} onClick={() => void enviarLotes()}>
                {enviando ? <LoaderCircleIcon className="animate-spin" /> : <CheckCircle2Icon />}
                Confirmar importação de {validas.length} linha(s)
              </Button>
            </div>
          </>
        )}
      </Card>

      {lotes && (
        <Card className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">3. Envio em lotes de {TAMANHO_LOTE}</h2>
            <span className="text-muted-foreground text-sm tabular">
              {feitos} de {lotes.length} lote(s)
            </span>
          </div>
          <Progresso valor={(feitos / Math.max(lotes.length, 1)) * 100} />
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lotes.map((l) => (
              <li key={l.indice} className="flex items-start gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm">
                {l.estado === "ok" ? (
                  <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-sucesso" />
                ) : l.estado === "erro" ? (
                  <XCircleIcon className="mt-0.5 size-4 shrink-0 text-perigo" />
                ) : l.estado === "enviando" ? (
                  <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin" />
                ) : (
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/40" />
                )}
                <div className="min-w-0">
                  <p>
                    Lote {l.indice + 1} · linhas {l.linhas[0]?.linha}–{l.linhas.at(-1)?.linha}
                  </p>
                  {l.erro && <p className="text-perigo text-xs">{l.erro}</p>}
                </div>
              </li>
            ))}
          </ul>
          {avisos.length > 0 && (
            <div className="rounded-xl bg-alerta-suave p-4 text-alerta text-sm">
              <p className="mb-1 flex items-center gap-2 font-medium">
                <AlertTriangleIcon className="size-4" /> Avisos
              </p>
              <ul className="list-inside list-disc">
                {avisos.slice(0, 20).map((a) => (
                  <li key={`${a.linha}-${a.cor}`}>
                    Linha {a.linha} ({a.codigo} · {a.cor}): {a.aviso}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!enviando && falhos.length > 0 && (
            <Button variant="outline" onClick={() => void enviarLotes(falhos.map((f) => f.indice))}>
              <RotateCwIcon /> Tentar de novo só os {falhos.length} lote(s) que falharam
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}

// ======================================================================= fotos em lote
type ItemFoto = { arquivo: File; nome: string; produtoId?: string; corId?: string | null; codigo?: string; cor?: string; n?: number; motivo?: string; estado?: "ok" | "erro" | "enviando"; erro?: string };

function FotosEmLote() {
  const [itens, setItens] = useState<ItemFoto[] | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const pasta = useRef<HTMLInputElement>(null);
  const zip = useRef<HTMLInputElement>(null);

  async function preparar(arquivos: File[]) {
    setPreparando(true);
    try {
      const fotos = arquivos.filter((a) => /\.(jpe?g|png|webp|heic)$/i.test(a.name)).slice(0, 2000);
      const lidos = fotos.map((arquivo) => ({ arquivo, nome: arquivo.name, ...lerNomeFoto(arquivo.name) }));
      const codigos = lidos.map((l) => l.codigo).filter(Boolean) as string[];
      const existentes = codigos.length ? await consultarExistentes(codigos.filter((c) => /^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(c))) : {};
      const resultado: ItemFoto[] = lidos.map((l) => {
        if (!l.codigo) return { arquivo: l.arquivo, nome: l.nome, motivo: "nome fora do padrão CODIGO_COR_N.jpg" };
        const p = existentes[l.codigo];
        if (!p) return { ...l, motivo: `produto ${l.codigo} não existe` };
        const cor = p.cores.find((c) => chaveCor(c.nome_cor) === chaveCor(l.cor ?? ""));
        if (!cor) return { ...l, motivo: `cor "${l.cor}" não existe em ${l.codigo}` };
        return { ...l, produtoId: p.id, corId: cor.id };
      });
      resultado.sort((a, b) => (a.codigo ?? "").localeCompare(b.codigo ?? "") || (a.cor ?? "").localeCompare(b.cor ?? "") || (a.n ?? 0) - (b.n ?? 0));
      setItens(resultado);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPreparando(false);
    }
  }

  async function abrirZip(f: File | undefined) {
    if (!f) return;
    if (f.size > LIMITES.zipFotos) return void toast.error("O .zip pode ter no máximo 200 MB.");
    setPreparando(true);
    try {
      const { default: JSZip } = await import("jszip");
      const z = await JSZip.loadAsync(f);
      const arquivos: File[] = [];
      for (const entrada of Object.values(z.files)) {
        if (entrada.dir || entrada.name.startsWith("__MACOSX")) continue;
        const nome = entrada.name.split("/").pop() ?? entrada.name;
        if (!/\.(jpe?g|png|webp|heic)$/i.test(nome)) continue;
        arquivos.push(new File([await entrada.async("blob")], nome));
      }
      await preparar(arquivos);
    } catch {
      toast.error("Não foi possível abrir o .zip.");
      setPreparando(false);
    }
  }

  async function enviar() {
    if (!itens) return;
    setEnviando(true);
    let lista = [...itens];
    for (let i = 0; i < lista.length; i++) {
      const it = lista[i];
      if (!it.produtoId || it.estado === "ok") continue;
      lista = lista.map((x, k) => (k === i ? { ...x, estado: "enviando" } : x));
      setItens(lista);
      try {
        await enviarFoto(it.produtoId, it.corId ?? null, it.arquivo);
        lista = lista.map((x, k) => (k === i ? { ...x, estado: "ok" } : x));
      } catch (e) {
        lista = lista.map((x, k) => (k === i ? { ...x, estado: "erro", erro: (e as Error).message } : x));
      }
      setItens(lista);
    }
    setEnviando(false);
    toast.success("Envio de fotos concluído");
  }

  const associadas = itens?.filter((i) => i.produtoId) ?? [];
  const pendencias = itens?.filter((i) => !i.produtoId) ?? [];
  const concluidas = associadas.filter((i) => i.estado === "ok" || i.estado === "erro").length;

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="max-w-xl space-y-1">
          <h2 className="font-semibold">Fotos nomeadas como CODIGO_COR_N.jpg</h2>
          <p className="text-muted-foreground text-sm">
            Ex.: <span className="font-mono">MV-0001_Natural_1.jpg</span>, <span className="font-mono">GEL-0002_Preto Fosco_2.jpg</span>. Cada foto é associada
            ao produto e à cor, comprimida aqui e enviada direto ao armazenamento.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => pasta.current?.click()} disabled={preparando || enviando}>
            <FolderOpenIcon /> Escolher pasta
          </Button>
          <Button variant="outline" onClick={() => zip.current?.click()} disabled={preparando || enviando}>
            {preparando ? <LoaderCircleIcon className="animate-spin" /> : <UploadIcon />} Enviar .zip
          </Button>
        </div>
        <input
          ref={pasta}
          type="file"
          multiple
          hidden
          // atributo não padrão (Chrome/Edge/Safari): seleciona uma pasta inteira
          webkitdirectory=""
          onChange={(e) => void preparar(Array.from(e.target.files ?? []))}
        />
        <input ref={zip} type="file" accept=".zip" hidden onChange={(e) => void abrirZip(e.target.files?.[0])} />
      </Card>

      {itens &&
        (itens.length === 0 ? (
          <EstadoVazio icone={<ImagesIcon />} titulo="Nenhuma imagem encontrada" />
        ) : (
          <>
            <Card className="space-y-4 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">
                  {associadas.length} foto(s) associada(s)
                  {enviando || concluidas ? <span className="ml-2 font-normal text-muted-foreground text-sm">· {concluidas} enviada(s)</span> : null}
                </h2>
                <Button onClick={() => void enviar()} disabled={!associadas.length || enviando}>
                  {enviando ? <LoaderCircleIcon className="animate-spin" /> : <UploadIcon />} Enviar fotos
                </Button>
              </div>
              {(enviando || concluidas > 0) && <Progresso valor={(concluidas / Math.max(associadas.length, 1)) * 100} />}
              <ul className="max-h-80 divide-y divide-border/60 overflow-auto rounded-xl border border-border text-sm">
                {associadas.map((i) => (
                  <li key={i.nome} className="flex items-center gap-3 px-3 py-2">
                    {i.estado === "ok" ? (
                      <CheckCircle2Icon className="size-4 text-sucesso" />
                    ) : i.estado === "erro" ? (
                      <XCircleIcon className="size-4 text-perigo" />
                    ) : i.estado === "enviando" ? (
                      <LoaderCircleIcon className="size-4 animate-spin" />
                    ) : (
                      <span className="size-4" />
                    )}
                    <span className="flex-1 truncate font-mono text-xs">{i.nome}</span>
                    <span className="text-muted-foreground text-xs">
                      {i.codigo} · {i.cor} · {i.n}
                    </span>
                    {i.erro && <span className="text-perigo text-xs">{i.erro}</span>}
                  </li>
                ))}
              </ul>
            </Card>
            {pendencias.length > 0 && (
              <Card className="space-y-3 p-6">
                <h2 className="flex items-center gap-2 font-semibold">
                  <AlertTriangleIcon className="size-4 text-alerta" /> Pendências ({pendencias.length})
                </h2>
                <p className="text-muted-foreground text-sm">Estes arquivos não foram associados. Renomeie e envie de novo.</p>
                <ul className="max-h-64 divide-y divide-border/60 overflow-auto rounded-xl border border-border text-sm">
                  {pendencias.map((i) => (
                    <li key={i.nome} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="truncate font-mono text-xs">{i.nome}</span>
                      <span className="text-alerta text-xs">{i.motivo}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        ))}
    </div>
  );
}
