"use client";

import { CameraIcon, LinkIcon, MinusIcon, PackagePlusIcon, PlusIcon, ScanBarcodeIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { definirCodigoBarras } from "@/app/acoes/notas";
import { BolinhaCor } from "@/components/estoque";
import { LeitorCamera } from "@/components/leitor-camera";
import { Card, EstadoVazio } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogCabecalho, DialogConteudo, DialogDescricao, DialogRodape, DialogTitulo } from "@/components/ui/dialog";
import { procurarCodigo } from "@/hooks/use-busca";
import { useLeitorUsb } from "@/hooks/use-leitor-usb";
import { bipe } from "@/lib/cliente/bipe";
import { formatarNumero } from "@/lib/formatacao";
import { cn } from "@/lib/utils";
import { ConferenciaNota, type ItemConferencia } from "./conferencia";
import { SeletorProduto, type Vinculo } from "./seletor-produto";

type Linha = Vinculo & { qtd: number; codigo: string };

/** Modo "bipar": cada leitura soma +1 (leitor USB ou câmera do tablet). */
export function Bipar({ aoConcluir }: { aoConcluir: () => void }) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [camera, setCamera] = useState(false);
  const [desconhecido, setDesconhecido] = useState<string | null>(null);
  const [seletor, setSeletor] = useState<"buscar" | "cadastrar" | null>(null);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);

  function somar(v: Vinculo, codigo: string, qtd = 1) {
    setLinhas((l) => {
      const i = l.findIndex((x) => x.cor_id === v.cor_id);
      if (i >= 0) return l.map((x, k) => (k === i ? { ...x, qtd: x.qtd + qtd } : x));
      return [{ ...v, codigo, qtd }, ...l];
    });
    setUltimo(v.cor_id);
    setTimeout(() => setUltimo((u) => (u === v.cor_id ? null : u)), 500);
  }

  async function ler(codigo: string) {
    const conhecido = linhas.find((l) => l.codigo === codigo);
    if (conhecido) {
      bipe("ok");
      return somar(conhecido, codigo);
    }
    const p = await procurarCodigo(codigo);
    const cor = p?.cores.find((c) => c.id === p.cor_id);
    if (p && cor) {
      bipe("ok");
      somar({ cor_id: cor.id, produto: { id: p.produto_id, nome: p.nome, codigo: p.codigo, nome_cor: cor.nome_cor, cor_hex: cor.cor_hex, estoque: cor.estoque } }, codigo);
    } else {
      bipe("erro");
      setDesconhecido(codigo);
    }
  }

  useLeitorUsb(ler, !camera && !desconhecido && !seletor && !revisando);

  async function vincularDesconhecido(v: Vinculo) {
    if (!desconhecido) return;
    const r = await definirCodigoBarras({ corId: v.cor_id, codigo: desconhecido });
    if (!r.ok) return void toast.error(r.erro);
    toast.success("Código vinculado ao produto");
    somar(v, desconhecido);
    setDesconhecido(null);
  }

  if (revisando) {
    const itens: ItemConferencia[] = linhas.map((l, i) => ({
      n_item: i + 1,
      codigo_fornecedor: null,
      ean: l.codigo,
      descricao: `${l.produto.nome} — ${l.produto.nome_cor}`,
      unidade: "UN",
      quantidade_nota: l.qtd,
      valor_unitario: null,
      fator: 1,
      cor_id: l.cor_id,
      produto: l.produto,
      origem: "manual",
      situacao: "vinculado",
    }));
    return (
      <ConferenciaNota
        nota={{ origem: "manual", chave_acesso: null, numero: null, serie: null, data_emissao: null, valor_total: null, fornecedor: null, itens: [], avisos: [] }}
        arquivo={null}
        itensProntos={itens}
        aoCancelar={() => setRevisando(false)}
        aoConcluir={() => {
          setLinhas([]);
          setRevisando(false);
          aoConcluir();
        }}
      />
    );
  }

  const total = linhas.reduce((s, l) => s + l.qtd, 0);

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-suave text-accent-texto">
            <ScanBarcodeIcon className="size-7" />
          </div>
          <div>
            <h2 className="font-semibold">Bipe os produtos que estão entrando</h2>
            <p className="text-muted-foreground text-sm">Leitor USB: é só bipar. No tablet, use a câmera. Cada leitura soma 1.</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setCamera(true)}>
          <CameraIcon /> Usar a câmera
        </Button>
      </Card>

      {linhas.length === 0 ? (
        <EstadoVazio icone={<ScanBarcodeIcon />} titulo="Aguardando a primeira leitura" descricao="Os produtos bipados aparecem aqui com a quantidade." />
      ) : (
        <>
          <Card className="divide-y divide-border/60">
            {linhas.map((l) => (
              <div key={l.cor_id} className={cn("flex items-center gap-3 px-5 py-3 transition-colors", ultimo === l.cor_id && "bg-sucesso-suave")}>
                <BolinhaCor hex={l.produto.cor_hex} className="size-5" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{l.produto.nome}</p>
                  <p className="text-muted-foreground text-xs">
                    {l.produto.nome_cor} · <span className="font-mono">{l.codigo}</span>
                  </p>
                </div>
                <Button variant="outline" size="icon-sm" aria-label="Menos 1" onClick={() => setLinhas((x) => x.map((y) => (y.cor_id === l.cor_id ? { ...y, qtd: Math.max(1, y.qtd - 1) } : y)))}>
                  <MinusIcon />
                </Button>
                <span className="w-12 text-center font-semibold text-lg tabular">{l.qtd}</span>
                <Button variant="outline" size="icon-sm" aria-label="Mais 1" onClick={() => somar(l, l.codigo)}>
                  <PlusIcon />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Remover" onClick={() => setLinhas((x) => x.filter((y) => y.cor_id !== l.cor_id))}>
                  <Trash2Icon />
                </Button>
              </div>
            ))}
          </Card>
          <div className="flex items-center justify-between">
            <p className="text-sm">
              <strong className="tabular">{formatarNumero(total)}</strong> unidade(s) em {linhas.length} produto(s)
            </p>
            <Button size="lg" onClick={() => setRevisando(true)}>
              Revisar e confirmar entrada
            </Button>
          </div>
        </>
      )}

      <LeitorCamera aberto={camera} aoFechar={() => setCamera(false)} aoLer={(c) => void ler(c)} continuo titulo="Bipar entrada" />

      <Dialog open={Boolean(desconhecido) && !seletor} onOpenChange={(a) => !a && setDesconhecido(null)}>
        <DialogConteudo>
          <DialogCabecalho>
            <DialogTitulo>Código desconhecido</DialogTitulo>
            <DialogDescricao>
              O código <span className="font-mono text-foreground">{desconhecido}</span> não está em nenhum produto.
            </DialogDescricao>
          </DialogCabecalho>
          <DialogRodape>
            <Button variant="outline" onClick={() => setDesconhecido(null)}>
              Ignorar
            </Button>
            <Button variant="outline" onClick={() => setSeletor("buscar")}>
              <LinkIcon /> Vincular a produto existente
            </Button>
            <Button onClick={() => setSeletor("cadastrar")}>
              <PackagePlusIcon /> Cadastrar novo
            </Button>
          </DialogRodape>
        </DialogConteudo>
      </Dialog>

      <SeletorProduto
        key={seletor ?? "x"}
        aberto={Boolean(seletor)}
        aoFechar={() => {
          setSeletor(null);
        }}
        titulo={seletor === "cadastrar" ? "Cadastrar novo" : "Vincular a produto existente"}
        cadastroInicial={{ codigo_barras: desconhecido }}
        modoInicial={seletor ?? "buscar"}
        aoEscolher={(v) => {
          if (seletor === "cadastrar") {
            somar(v, desconhecido ?? "");
            setDesconhecido(null);
          } else void vincularDesconhecido(v);
        }}
      />
    </div>
  );
}
