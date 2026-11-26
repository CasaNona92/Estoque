"use client";

import { EyeIcon, EyeOffIcon, LoaderCircleIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/campos";
import { type EstadoLogin, entrar } from "./acoes";

export function FormLogin({ voltar }: { voltar: string }) {
  const [estado, acao, pendente] = useActionState<EstadoLogin, FormData>(entrar, { erro: null });
  const [ver, setVer] = useState(false);

  return (
    <form action={acao} className="space-y-5" noValidate>
      <input type="hidden" name="voltar" value={voltar} />
      <Campo rotulo="Usuário ou e-mail" htmlFor="identificador">
        <Input
          id="identificador"
          name="identificador"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
          aria-invalid={Boolean(estado.erro) || undefined}
        />
      </Campo>
      <Campo rotulo="Senha" htmlFor="senha">
        <div className="relative">
          <Input
            id="senha"
            name="senha"
            type={ver ? "text" : "password"}
            autoComplete="current-password"
            required
            className="pr-12"
            aria-invalid={Boolean(estado.erro) || undefined}
          />
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            className="alvo-toque absolute top-0 right-0 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"
            aria-label={ver ? "Esconder senha" : "Mostrar senha"}
          >
            {ver ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
        </div>
      </Campo>
      {estado.erro ? (
        <p role="alert" className="rounded-xl bg-perigo-suave px-4 py-3 text-perigo text-sm">
          {estado.erro}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pendente}>
        {pendente ? <LoaderCircleIcon className="animate-spin" /> : null}
        Entrar
      </Button>
    </form>
  );
}
