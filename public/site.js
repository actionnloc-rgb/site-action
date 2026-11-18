const equipment = {
  'nanlite-fc': 'Refletor LED bicolor para montar a luz principal do set e adaptar a temperatura de cor à cena.',
  amaran: 'Painel LED flexível RGB para criar uma fonte difusa em entrevistas, publicidade e sets com espaço limitado.',
  godox: 'Refletor LED RGB compacto para recortes, fundos e pontos de cor em cena.',
  'nanlite-fs': 'Refletor LED RGB para trabalhar com luz branca ou criar recortes e efeitos de cor.',
  century: 'Tripés Century, girafas e acessórios de grip para posicionar luzes, difusores e rebatedores.',
  aputure: 'Mini painel LED RGB para detalhes, contraluz e pontos de cor em espaços apertados.'
};

const config = window.ACTION_CONFIG || {};
const equipmentCatalog = new Map();
let servicesCatalog = [];
let projectsCatalog = [];
let leadSaver = null;
let leadInitError = '';
let leadInitDone = false;
let resolveLeadInit = null;
const leadInitPromise = new Promise((resolve) => {
  resolveLeadInit = resolve;
});

function hasRealConfigValue(val) {
  return typeof val === 'string' && val.trim() !== '' && val.trim() !== 'COLE_AQUI';
}

function isCloudinaryReady() {
  const cl = config.cloudinary;
  return Boolean(cl && hasRealConfigValue(cl.cloudName));
}

function resolveRawPhotoUrl(photo) {
  if (!photo) return '';
  if (typeof photo === 'string') return photo.trim();
  const raw = typeof photo.url === 'string'
    ? photo.url.trim()
    : (typeof photo.secure_url === 'string' ? photo.secure_url.trim() : '');
  if (raw.startsWith('http://res.cloudinary.com/')) {
    return 'https://' + raw.slice('http://'.length);
  }
  return raw;
}

function cloudinaryUrl(photo, width) {
  if (!photo) return '';
  const rawUrl = resolveRawPhotoUrl(photo);
  const publicId = typeof photo === 'object' && typeof photo.publicId === 'string' ? photo.publicId.trim() : '';
  if (publicId && isCloudinaryReady()) {
    const idx = rawUrl.indexOf('/image/upload/');
    if (idx !== -1) {
      return (
        rawUrl.slice(0, idx + '/image/upload/'.length) +
        `f_auto,q_auto,w_${width}/` +
        rawUrl.slice(idx + '/image/upload/'.length)
      );
    }
    return `https://res.cloudinary.com/${encodeURIComponent(config.cloudinary.cloudName.trim())}/image/upload/f_auto,q_auto,w_${width}/${publicId}`;
  }
  return rawUrl;
}

function getWhatsappDigits() {
  const raw = hasRealConfigValue(config.whatsappNumber) ? config.whatsappNumber : '5521999999999';
  const digits = String(raw).replace(/\D/g, '');
  return digits || '5521999999999';
}

function applyContactConfig() {
  const footerPhone = document.querySelector('#footer-phone');
  const waDigits = getWhatsappDigits();
  if (footerPhone) {
    footerPhone.href = 'tel:+' + waDigits;
    if (hasRealConfigValue(config.phoneDisplay)) {
      footerPhone.textContent = config.phoneDisplay.trim();
    }
  }
  if (hasRealConfigValue(config.instagramUrl)) {
    const igHref = config.instagramUrl.trim();
    document.querySelectorAll('a[href="https://www.instagram.com/actionn.film/"]').forEach((link) => {
      link.href = igHref;
    });
  }
}

applyContactConfig();

const navigation = document.querySelector('.main-nav');
const menuButton = document.querySelector('.menu-toggle');

function setMenu(open) {
  navigation.classList.toggle('open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
}

menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') === 'false'));
navigation.addEventListener('click', (event) => {
  if (event.target.closest('a')) setMenu(false);
});

const filterRow = document.querySelector('.filter-row');
const productGrid = document.querySelector('.product-grid');
const filterStatus = document.querySelector('#filter-status');

filterRow.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-filter]');
  if (!button) return;
  const filters = [...filterRow.querySelectorAll('button[data-filter]')];
  const products = [...productGrid.querySelectorAll('[data-product]')];
  filters.forEach((filter) => filter.setAttribute('aria-pressed', String(filter === button)));
  const category = button.dataset.filter;
  products.forEach((product) => {
    product.hidden = category !== 'all' && product.dataset.category !== category;
  });
  const count = products.filter((product) => !product.hidden).length;
  filterStatus.textContent = count === 1 ? '1 item exibido.' : count + ' itens exibidos.';
});

