"use client";

import { LoaderCircleIcon, MinusIcon, PlusIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ajustarEstoque, desfazerBaixa, registrarBaixa, registrarEntradaManual } from "@/app/acoes/estoque";
import { BolinhaCor } from "@/components/estoque";
import { Button } from "@/components/ui/button";
import { Campo, Input, Textarea } from "@/components/ui/campos";
import {
  Dialog,
  DialogCabecalho,
  DialogConteudo,
  DialogDescricao,
  DialogRodape,
  DialogTitulo,
} from "@/components/ui/dialog";
import { formatarNumero } from "@/lib/formatacao";
import type { CorCompleta } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { esquemaBaixa, primeiraMensagem } from "@/lib/validacao";

type Base = {
  aberto: boolean;
  aoFechar: () => void;
  cores: CorCompleta[];
  corInicial: string;
  aoConcluir: (corId: string, estoque: number) => void;
};

function SeletorCor({ cores, valor, aoMudar }: { cores: CorCompleta[]; valor: string; aoMudar: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor">
      {cores.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={c.id === valor}
          onClick={() => aoMudar(c.id)}
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm transition",
            c.id === valor ? "border-accent bg-accent-suave/50 ring-2 ring-accent/20" : "border-border hover:bg-muted",
          )}
        >
          <BolinhaCor hex={c.cor_hex} className="size-4" />
          {c.nome_cor}
          <span className="text-muted-foreground text-xs tabular">{formatarNumero(c.estoque)}</span>
        </button>
      ))}
    </div>
  );
}

function Quantidade({ valor, aoMudar, max }: { valor: number; aoMudar: (n: number) => void; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" onClick={() => aoMudar(Math.max(1, valor - 1))} aria-label="Diminuir" disabled={valor <= 1}>
        <MinusIcon />
      </Button>
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={valor}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          aoMudar(Number.isNaN(n) ? 1 : Math.max(1, max ? Math.min(n, max) : n));
        }}
        className="w-24 text-center font-semibold text-lg tabular"
        aria-label="Quantidade"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => aoMudar(max ? Math.min(max, valor + 1) : valor + 1)}
        aria-label="Aumentar"
        disabled={max !== undefined && valor >= max}
      >
        <PlusIcon />
      </Button>
      {max !== undefined && <span className="text-muted-foreground text-sm">de {formatarNumero(max)} disponíveis</span>}
    </div>
  );
}

/** Baixa (venda): cor, quantidade de 1 até o estoque, nome do cliente e observação. */
export function DialogBaixa({ aberto, aoFechar, produtoNome, cores, corInicial, aoConcluir }: Base & { produtoNome: string }) {
  const [corId, setCorId] = useState(corInicial);
  const [qtd, setQtd] = useState(1);
  const [cliente, setCliente] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const cor = cores.find((c) => c.id === corId);

  useEffect(() => {
    if (aberto) {
      setCorId(corInicial);
      setQtd(1);
      setErro(null);
    }
  }, [aberto, corInicial]);

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    const dados = { corId, quantidade: qtd, cliente, observacao: obs };
    const v = esquemaBaixa.safeParse(dados);
    if (!v.success) return setErro(primeiraMensagem(v.error));
    if (cor && qtd > cor.estoque) return setErro(`Só há ${cor.estoque} em estoque.`);
    iniciar(async () => {
      const r = await registrarBaixa(dados);
      if (!r.ok) return setErro(r.erro);
      aoConcluir(corId, r.dados.estoque);
      aoFechar();
      setCliente("");
      setObs("");
      const movId = r.dados.movimentacao_id;
      toast.success("Baixa registrada", {
        description: `${qtd}× ${produtoNome} — ${cor?.nome_cor}`,
        duration: 10_000,
        action: {
          label: "Desfazer",
          onClick: async () => {
            const d = await desfazerBaixa(movId);
            if (d.ok) {
              aoConcluir(corId, d.dados.estoque);
              toast("Baixa desfeita");
            } else toast.error(d.erro);
          },
        },
      });
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <DialogConteudo>
        <form onSubmit={confirmar} className="grid gap-5">
          <DialogCabecalho>
            <DialogTitulo>Fazer baixa</DialogTitulo>
            <DialogDescricao>{produtoNome}</DialogDescricao>
          </DialogCabecalho>
          <Campo rotulo="Cor">
            <SeletorCor cores={cores} valor={corId} aoMudar={(id) => { setCorId(id); setQtd(1); }} />
          </Campo>
          <Campo rotulo="Quantidade">
            <Quantidade valor={qtd} aoMudar={setQtd} max={Math.max(cor?.estoque ?? 1, 1)} />
          </Campo>
          <Campo rotulo="Nome do cliente" htmlFor="cliente">
            <Input id="cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} autoComplete="off" maxLength={120} required />
          </Campo>
          <Campo rotulo="Observação (opcional)" htmlFor="obs">
            <Textarea id="obs" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} className="min-h-16" />
          </Campo>
          {erro && <p role="alert" className="rounded-xl bg-perigo-suave px-4 py-3 text-perigo text-sm">{erro}</p>}
          <DialogRodape>
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente || !cor || cor.estoque < 1}>
              {pendente && <LoaderCircleIcon className="animate-spin" />} Confirmar baixa
            </Button>
          </DialogRodape>
        </form>
      </DialogConteudo>
    </Dialog>
  );
}

