// Local campaign storage. Legacy keys remain intact for safe migration.
export const REGISTRY_KEY = 'mantora:trafego:workspaces:v1';
const id = () => globalThis.crypto.randomUUID();
export function validateBackup(value) {
  if (!value || value.app !== 'mantora-trafego' || value.version !== 1 ||
      !Array.isArray(value.projects) || !value.projects.length || value.projects.length > 200) {
    throw new Error('Selecione um backup válido do Gestão de Tráfego.');
  }
  for (const project of value.projects) {
    if (!project || typeof project.name !== 'string' || !project.name.trim() || project.name.length > 160 ||
        !project.data || typeof project.data !== 'object' || Array.isArray(project.data)) {
      throw new Error('O backup contém uma campanha inválida.');
    }
    for (const [key, entry] of Object.entries(project.data)) {
      if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key) ||
          !entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Dados inválidos no backup.');
      for (const [field, item] of Object.entries(entry)) {
        if (['__proto__', 'constructor', 'prototype'].includes(field)) throw new Error('Campo inválido no backup.');
        if (field === 'entries') {
          if (!Array.isArray(item) || item.some(row => !row || typeof row !== 'object' || Array.isArray(row) || Object.values(row).some(v => !['string', 'number', 'boolean'].includes(typeof v)))) throw new Error('Registros inválidos no backup.');
        } else if (!['string', 'number', 'boolean'].includes(typeof item) && item !== null) throw new Error('Valor inválido no backup.');
      }
    }
  }
  return value.projects.map(project => ({ id: id(), name: project.name.trim(), data: structuredClone(project.data) }));
}
export function createWorkspace(storage, onSave = () => {}) {
  const legacy = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith('cascata:')) {
      try { const value = JSON.parse(storage.getItem(key)); if (value && typeof value === 'object' && !Array.isArray(value)) legacy[key.slice(8)] = value; } catch { /* Ignore invalid legacy values. */ }
    }
  }
  const raw = storage.getItem(REGISTRY_KEY);
  let state;
  if (raw) {
    state = JSON.parse(raw);
    if (!Array.isArray(state.projects) || !state.projects.length || !state.projects.some(p => p.id === state.active)) throw new Error('Não foi possível ler as campanhas salvas. Exporte os dados do navegador antes de continuar.');
  } else {
    const first = { id: id(), name: Object.keys(legacy).length ? 'Campanha original' : 'Minha primeira campanha', data: legacy };
    state = { active: first.id, projects: [first] };
  }
  const active = () => state.projects.find(p => p.id === state.active);
  function save() {
    try { storage.setItem(REGISTRY_KEY, JSON.stringify(state)); onSave(true); return true; }
    catch { onSave(false); return false; }
  }
  return {
    get: key => active().data[key] ?? {},
    set(key, value) { active().data[key] = value; save(); },
    list: () => state.projects.map(({ id, name }) => ({ id, name })),
    current: () => ({ id: active().id, name: active().name }),
    select(key) { if (state.projects.some(p => p.id === key)) { state.active = key; save(); } },
    add(name) { const project = { id: id(), name: name.trim().slice(0,160), data: {} }; state.projects.push(project); state.active = project.id; save(); },
    rename(name) { active().name = name.trim().slice(0,160); save(); },
    export() { return { app: 'mantora-trafego', version: 1, exportedAt: new Date().toISOString(), projects: structuredClone(state.projects) }; },
    import(value) { const projects = validateBackup(value); state.projects.push(...projects); state.active = projects[0].id; save(); return projects.length; },
  };
}