const productDialog = document.querySelector('#product-dialog');
const quoteDialog = document.querySelector('#quote-dialog');
const detailDialog = document.querySelector('#detail-dialog');
const productTitle = document.querySelector('#product-title');
const productImage = document.querySelector('#product-image');
const productCategory = document.querySelector('#product-category');
const productDescription = document.querySelector('#product-description');
const addProduct = document.querySelector('#add-product');
const selected = new Set();
const quoteForm = document.querySelector('#quote-form');
const selection = document.querySelector('#quote-selection');
const selectedItems = document.querySelector('#selected-items');

// Inject gallery thumbs, caption, and notes containers inside #product-dialog (hidden by default)
const productThumbs = document.createElement('div');
productThumbs.className = 'dialog-gallery-thumbs';
productThumbs.hidden = true;
const productCaption = document.createElement('p');
productCaption.className = 'dialog-caption';
productCaption.hidden = true;
productImage.after(productThumbs, productCaption);

const productNotesBox = document.createElement('div');
productNotesBox.className = 'dialog-notes';
productNotesBox.hidden = true;
const productNotesTitle = document.createElement('p');
productNotesTitle.className = 'dialog-notes-title';
productNotesTitle.textContent = 'Observações';
const productNotesText = document.createElement('p');
productNotesText.className = 'dialog-notes-text';
productNotesBox.append(productNotesTitle, productNotesText);
productDescription.after(productNotesBox);

[productDialog, quoteDialog, detailDialog].filter(Boolean).forEach((dialog) => {
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
});

