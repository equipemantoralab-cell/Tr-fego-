import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace, validateBackup, REGISTRY_KEY } from '../workspace.js';
class Storage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i]; }
  getItem(k) { return this.map.get(k) ?? null; }
  setItem(k,v) { this.map.set(k,v); }
}
test('migra dados anteriores sem apagar as chaves originais e isola campanhas', () => {
  const storage = new Storage(); storage.setItem('cascata:low-papel', JSON.stringify({ticket:'97'}));
  const w = createWorkspace(storage); const original = w.current().id;
  assert.equal(w.get('low-papel').ticket, '97');
  w.add('Natália'); assert.deepEqual(w.get('low-papel'), {});
  w.set('low-papel', {ticket:'47'}); w.select(original);
  assert.equal(w.get('low-papel').ticket, '97');
  assert.equal(JSON.parse(storage.getItem('cascata:low-papel')).ticket, '97');
  assert.equal(createWorkspace(storage).get('low-papel').ticket, '97');
});
test('backup restaura cópias com novos IDs e preserva dados existentes', () => {
  const w = createWorkspace(new Storage()); w.set('ap-log', {entries:[{leva:'Teste',aprendizado:'Nova hipótese'}]});
  const exported = w.export(); const original = w.current().id;
  assert.equal(w.import(exported),1); assert.notEqual(w.current().id, original);
  assert.equal(w.list().length,2); assert.equal(w.get('ap-log').entries[0].leva,'Teste');
});
test('rejeita arquivos inválidos e registros que quebrariam a interface antes de alterar dados', () => {
  const w = createWorkspace(new Storage()); const before = w.export();
  for (const data of [null, {}, {...before,version:2}, {...before,projects:[{name:'x',data:{'ap-log':{entries:'bad'}}}]}]) assert.throws(()=>w.import(data));
  assert.deepEqual(w.export().projects,before.projects);
  assert.throws(()=>validateBackup(JSON.parse('{"app":"mantora-trafego","version":1,"projects":[{"name":"x","data":{"__proto__":{}}}]}')));
});
test('falha de armazenamento é informada, mantendo dados exportáveis', () => {
  const storage = new Storage(); storage.setItem=()=>{throw new Error('quota')};
  let saved; const w = createWorkspace(storage, value=>saved=value); w.set('low-papel',{ticket:'150'});
  assert.equal(saved,false); assert.equal(w.export().projects[0].data['low-papel'].ticket,'150');
});
test('registro existente corrompido não é sobrescrito silenciosamente', () => {
  const storage = new Storage(); storage.setItem(REGISTRY_KEY,'invalid');
  assert.throws(()=>createWorkspace(storage)); assert.equal(storage.getItem(REGISTRY_KEY),'invalid');
});
