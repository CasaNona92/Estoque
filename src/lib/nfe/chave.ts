/** Dígito verificador (módulo 11) da chave de acesso da NF-e/NFC-e. */
export function calcularDvChave(chave43: string): number {
  if (!/^\d{43}$/.test(chave43)) throw new Error("A base da chave precisa ter 43 dígitos");
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv >= 10 ? 0 : dv;
}

export function chaveNfeValida(chave: string | null | undefined): boolean {
  if (!chave || !/^\d{44}$/.test(chave)) return false;
  return calcularDvChave(chave.slice(0, 43)) === Number(chave[43]);
}

/** Formata em blocos de 4 para exibição: 3526 1112 3456 ... */
export function formatarChave(chave: string): string {
  return chave.replace(/(\d{4})(?=\d)/g, "$1 ");
}
