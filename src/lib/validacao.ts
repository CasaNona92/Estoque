/**
 * Esquemas zod usados no NAVEGADOR (feedback rápido) e de novo no SERVIDOR
 * (a validação que vale). O banco valida uma terceira vez dentro das funções.
 */
import { z } from "zod";
import ptBR from "zod/v4/locales/pt-BR.js";
import { chaveNfeValida } from "@/lib/nfe/chave";

z.config(ptBR());

const texto = (min: number, max: number, campo: string) =>
  z
    .string()
    .trim()
    .min(min, min <= 1 ? `Informe ${campo}.` : `${campo} precisa ter pelo menos ${min} caracteres.`)
    .max(max, `${campo} pode ter no máximo ${max} caracteres.`);

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const uuid = z.uuid("Identificador inválido.");

// ---------------------------------------------------------------- login e senha
export const esquemaLogin = z.object({
  identificador: texto(3, 120, "o usuário ou e-mail").transform((v) => v.toLowerCase()),
  senha: z.string().min(1, "Informe a senha.").max(200),
  voltar: z.string().max(300).optional(),
});

export const esquemaSenha = z
  .string()
  .min(10, "A senha precisa ter pelo menos 10 caracteres.")
  .max(72, "A senha pode ter no máximo 72 caracteres.");

export const esquemaTrocarSenha = z
  .object({
    novaSenha: esquemaSenha,
    confirmacao: z.string(),
  })
  .refine((d) => d.novaSenha === d.confirmacao, { path: ["confirmacao"], message: "As senhas não conferem." });

// ---------------------------------------------------------------- estoque
export const esquemaBaixa = z.object({
  corId: uuid,
  quantidade: z.coerce.number().int("Use números inteiros.").min(1, "Mínimo 1.").max(100000),
  cliente: texto(2, 120, "O nome do cliente"),
  observacao: textoOpcional(500),
});

export const esquemaEntradaManual = z.object({
  corId: uuid,
  quantidade: z.coerce.number().int().min(1, "Mínimo 1.").max(100000),
  observacao: textoOpcional(500),
});

export const esquemaAjuste = z.object({
  corId: uuid,
  novoEstoque: z.coerce.number().int().min(0, "O estoque não pode ser negativo.").max(1000000),
  motivo: texto(3, 500, "O motivo"),
});

// ---------------------------------------------------------------- produto
export const REGEX_CODIGO = /^[A-Z0-9][A-Z0-9._/-]{0,39}$/;
export const REGEX_HEX = /^#[0-9A-Fa-f]{6}$/;

export const esquemaCor = z.object({
  id: uuid.optional().nullable(),
  nome_cor: texto(1, 60, "o nome da cor"),
  cor_hex: z.string().regex(REGEX_HEX, "Cor inválida."),
  codigo_barras: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || /^\d{8,14}$/.test(v), "O código de barras deve ter de 8 a 14 dígitos.")
    .transform((v) => v || null)
    .optional()
    .nullable(),
  estoque_inicial: z.coerce.number().int().min(0).max(100000).optional().nullable(),
});

export const esquemaProduto = z.object({
  id: uuid.optional().nullable(),
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(REGEX_CODIGO, "Código inválido: use letras, números, ponto, hífen ou barra (até 40)."),
  nome: texto(2, 160, "O nome"),
  categoria: texto(1, 80, "a categoria"),
  descricao: z.string().trim().max(5000).default(""),
  especificacoes: z
    .array(z.object({ chave: z.string().trim().min(1).max(60), valor: z.string().trim().max(200) }))
    .max(40)
    .default([]),
  estoque_minimo: z.coerce.number().int().min(0).max(100000),
  cores: z.array(esquemaCor).min(1, "Cadastre pelo menos uma cor.").max(50),
});
export type DadosProduto = z.infer<typeof esquemaProduto>;

// ---------------------------------------------------------------- nota de entrada
const digitos = (min: number, max: number) =>
  z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= min && v.length <= max);

export const esquemaCabecalhoNota = z.object({
  nota_id: uuid.optional().nullable(),
  chave_acesso: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || chaveNfeValida(v), "Chave de acesso inválida (confira os 44 dígitos).")
    .transform((v) => v || null)
    .optional()
    .nullable(),
  numero: z.string().trim().max(20).optional().nullable(),
  serie: z.string().trim().max(5).optional().nullable(),
  data_emissao: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  valor_total: z.coerce.number().min(0).max(1e11).optional().nullable(),
  origem: z.enum(["xml", "pdf", "manual"]),
  fornecedor: z
    .object({
      cnpj: digitos(11, 14),
      razao_social: z.string().trim().max(200).optional().nullable(),
      nome_fantasia: z.string().trim().max(200).optional().nullable(),
    })
    .optional()
    .nullable(),
  chave_r2_arquivo: z
    .string()
    .regex(/^notas\/[0-9a-f-]{36}\.(xml|pdf)$/)
    .optional()
    .nullable(),
  tamanho_arquivo_bytes: z.coerce.number().int().min(0).max(5 * 1024 * 1024).optional().nullable(),
  observacao: z.string().trim().max(500).optional().nullable(),
});
export type CabecalhoNota = z.infer<typeof esquemaCabecalhoNota>;

