import {
  FIREBASE_VERSION,
  isDemoAllowed,
  isFirebaseConfigReady,
  isCloudinaryConfigReady
} from './config-utils.js';

const SECTIONS = {
  equipment: {
    key: 'equipment',
    collection: 'equipment',
    catType: 'equipment',
    folder: 'action/equipamentos',
    label: 'Equipamentos',
    singular: 'Equipamento',
    categoryRequired: true,
    panelId: 'panel-equipment',
    tabId: 'tab-equipment'
  },
  services: {
    key: 'services',
    collection: 'services',
    catType: 'service',
    folder: 'action/servicos',
    label: 'Serviços',
    singular: 'Serviço',
    categoryRequired: false,
    panelId: 'panel-services',
    tabId: 'tab-services'
  },
  projects: {
    key: 'projects',
    collection: 'projects',
    catType: 'project',
    folder: 'action/projetos',
    label: 'Projetos',
    singular: 'Projeto',
    categoryRequired: false,
    panelId: 'panel-projects',
    tabId: 'tab-projects'
  }
};

const LEAD_STATUS_LABELS = {
  novo: 'Novo',
  em_contato: 'Em contato',
  fechado: 'Fechado',
  descartado: 'Descartado'
};

const state = {
  app: null,
  auth: null,
  db: null,
  user: null,
  activeTab: 'equipment',
  categories: [],
  equipment: [],
  services: [],
  projects: [],
  leads: [],
  dirtyLeads: new Map(),
  editing: {
    sectionKey: 'equipment',
    itemId: null,
    photos: [],
    dirty: false,
    uploading: false
  }
};

const config = window.ACTION_CONFIG || {};

function cloudinaryUrl(photo, width) {
  if (!photo || !photo.url) return '';
  if (photo.publicId && isCloudinaryConfigReady(config)) {
    const idx = photo.url.indexOf('/image/upload/');
    if (idx !== -1) {
      return (
        photo.url.slice(0, idx + '/image/upload/'.length) +
        `f_auto,q_auto,w_${width}/` +
        photo.url.slice(idx + '/image/upload/'.length)
      );
    }
    return `https://res.cloudinary.com/${encodeURIComponent(config.cloudinary.cloudName.trim())}/image/upload/f_auto,q_auto,w_${width}/${photo.publicId}`;
  }
  return photo.url;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'categoria';
}

function buildUniqueCategorySlug(rawValue, catType) {
  const base = slugify(rawValue);
  const used = new Set(
    state.categories
      .filter((c) => c.type === catType)
      .map((c) => String(c.slug || '').toLowerCase())
  );
  if (!used.has(base)) return base;
  let idx = 2;
  while (used.has(`${base}-${idx}`)) idx += 1;
  return `${base}-${idx}`;
}

function sortByOrder(list) {
  return [...list].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (val === undefined || val === null || val === false) continue;
    if (key === 'className') node.className = val;
    else if (key === 'textContent') node.textContent = val;
    else if (key === 'hidden') node.hidden = Boolean(val);
    else if (key === 'disabled') node.disabled = Boolean(val);
    else if (key === 'checked') node.checked = Boolean(val);
    else if (key.startsWith('data-')) node.setAttribute(key, val);
    else node.setAttribute(key, String(val));
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function showToast(message, isError = false) {
  const toast = document.querySelector('#admin-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
}

function confirmDialog({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar' }) {
  const dialog = document.querySelector('#confirm-dialog');
  const titleEl = document.querySelector('#confirm-title');
  const msgEl = document.querySelector('#confirm-message');
  const okBtn = document.querySelector('#confirm-ok-btn');
  const cancelBtn = document.querySelector('#confirm-cancel-btn');
  const closeBtn = document.querySelector('#confirm-close-btn');

  titleEl.textContent = title;
  msgEl.textContent = message;
  okBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
      resolve(result);
    };
    const onOk = () => finish(true);
    const onCancel = (e) => {
      if (e && e.type === 'cancel') e.preventDefault();
      finish(false);
    };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
    dialog.addEventListener('cancel', onCancel);
    dialog.showModal();
  });
}

let fbApi = null;
let demoApi = null;

