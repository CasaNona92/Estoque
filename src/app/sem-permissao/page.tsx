import { LockIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EstadoVazio } from "@/components/ui/basicos";

export const metadata = { title: "Sem permissão" };

export default function SemPermissao() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <EstadoVazio
        icone={<LockIcon />}
        titulo="Você não tem permissão para esta área"
        descricao="Peça ao administrador para liberar o acesso, se precisar."
        acao={
          <Button asChild variant="outline">
            <Link href="/">Voltar ao início</Link>
          </Button>
        }
      />
    </main>
  );
}
