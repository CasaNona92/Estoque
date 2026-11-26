"use client";

import {
  HistoryIcon,
  HouseIcon,
  KeyRoundIcon,
  LogOutIcon,
  MoonIcon,
  PackageIcon,
  SettingsIcon,
  SunIcon,
  TruckIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useTransition } from "react";
import { definirTema } from "@/app/acoes/conta";
import { Logo } from "@/components/logo";
import { limparCachesLocais } from "@/components/pwa";
import { MenuConteudo, MenuGatilho, MenuItem, MenuRotulo, MenuSeparador, MenuSuspenso } from "@/components/ui/menus";
import { cn } from "@/lib/utils";

const ITENS = [
  { href: "/", rotulo: "Início", icone: HouseIcon, exige: null },
  { href: "/produtos", rotulo: "Produtos", icone: PackageIcon, exige: null },
  { href: "/entrada", rotulo: "Entrada de Mercadorias", curto: "Entrada", icone: TruckIcon, exige: "entrada" },
  { href: "/historico", rotulo: "Histórico", icone: HistoryIcon, exige: null },
  { href: "/admin", rotulo: "Administração", curto: "Admin", icone: SettingsIcon, exige: "admin" },
] as const;

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export function Cabecalho({
  nome,
  papel,
  podeEntrada,
  admin,
}: {
  nome: string;
  papel: string;
  podeEntrada: boolean;
  admin: boolean;
}) {
  const caminho = usePathname();
  const [, iniciar] = useTransition();
  const formSair = useRef<HTMLFormElement>(null);

  const itens = ITENS.filter((i) => !i.exige || (i.exige === "entrada" ? podeEntrada : admin));

  function alternarTema() {
    const escuro = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", escuro);
    iniciar(() => definirTema(escuro ? "escuro" : "claro"));
  }

  return (
    <header className="sticky top-0 z-40 border-border/60 border-b bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 md:px-6">
        <Logo />
        <nav aria-label="Principal" className="sem-scrollbar mx-auto flex items-center gap-1 overflow-x-auto">
          {itens.map((i) => {
            const ativo = i.href === "/" ? caminho === "/" : caminho.startsWith(i.href);
            const Icone = i.icone;
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "alvo-toque flex items-center gap-2 whitespace-nowrap rounded-xl px-3 font-medium text-[14px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  ativo && "bg-card text-foreground shadow-suave",
                )}
              >
                <Icone className="size-[18px]" aria-hidden />
                <span className="hidden lg:inline">{"curto" in i ? <><span className="xl:hidden">{i.curto}</span><span className="hidden xl:inline">{i.rotulo}</span></> : i.rotulo}</span>
                <span className="sr-only lg:hidden">{i.rotulo}</span>
              </Link>
            );
          })}
        </nav>
        <MenuSuspenso>
          <MenuGatilho className="alvo-toque flex items-center gap-2.5 rounded-xl px-1.5 transition hover:bg-muted" aria-label="Menu do usuário">
            <span className="hidden text-right leading-tight md:block">
              <span className="block font-medium text-[13px]">{nome}</span>
              <span className="block text-[11px] text-muted-foreground capitalize">{papel}</span>
            </span>
            <span className="flex size-9 items-center justify-center rounded-full bg-accent-suave font-semibold text-[13px] text-accent-texto">
              {iniciais(nome)}
            </span>
          </MenuGatilho>
          <MenuConteudo align="end">
            <MenuRotulo>
              <p className="font-medium text-sm">{nome}</p>
              <p className="text-muted-foreground text-xs capitalize">{papel}</p>
            </MenuRotulo>
            <MenuSeparador />
            <MenuItem onSelect={alternarTema}>
              <MoonIcon className="dark:hidden" />
              <SunIcon className="hidden dark:block" />
              <span className="dark:hidden">Tema escuro</span>
              <span className="hidden dark:inline">Tema claro</span>
            </MenuItem>
            <MenuItem asChild>
              <Link href="/trocar-senha">
                <KeyRoundIcon /> Trocar senha
              </Link>
            </MenuItem>
            <MenuSeparador />
            <MenuItem
              onSelect={async () => {
                await limparCachesLocais();
                formSair.current?.requestSubmit();
              }}
            >
              <LogOutIcon /> Sair
            </MenuItem>
          </MenuConteudo>
        </MenuSuspenso>
        <form ref={formSair} action="/sair" method="post" hidden />
      </div>
    </header>
  );
}
