"use client";

import { ChevronDownIcon, LoaderCircleIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Card, EstadoVazio } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/campos";
import { formatarDataHora } from "@/lib/formatacao";
import { cn } from "@/lib/utils";

type Registro = {
  id: number;
  usuario_id: string | null;
  acao: string;
  tabela: string | null;
  registro_id: string | null;
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  criado_em: string;
};

const TABELAS = ["produtos", "produto_cores", "produto_fotos", "perfis", "notas_entrada", "movimentacoes", "fornecedores", "codigos_fornecedor", "configuracoes"];

/** Campos que mudaram entre antes e depois (texto — nunca HTML). */
function mudancas(a: Record<string, unknown> | null, d: Record<string, unknown> | null) {
  const chaves = new Set([...Object.keys(a ?? {}), ...Object.keys(d ?? {})]);
  return [...chaves]
    .filter((k) => JSON.stringify(a?.[k]) !== JSON.stringify(d?.[k]))
    .map((k) => ({ campo: k, antes: a?.[k], depois: d?.[k] }));
}

const mostrar = (v: unknown) => (v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v));

export function Auditoria({ usuarios }: { usuarios: Array<{ id: string; nome: string }> }) {
  const [filtros, setFiltros] = useState({ usuario: "", tabela: "", de: "", ate: "" });
  const [pagina, setPagina] = useState(0);
  const [dados, setDados] = useState<{ registros: Registro[]; total: number } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<number | null>(null);
  const nomes = Object.fromEntries(usuarios.map((u) => [u.id, u.nome]));

  const carregar = useCallback(async () => {
    setCarregando(true);
    const qs = new URLSearchParams({ pagina: String(pagina) });
    for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v);
    const r = await fetch(`/api/auditoria?${qs}`);
    setDados(r.ok ? await r.json() : { registros: [], total: 0 });
    setCarregando(false);
  }, [filtros, pagina]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Select value={filtros.usuario} onChange={(e) => { setPagina(0); setFiltros({ ...filtros, usuario: e.target.value }); }} className="w-48" aria-label="Usuário">
          <option value="">Todos os usuários</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </Select>
        <Select value={filtros.tabela} onChange={(e) => { setPagina(0); setFiltros({ ...filtros, tabela: e.target.value }); }} className="w-48" aria-label="Tabela">
          <option value="">Todas as tabelas</option>
          {TABELAS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <Input type="date" value={filtros.de} onChange={(e) => { setPagina(0); setFiltros({ ...filtros, de: e.target.value }); }} className="w-40" aria-label="De" />
        <Input type="date" value={filtros.ate} onChange={(e) => { setPagina(0); setFiltros({ ...filtros, ate: e.target.value }); }} className="w-40" aria-label="Até" />
        {carregando && <LoaderCircleIcon className="mb-3 size-4 animate-spin text-muted-foreground" />}
      </div>
      {dados && dados.registros.length === 0 ? (
        <EstadoVazio titulo="Nenhum registro com esses filtros" />
      ) : (
        <Card className="divide-y divide-border/60">
          {dados?.registros.map((r) => {
            const lista = mudancas(r.dados_antes, r.dados_depois);
            return (
              <div key={r.id}>
                <button type="button" onClick={() => setAberto((a) => (a === r.id ? null : r.id))} className="flex w-full items-center gap-4 px-5 py-3 text-left text-sm hover:bg-muted/40" aria-expanded={aberto === r.id}>
                  <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition", aberto === r.id && "rotate-180")} />
                  <span className="w-36 shrink-0 text-muted-foreground tabular">{formatarDataHora(r.criado_em)}</span>
                  <span className="w-36 shrink-0 truncate">{r.usuario_id ? (nomes[r.usuario_id] ?? "usuário removido") : "sistema"}</span>
                  <span className="font-medium">{r.acao}</span>
                  <span className="truncate text-muted-foreground">{r.tabela}</span>
                  <span className="ml-auto text-muted-foreground text-xs">{lista.length} campo(s)</span>
                </button>
                {aberto === r.id && (
                  <div className="overflow-x-auto bg-background/60 px-5 pb-4">
                    <table className="w-full text-xs">
                      <thead className="text-left text-muted-foreground">
                        <tr>
                          <th className="py-1.5 pr-4 font-medium">Campo</th>
                          <th className="py-1.5 pr-4 font-medium">Antes</th>
                          <th className="py-1.5 font-medium">Depois</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lista.map((m) => (
                          <tr key={m.campo} className="border-border/60 border-t align-top">
                            <td className="py-1.5 pr-4 font-mono">{m.campo}</td>
                            <td className="max-w-xs break-all py-1.5 pr-4 text-perigo">{mostrar(m.antes)}</td>
                            <td className="max-w-xs break-all py-1.5 text-sucesso">{mostrar(m.depois)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
      {dados && dados.total > 50 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
          <span className="text-muted-foreground text-sm">página {pagina + 1} de {Math.ceil(dados.total / 50)}</span>
          <Button variant="outline" size="sm" disabled={(pagina + 1) * 50 >= dados.total} onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
        </div>
      )}
    </div>
  );
}
