"use client";

import {
  FileSpreadsheetIcon,
  LayoutGridIcon,
  ListIcon,
  LoaderCircleIcon,
  PackageSearchIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CodigoNaoEncontrado } from "@/components/codigo-nao-encontrado";
import { BadgeEstoque, BolinhaCor } from "@/components/estoque";
import { EstadoVazio, Skeleton } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/campos";
import { Dica } from "@/components/ui/menus";
import { procurarCodigo, useBusca } from "@/hooks/use-busca";
import { useLeitorUsb } from "@/hooks/use-leitor-usb";
import { bipe } from "@/lib/cliente/bipe";
import { formatarNumero } from "@/lib/formatacao";
import { type ProdutoResumo, situacaoEstoque } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { MiniCarrossel } from "./mini-carrossel";

type Filtros = { categoria: string; cor: string; filtro: string; q: string };

export function ListaProdutos({
  categorias,
  cores,
  inicial,
  filtrosIniciais,
  podeCadastrar,
}: {
  categorias: string[];
  cores: Array<{ nome_cor: string; cor_hex: string }>;
  inicial: { produtos: ProdutoResumo[]; expira: number };
  filtrosIniciais: Filtros;
  podeCadastrar: boolean;
}) {
  const router = useRouter();
  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciais);
  const [itens, setItens] = useState(inicial.produtos);
  const [expira, setExpira] = useState(inicial.expira);
  const [fim, setFim] = useState(inicial.produtos.length < 30);
  const [carregando, setCarregando] = useState(false);
  const [modo, setModo] = useState<"lista" | "grade">("lista");
  const [naoEncontrado, setNaoEncontrado] = useState<string | null>(null);
  const sentinela = useRef<HTMLDivElement>(null);
  const primeiraVez = useRef(true);
  const busca = useBusca(filtros.q, 50, 150);
  const buscando = filtros.q.trim().length > 0;

  useEffect(() => {
    const salvo = localStorage.getItem("produtos:modo");
    if (salvo === "grade" || salvo === "lista") setModo(salvo);
  }, []);

  const carregar = useCallback(
    async (offset: number, f: Filtros) => {
      setCarregando(true);
      try {
        const qs = new URLSearchParams({ offset: String(offset), limite: "30" });
        if (f.categoria) qs.set("categoria", f.categoria);
        if (f.cor) qs.set("cor", f.cor);
        if (f.filtro) qs.set("filtro", f.filtro);
        const r = await fetch(`/api/produtos?${qs}`);
        if (!r.ok) return;
        const j = (await r.json()) as { produtos: ProdutoResumo[]; expira: number };
        setItens((atual) => (offset === 0 ? j.produtos : [...atual, ...j.produtos]));
        setExpira(j.expira);
        setFim(j.produtos.length < 30);
      } finally {
        setCarregando(false);
      }
    },
    [],
  );

  // filtros mudaram → recarrega do início e atualiza a URL
  useEffect(() => {
    if (primeiraVez.current) {
      primeiraVez.current = false;
      return;
    }
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v);
    window.history.replaceState(null, "", `/produtos${qs.size ? `?${qs}` : ""}`);
    if (!buscando) void carregar(0, filtros);
  }, [filtros.categoria, filtros.cor, filtros.filtro, buscando]); // eslint-disable-line react-hooks/exhaustive-deps

  // scroll infinito
  useEffect(() => {
    const el = sentinela.current;
    if (!el || buscando) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting && !carregando && !fim) void carregar(itens.length, filtros);
      },
      { rootMargin: "600px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [itens.length, carregando, fim, buscando, filtros, carregar]);

  useLeitorUsb(async (codigo) => {
    const p = await procurarCodigo(codigo);
    if (p) {
      bipe("ok");
      router.push(`/produtos/${p.produto_id}${p.cor_id ? `?cor=${p.cor_id}` : ""}`);
    } else {
      bipe("erro");
      setNaoEncontrado(codigo);
    }
  });

  // resultado da busca filtrado pelos filtros da tela
  const resultadosBusca = (busca.dados?.resultados ?? []).filter((p) => {
    if (filtros.categoria && p.categoria !== filtros.categoria) return false;
    if (filtros.cor && !p.cores.some((c) => c.nome_cor.toLowerCase() === filtros.cor.toLowerCase())) return false;
    const s = situacaoEstoque(p.estoque_total, p.estoque_minimo);
    if (filtros.filtro === "sem_estoque" && s !== "zerado") return false;
    if (filtros.filtro === "abaixo_minimo" && s !== "baixo") return false;
    return true;
  });
  const lista = buscando ? resultadosBusca : itens;
  const exp = buscando ? (busca.dados?.expira ?? expira) : expira;
  const temFiltro = Boolean(filtros.categoria || filtros.cor || filtros.filtro || filtros.q);

  function mudar<K extends keyof Filtros>(k: K, v: Filtros[K]) {
    setFiltros((f) => ({ ...f, [k]: v }));
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-12 md:px-6">
      <div className="sticky top-16 z-30 -mx-4 border-border/50 border-b bg-background/90 px-4 py-4 backdrop-blur-md md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-2 font-semibold text-xl tracking-tight">Produtos</h1>
          <div className="relative min-w-60 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              data-aceita-leitor
              value={filtros.q}
              onChange={(e) => mudar("q", e.target.value)}
              placeholder="Buscar por nome, código, cor, medida…"
              aria-label="Buscar produtos"
              className="h-11 w-full rounded-xl border border-input bg-card pr-10 pl-10 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 [&::-webkit-search-cancel-button]:hidden"
            />
            {busca.carregando ? (
              <LoaderCircleIcon className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : filtros.q ? (
              <button type="button" onClick={() => mudar("q", "")} aria-label="Limpar" className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                <XIcon className="size-4" />
              </button>
            ) : null}
          </div>
          <Select value={filtros.categoria} onChange={(e) => mudar("categoria", e.target.value)} aria-label="Categoria" className="w-auto min-w-40">
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select value={filtros.cor} onChange={(e) => mudar("cor", e.target.value)} aria-label="Cor" className="w-auto min-w-36">
            <option value="">Todas as cores</option>
            {cores.map((c) => (
              <option key={c.nome_cor} value={c.nome_cor}>
                {c.nome_cor}
              </option>
            ))}
          </Select>
          <Select value={filtros.filtro} onChange={(e) => mudar("filtro", e.target.value)} aria-label="Situação do estoque" className="w-auto min-w-44">
            <option value="">Qualquer estoque</option>
            <option value="sem_estoque">Sem estoque</option>
            <option value="abaixo_minimo">Abaixo do mínimo</option>
          </Select>
          <div className="flex rounded-xl bg-muted p-0.5" role="radiogroup" aria-label="Visualização">
            {(["lista", "grade"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={modo === m}
                aria-label={m === "lista" ? "Lista" : "Grade"}
                onClick={() => {
                  setModo(m);
                  localStorage.setItem("produtos:modo", m);
                }}
                className={cn("flex size-10 items-center justify-center rounded-lg text-muted-foreground", modo === m && "bg-card text-foreground shadow-suave")}
              >
                {m === "lista" ? <ListIcon className="size-4" /> : <LayoutGridIcon className="size-4" />}
              </button>
            ))}
          </div>
          {podeCadastrar && (
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href="/produtos/importar">
                  <FileSpreadsheetIcon /> Importar
                </Link>
              </Button>
              <Button asChild>
                <Link href="/produtos/novo">
                  <PlusIcon /> Novo produto
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="pt-5">
        {lista.length === 0 && !carregando && !(buscando && busca.carregando) ? (
          <EstadoVazio
            icone={<PackageSearchIcon />}
            titulo={temFiltro ? "Nenhum produto com esses filtros" : "Nenhum produto cadastrado"}
            descricao={
              buscando && busca.dados?.sugestao ? `Você quis dizer: ${busca.dados.sugestao}?` : temFiltro ? "Tente limpar algum filtro." : "Cadastre o primeiro produto ou importe uma planilha."
            }
            acao={
              buscando && busca.dados?.sugestao ? (
                <Button variant="outline" onClick={() => mudar("q", busca.dados?.sugestao ?? "")}>
                  Buscar “{busca.dados.sugestao}”
                </Button>
              ) : temFiltro ? (
                <Button variant="outline" onClick={() => setFiltros({ categoria: "", cor: "", filtro: "", q: "" })}>
                  Limpar filtros
                </Button>
              ) : null
            }
          />
        ) : modo === "lista" ? (
          <ul className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-suave">
            {lista.map((p, i) => (
              <LinhaProduto key={p.produto_id} p={p} expira={exp} prioridade={i < 6} />
            ))}
          </ul>
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
            {lista.map((p, i) => (
              <CartaoProduto key={p.produto_id} p={p} expira={exp} prioridade={i < 10} />
            ))}
          </ul>
        )}
        {carregando && (
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        )}
        {!buscando && <div ref={sentinela} aria-hidden className="h-px" />}
        {!buscando && fim && itens.length > 0 && (
          <p className="py-6 text-center text-muted-foreground text-sm">{formatarNumero(itens.length)} produto(s)</p>
        )}
      </div>
      <CodigoNaoEncontrado codigo={naoEncontrado} aoFechar={() => setNaoEncontrado(null)} podeCadastrar={podeCadastrar} />
    </div>
  );
}

function TooltipCores({ p }: { p: ProdutoResumo }) {
  return (
    <ul className="space-y-1">
      {p.cores.map((c) => (
        <li key={c.id} className="flex items-center gap-2">
          <BolinhaCor hex={c.cor_hex} className="size-3" />
          <span className="flex-1">{c.nome_cor}</span>
          <span className="font-semibold tabular">{formatarNumero(c.estoque)}</span>
        </li>
      ))}
    </ul>
  );
}

function LinhaProduto({ p, expira, prioridade }: { p: ProdutoResumo; expira: number; prioridade: boolean }) {
  return (
    <li className="border-border/60 border-b last:border-b-0">
      <div className="flex items-center gap-4 px-3 py-3 transition-colors hover:bg-muted/40 md:px-4">
        <MiniCarrossel fotos={p.fotos} cores={p.cores} expira={expira} alt={p.nome} className="size-20 shrink-0 rounded-xl md:size-24" prioridade={prioridade} />
        <Link href={`/produtos/${p.produto_id}`} className="min-w-0 flex-1 self-stretch py-1">
          <p className="truncate font-medium text-[15px]">{p.nome}</p>
          <p className="mt-0.5 flex items-center gap-2 text-muted-foreground text-xs">
            <span className="font-mono">{p.codigo}</span>
            <span aria-hidden>·</span>
            {p.categoria}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            {p.cores.slice(0, 8).map((c) => (
              <BolinhaCor key={c.id} hex={c.cor_hex} titulo={c.nome_cor} className="size-4" />
            ))}
            {p.cores.length > 8 && <span className="text-muted-foreground text-xs">+{p.cores.length - 8}</span>}
          </div>
        </Link>
        <Dica conteudo={<TooltipCores p={p} />} lado="left">
          <button type="button" className="alvo-toque flex items-center justify-end rounded-xl px-1" aria-label={`Estoque por cor de ${p.nome}`}>
            <BadgeEstoque total={p.estoque_total} minimo={p.estoque_minimo} className="px-3 py-1 text-[13px]" />
          </button>
        </Dica>
      </div>
    </li>
  );
}

function CartaoProduto({ p, expira, prioridade }: { p: ProdutoResumo; expira: number; prioridade: boolean }) {
  return (
    <li className="group overflow-hidden rounded-2xl border border-border/70 bg-card shadow-suave transition hover:-translate-y-0.5 hover:shadow-media">
      <MiniCarrossel fotos={p.fotos} cores={p.cores} expira={expira} alt={p.nome} className="aspect-square w-full" prioridade={prioridade} />
      <Link href={`/produtos/${p.produto_id}`} className="block space-y-2 p-3.5">
        <p className="line-clamp-2 min-h-10 font-medium text-sm leading-snug">{p.nome}</p>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {p.cores.slice(0, 5).map((c) => (
              <BolinhaCor key={c.id} hex={c.cor_hex} titulo={c.nome_cor} />
            ))}
          </div>
          <Dica conteudo={<TooltipCores p={p} />}>
            <span>
              <BadgeEstoque total={p.estoque_total} minimo={p.estoque_minimo} compacto />
            </span>
          </Dica>
        </div>
      </Link>
    </li>
  );
}
