"use client";

import { useEffect, useRef } from "react";

/** Mostra as páginas do PDF original (renderizadas pelo pdf.js) ao lado dos itens editáveis. */
// biome-ignore lint/suspicious/noExplicitAny: documento do pdfjs carregado dinamicamente
export function VisualizadorPdf({ doc }: { doc: any }) {
  const area = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    const alvo = area.current;
    if (!alvo || !doc) return;
    alvo.replaceChildren();
    (async () => {
      for (let n = 1; n <= Math.min(doc.numPages, 6); n++) {
        if (cancelado) return;
        const pagina = await doc.getPage(n);
        const largura = alvo.clientWidth || 600;
        const base = pagina.getViewport({ scale: 1 });
        const viewport = pagina.getViewport({ scale: (largura / base.width) * (window.devicePixelRatio || 1) });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = "100%";
        canvas.className = "rounded-xl border border-border bg-white shadow-suave";
        canvas.setAttribute("aria-label", `Página ${n} do PDF`);
        alvo.appendChild(canvas);
        await pagina.render({ canvas, viewport }).promise;
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [doc]);

  return <div ref={area} className="space-y-3" />;
}
