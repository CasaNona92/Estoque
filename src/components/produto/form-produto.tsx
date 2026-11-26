"use client";

import { ArrowLeftIcon, CameraIcon, ImagePlusIcon, LoaderCircleIcon, PlusIcon, Trash2Icon, WandSparklesIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { excluirProduto, salvarProduto } from "@/app/acoes/produtos";
import { Card } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Campo, Input, Textarea } from "@/components/ui/campos";
import { enviarFoto } from "@/lib/cliente/upload";
import type { ProdutoCompleto } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { esquemaProduto, primeiraMensagem } from "@/lib/validacao";
import { GerenciadorFotos } from "./gerenciador-fotos";

type CorForm = { chave: string; id?: string; nome_cor: string; cor_hex: string; codigo_barras: string; estoque_inicial: number; estoque?: number };
type Spec = { chave: string; valor: string };

let seq = 0;
const novaChave = () => `c${++seq}`;

export function FormProduto({
  categorias,
  estoqueMinimoPadrao,
  produto,
  inicial,
  admin = false,
  aoSalvar,
  compacto = false,
}: {
  categorias: string[];
  estoqueMinimoPadrao: number;
  produto?: ProdutoCompleto;
  inicial?: { nome?: string; codigo?: string; categoria?: string; cores?: Array<Omit<CorForm, "chave">> };
  admin?: boolean;
  /** cadastro rápido (entrada de nota): devolve o id em vez de navegar */
  aoSalvar?: (id: string) => void;
  compacto?: boolean;
}) {
  const router = useRouter();
  const editando = Boolean(produto);
  const [codigo, setCodigo] = useState(produto?.codigo ?? inicial?.codigo ?? "");
  const [nome, setNome] = useState(produto?.nome ?? inicial?.nome ?? "");
  const [categoria, setCategoria] = useState(produto?.categoria ?? inicial?.categoria ?? "");
  const [descricao, setDescricao] = useState(produto?.descricao ?? "");
  const [minimo, setMinimo] = useState(String(produto?.estoque_minimo ?? estoqueMinimoPadrao));
  const [specs, setSpecs] = useState<Spec[]>(
    produto ? Object.entries(produto.especificacoes).map(([chave, valor]) => ({ chave, valor })) : [{ chave: "Largura", valor: "" }],
  );
  const [cores, setCores] = useState<CorForm[]>(
    produto
      ? produto.cores.map((c) => ({ chave: novaChave(), id: c.id, nome_cor: c.nome_cor, cor_hex: c.cor_hex, codigo_barras: c.codigo_barras ?? "", estoque_inicial: 0, estoque: c.estoque }))
      : (inicial?.cores ?? [{ nome_cor: "Padrão", cor_hex: "#B5835A", codigo_barras: "", estoque_inicial: 0 }]).map((c) => ({ ...c, chave: novaChave() })),
  );
  const [fila, setFila] = useState<Array<{ arquivo: File; url: string; corChave: string | null }>>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const inputFotos = useRef<HTMLInputElement>(null);
  const inputCamera = useRef<HTMLInputElement>(null);

  useEffect(() => () => fila.forEach((f) => URL.revokeObjectURL(f.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  function gerarCodigo() {
    const prefixo = (categoria || nome || "P").normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "P";
    setCodigo(`${prefixo}-${Date.now().toString(36).slice(-5).toUpperCase()}`);
  }

  function mudarCor(chave: string, campo: keyof CorForm, valor: string | number) {
    setCores((l) => l.map((c) => (c.chave === chave ? { ...c, [campo]: valor } : c)));
  }

  function adicionarFotos(arquivos: FileList | null) {
    if (!arquivos) return;
    const novos = Array.from(arquivos).slice(0, 30).map((arquivo) => ({ arquivo, url: URL.createObjectURL(arquivo), corChave: cores[0]?.chave ?? null }));
    setFila((f) => [...f, ...novos]);
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const dados = {
      id: produto?.id ?? null,
      codigo,
      nome,
      categoria,
      descricao,
      especificacoes: specs.filter((s) => s.chave.trim() && s.valor.trim()),
      estoque_minimo: minimo,
      cores: cores.map((c) => ({
        id: c.id ?? null,
        nome_cor: c.nome_cor,
        cor_hex: c.cor_hex,
        codigo_barras: c.codigo_barras,
        estoque_inicial: c.id ? 0 : c.estoque_inicial,
      })),
    };
    const v = esquemaProduto.safeParse(dados);
    if (!v.success) return setErro(primeiraMensagem(v.error));

    iniciar(async () => {
      const r = await salvarProduto(dados);
      if (!r.ok) return setErro(r.erro);
      const id = r.dados.id;

      if (fila.length) {
        // mapeia as cores do formulário para os ids criados
        const resp = await fetch(`/api/produtos/${id}`);
        const salvo = resp.ok ? ((await resp.json()) as ProdutoCompleto) : null;
        let enviados = 0;
        for (const [i, f] of fila.entries()) {
          setProgresso(`Enviando foto ${i + 1} de ${fila.length}…`);
          const corForm = cores.find((c) => c.chave === f.corChave);
          const corId = salvo?.cores.find((c) => c.nome_cor.toLowerCase() === corForm?.nome_cor.trim().toLowerCase())?.id ?? null;
          try {
            await enviarFoto(id, corId, f.arquivo);
            enviados++;
          } catch (err) {
            toast.error(`${f.arquivo.name}: ${(err as Error).message}`);
          }
        }
        setProgresso(null);
        if (enviados) toast.success(`${enviados} foto(s) enviada(s)`);
      }

      toast.success(editando ? "Produto atualizado" : "Produto cadastrado");
      if (aoSalvar) return aoSalvar(id);
      router.push(`/produtos/${id}`);
      router.refresh();
    });
  }

  function excluir() {
    if (!produto || !window.confirm(`Excluir "${produto.nome}"? Ele some do sistema e as fotos são apagadas.`)) return;
    iniciar(async () => {
      const r = await excluirProduto(produto.id);
      if (!r.ok) return void toast.error(r.erro);
      toast.success("Produto excluído");
      router.push("/produtos");
    });
  }

  // impede que o Enter do leitor USB envie o formulário
  const semEnter = (e: React.KeyboardEvent) => e.key === "Enter" && e.preventDefault();

  return (
    <div className={cn(!compacto && "mx-auto max-w-5xl px-4 py-6 md:px-6 lg:py-8")}>
      {!compacto && (
        <>
          <Link href={produto ? `/produtos/${produto.id}` : "/produtos"} className="mb-4 inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground">
            <ArrowLeftIcon className="size-4" /> Voltar
          </Link>
          <h1 className="mb-6 font-semibold text-2xl tracking-tight">{editando ? "Editar produto" : "Novo produto"}</h1>
        </>
      )}

      <form onSubmit={salvar} className="space-y-6">
        <Card className="grid gap-5 p-6 md:grid-cols-2">
          <Campo rotulo="Código" htmlFor="codigo" dica="Ex.: MV-0012">
            <div className="flex gap-2">
              <Input id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} required maxLength={40} className="font-mono uppercase" onKeyDown={semEnter} />
              {!editando && (
                <Button type="button" variant="outline" size="icon" onClick={gerarCodigo} title="Gerar código" aria-label="Gerar código">
                  <WandSparklesIcon />
                </Button>
              )}
            </div>
          </Campo>
          <Campo rotulo="Nome" htmlFor="nome">
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={160} />
          </Campo>
          <Campo rotulo="Categoria" htmlFor="categoria">
            <Input id="categoria" list="lista-categorias" value={categoria} onChange={(e) => setCategoria(e.target.value)} required maxLength={80} autoComplete="off" />
            <datalist id="lista-categorias">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Campo>
          <Campo rotulo="Estoque mínimo (total)" htmlFor="minimo" dica="Abaixo disso o estoque aparece em âmbar.">
            <Input id="minimo" type="number" min={0} inputMode="numeric" value={minimo} onChange={(e) => setMinimo(e.target.value)} className="w-32" />
          </Campo>
          {!compacto && (
            <Campo rotulo="Descrição (bio do produto)" htmlFor="descricao" className="md:col-span-2">
              <Textarea id="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={5000} className="min-h-32" />
            </Campo>
          )}
        </Card>

        {!compacto && (
          <Card className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Especificações</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSpecs((s) => [...s, { chave: "", valor: "" }])}>
                <PlusIcon /> Adicionar
              </Button>
            </div>
            <div className="space-y-2">
              {specs.map((s, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-2">
                  <Input aria-label="Nome da especificação" placeholder="Ex.: Largura" value={s.chave} maxLength={60} onChange={(e) => setSpecs((l) => l.map((x, k) => (k === i ? { ...x, chave: e.target.value } : x)))} />
                  <Input aria-label="Valor" placeholder="Ex.: 180 cm" value={s.valor} maxLength={200} onChange={(e) => setSpecs((l) => l.map((x, k) => (k === i ? { ...x, valor: e.target.value } : x)))} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Remover" onClick={() => setSpecs((l) => l.filter((_, k) => k !== i))}>
                    <XIcon />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Cores</h2>
              <p className="text-muted-foreground text-sm">O estoque é controlado por cor. Bipe o código de barras direto no campo.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCores((l) => [...l, { chave: novaChave(), nome_cor: "", cor_hex: "#9A9A96", codigo_barras: "", estoque_inicial: 0 }])}
            >
              <PlusIcon /> Cor
            </Button>
          </div>
          <div className="space-y-3">
            {cores.map((c) => (
              <div key={c.chave} className="grid items-end gap-3 rounded-2xl border border-border/70 bg-background/50 p-3 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_auto]">
                <Campo rotulo="Cor">
                  <label className="relative flex h-11 w-14 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-input" style={{ backgroundColor: c.cor_hex }}>
                    <input type="color" value={c.cor_hex} onChange={(e) => mudarCor(c.chave, "cor_hex", e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`Selecionar cor de ${c.nome_cor || "nova cor"}`} />
                  </label>
                </Campo>
                <Campo rotulo="Nome da cor">
                  <Input value={c.nome_cor} onChange={(e) => mudarCor(c.chave, "nome_cor", e.target.value)} placeholder="Ex.: Off White" maxLength={60} required onKeyDown={semEnter} />
                </Campo>
                <Campo rotulo="Código de barras">
                  <Input
                    value={c.codigo_barras}
                    onChange={(e) => mudarCor(c.chave, "codigo_barras", e.target.value.replace(/\D/g, "").slice(0, 14))}
                    inputMode="numeric"
                    placeholder="Bipe aqui"
                    className="font-mono"
                    onKeyDown={semEnter}
                  />
                </Campo>
                {c.id ? (
                  <Campo rotulo="Estoque">
                    <p className="flex h-11 items-center px-1 font-semibold tabular">{c.estoque ?? 0}</p>
                  </Campo>
                ) : (
                  <Campo rotulo="Estoque inicial">
                    <Input type="number" min={0} inputMode="numeric" value={c.estoque_inicial} onChange={(e) => mudarCor(c.chave, "estoque_inicial", Math.max(0, Number(e.target.value) || 0))} onKeyDown={semEnter} />
                  </Campo>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remover cor"
                  disabled={cores.length === 1 || (c.estoque ?? 0) > 0}
                  title={(c.estoque ?? 0) > 0 ? "Zere o estoque antes de remover" : "Remover cor"}
                  onClick={() => setCores((l) => l.filter((x) => x.chave !== c.chave))}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
          </div>
        </Card>

        {!compacto && !produto && (
          <Card className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Fotos</h2>
                <p className="text-muted-foreground text-sm">Comprimidas no aparelho e enviadas depois de salvar.</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => inputCamera.current?.click()}>
                  <CameraIcon /> Tirar foto
                </Button>
                <Button type="button" variant="outline" onClick={() => inputFotos.current?.click()}>
                  <ImagePlusIcon /> Escolher fotos
                </Button>
              </div>
              <input ref={inputFotos} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden onChange={(e) => adicionarFotos(e.target.files)} />
              <input ref={inputCamera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => adicionarFotos(e.target.files)} />
            </div>
            {fila.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {fila.map((f, i) => (
                  <li key={f.url} className="overflow-hidden rounded-2xl border border-border bg-card">
                    {/* biome-ignore lint/performance/noImgElement: pré-visualização local (blob) */}
                    <img src={f.url} alt={`Foto ${i + 1}`} className="aspect-square w-full object-cover" />
                    <div className="flex items-center gap-1 p-2">
                      <select
                        value={f.corChave ?? ""}
                        onChange={(e) => setFila((l) => l.map((x, k) => (k === i ? { ...x, corChave: e.target.value || null } : x)))}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-card px-2 text-xs"
                        aria-label="Cor da foto"
                      >
                        <option value="">Geral</option>
                        {cores.map((c) => (
                          <option key={c.chave} value={c.chave}>
                            {c.nome_cor || "(sem nome)"}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => setFila((l) => l.filter((_, k) => k !== i))} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Tirar da lista">
                        <XIcon className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {erro && <p role="alert" className="rounded-xl bg-perigo-suave px-4 py-3 text-perigo text-sm">{erro}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {produto && admin ? (
            <Button type="button" variant="ghost" className="text-perigo" onClick={excluir} disabled={pendente}>
              <Trash2Icon /> Excluir produto
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            {progresso && <span className="text-muted-foreground text-sm">{progresso}</span>}
            <Button type="submit" size="lg" disabled={pendente}>
              {pendente && <LoaderCircleIcon className="animate-spin" />}
              {editando ? "Salvar alterações" : "Cadastrar produto"}
            </Button>
          </div>
        </div>
      </form>

      {produto && !compacto && (
        <div className="mt-8">
          <GerenciadorFotos produtoId={produto.id} fotos={produto.fotos} cores={produto.cores} expira={produto.expira} />
        </div>
      )}
    </div>
  );
}