function renderDialogGallery(imgEl, thumbsEl, captionEl, photos, altFallback) {
  const validPhotos = Array.isArray(photos) ? photos.filter((p) => p && p.url) : [];
  thumbsEl.replaceChildren();

  function selectPhoto(index) {
    const active = validPhotos[index];
    if (!active) return;
    imgEl.src = cloudinaryUrl(active, 1100);
    imgEl.alt = active.caption || altFallback || '';
    imgEl.hidden = false;

    if (active.caption) {
      captionEl.textContent = active.caption;
      captionEl.hidden = false;
    } else {
      captionEl.textContent = '';
      captionEl.hidden = true;
    }

    const thumbBtns = [...thumbsEl.querySelectorAll('.dialog-thumb')];
    thumbBtns.forEach((btn, i) => {
      if (i === index) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
  }

  if (validPhotos.length === 0) {
    imgEl.removeAttribute('src');
    imgEl.hidden = true;
    thumbsEl.hidden = true;
    captionEl.textContent = '';
    captionEl.hidden = true;
    return;
  }

  if (validPhotos.length > 1) {
    validPhotos.forEach((photo, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dialog-thumb';
      btn.setAttribute('aria-label', `Ver foto ${idx + 1}`);
      const img = document.createElement('img');
      img.src = cloudinaryUrl(photo, 240);
      img.alt = '';
      btn.append(img);
      btn.addEventListener('click', () => selectPhoto(idx));
      thumbsEl.append(btn);
    });
    thumbsEl.hidden = false;
  } else {
    thumbsEl.hidden = true;
  }

  selectPhoto(0);
}

productGrid.addEventListener('click', (event) => {
  const trigger = event.target.closest('.product-trigger');
  if (!trigger) return;
  const product = trigger.closest('[data-product]');
  if (!product) return;

  const key = product.dataset.product;
  const item = equipmentCatalog.get(key);
  const name = item ? item.title : product.querySelector('h3').textContent;
  const categoryLabel = item ? item.categoryName : product.querySelector('.product-type').textContent;
  const descriptionText = item ? item.description : equipment[key] || '';
  const notesText = item ? item.notes : '';
  const imgEl = product.querySelector('img');
  const imgSrc = imgEl ? imgEl.getAttribute('src') : '';
  const photos = item && Array.isArray(item.photos) && item.photos.length
    ? item.photos
    : (imgSrc ? [{ url: imgSrc, publicId: '', caption: '' }] : []);

  productTitle.textContent = name;
  productCategory.textContent = (categoryLabel || '').toUpperCase();
  productDescription.textContent = descriptionText;
  productDescription.hidden = !descriptionText;

  if (notesText && notesText.trim()) {
    productNotesText.textContent = notesText;
    productNotesBox.hidden = false;
  } else {
    productNotesText.textContent = '';
    productNotesBox.hidden = true;
  }

  renderDialogGallery(productImage, productThumbs, productCaption, photos, name);
  addProduct.firstChild.textContent = selected.has(name) ? 'Ver orçamento ' : 'Incluir no orçamento ';
  productDialog.showModal();
});

function openDetailDialog({ categoryLabel, title, description, notes, photos }) {
  if (!detailDialog) return;
  const dImg = document.querySelector('#detail-image');
  const dThumbs = document.querySelector('#detail-thumbs');
  const dCaption = document.querySelector('#detail-caption');
  const dCat = document.querySelector('#detail-category');
  const dTitle = document.querySelector('#detail-title');
  const dDesc = document.querySelector('#detail-description');
  const dNotesBox = document.querySelector('#detail-notes-box');
  const dNotes = document.querySelector('#detail-notes');

  if (categoryLabel) {
    dCat.textContent = categoryLabel.toUpperCase();
    dCat.hidden = false;
  } else {
    dCat.textContent = '';
    dCat.hidden = true;
  }

  dTitle.textContent = title || '';

  if (description) {
    dDesc.textContent = description;
    dDesc.hidden = false;
  } else {
    dDesc.textContent = '';
    dDesc.hidden = true;
  }

  if (notes && notes.trim()) {
    dNotes.textContent = notes;
    dNotesBox.hidden = false;
  } else {
    dNotes.textContent = '';
    dNotesBox.hidden = true;
  }

  renderDialogGallery(dImg, dThumbs, dCaption, photos, title);
  detailDialog.showModal();
}

const servicesListEl = document.querySelector('.services-list');
const projectGridEl = document.querySelector('.project-grid');

if (servicesListEl) {
  servicesListEl.addEventListener('click', (event) => {
    const btn = event.target.closest('.service-details-btn');
    if (!btn) return;
    const idx = Number(btn.dataset.serviceIndex);
    const svc = servicesCatalog[idx];
    if (!svc) return;
    openDetailDialog({
      categoryLabel: svc.categoryName || 'SERVIÇOS',
      title: svc.title,
      description: svc.description || svc.subtitle || '',
      notes: svc.notes || '',
      photos: svc.photos || []
    });
  });
}

if (projectGridEl) {
  projectGridEl.addEventListener('click', (event) => {
    const btn = event.target.closest('.project-trigger');
    if (!btn) return;
    const idx = Number(btn.dataset.projectIndex);
    const proj = projectsCatalog[idx];
    if (!proj) return;
    const brandClean = String(proj.brand || '').replace(/\n+/g, ' ').trim();
    openDetailDialog({
      categoryLabel: proj.categoryName || brandClean || 'PROJETOS',
      title: proj.title || brandClean,
      description: proj.description || proj.subtitle || '',
      notes: proj.notes || '',
      photos: proj.photos || []
    });
  });
}

function renderSelection() {
  lastSavedLeadSignature = null;
  selection.hidden = selected.size === 0;
  selectedItems.replaceChildren();
  selected.forEach((name) => {
    const item = document.createElement('li');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'Remover ' + name);
    remove.addEventListener('click', () => {
      selected.delete(name);
      renderSelection();
      (selectedItems.querySelector('button') || quoteForm.elements.nome).focus({preventScroll:true});
    });
    item.append(name, remove);
    selectedItems.append(item);
  });
}

addProduct.addEventListener('click', () => {
  selected.add(productTitle.textContent);
  renderSelection();
  productDialog.close();
  document.querySelector('#contato').scrollIntoView();
  quoteForm.elements.nome.focus({preventScroll:true});
});

const quotePreview = document.querySelector('#quote-preview');
const copyStatus = document.querySelector('#copy-status');
const whatsappQuoteLink = document.querySelector('#whatsapp-quote');
const quoteFormStatus = document.querySelector('#quote-form-status');
const quoteSubmitBtn = document.querySelector('#quote-submit-btn') || quoteForm.querySelector('button[type="submit"]');
const telInput = quoteForm.elements.telefone;

let isSubmittingQuote = false;
let lastSavedLeadSignature = null;

function setQuoteFormStatus(message = '', isError = false) {
  if (!quoteFormStatus) return;
  quoteFormStatus.textContent = message;
  quoteFormStatus.classList.toggle('is-error', Boolean(isError));
  quoteFormStatus.hidden = !message;
}

function setQuoteLoading(loading) {
  if (!quoteSubmitBtn) return;
  quoteSubmitBtn.disabled = loading;
  if (quoteSubmitBtn.firstChild && quoteSubmitBtn.firstChild.nodeType === Node.TEXT_NODE) {
    quoteSubmitBtn.firstChild.textContent = loading ? 'Registrando pedido... ' : 'Preparar mensagem ';
  } else {
    quoteSubmitBtn.textContent = loading ? 'Registrando pedido...' : 'Preparar mensagem ↗';
  }
}

if (telInput) {
  telInput.addEventListener('input', () => telInput.setCustomValidity(''));
}

quoteForm.addEventListener('input', () => {
  lastSavedLeadSignature = null;
  if (quoteFormStatus && quoteFormStatus.classList.contains('is-error')) {
    setQuoteFormStatus('');
  }
});

function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  if ((digits.length === 11 || digits.length === 12) && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if ((digits.length !== 10 && digits.length !== 11) || digits.startsWith('0')) {
    return null;
  }
  return '55' + digits;
}

async function waitForLeadInit(timeoutMs = 10000) {
  if (leadInitDone) return;
  await Promise.race([
    leadInitPromise,
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
}

function formatLeadError(err) {
  if (err && err.code === 'permission-denied') {
    return 'Não foi possível registrar seu orçamento (permissão recusada pelo servidor). Confira os campos e tente novamente.';
  }
  if (err && err.code === 'unavailable') {
    return 'Serviço temporariamente indisponível. Verifique sua conexão e tente novamente.';
  }
  return 'Não foi possível registrar seu orçamento agora. Verifique sua conexão e tente novamente.';
}

quoteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isSubmittingQuote) return;

  setQuoteFormStatus('');
  const data = new FormData(quoteForm);
  const name = String(data.get('nome') || '').trim();
  const dates = String(data.get('data') || '').trim();
  const phoneRaw = String(data.get('telefone') || '').trim();
  const project = String(data.get('projeto') || '').trim();
  const honeypot = String(data.get('empresa_site') || '').trim();

  if (!name || !project) {
    const field = quoteForm.elements[name ? 'projeto' : 'nome'];
    field.value = '';
    field.reportValidity();
    return;
  }

  const telefoneE164 = normalizePhone(phoneRaw);
  if (!telefoneE164 && telInput) {
    telInput.setCustomValidity('Informe um telefone válido com DDD e 8 ou 9 dígitos (ex. (21) 99999-9999).');
    telInput.reportValidity();
    return;
  }

  const lines = ['Oi, ACTION! Aqui é ' + name + '. Gostaria de pedir um orçamento.'];
  if (phoneRaw) lines.push('Telefone (WhatsApp): ' + phoneRaw);
  if (dates) lines.push('Data ou período: ' + dates);
  if (selected.size) lines.push('Equipamentos: ' + [...selected].join(', '));
  lines.push('Sobre o projeto: ' + project);

  const message = lines.join('\n\n');
  const openPreparedDialog = () => {
    quotePreview.value = message;
    if (whatsappQuoteLink) {
      whatsappQuoteLink.href = 'https://wa.me/' + getWhatsappDigits() + '?text=' + encodeURIComponent(message);
    }
    copyStatus.textContent = '';
    quoteDialog.showModal();
  };

  if (honeypot) {
    openPreparedDialog();
    return;
  }

  const payload = {
    nome: name,
    telefone: phoneRaw,
    telefoneE164,
    periodo: dates,
    projeto: project,
    equipamentos: [...selected]
  };
  const signature = JSON.stringify(payload);
  if (signature === lastSavedLeadSignature) {
    openPreparedDialog();
    return;
  }

  isSubmittingQuote = true;
  setQuoteLoading(true);
  try {
    await waitForLeadInit();
    if (typeof leadSaver !== 'function') {
      setQuoteFormStatus(
        leadInitError || 'Não foi possível conectar ao sistema de orçamentos. Tente novamente em instantes.',
        true
      );
      return;
    }

    await leadSaver(payload);
    lastSavedLeadSignature = signature;
    setQuoteFormStatus('');
    openPreparedDialog();
  } catch (err) {
    console.error('Erro ao gravar lead no Firestore:', err);
    setQuoteFormStatus(formatLeadError(err), true);
  } finally {
    isSubmittingQuote = false;
    setQuoteLoading(false);
  }
});

