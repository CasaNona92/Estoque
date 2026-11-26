"use client";

import { AnimatePresence, motion, type PanInfo, useReducedMotion } from "framer-motion";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  InfoIcon,
  LoaderCircleIcon,
  LogOutIcon,
  MaximizeIcon,
  MinimizeIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FotoR2, SemFoto } from "@/components/foto";
import { LogoNona } from "@/components/logo";
import { useBusca } from "@/hooks/use-busca";
import type { FotoCompleta, ProdutoCompleto } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { TecladoPin } from "./teclado-pin";

type Direcao = { eixo: "x" | "y"; sentido: 1 | -1 };

function fotosDaCor(p: ProdutoCompleto, corId: string | undefined): FotoCompleta[] {
  const daCor = p.fotos.filter((f) => f.cor_id === corId);
  if (daCor.length) return daCor;
  return p.fotos.filter((f) => !f.cor_id);
}

function preCarregar(url?: string) {
  if (!url) return;
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}

export function ModoCliente({
  produtoInicial,
  corInicial,
  exigirPin,
  nomeLoja,
}: {
  produtoInicial: ProdutoCompleto;
  corInicial?: string;
  exigirPin: boolean;
  nomeLoja: string;
}) {
  const router = useRouter();
  const reduzir = useReducedMotion();
  const [produto, setProduto] = useState(produtoInicial);
  const [corIdx, setCorIdx] = useState(() => Math.max(0, produtoInicial.cores.findIndex((c) => c.id === corInicial)));
  const [fotoIdx, setFotoIdx] = useState(0);
  const [direcao, setDirecao] = useState<Direcao>({ eixo: "x", sentido: 1 });
  const [painel, setPainel] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [pinAberto, setPinAberto] = useState(false);
  const [escuro, setEscuro] = useState(true);
  const [telaCheia, setTelaCheia] = useState(false);
  const ultimaRoda = useRef(0);

  const cores = produto.cores;
  const cor = cores[corIdx];
  const fotos = useMemo(() => fotosDaCor(produto, cor?.id), [produto, cor?.id]);
  const foto = fotos[fotoIdx % Math.max(fotos.length, 1)];

  useEffect(() => {
    const salvo = localStorage.getItem("cliente:tema");
    if (salvo) setEscuro(salvo === "escuro");
    const aoMudar = () => setTelaCheia(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  const mudarFoto = useCallback(
    (sentido: 1 | -1) => {
      if (fotos.length < 2) return;
      setDirecao({ eixo: "x", sentido });
      setFotoIdx((i) => (i + sentido + fotos.length) % fotos.length);
    },
    [fotos.length],
  );

  const irParaCor = useCallback(
    (alvo: number, sentido?: 1 | -1) => {
      if (!cores.length) return;
      const novo = (alvo + cores.length) % cores.length;
      setDirecao({ eixo: "y", sentido: sentido ?? (novo >= corIdx ? 1 : -1) });
      setCorIdx(novo);
      setFotoIdx(0);
    },
    [cores.length, corIdx],
  );

  const mudarCor = useCallback((sentido: 1 | -1) => irParaCor(corIdx + sentido, sentido), [irParaCor, corIdx]);

  // pré-carrega a próxima foto e a próxima cor para a troca ser instantânea
  useEffect(() => {
    preCarregar(fotos[(fotoIdx + 1) % Math.max(fotos.length, 1)]?.url);
    const proxima = cores[(corIdx + 1) % Math.max(cores.length, 1)];
    preCarregar(fotosDaCor(produto, proxima?.id)[0]?.url);
    const anterior = cores[(corIdx - 1 + cores.length) % Math.max(cores.length, 1)];
    preCarregar(fotosDaCor(produto, anterior?.id)[0]?.url);
  }, [fotoIdx, corIdx, fotos, cores, produto]);

  const sair = useCallback(() => {
    if (exigirPin) setPinAberto(true);
    else {
      if (document.fullscreenElement) void document.exitFullscreen();
      router.push(`/produtos/${produto.id}`);
    }
  }, [exigirPin, router, produto.id]);

  // teclado: ← → fotos · ↑ ↓ cores · Esc sai
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (buscaAberta || pinAberto) return;
      if (e.key === "ArrowRight") mudarFoto(1);
      else if (e.key === "ArrowLeft") mudarFoto(-1);
      else if (e.key === "ArrowDown") mudarCor(1);
      else if (e.key === "ArrowUp") mudarCor(-1);
      else if (e.key === "Escape") {
        if (painel) setPainel(false);
        else sair();
      } else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [mudarFoto, mudarCor, sair, painel, buscaAberta, pinAberto]);

  function roda(e: React.WheelEvent) {
    const agora = Date.now();
    if (agora - ultimaRoda.current < 450 || Math.abs(e.deltaY) < 25) return;
    ultimaRoda.current = agora;
    mudarCor(e.deltaY > 0 ? 1 : -1);
  }

  function aoSoltar(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    if (Math.abs(offset.x) > Math.abs(offset.y)) {
      if (offset.x < -60 || velocity.x < -450) mudarFoto(1);
      else if (offset.x > 60 || velocity.x > 450) mudarFoto(-1);
    } else if (offset.y < -60 || velocity.y < -450) mudarCor(1);
    else if (offset.y > 60 || velocity.y > 450) mudarCor(-1);
  }

  async function trocarProduto(id: string) {
    setBuscaAberta(false);
    const r = await fetch(`/api/produtos/${id}?publico=1`);
    if (!r.ok) return;
    const p = (await r.json()) as ProdutoCompleto;
    setProduto({ ...p, estoque_minimo: 0, cores: p.cores.map((c) => ({ ...c, estoque: 0, codigo_barras: null })) });
    setCorIdx(0);
    setFotoIdx(0);
    setPainel(false);
    window.history.replaceState(null, "", `/cliente/${id}`);
  }

  function alternarTela() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  // cartas empilhadas atrás: as próximas cores
  const pilha = cores.length > 1 ? [1, 2].filter((k) => k < cores.length).map((k) => cores[(corIdx + k) % cores.length]) : [];
  const tr = reduzir ? { duration: 0 } : { type: "spring" as const, stiffness: 320, damping: 34, mass: 0.9 };
  const variantes = {
    entrar: (d: Direcao) => (d.eixo === "x" ? { x: `${d.sentido * 18}%`, opacity: 0, scale: 1 } : { y: d.sentido > 0 ? 70 : -70, opacity: 0, scale: 0.94 }),
    centro: { x: 0, y: 0, opacity: 1, scale: 1 },
    sair: (d: Direcao) => (d.eixo === "x" ? { x: `${-d.sentido * 18}%`, opacity: 0 } : { y: d.sentido > 0 ? -120 : 120, opacity: 0, scale: 1.02 }),
  };

  const tema = escuro
    ? "bg-[#0f1116] text-[#EEF0F5] [--fundo-carta:#1a1d25] [--borda:#2b303c]"
    : "bg-[#ECEDF1] text-[#23262e] [--fundo-carta:#ffffff] [--borda:#d9dbe2]";
  const botao = cn(
    "alvo-toque flex items-center justify-center gap-2 rounded-full px-3 text-sm transition",
    escuro ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-black/60 hover:bg-black/5 hover:text-black",
  );

  return (
    <div className={cn("fixed inset-0 flex select-none flex-col overflow-hidden overscroll-none", tema)} onWheel={roda}>
      {/* topo: logo · nome · ações discretas */}
      <header className="relative z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 pt-4 pb-2 md:px-8">
        <div className="flex items-center gap-3">
          <LogoNona pequeno className="h-12" />
          <span className="hidden text-sm opacity-70 lg:inline">{nomeLoja}</span>
        </div>
        <h1 className="max-w-[60vw] text-balance text-center font-serif text-2xl leading-tight tracking-tight md:text-4xl">{produto.nome}</h1>
        <div className="flex items-center justify-end gap-1">
          <button type="button" className={botao} onClick={() => setBuscaAberta(true)} aria-label="Buscar outro produto">
            <SearchIcon className="size-5" />
          </button>
          <button type="button" className={botao} onClick={() => setPainel((v) => !v)} aria-label="Descrição e especificações" aria-expanded={painel}>
            <InfoIcon className="size-5" />
          </button>
          <button
            type="button"
            className={botao}
            onClick={() => {
              setEscuro((v) => {
                localStorage.setItem("cliente:tema", v ? "claro" : "escuro");
                return !v;
              });
            }}
            aria-label={escuro ? "Tema claro" : "Tema escuro"}
          >
            {escuro ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
          </button>
          <button type="button" className={botao} onClick={alternarTela} aria-label={telaCheia ? "Sair da tela cheia" : "Tela cheia"}>
            {telaCheia ? <MinimizeIcon className="size-5" /> : <MaximizeIcon className="size-5" />}
          </button>
          <button type="button" className={cn(botao, "opacity-60")} onClick={sair} aria-label="Sair do modo cliente">
            <LogOutIcon className="size-4" />
            <span className="hidden text-xs md:inline">Sair</span>
          </button>
        </div>
      </header>

      {/* palco: a foto ocupa quase toda a tela */}
      <main className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 md:px-16">
        <div className="relative h-full w-full max-w-[1500px]">
          {/* pilha de cartas (próximas cores) */}
          {pilha
            .slice()
            .reverse()
            .map((c, ri) => {
              const k = pilha.length - ri; // 2, 1
              const f = fotosDaCor(produto, c.id)[0];
              return (
                <button
                  type="button"
                  key={`pilha-${c.id}`}
                  onClick={() => mudarCor(1)}
                  aria-label={`Próxima cor: ${c.nome_cor}`}
                  className="absolute inset-0 overflow-hidden rounded-[28px] border border-[var(--borda)] bg-[var(--fundo-carta)] shadow-2xl transition-transform duration-300"
                  style={{ transform: `translateY(${k * 16}px) scale(${1 - k * 0.045})`, opacity: 1 - k * 0.28, zIndex: 3 - k }}
                >
                  {f ? <FotoR2 chave={f.chave_r2_thumb} url={f.urlThumb} expira={produto.expira} alt="" ajuste="contain" className="size-full bg-transparent" /> : <SemFoto corHex={c.cor_hex} className="size-full" />}
                </button>
              );
            })}

          <AnimatePresence initial={false} custom={direcao} mode="popLayout">
            <motion.div
              key={`${produto.id}-${cor?.id}-${foto?.id ?? "x"}`}
              custom={direcao}
              variants={variantes}
              initial="entrar"
              animate="centro"
              exit="sair"
              transition={tr}
              drag
              dragSnapToOrigin
              dragElastic={0.5}
              dragMomentum={false}
              onDragEnd={aoSoltar}
              className="absolute inset-0 z-10 cursor-grab touch-none overflow-hidden rounded-[28px] border border-[var(--borda)] bg-[var(--fundo-carta)] shadow-2xl active:cursor-grabbing"
            >
              {foto ? (
                <FotoR2 chave={foto.chave_r2} url={foto.url} expira={produto.expira} alt={`${produto.nome} — ${cor?.nome_cor ?? ""}`} ajuste="contain" prioridade className="size-full bg-transparent" />
              ) : (
                <SemFoto corHex={cor?.cor_hex} className="size-full" />
              )}
            </motion.div>
          </AnimatePresence>

          {fotos.length > 1 && (
            <>
              <button type="button" onClick={() => mudarFoto(-1)} aria-label="Foto anterior" className="absolute top-1/2 left-3 z-20 flex size-14 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/55">
                <ChevronLeftIcon className="size-7" />
              </button>
              <button type="button" onClick={() => mudarFoto(1)} aria-label="Próxima foto" className="absolute top-1/2 right-3 z-20 flex size-14 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/55">
                <ChevronRightIcon className="size-7" />
              </button>
              <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center gap-1.5">
                {fotos.map((f, k) => (
                  <span key={f.id} className={cn("h-1.5 rounded-full bg-white/50 shadow transition-all", k === fotoIdx % fotos.length ? "w-6 bg-white" : "w-1.5")} />
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      {/* bolinhas nas cores reais */}
      <footer className="relative z-20 flex flex-col items-center gap-3 pb-6">
        <p className="text-sm tracking-wide opacity-80" aria-live="polite">
          {cor?.nome_cor}
          {cores.length > 1 && <span className="opacity-60"> · {corIdx + 1} de {cores.length}</span>}
        </p>
        {cores.length > 1 && (
          <div className="flex items-center gap-2">
            <button type="button" className={botao} onClick={() => mudarCor(-1)} aria-label="Cor anterior">
              <ChevronUpIcon className="size-5" />
            </button>
            <div className="flex items-center gap-3" role="radiogroup" aria-label="Cores">
              {cores.map((c, k) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={k === corIdx}
                  aria-label={c.nome_cor}
                  title={c.nome_cor}
                  onClick={() => irParaCor(k)}
                  className={cn(
                    "size-9 rounded-full ring-1 ring-black/15 ring-inset transition-transform",
                    k === corIdx ? "scale-110 outline-2 outline-offset-[3px]" : "hover:scale-105",
                    escuro ? "outline-white" : "outline-black",
                  )}
                  style={{ backgroundColor: c.cor_hex }}
                />
              ))}
            </div>
            <button type="button" className={botao} onClick={() => mudarCor(1)} aria-label="Próxima cor">
              <ChevronDownIcon className="size-5" />
            </button>
          </div>
        )}
      </footer>

      {/* painel recolhível: descrição e especificações */}
      <AnimatePresence>
        {painel && (
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={reduzir ? { duration: 0 } : { type: "tween", duration: 0.25 }}
            className={cn("absolute inset-y-0 right-0 z-30 w-full max-w-md overflow-y-auto border-l p-8 shadow-2xl", escuro ? "border-white/10 bg-[#1a1917]" : "border-black/10 bg-white")}
            aria-label="Detalhes do produto"
          >
            <button type="button" onClick={() => setPainel(false)} className={cn(botao, "absolute top-4 right-4")} aria-label="Fechar detalhes">
              <XIcon className="size-5" />
            </button>
            <h2 className="pr-10 font-serif text-2xl">{produto.nome}</h2>
            {produto.descricao && <p className="mt-4 whitespace-pre-line leading-relaxed opacity-80">{produto.descricao}</p>}
            {Object.keys(produto.especificacoes).length > 0 && (
              <dl className="mt-6 divide-y divide-current/10">
                {Object.entries(produto.especificacoes).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-6 py-3 text-sm">
                    <dt className="opacity-60">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </motion.aside>
        )}
      </AnimatePresence>

      {buscaAberta && <BuscaCliente escuro={escuro} aoFechar={() => setBuscaAberta(false)} aoEscolher={trocarProduto} />}

      <TecladoPin
        aberto={pinAberto}
        aoFechar={() => setPinAberto(false)}
        aoConfirmar={() => {
          if (document.fullscreenElement) void document.exitFullscreen();
          router.push(`/produtos/${produto.id}`);
        }}
      />
    </div>
  );
}

/** Busca simples dentro do modo: só nomes e fotos. */
function BuscaCliente({ escuro, aoFechar, aoEscolher }: { escuro: boolean; aoFechar: () => void; aoEscolher: (id: string) => void }) {
  const [termo, setTermo] = useState("");
  const [dados, setDados] = useState<{ id: string; nome: string; foto?: { chave: string; url: string }; hex?: string }[]>([]);
  const [carregando, setCarregando] = useState(false);
  const { dados: r, carregando: c } = useBusca(termo, 12, 150, true);

  useEffect(() => {
    setCarregando(c);
    setDados(
      (r?.resultados ?? []).map((p) => ({
        id: p.produto_id,
        nome: p.nome,
        foto: p.fotos[0] ? { chave: p.fotos[0].chave_thumb, url: p.fotos[0].url } : undefined,
        hex: p.cores[0]?.cor_hex,
      })),
    );
  }, [r, c]);

  return (
    <div className={cn("absolute inset-0 z-40 flex flex-col p-6 md:p-10", escuro ? "bg-[#121110]/97" : "bg-[#ECE8E2]/97")} role="dialog" aria-label="Buscar produto">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
        <div className={cn("flex h-16 flex-1 items-center gap-3 rounded-2xl px-5", escuro ? "bg-white/10" : "bg-white shadow")}>
          {carregando ? <LoaderCircleIcon className="size-5 animate-spin opacity-60" /> : <SearchIcon className="size-5 opacity-60" />}
          <input autoFocus value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar outro produto…" className="h-full flex-1 bg-transparent text-xl outline-none placeholder:opacity-50" aria-label="Buscar produto" />
        </div>
        <button type="button" onClick={aoFechar} className="alvo-toque flex items-center justify-center rounded-full opacity-70 hover:opacity-100" aria-label="Fechar busca">
          <XIcon className="size-6" />
        </button>
      </div>
      <ul className="mx-auto mt-8 grid w-full max-w-5xl grid-cols-2 gap-4 overflow-y-auto md:grid-cols-4">
        {dados.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => aoEscolher(p.id)} className={cn("w-full overflow-hidden rounded-2xl text-left transition hover:-translate-y-0.5", escuro ? "bg-white/5" : "bg-white shadow")}>
              <FotoR2 chave={p.foto?.chave} url={p.foto?.url} alt={p.nome} corHex={p.hex} className="aspect-square w-full" />
              <p className="line-clamp-2 p-3 text-sm">{p.nome}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
