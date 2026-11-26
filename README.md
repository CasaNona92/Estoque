# Estoque e Vitrine — Casa da Nona

<p align="center"><img src="public/marca/logo.webp" alt="Casa da Nona" width="420"></p>

Sistema **interno** (só funcionários, com login) para controlar o estoque **por cor**, dar entrada em mercadorias lendo o XML/PDF da nota do fornecedor, registrar baixas e mostrar os produtos ao cliente no balcão (Modo Cliente, com a foto em destaque).

**Custo-alvo: R$ 0/mês** — tudo cabe nos planos grátis: Supabase Free (banco + login), Cloudflare R2 (fotos e notas, 10 GB), Vercel (testes), Cloudflare Workers Free (produção) e GitHub Actions (backups).

> **Regras da loja**
> - **Nada fiscal.** O sistema só **lê** a nota recebida (XML, PDF ou bipagem) para **somar ao estoque**. Não emite, não gera e não escritura nenhum documento fiscal; não fala com a SEFAZ.
> - **Baixa só manual**, pela janela flutuante **"Fazer Baixa"** no detalhe do produto. Bipar um código só **abre** o produto; a planilha nunca altera o estoque de cores que já existem.

---

## Sumário
1. [Como funciona](#1-como-funciona)
2. [Rodar no seu computador](#2-rodar-no-seu-computador)
3. [Supabase (banco + login)](#3-supabase-banco--login)
4. [Cloudflare R2 (fotos, notas e backups)](#4-cloudflare-r2-fotos-notas-e-backups)
5. [Variáveis de ambiente](#5-variáveis-de-ambiente)
6. [Deploy na Vercel e no Cloudflare Workers](#6-deploy-na-vercel-e-no-cloudflare-workers)
7. [GitHub Actions (backup e manutenção)](#7-github-actions-backup-e-manutenção)
8. [Como restaurar um backup](#8-como-restaurar-um-backup)
9. [Leitor de código de barras USB](#9-leitor-de-código-de-barras-usb)
10. [Fotos fictícias e dados de teste](#10-fotos-fictícias-e-dados-de-teste)
11. [Limites dos planos grátis](#11-limites-dos-planos-grátis)
12. [Testes](#12-testes)
13. [Segurança — checklist da seção 8, item por item](#13-segurança--checklist-da-seção-8-item-por-item)
14. [Compatibilidade com o Workers Free — seção 2, item por item](#14-compatibilidade-com-o-workers-free--seção-2-item-por-item)
15. [Decisões técnicas](#15-decisões-técnicas)

---

## 1. Como funciona

```
 Navegador (PC / tablet)                     Servidor (Vercel ou Cloudflare Worker)          Serviços
 ───────────────────────                     ─────────────────────────────────────          ─────────
 • lê XML / PDF / OCR / planilha             • confere sessão + papel em toda rota          Supabase Postgres
 • comprime fotos (WebP 1600 + 400 px)  ──►  • valida tudo de novo com zod             ──►  (RLS em todas as tabelas,
 • lê código de barras (USB/câmera)          • chama UMA função Postgres por lote          funções de estoque)
 • envia arquivos DIRETO ao R2  ───────┐     • assina URLs do R2 (cálculo local)
                                       └──────────────────────────────────────────────►  Cloudflare R2 (privado)
```

| Tela | O que faz |
|---|---|
| **Início** | Busca grande no centro que sobe ao digitar, sugestões em tempo real (estoque em verde/âmbar/vermelho + miniaturas), câmera/leitor de código de barras, cards *Histórico de Baixas* e *Mais Vendidos* (7/30/90 dias). |
| **Produtos** | Lista/grade, filtros (categoria, cor, sem estoque/abaixo do mínimo), scroll infinito, mini carrossel, estoque por cor no tooltip. |
| **Detalhe** | Foto grande, cores, estoque da cor, código de barras, especificações, **Fazer Baixa** (com *Desfazer* por 10 s), outras cores; para quem pode: Editar, Entrada manual, Ajuste (admin) e movimentações. |
| **Modo Cliente** | Tela cheia, foto ocupando quase tudo, ◀ ▶ / swipe nas fotos, ↑ ↓ / swipe vertical / roda do mouse nas cores, pilha de cartas, bolinhas nas cores reais, painel de descrição, sem estoque, saída com PIN opcional. |
| **Entrada de Mercadorias** | XML (principal), PDF/DANFE (aproximado, com OCR), bipagem; conferência com vínculo automático (memória do fornecedor → EAN → sugestão), fator de conversão, estoque antes → depois, conferência de carga (faltas/sobras), histórico e cancelamento (admin). |
| **Histórico** | Todas as movimentações com filtros. |
| **Administração** | Usuários, PIN do Modo Cliente, estoque mínimo padrão, auditoria filtrável, último backup, exportar tudo (.xlsx) e uso do plano grátis. |
| **Abertura** | Ao abrir o sistema (uma vez por sessão), o logo da Casa da Nona chega com zoom, recebe um brilho e se separa — a parte laranja sobe, a faixa azul desce — enquanto a tela se abre. Um toque pula; quem usa "reduzir movimento" vê uma versão curta. |

**Permissões:** `vendedor` busca, vê, faz baixa e usa o Modo Cliente. `pode_dar_entrada` libera entrada de mercadorias, cadastro e importação. `admin` faz tudo, inclusive ajuste de estoque, cancelamento de nota e administração.

---

## 2. Rodar no seu computador

Requisitos: **Node.js 24+**.

```powershell
npm install
```
```powershell
copy .env.example .env.local
```
Preencha o `.env.local` (seções 3 a 5) e rode:
```powershell
npm run dev
```
Abra http://localhost:3000.

---

## 3. Supabase (banco + login)

1. Em https://supabase.com crie um projeto **Free** — região **South America (São Paulo)**. Escolha uma **senha do banco** forte e guarde num gerenciador de senhas.
2. **Desative o cadastro público:** *Authentication → Sign In / Providers →* desligue **"Allow new users to sign up"**. Em *Authentication → Policies/Settings*, deixe senha mínima de 10 caracteres.
3. **Crie as tabelas:** *SQL Editor → New query*, cole o conteúdo de [`supabase/tudo-em-um.sql`](supabase/tudo-em-um.sql) e rode (é a junção, em ordem, das migrações de `supabase/migrations/`; para regenerar: `npm run juntar:migracoes`). Quem usa o Supabase CLI pode rodar `npx supabase db push`.
4. **Dados de exemplo (opcional):** rode [`supabase/seed.sql`](supabase/seed.sql) — 20 móveis + 2 geladeiras de teste.
5. **Login principal (administrador):** defina a variável secreta `CODIGO_INSTALACAO` (um código longo que só você sabe — seção 5), abra o sistema e clique em **"Primeiro acesso? Criar o administrador principal"** na tela de login (ou vá em `/primeiro-acesso`). Escolha nome, usuário e senha e digite o código. Essa tela **só funciona enquanto não existe nenhum usuário** e some depois. Em seguida, entre com esse login e crie os outros em **Administração → Usuários** (o e-mail é opcional: sem e-mail, o funcionário entra pelo nome de usuário). *Alternativa manual:* [`supabase/criar-primeiro-admin.sql`](supabase/criar-primeiro-admin.sql).
6. **Chaves** (*Project Settings → API Keys*): `Project URL` → `SUPABASE_URL`; chave **anon/publishable** → `SUPABASE_ANON_KEY`; chave **service_role/secret** → `SUPABASE_SERVICE_ROLE_KEY` (**só no servidor**, nunca com `NEXT_PUBLIC_`).
7. **Connection string para os backups:** *Connect → Session pooler* (IPv4 — o GitHub Actions não tem IPv6). Vai no secret `SUPABASE_DB_URL` do GitHub.

---

## 4. Cloudflare R2 (fotos, notas e backups)

1. No painel da Cloudflare: **R2 Object Storage** → ative o R2 (o plano grátis exige cadastrar uma forma de pagamento, mas não cobra dentro dos 10 GB).
2. Crie **2 buckets privados** (sem domínio público, sem "Public Access"):
   - `estoque-fotos` — fotos dos produtos e arquivos das notas;
   - `estoque-backups` — backups do banco.
3. **CORS do `estoque-fotos`** (*bucket → Settings → CORS Policy*): cole [`scripts/r2-cors.json`](scripts/r2-cors.json) trocando os domínios pelos seus (Vercel, Workers e `http://localhost:3000` só enquanto testa). Libera só `GET/PUT/HEAD` desses domínios.
4. **Chaves de acesso** (*R2 → Manage API Tokens → Create Account API token*):
   - **App:** permissão *Object Read & Write*, **só** no bucket `estoque-fotos` → `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.
   - **Backups:** permissão *Object Read & Write*, **só** no bucket `estoque-backups` → `R2_BACKUP_ACCESS_KEY_ID` / `R2_BACKUP_SECRET_ACCESS_KEY`. (O R2 não oferece token "só escrita"; por isso é um token separado, limitado a esse bucket. O backup é criptografado: quem tiver esse token não consegue ler os dados sem a chave privada do age.)
   - O **Account ID** aparece na página do R2 → `R2_ACCOUNT_ID`.

---

## 5. Variáveis de ambiente

| Variável | Onde pegar | Pública? |
|---|---|---|
| `SUPABASE_URL` | Supabase → API | não |
| `SUPABASE_ANON_KEY` | Supabase → API (anon/publishable) | não* |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API (service_role/secret) | **NUNCA** |
| `R2_ACCOUNT_ID` | Cloudflare → R2 | não |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | token do bucket `estoque-fotos` | **NUNCA** |
| `R2_BUCKET` | `estoque-fotos` | não |
| `NEXT_PUBLIC_NOME_LOJA` | nome que aparece nas telas (`Casa da Nona`) | sim |
| `CODIGO_INSTALACAO` | invente um código longo (12+ caracteres); só serve para criar o 1º administrador — pode apagar depois | **NUNCA** |
| `DOMINIO_EMAIL_INTERNO` | domínio dos e-mails internos de quem não tem e-mail (padrão `casadanona.local`) | não |

\* O navegador nunca fala direto com o Supabase: todo acesso passa pelo servidor, e os cookies de sessão são `httpOnly`.

- **Local:** `.env.local` (já no `.gitignore`).
- **Vercel:** *Project → Settings → Environment Variables*.
- **Cloudflare:** para cada segredo, `npx wrangler secret put NOME_DA_VARIAVEL` (o `NEXT_PUBLIC_NOME_LOJA` fica em `vars` no `wrangler.jsonc`). Para testar o Worker localmente, copie `.dev.vars.example` → `.dev.vars`.

---

## 6. Deploy na Vercel e no Cloudflare Workers

O **mesmo código** roda nos dois.

**Vercel (desenvolvimento e testes)** — importe o repositório em vercel.com (framework: Next.js) e configure as variáveis, ou pela linha de comando:
```powershell
npm run deploy:vercel
```

**Cloudflare Workers Free (produção)** — com o adaptador oficial `@opennextjs/cloudflare`:
```powershell
npx wrangler login
```
```powershell
npm run deploy:cloudflare
```
Esse comando faz o build, **confere que o Worker tem menos de 3 MB (gzip)** e publica. Depois do primeiro deploy, coloque o endereço `*.workers.dev` no CORS do bucket (seção 4).

O build (`scripts/build-cloudflare.mjs`) tira o `.env.local` do caminho enquanto compila, porque o adaptador copiaria esses valores para dentro do Worker. No fim, ele procura cada chave secreta nos arquivos gerados e **cancela a publicação** se achar alguma. Em produção, os segredos ficam só no `wrangler secret`.

Endereço atual: **https://estoque-casa-da-nona.casanona9273.workers.dev**

---

## 7. GitHub Actions (backup e manutenção)

Use um **repositório privado**. Em *Settings → Secrets and variables → Actions → New repository secret*:

| Secret | Para quê |
|---|---|
| `SUPABASE_DB_URL` | connection string do **Session pooler** |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | ping do manter-ativo (opcional) |
| `R2_ACCOUNT_ID` | endpoint do R2 |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | limpeza de arquivos (bucket de fotos) |
| `R2_BACKUP_ACCESS_KEY_ID`, `R2_BACKUP_SECRET_ACCESS_KEY` | backups (bucket `estoque-backups`) |

**Chave do age (criptografia dos backups):** no SEU computador:
```powershell
winget install FiloSottile.age
```
```powershell
age-keygen -o chave-privada-backup.txt
```
Copie a linha `age1...` (chave pública) para [`backup/chave-publica-age.txt`](backup/chave-publica-age.txt) e faça commit. **Guarde `chave-privada-backup.txt` fora do GitHub** (pendrive/cofre). Sem ela, ninguém abre os backups — nem você.

| Workflow | Quando | O que faz |
|---|---|---|
| `backup-banco.yml` | todo dia 02:00 (Brasília) | `pg_dump` → `tar.gz` → criptografa com age → envia ao `estoque-backups` (`diario/`, `semanal/` aos domingos, `mensal/` no dia 1) → apaga os antigos (**7 diários, 8 semanais, 12 mensais**) → registra a data no sistema. Se falhar, o GitHub manda e-mail. |
| `manter-ativo.yml` | a cada 3 dias | consulta leve para o Supabase Free não pausar. |
| `limpar-arquivos.yml` | todo dia | apaga do R2 o que está em `arquivos_pendentes_exclusao` e rascunhos de nota abandonados. |
| `teste-restauracao.yml` | manual | baixa o último backup, restaura num Postgres temporário e confere as contagens. |
| `ci.yml` | a cada push/PR | gitleaks, tipos, testes (com Postgres real), build Vercel + Cloudflare e **checagem dos 3 MB**. |

**Cópia mensal para o HD externo:** [`scripts/copiar-fotos-local.bat`](scripts/copiar-fotos-local.bat) (Windows + rclone). Instale com `winget install Rclone.Rclone`, configure os remotes com `rclone config` (modelo em [`scripts/rclone-exemplo.conf`](scripts/rclone-exemplo.conf)), ajuste a letra do HD e dê dois cliques. Dá para agendar no *Agendador de Tarefas* do Windows.

---

## 8. Como restaurar um backup

**Provar que funciona (sem mexer em nada):** crie o secret `AGE_CHAVE_PRIVADA_TESTE` com o conteúdo de `chave-privada-backup.txt`, rode *Actions → Teste de restauração do backup → Run workflow* e **apague o secret** ao terminar.

**Restaurar de verdade (ex.: projeto perdido):**
1. Baixe o arquivo desejado do bucket `estoque-backups` (painel do R2, ou `rclone copy r2-backups:estoque-backups/diario/estoque-AAAA-MM-DD.tar.gz.age .`).
2. Descriptografe e descompacte:
   ```powershell
   age -d -i chave-privada-backup.txt -o backup.tar.gz estoque-AAAA-MM-DD.tar.gz.age
   ```
   ```powershell
   tar -xzf backup.tar.gz
   ```
3. Crie um projeto Supabase novo (seção 3, passos 1–2, **sem** rodar as migrações). No *SQL Editor* rode:
   ```sql
   create extension if not exists unaccent with schema extensions;
   create extension if not exists pg_trgm with schema extensions;
   create extension if not exists fuzzystrmatch with schema extensions;
   ```
4. Com o cliente PostgreSQL 18 (`winget install PostgreSQL.PostgreSQL.18`), usando a connection string do **Session pooler** do projeto novo, restaure **primeiro as contas** e **depois os dados do app**:
   ```powershell
   pg_restore --no-owner --data-only --schema=auth --table=users --table=identities -d "COLE_A_CONNECTION_STRING" estoque-AAAA-MM-DD.dump
   ```
   ```powershell
   pg_restore --no-owner --schema=public -d "COLE_A_CONNECTION_STRING" estoque-AAAA-MM-DD.dump
   ```
5. No *SQL Editor*, rode de novo as migrações `20261125000006_permissoes.sql`, `…07_listagem.sql` e `…08_codigo_barras.sql` (são idempotentes) para garantir as permissões exatas.
6. Atualize `SUPABASE_URL` e as chaves na Vercel/Cloudflare e no GitHub. As **fotos não precisam ser restauradas**: continuam no R2 (e há a cópia no HD externo).

---

## 9. Leitor de código de barras USB

- Use um leitor **USB "teclado" (HID)** — a maioria já vem assim. Não precisa de driver.
- Configure o leitor (pelos códigos do manual) para enviar **Enter (CR)** no fim de cada leitura. Desative prefixos/sufixos extras.
- No Windows, deixe o teclado em **Português (Brasil) ABNT2** igual ao do leitor (ou configure o leitor para "US keyboard" se o Windows estiver em US) — senão os dígitos podem sair trocados.
- Teste: abra o Bloco de Notas e bipe um produto — deve aparecer o número inteiro seguido de uma quebra de linha.
- No sistema não é preciso clicar em nada: na **Início** e em **Produtos**, bipar abre o produto direto; em **Entrada → Código de barras**, cada bipe soma 1; nos campos de código de barras do cadastro, o bipe preenche o campo (o Enter do leitor não envia o formulário).
- No tablet, use o ícone de **câmera** (BarcodeDetector nativo, com reserva em `@zxing/browser`).

---

## 10. Fotos fictícias e dados de teste

- [`supabase/seed.sql`](supabase/seed.sql): 20 móveis + **2 geladeiras de teste** (`GEL-0001` Frost Free Duplex 410 L — Inox/Branca/Preta; `GEL-0002` French Door 540 L — Inox/Preto Fosco), com vendas de exemplo.
- `npm run gerar:fotos` cria **ilustrações fictícias** em `seed/fotos/` no padrão `CODIGO_COR_N.jpg` (2 por cor; 3 para as geladeiras). Para enviar: compacte a pasta e use *Produtos → Importar → Fotos em lote*, ou rode `npm run enviar:fotos` (usa o `.env.local`).
- `seed/nfe-exemplo-1-moveis.xml`, `seed/nfe-exemplo-2-geladeiras.xml` e `seed/danfe-exemplo.pdf`: **arquivos fictícios de teste** (dados inventados, sem valor fiscal) só para testar a **leitura**. O sistema não gera notas.
- `seed/modelo-importacao.xlsx`: modelo da planilha de importação (o mesmo do botão *Baixar modelo*).

---

## 11. Limites dos planos grátis

| Serviço | Limite grátis | Onde acompanhar | O que fazer ao chegar perto (80%) |
|---|---|---|---|
| Supabase banco | 500 MB | *Administração → Backup e plano* | O banco guarda só texto; a maior tabela é `auditoria`/`movimentacoes`. Exporte e apague auditoria antiga, ou passe para o Pro (US$ 25). |
| Supabase pausa | 7 dias sem uso | `manter-ativo.yml` | Já automatizado. |
| R2 armazenamento | 10 GB | *Administração → Backup e plano* | Cada foto (principal + miniatura) fica com ~150 KB; 10 GB ≈ 70 mil fotos. Remova fotos de produtos excluídos (automático) ou pague o excedente (US$ 0,015/GB). |
| R2 operações | 1 mi escritas / 10 mi leituras por mês | painel do R2 | Folga enorme para 3 usuários. |
| Workers Free | 100 mil requisições/dia; Worker ≤ 3 MB; ~10 ms de CPU por requisição | painel da Cloudflare | O Worker está com ~2,1 MB. Se aparecer erro 1102 (CPU), use a Vercel em produção ou o Workers Paid (US$ 5). |
| GitHub Actions | 2.000 min/mês (repo privado) | *Settings → Billing* | Os workflows gastam poucos minutos por dia. |

---

## 12. Testes

```powershell
npm test
```
- **Unitários** (`tests/unit`): parser de XML (inclui recusa de DTD/XXE), leitura do DANFE em PDF, magic bytes, validações zod, datas `dd/mm/aaaa`.
- **Banco** (`tests/db`): funções de estoque (baixa, estoque negativo, desfazer, nota **atômica**, nota **duplicada**, cancelamento com estorno, importação em lote atômica, permissões/RLS, sessão revogada, PIN) e a **tabela da busca universal** (`cadera`, `cadeiraa`, `cadeora`, `sofa retratil`, `guardaroupa`, `rack 180`, `mesa jantra`, código de barras) com 10 mil produtos. Rodam no **PGlite** (Postgres em WASM) sem instalar nada; com `TEST_DATABASE_URL` rodam num Postgres real e incluem o teste de **concorrência** (8 vendedores ao mesmo tempo) — é o que o CI faz.
- **E2E** (`tests/e2e`, Playwright): login, busca, código de barras simulado, entrada por XML, baixa com desfazer, Modo Cliente, acesso negado sem login e com papel errado, IDOR e headers. Precisam de um Supabase **de teste** com o seed:
  ```powershell
  npm run build
  ```
  ```powershell
  npm run test:e2e
  ```
- **Tamanho do Worker:** `npm run build:cloudflare` e depois `npm run verificar:worker` (falha acima de 3 MB).

---

## 13. Segurança — checklist da seção 8, item por item

| # | Ataque | Como foi tratado |
|---|---|---|
| 1 | Login com e-mail qualquer | Sessão validada **no servidor**: o middleware confere o JWT em toda rota; cada página/Server Action/rota chama `obterSessao()`/`autorizar()`, que valida o JWT e consulta `meu_perfil()` (só devolve se o perfil está ativo **e** a sessão ainda existe). A RLS repete a checagem no banco. |
| 2 | `/api/usuarios` acessado direto | Toda rota exige sessão (401) e papel (403); `/api/usuarios` só para admin e **não devolve e-mails, hashes nem tokens**. Testado em `tests/e2e/acesso.spec.ts`. |
| 3 | "Teste grátis de novo" | Não existe signup (desligado no Supabase e sem tela de cadastro). Só o admin cria contas. |
| 4 | Reembolso e continuar premium | Papel, permissão e `ativo` ficam **só no banco**; `authenticated` não tem `UPDATE` em nenhuma tabela e a única alteração de perfil é `admin_atualizar_perfil()` (checa admin). Testado. |
| 5 | Senha vazada | Supabase Auth (bcrypt) + consulta à **Pwned Passwords** por k-anonymity na criação, redefinição e troca de senha; mínimo de 10 caracteres; troca obrigatória no primeiro acesso. |
| 6 | Logado depois da troca de senha | Troca/redefinição de senha e desativação apagam **todas** as sessões (`revogar_sessoes()` remove de `auth.sessions`; o equivalente de `auth.admin.signOut(…, 'global')`, que no supabase-js exige o JWT do próprio usuário). Desativado também recebe *ban* no Auth. A RLS confere `session_id` → o token antigo para de funcionar **na hora**. Testado. |
| 7 | IA | O sistema não usa IA. |
| 8 | Itens apagados ainda acessíveis | Exclusão lógica filtrada **na RLS** (produto inativo some para todos, inclusive na busca e no Modo Cliente). Fotos removidas vão para `arquivos_pendentes_exclusao` e o `limpar-arquivos.yml` apaga do R2. As URLs de leitura só são assinadas para chaves que a RLS deixa ver. |
| 9 | App modificado | Nenhuma regra confiável no front: XML, PDF e planilha são lidos no navegador, mas o servidor **revalida com zod** e as funções Postgres validam de novo (quantidades, chave com DV, permissões, estoque ≥ 0). Upload: o servidor confere no R2 o **tamanho real e os magic bytes** do que chegou. |
| 10 | E-mail falso | O sistema não envia e-mails a clientes. Se ativar recuperação de senha por e-mail, configure SPF, DKIM e DMARC no domínio (SMTP próprio no Supabase). |
| 11 | Copiar o código | Repositório **privado**; `service_role` e chaves do R2 só em secrets do servidor (sem `NEXT_PUBLIC_`); `productionBrowserSourceMaps: false`; **gitleaks** no CI. |
| 12 | Senha do banco | Só em variáveis/secrets; `.env*` e `.dev.vars` no `.gitignore`; logs registram só códigos de erro, nunca dados. |
| 13 | Fotos acessíveis por link | Bucket **privado**, sem domínio público; URLs pré-assinadas (GET 1 h, PUT 5 min com **tipo e tamanho fixos** na assinatura, um arquivo por URL, só com login e permissão); nomes UUID. |

**Arquivos:** limite de 5 MB por nota e 10 MB por foto antes da compressão; tipo pelos **magic bytes** (SVG recusado); XML com DTD/entidades recusado e estrutura da NF-e validada; texto extraído limpo de caracteres de controle e **nunca** interpolado em SQL (tudo vai como parâmetro/JSON para funções); chave de acesso única impede lançar a mesma nota duas vezes.
**Extras:** teste de IDOR; headers CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `nosniff`, HSTS e `Permissions-Policy`; **sem `dangerouslySetInnerHTML`**; auditoria (triggers + registros explícitos das funções) de todas as ações sensíveis; limite de 5 falhas em 15 min por usuário e por IP (tabela no Postgres) e erro sempre genérico no login.

---

## 14. Compatibilidade com o Workers Free — seção 2, item por item

| Regra | Como foi atendida |
|---|---|
| 1. Worker ≤ 3 MB (gzip) | Medido: **~2,1 MB**. `pdfjs-dist`, `tesseract.js`, `xlsx`, `@zxing/browser`, `browser-image-compression`, `fast-xml-parser` e `jszip` ficam **fora do servidor** (componentes com `next/dynamic` + `ssr: false` e `import()` sob demanda). `npm run verificar:worker` falha o build/CI se passar de 3 MB. |
| 2. Processamento pesado no navegador | XML, PDF, OCR, planilha, compressão de fotos e código de barras rodam no navegador; o servidor recebe dados estruturados, valida com zod e grava pelas funções do banco. |
| 3. ≤ 50 chamadas externas por requisição | Importação, vínculos e itens de nota vão em **lotes de 25** com barra de progresso, **uma função Postgres por lote**. A maior requisição (login) faz 5 chamadas. |
| 4. Uploads direto ao R2 | URL pré-assinada PUT (5 min, tipo e tamanho fixos); o arquivo não passa pelo Worker. |
| 5. Imagens | `images: { unoptimized: true }`; compressão máxima no upload, no navegador: WebP até 1440 px (~120 KB) + miniatura 400 px (~30 KB), sem metadados. |
| 6. Middleware lê `req.cookies` | `src/lib/supabase/middleware.ts` usa `req.cookies.getAll()`; nada de `cookies()` do `next/headers` no middleware. |
| 7. Runtime Node.js padrão | Nenhuma rota usa `export const runtime = 'edge'`. |

---

## 15. Decisões técnicas

- **Marca:** o original do logo (fundo transparente) fica em `marca/logo-casa-da-nona.webp`. `npm run preparar:logo` limpa o fundo, recorta e gera `public/marca/*.webp` e os ícones do PWA. As cores da interface vêm do logo: azul `#0153E0` nas ações principais e laranja `#FE8F01` como acento.

- **Next 16 renomeou `middleware.ts` para `proxy.ts`** (runtime Node). O suporte do OpenNext/Cloudflare ao proxy Node ainda é *experimental*, então mantivemos `middleware.ts` (runtime edge, estável nos dois provedores). O build mostra um aviso de "deprecated" — esperado. Quando o OpenNext suportar oficialmente, rode `npx @next/codemod@canary middleware-to-proxy .`.
- **`busca_texto`** é mantida por *triggers* (não `GENERATED`): uma coluna gerada não pode ler as cores (outra tabela) nem usar `unaccent`. O efeito na busca é o mesmo, com índice GIN trigram. Números exigem correspondência exata (`004` não acha `001`).
- **Nota em lotes e ainda atômica:** os itens vão em lotes de 25 para um **rascunho**; a confirmação (`confirmar_nota_entrada`) é uma única transação que aplica tudo ou nada.
- **Leitura do PDF é aproximada**; a tela avisa e recomenda o XML.
- **URLs de leitura estáveis por 30 min** (assinadas com o início da janela): o navegador reaproveita as imagens já baixadas; a renovação é automática.
- **CSP com `'unsafe-inline'` em scripts**: necessário para o Next sem nonce e para o worker do OCR (núcleo e idioma do tesseract vêm do jsDelivr só quando alguém lê um PDF escaneado). Não há HTML vindo do usuário (sem `dangerouslySetInnerHTML`).
