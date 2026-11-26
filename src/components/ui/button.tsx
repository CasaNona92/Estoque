import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

const variantesBotao = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium text-sm transition-[background-color,color,box-shadow,transform] duration-150 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-suave hover:bg-primary/90",
        acento: "bg-accent text-accent-foreground shadow-suave hover:bg-accent/90",
        outline: "border border-border bg-card text-foreground hover:bg-muted",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-foreground hover:bg-muted",
        perigo: "bg-perigo text-white shadow-suave hover:bg-perigo/90",
        link: "h-auto px-0 text-accent-texto underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 rounded-lg px-3 text-[13px]",
        lg: "h-12 px-6 text-base",
        icon: "size-11",
        "icon-sm": "size-9 rounded-lg",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof variantesBotao> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(variantesBotao({ variant, size, className }))} {...props} />;
}

export { variantesBotao };
