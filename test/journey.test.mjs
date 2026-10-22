import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PAGES, MODELS, sourceFor, requiredFields} from '../journey.js';
import {createWorkspace,validateBackup} from '../workspace.js';
test('navegação representa a jornada e o modelo limita a rota de análise',()=>{
 assert.equal(PAGES.length,8);
 assert.equal(sourceFor({model:'Low Ticket',route:'high-diag'}),'low-diag');
 assert.equal(sourceFor({model:'Médio Ticket',route:'med-quiz'}),'med-quiz');
 assert.equal(sourceFor({model:'Lançamento',route:'lan-carrinho'}),'lan-carrinho');
 for(const model of MODELS)assert.ok(sourceFor({model}));
});
test('requer os campos reais de carrinho e mantém gasto opcional',()=>{
 const required=requiredFields('lan-carrinho',[]);
 assert.ok(required.includes('cac'));
 assert.ok(required.includes('metaVendasAteAgora'));
 assert.ok(!required.includes('gasto'));
 assert.ok(!required.includes('gastoTotal'));
 assert.ok(!requiredFields('low-diag',[]).includes('cpm'));
});
test('backup preserva cadastro, análises e ações vinculadas',()=>{
 const entries=new Map();const storage={get length(){return entries.size},key:i=>[...entries.keys()][i],getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v)};
 const store=createWorkspace(storage);
 assert.equal(store.get('campaign-meta').demo,false);
 store.set('analyses',{entries:[{id:'analysis-1',inputs:JSON.stringify({cpaReal:34}),parameters:JSON.stringify({ctrMin:1}),decision:'Revisar página',demo:false}]});
 store.set('actions',{entries:[{id:'action-1',analysisId:'analysis-1',owner:'Copy',due:'2026-10-25',status:'Pendente'}]});
 const backup=store.export();assert.equal(validateBackup(backup).length,1);
 store.import(backup);
 assert.equal(store.get('actions').entries[0].analysisId,store.get('analyses').entries[0].id);
 store.set('low-diag',{cpaReal:'15'});
 assert.equal(JSON.parse(store.get('analyses').entries[0].inputs).cpaReal,34);
});
test('botão de exclusão confirma a campanha e permite restaurar pela lixeira', async()=>{
 const {createJourney}=await import('../journey.js');
 const values=new Map(), storage={get length(){return values.size},key:i=>[...values.keys()][i],getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const store=createWorkspace(storage);const first=store.current().id;
 const handlers={}, originalDocument=globalThis.document, originalWindow=globalThis.window;
 let page='',message='',confirmed=false;
 globalThis.document={querySelector:selector=>selector==='#view'?{addEventListener:(event,fn)=>handlers[event]=fn}:{dispatchEvent:()=>{}}};
 globalThis.window={confirm:()=>confirmed};
 try {
  const journey=createJourney({store,esc:s=>String(s??''),go:p=>page=p,feedback:m=>message=m});
  assert.match(journey.render('Visão geral'),/Excluir campanha/);
  const click=dataset=>handlers.click({target:{closest:()=>({dataset,hasAttribute:()=>false})}});
  click({deleteProject:first});assert.equal(store.list().length,1);
  confirmed=true;click({deleteProject:first});assert.equal(store.list().length,0);assert.equal(page,'Visão geral');assert.match(message,/excluída/);
  assert.match(journey.render('Visão geral'),/Restaurar campanha/);
  click({restoreProject:first});assert.equal(store.list().length,1);assert.equal(store.current().id,first);
 } finally {globalThis.document=originalDocument;globalThis.window=originalWindow;}
});
