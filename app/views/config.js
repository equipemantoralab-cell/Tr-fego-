// Configurações: parâmetros dos funis, usuários, backup/restauração, migração dos dados locais e preparo da planilha.
import { api } from "../api.js";
import { h, montar, tabela, rot, ROTULOS, opcoesDe, chip, estadoVazio, nf, toast, modal, confirmar, data, dataHora, campo, kpi } from "../ui.js";
import { D, estado, pode, carregar, comConflito } from "../estado.js";
import { abrirFormulario, PREFIXO } from "../forms.js";

const FONTES = { POP: "POP", provisorio: "provisório", cliente: "histórico do cliente", usuario: "ajustado pela equipe", a_definir: "a definir" };
const download = (nome, obj) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" })); a.download = nome; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const pre = (o) => h("pre", null, JSON.stringify(o, null, 2));

/** Lê os dados locais (localStorage) da versão anterior da calculadora. */
export function coletarDadosLocais() {
  const bruto = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith("cascata:")) bruto[k] = JSON.parse(localStorage.getItem(k)); } } catch { /* ok */ }
  const aprend = [];
  for (const e of bruto["cascata:ap-log"]?.entries || []) aprend.push({ tipo: "aprendizado", titulo: e.leva || e.criativo || "Aprendizado", dados: e });
  for (const e of bruto["cascata:ap-bench"]?.entries || []) aprend.push({ tipo: "benchmark", titulo: e.concorrente || "Benchmark", dados: e });
  return { bruto, payload: { aprendizados: aprend, parametros: bruto["cascata:params"] || {} } };
}

