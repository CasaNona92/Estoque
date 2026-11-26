const FUSO = "America/Sao_Paulo";

const fmtData = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });
const fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtNumero = new Intl.NumberFormat("pt-BR");

/** dd/mm/aaaa */
export function formatarData(d: string | number | Date | null | undefined): string {
  if (!d) return "—";
  // datas puras (aaaa-mm-dd) não podem sofrer conversão de fuso
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [a, m, dia] = d.split("-");
    return `${dia}/${m}/${a}`;
  }
  return fmtData.format(new Date(d));
}

/** dd/mm/aaaa hh:mm */
export function formatarDataHora(d: string | number | Date | null | undefined): string {
  if (!d) return "—";
  return fmtDataHora.format(new Date(d)).replace(",", "");
}

/** "hoje 14:32", "ontem 09:10" ou "dd/mm/aaaa hh:mm" */
export function formatarQuando(d: string | number | Date): string {
  const data = new Date(d);
  const hoje = fmtData.format(new Date());
  const ontem = fmtData.format(new Date(Date.now() - 86_400_000));
  const dia = fmtData.format(data);
  if (dia === hoje) return `hoje ${fmtHora.format(data)}`;
  if (dia === ontem) return `ontem ${fmtHora.format(data)}`;
  return formatarDataHora(data);
}

export const formatarMoeda = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : fmtMoeda.format(Number(v));

export const formatarNumero = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : fmtNumero.format(Number(v));

export function formatarBytes(b: number | null | undefined): string {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: i ? 1 : 0 })} ${u[i]}`;
}

export function formatarCnpj(c: string | null | undefined): string {
  if (!c) return "—";
  const d = c.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return c;
}

/** Converte "dd/mm/aaaa" → "aaaa-mm-dd" (ou null). */
export function dataBrParaIso(v: string): string | null {
  const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
