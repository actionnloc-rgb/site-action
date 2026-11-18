import { FIREBASE_VERSION, isDemoAllowed, isFirebaseConfigReady } from './config-utils.js';

function sortByOrder(items) {
  return [...items].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

function waitForActionSite() {
  if (window.ActionSite) return Promise.resolve(window.ActionSite);
  return new Promise((resolve) => {
    window.addEventListener('DOMContentLoaded', () => resolve(window.ActionSite), { once: true });
  });
}

async function initPublicData() {
  const config = window.ACTION_CONFIG;
  const useRealFirebase = isFirebaseConfigReady(config);

  if (!useRealFirebase && !isDemoAllowed()) {
    return;
  }

  try {
    let initializeApp;
    let firestoreLite;

    if (useRealFirebase) {
      const baseUrl = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
      const [appMod, fsMod] = await Promise.all([
        import(`${baseUrl}/firebase-app.js`),
        import(`${baseUrl}/firebase-firestore-lite.js`)
      ]);
      initializeApp = appMod.initializeApp;
      firestoreLite = fsMod;
    } else {
      const demo = await import('./demo-backend.js');
      initializeApp = demo.initializeApp;
      firestoreLite = demo;
    }

    const {
      getFirestore,
      collection,
      doc,
      getDoc,
      getDocs,
      addDoc,
      query,
      where,
      serverTimestamp
    } = firestoreLite;

    const app = initializeApp(useRealFirebase ? config.firebase : {}, 'action-public');
    const db = getFirestore(app);
    const actionSite = await waitForActionSite();
    if (!actionSite) return;

    actionSite.setLeadSaver(async (lead) => {
      await addDoc(collection(db, 'leads'), {
        nome: String(lead.nome || '').slice(0, 120),
        telefone: String(lead.telefone || '').slice(0, 30),
        telefoneE164: String(lead.telefoneE164 || ''),
        periodo: String(lead.periodo || '').slice(0, 120),
        projeto: String(lead.projeto || '').slice(0, 2000),
        equipamentos: Array.isArray(lead.equipamentos) ? lead.equipamentos.slice(0, 30) : [],
        status: 'novo',
        origem: 'site',
        createdAt: serverTimestamp()
      });
    });

    const migrationSnap = await getDoc(doc(db, 'meta', 'migration'));
    if (!migrationSnap.exists() || migrationSnap.data()?.done !== true) {
      return;
    }

    const [categoriesSnap, equipmentSnap, servicesSnap, projectsSnap] = await Promise.all([
      getDocs(collection(db, 'categories')),
      getDocs(query(collection(db, 'equipment'), where('published', '==', true))),
      getDocs(query(collection(db, 'services'), where('published', '==', true))),
      getDocs(query(collection(db, 'projects'), where('published', '==', true)))
    ]);

    const mapSnap = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const categories = sortByOrder(mapSnap(categoriesSnap));
    const equipmentItems = sortByOrder(mapSnap(equipmentSnap));
    const serviceItems = sortByOrder(mapSnap(servicesSnap));
    const projectItems = sortByOrder(mapSnap(projectsSnap));

    actionSite.setEquipment(equipmentItems, categories);
    actionSite.setServices(serviceItems, categories);
    actionSite.setProjects(projectItems, categories);
  } catch (error) {
    console.error('Erro ao carregar dados públicos do Firestore:', error);
  }
}

initPublicData();
