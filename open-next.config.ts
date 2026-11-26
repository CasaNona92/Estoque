// Configuração do adaptador oficial @opennextjs/cloudflare.
// O app é 100% dinâmico (tudo depende do login), então não usamos cache incremental (ISR).
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
