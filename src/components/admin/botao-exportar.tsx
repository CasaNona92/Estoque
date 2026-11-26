"use client";

import { DownloadIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** "Exportar tudo agora": busca as tabelas em páginas e monta o .xlsx no navegador. */
export function BotaoExportar() {
  const [exportando, setExportando] = useState<string | null>(null);

  async function exportar() {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      for (const [tabela, titulo] of [
        ["produtos", "Produtos"],
        ["cores", "Cores e estoque"],
        ["movimentacoes", "Movimentações"],
      ] as const) {
        const linhas: Record<string, unknown>[] = [];
        for (let p = 0; ; p++) {
          setExportando(`${titulo}: ${linhas.length} linha(s)…`);
          const r = await fetch(`/api/exportar?tabela=${tabela}&pagina=${p}`);
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro ?? "Falha ao exportar");
          const j = (await r.json()) as { linhas: Record<string, unknown>[]; fim: boolean };
          linhas.push(...j.linhas.map((l) => achatar(l)));
          if (j.fim) break;
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), titulo);
      }
      const hoje = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `estoque-exportacao-${hoje}.xlsx`);
      toast.success("Exportação pronta");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExportando(null);
    }
  }

  return (
    <Button onClick={() => void exportar()} disabled={Boolean(exportando)}>
      {exportando ? <LoaderCircleIcon className="animate-spin" /> : <DownloadIcon />}
      {exportando ?? "Exportar tudo agora (.xlsx)"}
    </Button>
  );
}

/** { produto: { codigo } } → { produto_codigo } para a planilha */
function achatar(o: Record<string, unknown>, prefixo = ""): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    const chave = prefixo ? `${prefixo}_${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (k === "especificacoes") {
        r[chave] = Object.entries(v as Record<string, unknown>)
          .map(([a, b]) => `${a}: ${b}`)
          .join("; ");
      } else Object.assign(r, achatar(v as Record<string, unknown>, chave));
    } else r[chave] = v;
  }
  return r;
}
