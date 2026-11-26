import { cva, type VariantProps } from "class-variance-authority";
import { Progress as ProgressPrimitive, Separator as SeparatorPrimitive, Switch as SwitchPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ Badge
const variantesBadge = cva(
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 font-semibold text-[12px] tabular",
  {
    variants: {
      variant: {
        ok: "bg-sucesso-suave text-sucesso",
        baixo: "bg-alerta-suave text-alerta",
        zerado: "bg-perigo-suave text-perigo",
        neutro: "bg-muted text-muted-foreground",
        acento: "bg-accent-suave text-accent-texto",
        contorno: "border border-border text-muted-foreground",
      },
    },
    defaultVariants: { variant: "neutro" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof variantesBadge>) {
  return <span data-slot="badge" className={cn(variantesBadge({ variant }), className)} {...props} />;
}

// ------------------------------------------------------------------ Card
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("rounded-2xl border border-border/70 bg-card text-card-foreground shadow-suave", className)}
      {...props}
    />
  );
}

export function CardCabecalho({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center justify-between gap-3 px-5 pt-5 pb-3", className)} {...props} />;
}

export function CardTitulo({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("font-semibold text-[15px] tracking-tight", className)} {...props} />;
}

export function CardConteudo({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

// ------------------------------------------------------------------ Skeleton
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-pulse rounded-xl bg-muted", className)} {...props} />;
}

// ------------------------------------------------------------------ Separator
export function Separador({ className, ...props }: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return <SeparatorPrimitive.Root className={cn("h-px w-full shrink-0 bg-border", className)} {...props} />;
}

// ------------------------------------------------------------------ Switch
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent bg-input transition-colors data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}

// ------------------------------------------------------------------ Progress
export function Progresso({ valor, className }: { valor: number; className?: string }) {
  return (
    <ProgressPrimitive.Root
      value={valor}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-accent transition-transform duration-300"
        style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, valor))}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

// ------------------------------------------------------------------ Estado vazio / erro
export function EstadoVazio({
  icone,
  titulo,
  descricao,
  acao,
  className,
}: {
  icone?: React.ReactNode;
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      {icone ? (
        <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-suave text-accent-texto [&_svg]:size-6">
          {icone}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-semibold text-[15px]">{titulo}</p>
        {descricao ? <p className="mx-auto max-w-sm text-muted-foreground text-sm">{descricao}</p> : null}
      </div>
      {acao}
    </div>
  );
}
