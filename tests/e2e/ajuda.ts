import { expect, type Page } from "@playwright/test";

export const admin = { usuario: process.env.E2E_USUARIO ?? "", senha: process.env.E2E_SENHA ?? "" };
export const vendedor = { usuario: process.env.E2E_VENDEDOR_USUARIO ?? "", senha: process.env.E2E_VENDEDOR_SENHA ?? "" };
export const temCredenciais = Boolean(admin.usuario && admin.senha);

export async function entrar(page: Page, u = admin) {
  await page.goto("/login");
  await page.getByLabel("Usuário ou e-mail").fill(u.usuario);
  await page.getByLabel("Senha", { exact: true }).fill(u.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/login"));
}

/** Simula um leitor USB: digita muito rápido e termina com Enter. */
export async function biparUsb(page: Page, codigo: string) {
  for (const d of codigo) await page.keyboard.press(d, { delay: 0 });
  await page.keyboard.press("Enter");
}
