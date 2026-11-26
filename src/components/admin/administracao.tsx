"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  DownloadIcon,
  HardDriveIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  PencilIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { criarUsuario, editarUsuario, redefinirSenha, salvarConfiguracoes } from "@/app/acoes/admin";
import { Badge, Card, CardCabecalho, CardConteudo, CardTitulo, Progresso, Switch } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/campos";
import { Dialog, DialogCabecalho, DialogConteudo, DialogDescricao, DialogRodape, DialogTitulo } from "@/components/ui/dialog";
import { AbaConteudo, AbaGatilho, Abas, AbasLista } from "@/components/ui/menus";
import { formatarBytes, formatarData, formatarDataHora } from "@/lib/formatacao";
import { cn } from "@/lib/utils";
import { BotaoExportar } from "@/components/dinamicos";
import { Auditoria } from "./auditoria";

export type Usuario = {
  id: string;
  nome: string;
  usuario: string;
  papel: "admin" | "vendedor";
  pode_dar_entrada: boolean;
  ativo: boolean;
  precisa_trocar_senha: boolean;
  criado_em: string;
};

export type Uso = {
  banco_bytes: number;
  fotos_bytes: number;
  fotos_qtd: number;
  notas_bytes: number;
  backups_bytes: number | null;
  ultimo_backup: string | null;
  ultimo_backup_erro: string | null;
  produtos: number;
  pendentes_exclusao: number;
};

const LIMITE_BANCO = 500 * 1024 * 1024; // Supabase Free
const LIMITE_R2 = 10 * 1024 * 1024 * 1024; // R2 Free

export function Administracao({
  eu,
  usuarios,
  configuracoes,
  uso,
}: {
  eu: string;
  usuarios: Usuario[];
  configuracoes: { exigir_pin: boolean; estoque_minimo_padrao: number };
  uso: Uso | null;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 lg:py-8">
      <h1 className="mb-6 font-semibold text-2xl tracking-tight">Administração</h1>
      <Abas defaultValue="usuarios">
        <AbasLista>
          <AbaGatilho value="usuarios">
            <UsersIcon /> Usuários
          </AbaGatilho>
          <AbaGatilho value="config">
            <SettingsIcon /> <span className="sm:hidden">Ajustes</span><span className="hidden sm:inline">Configurações</span>
          </AbaGatilho>
          <AbaGatilho value="auditoria">
            <ScrollTextIcon /> Auditoria
          </AbaGatilho>
          <AbaGatilho value="backup">
            <DatabaseIcon /> <span className="sm:hidden">Backup</span><span className="hidden sm:inline">Backup e plano</span>
          </AbaGatilho>
        </AbasLista>
        <AbaConteudo value="usuarios">
          <Usuarios eu={eu} usuarios={usuarios} />
        </AbaConteudo>
        <AbaConteudo value="config">
          <Configuracoes inicial={configuracoes} />
        </AbaConteudo>
        <AbaConteudo value="auditoria">
          <Auditoria usuarios={usuarios} />
        </AbaConteudo>
        <AbaConteudo value="backup">
          <Backup uso={uso} />
        </AbaConteudo>
      </Abas>
    </div>
  );
}