export const esquemaItemNota = z.object({
  n_item: z.coerce.number().int().min(1).max(990),
  codigo_fornecedor: z.string().trim().max(60).optional().nullable(),
  ean: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v && /^\d{8,14}$/.test(v) ? v : null)),
  descricao: z.string().trim().min(1).max(500),
  unidade: z.string().trim().max(10).optional().nullable(),
  quantidade_nota: z.coerce.number().positive().max(1000000),
  fator_conversao: z.coerce.number().positive().max(10000).default(1),
  valor_unitario: z.coerce.number().min(0).optional().nullable(),
  cor_id: uuid.optional().nullable(),
  status: z.enum(["vinculado", "novo_produto", "ignorado"]),
});
export type ItemNota = z.infer<typeof esquemaItemNota>;

export const TAMANHO_LOTE = 25;
export const esquemaLoteItens = z.array(esquemaItemNota).min(1).max(TAMANHO_LOTE, `No máximo ${TAMANHO_LOTE} itens por lote.`);

// ---------------------------------------------------------------- importação por planilha
export const esquemaLinhaImportacao = z.object({
  linha: z.number().int().min(1),
  codigo: z.string().trim().toUpperCase().regex(REGEX_CODIGO, "código inválido"),
  nome: z.string().trim().min(2, "nome obrigatório").max(160),
  categoria: z.string().trim().max(80).optional().nullable(),
  descricao: z.string().trim().max(5000).optional().nullable(),
  cor: z.string().trim().max(60).optional().nullable(),
  cor_hex: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => !v || REGEX_HEX.test(v), "cor_hex inválido (use #RRGGBB)"),
  codigo_barras: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => !v || /^\d{8,14}$/.test(v.replace(/\D/g, "")), "código de barras deve ter de 8 a 14 dígitos"),
  estoque: z.number().int().min(0).max(100000).optional().nullable(),
  estoque_minimo: z.number().int().min(0).max(100000).optional().nullable(),
  especificacoes: z.record(z.string().max(60), z.string().max(200)).default({}),
});
export type LinhaImportacao = z.infer<typeof esquemaLinhaImportacao>;
export const esquemaLoteImportacao = z.array(esquemaLinhaImportacao).min(1).max(TAMANHO_LOTE);

// ---------------------------------------------------------------- fotos e arquivos
export const esquemaPedidoUploadFoto = z.object({
  produtoId: uuid,
  tamanho: z.number().int().min(1000).max(600 * 1024, "Foto grande demais depois da compressão."),
  tamanhoMiniatura: z.number().int().min(200).max(120 * 1024),
});

export const esquemaConfirmarFoto = z.object({
  produtoId: uuid,
  corId: uuid.optional().nullable(),
  arquivoId: uuid,
});

export const esquemaPedidoUploadNota = z.object({
  tipo: z.enum(["xml", "pdf"]),
  tamanho: z.number().int().min(100).max(5 * 1024 * 1024, "A nota pode ter no máximo 5 MB."),
});

// ---------------------------------------------------------------- administração
export const esquemaNovoUsuario = z.object({
  nome: texto(2, 80, "O nome"),
  usuario: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,30}$/, "Usuário: 3 a 30 letras minúsculas, números, ponto, hífen ou _."),
  email: z.union([z.literal(""), z.email("E-mail inválido.").max(200)]).default(""),
  papel: z.enum(["admin", "vendedor"]),
  pode_dar_entrada: z.boolean(),
  senha: esquemaSenha,
});

export const esquemaEditarUsuario = z.object({
  id: uuid,
  nome: texto(2, 80, "O nome"),
  papel: z.enum(["admin", "vendedor"]),
  pode_dar_entrada: z.boolean(),
  ativo: z.boolean(),
});

export const esquemaConfiguracoes = z.object({
  exigir_pin: z.boolean(),
  pin: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => !v || /^\d{4,8}$/.test(v), "O PIN deve ter de 4 a 8 números."),
  estoque_minimo_padrao: z.coerce.number().int().min(0).max(100000),
});

/** Primeira mensagem de erro do zod, para mostrar num toast. */
export function primeiraMensagem(e: z.ZodError): string {
  const i = e.issues[0];
  return i?.message ?? "Dados inválidos.";
}