async function loadFirebase() {
  if (fbApi) return fbApi;
  if (!isFirebaseConfigReady(config)) {
    if (!isDemoAllowed()) {
      throw new Error('Firebase não configurado.');
    }
    demoApi = await import('./demo-backend.js');
    fbApi = demoApi;
    return fbApi;
  }
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [appMod, authMod, fsMod] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`)
  ]);
  fbApi = { ...appMod, ...authMod, ...fsMod };
  return fbApi;
}

async function verifyIsAdmin(uid) {
  const { doc, getDoc, getDocs, collection, query, limit } = fbApi;
  try {
    const adminSnap = await getDoc(doc(state.db, 'admins', uid));
    return adminSnap.exists();
  } catch (err) {
    if (err && err.code === 'permission-denied') {
      try {
        await getDocs(query(collection(state.db, 'leads'), limit(1)));
        return true;
      } catch {
        return false;
      }
    }
    throw err;
  }
}

function setAdminLoadStatus({ message = '', isError = false, showRetry = false } = {}) {
  const box = document.querySelector('#admin-load-status');
  const textEl = document.querySelector('#admin-load-status-text');
  const retryBtn = document.querySelector('#retry-load-btn');
  if (!box || !textEl) return;
  if (!message) {
    box.hidden = true;
    textEl.textContent = '';
    if (retryBtn) retryBtn.hidden = true;
    return;
  }
  textEl.textContent = message;
  box.classList.toggle('is-info', !isError);
  if (retryBtn) retryBtn.hidden = !showRetry;
  box.hidden = false;
}

async function fetchAllData() {
  const { collection, doc, getDoc, getDocs } = fbApi;
  setAdminLoadStatus({ message: 'Carregando dados do painel...', isError: false, showRetry: false });

  const slowTimer = setTimeout(() => {
    setAdminLoadStatus({
      message: 'A conexão com o Firestore está demorando. Verifique sua conexão ou se o Firestore Database foi criado no Firebase Console.',
      isError: false,
      showRetry: true
    });
  }, 10000);

  let results;
  try {
    results = await Promise.allSettled([
      getDoc(doc(state.db, 'meta', 'migration')),
      getDocs(collection(state.db, 'categories')),
      getDocs(collection(state.db, 'equipment')),
      getDocs(collection(state.db, 'services')),
      getDocs(collection(state.db, 'projects')),
      getDocs(collection(state.db, 'leads'))
    ]);
  } finally {
    clearTimeout(slowTimer);
  }

  const labels = ['migração', 'classificações', 'equipamentos', 'serviços', 'projetos', 'clientes'];
  const failures = [];
  results.forEach((res, idx) => {
    if (res.status === 'rejected') {
      failures.push({ label: labels[idx], reason: res.reason });
    }
  });

  const [migRes, catRes, eqRes, svcRes, projRes, leadsRes] = results;

  if (migRes.status === 'fulfilled') {
    const migDone = migRes.value.exists() && migRes.value.data()?.done === true;
    const migBanner = document.querySelector('#migration-banner');
    if (migBanner) migBanner.hidden = migDone;
  }
  if (catRes.status === 'fulfilled') {
    state.categories = sortByOrder(catRes.value.docs.map((d) => ({ id: d.id, ...d.data() })));
  }
  if (eqRes.status === 'fulfilled') {
    state.equipment = sortByOrder(eqRes.value.docs.map((d) => ({ id: d.id, ...d.data() })));
  }
  if (svcRes.status === 'fulfilled') {
    state.services = sortByOrder(svcRes.value.docs.map((d) => ({ id: d.id, ...d.data() })));
  }
  if (projRes.status === 'fulfilled') {
    state.projects = sortByOrder(projRes.value.docs.map((d) => ({ id: d.id, ...d.data() })));
  }
  if (leadsRes.status === 'fulfilled') {
    state.leads = leadsRes.value.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });
    state.dirtyLeads.clear();
  }

  renderAll();

  if (failures.length > 0) {
    const firstErr = failures[0].reason;
    const code = firstErr?.code || '';
    let hint = firstErr?.message || 'erro desconhecido';
    if (code === 'permission-denied') {
      hint = 'permissão negada no Firestore (verifique se o arquivo firestore.rules foi publicado e se seu UID está na coleção admins).';
    } else if (code === 'unavailable' || /offline/i.test(hint)) {
      hint = 'sem conexão com o Firestore (verifique se o Firestore Database foi criado no Firebase Console e sua internet).';
    }
    const failedNames = failures.map((f) => f.label).join(', ');
    setAdminLoadStatus({
      message: `Falha ao carregar (${failedNames}): ${hint}`,
      isError: true,
      showRetry: true
    });
  } else {
    setAdminLoadStatus({ message: '' });
  }
}

function getCategoriesForType(type) {
  return sortByOrder(state.categories.filter((c) => c.type === type));
}

function getCategoryName(categoryId) {
  const found = state.categories.find((c) => c.id === categoryId);
  return found ? found.name : 'Sem classificação';
}

function renderCatalogPanel(sectionKey) {
  const cfg = SECTIONS[sectionKey];
  const panel = document.querySelector(`#${cfg.panelId}`);
  const items = state[sectionKey];
  const cats = getCategoriesForType(cfg.catType);

  panel.replaceChildren();

  const head = el('div', { className: 'admin-section-head' }, [
    el('div', {}, [
      el('h2', { textContent: cfg.label }),
      el('p', {
        className: 'admin-muted',
        textContent: items.length === 1 ? '1 item cadastrado' : `${items.length} itens cadastrados`
      })
    ]),
    el('button', {
      type: 'button',
      className: 'button button-red admin-btn-sm',
      textContent: `+ Novo ${cfg.singular.toLowerCase()}`
    })
  ]);
  head.querySelector('button').addEventListener('click', () => openItemDialog(sectionKey, null));
  panel.append(head);

  // Categories management collapsible panel
  const catDetails = el('details', { className: 'admin-categories-box' });
  const catSummary = el('summary', { textContent: `Gerenciar classificações (${cats.length})` });
  const catInner = el('div', { className: 'admin-categories-inner' });

  const createForm = el('form', { className: 'admin-category-create' });
  const nameInput = el('input', {
    type: 'text',
    required: 'true',
    maxlength: '80',
    placeholder: 'Ex. Modificadores de luz'
  });
  const slugInput = el('input', {
    type: 'text',
    maxlength: '60',
    placeholder: 'slug-opcional'
  });
  const createBtn = el('button', {
    type: 'submit',
    className: 'button button-outline admin-btn-sm',
    textContent: 'Adicionar'
  });
  const catStatus = el('p', { className: 'admin-status-msg', role: 'status', 'aria-live': 'polite' });

  createForm.append(
    el('label', {}, ['Nome da classificação', nameInput]),
    el('label', {}, ['Slug (opcional)', slugInput]),
    createBtn
  );

  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    const slug = buildUniqueCategorySlug(slugInput.value.trim() || name, cfg.catType);
    createBtn.disabled = true;
    catStatus.textContent = 'Salvando...';
    catStatus.classList.remove('is-error');
    try {
      const { addDoc, collection } = fbApi;
      const maxOrder = cats.reduce((acc, c) => Math.max(acc, Number(c.order) || 0), 0);
      await addDoc(collection(state.db, 'categories'), {
        type: cfg.catType,
        name,
        slug,
        order: maxOrder + 1
      });
      nameInput.value = '';
      slugInput.value = '';
      showToast(`Classificação "${name}" criada.`);
      await fetchAllData();
      const updatedDetails = panel.querySelector('.admin-categories-box');
      if (updatedDetails) updatedDetails.open = true;
    } catch (err) {
      catStatus.textContent = 'Erro ao criar classificação: ' + (err.message || 'verifique permissões.');
      catStatus.classList.add('is-error');
    } finally {
      createBtn.disabled = false;
    }
  });

  const catList = el('div', { className: 'admin-category-list' });
  if (cats.length === 0) {
    catList.append(el('p', { className: 'admin-muted', textContent: 'Nenhuma classificação cadastrada ainda.' }));
  } else {
    cats.forEach((cat, idx) => {
      const catNameField = el('input', { type: 'text', value: cat.name || '', maxlength: '80', 'aria-label': `Nome da classificação ${cat.name}` });
      catNameField.value = cat.name || '';
      const saveCatBtn = el('button', { type: 'button', className: 'admin-icon-btn', textContent: 'Salvar' });
      const upBtn = el('button', { type: 'button', className: 'admin-icon-btn', textContent: '↑', 'aria-label': `Mover ${cat.name} para cima`, disabled: idx === 0 });
      const downBtn = el('button', { type: 'button', className: 'admin-icon-btn', textContent: '↓', 'aria-label': `Mover ${cat.name} para baixo`, disabled: idx === cats.length - 1 });
      const delCatBtn = el('button', { type: 'button', className: 'admin-icon-btn is-danger', textContent: 'Excluir' });

      saveCatBtn.addEventListener('click', async () => {
        const newName = catNameField.value.trim();
        if (!newName) return;
        saveCatBtn.disabled = true;
        try {
          const { doc, updateDoc } = fbApi;
          await updateDoc(doc(state.db, 'categories', cat.id), { name: newName });
          showToast('Classificação atualizada.');
          await fetchAllData();
          const updatedDetails = panel.querySelector('.admin-categories-box');
          if (updatedDetails) updatedDetails.open = true;
        } catch (err) {
          showToast('Erro ao renomear: ' + err.message, true);
        } finally {
          saveCatBtn.disabled = false;
        }
      });

      upBtn.addEventListener('click', () => swapOrder('categories', cats, idx, idx - 1, true, sectionKey));
      downBtn.addEventListener('click', () => swapOrder('categories', cats, idx, idx + 1, true, sectionKey));

      delCatBtn.addEventListener('click', async () => {
        const inUse = items.filter((item) => item.categoryId === cat.id);
        if (inUse.length > 0) {
          catStatus.textContent = `Não é possível excluir "${cat.name}": ${inUse.length} item(ns) ainda usam essa classificação. Reatribua os itens antes de excluir.`;
          catStatus.classList.add('is-error');
          return;
        }
        const ok = await confirmDialog({
          title: 'Excluir classificação',
          message: `Excluir a classificação "${cat.name}"?`,
          confirmText: 'Excluir'
        });
        if (!ok) return;
        try {
          const { doc, deleteDoc } = fbApi;
          await deleteDoc(doc(state.db, 'categories', cat.id));
          showToast('Classificação excluída.');
          await fetchAllData();
          const updatedDetails = panel.querySelector('.admin-categories-box');
          if (updatedDetails) updatedDetails.open = true;
        } catch (err) {
          showToast('Erro ao excluir classificação: ' + err.message, true);
        }
      });

      const row = el('div', { className: 'admin-category-item' }, [
        el('div', { className: 'admin-category-item-fields' }, [
          catNameField,
          el('span', { className: 'admin-slug-tag', textContent: `/${cat.slug || ''}` })
        ]),
        el('div', { className: 'admin-row-actions' }, [upBtn, downBtn, saveCatBtn, delCatBtn])
      ]);
      catList.append(row);
    });
  }

  catInner.append(createForm, catStatus, catList);
  catDetails.append(catSummary, catInner);
  panel.append(catDetails);

  // Items list
  if (items.length === 0) {
    panel.append(el('div', { className: 'admin-empty', textContent: `Nenhum item em ${cfg.label} ainda.` }));
    return;
  }

  const list = el('div', { className: 'admin-list' });
  items.forEach((item, idx) => {
    const firstPhoto = Array.isArray(item.photos) && item.photos.length > 0 ? item.photos[0] : null;
    const thumbBox = el('div', { className: 'admin-item-thumb' });
    if (firstPhoto && firstPhoto.url) {
      thumbBox.append(el('img', { src: cloudinaryUrl(firstPhoto, 200), alt: '' }));
    } else {
      thumbBox.textContent = 'SEM FOTO';
    }

    const catText = item.categoryId ? getCategoryName(item.categoryId) : 'Sem classificação';
    const meta = el('div', { className: 'admin-item-meta' }, [
      el('div', { className: 'admin-item-title-line' }, [
        el('h3', { textContent: item.title || '(Sem título)' }),
        el('span', {
          className: `admin-badge ${item.published ? 'admin-badge-visible' : 'admin-badge-hidden'}`,
          textContent: item.published ? 'Visível' : 'Oculto'
        })
      ]),
      el('p', {
        className: 'admin-muted',
        textContent: [catText, item.subtitle].filter(Boolean).join(' • ')
      })
    ]);

    const upBtn = el('button', {
      type: 'button',
      className: 'admin-icon-btn',
      textContent: '↑',
      'aria-label': `Mover ${item.title} para cima`,
      disabled: idx === 0
    });
    const downBtn = el('button', {
      type: 'button',
      className: 'admin-icon-btn',
      textContent: '↓',
      'aria-label': `Mover ${item.title} para baixo`,
      disabled: idx === items.length - 1
    });
    const visBtn = el('button', {
      type: 'button',
      className: 'admin-icon-btn',
      textContent: item.published ? 'Ocultar' : 'Exibir'
    });
    const editBtn = el('button', {
      type: 'button',
      className: 'admin-icon-btn',
      textContent: 'Editar'
    });
    const delBtn = el('button', {
      type: 'button',
      className: 'admin-icon-btn is-danger',
      textContent: 'Excluir'
    });

    upBtn.addEventListener('click', () => swapOrder(cfg.collection, items, idx, idx - 1));
    downBtn.addEventListener('click', () => swapOrder(cfg.collection, items, idx, idx + 1));

    visBtn.addEventListener('click', async () => {
      visBtn.disabled = true;
      try {
        const { doc, updateDoc, serverTimestamp } = fbApi;
        await updateDoc(doc(state.db, cfg.collection, item.id), {
          published: !item.published,
          updatedAt: serverTimestamp()
        });
        showToast(!item.published ? `"${item.title}" publicado no site.` : `"${item.title}" ocultado do site.`);
        await fetchAllData();
      } catch (err) {
        showToast('Erro ao alterar visibilidade: ' + err.message, true);
      } finally {
        visBtn.disabled = false;
      }
    });

    editBtn.addEventListener('click', () => openItemDialog(sectionKey, item));

    delBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: `Excluir ${cfg.singular.toLowerCase()}`,
        message: `Tem certeza que deseja excluir "${item.title}"? Esta ação não pode ser desfeita.`,
        confirmText: 'Excluir'
      });
      if (!ok) return;
      try {
        const { doc, deleteDoc } = fbApi;
        await deleteDoc(doc(state.db, cfg.collection, item.id));
        showToast(`"${item.title}" excluído.`);
        await fetchAllData();
      } catch (err) {
        showToast('Erro ao excluir: ' + err.message, true);
      }
    });

    list.append(
      el('article', { className: 'admin-item-row' }, [
        thumbBox,
        meta,
        el('div', { className: 'admin-row-actions' }, [upBtn, downBtn, visBtn, editBtn, delBtn])
      ])
    );
  });

  panel.append(list);
}