// ======================================================================= usuários
function Usuarios({ eu, usuarios }: { eu: string; usuarios: Usuario[] }) {
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [senhaDe, setSenhaDe] = useState<Usuario | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">Não existe cadastro público: só o administrador cria contas.</p>
        <Button onClick={() => setNovo(true)}>
          <UserPlusIcon /> Novo usuário
        </Button>
      </div>
      <Card className="divide-y divide-border/60">
        {usuarios.map((u) => (
          <div key={u.id} className={cn("flex items-start gap-3 px-4 py-4 sm:items-center sm:gap-4 sm:px-5", !u.ativo && "opacity-60")}>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-suave font-semibold text-accent-texto text-sm">
              {u.nome.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {u.nome} {u.id === eu && <span className="text-muted-foreground text-xs">(você)</span>}
              </p>
              <p className="text-muted-foreground text-xs">
                <span className="font-mono">{u.usuario}</span> · desde {formatarData(u.criado_em)}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant={u.papel === "admin" ? "acento" : "neutro"}>{u.papel}</Badge>
              {u.pode_dar_entrada && u.papel !== "admin" && <Badge variant="contorno">dá entrada</Badge>}
              {!u.ativo && <Badge variant="zerado">desativado</Badge>}
              {u.precisa_trocar_senha && u.ativo && <Badge variant="baixo">troca de senha pendente</Badge>}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditando(u)} aria-label={`Editar ${u.nome}`}>
                <PencilIcon />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSenhaDe(u)} aria-label={`Redefinir senha de ${u.nome}`}>
                <KeyRoundIcon />
              </Button>
            </div>
          </div>
        ))}
      </Card>
      <DialogNovoUsuario aberto={novo} aoFechar={() => setNovo(false)} aoSalvar={() => router.refresh()} />
      <DialogEditarUsuario usuario={editando} eu={eu} aoFechar={() => setEditando(null)} aoSalvar={() => router.refresh()} />
      <DialogRedefinirSenha usuario={senhaDe} aoFechar={() => setSenhaDe(null)} />
    </div>
  );
}

function sugerirSenha() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const alfabeto = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("").replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3");
}

function DialogNovoUsuario({ aberto, aoFechar, aoSalvar }: { aberto: boolean; aoFechar: () => void; aoSalvar: () => void }) {
  const [d, setD] = useState({ nome: "", usuario: "", email: "", papel: "vendedor" as "admin" | "vendedor", pode_dar_entrada: false, senha: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await criarUsuario(d);
      if (!r.ok) return setErro(r.erro);
      toast.success("Usuário criado", { description: "No primeiro acesso ele vai ter que trocar a senha." });
      setD({ nome: "", usuario: "", email: "", papel: "vendedor", pode_dar_entrada: false, senha: "" });
      setErro(null);
      aoSalvar();
      aoFechar();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <DialogConteudo>
        <form onSubmit={salvar} className="grid gap-4">
          <DialogCabecalho>
            <DialogTitulo>Novo usuário</DialogTitulo>
            <DialogDescricao>A pessoa entra com o usuário (ou e-mail) e a senha temporária, e troca a senha no primeiro acesso.</DialogDescricao>
          </DialogCabecalho>
          <Campo rotulo="Nome" htmlFor="nu-nome">
            <Input id="nu-nome" value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} required maxLength={80} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Usuário" htmlFor="nu-usuario" dica="minúsculas, sem espaço">
              <Input id="nu-usuario" value={d.usuario} onChange={(e) => setD({ ...d, usuario: e.target.value.toLowerCase().replace(/\s/g, "") })} required maxLength={30} autoCapitalize="none" />
            </Campo>
            <Campo rotulo="E-mail (opcional)" htmlFor="nu-email" dica="sem e-mail, ele entra só pelo usuário">
              <Input id="nu-email" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} maxLength={200} />
            </Campo>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Papel" htmlFor="nu-papel">
              <Select id="nu-papel" value={d.papel} onChange={(e) => setD({ ...d, papel: e.target.value as "admin" | "vendedor" })}>
                <option value="vendedor">Vendedor</option>
                <option value="admin">Administrador</option>
              </Select>
            </Campo>
            <Campo rotulo="Pode dar entrada de mercadorias">
              <div className="flex h-11 items-center">
                <Switch checked={d.papel === "admin" || d.pode_dar_entrada} disabled={d.papel === "admin"} onCheckedChange={(v) => setD({ ...d, pode_dar_entrada: v })} aria-label="Pode dar entrada" />
              </div>
            </Campo>
          </div>
          <Campo rotulo="Senha temporária" htmlFor="nu-senha" dica="Mínimo 10 caracteres. Senhas vazadas são recusadas.">
            <div className="flex gap-2">
              <Input id="nu-senha" value={d.senha} onChange={(e) => setD({ ...d, senha: e.target.value })} required minLength={10} maxLength={72} autoComplete="new-password" className="font-mono" />
              <Button type="button" variant="outline" onClick={() => setD({ ...d, senha: sugerirSenha() })}>
                Gerar
              </Button>
            </div>
          </Campo>
          {erro && <p role="alert" className="rounded-xl bg-perigo-suave px-4 py-3 text-perigo text-sm">{erro}</p>}
          <DialogRodape>
            <Button type="button" variant="outline" onClick={aoFechar}>Cancelar</Button>
            <Button type="submit" disabled={pendente}>
              {pendente && <LoaderCircleIcon className="animate-spin" />} Criar usuário
            </Button>
          </DialogRodape>
        </form>
      </DialogConteudo>
    </Dialog>
  );
}

