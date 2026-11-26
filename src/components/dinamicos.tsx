"use client";

/**
 * Regra do Workers Free (≤ 3 MB): bibliotecas pesadas SÓ no navegador.
 * Estes componentes usam pdfjs-dist, tesseract.js, xlsx, @zxing/browser, jszip,
 * fast-xml-parser e browser-image-compression. Com `ssr: false`, o Next nem compila
 * esse código para o servidor — ele vai para o navegador, carregado sob demanda.
 */
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/basicos";

function Carregando() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 md:px-6" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-12 w-full max-w-xl" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

export const LeitorCamera = dynamic(() => import("./leitor-camera").then((m) => m.LeitorCamera), { ssr: false });

export const EntradaCliente = dynamic(() => import("./entrada/entrada").then((m) => m.Entrada), {
  ssr: false,
  loading: Carregando,
});

export const ImportacaoCliente = dynamic(() => import("./importacao/importacao").then((m) => m.Importacao), {
  ssr: false,
  loading: Carregando,
});

export const FormProdutoCliente = dynamic(() => import("./produto/form-produto").then((m) => m.FormProduto), {
  ssr: false,
  loading: Carregando,
});

export const BotaoExportar = dynamic(() => import("./admin/botao-exportar").then((m) => m.BotaoExportar), {
  ssr: false,
  loading: () => <Skeleton className="h-11 w-56" />,
});