let isReordering = false;

async function swapOrder(collectionName, list, indexA, indexB, reopenCats = false, sectionKey = null) {
  if (isReordering || indexB < 0 || indexB >= list.length) return;
  isReordering = true;
  try {
    const { doc, writeBatch } = fbApi;
    const batch = writeBatch(state.db);
    const reordered = [...list];
    const [moved] = reordered.splice(indexA, 1);
    reordered.splice(indexB, 0, moved);
    reordered.forEach((docItem, idx) => {
      batch.update(doc(state.db, collectionName, docItem.id), { order: idx + 1 });
    });
    await batch.commit();
    showToast('Ordem atualizada.');
    await fetchAllData();
    if (reopenCats && sectionKey) {
      const panel = document.querySelector(`#${SECTIONS[sectionKey].panelId}`);
      const details = panel && panel.querySelector('.admin-categories-box');
      if (details) details.open = true;
    }
  } catch (err) {
    showToast('Erro ao reordenar: ' + err.message, true);
  } finally {
    isReordering = false;
  }
}

// ===== Item Dialog (Create / Edit) =====
const itemDialog = document.querySelector('#item-dialog');
const itemForm = document.querySelector('#item-form');
itemForm.noValidate = true;
const fieldTitle = document.querySelector('#field-title');
const fieldSubtitle = document.querySelector('#field-subtitle');
const fieldCategory = document.querySelector('#field-category');
const fieldBrand = document.querySelector('#field-brand');
const fieldBrandVariant = document.querySelector('#field-brand-variant');
const fieldDescription = document.querySelector('#field-description');
const fieldNotes = document.querySelector('#field-notes');
const fieldPublished = document.querySelector('#field-published');
const projectExtraFields = document.querySelector('#project-extra-fields');
const itemPhotoList = document.querySelector('#item-photo-list');
const photoUploadInput = document.querySelector('#photo-upload-input');
const uploadProgress = document.querySelector('#upload-progress');
const uploadProgressFill = document.querySelector('#upload-progress-fill');
const uploadProgressText = document.querySelector('#upload-progress-text');
const uploadError = document.querySelector('#upload-error');
const itemFormStatus = document.querySelector('#item-form-status');
const itemSaveBtn = document.querySelector('#item-save-btn');
const inlineCategoryBox = document.querySelector('#inline-category-box');
const inlineCategoryName = document.querySelector('#inline-category-name');
const inlineCategoryStatus = document.querySelector('#inline-category-status');
const saveInlineCategoryBtn = document.querySelector('#save-inline-category');

function populateCategorySelect(sectionKey, selectedId = '') {
  const cfg = SECTIONS[sectionKey];
  const cats = getCategoriesForType(cfg.catType);
  fieldCategory.replaceChildren();
  fieldCategory.required = cfg.categoryRequired;
  document.querySelector('#category-label-text').textContent = cfg.categoryRequired
    ? 'Classificação *'
    : 'Classificação (opcional)';

  if (!cfg.categoryRequired) {
    fieldCategory.append(el('option', { value: '', textContent: 'Sem classificação' }));
  } else if (cats.length === 0) {
    fieldCategory.append(el('option', { value: '', textContent: 'Crie uma classificação ao lado' }));
  }

  cats.forEach((cat) => {
    fieldCategory.append(el('option', { value: cat.id, textContent: cat.name }));
  });

  const hasSelected = Boolean(selectedId && cats.some((cat) => cat.id === selectedId));
  if (hasSelected) {
    fieldCategory.value = selectedId;
  } else if (cfg.categoryRequired && cats.length > 0) {
    fieldCategory.value = cats[0].id;
  } else {
    fieldCategory.value = '';
  }
}

