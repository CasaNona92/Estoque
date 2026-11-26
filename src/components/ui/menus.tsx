"use client";

import { DropdownMenu as Menu, Tabs as TabsPrimitive, Tooltip as TooltipPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ Dropdown
export const MenuSuspenso = Menu.Root;
export const MenuGatilho = Menu.Trigger;

export function MenuConteudo({ className, sideOffset = 8, ...props }: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn(
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 z-50 min-w-56 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-media data-[state=closed]:animate-out data-[state=open]:animate-in",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function MenuItem({ className, ...props }: React.ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        "relative flex min-h-11 cursor-default select-none items-center gap-2.5 rounded-xl px-3 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-muted data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparador() {
  return <Menu.Separator className="-mx-1.5 my-1.5 h-px bg-border" />;
}

export function MenuRotulo({ className, ...props }: React.ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-3 py-2", className)} {...props} />;
}

// ------------------------------------------------------------------ Tabs
export const Abas = TabsPrimitive.Root;

export function AbasLista({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("sem-scrollbar flex w-full items-center gap-1 overflow-x-auto rounded-2xl bg-muted p-1 sm:inline-flex sm:w-auto sm:max-w-full", className)}
      {...props}
    />
  );
}

export function AbaGatilho({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-xl px-1.5 font-medium text-muted-foreground text-xs transition-all sm:h-10 sm:flex-none sm:flex-row sm:gap-2 sm:px-4 sm:text-sm hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-suave [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function AbaConteudo({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-6 outline-none", className)} {...props} />;
}

// ------------------------------------------------------------------ Tooltip
export function ProvedorDicas({ children }: { children: React.ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={250}>{children}</TooltipPrimitive.Provider>;
}

export function Dica({
  conteudo,
  children,
  lado = "top",
}: {
  conteudo: React.ReactNode;
  children: React.ReactNode;
  lado?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={lado}
          sideOffset={6}
          className="fade-in-0 zoom-in-95 z-50 max-w-xs animate-in rounded-xl bg-primary px-3 py-2 text-[13px] text-primary-foreground shadow-media"
        >
          {conteudo}
          <TooltipPrimitive.Arrow className="fill-primary" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
