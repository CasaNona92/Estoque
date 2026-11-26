import { Badge } from "@/components/ui/basicos";
import { formatarNumero } from "@/lib/formatacao";
import { situacaoEstoque } from "@/lib/tipos";
import { cn } from "@/lib/utils";

/** Verde = ok · âmbar = abaixo do mínimo · vermelho = zerado */
export function BadgeEstoque({
  total,
  minimo,
  className,
  compacto = false,
}: {
  total: number;
  minimo: number;
  className?: string;
  compacto?: boolean;
}) {
  const s = situacaoEstoque(total, minimo);
  const variante = s === "ok" ? "ok" : s === "baixo" ? "baixo" : "zerado";
  const rotulo = s === "zerado" ? "Sem estoque" : s === "baixo" ? "Abaixo do mínimo" : "Em estoque";
  return (
    <Badge variant={variante} className={className} aria-label={`${total} em estoque — ${rotulo}`} title={rotulo}>
      <span aria-hidden className={cn("size-1.5 rounded-full bg-current")} />
      {formatarNumero(total)}
      {!compacto && <span className="font-medium opacity-80">{total === 1 ? "un." : "un."}</span>}
    </Badge>
  );
}

export function BolinhaCor({ hex, className, titulo }: { hex: string; className?: string; titulo?: string }) {
  return (
    <span
      title={titulo}
      aria-hidden={!titulo}
      className={cn("inline-block size-3.5 shrink-0 rounded-full ring-1 ring-black/10 ring-inset dark:ring-white/15", className)}
      style={{ backgroundColor: hex }}
    />
  );
}
