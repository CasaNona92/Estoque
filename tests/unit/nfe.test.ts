import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calcularDvChave, chaveNfeValida } from "@/lib/nfe/chave";
import { interpretarTextoDanfe } from "@/lib/nfe/pdf";
import { interpretarXmlNfe } from "@/lib/nfe/xml";

const SEED = path.resolve(__dirname, "..", "..", "seed");
const ler = (f: string) => readFileSync(path.join(SEED, f), "utf8");

describe("chave de acesso", () => {
  it("calcula e confere o dígito verificador (módulo 11)", () => {
    expect(chaveNfeValida("43261111222333000181550010000123451482135795")).toBe(true);
    expect(chaveNfeValida("43261111222333000181550010000123451482135796")).toBe(false);
    expect(chaveNfeValida("123")).toBe(false);
    expect(calcularDvChave("4326111122233300018155001000012345148213579")).toBe(5);
  });
});

describe("parser de XML da NF-e", () => {
  it("lê cabeçalho, emitente e itens da nota de móveis", async () => {
    const n = await interpretarXmlNfe(ler("nfe-exemplo-1-moveis.xml"));
    expect(n.chave_acesso).toBe("43261111222333000181550010000123451482135795");
    expect(n.numero).toBe("12345");
    expect(n.serie).toBe("1");
    expect(n.data_emissao).toBe("2026-11-18");
    expect(n.valor_total).toBe(11370);
    expect(n.fornecedor).toEqual({ cnpj: "11222333000181", razao_social: "MOVEIS SERRA GAUCHA INDUSTRIA LTDA", nome_fantasia: "Serra Gaucha Moveis" });
    expect(n.itens).toHaveLength(4);
    expect(n.itens[0]).toMatchObject({ n_item: 1, codigo_fornecedor: "SG-1001", ean: null, unidade: "CX", quantidade: 2, valor_unitario: 1480 });
    expect(n.itens[1].ean).toBe("2000000000022");
    expect(n.avisos).toHaveLength(0);
  });

  it("lê a nota das geladeiras com EAN", async () => {
    const n = await interpretarXmlNfe(ler("nfe-exemplo-2-geladeiras.xml"));
    expect(n.itens.map((i) => i.ean)).toEqual(["2000000001012", "2000000001029", null]);
    expect(n.itens[0].quantidade).toBe(3);
  });

  it("decodifica entidades padrão (&amp;) sem executar nada", async () => {
    const xml = ler("nfe-exemplo-1-moveis.xml").replace("MOVEIS SERRA GAUCHA INDUSTRIA LTDA", "M&amp;S MOVEIS LTDA");
    const n = await interpretarXmlNfe(xml);
    expect(n.fornecedor?.razao_social).toBe("M&S MOVEIS LTDA");
  });

  it("recusa DTD/entidades (XXE e 'billion laughs')", async () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><nfeProc>&e;</nfeProc>`;
    await expect(interpretarXmlNfe(xxe)).rejects.toThrow(/DTD/);
    const bomba = `<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><r>&b;</r>`;
    await expect(interpretarXmlNfe(bomba)).rejects.toThrow(/DTD/);
  });

  it("recusa XML que não é NF-e ou com chave inválida", async () => {
    await expect(interpretarXmlNfe("<pedido><item/></pedido>")).rejects.toThrow(/NF-e/);
    const chaveRuim = ler("nfe-exemplo-2-geladeiras.xml").replaceAll("35261145789123000191550020000048211735190468", "35261145789123000191550020000048211735190469");
    await expect(interpretarXmlNfe(chaveRuim)).rejects.toThrow(/Chave/);
    await expect(interpretarXmlNfe("<nfeProc><NFe>")).rejects.toThrow(/XML válido/);
  });

  it("remove caracteres de controle do texto extraído", async () => {
    const xml = ler("nfe-exemplo-2-geladeiras.xml").replace("GELADEIRA FROST FREE DUPLEX POLAR 410L INOX 127V", "GELADEIRA\u0007 INOX");
    const n = await interpretarXmlNfe(xml);
    expect(n.itens[0].descricao).toBe("GELADEIRA INOX");
  });
});

describe("leitura do DANFE em PDF", () => {
  it("extrai chave, número, CNPJ, data, total e itens do PDF de exemplo", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const dados = new Uint8Array(readFileSync(path.join(SEED, "danfe-exemplo.pdf")));
    const doc = await pdfjs.getDocument({ data: dados, useSystemFonts: false }).promise;
    const pagina = await doc.getPage(1);
    const conteudo = await pagina.getTextContent();
    const linhas = new Map<number, Array<{ x: number; s: string }>>();
    for (const item of conteudo.items as Array<{ str: string; transform: number[] }>) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      const l = linhas.get(y) ?? [];
      l.push({ x: item.transform[4], s: item.str });
      linhas.set(y, l);
    }
    const texto = [...linhas.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, i]) => i.sort((a, b) => a.x - b.x).map((x) => x.s).join(" ").replace(/\s+/g, " ").trim());

    const n = interpretarTextoDanfe(texto);
    expect(n.chave_acesso).toBe("41261109361247000108550010000009871112233444");
    expect(n.numero).toBe("000000987");
    expect(n.serie).toBe("1");
    expect(n.fornecedor?.cnpj).toBe("09361247000108");
    expect(n.fornecedor?.razao_social).toBe("MÓVEIS ARAUCÁRIA INDÚSTRIA LTDA");
    expect(n.data_emissao).toBe("2026-11-22");
    expect(n.valor_total).toBe(7140);
    expect(n.itens).toHaveLength(4);
    expect(n.itens[0]).toMatchObject({ codigo_fornecedor: "AR-501", descricao: "RACK PARA TV BARI 180CM FREIJO", unidade: "UN", quantidade: 3, valor_unitario: 890 });
    expect(n.itens[3].quantidade).toBe(4);
  });
});
