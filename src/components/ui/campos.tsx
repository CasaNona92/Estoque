import { Label as LabelPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

const baseCampo =
  "w-full min-w-0 rounded-xl border border-input bg-card px-3.5 text-[15px] text-foreground shadow-[inset_0_1px_0_rgb(0_0_0/0.02)] outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-perigo aria-invalid:ring-perigo/15";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(baseCampo, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(baseCampo, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        baseCampo,
        "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b655d%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:14px] bg-[right_0.9rem_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn("flex select-none items-center gap-2 font-medium text-[13px] text-foreground/85", className)}
      {...props}
    />
  );
}

export function Campo({
  rotulo,
  htmlFor,
  erro,
  dica,
  className,
  children,
}: {
  rotulo: string;
  htmlFor?: string;
  erro?: string | null;
  dica?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{rotulo}</Label>
      {children}
      {erro ? (
        <p role="alert" className="text-[13px] text-perigo">
          {erro}
        </p>
      ) : dica ? (
        <p className="text-[12px] text-muted-foreground">{dica}</p>
      ) : null}
    </div>
  );
}
