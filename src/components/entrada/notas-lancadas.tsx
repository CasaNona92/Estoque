"use client";

import { ChevronDownIcon, FileDownIcon, LoaderCircleIcon, ReceiptTextIcon, XCircleIcon } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelarNota } from "@/app/acoes/notas";
import { BolinhaCor } from "@/components/estoque";
import { Badge, Card, EstadoVazio, Skeleton } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/campos";
import { Dialog, DialogCabecalho, DialogConteudo, DialogDescricao, DialogRodape, DialogTitulo } from "@/components/ui/dialog";
import { formatarCnpj, formatarData, formatarDataHora, formatarMoeda, formatarNumero } from "@/lib/formatacao";
import { cn } from "@/lib/utils";

type Nota = {
  id: string;
  chave_acesso: string | null;
  numero: string | null;
  serie: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  origem: "xml" | "pdf" | "manual";
  status: "confirmada" | "cancelada";
  criado_em: string;
  confirmada_em: string | null;
  cancelada_em: string | null;
  motivo_cancelamento: string | null;
  fornecedor: { cnpj: string; razao_social: string } | null;
  usuario: { nome: string } | null;
};

type Item = {
  n_item: number;
  descricao: string;
  quantidade_nota: number;
  fator_conversao: number;
  quantidade_entrada: number;
  status: string;
  unidade: string | null;
  cor: { nome_cor: string; cor_hex: string; produto: { id: string; nome: string } | null } | null;
};

const ORIGEM = { xml: "XML", pdf: "PDF", manual: "Bipagem/manual" };

