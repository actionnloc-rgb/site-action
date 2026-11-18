const DB_STORAGE_KEY = 'action_demo_db_v1';
const AUTH_SESSION_KEY = 'action_demo_auth_uid';

const DEMO_USERS = {
  'admin@action.test': {
    uid: 'demo-admin-uid',
    email: 'admin@action.test',
    password: 'Action@2026',
    isAdmin: true
  },
  'visitante@action.test': {
    uid: 'demo-visitor-uid',
    email: 'visitante@action.test',
    password: '123456',
    isAdmin: false
  }
};

function defaultDbState() {
  return {
    admins: {
      'demo-admin-uid': {
        email: 'admin@action.test',
        role: 'admin'
      }
    },
    categories: {},
    equipment: {},
    services: {},
    projects: {},
    leads: {},
    meta: {}
  };
}

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) return defaultDbState();
    const parsed = JSON.parse(raw);
    return { ...defaultDbState(), ...parsed };
  } catch {
    return defaultDbState();
  }
}

function saveDb(dbData) {
  localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(dbData));
}

function resolvePayload(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v && typeof v === 'object' && v.__serverTimestamp) {
      out[k] = { __tsMs: Date.now() };
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) => (item && typeof item === 'object' ? { ...item } : item));
    } else {
      out[k] = v;
    }
  }
  return out;
}

function hydrateDoc(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === 'object' && typeof v.__tsMs === 'number') {
      const ms = v.__tsMs;
      out[k] = {
        toDate: () => new Date(ms),
        toMillis: () => ms
      };
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) => (item && typeof item === 'object' ? { ...item } : item));
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function resetDemoDatabase() {
  localStorage.removeItem(DB_STORAGE_KEY);
}

export function initializeApp(_config, name = 'demo') {
  return { name, __demo: true };
}

const authListeners = new Set();

function getSessionUser() {
  const uid = sessionStorage.getItem(AUTH_SESSION_KEY);
  if (!uid) return null;
  const user = Object.values(DEMO_USERS).find((u) => u.uid === uid);
  return user ? { uid: user.uid, email: user.email } : null;
}

function notifyAuth() {
  const user = getSessionUser();
  authListeners.forEach((cb) => {
    try {
      cb(user);
    } catch (err) {
      console.error(err);
    }
  });
}

export function getAuth(_app) {
  return { __demoAuth: true };
}

export function onAuthStateChanged(_auth, cb) {
  authListeners.add(cb);
  queueMicrotask(() => cb(getSessionUser()));
  return () => authListeners.delete(cb);
}

export async function signInWithEmailAndPassword(_auth, email, password) {
  const normalized = String(email || '').trim().toLowerCase();
  const match = DEMO_USERS[normalized];
  if (!match || match.password !== password) {
    const err = new Error('E-mail ou senha incorretos.');
    err.code = 'auth/invalid-credential';
    throw err;
  }
  sessionStorage.setItem(AUTH_SESSION_KEY, match.uid);
  notifyAuth();
  return { user: { uid: match.uid, email: match.email } };
}

export async function signOut(_auth) {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  notifyAuth();
}

export function getFirestore(_app) {
  return { __demoDb: true };
}

export function collection(_db, path) {
  return { __type: 'collection', path };
}

export function doc(_db, colPath, id) {
  return { __type: 'doc', colPath, id };
}

export function where(field, op, value) {
  return { __type: 'where', field, op, value };
}

export function limit(count) {
  return { __type: 'limit', count };
}

export function query(colRef, ...constraints) {
  return { __type: 'query', path: colRef.path, constraints };
}

export function serverTimestamp() {
  return { __serverTimestamp: true };
}

export async function getDoc(docRef) {
  const dbData = loadDb();
  const col = dbData[docRef.colPath] || {};
  const raw = col[docRef.id];
  return {
    id: docRef.id,
    exists: () => Boolean(raw),
    data: () => (raw ? hydrateDoc(raw) : undefined)
  };
}

export async function getDocs(target) {
  const dbData = loadDb();
  const path = target.path;
  const col = dbData[path] || {};
  let entries = Object.entries(col);

  if (target.__type === 'query' && Array.isArray(target.constraints)) {
    for (const c of target.constraints) {
      if (c.__type === 'where' && c.op === '==') {
        entries = entries.filter(([, item]) => item && item[c.field] === c.value);
      }
    }
    for (const c of target.constraints) {
      if (c.__type === 'limit') {
        entries = entries.slice(0, c.count);
      }
    }
  }

  return {
    docs: entries.map(([id, raw]) => ({
      id,
      data: () => hydrateDoc(raw)
    }))
  };
}

export async function addDoc(colRef, data) {
  const dbData = loadDb();
  if (!dbData[colRef.path]) dbData[colRef.path] = {};
  const id = 'demo_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  dbData[colRef.path][id] = resolvePayload(data);
  saveDb(dbData);
  return { id };
}

export async function setDoc(docRef, data) {
  const dbData = loadDb();
  if (!dbData[docRef.colPath]) dbData[docRef.colPath] = {};
  dbData[docRef.colPath][docRef.id] = resolvePayload(data);
  saveDb(dbData);
}

export async function updateDoc(docRef, patch) {
  const dbData = loadDb();
  if (!dbData[docRef.colPath] || !dbData[docRef.colPath][docRef.id]) {
    throw new Error(`Documento não encontrado: ${docRef.colPath}/${docRef.id}`);
  }
  dbData[docRef.colPath][docRef.id] = {
    ...dbData[docRef.colPath][docRef.id],
    ...resolvePayload(patch)
  };
  saveDb(dbData);
}

export async function deleteDoc(docRef) {
  const dbData = loadDb();
  if (dbData[docRef.colPath]) {
    delete dbData[docRef.colPath][docRef.id];
    saveDb(dbData);
  }
}

export function writeBatch(_db) {
  const ops = [];
  return {
    set(docRef, data) {
      ops.push({ type: 'set', docRef, data });
    },
    update(docRef, patch) {
      ops.push({ type: 'update', docRef, patch });
    },
    async commit() {
      const dbData = loadDb();
      for (const op of ops) {
        if (!dbData[op.docRef.colPath]) dbData[op.docRef.colPath] = {};
        if (op.type === 'set') {
          dbData[op.docRef.colPath][op.docRef.id] = resolvePayload(op.data);
        } else if (op.type === 'update') {
          const prev = dbData[op.docRef.colPath][op.docRef.id] || {};
          dbData[op.docRef.colPath][op.docRef.id] = {
            ...prev,
            ...resolvePayload(op.patch)
          };
        }
      }
      saveDb(dbData);
    }
  };
}

export function compressImageToDataUrl(file, onProgress) {
  return new Promise((resolve, reject) => {
    if (onProgress) onProgress(25);
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler arquivo local.'));
    reader.onload = () => {
      if (onProgress) onProgress(60);
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida ou corrompida.'));
      img.onload = () => {
        const maxW = 1100;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let dataUrl = canvas.toDataURL('image/webp', 0.82);
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        }
        if (onProgress) onProgress(100);
        resolve({ url: dataUrl, publicId: '', caption: '' });
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}
