"use client";

import { FileCode2Icon, FileTextIcon, InfoIcon, LoaderCircleIcon, ReceiptTextIcon, ScanBarcodeIcon, UploadCloudIcon, XCircleIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { consultarNota } from "@/app/acoes/notas";
import { Card } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { AbaConteudo, AbaGatilho, Abas, AbasLista } from "@/components/ui/menus";
import { detectarTipo, LIMITES, lerInicioArquivo } from "@/lib/magic-bytes";
import { lerDanfePdf } from "@/lib/nfe/pdf";
import type { NotaLida } from "@/lib/nfe/tipos";
import { interpretarXmlNfe } from "@/lib/nfe/xml";
import { cn } from "@/lib/utils";
import { Bipar } from "./bipar";
import { ConferenciaNota } from "./conferencia";
import { NotasLancadas } from "./notas-lancadas";
import { VisualizadorPdf } from "./visualizador-pdf";

type Fila = { arquivo: File; nota?: NotaLida; erro?: string; bloqueio?: string };

export function Entrada({ admin }: { admin: boolean }) {
  const [aba, setAba] = useState("xml");
  const [versao, setVersao] = useState(0);
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-6 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Entrada de Mercadorias</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            <InfoIcon className="mr-1.5 inline size-4 align-[-3px]" />
            Só para controle interno: o sistema apenas <strong className="font-medium">lê</strong> a nota recebida para somar ao estoque. Não emite nem escritura nada fiscal.
          </p>
        </div>
      </div>
      <Abas value={aba} onValueChange={setAba}>
        <AbasLista>
          <AbaGatilho value="xml">
            <FileCode2Icon /> <span className="sm:hidden">XML</span><span className="hidden sm:inline">Nota XML</span>
          </AbaGatilho>
          <AbaGatilho value="pdf">
            <FileTextIcon /> <span className="sm:hidden">PDF</span><span className="hidden sm:inline">Nota PDF</span>
          </AbaGatilho>
          <AbaGatilho value="bipar">
            <ScanBarcodeIcon /> <span className="sm:hidden">Bipar</span><span className="hidden sm:inline">Código de barras</span>
          </AbaGatilho>
          <AbaGatilho value="notas">
            <ReceiptTextIcon /> <span className="sm:hidden">Notas</span><span className="hidden sm:inline">Notas lançadas</span>
          </AbaGatilho>
        </AbasLista>
        <AbaConteudo value="xml">
          <EntradaXml aoConcluir={() => setVersao((v) => v + 1)} />
        </AbaConteudo>
        <AbaConteudo value="pdf">
          <EntradaPdf aoConcluir={() => setVersao((v) => v + 1)} />
        </AbaConteudo>
        <AbaConteudo value="bipar">
          <Bipar aoConcluir={() => setVersao((v) => v + 1)} />
        </AbaConteudo>
        <AbaConteudo value="notas">
          <NotasLancadas key={versao} admin={admin} />
        </AbaConteudo>
      </Abas>
    </div>
  );
}