/** Histórico das notas lançadas. O admin pode cancelar (gera estornos). */
export function NotasLancadas({ admin }: { admin: boolean }) {
  const [notas, setNotas] = useState<Nota[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [aberta, setAberta] = useState<string | null>(null);
  const [itens, setItens] = useState<Record<string, Item[]>>({});
  const [cancelando, setCancelando] = useState<Nota | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pendente, iniciar] = useTransition();

  const carregar = useCallback(async (p: number) => {
    const r = await fetch(`/api/notas?pagina=${p}`);
    if (!r.ok) return setNotas([]);
    const j = await r.json();
    setNotas(j.notas);
    setTotal(j.total);
  }, []);

  useEffect(() => {
    void carregar(pagina);
  }, [pagina, carregar]);

  async function abrir(id: string) {
    setAberta((a) => (a === id ? null : id));
    if (!itens[id]) {
      const r = await fetch(`/api/notas/${id}`);
      if (r.ok) {
        const j = await r.json();
        setItens((m) => ({ ...m, [id]: j.itens }));
      }
    }
  }

  async function baixarArquivo(id: string) {
    const r = await fetch(`/api/notas/${id}?arquivo=1`);
    const j = r.ok ? await r.json() : null;
    if (j?.url) window.open(j.url, "_blank", "noopener,noreferrer");
    else toast.error("Arquivo original não disponível.");
  }

  function confirmarCancelamento() {
    if (!cancelando) return;
    iniciar(async () => {
      const r = await cancelarNota({ notaId: cancelando.id, motivo });
      if (!r.ok) return void toast.error(r.erro);
      toast.success(`Nota cancelada · ${r.dados.estornos} estorno(s) gerado(s)`);
      setCancelando(null);
      setMotivo("");
      void carregar(pagina);
    });
  }

  if (!notas) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }
  if (notas.length === 0) return <EstadoVazio icone={<ReceiptTextIcon />} titulo="Nenhuma nota lançada ainda" />;

  return (
    <div className="space-y-4">
      <Card className="divide-y divide-border/60">
        {notas.map((n) => (
          <div key={n.id}>
            <div className="flex flex-wrap items-center gap-4 px-5 py-4">
              <button type="button" onClick={() => void abrir(n.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={aberta === n.id}>
                <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition", aberta === n.id && "rotate-180")} />
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {n.fornecedor?.razao_social ?? "Entrada sem fornecedor"} {n.numero ? `· NF ${n.numero}` : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatarCnpj(n.fornecedor?.cnpj)} · {ORIGEM[n.origem]} · lançada em {formatarDataHora(n.confirmada_em ?? n.criado_em)} por {n.usuario?.nome ?? "—"}
                    {n.data_emissao ? ` · emissão ${formatarData(n.data_emissao)}` : ""}
                  </p>
                </div>
              </button>
              <span className="text-sm tabular">{formatarMoeda(n.valor_total)}</span>
              {n.status === "cancelada" ? (
                <Badge variant="zerado" title={n.motivo_cancelamento ?? undefined}>
                  cancelada
                </Badge>
              ) : (
                <Badge variant="ok">confirmada</Badge>
              )}
              {n.origem !== "manual" && (
                <Button size="sm" variant="ghost" onClick={() => void baixarArquivo(n.id)} aria-label="Ver arquivo original">
                  <FileDownIcon />
                </Button>
              )}
              {admin && n.status === "confirmada" && (
                <Button size="sm" variant="outline" className="text-perigo" onClick={() => setCancelando(n)}>
                  <XCircleIcon /> Cancelar
                </Button>
              )}
            </div>
            {aberta === n.id && (
              <div className="bg-background/60 px-5 pb-4">
                {!itens[n.id] ? (
                  <LoaderCircleIcon className="size-4 animate-spin" />
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground text-xs">
                      <tr>
                        <th className="py-2 font-medium">#</th>
                        <th className="py-2 font-medium">Item da nota</th>
                        <th className="py-2 font-medium">Produto / cor</th>
                        <th className="py-2 text-right font-medium">Entrou</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens[n.id].map((i) => (
                        <tr key={i.n_item} className={cn("border-border/60 border-t", i.status === "ignorado" && "text-muted-foreground")}>
                          <td className="py-2 tabular">{i.n_item}</td>
                          <td className="py-2">{i.descricao}</td>
                          <td className="py-2">
                            {i.cor ? (
                              <span className="inline-flex items-center gap-2">
                                <BolinhaCor hex={i.cor.cor_hex} /> {i.cor.produto?.nome} — {i.cor.nome_cor}
                              </span>
                            ) : (
                              "ignorado"
                            )}
                          </td>
                          <td className="py-2 text-right tabular">{i.status === "vinculado" ? `+${formatarNumero(i.quantidade_entrada)}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {n.status === "cancelada" && n.motivo_cancelamento && (
                  <p className="mt-2 text-perigo text-sm">Cancelada em {formatarDataHora(n.cancelada_em)}: {n.motivo_cancelamento}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </Card>
      {total > 30 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-muted-foreground text-sm">
            página {pagina + 1} de {Math.ceil(total / 30)}
          </span>
          <Button variant="outline" size="sm" disabled={(pagina + 1) * 30 >= total} onClick={() => setPagina((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      )}

      <Dialog open={Boolean(cancelando)} onOpenChange={(a) => !a && setCancelando(null)}>
        <DialogConteudo>
          <DialogCabecalho>
            <DialogTitulo>Cancelar esta entrada?</DialogTitulo>
            <DialogDescricao>
              As quantidades que entraram com esta nota saem do estoque (estorno). Se parte já foi vendida, o cancelamento é bloqueado para o estoque não ficar
              negativo.
            </DialogDescricao>
          </DialogCabecalho>
          <Campo rotulo="Motivo" htmlFor="motivo-cancelamento">
            <Input id="motivo-cancelamento" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: nota lançada em duplicidade" maxLength={300} />
          </Campo>
          <DialogRodape>
            <Button variant="outline" onClick={() => setCancelando(null)}>
              Voltar
            </Button>
            <Button variant="perigo" disabled={pendente || motivo.trim().length < 3} onClick={confirmarCancelamento}>
              {pendente && <LoaderCircleIcon className="animate-spin" />} Cancelar entrada
            </Button>
          </DialogRodape>
        </DialogConteudo>
      </Dialog>
    </div>
  );
}
