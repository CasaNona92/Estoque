"use client";

import { LoaderCircleIcon, ShieldCheckIcon } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/campos";
import { type EstadoInstalacao, instalar } from "./acoes";

export function FormInstalacao() {
  const [estado, acao, pendente] = useActionState<EstadoInstalacao, FormData>(instalar, { erro: null });
  return (
    <form action={acao} className="grid gap-4">
      <Campo rotulo="Seu nome" htmlFor="nome">
        <Input id="nome" name="nome" required maxLength={80} autoComplete="name" />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Usuário (para entrar)" htmlFor="usuario" dica="ex.: nona, admin">
          <Input id="usuario" name="usuario" required maxLength={30} autoCapitalize="none" autoComplete="username" />
        </Campo>
        <Campo rotulo="E-mail (opcional)" htmlFor="email">
          <Input id="email" name="email" type="email" maxLength={200} autoComplete="email" />
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Senha" htmlFor="senha" dica="mínimo 10 caracteres">
          <Input id="senha" name="senha" type="password" required minLength={10} maxLength={72} autoComplete="new-password" />
        </Campo>
        <Campo rotulo="Repita a senha" htmlFor="confirmacao">
          <Input id="confirmacao" name="confirmacao" type="password" required autoComplete="new-password" />
        </Campo>
      </div>
      <Campo rotulo="Código de instalação" htmlFor="codigo" dica="o valor da variável CODIGO_INSTALACAO">
        <Input id="codigo" name="codigo" type="password" required autoComplete="off" />
      </Campo>
      {estado.erro && (
        <p role="alert" className="rounded-xl bg-perigo-suave px-4 py-3 text-perigo text-sm">
          {estado.erro}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pendente}>
        {pendente ? <LoaderCircleIcon className="animate-spin" /> : <ShieldCheckIcon />}
        Criar administrador principal
      </Button>
    </form>
  );
}