function AreaSoltar({ aceita, multiplo, aoEscolher, texto, carregando }: { aceita: string; multiplo?: boolean; aoEscolher: (f: File[]) => void; texto: string; carregando?: boolean }) {
  const [sobre, setSobre] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSobre(false);
        aoEscolher(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-border border-dashed bg-card/60 px-6 py-14 text-center transition",
        sobre ? "border-accent bg-accent-suave/40" : "hover:border-foreground/25",
      )}
    >
      {carregando ? <LoaderCircleIcon className="size-9 animate-spin text-muted-foreground" /> : <UploadCloudIcon className="size-9 text-accent" />}
      <span className="font-medium">{texto}</span>
      <span className="text-muted-foreground text-sm">Arraste aqui ou toque para escolher · até 5 MB por arquivo</span>
      <input
        ref={input}
        type="file"
        accept={aceita}
        multiple={multiplo}
        hidden
        onChange={(e) => {
          aoEscolher(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </button>
  );
}

// ----------------------------------------------------------------- A) XML (forma principal)
function EntradaXml({ aoConcluir }: { aoConcluir: () => void }) {
  const [fila, setFila] = useState<Fila[]>([]);
  const [aberta, setAberta] = useState<number | null>(null);
  const [lendo, setLendo] = useState(false);

  const ler = useCallback(async (arquivos: File[]) => {
    setLendo(true);
    const novos: Fila[] = [];
    for (const arquivo of arquivos.slice(0, 20)) {
      try {
        if (arquivo.size > LIMITES.nota) throw new Error("Arquivo maior que 5 MB.");
        if (detectarTipo(await lerInicioArquivo(arquivo)) !== "xml") throw new Error("Não é um arquivo XML.");
        const nota = await interpretarXmlNfe(await arquivo.text());
        let bloqueio: string | undefined;
        if (nota.chave_acesso) {
          const r = await consultarNota(nota.chave_acesso);
          if (r.ok && r.dados.duplicada) bloqueio = r.dados.mensagem;
        }
        novos.push({ arquivo, nota, bloqueio });
      } catch (e) {
        novos.push({ arquivo, erro: (e as Error).message });
      }
    }
    setFila((f) => [...f, ...novos]);
    setLendo(false);
    const primeira = novos.findIndex((n) => n.nota && !n.bloqueio);
    if (primeira >= 0) setAberta(fila.length + primeira);
  }, [fila.length]);

  const atual = aberta !== null ? fila[aberta] : null;

  if (atual?.nota) {
    return (
      <ConferenciaNota
        key={aberta}
        nota={atual.nota}
        arquivo={atual.arquivo}
        aoCancelar={() => setAberta(null)}
        aoConcluir={() => {
          const restante = fila.filter((_, i) => i !== aberta);
          setFila(restante);
          const proxima = restante.findIndex((n) => n.nota && !n.bloqueio);
          setAberta(proxima >= 0 ? proxima : null);
          aoConcluir();
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <AreaSoltar aceita=".xml,text/xml,application/xml" multiplo aoEscolher={(f) => void ler(f)} texto="Solte um ou vários XML de NF-e" carregando={lendo} />
      {fila.length > 0 && (
        <Card className="divide-y divide-border/60">
          {fila.map((f, i) => (
            <div key={`${f.arquivo.name}-${i}`} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <FileCode2Icon className="size-5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{f.nota ? `${f.nota.fornecedor?.razao_social ?? "Fornecedor"} · NF ${f.nota.numero ?? "s/n"}` : f.arquivo.name}</p>
                <p className="text-muted-foreground text-xs">
                  {f.nota ? `${f.nota.itens.length} item(ns)` : f.arquivo.name}
                </p>
                {f.erro && <p className="mt-1 flex items-center gap-1 text-perigo text-sm"><XCircleIcon className="size-4" /> {f.erro}</p>}
                {f.bloqueio && <p className="mt-1 flex items-center gap-1 font-medium text-perigo text-sm"><XCircleIcon className="size-4" /> {f.bloqueio}</p>}
              </div>
              {f.nota && !f.bloqueio && (
                <Button size="sm" onClick={() => setAberta(i)}>
                  Conferir
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setFila((l) => l.filter((_, k) => k !== i))}>
                Remover
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- B) PDF (DANFE)
function EntradaPdf({ aoConcluir }: { aoConcluir: () => void }) {
  const [estado, setEstado] = useState<{ arquivo: File; nota: NotaLida; doc: unknown; bloqueio?: string } | null>(null);
  const [lendo, setLendo] = useState<string | null>(null);

  async function ler(arquivos: File[]) {
    const arquivo = arquivos[0];
    if (!arquivo) return;
    try {
      if (arquivo.size > LIMITES.nota) throw new Error("O PDF pode ter no máximo 5 MB.");
      if (detectarTipo(await lerInicioArquivo(arquivo)) !== "pdf") throw new Error("Não é um arquivo PDF.");
      setLendo("Abrindo o PDF…");
      const { nota, doc } = await lerDanfePdf(arquivo, setLendo);
      let bloqueio: string | undefined;
      if (nota.chave_acesso) {
        const r = await consultarNota(nota.chave_acesso);
        if (r.ok && r.dados.duplicada) bloqueio = r.dados.mensagem;
      }
      setEstado({ arquivo, nota, doc, bloqueio });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível ler o PDF.");
    } finally {
      setLendo(null);
    }
  }

  if (estado) {
    if (estado.bloqueio) {
      return (
        <Card className="space-y-4 p-6">
          <p className="flex items-center gap-2 font-medium text-perigo"><XCircleIcon className="size-5" /> {estado.bloqueio}</p>
          <Button variant="outline" onClick={() => setEstado(null)}>Voltar</Button>
        </Card>
      );
    }
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
        <div className="xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto">
          <p className="mb-2 text-muted-foreground text-sm">PDF original</p>
          <VisualizadorPdf doc={estado.doc} />
        </div>
        <ConferenciaNota
          nota={estado.nota}
          arquivo={estado.arquivo}
          editavel
          aoCancelar={() => setEstado(null)}
          aoConcluir={() => {
            setEstado(null);
            aoConcluir();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl bg-alerta-suave p-4 text-alerta text-sm">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <p>A leitura do PDF (DANFE) é <strong>aproximada</strong> — confira cada item antes de confirmar. Sempre que tiver o <strong>XML</strong>, prefira ele. PDF escaneado é lido por OCR (mais lento).</p>
      </div>
      <AreaSoltar aceita=".pdf,application/pdf" aoEscolher={(f) => void ler(f)} texto={lendo ?? "Solte o PDF da nota (DANFE)"} carregando={Boolean(lendo)} />
    </div>
  );
}
