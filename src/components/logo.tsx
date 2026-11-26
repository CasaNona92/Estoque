import Link from "next/link";
import { NOME_LOJA } from "@/lib/loja";
import { cn } from "@/lib/utils";

/** Logo da Casa da Nona (fundo transparente). Original em marca/; gere as versões com `npm run preparar:logo`. */
export function LogoNona({ className, prioridade = false, pequeno = false }: { className?: string; prioridade?: boolean; pequeno?: boolean }) {
  return (
    // biome-ignore lint/performance/noImgElement: imagem estática já otimizada (images.unoptimized)
    <img
      src={pequeno ? "/marca/logo-cabecalho.webp" : "/marca/logo.webp"}
      alt={NOME_LOJA}
      width={1500}
      height={611}
      draggable={false}
      loading={prioridade ? "eager" : "lazy"}
      fetchPriority={prioridade ? "high" : "auto"}
      className={cn("h-10 w-auto select-none", className)}
    />
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("flex shrink-0 items-center rounded-xl outline-offset-4", className)} aria-label={`${NOME_LOJA} — início`}>
      <LogoNona pequeno prioridade className="h-11" />
    </Link>
  );
}