export async function render(ctx) {
  const aba = ctx.query.aba || "parametros";
  const raiz = h("div"), corpo = h("div");
  const abas = [["parametros", "Parâmetros dos funis"], ["usuarios", "Usuários"], ["dados", "Dados e backup"], ["sobre", "Sobre e limitações"]];
  montar(raiz, h("h1", null, "Configurações"), h("div", { class: "abas-internas", role: "tablist" }, abas.map(([a, t]) => h("button", { role: "tab", "aria-selected": String(aba === a), onclick: () => { location.hash = `#/config?aba=${a}`; } }, t))), corpo);

  if (aba === "parametros") {
    const pode_ = pode("atualizar", "CONFIGURACOES_FUNIS");
    const rotuloFunil = (f) => (f === "global" ? "Parâmetros globais" : rot("tipo_funil", f));
    montar(corpo, h("div", { class: "aviso-box" }, "Estes parâmetros alimentam o motor de decisão. ", h("b", null, "POP"), " = número escrito no documento da metodologia; ", h("b", null, "provisório"), " = valor de trabalho (o POP não define); ", h("b", null, "a definir"), " = regra desativada até haver valor. Substitua pelo histórico real de cada cliente."),
      ["global", "low_ticket", "medio_ticket", "high_ticket", "lancamento"].map((f) => h("div", { class: "secao" }, h("h2", null, rotuloFunil(f)),
        tabela([{ titulo: "Parâmetro", valor: (c) => h("span", null, h("b", null, c.chave), h("div", { class: "nota" }, c.descricao || "")) },
          { titulo: "Valor", valor: (c) => { const i = h("input", { value: c.valor ?? "", inputmode: "decimal", "aria-label": c.chave, disabled: !pode_, style: "max-width:110px" }); i.dataset.id = c.id; return h("span", null, i, " ", c.unidade || ""); } },
          { titulo: "Fonte", valor: (c) => chip(FONTES[c.fonte] || c.fonte, c.fonte === "POP" ? "pop" : c.fonte === "a_definir" ? "" : "prov") },
          { titulo: "", valor: (c) => (pode_ ? h("button", { class: "act peq", onclick: (e) => salvarParam(c, e.currentTarget) }, "Salvar") : "") }], D().CONFIGURACOES_FUNIS.filter((c) => c.tipo_funil === f)))));
    async function salvarParam(c, btn) {
      const v = btn.closest("tr").querySelector("input").value.trim();
      const patch = { valor: v === "" ? null : v, fonte: v === "" ? "a_definir" : (c.fonte === "POP" || c.fonte === "a_definir" || c.fonte === "provisorio" ? "usuario" : c.fonte) };
      btn.disabled = true;
      try { await comConflito((ver) => api.atualizar("configuracoes", c.id, { ...patch, versao: ver ?? c.versao }), { patch, modal, h, toast }); toast("Parâmetro salvo ✓ (vale para as próximas análises)"); await carregar({ silencioso: true }); ctx.recarregar(); }
      catch (e) { if (e?.descartado) { await carregar({ silencioso: true }); ctx.recarregar(); } else { toast(e.erros?.join("; ") || e.message, "erro"); btn.disabled = false; } }
    }
  } else if (aba === "usuarios") {
    if (!pode("ler", "USUARIOS")) { montar(corpo, estadoVazio("Somente administradores gerenciam usuários.")); return raiz; }
    const campos = [{ nome: "nome", rotulo: "Nome", req: true }, { nome: "conta", rotulo: "Conta Google (e-mail)", req: true, dica: "Login é feito com esta conta Google." }, { nome: "perfil", rotulo: "Perfil de acesso", tipo: "sel", opcoes: opcoesDe(ROTULOS.perfil), req: true, padrao: "analista" }, { nome: "status", rotulo: "Status", tipo: "sel", opcoes: [["ativo", "Ativo"], ["inativo", "Inativo"]], padrao: "ativo" }];
    montar(corpo, h("div", { class: "aviso-box" }, "Perfis: ", h("b", null, "Administrador"), " (tudo, inclusive usuários, restauração e preparo da planilha) · ", h("b", null, "Gestor"), " (cadastros, campanhas, configuração, backup) · ", h("b", null, "Analista"), " (registra análises e ações) · ", h("b", null, "Leitor"), " (somente leitura). Nenhuma senha é guardada: o acesso é por conta Google."),
      h("div", { class: "barra-acoes" }, h("span", { class: "esp" }), h("button", { class: "act primario", onclick: () => abrirFormulario({ titulo: "Novo usuário", entidade: "usuarios", prefixo: PREFIXO.USUARIOS, campos, aoSalvar: ctx.recarregar }) }, "+ Novo usuário")),
      tabela([{ titulo: "Nome", valor: (u) => u.nome }, { titulo: "Conta", valor: (u) => u.conta }, { titulo: "Perfil", valor: (u) => rot("perfil", u.perfil) }, { titulo: "Status", valor: (u) => chip(u.status === "ativo" ? "Ativo" : "Inativo") }], D().USUARIOS || [], { aoClicar: (u) => abrirFormulario({ titulo: "Editar usuário", entidade: "usuarios", prefixo: PREFIXO.USUARIOS, campos, registro: u, aoSalvar: ctx.recarregar }), vazioTxt: "Nenhum usuário cadastrado (administradores definidos em ADMIN_EMAILS entram automaticamente)." }));
  } else if (aba === "dados") {
    const saida = h("div");
    const local = coletarDadosLocais();
    const blocoBackup = h("div", { class: "card" }, h("h2", null, "Backup exportável"), h("p", { class: "nota" }, "Baixa um arquivo JSON com todas as abas (clientes, produtos, campanhas, análises, decisões, configurações, aprendizados). Faça isto periodicamente."),
      pode("backup", "exportar") ? h("button", { class: "act primario", onclick: async (e) => { const btn = e.currentTarget; btn.disabled = true; try { download(`backup-cascata-${new Date().toISOString().slice(0, 10)}.json`, await api.backup()); toast("Backup gerado ✓"); } catch (er) { toast(er.message, "erro"); } btn.disabled = false; } }, "Baixar backup (.json)") : h("p", { class: "nota" }, "Seu perfil não permite exportar."));
    const arq = h("input", { type: "file", accept: "application/json" });
    const blocoRest = h("div", { class: "card" }, h("h2", null, "Restaurar backup"), h("p", { class: "nota" }, "A restauração só ACRESCENTA registros que não existem (por ID). Nunca sobrescreve nem apaga. Sempre mostra uma prévia antes."),
      pode("backup", "restaurar") ? h("div", null, arq, h("p", null, h("button", { class: "act", onclick: async () => {
        if (!arq.files[0]) return toast("Escolha o arquivo de backup.", "aviso");
        let dump; try { dump = JSON.parse(await arq.files[0].text()); } catch { return toast("Arquivo inválido (não é JSON).", "erro"); }
        try { const prev = await api.restaurar(dump, true, false); montar(saida, h("div", { class: "card" }, h("h3", null, "Prévia da restauração"), tabela([{ titulo: "Aba", valor: (x) => x[0] }, { titulo: "No backup", num: true, valor: (x) => String(x[1].no_backup) }, { titulo: "Já existem", num: true, valor: (x) => String(x[1].ja_existem) }, { titulo: "A inserir", num: true, valor: (x) => String(x[1].a_inserir) }], Object.entries(prev.resumo)),
          h("button", { class: "act primario", onclick: async () => { if (!(await confirmar("Aplicar restauração", "Os registros ausentes serão acrescentados à planilha. Nada será sobrescrito.", "Restaurar"))) return; try { const r = await api.restaurar(dump, false, false); toast("Restauração concluída ✓"); await carregar({ silencioso: true }); montar(saida, h("div", { class: "card" }, h("b", null, "Concluída."), pre(r.resumo))); } catch (er) { toast(er.message, "erro"); } } }, "Aplicar restauração"))); } catch (er) { toast(er.message, "erro"); } } }, "Ver prévia"))) : h("p", { class: "nota" }, "Somente administradores restauram backups."));
    const nLocal = local.payload.aprendizados.length, nParam = Object.keys(local.payload.parametros).length, nChaves = Object.keys(local.bruto).length;
    const blocoMig = h("div", { class: "card" }, h("h2", null, "Migração dos dados deste navegador"), h("p", { class: "nota" }, `Foram encontradas ${nChaves} chave(s) locais da versão anterior: ${nLocal} registro(s) de aprendizado/benchmark e ${nParam} parâmetro(s) editado(s). As entradas das calculadoras são rascunhos e permanecem locais. Os dados locais NÃO são apagados.`),
      h("div", { class: "barra-acoes" }, h("button", { class: "act", onclick: () => { download(`dados-locais-${new Date().toISOString().slice(0, 10)}.json`, { exportado_em: new Date().toISOString(), ...local }); toast("Cópia dos dados locais baixada ✓"); } }, "1. Baixar cópia dos dados locais"),
        pode("migracao", "importar") ? [h("button", { class: "act", onclick: async () => { try { const r = await api.importar({ ...local.payload, dryRun: true }); montar(saida, h("div", { class: "card" }, h("h3", null, "Prévia da importação"), pre(r))); } catch (e) { toast(e.message, "erro"); } } }, "2. Ver prévia"),
          h("button", { class: "act primario", onclick: async () => { if (!(await confirmar("Importar para a planilha", "Os registros novos serão gravados; repetir a importação não duplica.", "Importar"))) return; try { const r = await api.importar({ ...local.payload, dryRun: false }); await carregar({ silencioso: true }); const ok = r.aprendizados.invalidos.length === 0; montar(saida, h("div", { class: "card" }, h("h3", null, ok ? "Importação concluída ✓" : "Importação concluída com avisos"), h("p", { class: "nota" }, `Aprendizados: ${r.aprendizados.criados} criado(s), ${r.aprendizados.ja_existiam} já existiam. Parâmetros: ${r.parametros.atualizados} atualizado(s). Conferência: a aba APRENDIZADOS agora tem ${D().APRENDIZADOS.length} registro(s). O armazenamento local foi mantido.`), pre(r))); try { localStorage.setItem("mt_migrado_em", new Date().toISOString()); } catch { /* ok */ } } catch (e) { toast(e.message, "erro"); } } }, "3. Importar para a planilha")] : null));
    const blocoSetup = pode("admin", "setup") ? h("div", { class: "card" }, h("h2", null, "Preparar / verificar a planilha"), h("p", { class: "nota" }, "Cria as abas que faltam, acrescenta colunas novas ao final (nunca remove ou reordena) e semeia os parâmetros padrão. Seguro para executar mais de uma vez."),
      h("button", { class: "act primario", onclick: async (e) => { const btn = e.currentTarget; btn.disabled = true; try { const r = await api.setup(); montar(saida, h("div", { class: "card" }, h("h3", null, "Planilha verificada ✓"), pre(r.relatorio))); await carregar({ silencioso: true }); } catch (er) { toast(er.message, "erro"); } btn.disabled = false; } }, "Executar verificação")) : null;
    montar(corpo, h("div", { class: "cols2" }, blocoBackup, blocoRest), blocoMig, blocoSetup, saida);
  } else {
    montar(corpo, h("div", { class: "card" }, h("h2", null, "Sobre"), h("p", null, `Cascata de Decisão de Tráfego Pago · Mantora. Usuário: ${estado.usuario.nome} (${rot("perfil", estado.usuario.perfil)}). Dados carregados em ${estado.carregadoEm?.toLocaleString("pt-BR")}.`)),
      h("div", { class: "card" }, h("h2", null, "Limitações da arquitetura (Google Sheets como banco)"), h("ul", null,
        ["A planilha não tem transações. Cada gravação usa uma trava (aba _LOCKS) e versão do registro; edições simultâneas geram aviso de conflito em vez de sobrescrever.",
          "Limite de requisições da API do Google (≈60/min por usuário de serviço): uso pesado simultâneo pode gerar lentidão temporária; o sistema avisa e tenta de novo.",
          "Edições manuais na planilha fora do sistema não são validadas nem auditadas. Não reordene/apague linhas; não altere a linha de cabeçalho.",
          "Todos os dados são carregados de uma vez no navegador: o desempenho cai com dezenas de milhares de linhas (considere arquivar campanhas antigas ou migrar para um banco).",
          "O código da interface é público (arquivos estáticos); somente os DADOS são protegidos pela autenticação do servidor.",
          "Se o histórico de auditoria falhar após uma gravação bem-sucedida, a gravação é mantida e o evento fica registrado nos logs do servidor."].map((t) => h("li", null, t)))));
  }
  return raiz;
}