function renderItemPhotos() {
  itemPhotoList.replaceChildren();
  const photos = state.editing.photos;
  if (!photos.length) {
    itemPhotoList.append(el('p', { className: 'admin-muted', textContent: 'Nenhuma foto adicionada.' }));
    return;
  }

  photos.forEach((photo, idx) => {
    const captionInput = el('input', {
      type: 'text',
      value: photo.caption || '',
      maxlength: '160',
      placeholder: 'Legenda opcional',
      'aria-label': `Legenda da foto ${idx + 1}`
    });
    captionInput.value = photo.caption || '';
    captionInput.addEventListener('input', () => {
      photo.caption = captionInput.value;
      state.editing.dirty = true;
    });

    const leftBtn = el('button', { type: 'button', className: 'admin-icon-btn', textContent: '←', 'aria-label': 'Mover foto para esquerda', disabled: idx === 0 });
    const rightBtn = el('button', { type: 'button', className: 'admin-icon-btn', textContent: '→', 'aria-label': 'Mover foto para direita', disabled: idx === photos.length - 1 });
    const coverBtn = idx > 0
      ? el('button', { type: 'button', className: 'admin-icon-btn', textContent: 'Definir capa' })
      : null;
    const removeBtn = el('button', { type: 'button', className: 'admin-icon-btn is-danger', textContent: 'Remover' });

    leftBtn.addEventListener('click', () => {
      [photos[idx - 1], photos[idx]] = [photos[idx], photos[idx - 1]];
      state.editing.dirty = true;
      renderItemPhotos();
    });
    rightBtn.addEventListener('click', () => {
      [photos[idx + 1], photos[idx]] = [photos[idx], photos[idx + 1]];
      state.editing.dirty = true;
      renderItemPhotos();
    });
    if (coverBtn) {
      coverBtn.addEventListener('click', () => {
        const [chosen] = photos.splice(idx, 1);
        photos.unshift(chosen);
        state.editing.dirty = true;
        renderItemPhotos();
      });
    }
    removeBtn.addEventListener('click', () => {
      photos.splice(idx, 1);
      state.editing.dirty = true;
      renderItemPhotos();
    });

    const preview = el('div', { className: 'admin-photo-preview' }, [
      el('img', { src: cloudinaryUrl(photo, 400), alt: photo.caption || '' }),
      idx === 0 ? el('span', { className: 'admin-cover-pill', textContent: 'CAPA' }) : null
    ]);

    itemPhotoList.append(
      el('div', { className: 'admin-photo-card' }, [
        preview,
        captionInput,
        el('div', { className: 'admin-photo-actions' }, [leftBtn, rightBtn, coverBtn, removeBtn])
      ])
    );
  });
}

function openItemDialog(sectionKey, item) {
  const cfg = SECTIONS[sectionKey];
  state.editing = {
    sectionKey,
    itemId: item ? item.id : null,
    photos: item && Array.isArray(item.photos)
      ? item.photos.map((p) => ({ url: p.url || '', publicId: p.publicId || '', caption: p.caption || '' }))
      : [],
    dirty: false,
    uploading: false
  };

  document.querySelector('#item-dialog-eyebrow').textContent = cfg.label.toUpperCase();
  document.querySelector('#item-dialog-title').textContent = item
    ? `Editar ${cfg.singular.toLowerCase()}`
    : `Novo ${cfg.singular.toLowerCase()}`;

  fieldTitle.value = item?.title || '';
  fieldSubtitle.value = item?.subtitle || '';
  fieldDescription.value = item?.description || '';
  fieldNotes.value = item?.notes || '';
  fieldPublished.checked = item ? Boolean(item.published) : true;

  const isProject = sectionKey === 'projects';
  projectExtraFields.hidden = !isProject;
  fieldBrand.value = item?.brand || '';
  fieldBrandVariant.value = item?.brandVariant || '';

  populateCategorySelect(sectionKey, item?.categoryId || '');
  inlineCategoryBox.hidden = true;
  inlineCategoryName.value = '';
  inlineCategoryStatus.textContent = '';

  uploadProgress.hidden = true;
  uploadError.textContent = '';
  itemFormStatus.textContent = '';
  itemFormStatus.classList.remove('is-error');
  photoUploadInput.value = '';

  renderItemPhotos();
  itemDialog.showModal();
  fieldTitle.focus();
}

async function tryCloseItemDialog() {
  if (state.editing.uploading) {
    uploadError.textContent = 'Aguarde o envio das fotos terminar.';
    return;
  }
  if (state.editing.dirty) {
    const discard = await confirmDialog({
      title: 'Alterações não salvas',
      message: 'Existem alterações não salvas neste formulário. Deseja descartar e fechar?',
      confirmText: 'Descartar'
    });
    if (!discard) return;
  }
  state.editing.dirty = false;
  itemDialog.close();
}

itemForm.addEventListener('input', () => {
  state.editing.dirty = true;
});

document.querySelector('#item-dialog-close').addEventListener('click', tryCloseItemDialog);
document.querySelector('#item-cancel-btn').addEventListener('click', tryCloseItemDialog);
itemDialog.addEventListener('cancel', (e) => {
  e.preventDefault();
  tryCloseItemDialog();
});

document.querySelector('#toggle-inline-category').addEventListener('click', () => {
  inlineCategoryBox.hidden = !inlineCategoryBox.hidden;
  inlineCategoryStatus.textContent = '';
  if (!inlineCategoryBox.hidden) inlineCategoryName.focus();
});

document.querySelector('#cancel-inline-category').addEventListener('click', () => {
  inlineCategoryBox.hidden = true;
  inlineCategoryName.value = '';
  inlineCategoryStatus.textContent = '';
});

inlineCategoryName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveInlineCategoryBtn.click();
  }
});

saveInlineCategoryBtn.addEventListener('click', async () => {
  const name = inlineCategoryName.value.trim();
  if (!name) {
    inlineCategoryStatus.textContent = 'Informe o nome da classificação.';
    inlineCategoryStatus.classList.add('is-error');
    inlineCategoryName.focus();
    return;
  }
  const cfg = SECTIONS[state.editing.sectionKey];
  const existing = getCategoriesForType(cfg.catType);
  const maxOrder = existing.reduce((acc, c) => Math.max(acc, Number(c.order) || 0), 0);
  const slug = buildUniqueCategorySlug(name, cfg.catType);

  saveInlineCategoryBtn.disabled = true;
  inlineCategoryStatus.textContent = 'Criando...';
  inlineCategoryStatus.classList.remove('is-error');
  try {
    const { addDoc, collection } = fbApi;
    const ref = await addDoc(collection(state.db, 'categories'), {
      type: cfg.catType,
      name,
      slug,
      order: maxOrder + 1
    });
    state.categories = sortByOrder([
      ...state.categories,
      { id: ref.id, type: cfg.catType, name, slug, order: maxOrder + 1 }
    ]);
    populateCategorySelect(state.editing.sectionKey, ref.id);
    renderCatalogPanel(state.editing.sectionKey);
    inlineCategoryBox.hidden = true;
    inlineCategoryName.value = '';
    inlineCategoryStatus.textContent = '';
    itemFormStatus.textContent = '';
    itemFormStatus.classList.remove('is-error');
    state.editing.dirty = true;
    showToast(`Classificação "${name}" criada.`);
  } catch (err) {
    inlineCategoryStatus.textContent = 'Erro ao criar: ' + err.message;
    inlineCategoryStatus.classList.add('is-error');
  } finally {
    saveInlineCategoryBtn.disabled = false;
  }
});

