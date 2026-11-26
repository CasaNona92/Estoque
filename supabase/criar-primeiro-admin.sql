-- =====================================================================
-- Primeiro administrador (rode UMA vez, no SQL Editor do Supabase)
--
-- 1) Supabase → Authentication → Users → "Add user" → "Create new user"
--    e-mail + senha (mín. 10 caracteres), marque "Auto Confirm User".
-- 2) Troque os 3 valores abaixo e rode este script.
-- 3) Entre no sistema com o usuário (ou o e-mail) e a senha. No primeiro acesso
--    ele pede para trocar a senha.
-- =====================================================================
insert into public.perfis (id, nome, usuario, papel, pode_dar_entrada, ativo, precisa_trocar_senha)
select u.id, 'NOME DO ADMINISTRADOR', 'admin', 'admin', true, true, true
  from auth.users u
 where u.email = 'EMAIL-DO-ADMIN@exemplo.com'
on conflict (id) do update set papel = 'admin', ativo = true;