function DialogEditarUsuario({ usuario, eu, aoFechar, aoSalvar }: { usuario: Usuario | null; eu: string; aoFechar: () => void; aoSalvar: () => void }) {
  const [d, setD] = useState<Usuario | null>(usuario);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  if (usuario && d?.id !== usuario.id) setD(usuario);
  const proprio = usuario?.id === eu;

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!d) return;
    iniciar(async () => {
      const r = await editarUsuario({ id: d.id, nome: d.nome, papel: d.papel, pode_dar_entrada: d.pode_dar_entrada, ativo: d.ativo });
      if (!r.ok) return setErro(r.erro);
      toast.success(d.ativo ? "Usuário atualizado" : "Usuário desativado — as sessões dele caíram");
      setErro(null);
      aoSalvar();
      aoFechar();
    });
  }

  return (
    <Dialog open={Boolean(usuario)} onOpenChange={(a) => !a && aoFechar()}>
      <DialogConteudo>
        {d && (
          <form onSubmit={salvar} className="grid gap-4">
            <DialogCabecalho>
              <DialogTitulo>Editar {usuario?.nome}</DialogTitulo>
              <DialogDescricao>Papel e permissões ficam só no banco — o próprio usuário não consegue alterar.</DialogDescricao>
            </DialogCabecalho>
            <Campo rotulo="Nome" htmlFor="eu-nome">
              <Input id="eu-nome" value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} required maxLength={80} />
            </Campo>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Papel" htmlFor="eu-papel">
                <Select id="eu-papel" value={d.papel} disabled={proprio} onChange={(e) => setD({ ...d, papel: e.target.value as "admin" | "vendedor" })}>
                  <option value="vendedor">Vendedor</option>
                  <option value="admin">Administrador</option>
                </Select>
              </Campo>
              <Campo rotulo="Pode dar entrada">
                <div className="flex h-11 items-center">
                  <Switch checked={d.papel === "admin" || d.pode_dar_entrada} disabled={d.papel === "admin"} onCheckedChange={(v) => setD({ ...d, pode_dar_entrada: v })} aria-label="Pode dar entrada" />
                </div>
              </Campo>
            </div>
            <label className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <span>
                <span className="block font-medium text-sm">Conta ativa</span>
                <span className="block text-muted-foreground text-xs">Desativar bloqueia o login e derruba as sessões abertas na hora.</span>
              </span>
              <Switch checked={d.ativo} disabled={proprio} onCheckedChange={(v) => setD({ ...d, ativo: v })} aria-label="Conta ativa" />
            </label>
            {erro && <p role="alert" className="rounded-xl bg-perigo-suave px-4 py-3 text-perigo text-sm">{erro}</p>}
            <DialogRodape>
              <Button type="button" variant="outline" onClick={aoFechar}>Cancelar</Button>
              <Button type="submit" disabled={pendente}>
                {pendente && <LoaderCircleIcon className="animate-spin" />} Salvar
              </Button>
            </DialogRodape>
          </form>
        )}
      </DialogConteudo>
    </Dialog>
  );
}