function uploadFileToCloudinary(file, folder, onProgress) {
  return new Promise((resolve, reject) => {
    const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudinary.cloudName.trim())}/image/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', config.cloudinary.uploadPreset.trim());
    formData.append('folder', folder);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      try {
        const res = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && res.secure_url) {
          resolve({ url: res.secure_url, publicId: res.public_id || '', caption: '' });
        } else {
          reject(new Error(res.error?.message || `Falha no envio (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Resposta inválida do Cloudinary (${xhr.status})`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Erro de rede ao enviar imagem para o Cloudinary.')));
    xhr.send(formData);
  });
}

photoUploadInput.addEventListener('change', async () => {
  const files = [...(photoUploadInput.files || [])];
  photoUploadInput.value = '';
  if (!files.length) return;

  uploadError.textContent = '';
  const useCloudinary = isCloudinaryConfigReady(config);
  if (!useCloudinary && !isDemoAllowed()) {
    uploadError.textContent = 'Configuração do Cloudinary pendente. Configure cloudName e uploadPreset antes de enviar fotos.';
    return;
  }

  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const allowedExt = /\.(jpe?g|png|webp)$/i;
  for (const file of files) {
    if (!allowedTypes.has(file.type) && !allowedExt.test(file.name)) {
      uploadError.textContent = `Arquivo inválido (${file.name}). Aceitos: JPG, PNG ou WebP.`;
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      uploadError.textContent = `Arquivo muito grande (${file.name}). Máximo permitido: 10 MB.`;
      return;
    }
  }

  const cfg = SECTIONS[state.editing.sectionKey];
  state.editing.uploading = true;
  itemSaveBtn.disabled = true;
  uploadProgress.hidden = false;

  try {
    const demoMod = useCloudinary ? null : (demoApi || (await import('./demo-backend.js')));
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      uploadProgressFill.style.width = '0%';
      uploadProgressText.textContent = `Enviando ${i + 1} de ${files.length}: ${file.name} (0%)`;
      const onProg = (pct) => {
        uploadProgressFill.style.width = `${pct}%`;
        uploadProgressText.textContent = `Enviando ${i + 1} de ${files.length}: ${file.name} (${pct}%)`;
      };
      const uploaded = useCloudinary
        ? await uploadFileToCloudinary(file, cfg.folder, onProg)
        : await demoMod.compressImageToDataUrl(file, onProg);
      state.editing.photos.push(uploaded);
      state.editing.dirty = true;
      renderItemPhotos();
    }
    uploadProgressText.textContent = useCloudinary
      ? 'Envio concluído.'
      : 'Foto adicionada no modo de teste local.';
  } catch (err) {
    uploadProgress.hidden = true;
    const rawMsg = err && err.message ? err.message : 'verifique o upload preset unsigned.';
    if (useCloudinary && /preset|unsigned/i.test(rawMsg)) {
      const cName = (config.cloudinary?.cloudName || '').trim();
      const uPreset = (config.cloudinary?.uploadPreset || '').trim();
      uploadError.textContent =
        `Erro no upload: ${rawMsg}. Config atual no navegador: cloudName="${cName}", uploadPreset="${uPreset}". ` +
        'Confirme no Cloudinary (Settings > Upload > Upload presets) se esse preset existe exatamente com esse nome, está em modo Unsigned e foi salvo em public/site-config.js ou nas variáveis de ambiente (com redeploy).';
    } else {
      uploadError.textContent = 'Erro no upload: ' + rawMsg;
    }
  } finally {
    state.editing.uploading = false;
    itemSaveBtn.disabled = false;
  }
});

itemForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.editing.uploading) {
    itemFormStatus.textContent = 'Aguarde o término do upload das fotos.';
    itemFormStatus.classList.add('is-error');
    return;
  }

  const cfg = SECTIONS[state.editing.sectionKey];
  const title = fieldTitle.value.trim();
  const categoryId = fieldCategory.value;

  if (!title) {
    itemFormStatus.textContent = 'Informe o título.';
    itemFormStatus.classList.add('is-error');
    fieldTitle.focus();
    return;
  }
  if (cfg.categoryRequired && !categoryId) {
    itemFormStatus.textContent = 'Selecione ou crie uma classificação antes de salvar.';
    itemFormStatus.classList.add('is-error');
    if (getCategoriesForType(cfg.catType).length === 0) {
      inlineCategoryBox.hidden = false;
      inlineCategoryName.focus();
    } else {
      fieldCategory.focus();
    }
    return;
  }

  itemSaveBtn.disabled = true;
  itemFormStatus.textContent = 'Salvando...';
  itemFormStatus.classList.remove('is-error');

  let saved = false;
  try {
    const { addDoc, collection, doc, updateDoc, serverTimestamp } = fbApi;
    const payload = {
      title,
      subtitle: fieldSubtitle.value.trim(),
      categoryId,
      description: fieldDescription.value.trim(),
      notes: fieldNotes.value.trim(),
      photos: state.editing.photos
        .filter((p) => p && typeof p.url === 'string' && p.url.trim() !== '')
        .map((p) => ({
          url: p.url.trim(),
          publicId: (p.publicId || '').trim(),
          caption: (p.caption || '').trim()
        })),
      published: fieldPublished.checked,
      updatedAt: serverTimestamp()
    };

    if (state.editing.sectionKey === 'projects') {
      payload.brand = fieldBrand.value;
      payload.brandVariant = fieldBrandVariant.value;
    }

    if (state.editing.itemId) {
      await updateDoc(doc(state.db, cfg.collection, state.editing.itemId), payload);
      showToast(`${cfg.singular} "${title}" atualizado.`);
    } else {
      const existing = state[state.editing.sectionKey];
      const maxOrder = existing.reduce((acc, it) => Math.max(acc, Number(it.order) || 0), 0);
      payload.order = maxOrder + 1;
      payload.createdAt = serverTimestamp();
      await addDoc(collection(state.db, cfg.collection), payload);
      showToast(`${cfg.singular} "${title}" criado.`);
    }

    saved = true;
    state.editing.dirty = false;
    itemDialog.close();
  } catch (err) {
    itemFormStatus.textContent = 'Erro ao salvar: ' + (err.message || 'verifique permissões.');
    itemFormStatus.classList.add('is-error');
  } finally {
    itemSaveBtn.disabled = false;
  }

  if (saved) {
    try {
      await fetchAllData();
    } catch (err) {
      showToast('Item salvo, mas falhou ao atualizar a lista: ' + (err.message || 'recarregue a página.'), true);
    }
  }
});

// ===== Leads Panel =====
const leadSearchInput = document.querySelector('#lead-search');
const leadStatusFilter = document.querySelector('#lead-status-filter');
const leadsListEl = document.querySelector('#leads-list');
const leadsSummaryEl = document.querySelector('#leads-summary');
const leadsNewCountEl = document.querySelector('#leads-new-count');
const refreshLeadsBtn = document.querySelector('#refresh-leads-btn');
const leadsRefreshStatus = document.querySelector('#leads-refresh-status');

function sortLeadsNewestFirst(docs) {
  return docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
}

async function refreshLeads({ showSuccess = true } = {}) {
  const { collection, getDocs } = fbApi;
  const leadsSnap = await getDocs(collection(state.db, 'leads'));
  state.leads = sortLeadsNewestFirst(leadsSnap.docs);

  const existingIds = new Set(state.leads.map((l) => l.id));
  for (const id of state.dirtyLeads.keys()) {
    if (!existingIds.has(id)) state.dirtyLeads.delete(id);
  }

  renderLeadsPanel();

  if (state.dirtyLeads.size > 0) {
    leadsRefreshStatus.textContent = 'Lista atualizada. Suas alterações não salvas foram mantidas.';
    leadsRefreshStatus.classList.remove('is-error');
  } else if (showSuccess) {
    leadsRefreshStatus.textContent = 'Lista de clientes atualizada.';
    leadsRefreshStatus.classList.remove('is-error');
  }
}

