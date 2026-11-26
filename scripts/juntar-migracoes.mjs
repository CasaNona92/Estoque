// Junta todas as migrações num só arquivo (supabase/tudo-em-um.sql) para colar no SQL Editor
// do Supabase, na ordem certa. Uso: node scripts/juntar-migracoes.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const pasta = path.join(raiz, "supabase", "migrations");
const partes = readdirSync(pasta)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => `-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> ${f}\n${readFileSync(path.join(pasta, f), "utf8")}`);
writeFileSync(
  path.join(raiz, "supabase", "tudo-em-um.sql"),
  `-- GERADO por scripts/juntar-migracoes.mjs — não edite à mão.\n-- Cole no SQL Editor do Supabase (projeto NOVO) e rode uma vez.\n\n${partes.join("\n\n")}\n`,
);
console.log(`supabase/tudo-em-um.sql gerado (${partes.length} migrações)`);
