"use client";

import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BanIcon,
  CheckCircle2Icon,
  CircleHelpIcon,
  LinkIcon,
  LoaderCircleIcon,
  PackagePlusIcon,
  PlusIcon,
  ScanBarcodeIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  confirmarNota,
  pedirUploadNota,
  resolverVinculos,
  salvarCabecalhoNota,
  salvarItensNota,
  type VinculoSugerido,
} from "@/app/acoes/notas";
import { BolinhaCor } from "@/components/estoque";
import { LeitorCamera } from "@/components/leitor-camera";
import { Badge, Card, Progresso } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/campos";
import { procurarCodigo } from "@/hooks/use-busca";
import { useLeitorUsb } from "@/hooks/use-leitor-usb";
import { bipe } from "@/lib/cliente/bipe";
import { enviarParaR2 } from "@/lib/cliente/upload";
import { formatarCnpj, formatarData, formatarMoeda, formatarNumero } from "@/lib/formatacao";
import { formatarChave } from "@/lib/nfe/chave";
import type { NotaLida } from "@/lib/nfe/tipos";
import { cn, dividirEmLotes } from "@/lib/utils";
import { TAMANHO_LOTE } from "@/lib/validacao";
import { SeletorProduto, type Vinculo } from "./seletor-produto";

export type Situacao = "vinculado" | "sugestao" | "novo" | "ignorado";

export type ItemConferencia = {
  n_item: number;
  codigo_fornecedor: string | null;
  ean: string | null;
  descricao: string;
  unidade: string | null;
  quantidade_nota: number;
  valor_unitario: number | null;
  fator: number;
  cor_id: string | null;
  produto: Vinculo["produto"] | null;
  origem: "memoria" | "ean" | "sugestao" | "manual" | null;
  situacao: Situacao;
};

const INFO: Record<Situacao, { rotulo: string; icone: typeof CheckCircle2Icon; classe: string }> = {
  vinculado: { rotulo: "Vinculado", icone: CheckCircle2Icon, classe: "bg-sucesso-suave text-sucesso" },
  sugestao: { rotulo: "Confirmar sugestão", icone: AlertTriangleIcon, classe: "bg-alerta-suave text-alerta" },
  novo: { rotulo: "Produto novo", icone: PackagePlusIcon, classe: "bg-accent-suave text-accent-texto" },
  ignorado: { rotulo: "Ignorado", icone: BanIcon, classe: "bg-muted text-muted-foreground" },
};

const ORIGEM: Record<string, string> = { memoria: "pela memória do fornecedor", ean: "pelo código de barras (EAN)", sugestao: "sugestão da busca", manual: "escolhido manualmente" };

