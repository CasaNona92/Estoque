import { expect, test } from "@playwright/test";
import { entrar, temCredenciais, vendedor } from "./ajuda";

test.describe("acesso negado", () => {
  test("sem login: páginas mandam para o login e a API responde 401", async ({ page, request }) => {
    await page.goto("/produtos");
    await expect(page).toHaveURL(/\/login\?voltar=%2Fprodutos/);
    for (const rota of ["/api/usuarios", "/api/busca?q=cadeira", "/api/produtos", "/api/auditoria", "/api/exportar?tabela=produtos"]) {
      const r = await request.get(rota);
      expect(r.status(), rota).toBe(401);
      expect(await r.text()).not.toMatch(/@|hash|token/i);
    }
    const assinar = await request.post("/api/r2/assinar", { data: { chaves: ["notas/00000000-0000-0000-0000-000000000000.xml"] } });
    expect(assinar.status()).toBe(401);
  });

  test("login com usuário inexistente mostra erro genérico", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Usuário ou e-mail").fill("ninguem-aqui@exemplo.com");
    await page.getByLabel("Senha", { exact: true }).fill("qualquer-coisa-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toHaveText("Usuário ou senha inválidos.");
  });

  test("não existe cadastro público", async ({ request }) => {
    for (const rota of ["/signup", "/cadastro", "/registrar"]) {
      const r = await request.get(rota, { maxRedirects: 0 });
      expect([307, 308, 401, 404]).toContain(r.status());
    }
  });

  test("headers de segurança presentes", async ({ request }) => {
    const r = await request.get("/login");
    const h = r.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBeTruthy();
    expect(h["strict-transport-security"]).toContain("max-age=");
  });

  test("vendedor (papel errado) não acessa administração nem entrada", async ({ page }) => {
    test.skip(!temCredenciais || !vendedor.usuario, "Defina E2E_VENDEDOR_USUARIO/E2E_VENDEDOR_SENHA");
    await entrar(page, vendedor);
    await page.goto("/admin");
    await expect(page).toHaveURL(/sem-permissao/);
    await page.goto("/entrada");
    await expect(page).toHaveURL(/sem-permissao/);
    const r = await page.request.get("/api/usuarios");
    expect(r.status()).toBe(403);
    const a = await page.request.get("/api/auditoria");
    expect(a.status()).toBe(403);
  });

  test("IDOR: id trocado na URL não revela nada", async ({ page }) => {
    test.skip(!temCredenciais, "Defina E2E_USUARIO/E2E_SENHA");
    await entrar(page);
    const r = await page.goto("/produtos/00000000-0000-4000-8000-000000000000");
    expect(r?.status()).toBe(404);
    const api = await page.request.get("/api/produtos/1%20or%201=1");
    expect(api.status()).toBe(404);
  });
});
