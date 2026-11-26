import { chaveNfeValida } from "./chave";
import { type ItemLido, limparTexto, lerNumero, type NotaLida } from "./tipos";

/**
 * Lê o XML da NF-e (modelo 55) NO NAVEGADOR com fast-xml-parser (carregado sob demanda).
 * Segurança: recusa DTD/entidades declaradas (XXE / "billion laughs"), valida a estrutura
 * básica e trata tudo como texto do usuário. O servidor valida de novo com zod.
 */
export async function interpretarXmlNfe(texto: string): Promise<NotaLida> {
  if (texto.length > 5 * 1024 * 1024) throw new Error("O XML pode ter no máximo 5 MB.");
  if (/<!DOCTYPE|<!ENTITY|<!ELEMENT|<!ATTLIST/i.test(texto)) {
    throw new Error("XML recusado: contém DTD/entidades (não é permitido por segurança).");
  }

  const { XMLParser, XMLValidator } = await import("fast-xml-parser");
  const valido = XMLValidator.validate(texto);
  if (valido !== true) throw new Error("O arquivo não é um XML válido.");

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: false, // mantém tudo como texto (códigos com zeros à esquerda)
    parseAttributeValue: false,
    trimValues: true,
    processEntities: true, // só as 5 entidades padrão do XML (DTD já foi recusada acima)
    htmlEntities: false,
    isArray: (nome) => nome === "det",
  });
  // biome-ignore lint/suspicious/noExplicitAny: estrutura dinâmica do XML
  const raiz: any = parser.parse(texto);
  const nfe = raiz?.nfeProc?.NFe ?? raiz?.NFe;
  const inf = nfe?.infNFe;
  if (!inf) throw new Error("Este XML não parece ser uma NF-e (não encontrei <infNFe>).");

  const avisos: string[] = [];
  const id = String(inf["@_Id"] ?? "");
  let chave = id.replace(/^NFe/, "").replace(/\D/g, "");
  const chaveProt = String(raiz?.nfeProc?.protNFe?.infProt?.chNFe ?? "").replace(/\D/g, "");
  if (!chaveNfeValida(chave) && chaveNfeValida(chaveProt)) chave = chaveProt;
  if (!chaveNfeValida(chave)) throw new Error("Chave de acesso ausente ou inválida no XML.");
  if (!raiz?.nfeProc?.protNFe) avisos.push("XML sem protocolo de autorização (nfeProc). Confira se a nota foi autorizada.");

  const ide = inf.ide ?? {};
  const modelo = String(ide.mod ?? "");
  if (modelo && modelo !== "55") avisos.push(`Modelo ${modelo} (esperado 55 — NF-e).`);
  const emit = inf.emit ?? {};
  const cnpj = String(emit.CNPJ ?? emit.CPF ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14 && cnpj.length !== 11) throw new Error("CNPJ/CPF do emitente ausente no XML.");
  const dataBruta = String(ide.dhEmi ?? ide.dEmi ?? "");
  const data = /^\d{4}-\d{2}-\d{2}/.test(dataBruta) ? dataBruta.slice(0, 10) : null;

  const dets = (inf.det ?? []) as Array<Record<string, unknown>>;
  if (!dets.length) throw new Error("A nota não tem itens (<det>).");
  if (dets.length > 990) throw new Error("A nota tem itens demais.");

  const itens: ItemLido[] = dets.map((d, i) => {
    // biome-ignore lint/suspicious/noExplicitAny: estrutura dinâmica do XML
    const prod: any = d.prod ?? {};
    const ean = [prod.cEAN, prod.cEANTrib].map((v) => String(v ?? "").replace(/\D/g, "")).find((v) => /^\d{8,14}$/.test(v)) ?? null;
    const quantidade = lerNumero(prod.qCom) ?? 0;
    if (quantidade <= 0) avisos.push(`Item ${i + 1}: quantidade inválida.`);
    return {
      n_item: Number(d["@_nItem"]) || i + 1,
      codigo_fornecedor: limparTexto(prod.cProd, 60) || null,
      ean,
      descricao: limparTexto(prod.xProd, 500) || `Item ${i + 1}`,
      unidade: limparTexto(prod.uCom, 10) || null,
      quantidade,
      valor_unitario: lerNumero(prod.vUnCom),
    };
  });

  return {
    origem: "xml",
    chave_acesso: chave,
    numero: limparTexto(ide.nNF, 20) || null,
    serie: limparTexto(ide.serie, 5) || null,
    data_emissao: data,
    valor_total: lerNumero(inf.total?.ICMSTot?.vNF),
    fornecedor: {
      cnpj,
      razao_social: limparTexto(emit.xNome, 200) || null,
      nome_fantasia: limparTexto(emit.xFant, 200) || null,
    },
    itens,
    avisos,
  };
}
