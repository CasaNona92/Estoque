import { expect, test } from "@playwright/test";
import { entrar, temCredenciais } from "./ajuda";

test.describe("modo cliente (tablet)", () => {
  test.skip(!temCredenciais, "Defina E2E_USUARIO/E2E_SENHA");

  test("mostra foto e cores, troca de cor e não mostra estoque", async ({ page }) => {
    await entrar(page);
    await page.goto("/");
    await page.getByRole("combobox", { name: "Buscar produto" }).fill("geladeira duplex");
    await page.getByRole("option").first().click();
    await page.getByRole("link", { name: "Mostrar ao cliente" }).first().click();
    await expect(page).toHaveURL(/\/cliente\//);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Geladeira");
    const cores = page.getByRole("radiogroup", { name: "Cores" }).getByRole("radio");
    await expect(cores).toHaveCount(3);
    await page.keyboard.press("ArrowDown");
    await expect(cores.nth(1)).toHaveAttribute("aria-checked", "true");
    await cores.nth(2).click();
    await expect(cores.nth(2)).toHaveAttribute("aria-checked", "true");

    // nada de estoque, histórico ou ações
    await expect(page.getByText(/em estoque|Fazer Baixa|Histórico/i)).toHaveCount(0);

    await page.getByRole("button", { name: "Descrição e especificações" }).click();
    await expect(page.getByText("Capacidade")).toBeVisible();
  });
});