document.querySelector('#copy-quote').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(quotePreview.value);
    copyStatus.textContent = 'Mensagem copiada.';
  } catch {
    quotePreview.select();
    copyStatus.textContent = 'Texto selecionado. Use a opção de copiar do seu dispositivo.';
  }
});

function buildCategoriesMap(categories) {
  const map = new Map();
  if (Array.isArray(categories)) {
    categories.forEach((cat) => {
      if (cat && cat.id) map.set(cat.id, cat);
    });
  }
  return map;
}

window.ActionSite = {
  setLeadSaver(fn) {
    leadSaver = typeof fn === 'function' ? fn : null;
    leadInitError = '';
    leadInitDone = true;
    if (resolveLeadInit) resolveLeadInit();
  },

  setLeadInitError(message) {
    leadSaver = null;
    leadInitError = typeof message === 'string' ? message : '';
    leadInitDone = true;
    if (resolveLeadInit) resolveLeadInit();
  },

  setEquipment(items, categories) {
    equipmentCatalog.clear();
    const catMap = buildCategoriesMap(categories);

    const usedCategoryIds = new Set();
    const normalized = (Array.isArray(items) ? items : []).map((item) => {
      const cat = item.categoryId ? catMap.get(item.categoryId) : null;
      const categorySlug = cat ? cat.slug : (item.categorySlug || 'outros');
      const categoryName = cat ? cat.name : (item.categoryName || 'Equipamentos');
      if (cat) usedCategoryIds.add(cat.id);
      const entry = {
        ...item,
        categorySlug,
        categoryName
      };
      equipmentCatalog.set(item.id, entry);
      return entry;
    });

    // Rebuild filter buttons: "Todos" always first, then categories with published items
    const activeCats = (Array.isArray(categories) ? categories : []).filter(
      (c) => c.type === 'equipment' && usedCategoryIds.has(c.id)
    );
    filterRow.replaceChildren();
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.dataset.filter = 'all';
    allBtn.setAttribute('aria-pressed', 'true');
    allBtn.textContent = 'Todos';
    filterRow.append(allBtn);

    activeCats.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.filter = cat.slug;
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = cat.name;
      filterRow.append(btn);
    });

    // Rebuild product grid
    productGrid.replaceChildren();
    normalized.forEach((item) => {
      const article = document.createElement('article');
      article.className = 'product';
      article.dataset.category = item.categorySlug;
      article.dataset.product = item.id;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'product-trigger';
      btn.setAttribute('aria-label', 'Ver detalhes do ' + item.title);

      const imgWrap = document.createElement('div');
      imgWrap.className = 'product-image';
      const photoList = Array.isArray(item.photos) ? item.photos : [];
      const firstPhoto = photoList.find((p) => Boolean(cloudinaryUrl(p, 720)))
        || (item.imageUrl ? { url: item.imageUrl } : null)
        || (item.photoUrl ? { url: item.photoUrl } : null);
      const imageSrc = firstPhoto ? cloudinaryUrl(firstPhoto, 720) : '';
      const rawFallbackSrc = firstPhoto ? resolveRawPhotoUrl(firstPhoto) : '';

      const setEmptyImageState = () => {
        imgWrap.classList.add('is-empty');
        const label = document.createElement('span');
        label.className = 'product-image-empty';
        label.textContent = 'SEM FOTO';
        imgWrap.replaceChildren(label);
      };

      if (imageSrc) {
        const img = document.createElement('img');
        img.src = imageSrc;
        img.width = 720;
        img.height = 470;
        img.alt = '';
        img.decoding = 'async';
        let triedRawFallback = false;
        img.addEventListener('error', () => {
          if (!triedRawFallback && rawFallbackSrc && img.src !== rawFallbackSrc) {
            triedRawFallback = true;
            img.src = rawFallbackSrc;
            return;
          }
          setEmptyImageState();
        });
        imgWrap.append(img);
      } else {
        setEmptyImageState();
      }

      const info = document.createElement('div');
      info.className = 'product-info';
      const textWrap = document.createElement('div');
      const typeP = document.createElement('p');
      typeP.className = 'product-type';
      typeP.textContent = (item.categoryName || '').toUpperCase();
      const titleH3 = document.createElement('h3');
      titleH3.textContent = item.title || '';
      const subP = document.createElement('p');
      subP.textContent = item.subtitle || '';
      textWrap.append(typeP, titleH3, subP);

      const arrow = document.createElement('span');
      arrow.className = 'circle-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '↗';

      info.append(textWrap, arrow);
      btn.append(imgWrap, info);
      article.append(btn);
      productGrid.append(article);
    });

    filterStatus.textContent = '';
  },

  setServices(items, categories) {
    if (!servicesListEl) return;
    const catMap = buildCategoriesMap(categories);
    servicesCatalog = (Array.isArray(items) ? items : []).map((item) => {
      const cat = item.categoryId ? catMap.get(item.categoryId) : null;
      return { ...item, categoryName: cat ? cat.name : '' };
    });

    servicesListEl.replaceChildren();
    servicesCatalog.forEach((item, idx) => {
      const article = document.createElement('article');
      if (item.categoryName) {
        const catP = document.createElement('p');
        catP.className = 'product-type service-category';
        catP.textContent = item.categoryName.toUpperCase();
        article.append(catP);
      }
      const h3 = document.createElement('h3');
      h3.textContent = item.title || '';
      const p = document.createElement('p');
      p.textContent = item.subtitle || item.description || '';
      article.append(h3, p);

      const hasPhotos = Array.isArray(item.photos) && item.photos.some((photo) => photo && photo.url);
      const hasNotes = Boolean(item.notes && item.notes.trim());
      const hasExtraDesc = Boolean(item.subtitle && item.description && item.subtitle.trim() !== item.description.trim());
      if (hasPhotos || hasNotes || hasExtraDesc) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'underlink service-details-btn';
        btn.dataset.serviceIndex = String(idx);
        btn.append(document.createTextNode('Ver detalhes '));
        const arrow = document.createElement('span');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '↗';
        btn.append(arrow);
        article.append(btn);
      }

      servicesListEl.append(article);
    });
  },

  setProjects(items, categories) {
    if (!projectGridEl) return;
    const catMap = buildCategoriesMap(categories);
    projectsCatalog = (Array.isArray(items) ? items : []).map((item) => {
      const cat = item.categoryId ? catMap.get(item.categoryId) : null;
      return { ...item, categoryName: cat ? cat.name : '' };
    });

    projectGridEl.replaceChildren();
    projectsCatalog.forEach((item, idx) => {
      const article = document.createElement('article');
      const brandSpan = document.createElement('span');
      brandSpan.className = 'project-brand';
      if (item.brandVariant === 'netflix') brandSpan.classList.add('netflix');
      else if (item.brandVariant === 'amazon') brandSpan.classList.add('amazon');

      const brandLines = String(item.brand || '').split('\n');
      brandLines.forEach((line, lineIdx) => {
        if (lineIdx > 0) brandSpan.append(document.createElement('br'));
        brandSpan.append(document.createTextNode(line));
      });

      const h3 = document.createElement('h3');
      h3.textContent = item.title || '';

      const firstPhoto = Array.isArray(item.photos) ? item.photos.find((photo) => photo && photo.url) : null;
      const hasDetails = Boolean(
        (item.subtitle && item.subtitle.trim()) ||
        (item.description && item.description.trim()) ||
        (item.notes && item.notes.trim())
      );

      if (firstPhoto && firstPhoto.url) {
        article.classList.add('has-photo');
        const cover = document.createElement('img');
        cover.className = 'project-cover';
        cover.src = cloudinaryUrl(firstPhoto, 720);
        cover.width = 720;
        cover.height = 470;
        cover.alt = '';
        cover.loading = 'lazy';

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'project-trigger';
        trigger.dataset.projectIndex = String(idx);
        trigger.setAttribute('aria-label', 'Ver detalhes do projeto ' + (item.title || ''));
        trigger.append(brandSpan, h3);

        article.append(cover, trigger);
      } else if (hasDetails) {
        article.classList.add('has-details');
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'project-trigger';
        trigger.dataset.projectIndex = String(idx);
        trigger.setAttribute('aria-label', 'Ver detalhes do projeto ' + (item.title || ''));
        trigger.append(brandSpan, h3);
        article.append(trigger);
      } else {
        article.append(brandSpan, h3);
      }

      projectGridEl.append(article);
    });
  }
};

