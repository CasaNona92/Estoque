import path from "node:path";
import { expect, test } from "@playwright/test";
import { biparUsb, entrar, temCredenciais } from "./ajuda";

test.describe("fluxo principal (seed aplicado)", () => {
  test.skip(!temCredenciais, "Defina E2E_USUARIO/E2E_SENHA (admin de um Supabase de TESTE com o seed)");

  test.beforeEach(async ({ page }) => {
    await entrar(page);
  });

  test("busca universal tolera erros e mostra sugestões", async ({ page }) => {
    await page.goto("/");
    const busca = page.getByRole("combobox", { name: "Buscar produto" });
    await busca.fill("cadera");
    await expect(page.getByRole("option").first()).toContainText("Cadeira");
    await busca.fill("mesa jantra");
    await expect(page.getByRole("option").first()).toContainText("Mesa de Jantar");
    await busca.press("Enter");
    await expect(page).toHaveURL(/\/produtos\/[0-9a-f-]{36}/);
  });

  test("código de barras (leitor USB simulado) abre o produto/cor", async ({ page }) => {
    await page.goto("/");
    await page.locator("body").click({ position: { x: 5, y: 300 } });
    await biparUsb(page, "2000000001012");
    await expect(page).toHaveURL(/\/produtos\/[0-9a-f-]{36}\?cor=/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Geladeira Frost Free Duplex Polar");
  });

  test("código desconhecido oferece cadastro", async ({ page }) => {
    await page.goto("/");
    await page.locator("body").click({ position: { x: 5, y: 300 } });
    await biparUsb(page, "2999999999993");
    await expect(page.getByText("Código não cadastrado")).toBeVisible();
    await expect(page.getByRole("link", { name: /Cadastrar produto com este código/ })).toBeVisible();
  });

  test("baixa pela janela flutuante, com Desfazer", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("combobox", { name: "Buscar produto" }).fill("cadeira eames");
    await page.getByRole("option").first().click();
    const estoque = page.locator("text=Estoque desta cor").locator("..").locator("span.text-4xl");
    const antes = Number((await estoque.textContent())?.replace(/\D/g, ""));
    await page.getByRole("button", { name: "Fazer Baixa" }).click();
    await page.getByLabel("Nome do cliente").fill("Cliente E2E");
    await page.getByRole("button", { name: "Confirmar baixa" }).click();
    await expect(page.getByText("Baixa registrada")).toBeVisible();
    await expect(estoque).toHaveText(String(antes - 1));
    await page.getByRole("button", { name: "Desfazer" }).click();
    await expect(page.getByText("Baixa desfeita")).toBeVisible();
    await expect(estoque).toHaveText(String(antes));
  });

  test("entrada por XML: lê, vincula, confirma e bloqueia duplicada", async ({ page }) => {
    await page.goto("/entrada");
    const xml = path.resolve(__dirname, "..", "..", "seed", "nfe-exemplo-2-geladeiras.xml");
    await page.locator('input[type="file"][accept*="xml"]').setInputFiles(xml);
    const ja = page.getByText(/Esta nota já deu entrada em/);
    if (await ja.isVisible({ timeout: 4000 }).catch(() => false)) {
      test.info().annotations.push({ type: "info", description: "Nota já lançada antes neste banco de teste — bloqueio conferido." });
      return;
    }
    await expect(page.getByText("POLAR ELETRO DISTRIBUIDORA LTDA")).toBeVisible();
    await expect(page.getByText(/vinculado\(s\)/)).toBeVisible({ timeout: 20_000 });
    // item 3 vem como sugestão: confirmar
    const confirmar = page.getByRole("button", { name: "Confirmar", exact: true });
    while (await confirmar.count()) await confirmar.first().click();
    await page.getByRole("button", { name: "Confirmar entrada" }).click();
    await expect(page.getByText("Entrada confirmada")).toBeVisible({ timeout: 30_000 });

    // a mesma nota de novo: bloqueada
    await page.locator('input[type="file"][accept*="xml"]').setInputFiles(xml);
    await expect(page.getByText(/Esta nota já deu entrada em \d{2}\/\d{2}\/\d{4} por/)).toBeVisible();
  });
});
