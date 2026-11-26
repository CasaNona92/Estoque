import { describe, expect, it } from "vitest";
import { lerEspecificacoes, lerNomeFoto } from "@/lib/cliente/planilha";
import { formatarData, formatarDataHora } from "@/lib/formatacao";
import { detectarTipo } from "@/lib/magic-bytes";
import { caminhoInternoSeguro } from "@/lib/utils";
import { esquemaBaixa, esquemaCabecalhoNota, esquemaLinhaImportacao, esquemaSenha } from "@/lib/validacao";

const bytes = (...b: number[]) => new Uint8Array(b);
const txt = (s: string) => new TextEncoder().encode(s);

describe("magic bytes", () => {
  it("reconhece os tipos aceitos e recusa SVG", () => {
    expect(detectarTipo(new Uint8Array([...txt("RIFF"), 0, 0, 0, 0, ...txt("WEBP")]))).toBe("webp");
    expect(detectarTipo(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(detectarTipo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(detectarTipo(txt("%PDF-1.7"))).toBe("pdf");
    expect(detectarTipo(bytes(0x50, 0x4b, 0x03, 0x04))).toBe("zip");
    expect(detectarTipo(txt('﻿  <?xml version="1.0"?><nfeProc>'))).toBe("xml");
    expect(detectarTipo(txt('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg">'))).toBe("svg");
    expect(detectarTipo(txt("MZ\x90\x00"))).toBe("desconhecido");
  });
});

describe("redirecionamento seguro", () => {
  it("só aceita caminhos internos", () => {
    expect(caminhoInternoSeguro("/produtos/1")).toBe("/produtos/1");
    expect(caminhoInternoSeguro("https://malicioso.com")).toBe("/");
    expect(caminhoInternoSeguro("//malicioso.com")).toBe("/");
    expect(caminhoInternoSeguro("/\\malicioso.com")).toBe("/");
    expect(caminhoInternoSeguro(null)).toBe("/");
  });
});

describe("validação (zod) — o servidor revalida tudo", () => {
  it("senha com no mínimo 10 caracteres", () => {
    expect(esquemaSenha.safeParse("curta").success).toBe(false);
    expect(esquemaSenha.safeParse("uma-senha-boa-2026").success).toBe(true);
  });

  it("baixa: quantidade inteira positiva e cliente obrigatório", () => {
    const corId = "6f1c2b9e-1d2a-4c3b-9e8f-1a2b3c4d5e6f";
    expect(esquemaBaixa.safeParse({ corId, quantidade: 0, cliente: "Ana" }).success).toBe(false);
    expect(esquemaBaixa.safeParse({ corId, quantidade: 1.5, cliente: "Ana" }).success).toBe(false);
    expect(esquemaBaixa.safeParse({ corId, quantidade: 2, cliente: " " }).success).toBe(false);
    expect(esquemaBaixa.safeParse({ corId: "1 or 1=1", quantidade: 2, cliente: "Ana" }).success).toBe(false);
    expect(esquemaBaixa.safeParse({ corId, quantidade: "2", cliente: "Ana" }).success).toBe(true);
  });

  it("cabeçalho da nota: chave com DV errado é recusada", () => {
    expect(esquemaCabecalhoNota.safeParse({ origem: "xml", chave_acesso: "43261111222333000181550010000123451482135796" }).success).toBe(false);
    expect(esquemaCabecalhoNota.safeParse({ origem: "xml", chave_acesso: "43261111222333000181550010000123451482135795" }).success).toBe(true);
    expect(esquemaCabecalhoNota.safeParse({ origem: "pdf", chave_r2_arquivo: "../../etc/passwd" }).success).toBe(false);
  });

  it("linha de importação", () => {
    expect(esquemaLinhaImportacao.safeParse({ linha: 2, codigo: "mv-1", nome: "Mesa" }).success).toBe(true);
    expect(esquemaLinhaImportacao.safeParse({ linha: 2, codigo: "MV 1; DROP", nome: "Mesa" }).success).toBe(false);
    expect(esquemaLinhaImportacao.safeParse({ linha: 2, codigo: "MV-1", nome: "Mesa", cor_hex: "vermelho" }).success).toBe(false);
  });
});

describe("planilha e fotos em lote", () => {
  it("lê especificações no formato 'Chave: valor; Chave: valor'", () => {
    expect(lerEspecificacoes("Largura: 180 cm; Material: MDF")).toEqual({ Largura: "180 cm", Material: "MDF" });
    expect(lerEspecificacoes("")).toEqual({});
  });

  it("lê nomes CODIGO_COR_N.jpg", () => {
    expect(lerNomeFoto("MV-0001_Natural_1.jpg")).toEqual({ codigo: "MV-0001", cor: "Natural", n: 1 });
    expect(lerNomeFoto("pasta/GEL-0002_Preto Fosco_2.JPG")).toEqual({ codigo: "GEL-0002", cor: "Preto Fosco", n: 2 });
    expect(lerNomeFoto("GEL-0002_Preto_Fosco_3.png")).toEqual({ codigo: "GEL-0002", cor: "Preto Fosco", n: 3 });
    expect(lerNomeFoto("foto qualquer.jpg")).toBeNull();
  });
});

describe("datas em pt-BR", () => {
  it("usa dd/mm/aaaa", () => {
    expect(formatarData("2026-11-25")).toBe("25/11/2026");
    expect(formatarDataHora("2026-11-25T15:30:00Z")).toBe("25/11/2026 12:30");
  });
});
