"use client";

import { useEffect, useRef } from "react";

/**
 * Leitor de código de barras USB: ele "digita" muito rápido e termina com Enter.
 * Capturamos sequências de 8–14 dígitos com menos de ~40 ms entre teclas.
 * - Fora de campos de texto: captura sempre.
 * - Dentro de um campo marcado com data-aceita-leitor: também captura (ex.: busca).
 */
export function useLeitorUsb(aoLer: (codigo: string) => void, ativo = true) {
  const buffer = useRef("");
  const ultimo = useRef(0);
  const callback = useRef(aoLer);
  callback.current = aoLer;

  useEffect(() => {
    if (!ativo) return;
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const emCampo = alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      if (emCampo && !alvo.closest("[data-aceita-leitor]")) return;

      const agora = performance.now();
      const intervalo = agora - ultimo.current;
      ultimo.current = agora;

      if (e.key === "Enter") {
        const codigo = buffer.current;
        buffer.current = "";
        if (/^\d{8,14}$/.test(codigo) && intervalo < 80) {
          e.preventDefault();
          e.stopPropagation();
          callback.current(codigo);
        }
        return;
      }
      if (/^\d$/.test(e.key)) {
        buffer.current = intervalo > 60 ? e.key : buffer.current + e.key;
        if (buffer.current.length > 14) buffer.current = buffer.current.slice(-14);
      } else if (e.key.length === 1) {
        buffer.current = "";
      }
    }
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [ativo]);
}