function formatDateTime(ts) {
  if (!ts || !ts.toDate) return 'Data indisponível';
  return ts.toDate().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getFilteredLeads() {
  const q = leadSearchInput.value.trim().toLowerCase();
  const statusFilter = leadStatusFilter.value;
  return state.leads.filter((lead) => {
    if (statusFilter !== 'all' && (lead.status || 'novo') !== statusFilter) return false;
    if (!q) return true;
    const haystack = [
      lead.nome,
      lead.telefone,
      lead.telefoneE164,
      lead.periodo,
      lead.projeto,
      lead.observacaoInterna,
      ...(Array.isArray(lead.equipamentos) ? lead.equipamentos : [])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

function renderLeadsPanel() {
  const newCount = state.leads.filter((l) => (l.status || 'novo') === 'novo').length;
  leadsNewCountEl.textContent = String(newCount);
  leadsNewCountEl.hidden = newCount === 0;

  const filtered = getFilteredLeads();
  leadsSummaryEl.textContent = `${filtered.length} de ${state.leads.length} registro(s)`;
  leadsListEl.replaceChildren();

  if (filtered.length === 0) {
    leadsListEl.append(el('div', { className: 'admin-empty', textContent: 'Nenhum cliente encontrado com os filtros atuais.' }));
    return;
  }

  filtered.forEach((lead) => {
    const statusKey = lead.status || 'novo';
    const draft = state.dirtyLeads.get(lead.id);
    const e164 = String(lead.telefoneE164 || '').replace(/\D/g, '');

    const head = el('div', { className: 'admin-lead-head' }, [
      el('div', {}, [
        el('h3', { textContent: lead.nome || 'Sem nome' }),
        el('p', { className: 'admin-lead-date', textContent: formatDateTime(lead.createdAt) })
      ]),
      el('span', {
        className: `admin-badge admin-badge-status-${statusKey}`,
        textContent: LEAD_STATUS_LABELS[statusKey] || statusKey
      })
    ]);

    const links = el('div', { className: 'admin-lead-links' });
    if (e164) {
      links.append(
        el('a', { href: `tel:+${e164}`, textContent: `Ligar: ${lead.telefone || e164}` }),
        el('a', {
          href: `https://wa.me/${e164}`,
          target: '_blank',
          rel: 'noopener noreferrer',
          textContent: 'Abrir WhatsApp ↗'
        })
      );
    } else if (lead.telefone) {
      links.append(el('span', { textContent: `Telefone: ${lead.telefone}` }));
    }

    const body = el('div', { className: 'admin-lead-body' });
    if (lead.periodo) {
      body.append(el('p', {}, [el('strong', { textContent: 'Período: ' }), lead.periodo]));
    }
    if (Array.isArray(lead.equipamentos) && lead.equipamentos.length > 0) {
      const tags = el('div', { className: 'admin-lead-equip-list' });
      lead.equipamentos.forEach((eqName) => {
        tags.append(el('span', { className: 'admin-lead-equip-tag', textContent: eqName }));
      });
      body.append(el('p', {}, [el('strong', { textContent: 'Equipamentos:' })]), tags);
    }
    if (lead.projeto) {
      body.append(el('p', {}, [el('strong', { textContent: 'Sobre o projeto: ' }), lead.projeto]));
    }

    const statusSelect = el('select', { 'aria-label': `Status de ${lead.nome}` }, [
      el('option', { value: 'novo', textContent: 'Novo' }),
      el('option', { value: 'em_contato', textContent: 'Em contato' }),
      el('option', { value: 'fechado', textContent: 'Fechado' }),
      el('option', { value: 'descartado', textContent: 'Descartado' })
    ]);
    statusSelect.value = draft ? draft.status : statusKey;

    const noteArea = el('textarea', {
      rows: '2',
      maxlength: '2000',
      placeholder: 'Anotações internas sobre negociação, diária ou retorno'
    });
    noteArea.value = draft ? draft.observacaoInterna : (lead.observacaoInterna || '');

    const saveBtn = el('button', { type: 'button', className: 'button button-outline admin-btn-sm', textContent: 'Salvar' });
    const delBtn = el('button', { type: 'button', className: 'admin-icon-btn is-danger', textContent: 'Excluir' });

    const syncDirty = () => {
      if (statusSelect.value === statusKey && noteArea.value === (lead.observacaoInterna || '')) {
        state.dirtyLeads.delete(lead.id);
      } else {
        state.dirtyLeads.set(lead.id, {
          status: statusSelect.value,
          observacaoInterna: noteArea.value
        });
      }
    };
    statusSelect.addEventListener('change', syncDirty);
    noteArea.addEventListener('input', syncDirty);

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      try {
        const { doc, updateDoc, serverTimestamp } = fbApi;
        await updateDoc(doc(state.db, 'leads', lead.id), {
          status: statusSelect.value,
          observacaoInterna: noteArea.value.trim(),
          updatedAt: serverTimestamp()
        });
        state.dirtyLeads.delete(lead.id);
        showToast(`Lead de "${lead.nome}" atualizado.`);
        await fetchAllData();
      } catch (err) {
        showToast('Erro ao atualizar lead: ' + err.message, true);
      } finally {
        saveBtn.disabled = false;
      }
    });

    delBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Excluir cliente',
        message: `Excluir o orçamento de "${lead.nome}"?`,
        confirmText: 'Excluir'
      });
      if (!ok) return;
      try {
        const { doc, deleteDoc } = fbApi;
        await deleteDoc(doc(state.db, 'leads', lead.id));
        state.dirtyLeads.delete(lead.id);
        showToast('Lead excluído.');
        await fetchAllData();
      } catch (err) {
        showToast('Erro ao excluir lead: ' + err.message, true);
      }
    });

    const controls = el('div', { className: 'admin-lead-controls' }, [
      el('label', {}, ['Status', statusSelect]),
      el('label', {}, ['Observação interna', noteArea]),
      el('div', { className: 'admin-lead-actions' }, [saveBtn, delBtn])
    ]);

    leadsListEl.append(el('article', { className: 'admin-lead-card' }, [head, links, body, controls]));
  });
}

leadSearchInput.addEventListener('input', renderLeadsPanel);
leadStatusFilter.addEventListener('change', renderLeadsPanel);

refreshLeadsBtn.addEventListener('click', async () => {
  refreshLeadsBtn.disabled = true;
  refreshLeadsBtn.textContent = 'Atualizando...';
  leadsRefreshStatus.textContent = 'Atualizando clientes...';
  leadsRefreshStatus.classList.remove('is-error');
  try {
    await refreshLeads({ showSuccess: true });
  } catch (err) {
    leadsRefreshStatus.textContent = 'Erro ao atualizar clientes: ' + (err.message || 'tente novamente.');
    leadsRefreshStatus.classList.add('is-error');
  } finally {
    refreshLeadsBtn.textContent = 'Atualizar';
    refreshLeadsBtn.disabled = false;
  }
});

