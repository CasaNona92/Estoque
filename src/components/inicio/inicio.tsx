"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CornerDownLeftIcon,
  LoaderCircleIcon,
  ScanBarcodeIcon,
  SearchIcon,
  SearchXIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CodigoNaoEncontrado } from "@/components/codigo-nao-encontrado";
import { BadgeEstoque } from "@/components/estoque";
import { FotoR2 } from "@/components/foto";
import { LeitorCamera } from "@/components/dinamicos";
import { procurarCodigo, useBusca } from "@/hooks/use-busca";
import { useLeitorUsb } from "@/hooks/use-leitor-usb";
import { bipe } from "@/lib/cliente/bipe";
import type { ProdutoResumo } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { CardHistoricoBaixas, CardMaisVendidos, type Baixa, type Vendido } from "./cards";

export function Inicio({
  baixas,
  maisVendidos,
  podeCadastrar,
}: {
  baixas: Baixa[];
  maisVendidos: Vendido[];
  podeCadastrar: boolean;
}) {
  const router = useRouter();
  const reduzir = useReducedMotion();
  const [termo, setTermo] = useState("");
  const [indice, setIndice] = useState(0);
  const [camera, setCamera] = useState(false);
  const [naoEncontrado, setNaoEncontrado] = useState<string | null>(null);
  const [abrindoCodigo, setAbrindoCodigo] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const { dados, carregando } = useBusca(termo, 8);
  const ativo = termo.trim().length > 0;
  const resultados = dados?.resultados ?? [];

  useEffect(() => setIndice(0), [dados]);

  const abrirProduto = useCallback(
    (p: ProdutoResumo) => {
      router.push(`/produtos/${p.produto_id}${p.cor_id ? `?cor=${p.cor_id}` : ""}`);
    },
    [router],
  );

  const lerCodigo = useCallback(
    async (codigo: string) => {
      setAbrindoCodigo(true);
      setTermo(codigo);
      try {
        const p = await procurarCodigo(codigo);
        if (p) {
          bipe("ok");
          abrirProduto(p);
        } else {
          bipe("erro");
          setNaoEncontrado(codigo);
        }
      } catch {
        toast.error("Não foi possível consultar o código.");
      } finally {
        setAbrindoCodigo(false);
      }
    },
    [abrirProduto],
  );

  useLeitorUsb(lerCodigo, !camera);

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndice((i) => Math.min(i + 1, Math.max(resultados.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndice((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const t = termo.trim();
      if (/^\d{8,14}$/.test(t)) return void lerCodigo(t);
      const p = resultados[indice];
      if (p) abrirProduto(p);
    } else if (e.key === "Escape") {
      setTermo("");
      campo.current?.blur();
    }
  }

  const transicao = reduzir ? { duration: 0 } : { type: "tween" as const, ease: [0.22, 1, 0.36, 1] as const, duration: 0.26 };

  return (
    <div className="relative mx-auto flex min-h-[calc(100dvh-7.5rem)] max-w-[1600px] md:min-h-[calc(100dvh-4rem)] flex-col px-4 pb-8 md:px-6">
      <motion.section
        layout
        transition={transicao}
        className={cn("mx-auto w-full max-w-3xl", ativo ? "pt-6" : "flex flex-1 flex-col justify-center pt-8 pb-10 md:pt-0 md:pb-[12vh]")}
      >
        <AnimatePresence initial={false}>
          {!ativo && (
            <motion.div
              key="titulo"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
              className="mb-7 text-center"
            >
              <h1 className="font-serif text-3xl tracking-tight sm:text-4xl md:text-5xl">O que o cliente procura?</h1>
              <p className="mt-2 text-muted-foreground">Nome, código, cor, medida ou bipe o código de barras.</p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div layout transition={transicao} className="relative">
          <div
            className={cn(
              "flex items-center gap-2 rounded-2xl border border-border bg-card pr-2 pl-5 shadow-media transition-[box-shadow,border-color] focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15",
              ativo ? "h-14" : "h-16 md:h-[68px]",
            )}
          >
            {carregando || abrindoCodigo ? (
              <LoaderCircleIcon className="size-5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <SearchIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <input
              ref={campo}
              data-aceita-leitor
              type="search"
              role="combobox"
              aria-expanded={ativo}
              aria-controls="sugestoes"
              aria-activedescendant={resultados[indice] ? `sugestao-${indice}` : undefined}
              aria-label="Buscar produto"
              placeholder="Buscar produto…"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={teclado}
              className="h-full min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground/60 [&::-webkit-search-cancel-button]:hidden"
            />
            {termo ? (
              <button
                type="button"
                onClick={() => {
                  setTermo("");
                  campo.current?.focus();
                }}
                className="alvo-toque flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
                aria-label="Limpar busca"
              >
                <XIcon className="size-5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setCamera(true)}
              className="alvo-toque flex items-center justify-center gap-2 rounded-xl bg-muted px-3 text-foreground transition hover:bg-accent-suave hover:text-accent-texto"
              aria-label="Ler código de barras com a câmera"
              title="Ler código de barras com a câmera"
            >
              <ScanBarcodeIcon className="size-5" />
            </button>
          </div>
        </motion.div>

        {ativo && (
          <div id="sugestoes" role="listbox" aria-label="Sugestões" className="mt-3">
            <ListaSugestoes
              resultados={resultados}
              indice={indice}
              aoPassar={setIndice}
              aoEscolher={abrirProduto}
              carregando={carregando && !dados}
              expira={dados?.expira}
            />
            {dados && resultados.length === 0 && !carregando ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-border border-dashed bg-card/60 px-6 py-10 text-center">
                <SearchXIcon className="size-7 text-muted-foreground" />
                <p className="font-medium">Nada encontrado para “{termo.trim()}”.</p>
                {dados.sugestao ? (
                  <button
                    type="button"
                    onClick={() => setTermo(dados.sugestao ?? "")}
                    className="text-accent-texto hover:underline"
                  >
                    Você quis dizer: <strong>{dados.sugestao}</strong>?
                  </button>
                ) : null}
              </div>
            ) : dados?.sugestao && resultados.length > 0 && resultados[0].relevancia && resultados[0].relevancia >= 4 ? (
              <p className="mt-3 px-1 text-muted-foreground text-sm">
                Você quis dizer:{" "}
                <button type="button" onClick={() => setTermo(dados.sugestao ?? "")} className="font-semibold text-accent-texto hover:underline">
                  {dados.sugestao}
                </button>
                ?
              </p>
            ) : null}
            <p className="mt-3 hidden items-center gap-3 px-1 text-muted-foreground text-xs md:flex">
              <span className="inline-flex items-center gap-1"><ArrowUpIcon className="size-3" /><ArrowDownIcon className="size-3" /> navegar</span>
              <span className="inline-flex items-center gap-1"><CornerDownLeftIcon className="size-3" /> abrir</span>
              <span>Esc fecha</span>
            </p>
          </div>
        )}
      </motion.section>

      <AnimatePresence initial={false}>
        {!ativo && (
          <motion.div
            key="cards"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.05 } }}
            exit={{ opacity: 0, y: 12, transition: { duration: 0.12 } }}
            className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6"
          >
            <CardHistoricoBaixas baixas={baixas} />
            <CardMaisVendidos inicial={maisVendidos} />
          </motion.div>
        )}
      </AnimatePresence>

      <LeitorCamera aberto={camera} aoFechar={() => setCamera(false)} aoLer={lerCodigo} />
      <CodigoNaoEncontrado codigo={naoEncontrado} aoFechar={() => setNaoEncontrado(null)} podeCadastrar={podeCadastrar} />
    </div>
  );
}

function ListaSugestoes({
  resultados,
  indice,
  aoPassar,
  aoEscolher,
  carregando,
  expira,
}: {
  resultados: ProdutoResumo[];
  indice: number;
  aoPassar: (i: number) => void;
  aoEscolher: (p: ProdutoResumo) => void;
  carregando: boolean;
  expira?: number;
}) {
  if (carregando) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl bg-card p-3">
            <div className="size-14 animate-pulse rounded-xl bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <ul className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-suave">
      {resultados.map((p, i) => (
        <li key={p.produto_id + (p.cor_id ?? "")} id={`sugestao-${i}`} role="option" aria-selected={i === indice}>
          <Link
            href={`/produtos/${p.produto_id}${p.cor_id ? `?cor=${p.cor_id}` : ""}`}
            onMouseEnter={() => aoPassar(i)}
            onClick={(e) => {
              e.preventDefault();
              aoEscolher(p);
            }}
            className={cn(
              "flex min-h-[72px] items-center gap-4 border-border/60 border-b px-3 py-2.5 transition-colors last:border-b-0",
              i === indice ? "bg-accent-suave/60" : "hover:bg-muted/60",
            )}
          >
            <FotoR2
              chave={p.fotos[0]?.chave_thumb}
              url={p.fotos[0]?.url}
              expira={expira}
              alt={p.nome}
              corHex={p.cores[0]?.cor_hex}
              className="size-14 shrink-0 rounded-xl"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{p.nome}</p>
              <p className="flex items-center gap-2 text-muted-foreground text-xs">
                <span className="font-mono">{p.codigo}</span>
                <span aria-hidden>·</span>
                <span className="truncate">{p.categoria}</span>
              </p>
            </div>
            <div className="hidden items-center gap-1 sm:flex" aria-label="Fotos e cores">
              {(p.fotos.length > 1 ? p.fotos.slice(1, 5) : []).map((f) => (
                <FotoR2 key={f.id} chave={f.chave_thumb} url={f.url} expira={expira} alt="" className="size-9 rounded-lg" />
              ))}
              {p.fotos.length <= 1 &&
                p.cores.slice(0, 5).map((c) => (
                  <span
                    key={c.id}
                    title={c.nome_cor}
                    className="size-5 rounded-full ring-1 ring-black/10 ring-inset"
                    style={{ backgroundColor: c.cor_hex }}
                  />
                ))}
            </div>
            <BadgeEstoque total={p.estoque_total} minimo={p.estoque_minimo} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
