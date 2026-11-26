-- =====================================================================
-- 0006 — Permissões (GRANT/REVOKE). Rode por último.
--   anon           → nada
--   authenticated  → SELECT (filtrado pela RLS) + EXECUTE nas funções públicas do app
--   service_role   → funções internas do servidor (login, sessões, e-mail)
-- =====================================================================

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Objetos criados no futuro também nascem fechados
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to authenticated;

-- Leitura (a RLS decide as linhas)
grant select on
  public.perfis, public.produtos, public.produto_cores, public.produto_fotos,
  public.fornecedores, public.codigos_fornecedor, public.notas_entrada, public.nota_itens,
  public.movimentacoes, public.auditoria, public.sistema_status, public.busca_vocabulario
to authenticated;
-- configurações: o hash do PIN nunca é legível
grant select (id, exigir_pin_cliente, estoque_minimo_padrao, atualizado_em) on public.configuracoes to authenticated;

-- Funções usadas pela RLS e pela busca (precisam de EXECUTE para o usuário logado)
grant execute on function
  public.sessao_valida(), public.usuario_ativo(), public.eh_admin(), public.pode_lancar_entrada(),
  public.meu_perfil(), public.f_unaccent(text), public.normalizar_busca(text), public.chave_nfe_valida(text)
to authenticated;

-- Funções do app
grant execute on function
  public.buscar_produtos(text, int),
  public.sugestao_busca(text),
  public.mais_vendidos(int, int),
  public.ultimas_baixas(int),
  public.registrar_baixa(uuid, int, text, text),
  public.desfazer_baixa(uuid),
  public.registrar_entrada_manual(uuid, int, text),
  public.ajustar_estoque(uuid, int, text),
  public.salvar_produto(jsonb),
  public.excluir_produto(uuid),
  public.registrar_foto(uuid, uuid, text, text, int),
  public.remover_foto(uuid),
  public.reordenar_fotos(uuid, uuid[]),
  public.definir_cor_foto(uuid, uuid),
  public.criar_nota_rascunho(jsonb),
  public.salvar_itens_nota(uuid, jsonb),
  public.confirmar_nota_entrada(uuid, int),
  public.cancelar_nota_entrada(uuid, text),
  public.descartar_rascunho(uuid),
  public.resolver_vinculos_nota(text, jsonb),
  public.importar_lote_produtos(jsonb),
  public.admin_atualizar_perfil(uuid, text, text, boolean, boolean),
  public.salvar_configuracoes(boolean, text, int),
  public.verificar_pin_cliente(text),
  public.uso_plano()
to authenticated;

-- Só o servidor (service_role)
grant execute on function
  public.login_bloqueado(text, text),
  public.registrar_tentativa_login(text, text, boolean),
  public.email_por_usuario(text),
  public.revogar_sessoes(uuid),
  public.registrar_status(text, text),
  public.limpar_rascunhos_antigos()
to service_role;
