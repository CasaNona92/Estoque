"use client";

let contexto: AudioContext | null = null;

/** Bipe curto (sucesso) ou grave (erro) — WebAudio, sem arquivo de som. */
export function bipe(tipo: "ok" | "erro" = "ok") {
  try {
    contexto ??= new AudioContext();
    const osc = contexto.createOscillator();
    const ganho = contexto.createGain();
    osc.type = tipo === "ok" ? "sine" : "square";
    osc.frequency.value = tipo === "ok" ? 1760 : 220;
    ganho.gain.setValueAtTime(0.0001, contexto.currentTime);
    ganho.gain.exponentialRampToValueAtTime(0.18, contexto.currentTime + 0.01);
    ganho.gain.exponentialRampToValueAtTime(0.0001, contexto.currentTime + (tipo === "ok" ? 0.12 : 0.3));
    osc.connect(ganho).connect(contexto.destination);
    osc.start();
    osc.stop(contexto.currentTime + (tipo === "ok" ? 0.13 : 0.32));
    if (tipo === "erro" && "vibrate" in navigator) navigator.vibrate?.(120);
  } catch {
    // sem áudio disponível
  }
}