export function ConferenciaNota({
  nota: notaInicial,
  arquivo,
  itensProntos,
  editavel = false,
  aoConcluir,
  aoCancelar,
}: {
  nota: NotaLida;
  arquivo: File | null;
  /** itens já vinculados (modo bipar) */
  itensProntos?: ItemConferencia[];
  /** PDF/manual: cabeçalho e itens podem ser corrigidos */
  editavel?: boolean;
  aoConcluir: () => void;
  aoCancelar: () => void;
}) {
  const [nota, setNota] = useState(notaInicial);
  const [itens, setItens] = useState<ItemConferencia[]>(
    () =>
      itensProntos ??
      notaInicial.itens.map((i) => ({
        n_item: i.n_item,
        codigo_fornecedor: i.codigo_fornecedor,
        ean: i.ean,
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade_nota: i.quantidade,
        valor_unitario: i.valor_unitario,
        fator: 1,
        cor_id: null,
        produto: null,
        origem: null,
        situacao: "novo" as Situacao,
      })),
  );
  const [resolvendo, setResolvendo] = useState(!itensProntos);
  const [seletor, setSeletor] = useState<{ n: number; modo: "buscar" | "cadastrar" } | null>(null);
  const [envio, setEnvio] = useState<{ etapa: string; progresso: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carga, setCarga] = useState(false);
  const notaId = useRef<string | null>(null);

  // vínculo automático em lotes de 25: memória do fornecedor → EAN → sugestão
  useEffect(() => {
    if (itensProntos) return;
    let cancelado = false;
    (async () => {
      const base = notaInicial.itens;
      const mapa = new Map<number, VinculoSugerido>();
      for (const lote of dividirEmLotes(base, TAMANHO_LOTE)) {
        const r = await resolverVinculos({
          cnpj: notaInicial.fornecedor?.cnpj ?? null,
          itens: lote.map((i) => ({ n_item: i.n_item, codigo_fornecedor: i.codigo_fornecedor, ean: i.ean, descricao: i.descricao })),
        });
        if (!r.ok) {
          toast.error(r.erro);
          break;
        }
        for (const v of r.dados) mapa.set(v.n_item, v);
      }
      if (cancelado) return;
      setItens((lista) =>
        lista.map((i) => {
          const v = mapa.get(i.n_item);
          if (!v?.cor_id || !v.produto) return i;
          return {
            ...i,
            cor_id: v.cor_id,
            produto: v.produto,
            fator: v.origem === "memoria" ? v.fator_conversao : i.fator,
            origem: v.origem,
            situacao: v.origem === "sugestao" ? "sugestao" : "vinculado",
          };
        }),
      );
      setResolvendo(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [notaInicial, itensProntos]);

  const mudar = (n: number, parcial: Partial<ItemConferencia>) => setItens((l) => l.map((i) => (i.n_item === n ? { ...i, ...parcial } : i)));

  function vincular(n: number, v: Vinculo) {
    mudar(n, { cor_id: v.cor_id, produto: v.produto, origem: "manual", situacao: "vinculado" });
  }

  // estoque antes → depois (acumula quando dois itens vão para a mesma cor)
  const previsao = useMemo(() => {
    const acumulado = new Map<string, number>();
    return new Map(
      itens.map((i) => {
        if (i.situacao !== "vinculado" || !i.cor_id || !i.produto) return [i.n_item, null] as const;
        const antes = acumulado.get(i.cor_id) ?? i.produto.estoque;
        const qtd = i.quantidade_nota * i.fator;
        acumulado.set(i.cor_id, antes + qtd);
        return [i.n_item, { antes, depois: antes + qtd, qtd }] as const;
      }),
    );
  }, [itens]);

  const pendentes = itens.filter((i) => i.situacao === "novo" || i.situacao === "sugestao");
  const fracionados = itens.filter((i) => i.situacao === "vinculado" && !Number.isInteger(Math.round(i.quantidade_nota * i.fator * 1e6) / 1e6));
  const vinculados = itens.filter((i) => i.situacao === "vinculado");
  const unidades = vinculados.reduce((s, i) => s + i.quantidade_nota * i.fator, 0);
  const podeConfirmar = !resolvendo && !envio && pendentes.length === 0 && fracionados.length === 0 && vinculados.length > 0;

  async function confirmar() {
    setErro(null);
    try {
      let chaveArquivo: string | null = null;
      if (arquivo) {
        setEnvio({ etapa: "Guardando o arquivo original…", progresso: 5 });
        const tipo = arquivo.name.toLowerCase().endsWith(".pdf") ? "pdf" : "xml";
        const p = await pedirUploadNota({ tipo, tamanho: arquivo.size });
        if (!p.ok) throw new Error(p.erro);
        await enviarParaR2(p.dados, arquivo);
        chaveArquivo = p.dados.chave;
      }
      setEnvio({ etapa: "Criando o rascunho…", progresso: 15 });
      const cab = await salvarCabecalhoNota({
        nota_id: notaId.current,
        chave_acesso: nota.chave_acesso ?? "",
        numero: nota.numero,
        serie: nota.serie,
        data_emissao: nota.data_emissao,
        valor_total: nota.valor_total,
        origem: nota.origem,
        fornecedor: nota.fornecedor?.cnpj ? nota.fornecedor : null,
        chave_r2_arquivo: chaveArquivo,
      });
      if (!cab.ok) throw new Error(cab.erro);
      notaId.current = cab.dados.notaId;

      const lotes = dividirEmLotes(itens, TAMANHO_LOTE);
      for (const [k, lote] of lotes.entries()) {
        setEnvio({ etapa: `Enviando itens (lote ${k + 1} de ${lotes.length})…`, progresso: 20 + Math.round(((k + 1) / lotes.length) * 65) });
        const r = await salvarItensNota({
          notaId: cab.dados.notaId,
          itens: lote.map((i) => ({
            n_item: i.n_item,
            codigo_fornecedor: i.codigo_fornecedor,
            ean: i.ean,
            descricao: i.descricao,
            unidade: i.unidade,
            quantidade_nota: i.quantidade_nota,
            fator_conversao: i.fator,
            valor_unitario: i.valor_unitario,
            cor_id: i.situacao === "vinculado" ? i.cor_id : null,
            status: i.situacao === "ignorado" ? "ignorado" : "vinculado",
          })),
        });
        if (!r.ok) throw new Error(r.erro);
      }
      setEnvio({ etapa: "Confirmando a entrada…", progresso: 95 });
      const fim = await confirmarNota({ notaId: cab.dados.notaId, totalItens: itens.length });
      if (!fim.ok) throw new Error(fim.erro);
      setEnvio(null);
      toast.success("Entrada confirmada", { description: `${fim.dados.itens} item(ns) · ${formatarNumero(fim.dados.unidades)} unidade(s) somadas ao estoque.` });
      aoConcluir();
    } catch (e) {
      setEnvio(null);
      setErro((e as Error).message);
    }
  }

  const atual = seletor ? itens.find((i) => i.n_item === seletor.n) : null;

  return (
    <div className="space-y-5">
      {/* cabeçalho da nota */}
      <Card className="grid gap-4 p-5 md:grid-cols-4">
        {editavel ? (
          <>
            <Campo rotulo="Chave de acesso (44 dígitos)" className="md:col-span-2">
              <Input value={nota.chave_acesso ?? ""} onChange={(e) => setNota({ ...nota, chave_acesso: e.target.value.replace(/\D/g, "").slice(0, 44) || null })} inputMode="numeric" className="font-mono" placeholder="Opcional" />
            </Campo>
            <Campo rotulo="Número">
              <Input value={nota.numero ?? ""} onChange={(e) => setNota({ ...nota, numero: e.target.value.slice(0, 20) || null })} />
            </Campo>
            <Campo rotulo="Série">
              <Input value={nota.serie ?? ""} onChange={(e) => setNota({ ...nota, serie: e.target.value.slice(0, 5) || null })} />
            </Campo>
            <Campo rotulo="CNPJ do fornecedor">
              <Input
                value={nota.fornecedor?.cnpj ?? ""}
                onChange={(e) => {
                  const cnpj = e.target.value.replace(/\D/g, "").slice(0, 14);
                  setNota({ ...nota, fornecedor: cnpj ? { cnpj, razao_social: nota.fornecedor?.razao_social ?? null, nome_fantasia: null } : null });
                }}
                inputMode="numeric"
              />
            </Campo>
            <Campo rotulo="Fornecedor" className="md:col-span-2">
              <Input
                value={nota.fornecedor?.razao_social ?? ""}
                disabled={!nota.fornecedor?.cnpj}
                onChange={(e) => nota.fornecedor && setNota({ ...nota, fornecedor: { ...nota.fornecedor, razao_social: e.target.value.slice(0, 200) } })}
              />
            </Campo>
            <Campo rotulo="Emissão">
              <Input type="date" value={nota.data_emissao ?? ""} onChange={(e) => setNota({ ...nota, data_emissao: e.target.value || null })} />
            </Campo>
          </>
        ) : (
          <>
            <Dado rotulo="Fornecedor" valor={nota.fornecedor?.razao_social ?? "—"} extra={formatarCnpj(nota.fornecedor?.cnpj)} className="md:col-span-2" />
            <Dado rotulo="Nota" valor={`Nº ${nota.numero ?? "—"} · série ${nota.serie ?? "—"}`} extra={nota.data_emissao ? `emitida em ${formatarData(nota.data_emissao)}` : undefined} />
            <Dado rotulo="Valor total" valor={formatarMoeda(nota.valor_total)} />
            {nota.chave_acesso && <Dado rotulo="Chave de acesso" valor={formatarChave(nota.chave_acesso)} mono className="md:col-span-4" />}
          </>
        )}
      </Card>

      {nota.avisos.length > 0 && (
        <div className="space-y-1 rounded-2xl bg-alerta-suave p-4 text-alerta text-sm">
          {nota.avisos.map((a) => (
            <p key={a} className="flex items-start gap-2">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" /> {a}
            </p>
          ))}
        </div>
      )}

      {/* resumo */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {resolvendo ? (
          <Badge variant="neutro">
            <LoaderCircleIcon className="size-3 animate-spin" /> Vinculando itens…
          </Badge>
        ) : (
          <>
            <Badge variant="ok">{vinculados.length} vinculado(s)</Badge>
            {itens.filter((i) => i.situacao === "sugestao").length > 0 && <Badge variant="baixo">{itens.filter((i) => i.situacao === "sugestao").length} para confirmar</Badge>}
            {itens.filter((i) => i.situacao === "novo").length > 0 && <Badge variant="acento">{itens.filter((i) => i.situacao === "novo").length} produto(s) novo(s)</Badge>}
            {itens.filter((i) => i.situacao === "ignorado").length > 0 && <Badge variant="neutro">{itens.filter((i) => i.situacao === "ignorado").length} ignorado(s)</Badge>}
          </>
        )}
        <span className="ml-auto" />
        <Button variant={carga ? "acento" : "outline"} size="sm" onClick={() => setCarga((v) => !v)}>
          <ScanBarcodeIcon /> Conferir carga
        </Button>
      </div>

      {carga && <ConferenciaCarga itens={itens} aoFechar={() => setCarga(false)} />}

      {/* itens */}
      <ul className="space-y-3">
        {itens.map((i) => {
          const info = INFO[i.situacao];
          const Icone = info.icone;
          const p = previsao.get(i.n_item);
          const qtd = i.quantidade_nota * i.fator;
          const fracionado = i.situacao === "vinculado" && Math.abs(qtd - Math.round(qtd)) > 1e-9;
          return (
            <li key={i.n_item}>
              <Card className={cn("grid gap-4 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_auto]", i.situacao === "ignorado" && "opacity-60")}>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-muted-foreground text-xs">#{i.n_item}</span>
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs", info.classe)}>
                      <Icone className="size-3" /> {info.rotulo}
                    </span>
                  </div>
                  {editavel ? (
                    <Input value={i.descricao} onChange={(e) => mudar(i.n_item, { descricao: e.target.value.slice(0, 500) })} aria-label="Descrição do item" />
                  ) : (
                    <p className="font-medium text-sm leading-snug">{i.descricao}</p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {i.codigo_fornecedor && <>Cód. fornecedor <span className="font-mono">{i.codigo_fornecedor}</span> · </>}
                    {i.ean ? <>EAN <span className="font-mono">{i.ean}</span></> : "sem EAN"}
                  </p>
                  <div className="flex flex-wrap items-end gap-3 pt-1">
                    <Campo rotulo={`Qtd. na nota${i.unidade ? ` (${i.unidade})` : ""}`}>
                      {editavel ? (
                        <Input type="number" min={0} step="any" value={i.quantidade_nota} onChange={(e) => mudar(i.n_item, { quantidade_nota: Number(e.target.value) || 0 })} className="w-28" />
                      ) : (
                        <p className="flex h-11 items-center font-semibold tabular">{formatarNumero(i.quantidade_nota)}</p>
                      )}
                    </Campo>
                    <span className="pb-3 text-muted-foreground">×</span>
                    <Campo rotulo="Fator">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={i.fator}
                        onChange={(e) => mudar(i.n_item, { fator: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-24"
                        aria-label="Fator de conversão"
                        title="Ex.: na nota vem 1 CX e entram 4 unidades → fator 4"
                      />
                    </Campo>
                    <span className="pb-3 text-muted-foreground">=</span>
                    <Campo rotulo="Entram">
                      <p className={cn("flex h-11 items-center font-semibold text-lg tabular", fracionado && "text-perigo")}>{formatarNumero(qtd)} un.</p>
                    </Campo>
                  </div>
                  {fracionado && <p className="text-perigo text-xs">A quantidade de entrada precisa ser inteira. Ajuste o fator.</p>}
                </div>

                <div className="min-w-0 space-y-2 rounded-xl bg-background/60 p-3">
                  {i.produto ? (
                    <>
                      <p className="flex items-center gap-2 text-sm">
                        <BolinhaCor hex={i.produto.cor_hex} className="size-4" />
                        <span className="min-w-0 flex-1 truncate font-medium">{i.produto.nome}</span>
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {i.produto.nome_cor} · <span className="font-mono">{i.produto.codigo}</span>
                        {i.origem && <> · {ORIGEM[i.origem]}</>}
                      </p>
                      {p && (
                        <p className="flex items-center gap-2 text-sm tabular">
                          Estoque <span className="text-muted-foreground">{formatarNumero(p.antes)}</span>
                          <ArrowRightIcon className="size-3.5 text-muted-foreground" />
                          <span className="font-semibold text-sucesso">{formatarNumero(p.depois)}</span>
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="flex items-center gap-2 text-muted-foreground text-sm">
                      <CircleHelpIcon className="size-4" /> Sem produto vinculado
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-start gap-2 lg:w-44 lg:flex-col">
                  {i.situacao === "sugestao" && (
                    <Button size="sm" className="lg:w-full" onClick={() => mudar(i.n_item, { situacao: "vinculado" })}>
                      <CheckCircle2Icon /> Confirmar
                    </Button>
                  )}
                  {i.situacao !== "ignorado" && (
                    <Button size="sm" variant="outline" className="lg:w-full" onClick={() => setSeletor({ n: i.n_item, modo: "buscar" })}>
                      <LinkIcon /> {i.produto ? "Trocar vínculo" : "Vincular"}
                    </Button>
                  )}
                  {i.situacao === "novo" && (
                    <Button size="sm" variant="outline" className="lg:w-full" onClick={() => setSeletor({ n: i.n_item, modo: "cadastrar" })}>
                      <PackagePlusIcon /> Cadastrar
                    </Button>
                  )}
                  {i.situacao === "ignorado" ? (
                    <Button size="sm" variant="ghost" className="lg:w-full" onClick={() => mudar(i.n_item, { situacao: i.cor_id ? "vinculado" : "novo" })}>
                      <Undo2Icon /> Voltar
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" className="lg:w-full" onClick={() => mudar(i.n_item, { situacao: "ignorado" })}>
                      <BanIcon /> Ignorar
                    </Button>
                  )}
                  {editavel && (
                    <Button size="sm" variant="ghost" className="text-perigo lg:w-full" onClick={() => setItens((l) => l.filter((x) => x.n_item !== i.n_item))}>
                      <Trash2Icon /> Remover
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      {editavel && (
        <Button
          variant="outline"
          onClick={() =>
            setItens((l) => [
              ...l,
              {
                n_item: Math.max(0, ...l.map((x) => x.n_item)) + 1,
                codigo_fornecedor: null,
                ean: null,
                descricao: "Item adicionado manualmente",
                unidade: "UN",
                quantidade_nota: 1,
                valor_unitario: null,
                fator: 1,
                cor_id: null,
                produto: null,
                origem: null,
                situacao: "novo",
              },
            ])
          }
        >
          <PlusIcon /> Adicionar item
        </Button>
      )}

      {/* rodapé fixo com o total e a confirmação */}
      <div className="sticky bottom-0 z-20 -mx-4 border-border/70 border-t bg-background/95 px-4 py-4 backdrop-blur md:-mx-6 md:px-6">
        {envio ? (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm">
              <LoaderCircleIcon className="size-4 animate-spin" /> {envio.etapa}
            </p>
            <Progresso valor={envio.progresso} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p>
                <strong className="tabular">{formatarNumero(unidades)}</strong> unidade(s) em <strong>{vinculados.length}</strong> item(ns) vão entrar no estoque.
              </p>
              {pendentes.length > 0 && <p className="text-alerta">Resolva {pendentes.length} item(ns) (confirmar, vincular, cadastrar ou ignorar).</p>}
              {erro && <p role="alert" className="text-perigo">{erro}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={aoCancelar}>
                Cancelar
              </Button>
              <Button size="lg" disabled={!podeConfirmar} onClick={() => void confirmar()}>
                <CheckCircle2Icon /> Confirmar entrada
              </Button>
            </div>
          </div>
        )}
      </div>

      <SeletorProduto
        aberto={Boolean(seletor)}
        aoFechar={() => setSeletor(null)}
        aoEscolher={(v) => seletor && vincular(seletor.n, v)}
        termoInicial={atual?.descricao.split(/\s+/).slice(0, 3).join(" ") ?? ""}
        cadastroInicial={{ nome: atual?.descricao, codigo_barras: atual?.ean }}
        modoInicial={seletor?.modo ?? "buscar"}
        key={seletor ? `${seletor.n}-${seletor.modo}` : "fechado"}
      />
    </div>
  );
}

function Dado({ rotulo, valor, extra, mono, className }: { rotulo: string; valor: string; extra?: string; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className={cn("mt-0.5 font-medium", mono && "font-mono text-sm")}>{valor}</p>
      {extra && <p className="text-muted-foreground text-xs">{extra}</p>}
    </div>
  );
}

/** Conferência de carga: bipe o que chegou e compare com a nota (faltas e sobras). */
function ConferenciaCarga({ itens, aoFechar }: { itens: ItemConferencia[]; aoFechar: () => void }) {
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [extras, setExtras] = useState<Record<string, { nome: string; qtd: number }>>({});
  const [camera, setCamera] = useState(false);
  const [piscar, setPiscar] = useState(false);

  async function ler(codigo: string) {
    // 1º: algum item da nota com este EAN
    const porEan = itens.find((i) => i.ean === codigo && i.cor_id);
    let corId = porEan?.cor_id ?? null;
    let nome = porEan?.produto ? `${porEan.produto.nome} — ${porEan.produto.nome_cor}` : codigo;
    if (!corId) {
      const p = await procurarCodigo(codigo);
      if (p?.cor_id) {
        corId = p.cor_id;
        nome = `${p.nome} — ${p.cores.find((c) => c.id === p.cor_id)?.nome_cor ?? ""}`;
      }
    }
    setPiscar(true);
    setTimeout(() => setPiscar(false), 250);
    if (corId && itens.some((i) => i.cor_id === corId && i.situacao === "vinculado")) {
      bipe("ok");
      setContagem((c) => ({ ...c, [corId]: (c[corId] ?? 0) + 1 }));
    } else {
      bipe("erro");
      const chave = corId ?? codigo;
      setExtras((e) => ({ ...e, [chave]: { nome, qtd: (e[chave]?.qtd ?? 0) + 1 } }));
    }
  }

  useLeitorUsb(ler, !camera);

  const esperado = new Map<string, { nome: string; qtd: number }>();
  for (const i of itens) {
    if (i.situacao !== "vinculado" || !i.cor_id || !i.produto) continue;
    const atual = esperado.get(i.cor_id);
    esperado.set(i.cor_id, { nome: `${i.produto.nome} — ${i.produto.nome_cor}`, qtd: (atual?.qtd ?? 0) + i.quantidade_nota * i.fator });
  }

  return (
    <Card className={cn("space-y-4 p-5 transition-shadow", piscar && "ring-4 ring-accent/40")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Conferência de carga</h3>
          <p className="text-muted-foreground text-sm">Bipe cada volume que chegou (leitor USB ou câmera). Cada leitura soma 1.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCamera(true)}>
            <ScanBarcodeIcon /> Câmera
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setContagem({}); setExtras({}); }}>
            Zerar
          </Button>
          <Button variant="ghost" size="sm" onClick={aoFechar}>
            Fechar
          </Button>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground text-xs">
          <tr>
            <th className="py-1 font-medium">Produto</th>
            <th className="py-1 text-right font-medium">Na nota</th>
            <th className="py-1 text-right font-medium">Bipado</th>
            <th className="py-1 text-right font-medium">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {[...esperado.entries()].map(([cor, e]) => {
            const b = contagem[cor] ?? 0;
            const d = b - e.qtd;
            return (
              <tr key={cor} className="border-border/60 border-t">
                <td className="py-2">{e.nome}</td>
                <td className="py-2 text-right tabular">{formatarNumero(e.qtd)}</td>
                <td className="py-2 text-right font-semibold tabular">{formatarNumero(b)}</td>
                <td className={cn("py-2 text-right font-semibold tabular", d === 0 ? "text-sucesso" : d < 0 ? "text-perigo" : "text-alerta")}>
                  {d === 0 ? "ok" : d < 0 ? `falta ${-d}` : `sobra ${d}`}
                </td>
              </tr>
            );
          })}
          {Object.entries(extras).map(([k, e]) => (
            <tr key={k} className="border-border/60 border-t">
              <td className="py-2">{e.nome} <span className="text-muted-foreground text-xs">(não está na nota)</span></td>
              <td className="py-2 text-right tabular">0</td>
              <td className="py-2 text-right font-semibold tabular">{e.qtd}</td>
              <td className="py-2 text-right font-semibold text-alerta tabular">sobra {e.qtd}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <LeitorCamera aberto={camera} aoFechar={() => setCamera(false)} aoLer={ler} continuo titulo="Conferir carga" />
    </Card>
  );
}
