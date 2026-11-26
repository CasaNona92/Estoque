"use client";

import { ChevronLeftIcon, LoaderCircleIcon, PackagePlusIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { BolinhaCor } from "@/components/estoque";
import { FotoR2 } from "@/components/foto";
import { FormProduto } from "@/components/produto/form-produto";
import { Button } from "@/components/ui/button";
import { Dialog, DialogCabecalho, DialogConteudo, DialogDescricao, DialogTitulo } from "@/components/ui/dialog";
import { useBusca } from "@/hooks/use-busca";
import { formatarNumero } from "@/lib/formatacao";
import type { ProdutoCompleto, ProdutoResumo } from "@/lib/tipos";
import { cn } from "@/lib/utils";

export type Vinculo = {
  cor_id: string;
  produto: { id: string; nome: string; codigo: string; nome_cor: string; cor_hex: string; estoque: number };
};

/** Escolher produto + cor pela busca universal (ou cadastrar um novo na hora). */
export function SeletorProduto({
  aberto,
  aoFechar,
  aoEscolher,
  termoInicial = "",
  cadastroInicial,
  titulo = "Vincular a um produto",
  modoInicial = "buscar",
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoEscolher: (v: Vinculo) => void;
  termoInicial?: string;
  cadastroInicial?: { nome?: string; codigo_barras?: string | null };
  titulo?: string;
  modoInicial?: "buscar" | "cadastrar";
}) {
  const [termo, setTermo] = useState(termoInicial);
  const [produto, setProduto] = useState<ProdutoResumo | null>(null);
  const [cadastrando, setCadastrando] = useState(modoInicial === "cadastrar");
  const { dados, carregando } = useBusca(aberto ? termo : "", 10);

  useEffect(() => {
    if (aberto) {
      setTermo(termoInicial);
      setProduto(null);
      setCadastrando(modoInicial === "cadastrar");
    }
  }, [aberto, termoInicial, modoInicial]);

  async function cadastrado(id: string) {
    const r = await fetch(`/api/produtos/${id}`);
    if (!r.ok) return aoFechar();
    const p = (await r.json()) as ProdutoCompleto;
    const c = p.cores[0];
    aoEscolher({ cor_id: c.id, produto: { id: p.id, nome: p.nome, codigo: p.codigo, nome_cor: c.nome_cor, cor_hex: c.cor_hex, estoque: c.estoque } });
    aoFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <DialogConteudo className={cn("max-w-2xl", cadastrando && "max-w-4xl")}>
        <DialogCabecalho>
          <DialogTitulo>{cadastrando ? "Cadastro rápido" : titulo}</DialogTitulo>
          <DialogDescricao>
            {cadastrando ? "Já preenchido com os dados da nota. Ajuste e salve." : "Busque o produto e escolha a cor que está entrando."}
          </DialogDescricao>
        </DialogCabecalho>

        {cadastrando ? (
          <FormProduto
            compacto
            categorias={[]}
            estoqueMinimoPadrao={2}
            inicial={{
              nome: titulo1(cadastroInicial?.nome ?? termoInicial),
              cores: [{ nome_cor: "Padrão", cor_hex: "#B5835A", codigo_barras: cadastroInicial?.codigo_barras ?? "", estoque_inicial: 0 }],
            }}
            aoSalvar={cadastrado}
          />
        ) : produto ? (
          <div className="space-y-4">
            <button type="button" onClick={() => setProduto(null)} className="flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground">
              <ChevronLeftIcon className="size-4" /> Voltar à busca
            </button>
            <p className="font-medium">{produto.nome}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {produto.cores.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    aoEscolher({ cor_id: c.id, produto: { id: produto.produto_id, nome: produto.nome, codigo: produto.codigo, nome_cor: c.nome_cor, cor_hex: c.cor_hex, estoque: c.estoque } });
                    aoFechar();
                  }}
                  className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-3 text-left transition hover:border-accent hover:bg-accent-suave/40"
                >
                  <BolinhaCor hex={c.cor_hex} className="size-5" />
                  <span className="flex-1">{c.nome_cor}</span>
                  <span className="text-muted-foreground text-xs tabular">{formatarNumero(c.estoque)} em estoque</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex h-12 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-accent">
              {carregando ? <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" /> : <SearchIcon className="size-4 text-muted-foreground" />}
              <input autoFocus value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Nome, código ou código de barras" className="h-full flex-1 bg-transparent outline-none" aria-label="Buscar produto" />
            </div>
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {(dados?.resultados ?? []).map((p) => (
                <li key={p.produto_id}>
                  <button type="button" onClick={() => setProduto(p)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted">
                    <FotoR2 chave={p.fotos[0]?.chave_thumb} url={p.fotos[0]?.url} alt="" corHex={p.cores[0]?.cor_hex} className="size-11 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-sm">{p.nome}</span>
                      <span className="block font-mono text-muted-foreground text-xs">{p.codigo}</span>
                    </span>
                    <span className="flex gap-1">
                      {p.cores.slice(0, 5).map((c) => (
                        <BolinhaCor key={c.id} hex={c.cor_hex} />
                      ))}
                    </span>
                  </button>
                </li>
              ))}
              {dados && !dados.resultados.length && <li className="px-2 py-6 text-center text-muted-foreground text-sm">Nenhum produto encontrado.</li>}
            </ul>
            <Button variant="outline" className="w-full" onClick={() => setCadastrando(true)}>
              <PackagePlusIcon /> Cadastrar produto novo
            </Button>
          </div>
        )}
      </DialogConteudo>
    </Dialog>
  );
}

/** "CADEIRA JANTAR MADRI" → "Cadeira Jantar Madri" */
function titulo1(s: string) {
  return s
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .slice(0, 160);
}