export function DialogEntradaManual({ aberto, aoFechar, cores, corInicial, aoConcluir }: Base) {
  const [corId, setCorId] = useState(corInicial);
  const [qtd, setQtd] = useState(1);
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    if (aberto) {
      setCorId(corInicial);
      setQtd(1);
      setErro(null);
    }
  }, [aberto, corInicial]);

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await registrarEntradaManual({ corId, quantidade: qtd, observacao: obs });
      if (!r.ok) return setErro(r.erro);
      aoConcluir(corId, r.dados.estoque);
      toast.success("Entrada registrada");
      setObs("");
      aoFechar();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <DialogConteudo>
        <form onSubmit={confirmar} className="grid gap-5">
          <DialogCabecalho>
            <DialogTitulo>Entrada manual</DialogTitulo>
            <DialogDescricao>Soma unidades ao estoque desta cor.</DialogDescricao>
          </DialogCabecalho>
          <Campo rotulo="Cor">
            <SeletorCor cores={cores} valor={corId} aoMudar={setCorId} />
          </Campo>
          <Campo rotulo="Quantidade">
            <Quantidade valor={qtd} aoMudar={setQtd} />
          </Campo>
          <Campo rotulo="Observação" htmlFor="obs-entrada">
            <Input id="obs-entrada" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: devolução, mostruário…" maxLength={500} />
          </Campo>
          {erro && <p role="alert" className="rounded-xl bg-perigo-suave px-4 py-3 text-perigo text-sm">{erro}</p>}
          <DialogRodape>
            <Button type="button" variant="outline" onClick={aoFechar}>Cancelar</Button>
            <Button type="submit" disabled={pendente}>
              {pendente && <LoaderCircleIcon className="animate-spin" />} Dar entrada
            </Button>
          </DialogRodape>
        </form>
      </DialogConteudo>
    </Dialog>
  );
}

export function DialogAjuste({ aberto, aoFechar, cores, corInicial, aoConcluir }: Base) {
  const [corId, setCorId] = useState(corInicial);
  const cor = cores.find((c) => c.id === corId);
  const [novo, setNovo] = useState(String(cor?.estoque ?? 0));
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    if (aberto) {
      setCorId(corInicial);
      setErro(null);
    }
  }, [aberto, corInicial]);
  useEffect(() => setNovo(String(cor?.estoque ?? 0)), [cor?.estoque]);

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await ajustarEstoque({ corId, novoEstoque: novo, motivo });
      if (!r.ok) return setErro(r.erro);
      aoConcluir(corId, r.dados.estoque);
      toast.success("Estoque ajustado");
      setMotivo("");
      aoFechar();
    });
  }

  const diferenca = Number(novo) - (cor?.estoque ?? 0);

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <DialogConteudo>
        <form onSubmit={confirmar} className="grid gap-5">
          <DialogCabecalho>
            <DialogTitulo>Ajuste de estoque</DialogTitulo>
            <DialogDescricao>Use após uma contagem física. Fica registrado na auditoria.</DialogDescricao>
          </DialogCabecalho>
          <Campo rotulo="Cor">
            <SeletorCor cores={cores} valor={corId} aoMudar={setCorId} />
          </Campo>
          <Campo rotulo={`Estoque contado (atual: ${formatarNumero(cor?.estoque ?? 0)})`} htmlFor="novo">
            <div className="flex items-center gap-3">
              <Input id="novo" type="number" inputMode="numeric" min={0} value={novo} onChange={(e) => setNovo(e.target.value)} className="w-32 text-center font-semibold text-lg tabular" />
              {Number.isFinite(diferenca) && diferenca !== 0 && (
                <span className={cn("font-semibold tabular", diferenca > 0 ? "text-sucesso" : "text-perigo")}>
                  {diferenca > 0 ? "+" : ""}
                  {diferenca}
                </span>
              )}
            </div>
          </Campo>
          <Campo rotulo="Motivo" htmlFor="motivo">
            <Input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: inventário de novembro" required maxLength={500} />
          </Campo>
          {erro && <p role="alert" className="rounded-xl bg-perigo-suave px-4 py-3 text-perigo text-sm">{erro}</p>}
          <DialogRodape>
            <Button type="button" variant="outline" onClick={aoFechar}>Cancelar</Button>
            <Button type="submit" disabled={pendente}>
              {pendente && <LoaderCircleIcon className="animate-spin" />} Salvar ajuste
            </Button>
          </DialogRodape>
        </form>
      </DialogConteudo>
    </Dialog>
  );
}
