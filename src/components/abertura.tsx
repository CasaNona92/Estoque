"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";

/**
 * Abertura: o logo da Casa da Nona chega com zoom (do desfoque para o foco), um brilho
 * passa por ele e então ele SE SEPARA — a parte laranja sobe e a faixa azul desce —
 * enquanto a tela se abre ao meio e revela o sistema.
 * Aparece uma vez por sessão do navegador (cookie de sessão); um toque pula.
 */
const ACIMA = "polygon(0 0, 100% 0, 100% 63%, 0 72%)";
const ABAIXO = "polygon(0 72%, 100% 63%, 100% 100%, 0 100%)";
const SUAVE = [0.76, 0, 0.24, 1] as const;

export function Abertura() {
  const reduzir = useReducedMotion();
  const [visivel, setVisivel] = useState(true);
  const [separar, setSeparar] = useState(false);

  const pular = useCallback(() => {
    setSeparar(true);
    setTimeout(() => setVisivel(false), reduzir ? 150 : 850);
  }, [reduzir]);

  useEffect(() => {
    document.cookie = `abertura=1; path=/; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    document.documentElement.style.overflow = "hidden";
    const t1 = setTimeout(() => setSeparar(true), reduzir ? 500 : 1550);
    const t2 = setTimeout(() => setVisivel(false), reduzir ? 800 : 2450);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      document.documentElement.style.overflow = "";
    };
  }, [reduzir]);

  useEffect(() => {
    if (!visivel) document.documentElement.style.overflow = "";
  }, [visivel]);

  const abrir = { duration: reduzir ? 0.2 : 0.85, ease: SUAVE };

  return (
    <AnimatePresence>
      {visivel && (
        <motion.div
          key="abertura"
          role="presentation"
          aria-hidden
          onClick={pular}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          className="fixed inset-0 z-[200] cursor-pointer select-none overflow-hidden"
        >
          {/* metades da tela que se abrem */}
          <motion.div
            className="absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(120%_120%_at_50%_100%,#ffffff_0%,#eef3ff_55%,#dbe6ff_100%)]"
            animate={separar ? { y: "-100%" } : { y: 0 }}
            transition={abrir}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(120%_120%_at_50%_0%,#ffffff_0%,#fff4e6_55%,#ffe3c2_100%)]"
            animate={separar ? { y: "100%" } : { y: 0 }}
            transition={abrir}
          />

          <div className="absolute inset-0 flex items-center justify-center">
            {/* zoom de chegada */}
            <motion.div
              className="relative aspect-[1500/611] w-[min(82vw,760px)]"
              initial={reduzir ? { opacity: 0 } : { scale: 0.18, opacity: 0, filter: "blur(18px)" }}
              animate={
                separar
                  ? { scale: reduzir ? 1 : 1.18, opacity: 1, filter: "blur(0px)" }
                  : { scale: 1, opacity: 1, filter: "blur(0px)" }
              }
              transition={separar ? abrir : { type: "spring", stiffness: 70, damping: 14, mass: 0.9 }}
            >
              {/* sombra que some ao separar */}
              <motion.div
                className="absolute inset-x-[8%] -bottom-[14%] h-[22%] rounded-[50%] bg-[#06308c]/25 blur-2xl"
                animate={{ opacity: separar ? 0 : 1 }}
                transition={{ duration: 0.3 }}
              />
              {/* parte de cima: "Casa da Nona" (laranja) */}
              {/* biome-ignore lint/performance/noImgElement: imagem estática */}
              <motion.img
                src="/marca/logo.webp"
                alt=""
                draggable={false}
                className="absolute inset-0 size-full"
                style={{ clipPath: ACIMA, WebkitClipPath: ACIMA }}
                animate={separar ? { y: "-62vh", rotate: -7, scale: 1.08 } : { y: 0, rotate: 0, scale: 1 }}
                transition={abrir}
              />
              {/* parte de baixo: faixa azul */}
              {/* biome-ignore lint/performance/noImgElement: imagem estática */}
              <motion.img
                src="/marca/logo.webp"
                alt=""
                draggable={false}
                className="absolute inset-0 size-full"
                style={{ clipPath: ABAIXO, WebkitClipPath: ABAIXO }}
                animate={separar ? { y: "62vh", rotate: 5, scale: 1.08 } : { y: 0, rotate: 0, scale: 1 }}
                transition={abrir}
              />
              {/* brilho que passa pelo logo antes de separar */}
              {!reduzir && (
                <motion.div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    maskImage: "url(/marca/logo.webp)",
                    WebkitMaskImage: "url(/marca/logo.webp)",
                    maskSize: "100% 100%",
                    WebkitMaskSize: "100% 100%",
                    background: "linear-gradient(100deg, transparent 35%, rgba(255,255,255,0.75) 50%, transparent 65%)",
                    backgroundSize: "260% 100%",
                  }}
                  initial={{ backgroundPositionX: "130%", opacity: 0 }}
                  animate={separar ? { opacity: 0 } : { backgroundPositionX: "-30%", opacity: 1 }}
                  transition={{ delay: 0.55, duration: 0.85, ease: "easeInOut" }}
                />
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