function DialogRedefinirSenha({ usuario, aoFechar }: { usuario: Usuario | null; aoFechar: () => void }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario) return;
    iniciar(async () => {
      const r = await redefinirSenha({ id: usuario.id, senha });
      if (!r.ok) return setErro(r.erro);
      toast.success("Senha redefinida", { description: "As sessões caíram e ele vai trocar a senha no próximo acesso." });
      setSenha("");
      setErro(null);
      aoFechar();
    });
  }

  return (
    <Dialog open={Boolean(usuario)} onOpenChange={(a) => !a && aoFechar()}>
      <DialogConteudo>
        <form onSubmit={salvar} className="grid gap-4">
          <DialogCabecalho>
            <DialogTitulo>Redefinir senha de {usuario?.nome}</DialogTitulo>
            <DialogDescricao>Todas as sessões dele são encerradas. No próximo acesso, ele cria uma senha nova.</DialogDescricao>
          </DialogCabecalho>
          <Campo rotulo="Senha temporária" htmlFor="rs-senha">
            <div className="flex gap-2">
              <Input id="rs-senha" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={10} maxLength={72} required className="font-mono" autoComplete="new-password" />
              <Button type="button" variant="outline" onClick={() => setSenha(sugerirSenha())}>Gerar</Button>
            </div>
          </Campo>
          {erro && <p role="alert" className="rounded-xl bg-perigo-suave px-4 py-3 text-perigo text-sm">{erro}</p>}
          <DialogRodape>
            <Button type="button" variant="outline" onClick={aoFechar}>Cancelar</Button>
            <Button type="submit" disabled={pendente}>
              {pendente && <LoaderCircleIcon className="animate-spin" />} Redefinir
            </Button>
          </DialogRodape>
        </form>
      </DialogConteudo>
    </Dialog>
  );
}

// ======================================================================= configurações
function Configuracoes({ inicial }: { inicial: { exigir_pin: boolean; estoque_minimo_padrao: number } }) {
  const [exigir, setExigir] = useState(inicial.exigir_pin);
  const [pin, setPin] = useState("");
  const [minimo, setMinimo] = useState(String(inicial.estoque_minimo_padrao));
  const [pendente, iniciar] = useTransition();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await salvarConfiguracoes({ exigir_pin: exigir, pin: pin || null, estoque_minimo_padrao: minimo });
      if (!r.ok) return void toast.error(r.erro);
      setPin("");
      toast.success("Configurações salvas");
    });
  }

  return (
    <form onSubmit={salvar} className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardCabecalho>
          <CardTitulo>Modo Cliente</CardTitulo>
        </CardCabecalho>
        <CardConteudo className="space-y-4">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block font-medium text-sm">Exigir PIN para sair</span>
              <span className="block text-muted-foreground text-xs">Evita que o cliente saia da vitrine e veja o estoque.</span>
            </span>
            <Switch checked={exigir} onCheckedChange={setExigir} aria-label="Exigir PIN" />
          </label>
          <Campo rotulo="Novo PIN (4 a 8 números)" htmlFor="pin" dica="Deixe em branco para manter o atual. O PIN é guardado com hash.">
            <Input id="pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" type="password" autoComplete="off" className="w-40 tracking-[0.4em]" />
          </Campo>
        </CardConteudo>
      </Card>
      <Card>
        <CardCabecalho>
          <CardTitulo>Estoque</CardTitulo>
        </CardCabecalho>
        <CardConteudo>
          <Campo rotulo="Estoque mínimo padrão" htmlFor="minimo" dica="Usado em produtos novos e na importação quando a coluna vier vazia.">
            <Input id="minimo" type="number" min={0} value={minimo} onChange={(e) => setMinimo(e.target.value)} className="w-32" />
          </Campo>
        </CardConteudo>
      </Card>
      <div className="md:col-span-2">
        <Button type="submit" disabled={pendente}>
          {pendente && <LoaderCircleIcon className="animate-spin" />} Salvar configurações
        </Button>
      </div>
    </form>
  );
}