document.querySelector('#export-csv-btn').addEventListener('click', () => {
  const rows = getFilteredLeads();
  const escapeCsv = (val) => {
    const str = String(val ?? '');
    if (/[;"\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const header = [
    'Data/Hora',
    'Nome',
    'Telefone',
    'Telefone E.164',
    'Período',
    'Equipamentos',
    'Sobre o projeto',
    'Status',
    'Observação interna'
  ];
  const lines = [header.map(escapeCsv).join(';')];
  rows.forEach((lead) => {
    lines.push(
      [
        formatDateTime(lead.createdAt),
        lead.nome || '',
        lead.telefone || '',
        lead.telefoneE164 || '',
        lead.periodo || '',
        Array.isArray(lead.equipamentos) ? lead.equipamentos.join(', ') : '',
        lead.projeto || '',
        LEAD_STATUS_LABELS[lead.status || 'novo'] || lead.status || '',
        lead.observacaoInterna || ''
      ]
        .map(escapeCsv)
        .join(';')
    );
  });
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads-action-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ===== Tabs Navigation (with Keyboard Arrow Support) =====
const tabButtons = [...document.querySelectorAll('.admin-tabs [role="tab"]')];

async function activateTab(tabKey) {
  if (tabKey === state.activeTab) return;
  if (state.activeTab === 'leads' && state.dirtyLeads.size > 0) {
    const discard = await confirmDialog({
      title: 'Alterações pendentes em Clientes',
      message: 'Você editou status ou observações de clientes sem salvar. Deseja descartar e trocar de aba?',
      confirmText: 'Descartar'
    });
    if (!discard) return;
    state.dirtyLeads.clear();
  }
  state.activeTab = tabKey;
  tabButtons.forEach((btn) => {
    const isCurrent = btn.dataset.tab === tabKey;
    btn.setAttribute('aria-selected', String(isCurrent));
    btn.tabIndex = isCurrent ? 0 : -1;
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    if (panel) panel.hidden = !isCurrent;
  });

  if (tabKey === 'leads' && state.db) {
    leadsRefreshStatus.textContent = 'Atualizando clientes...';
    leadsRefreshStatus.classList.remove('is-error');
    try {
      await refreshLeads({ showSuccess: false });
      if (state.dirtyLeads.size === 0) {
        leadsRefreshStatus.textContent = '';
      }
    } catch (err) {
      leadsRefreshStatus.textContent = 'Erro ao atualizar clientes: ' + (err.message || 'tente novamente.');
      leadsRefreshStatus.classList.add('is-error');
    }
  }
}

tabButtons.forEach((btn, idx) => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  btn.addEventListener('keydown', (e) => {
    let nextIdx = null;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabButtons.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabButtons.length) % tabButtons.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = tabButtons.length - 1;
    if (nextIdx !== null) {
      e.preventDefault();
      tabButtons[nextIdx].focus();
      activateTab(tabButtons[nextIdx].dataset.tab);
    }
  });
});

function renderAll() {
  renderCatalogPanel('equipment');
  renderCatalogPanel('services');
  renderCatalogPanel('projects');
  renderLeadsPanel();
}

// ===== Migration of Initial Site Content =====
document.querySelector('#run-migration-btn').addEventListener('click', async () => {
  const btn = document.querySelector('#run-migration-btn');
  btn.disabled = true;
  showToast('Importando conteúdo atual...');
  try {
    const { doc, writeBatch, serverTimestamp } = fbApi;
    const batch = writeBatch(state.db);
    const now = serverTimestamp();

    const initialCategories = [
      { id: 'cat-cob', type: 'equipment', name: 'Iluminação COB', slug: 'cob', order: 1 },
      { id: 'cat-led', type: 'equipment', name: 'Painéis e LEDs', slug: 'led', order: 2 },
      { id: 'cat-grip', type: 'equipment', name: 'Grip', slug: 'grip', order: 3 }
    ];
    initialCategories.forEach((cat) => {
      batch.set(doc(state.db, 'categories', cat.id), {
        type: cat.type,
        name: cat.name,
        slug: cat.slug,
        order: cat.order
      });
    });

    const initialEquipment = [
      {
        id: 'nanlite-fc',
        title: 'Nanlite FC-500B',
        subtitle: 'LED bicolor',
        categoryId: 'cat-cob',
        description: 'Refletor LED bicolor para montar a luz principal do set e adaptar a temperatura de cor à cena.',
        photos: [{ url: 'assets/nanlite-fc.webp', publicId: '', caption: '' }],
        order: 1
      },
      {
        id: 'amaran',
        title: 'amaran F22c',
        subtitle: 'Painel LED flexível RGB',
        categoryId: 'cat-led',
        description: 'Painel LED flexível RGB para criar uma fonte difusa em entrevistas, publicidade e sets com espaço limitado.',
        photos: [{ url: 'assets/amaran.webp', publicId: '', caption: '' }],
        order: 2
      },
      {
        id: 'godox',
        title: 'Godox MS60R',
        subtitle: 'LED RGB compacto',
        categoryId: 'cat-cob',
        description: 'Refletor LED RGB compacto para recortes, fundos e pontos de cor em cena.',
        photos: [{ url: 'assets/godox.webp', publicId: '', caption: '' }],
        order: 3
      },
      {
        id: 'nanlite-fs',
        title: 'Nanlite FS-300C',
        subtitle: 'LED RGB',
        categoryId: 'cat-cob',
        description: 'Refletor LED RGB para trabalhar com luz branca ou criar recortes e efeitos de cor.',
        photos: [{ url: 'assets/nanlite-fs.webp', publicId: '', caption: '' }],
        order: 4
      },
      {
        id: 'century',
        title: 'Century e Grip',
        subtitle: 'Tripés, girafas e acessórios',
        categoryId: 'cat-grip',
        description: 'Tripés Century, girafas e acessórios de grip para posicionar luzes, difusores e rebatedores.',
        photos: [{ url: 'assets/century.webp', publicId: '', caption: '' }],
        order: 5
      },
      {
        id: 'aputure',
        title: 'Aputure MC',
        subtitle: 'Mini painel LED RGB',
        categoryId: 'cat-led',
        description: 'Mini painel LED RGB para detalhes, contraluz e pontos de cor em espaços apertados.',
        photos: [{ url: 'assets/aputure.webp', publicId: '', caption: '' }],
        order: 6
      }
    ];
    initialEquipment.forEach((eq) => {
      batch.set(doc(state.db, 'equipment', eq.id), {
        title: eq.title,
        subtitle: eq.subtitle,
        categoryId: eq.categoryId,
        description: eq.description,
        notes: '',
        photos: eq.photos,
        order: eq.order,
        published: true,
        createdAt: now,
        updatedAt: now
      });
    });

    const initialServices = [
      {
        id: 'locacao',
        title: 'Locação',
        subtitle: 'Iluminação, grip e elétrica montados em um pacote de acordo com o seu plano de filmagem.',
        order: 1
      },
      {
        id: 'gaffer',
        title: 'Gaffer e equipe de luz',
        subtitle: 'Planejamento com a direção de fotografia, montagem e operação da iluminação durante a diária.',
        order: 2
      },
      {
        id: 'direcao-fotografia',
        title: 'Direção de fotografia',
        subtitle: 'Concepção visual, escolhas de câmera e iluminação, do briefing à captação.',
        order: 3
      }
    ];
    initialServices.forEach((svc) => {
      batch.set(doc(state.db, 'services', svc.id), {
        title: svc.title,
        subtitle: svc.subtitle,
        categoryId: '',
        description: svc.subtitle,
        notes: '',
        photos: [],
        order: svc.order,
        published: true,
        createdAt: now,
        updatedAt: now
      });
    });

    const initialProjects = [
      { id: 'adidas-rfw', title: 'Rio Fashion Week', brand: 'adidas', brandVariant: '', order: 1 },
      { id: 'netflix-brasil70', title: 'Brasil 70', brand: 'NETFLIX', brandVariant: 'netflix', order: 2 },
      { id: 'prime-corrida', title: 'Corrida dos Bichos', brand: 'prime video', brandVariant: '', order: 3 },
      { id: 'amazon-creators', title: 'Amazon Creators Lab', brand: 'amazon\ncreators lab', brandVariant: 'amazon', order: 4 }
    ];
    initialProjects.forEach((proj) => {
      batch.set(doc(state.db, 'projects', proj.id), {
        title: proj.title,
        subtitle: '',
        categoryId: '',
        brand: proj.brand,
        brandVariant: proj.brandVariant,
        description: '',
        notes: '',
        photos: [],
        order: proj.order,
        published: true,
        createdAt: now,
        updatedAt: now
      });
    });

    batch.set(doc(state.db, 'meta', 'migration'), { done: true, migratedAt: now });
    await batch.commit();

    showToast('Conteúdo inicial importado com sucesso!');
    await fetchAllData();
  } catch (err) {
    showToast('Erro na importação: ' + err.message, true);
  } finally {
    btn.disabled = false;
  }
});

// ===== Auth & Bootstrap =====
const authView = document.querySelector('#auth-view');
const adminView = document.querySelector('#admin-view');
const userBar = document.querySelector('#admin-user-bar');
const userEmailEl = document.querySelector('#admin-user-email');
const loginForm = document.querySelector('#login-form');
const loginSubmitBtn = document.querySelector('#login-submit');
const authStatus = document.querySelector('#auth-status');
const configWarning = document.querySelector('#config-warning');

window.addEventListener('beforeunload', (e) => {
  if (state.editing.dirty || state.dirtyLeads.size > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});

function renderDemoModeNotices() {
  configWarning.hidden = false;
  configWarning.replaceChildren(
    el('strong', { textContent: 'Modo de teste local ativo: ' }),
    document.createTextNode('o site ainda está sem Firebase/Cloudinary em '),
    el('code', { textContent: 'variáveis de ambiente' }),
    document.createTextNode('. Use o usuário admin de teste abaixo para testar todo o painel antes de publicar:'),
    el('div', { style: 'margin-top:8px;display:grid;gap:4px;' }, [
      el('span', {}, [el('strong', { textContent: 'E-mail: ' }), el('code', { textContent: 'admin@action.test' })]),
      el('span', {}, [el('strong', { textContent: 'Senha: ' }), el('code', { textContent: 'Action@2026' })]),
      el('span', { className: 'admin-muted', textContent: 'Opcional (testar acesso negado): visitante@action.test / 123456' })
    ])
  );

  const fillBtn = el('button', {
    type: 'button',
    className: 'button button-outline admin-btn-sm',
    style: 'margin-top:10px;',
    textContent: 'Preencher usuário admin de teste'
  });
  fillBtn.addEventListener('click', () => {
    loginForm.elements.email.value = 'admin@action.test';
    loginForm.elements.password.value = 'Action@2026';
    authStatus.textContent = '';
    loginForm.elements.email.focus();
  });
  configWarning.append(fillBtn);

  if (!document.querySelector('#demo-mode-bar')) {
    const resetBtn = el('button', {
      type: 'button',
      className: 'button button-outline admin-btn-sm',
      textContent: 'Resetar dados de teste'
    });
    resetBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Resetar dados de teste',
        message: 'Isso apaga os itens, leads e fotos salvos localmente neste navegador e volta ao estado inicial.',
        confirmText: 'Resetar'
      });
      if (!ok) return;
      if (demoApi && demoApi.resetDemoDatabase) {
        demoApi.resetDemoDatabase();
      }
      showToast('Dados de teste resetados.');
      await fetchAllData();
    });

    const bar = el('div', {
      id: 'demo-mode-bar',
      className: 'admin-alert admin-alert-warn',
      style: 'margin-top:0;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;'
    }, [
      el('span', {}, [
        el('strong', { textContent: 'Modo de teste local: ' }),
        document.createTextNode('alterações e fotos são salvas apenas neste navegador (sem Firebase/Cloudinary).')
      ]),
      resetBtn
    ]);

    const topBar = adminView.querySelector('.admin-top-bar');
    if (topBar) topBar.after(bar);
  }
}

