export const PAGES = ['Visão geral', 'Clientes e campanhas', 'Planejamento', 'Análise da campanha', 'Plano de ação', 'Testes e aprendizados', 'Relatórios', 'Configurações'];
export const DESCRIPTIONS = {
 'Visão geral':'Veja o andamento da operação e escolha a próxima ação.',
 'Clientes e campanhas':'Defina o contexto da operação e o modelo de funil.',
 'Planejamento':'Confira a economia da oferta e os limites do investimento.',
 'Análise da campanha':'Preencha os números do período e registre o diagnóstico.',
 'Plano de ação':'Organize os responsáveis, os prazos e a execução.',
 'Testes e aprendizados':'Transforme os resultados em hipóteses para a próxima rodada.',
 'Relatórios':'Compare análises salvas e apresente a evolução da campanha.',
 'Configurações':'Ajuste os parâmetros e consulte os critérios do método.'
};
export const MODELS = ['Low Ticket','Médio Ticket','High Ticket','Lançamento'];
export const SOURCES = {
 'Low Ticket':['low-diag'], 'Médio Ticket':['med-pagina','med-vsl','med-quiz','med-assist','med-hibrido'],
 'High Ticket':['high-diag'], 'Lançamento':['lan-ritmo','lan-carrinho']
};
export function campaignMeta(store) { const meta={model:'Low Ticket',route:'',...store.get('campaign-meta')}; if(!MODELS.includes(meta.model))meta.model='Low Ticket'; return meta; }
export function sourceFor(meta) { const options=SOURCES[meta.model] || SOURCES['Low Ticket']; return options.includes(meta.route) ? meta.route : options[0]; }
export function requiredFields(source, fields) {
 if (source === 'low-diag') return ['cpaReal','cpaEsperado','ctr','connect','paginaCheckout','checkoutCompra'];
 if (source === 'lan-ritmo') return fields.filter(f=>f.type==='n' && f.id!=='mediaRecente').map(f=>f.id);
 if (source === 'lan-carrinho') return ['vendas','metaVendasAteAgora','cac','cacMax','baseLeads','cliquesOferta','checkoutIniciado','compras'];
 return fields.filter(f=>f.type==='n').map(f=>f.id);
}
export function createJourney({store, esc, fieldHtml, F, CALCS, CTX, P, parameters, calc, renderView, go, feedback, labels}) {
 const meta=()=>campaignMeta(store), records=()=>store.get('analyses').entries||[], actions=()=>store.get('actions').entries||[];
 const button=(label,page)=>`<button class="act" data-page="${esc(page)}">${esc(label)}</button>`;
 const getForm=(form)=>Object.fromEntries(new FormData(form).entries());
 const fmt=date=>date ? new Date(date+'T12:00:00').toLocaleDateString('pt-BR') : 'Não informado';
 const list=(items,blank)=>items.length?items.join(''):`<div class="empty">${blank}</div>`;
 function projects() { return store.export().projects; }
 function stats(project) { const data=project.data, pending=(data.actions?.entries||[]).filter(a=>a.status!=='Concluída'); return {pending:pending.length, overdue:pending.filter(a=>a.due && a.due < new Date().toLocaleDateString('en-CA')).length, analyses:(data.analyses?.entries||[]).length}; }
 function overview() {
   const all=projects(), totals=all.reduce((acc,p)=>{const s=stats(p);return {pending:acc.pending+s.pending,overdue:acc.overdue+s.overdue,analyses:acc.analyses+s.analyses};},{pending:0,overdue:0,analyses:0});
   return `<section class="card"><h2>Sua operação em um só lugar</h2><p class="hint">Os indicadores abaixo consideram todas as campanhas salvas neste navegador.</p><div class="kpis">${[['Campanhas',all.length],['Análises salvas',totals.analyses],['Ações pendentes',totals.pending],['Ações atrasadas',totals.overdue]].map(([k,v])=>`<div class="kpi"><small>${k}</small><b>${v}</b></div>`).join('')}</div><div class="toolbar">${button('1. Cadastrar campanha','Clientes e campanhas')}${button('2. Planejar investimento','Planejamento')}${button('3. Analisar resultados','Análise da campanha')}</div></section><section class="card"><h2>Campanhas da operação</h2>${all.map(p=>{const s=stats(p);return `<article class="entry"><b>${esc(p.name)}</b><p>${esc(p.data['campaign-meta']?.client||'Cliente não informado')} · ${esc(p.data['campaign-meta']?.model||'Low Ticket')}</p><p>${s.analyses} análise(s) · ${s.pending} ação(ões) pendente(s)${s.overdue?` · ${s.overdue} atrasada(s)`:''}</p><button class="act" data-open-project="${esc(p.id)}">Abrir campanha</button></article>`;}).join('')}</section>`;
 }
 function campaigns() {
  const m=meta();return `<section class="card"><h2>Cadastro da campanha ativa</h2><p class="hint">O modelo selecionado define quais ferramentas aparecem nas próximas páginas. Alterar o modelo preserva os números e o histórico anteriores.</p><form id="campaign-context" class="fields">${[['client','Cliente'],['product','Produto / oferta'],['objective','Objetivo'],['owner','Responsável']].map(([key,label])=>`<div><label for="context-${key}">${label}</label><input id="context-${key}" name="${key}" value="${esc(m[key]||'')}" maxlength="160" ${key==='client'||key==='product'?'required':''}></div>`).join('')}<div><label for="context-ticket">Ticket do produto (R$)</label><input id="context-ticket" name="ticket" type="number" min="0.01" step="0.01" value="${esc(m.ticket||'')}" required></div><div><label for="context-model">Modelo de funil</label><select id="context-model" name="model">${MODELS.map(model=>`<option ${m.model===model?'selected':''}>${model}</option>`).join('')}</select></div><div class="full"><button class="act primary">Salvar cadastro</button></div></form></section><section class="card"><h2>Comece com os seus números</h2><p>Campanhas novas começam vazias. Para conhecer os cálculos com valores preenchidos, crie uma demonstração separada.</p><button class="act" data-demo>Criar campanha de demonstração</button></section>`;
 }
 function analysis() {
  const m=meta(), source=sourceFor(m), context=store.get('analysis-period');
  return `<section class="card"><h2>Período e rota de análise</h2><div class="fields"><div><label for="period-start">Data inicial</label><input id="period-start" type="date" data-period="start" value="${esc(context.start||'')}"></div><div><label for="period-end">Data final</label><input id="period-end" type="date" data-period="end" value="${esc(context.end||'')}"></div><div class="full"><label for="analysis-route">O que vamos analisar?</label><select id="analysis-route">${SOURCES[m.model].map(id=>`<option value="${id}" ${id===source?'selected':''}>${esc(labels[id])}</option>`).join('')}</select></div></div><p class="nota">Defina o período e preencha os campos solicitados. As metas são referências do método ou do seu histórico, não garantias de resultado.</p></section>`;
 }
 function actionPage() {
  const entries=actions();return `<section class="card"><h2>Próxima ação da equipe</h2><form id="action-form" class="fields"><div class="full"><label for="action-title">Ação</label><input id="action-title" name="title" required maxlength="300" placeholder="Ex.: Revisar a primeira dobra da página"></div><div><label for="action-owner">Responsável</label><input id="action-owner" name="owner" required maxlength="160"></div><div><label for="action-due">Prazo</label><input id="action-due" name="due" type="date" required></div><div class="full"><label for="action-hypothesis">Hipótese / resultado esperado</label><textarea id="action-hypothesis" name="hypothesis" maxlength="2000"></textarea></div><div class="full"><button class="act primary">Adicionar ação</button></div></form></section><section class="card"><h2>Acompanhamento</h2>${list(entries.map(a=>`<article class="entry"><b>${esc(a.title)}</b><div class="fields"><div><label for="owner-${esc(a.id)}">Responsável</label><input id="owner-${esc(a.id)}" name="owner" data-action-edit="${esc(a.id)}" value="${esc(a.owner)}"></div><div><label for="due-${esc(a.id)}">Prazo</label><input id="due-${esc(a.id)}" name="due" type="date" data-action-edit="${esc(a.id)}" value="${esc(a.due)}"></div></div>${a.analysisId?'<p class="nota">Vinculada a uma análise</p>':''}<p>${esc(a.hypothesis||'')}</p><label for="status-${esc(a.id)}">Status</label><select id="status-${esc(a.id)}" data-action-status="${esc(a.id)}">${['Pendente','Em andamento','Concluída'].map(status=>`<option ${a.status===status?'selected':''}>${status}</option>`).join('')}</select></article>`),'Nenhuma ação registrada. Salve uma análise ou adicione uma ação acima.')}</section>`;
 }
 function reports() {
  const entries=records(), current=entries[0], previous=entries.find(a=>a.id!==current?.id&&a.source===current?.source), m=meta();
  const metricRows=()=>{if(!current||!previous)return '';let a,b;try{a=JSON.parse(current.inputs);b=JSON.parse(previous.inputs);}catch{return '';}
    return CALCS[current.source].fields.filter(f=>f.type==='n'&&a[f.id]!==''&&b[f.id]!==''&&a[f.id]!=null&&b[f.id]!=null).map(f=>`<tr><th>${esc(f.label)}</th><td>${esc(b[f.id])}</td><td>${esc(a[f.id])}</td></tr>`).join('');};
  return `<section class="card report-heading"><h2>${esc(store.current().name)}</h2><p>${esc(m.client||'Cliente não informado')} · ${esc(m.product||'Oferta não informada')} · ${esc(m.model)}</p><p class="nota">Relatório das análises salvas. Os dados são informados pela equipe, sem integração com plataformas de anúncios.</p></section>${current?`<section class="card"><h2>Comparação da mesma rota</h2>${previous?`<p>${fmt(previous.start)} a ${fmt(previous.end)} → ${fmt(current.start)} a ${fmt(current.end)}</p><div class="tw"><table><tr><th>Métrica</th><th>Análise anterior</th><th>Última análise</th></tr>${metricRows()}</table></div><p class="nota">Compare janelas de duração e atribuição equivalentes. A comparação usa a última análise e o registro anterior da mesma rota.</p>`:'Salve uma segunda análise da mesma rota para comparar os números.'}</section>`:''}<section class="card"><h2>Histórico de análises</h2>${list(entries.map(a=>`<article class="entry"><b>${esc(a.decision)}</b><p>${fmt(a.start)} a ${fmt(a.end)} · ${esc(labels[a.source]||a.source)}${a.demo?' · DEMONSTRAÇÃO':''}</p><p>${esc(a.diagnosis)}</p><p><strong>Acionar:</strong> ${esc(a.owners||'Não definido')}</p><p class="nota">Registrada em ${esc(new Date(a.createdAt).toLocaleString('pt-BR'))}</p><details><summary>Ver dados e critérios usados</summary><pre>${esc(a.inputs)}</pre><p class="nota">Parâmetros da análise</p><pre>${esc(a.parameters)}</pre></details><button class="act" data-analysis-action="${esc(a.id)}">Criar ação deste diagnóstico</button></article>`),'Nenhuma análise salva. Acesse Análise da campanha para começar.')}</section><section class="card"><h2>Execução da equipe</h2>${list(actions().map(a=>`<div class="entry"><b>${esc(a.title)}</b>${esc(a.owner)} · ${fmt(a.due)} · ${esc(a.status)}</div>`),'Nenhuma ação registrada.')}</section>`;
 }
 function saveAnalysis() {
  const m=meta(), source=sourceFor(m), period=store.get('analysis-period'), raw=store.get(source);
  if(!period.start||!period.end||period.end<period.start) return feedback('Informe um período válido: a data final deve ser igual ou posterior à inicial.');
  const fields=CALCS[source].fields;
  const required=requiredFields(source, fields);
  if(required.some(key=>raw[key]==null||String(raw[key]).trim()==='')||document.querySelector(`[data-calc="${source}"] [aria-invalid="true"]`)) return feedback('Preencha os campos numéricos necessários com dados válidos antes de salvar a análise.');
  if(!m.client||!m.product) return feedback('Preencha o cliente e o produto em Clientes e campanhas antes de salvar.');
  try {
   const x=CTX[source](raw,P()), r=x.r;
   if(!r?.decisao) throw new Error('Sem diagnóstico');
   const entry={id:crypto.randomUUID(),createdAt:new Date().toISOString(),model:m.model,source,start:period.start,end:period.end,decision:r.decisao,diagnosis:r.diagnostico||'',owners:(r.responsaveis||[]).join(', '),inputs:JSON.stringify(raw,null,2),parameters:JSON.stringify(parameters(),null,2),demo:!!m.demo};
   store.set('analyses',{entries:[entry,...records()]});feedback('Análise salva. Consulte o histórico em Relatórios ou crie uma ação para a equipe.');renderView();
  } catch {feedback('Não foi possível gerar o diagnóstico. Confira os números e as metas informadas.');}
 }
 function actionFromAnalysis(key) {const analysis=records().find(a=>a.id===key);if(!analysis)return;
  store.set('actions',{entries:[{id:crypto.randomUUID(),title:analysis.decision,owner:analysis.owners||'A definir',due:'',hypothesis:analysis.diagnosis,status:'Pendente',analysisId:analysis.id},...actions()]});go('Plano de ação');feedback('Ação criada a partir do diagnóstico. Defina o responsável e o prazo.');}
 document.querySelector('#view').addEventListener('submit',event=>{
  const form=event.target;
  if(!['campaign-context','action-form'].includes(form.id))return;event.preventDefault();const data=getForm(form);
  if(form.id==='campaign-context'){
   const old=meta();store.set('campaign-meta',{...old,...data,route:old.model===data.model?old.route:''});
   const map={'Low Ticket':'low-papel','Médio Ticket':'med-eco','Lançamento':'lan-proj'};if(map[data.model]){const key=map[data.model], values=store.get(key);store.set(key,{...values,ticket:data.ticket});}
   renderView();feedback('Cadastro salvo. As próximas páginas mostram as ferramentas deste modelo.');
  }else{store.set('actions',{entries:[{...data,id:crypto.randomUUID(),status:'Pendente'},...actions()]});renderView();feedback('Ação adicionada ao plano.');}
 });
 document.querySelector('#view').addEventListener('change',event=>{
  const t=event.target;
  if(t.dataset.period){store.set('analysis-period',{...store.get('analysis-period'),[t.dataset.period]:t.value});}
  if(t.id==='analysis-route'){store.set('campaign-meta',{...meta(),route:t.value});renderView();}
  if(t.dataset.actionStatus){store.set('actions',{entries:actions().map(a=>a.id===t.dataset.actionStatus?{...a,status:t.value}:a)});}
  if(t.dataset.actionEdit){store.set('actions',{entries:actions().map(a=>a.id===t.dataset.actionEdit?{...a,[t.name]:t.value}:a)});}
 });
 document.querySelector('#view').addEventListener('click',event=>{
  const t=event.target.closest('button');if(!t)return;
  if(t.dataset.page)go(t.dataset.page);
  if(t.dataset.openProject){store.select(t.dataset.openProject);document.querySelector('#campaign').dispatchEvent(new Event('journey-switch'));go('Clientes e campanhas');}
  if(t.hasAttribute('data-save-analysis'))saveAnalysis();
  if(t.dataset.analysisAction)actionFromAnalysis(t.dataset.analysisAction);
  if(t.hasAttribute('data-demo')){store.add('Campanha de demonstração');store.set('campaign-meta',{model:'Low Ticket',demo:true,client:'Cliente de exemplo',product:'Produto de exemplo',ticket:'47'});document.querySelector('#campaign').dispatchEvent(new Event('journey-switch'));go('Análise da campanha');}
 });
 return {render(page){return ({'Visão geral':overview,'Clientes e campanhas':campaigns,'Análise da campanha':analysis,'Plano de ação':actionPage,'Relatórios':reports})[page]?.()||'';},meta,source:()=>sourceFor(meta())};
}
