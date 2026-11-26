"use client";

import { CheckIcon, LoaderCircleIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/campos";
import { cn } from "@/lib/utils";
import { type EstadoSenha, trocarSenha } from "./acoes";

export function FormTrocarSenha({ podeCancelar }: { podeCancelar: boolean }) {
  const [estado, acao, pendente] = useActionState<EstadoSenha, FormData>(trocarSenha, { erro: null });
  const [nova, setNova] = useState("");
  const [conf, setConf] = useState("");
  const regras = [
    { ok: nova.length >= 10, texto: "Pelo menos 10 caracteres" },
    { ok: nova.length > 0 && nova === conf, texto: "As duas senhas iguais" },
  ];

  return (
    <form action={acao} className="space-y-5">
      <Campo rotulo="Senha atual" htmlFor="senhaAtual" dica="No primeiro acesso, é a senha que o administrador passou.">
        <Input id="senhaAtual" name="senhaAtual" type="password" autoComplete="current-password" required />
      </Campo>
      <Campo rotulo="Nova senha" htmlFor="novaSenha">
        <Input
          id="novaSenha"
          name="novaSenha"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={72}
          required
          value={nova}
          onChange={(e) => setNova(e.target.value)}
        />
      </Campo>
      <Campo rotulo="Repita a nova senha" htmlFor="confirmacao">
        <Input
          id="confirmacao"
          name="confirmacao"
          type="password"
          autoComplete="new-password"
          required
          value={conf}
          onChange={(e) => setConf(e.target.value)}
        />
      </Campo>
      <ul className="space-y-1.5 text-sm">
        {regras.map((r) => (
          <li key={r.texto} className={cn("flex items-center gap-2", r.ok ? "text-sucesso" : "text-muted-foreground")}>
            <CheckIcon className={cn("size-4", !r.ok && "opacity-30")} /> {r.texto}
          </li>
        ))}
        <li className="text-muted-foreground text-xs">Senhas que já vazaram na internet são recusadas.</li>
      </ul>
      {estado.erro ? (
        <p role="alert" className="rounded-xl bg-perigo-suave px-4 py-3 text-perigo text-sm">
          {estado.erro}
        </p>
      ) : null}
      <div className="flex gap-3">
        {podeCancelar ? (
          <Button asChild variant="outline" className="flex-1">
            <Link href="/">Cancelar</Link>
          </Button>
        ) : null}
        <Button type="submit" className="flex-1" disabled={pendente}>
          {pendente ? <LoaderCircleIcon className="animate-spin" /> : null}
          Salvar nova senha
        </Button>
      </div>
    </form>
  );
}