async function bootstrap() {
  const realFirebase = isFirebaseConfigReady(config);
  const useDemo = !realFirebase && isDemoAllowed();

  if (!realFirebase && !useDemo) {
    configWarning.hidden = false;
    loginForm.querySelectorAll('input, button').forEach((node) => {
      node.disabled = true;
    });
    return;
  }

  if (useDemo) {
    renderDemoModeNotices();
  }

  const retryLoadBtn = document.querySelector('#retry-load-btn');
  if (retryLoadBtn) {
    retryLoadBtn.addEventListener('click', () => {
      if (state.db) fetchAllData();
    });
  }

  try {
    const {
      initializeApp,
      getAuth,
      onAuthStateChanged,
      signInWithEmailAndPassword,
      signOut,
      getFirestore,
      initializeFirestore
    } = await loadFirebase();

    state.app = initializeApp(realFirebase ? config.firebase : {}, 'action-admin');
    state.auth = getAuth(state.app);
    if (realFirebase && typeof initializeFirestore === 'function') {
      try {
        state.db = initializeFirestore(state.app, { experimentalAutoDetectLongPolling: true });
      } catch {
        state.db = getFirestore(state.app);
      }
    } else {
      state.db = getFirestore(state.app);
    }

    onAuthStateChanged(state.auth, async (user) => {
      if (!user) {
        state.user = null;
        adminView.hidden = true;
        userBar.hidden = true;
        authView.hidden = false;
        return;
      }

      authStatus.textContent = 'Verificando permissão...';
      authStatus.classList.remove('is-error');
      try {
        const isAllowed = await verifyIsAdmin(user.uid);
        if (!isAllowed) {
          await signOut(state.auth);
          authStatus.textContent = 'Sem permissão. Esta conta não está cadastrada em admins/.';
          authStatus.classList.add('is-error');
          return;
        }
        state.user = user;
        userEmailEl.textContent = user.email || user.uid;
        authStatus.textContent = '';
        authView.hidden = true;
        adminView.hidden = false;
        userBar.hidden = false;
        renderAll();
        try {
          await fetchAllData();
        } catch (loadErr) {
          setAdminLoadStatus({
            message: 'Erro ao carregar dados do painel: ' + (loadErr.message || 'tente novamente.'),
            isError: true,
            showRetry: true
          });
        }
      } catch (err) {
        authStatus.textContent = 'Erro ao verificar acesso: ' + (err.message || 'tente novamente.');
        authStatus.classList.add('is-error');
      }
    });

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(loginForm);
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');
      if (!email || !password) return;

      loginSubmitBtn.disabled = true;
      authStatus.textContent = 'Entrando...';
      authStatus.classList.remove('is-error');
      try {
        await signInWithEmailAndPassword(state.auth, email, password);
      } catch (err) {
        authStatus.textContent =
          err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found'
            ? 'E-mail ou senha incorretos.'
            : 'Não foi possível entrar: ' + (err.message || 'verifique os dados.');
        authStatus.classList.add('is-error');
      } finally {
        loginSubmitBtn.disabled = false;
      }
    });

    document.querySelector('#logout-btn').addEventListener('click', async () => {
      await signOut(state.auth);
      showToast('');
    });
  } catch (err) {
    authStatus.textContent = 'Falha ao inicializar painel: ' + err.message;
    authStatus.classList.add('is-error');
  }
}

bootstrap();