// ======================================================================= backup e uso do plano
function Medidor({ rotulo, usado, limite, icone }: { rotulo: string; usado: number; limite: number; icone: React.ReactNode }) {
  const pct = Math.min(100, (usado / limite) * 100);
  const alerta = pct >= 80;
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-medium text-sm">
          {icone} {rotulo}
        </p>
        {alerta ? <Badge variant="zerado">acima de 80%</Badge> : <Badge variant="ok">ok</Badge>}
      </div>
      <p className="text-2xl tabular">
        {formatarBytes(usado)} <span className="text-base text-muted-foreground">de {formatarBytes(limite)}</span>
      </p>
      <Progresso valor={pct} className={cn(alerta && "[&>div]:bg-perigo")} />
      <p className="text-muted-foreground text-xs">{pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do plano grátis</p>
    </Card>
  );
}

function Backup({ uso }: { uso: Uso | null }) {
  const ultimo = uso?.ultimo_backup ? new Date(uso.ultimo_backup) : null;
  const dias = ultimo ? (Date.now() - ultimo.getTime()) / 86_400_000 : Number.POSITIVE_INFINITY;
  const atrasado = dias > 8;
  const r2 = (uso?.fotos_bytes ?? 0) + (uso?.notas_bytes ?? 0);

  return (
    <div className="space-y-5">
      <Card className={cn("flex flex-wrap items-center justify-between gap-4 p-6", atrasado && "border-perigo/50 bg-perigo-suave")}>
        <div className="flex items-center gap-4">
          <div className={cn("flex size-12 items-center justify-center rounded-2xl", atrasado ? "bg-perigo text-white" : "bg-sucesso-suave text-sucesso")}>
            {atrasado ? <AlertTriangleIcon /> : <ShieldCheckIcon />}
          </div>
          <div>
            <p className="font-semibold">Último backup automático</p>
            <p className={cn("text-sm", atrasado ? "font-medium text-perigo" : "text-muted-foreground")}>
              {ultimo ? `${formatarDataHora(ultimo)} (${Math.floor(dias)} dia(s) atrás)` : "Nenhum backup registrado ainda"}
              {atrasado && " — confira o GitHub Actions (backup-banco.yml)."}
            </p>
            {uso?.ultimo_backup_erro && <p className="text-perigo text-xs">Último erro: {uso.ultimo_backup_erro}</p>}
          </div>
        </div>
        <BotaoExportar />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Medidor rotulo="Banco de dados (Supabase)" usado={uso?.banco_bytes ?? 0} limite={LIMITE_BANCO} icone={<DatabaseIcon className="size-4 text-accent" />} />
        <Medidor rotulo="Fotos e notas (Cloudflare R2)" usado={r2 + (uso?.backups_bytes ?? 0)} limite={LIMITE_R2} icone={<HardDriveIcon className="size-4 text-accent" />} />
      </div>
      <Card className="grid gap-4 p-5 text-sm sm:grid-cols-4">
        <Info rotulo="Produtos ativos" valor={String(uso?.produtos ?? 0)} />
        <Info rotulo="Fotos" valor={`${uso?.fotos_qtd ?? 0} · ${formatarBytes(uso?.fotos_bytes)}`} />
        <Info rotulo="Backups no R2" valor={uso?.backups_bytes ? formatarBytes(uso.backups_bytes) : "—"} />
        <Info rotulo="Arquivos a apagar" valor={String(uso?.pendentes_exclusao ?? 0)} icone={uso?.pendentes_exclusao ? undefined : <CheckCircle2Icon className="size-4 text-sucesso" />} />
      </Card>
    </div>
  );
}

function Info({ rotulo, valor, icone }: { rotulo: string; valor: string; icone?: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="mt-1 flex items-center gap-1.5 font-medium">
        {icone} {valor}
      </p>
    </div>
  );
}

