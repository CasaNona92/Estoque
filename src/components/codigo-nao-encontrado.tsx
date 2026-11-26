"use client";

import { PackagePlusIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogCabecalho,
  DialogConteudo,
  DialogDescricao,
  DialogRodape,
  DialogTitulo,
} from "@/components/ui/dialog";

export function CodigoNaoEncontrado({
  codigo,
  aoFechar,
  podeCadastrar,
}: {
  codigo: string | null;
  aoFechar: () => void;
  podeCadastrar: boolean;
}) {
  return (
    <Dialog open={Boolean(codigo)} onOpenChange={(a) => !a && aoFechar()}>
      <DialogConteudo>
        <DialogCabecalho>
          <DialogTitulo>Código não cadastrado</DialogTitulo>
          <DialogDescricao>
            Nenhum produto tem o código <span className="font-mono text-foreground">{codigo}</span>.
          </DialogDescricao>
        </DialogCabecalho>
        <DialogRodape>
          <Button variant="outline" onClick={aoFechar}>
            Fechar
          </Button>
          {podeCadastrar ? (
            <Button asChild>
              <Link href={`/produtos/novo?codigo_barras=${encodeURIComponent(codigo ?? "")}`}>
                <PackagePlusIcon /> Cadastrar produto com este código
              </Link>
            </Button>
          ) : null}
        </DialogRodape>
      </DialogConteudo>
    </Dialog>
  );
}
