"use client";

import {
  ArrowLeftIcon,
  BarcodeIcon,
  ExpandIcon,
  PackageMinusIcon,
  PackagePlusIcon,
  PencilIcon,
  PresentationIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BadgeEstoque, BolinhaCor } from "@/components/estoque";
import { FotoR2, SemFoto } from "@/components/foto";
import { TabelaMovimentacoes } from "@/components/movimentacoes";
import { Badge, Card } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { formatarNumero } from "@/lib/formatacao";
import type { Movimentacao, ProdutoCompleto } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { DialogAjuste, DialogBaixa, DialogEntradaManual } from "./dialogs-estoque";

export function DetalheProduto({
  produto,
  corInicial,
  podeEntrada,
  admin,
  historico,
}: {
  produto: ProdutoCompleto;
  corInicial?: string;
  podeEntrada: boolean;
  admin: boolean;
  historico: Movimentacao[] | null;
}) {
  const router = useRouter();
  const [cores, setCores] = useState(produto.cores);
  const [corId, setCorId] = useState(corInicial ?? cores[0]?.id);
  const [fotoIndice, setFotoIndice] = useState(0);
  const [dialogo, setDialogo] = useState<null | "baixa" | "entrada" | "ajuste">(null);

  const cor = cores.find((c) => c.id === corId) ?? cores[0];
  const total = cores.reduce((s, c) => s + c.estoque, 0);

  // fotos da cor atual; se a cor não tiver, mostra as fotos gerais (sem cor)
  const fotosCor = useMemo(() => {
    const daCor = produto.fotos.filter((f) => f.cor_id === cor?.id);
    return daCor.length ? daCor : produto.fotos.filter((f) => !f.cor_id);
  }, [produto.fotos, cor?.id]);
  const foto = fotosCor[Math.min(fotoIndice, fotosCor.length - 1)];
  const outrasCores = cores.filter((c) => c.id !== cor?.id);
  const hrefCliente = `/cliente/${produto.id}${cor ? `?cor=${cor.id}` : ""}`;

  function escolherCor(id: string) {
    setCorId(id);
    setFotoIndice(0);
    window.history.replaceState(null, "", `?cor=${id}`);
  }

  function atualizarEstoque(id: string, estoque: number) {
    setCores((lista) => lista.map((c) => (c.id === id ? { ...c, estoque } : c)));
    router.refresh();
  }

  const fotoDaCor = (corIdAlvo: string) =>
    produto.fotos.find((f) => f.cor_id === corIdAlvo) ?? produto.fotos.find((f) => !f.cor_id);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-6 lg:py-8">
      <Link href="/produtos" className="mb-4 inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Produtos
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
        {/* ------------------------------------------------ coluna da foto */}
        <div className="space-y-4">
          <Link
            href={hrefCliente}
            className="group relative block overflow-hidden rounded-3xl bg-card shadow-media"
            aria-label="Abrir no modo cliente"
          >
            {foto ? (
              <FotoR2
                key={foto.id}
                chave={foto.chave_r2}
                url={foto.url}
                expira={produto.expira}
                alt={`${produto.nome} — ${cor?.nome_cor ?? ""}`}
                className="aspect-[4/3] w-full"
                prioridade
              />
            ) : (
              <SemFoto corHex={cor?.cor_hex} className="aspect-[4/3] w-full" />
            )}
            <span className="absolute right-4 bottom-4 flex items-center gap-2 rounded-full bg-black/55 px-3.5 py-2 text-sm text-white opacity-90 backdrop-blur transition group-hover:opacity-100">
              <ExpandIcon className="size-4" /> Mostrar ao cliente
            </span>
          </Link>

          {fotosCor.length > 1 && (
            <div className="sem-scrollbar flex gap-2 overflow-x-auto" role="tablist" aria-label="Fotos desta cor">
              {fotosCor.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={i === fotoIndice}
                  onClick={() => setFotoIndice(i)}
                  className={cn(
                    "shrink-0 overflow-hidden rounded-xl ring-2 ring-transparent transition",
                    i === fotoIndice ? "ring-accent" : "opacity-75 hover:opacity-100",
                  )}
                >
                  <FotoR2 chave={f.chave_r2_thumb} url={f.urlThumb} expira={produto.expira} alt={`Foto ${i + 1}`} className="size-20" />
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" onClick={() => setDialogo("baixa")} disabled={!cor || cor.estoque < 1}>
              <PackageMinusIcon /> Fazer Baixa
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={hrefCliente}>
                <PresentationIcon /> Mostrar ao cliente
              </Link>
            </Button>
          </div>
        </div>

        {/* ------------------------------------------------ coluna das informações */}
        <div className="space-y-7">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
              <Badge variant="acento">{produto.categoria}</Badge>
              <span className="font-mono">{produto.codigo}</span>
            </div>
            <h1 className="font-serif text-3xl leading-tight tracking-tight md:text-4xl">{produto.nome}</h1>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              Total em todas as cores: <BadgeEstoque total={total} minimo={produto.estoque_minimo} />
              <span className="text-xs">(mínimo {produto.estoque_minimo})</span>
            </div>
          </div>

          <section aria-labelledby="titulo-cores" className="space-y-3">
            <h2 id="titulo-cores" className="font-medium text-muted-foreground text-sm">
              Cor: <span className="text-foreground">{cor?.nome_cor}</span>
            </h2>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cores">
              {cores.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={c.id === cor?.id}
                  onClick={() => escolherCor(c.id)}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-xl border bg-card px-3 text-sm transition",
                    c.id === cor?.id ? "border-accent ring-2 ring-accent/20" : "border-border hover:border-foreground/30",
                  )}
                >
                  <BolinhaCor hex={c.cor_hex} className="size-5" />
                  {c.nome_cor}
                  <span className={cn("tabular text-xs", c.estoque === 0 ? "text-perigo" : "text-muted-foreground")}>
                    {formatarNumero(c.estoque)}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {cor && (
            <Card className="grid gap-4 p-5 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground text-sm">Estoque desta cor</p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="font-semibold text-4xl tabular">{formatarNumero(cor.estoque)}</span>
                  <span className="text-muted-foreground">un.</span>
                </p>
                <BadgeEstoque total={cor.estoque} minimo={produto.estoque_minimo} className="mt-2" compacto />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Código de barras</p>
                <p className="mt-2 flex items-center gap-2 font-mono text-lg">
                  <BarcodeIcon className="size-5 text-muted-foreground" />
                  {cor.codigo_barras ?? <span className="font-sans text-muted-foreground text-sm">não cadastrado</span>}
                </p>
              </div>
            </Card>
          )}

          {(podeEntrada || admin) && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`/produtos/${produto.id}/editar`}>
                  <PencilIcon /> Editar
                </Link>
              </Button>
              <Button variant="outline" onClick={() => setDialogo("entrada")}>
                <PackagePlusIcon /> Entrada manual
              </Button>
              {admin && (
                <Button variant="outline" onClick={() => setDialogo("ajuste")}>
                  <SlidersHorizontalIcon /> Ajuste
                </Button>
              )}
            </div>
          )}

          {produto.descricao ? (
            <section className="space-y-2">
              <h2 className="font-semibold">Sobre o produto</h2>
              <p className="whitespace-pre-line text-foreground/80 leading-relaxed">{produto.descricao}</p>
            </section>
          ) : null}

          {Object.keys(produto.especificacoes).length > 0 && (
            <section className="space-y-2">
              <h2 className="font-semibold">Especificações</h2>
              <dl className="overflow-hidden rounded-2xl border border-border bg-card">
                {Object.entries(produto.especificacoes).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 border-border/70 border-b px-4 py-3 text-sm last:border-b-0">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ outras cores */}
      {outrasCores.length > 0 && (
        <section className="mt-12 space-y-4" aria-labelledby="titulo-outras">
          <h2 id="titulo-outras" className="font-semibold text-lg">
            Outras cores
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {outrasCores.map((c) => {
              const f = fotoDaCor(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    escolherCor(c.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="group overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-suave transition hover:-translate-y-0.5 hover:shadow-media"
                >
                  {f ? (
                    <FotoR2 chave={f.chave_r2_thumb} url={f.urlThumb} expira={produto.expira} alt={c.nome_cor} className="aspect-square w-full" />
                  ) : (
                    <SemFoto corHex={c.cor_hex} className="aspect-square w-full" />
                  )}
                  <div className="flex items-center gap-2 p-3">
                    <BolinhaCor hex={c.cor_hex} />
                    <span className="flex-1 truncate font-medium text-sm">{c.nome_cor}</span>
                    <BadgeEstoque total={c.estoque} minimo={produto.estoque_minimo} compacto />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {historico && (
        <section className="mt-12 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Movimentações</h2>
            <Link href={`/historico?produto=${produto.id}`} className="text-accent-texto text-sm hover:underline">
              Ver todas
            </Link>
          </div>
          <TabelaMovimentacoes movimentacoes={historico} semProduto />
        </section>
      )}

      {cor && (
        <>
          <DialogBaixa
            aberto={dialogo === "baixa"}
            aoFechar={() => setDialogo(null)}
            produtoNome={produto.nome}
            cores={cores}
            corInicial={cor.id}
            aoConcluir={atualizarEstoque}
          />
          <DialogEntradaManual
            aberto={dialogo === "entrada"}
            aoFechar={() => setDialogo(null)}
            cores={cores}
            corInicial={cor.id}
            aoConcluir={atualizarEstoque}
          />
          <DialogAjuste
            aberto={dialogo === "ajuste"}
            aoFechar={() => setDialogo(null)}
            cores={cores}
            corInicial={cor.id}
            aoConcluir={atualizarEstoque}
          />
        </>
      )}
    </div>
  );
}
