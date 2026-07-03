const API = '/api';

let comptes = [], evenements = [], clients = [], users = [], currentUser = null;
let editingUserId = null;
let currentCompteId = null, editingCompteId = null, editingEventId = null;
let ficheMois = new Date(), planningMois = new Date();

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const users = await api('/users');
  renderLogin(users);
});

function renderLogin(users) {
  const colors = ['#2563eb', '#7c3aed', '#16a34a', '#d97706', '#dc2626'];
  document.getElementById('user-list').innerHTML = users.map((u, i) => `
    <button class="user-btn" onclick="login(${u.id})">
      <div class="user-avatar" style="background:${colors[i % colors.length]}">${initials(u.nom)}</div>
      <div><div class="user-name">${esc(u.nom)}</div><div class="user-role">${u.role === 'manager' ? 'Manager' : 'Sales'}</div></div>
    </button>
  `).join('');
}

async function login(userId) {
  const users = await api('/users');
  currentUser = users.find(u => u.id === userId);
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  const colors = ['#2563eb', '#7c3aed', '#16a34a'];
  document.getElementById('user-info').innerHTML = `
    <div class="user-info-avatar" style="background:${colors[userId % colors.length]}">${initials(currentUser.nom)}</div>
    <div><div class="user-info-name">${esc(currentUser.nom)}</div><div class="user-info-role">${currentUser.role === 'manager' ? 'Manager' : 'Sales'}</div></div>
  `;
  await loadAll();
  bindNav();
  bindModals();
  bindForms();
  renderCRM();
  renderStats();
}

async function loadAll() {
  [comptes, clients, users] = await Promise.all([
    api(`/comptes?user_id=${currentUser.id}`),
    api(`/clients?user_id=${currentUser.id}`),
    api('/users')
  ]);
}

// ── API ───────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return res.json();
}

// ── NAV ───────────────────────────────────────────────────
function bindNav() {
  document.querySelectorAll('.nav-item').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const view = a.dataset.view;
      showView(view);
      document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
    });
  });

  document.getElementById('btn-back').addEventListener('click', () => {
    showView('crm');
    document.querySelectorAll('.nav-item')[0].classList.add('active');
    document.querySelectorAll('.nav-item').forEach((x, i) => { if (i > 0) x.classList.remove('active'); });
  });

  document.getElementById('btn-nouveau-compte').addEventListener('click', () => openModalCompte());
  document.getElementById('fiche-prev-month').addEventListener('click', () => { ficheMois.setMonth(ficheMois.getMonth()-1); renderFicheCalendar(); });
  document.getElementById('fiche-next-month').addEventListener('click', () => { ficheMois.setMonth(ficheMois.getMonth()+1); renderFicheCalendar(); });
  document.getElementById('plan-prev-month').addEventListener('click', async () => { planningMois.setMonth(planningMois.getMonth()-1); await loadEvenements(null); renderPlanningCalendar(); });
  document.getElementById('plan-next-month').addEventListener('click', async () => { planningMois.setMonth(planningMois.getMonth()+1); await loadEvenements(null); renderPlanningCalendar(); });
  document.getElementById('btn-nouveau-user').addEventListener('click', () => openModalUser());
  document.getElementById('select-user-role').addEventListener('change', e => toggleManagerSelect(e.target.value));
  document.getElementById('search-input').addEventListener('input', renderCRM);
  document.getElementById('filter-qual').addEventListener('change', renderCRM);
  document.getElementById('btn-add-event').addEventListener('click', () => openModalEvent());
  document.getElementById('btn-edit-compte').addEventListener('click', () => { const c = comptes.find(x => x.id === currentCompteId); if (c) openModalCompte(c); });
  document.getElementById('btn-convertir').addEventListener('click', () => openModalConvertir());
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  if (name === 'planning') loadEvenements(null).then(() => renderPlanningCalendar());
  if (name === 'clients') renderClients();
  if (name === 'admin') renderAdmin();
}

// ── MODALS ────────────────────────────────────────────────
function bindModals() {
  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); }));
}
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── MODAL COMPTE ──────────────────────────────────────────
function openModalCompte(compte = null) {
  editingCompteId = compte ? compte.id : null;
  const form = document.getElementById('form-compte');
  form.reset();
  document.getElementById('modal-compte-title').textContent = compte ? 'Modifier le compte' : 'Nouveau compte';
  document.getElementById('submit-compte').textContent = compte ? 'Enregistrer' : 'Créer le compte';

  // Peupler les listes déroulantes depuis les vrais utilisateurs
  const salesUsers = users.filter(u => u.role === 'sales');
  const managerUsers = users.filter(u => u.role === 'manager');

  document.getElementById('select-sales-id').innerHTML = salesUsers.map(u =>
    `<option value="${u.id}">${esc(u.nom)}</option>`
  ).join('');

  document.getElementById('select-manager-id-compte').innerHTML = managerUsers.map(u =>
    `<option value="${u.id}">${esc(u.nom)}</option>`
  ).join('');

  if (compte) {
    form.nom.value = compte.nom || '';
    form.secteur.value = compte.secteur || '';
    // Trouver le sales par nom
    const salesUser = users.find(u => u.nom === compte.sales);
    if (salesUser) form.sales_id.value = salesUser.id;
    const mgrUser = users.find(u => u.nom === compte.manager);
    if (mgrUser) form.manager_id_compte.value = mgrUser.id;
    form.qualification.value = compte.qualification || 'interet';
    form.valeur.value = compte.valeur || '';
    form.commission_sales.value = compte.commission_sales ?? 50;
    form.commission_manager.value = compte.commission_manager ?? 50;
    form.note.value = compte.note || '';
    if (compte.date_adoption) form.date_adoption.value = compte.date_adoption;
    if (compte.duree_essai) form.duree_essai.value = compte.duree_essai;
    toggleAdoptionFields(compte.qualification);
  } else {
    // Par défaut, sélectionner l'utilisateur courant si c'est un sales
    if (currentUser.role === 'sales') {
      form.sales_id.value = currentUser.id;
    }
    // Sélectionner le manager de l'utilisateur courant
    if (currentUser.role === 'sales' && currentUser.manager_id) {
      form.manager_id_compte.value = currentUser.manager_id;
    }
  }

  openModal('modal-compte');
}

document.getElementById('select-qual').addEventListener('change', e => toggleAdoptionFields(e.target.value));

function toggleAdoptionFields(val) {
  document.getElementById('adoption-fields').style.display = val === 'adoption' ? 'block' : 'none';
}

// ── MODAL CONVERTIR ───────────────────────────────────────
function openModalConvertir() {
  document.getElementById('form-convertir').reset();
  document.getElementById('preview-commission').style.display = 'none';
  openModal('modal-convertir');
}

document.getElementById('form-convertir').addEventListener('input', () => {
  const form = document.getElementById('form-convertir');
  const prix = parseFloat(form.prix_mensuel.value) || 0;
  const config = parseFloat(form.frais_config.value) || 0;
  const c = comptes.find(x => x.id === currentCompteId);
  if (!prix || !c) return;
  const annuel = prix * 12;
  const total = annuel + config;
  const pctS = c.commission_sales || 50;
  const pctM = c.commission_manager || 50;
  const commS = (annuel * pctS / 100).toFixed(0);
  const commM = (annuel * pctM / 100).toFixed(0);
  const commTotal = annuel;
  const prev = document.getElementById('preview-commission');
  prev.style.display = 'block';
  prev.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Aperçu des commissions</div>
    <div class="pr-row"><span>Prix mensuel</span><span>${fmt(prix)} €/mois</span></div>
    <div class="pr-row"><span>Frais de config</span><span>${fmt(config)} €</span></div>
    <div class="pr-row"><span>Commission ${c.sales} (${pctS}%)</span><span>${fmt(commS)} €</span></div>
    <div class="pr-row"><span>Commission ${c.manager} (${pctM}%)</span><span>${fmt(commM)} €</span></div>
    <div class="pr-row total"><span>Commission totale annuelle</span><span>${fmt(commTotal)} €</span></div>
  `;
});

// ── FORMS ─────────────────────────────────────────────────
function bindForms() {
  document.getElementById('form-compte').addEventListener('submit', async () => {
    const form = document.getElementById('form-compte');

    // Récupérer les vrais noms depuis les IDs sélectionnés
    const salesId = parseInt(form.sales_id.value);
    const managerId = parseInt(form.manager_id_compte.value);
    const salesUser = users.find(u => u.id === salesId);
    const mgrUser = users.find(u => u.id === managerId);

    const data = {
      nom: form.nom.value,
      secteur: form.secteur.value,
      sales: salesUser ? salesUser.nom : '',
      manager: mgrUser ? mgrUser.nom : '',
      qualification: form.qualification.value,
      date_adoption: form.date_adoption ? form.date_adoption.value : '',
      duree_essai: parseInt(form.duree_essai ? form.duree_essai.value : 15) || 15,
      valeur: parseInt(form.valeur.value) || 0,
      commission_sales: parseInt(form.commission_sales.value) || 50,
      commission_manager: parseInt(form.commission_manager.value) || 50,
      note: form.note.value,
      user_id: salesId  // Le compte appartient au sales sélectionné
    };
    if (editingCompteId) {
      await api(`/comptes/${editingCompteId}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await api('/comptes', { method: 'POST', body: JSON.stringify(data) });
    }
    closeModal('modal-compte');
    await loadAll();
    renderCRM();
    renderStats();
    if (editingCompteId && currentCompteId === editingCompteId) renderFicheHeader();
  });

  document.getElementById('form-convertir').addEventListener('submit', async () => {
    const form = document.getElementById('form-convertir');
    const data = { prix_mensuel: parseFloat(form.prix_mensuel.value) || 0, frais_config: parseFloat(form.frais_config.value) || 0 };
    await api(`/comptes/${currentCompteId}/convertir`, { method: 'POST', body: JSON.stringify(data) });
    closeModal('modal-convertir');
    await loadAll();
    renderCRM();
    renderStats();
    showView('clients');
    document.querySelectorAll('.nav-item').forEach((x, i) => x.classList.toggle('active', i === 1));
  });

  document.getElementById('form-event').addEventListener('submit', async () => {
    const form = document.getElementById('form-event');
    const data = { compte_id: currentCompteId, titre: form.titre.value, type: form.type.value, date: form.date.value, heure: form.heure.value, lieu: form.lieu.value, commentaire: form.commentaire.value };
    if (editingEventId) {
      await api(`/evenements/${editingEventId}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await api('/evenements', { method: 'POST', body: JSON.stringify(data) });
    }
    closeModal('modal-event');
    await loadEvenements(currentCompteId);
    renderFicheCalendar();
    renderFicheEvents();
  });

  document.getElementById('form-user').addEventListener('submit', async () => {
    const form = document.getElementById('form-user');
    const data = { nom: form.nom.value, role: form.role.value, manager_id: form.manager_id ? parseInt(form.manager_id.value) : null };
    if (editingUserId) {
      await api(`/users/${editingUserId}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await api('/users', { method: 'POST', body: JSON.stringify(data) });
    }
    closeModal('modal-user');
    users = await api('/users');
    renderAdmin();
    renderLogin(users);
  });

  document.getElementById('btn-delete-event').addEventListener('click', async () => {
    if (!editingEventId) return;
    await api(`/evenements/${editingEventId}`, { method: 'DELETE' });
    closeModal('modal-event-detail');
    await loadEvenements(currentCompteId);
    renderFicheCalendar();
    renderFicheEvents();
    editingEventId = null;
  });
}

// ── RENDER CRM ────────────────────────────────────────────
function renderCRM() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const qual = document.getElementById('filter-qual').value;
  const filtered = comptes.filter(c => {
    const matchQ = !q || [c.nom, c.sales, c.manager, c.secteur].some(f => (f||'').toLowerCase().includes(q));
    const matchQual = !qual || c.qualification === qual;
    return matchQ && matchQual;
  });
  document.getElementById('count-badge').textContent = filtered.length;
  const grid = document.getElementById('comptes-grid');
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">Aucun compte trouvé</div>`;
    return;
  }
  grid.innerHTML = filtered.map(c => cardHTML(c)).join('');
}

function cardHTML(c) {
  const { urgency, trialHTML, badgeClass, badgeLabel } = trialInfo(c);
  let cls = 'compte-card';
  if (urgency === 'red') cls += ' urgency-red';
  if (urgency === 'violet') cls += ' urgency-violet';
  return `
  <div class="${cls}" onclick="openFiche(${c.id})">
    <button class="card-delete" onclick="event.stopPropagation();deleteCompte(${c.id})" title="Supprimer">🗑</button>
    <div class="card-top">
      <div><div class="card-name">${esc(c.nom)}</div><div class="card-secteur">${esc(c.secteur || '—')}</div></div>
      <span class="qual-badge ${badgeClass}">${badgeLabel}</span>
    </div>
    <div class="card-value">${fmtK(c.valeur || 0)}<span> €</span></div>
    ${trialHTML}
    <div class="card-people">
      <div class="card-person"><div class="avatar sales">${initials(c.sales)}</div><div><div>${esc(c.sales||'—')}</div><div class="person-role">Sales</div></div><span class="commission-tag">${c.commission_sales||50}%</span></div>
      <div class="card-person"><div class="avatar manager">${initials(c.manager)}</div><div><div>${esc(c.manager||'—')}</div><div class="person-role">Manager</div></div><span class="commission-tag">${c.commission_manager||50}%</span></div>
    </div>
  </div>`;
}

function trialInfo(c) {
  const labels = { interet: 'Intérêt IA — à recontacter', essai: 'Signer pour essai 15j', adoption: 'Adoption en cours' };
  const classes = { interet: 'qual-interet', essai: 'qual-essai', adoption: 'qual-adoption' };

  if (c.qualification !== 'adoption' || !c.date_adoption) {
    return { urgency: null, trialHTML: '', badgeClass: classes[c.qualification] || 'qual-interet', badgeLabel: labels[c.qualification] || c.qualification };
  }

  const start = new Date(c.date_adoption);
  const duree = c.duree_essai || 15;
  const now = new Date();
  const elapsed = Math.floor((now - start) / 86400000);
  const remaining = duree - elapsed;
  const pct = Math.min(100, Math.round((elapsed / duree) * 100));

  let fillClass = 'fill-ok', cntClass = 'cnt-ok', urgency = null;
  let badgeClass = 'qual-adoption', badgeLabel = 'Adoption en cours';
  let alertHTML = '';

  if (remaining <= 0) {
    fillClass = 'fill-crit'; cntClass = 'cnt-crit'; urgency = 'red';
    badgeClass = 'qual-red'; badgeLabel = 'Adoption — URGENT';
    alertHTML = `<div class="trial-alert alert-red">⚠ Essai terminé — décision requise</div>`;
  } else if (elapsed >= 10) {
    fillClass = 'fill-warn'; cntClass = 'cnt-warn'; urgency = 'violet';
    alertHTML = `<div class="trial-alert alert-violet">⚠ Essai expire dans ${remaining}j — relancer</div>`;
  }

  const label = remaining <= 0 ? 'Expiré !' : `${remaining}j restants`;
  const trialHTML = `
    <div class="trial-wrap">
      <div class="trial-header">
        <span class="trial-label">Essai ${duree}j · depuis le ${formatDate(c.date_adoption)}</span>
        <span class="trial-count ${cntClass}">${label}</span>
      </div>
      <div class="trial-bar"><div class="trial-fill ${fillClass}" style="width:${pct}%"></div></div>
      ${alertHTML}
    </div>`;

  return { urgency, trialHTML, badgeClass, badgeLabel };
}

// ── RENDER STATS ──────────────────────────────────────────
async function renderStats() {
  const stats = await api(`/stats?user_id=${currentUser.id}`);
  document.getElementById('header-stats').innerHTML = `
    <div class="stat-pill"><div class="stat-val">${fmtK(stats.pipeline)}<small style="font-size:13px;font-weight:400"> €</small></div><div class="stat-label">Pipeline</div></div>
    <div class="stat-pill"><div class="stat-val">${stats.nb_clients}</div><div class="stat-label">Clients</div></div>
  `;
}

// ── RENDER CLIENTS ────────────────────────────────────────
function renderClients() {
  document.getElementById('clients-badge').textContent = clients.length;
  const mrr = clients.reduce((s, c) => s + (c.prix_mensuel || 0), 0);
  const arr = mrr * 12;
  document.getElementById('clients-stats').innerHTML = `
    <div class="stat-pill"><div class="stat-val">${fmt(mrr)}<small style="font-size:13px;font-weight:400"> €</small></div><div class="stat-label">MRR</div></div>
    <div class="stat-pill"><div class="stat-val">${fmtK(arr)}<small style="font-size:13px;font-weight:400"> €</small></div><div class="stat-label">ARR</div></div>
  `;
  const grid = document.getElementById('clients-grid');
  if (!clients.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">Aucun client encore — convertissez un dossier en adoption</div>`;
    return;
  }
  grid.innerHTML = clients.map(cl => {
    const annuel = (cl.prix_mensuel || 0) * 12;
    const commS = Math.round(annuel * (cl.commission_sales || 50) / 100);
    const commM = Math.round(annuel * (cl.commission_manager || 50) / 100);
    return `
    <div class="client-card">
      <div class="client-card-top">
        <div><div class="card-name">${esc(cl.nom)}</div><div class="card-secteur">${esc(cl.secteur||'—')}</div></div>
        <span class="client-badge">Client actif</span>
      </div>
      <div class="client-financials">
        <div class="fin-item"><div class="fin-val">${fmt(cl.prix_mensuel||0)} €</div><div class="fin-label">Prix / mois</div></div>
        <div class="fin-item"><div class="fin-val">${fmt(cl.frais_config||0)} €</div><div class="fin-label">Frais config</div></div>
        <div class="fin-item"><div class="fin-val">${fmt(annuel)} €</div><div class="fin-label">Valeur annuelle</div></div>
        <div class="fin-item"><div class="fin-val">${formatDate(cl.date_conversion)}</div><div class="fin-label">Depuis le</div></div>
      </div>
      <div class="commission-breakdown">
        <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Commissions annuelles</div>
        <div class="comm-row"><span class="comm-label">${esc(cl.sales)} (${cl.commission_sales||50}%)</span><span class="comm-val">${fmt(commS)} €</span></div>
        <div class="comm-row"><span class="comm-label">${esc(cl.manager)} (${cl.commission_manager||50}%)</span><span class="comm-val">${fmt(commM)} €</span></div>
        <div class="comm-row comm-total"><span class="comm-label">Total (100%)</span><span class="comm-val">${fmt(annuel)} €</span></div>
      </div>
    </div>`;
  }).join('');
}

// ── FICHE ─────────────────────────────────────────────────
async function openFiche(id) {
  currentCompteId = id;
  ficheMois = new Date();
  await loadEvenements(id);
  renderFicheHeader();
  renderFicheCalendar();
  renderFicheEvents();
  showView('fiche');
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
}

function renderFicheHeader() {
  const c = comptes.find(x => x.id === currentCompteId);
  if (!c) return;
  document.getElementById('fiche-nom').textContent = c.nom;
  const { badgeClass, badgeLabel, urgency } = trialInfo(c);
  document.getElementById('fiche-meta').innerHTML = `
    <span class="qual-badge ${badgeClass}">${badgeLabel}</span>
    <span class="meta-tag">💰 ${fmtK(c.valeur||0)} €</span>
    <span class="meta-tag">🏢 ${esc(c.secteur||'—')}</span>
  `;
  const btnConv = document.getElementById('btn-convertir');
  btnConv.style.display = c.qualification === 'adoption' ? 'inline-flex' : 'none';

  const banner = document.getElementById('fiche-adoption-alert');
  if (c.qualification === 'adoption' && c.date_adoption) {
    const start = new Date(c.date_adoption);
    const duree = c.duree_essai || 15;
    const elapsed = Math.floor((new Date() - start) / 86400000);
    const remaining = duree - elapsed;
    if (remaining <= 0) {
      banner.style.display = 'flex';
      banner.className = 'adoption-banner red';
      banner.innerHTML = `⚠ L'essai de ${esc(c.nom)} est terminé depuis ${Math.abs(remaining)}j — action urgente requise`;
    } else if (elapsed >= 10) {
      banner.style.display = 'flex';
      banner.className = 'adoption-banner violet';
      banner.innerHTML = `⚠ Il reste ${remaining}j d'essai pour ${esc(c.nom)} — relancer le client`;
    } else {
      banner.style.display = 'none';
    }
  } else {
    banner.style.display = 'none';
  }
}

async function loadEvenements(compteId) {
  const url = compteId ? `/evenements?compte_id=${compteId}` : '/evenements';
  evenements = await api(url);
}

function renderFicheCalendar() {
  const label = ficheMois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  document.getElementById('fiche-month-label').textContent = label[0].toUpperCase() + label.slice(1);
  document.getElementById('fiche-calendar').innerHTML = buildCalendarGrid(ficheMois, evenements, false);
}

function renderFicheEvents() {
  const list = document.getElementById('fiche-events-list');
  const sorted = [...evenements].sort((a, b) => (a.date + a.heure) < (b.date + b.heure) ? -1 : 1);
  if (!sorted.length) { list.innerHTML = `<div class="empty-state">Aucun événement — ajoutez le premier RDV</div>`; return; }
  list.innerHTML = sorted.map(e => `
    <div class="event-item" onclick="openEventDetail(${e.id})">
      <div class="event-type-bar ${e.type}"></div>
      <div>
        <div class="event-title">${esc(e.titre)}</div>
        <div class="event-date-time">${formatDate(e.date)}${e.heure ? ' · ' + e.heure : ''}</div>
        ${e.commentaire ? `<div class="event-comment">${esc(e.commentaire)}</div>` : ''}
      </div>
    </div>`).join('');
}

function openEventDetail(id) {
  const e = evenements.find(x => x.id === id);
  if (!e) return;
  editingEventId = id;
  document.getElementById('detail-titre').textContent = e.titre;
  document.getElementById('detail-body').innerHTML = `
    <div class="detail-row"><div class="detail-label">Date</div><div class="detail-val">${formatDate(e.date)}${e.heure ? ' à ' + e.heure : ''}</div></div>
    <div class="detail-row"><div class="detail-label">Type</div><div class="detail-val">${e.type}</div></div>
    ${e.lieu ? `<div class="detail-row"><div class="detail-label">Lieu</div><div class="detail-val">${esc(e.lieu)}</div></div>` : ''}
    ${e.commentaire ? `<div class="detail-row"><div class="detail-label">Note</div><div class="detail-val">${esc(e.commentaire)}</div></div>` : ''}
  `;
  openModal('modal-event-detail');
}

function openModalEvent(evt = null, prefillDate = null) {
  editingEventId = evt ? evt.id : null;
  const form = document.getElementById('form-event');
  form.reset();
  if (evt) { form.titre.value = evt.titre; form.type.value = evt.type; form.date.value = evt.date; form.heure.value = evt.heure; form.lieu.value = evt.lieu; form.commentaire.value = evt.commentaire; }
  else if (prefillDate) { form.date.value = prefillDate; }
  openModal('modal-event');
}

// ── PLANNING ──────────────────────────────────────────────
function renderPlanningCalendar() {
  const label = planningMois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  document.getElementById('plan-month-label').textContent = label[0].toUpperCase() + label.slice(1);
  document.getElementById('planning-calendar').innerHTML = buildCalendarGrid(planningMois, evenements, true);
}

// ── CALENDAR ──────────────────────────────────────────────
function buildCalendarGrid(mois, evts, large) {
  const year = mois.getFullYear(), month = mois.getMonth();
  const today = new Date();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;
  const days = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  let html = `<div class="cal-grid">`;
  days.forEach(d => { html += `<div class="cal-day-name">${d}</div>`; });
  const byDate = {};
  evts.forEach(e => { if (!byDate[e.date]) byDate[e.date] = []; byDate[e.date].push(e); });
  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month, 1 - (startDow - i));
    html += buildDay(d, dateStr(d), byDate[dateStr(d)] || [], true, large);
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    const ds = dateStr(date);
    html += buildDay(date, ds, byDate[ds] || [], false, large, date.toDateString() === today.toDateString());
  }
  const total = startDow + lastDay.getDate();
  const rem = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 1; i <= rem; i++) { const d = new Date(year, month+1, i); html += buildDay(d, dateStr(d), byDate[dateStr(d)] || [], true, large); }
  return html + '</div>';
}

function buildDay(date, ds, dayEvts, other, large, isToday = false) {
  const d = date.getDate();
  let cls = 'cal-day' + (other ? ' other-month' : '') + (isToday ? ' today' : '');
  if (large) {
    const pills = dayEvts.slice(0,3).map(e => `<div class="plan-event-pill ${e.type}" onclick="showPlanEvt(${e.id})" title="${esc(e.titre)}">${esc(e.titre)}</div>`).join('');
    const more = dayEvts.length > 3 ? `<div style="font-size:10px;color:var(--ink-3);padding:2px 4px">+${dayEvts.length-3}</div>` : '';
    return `<div class="${cls}"><div class="cal-day-num">${d}</div>${pills}${more}</div>`;
  } else {
    const dots = dayEvts.map(e => `<div class="cal-dot ${e.type}"></div>`).join('');
    return `<div class="${cls}" onclick="openModalEvent(null,'${ds}')"><div class="cal-day-num">${d}</div>${dots ? `<div class="cal-dots">${dots}</div>` : ''}</div>`;
  }
}

async function showPlanEvt(id) {
  const all = await api('/evenements');
  const e = all.find(x => x.id === id);
  if (!e) return;
  editingEventId = id;
  const compte = comptes.find(c => c.id === e.compte_id);
  document.getElementById('detail-titre').textContent = e.titre;
  document.getElementById('detail-body').innerHTML = `
    ${compte ? `<div class="detail-row"><div class="detail-label">Compte</div><div class="detail-val"><strong>${esc(compte.nom)}</strong></div></div>` : ''}
    <div class="detail-row"><div class="detail-label">Date</div><div class="detail-val">${formatDate(e.date)}${e.heure ? ' à ' + e.heure : ''}</div></div>
    <div class="detail-row"><div class="detail-label">Type</div><div class="detail-val">${e.type}</div></div>
    ${e.lieu ? `<div class="detail-row"><div class="detail-label">Lieu</div><div class="detail-val">${esc(e.lieu)}</div></div>` : ''}
    ${e.commentaire ? `<div class="detail-row"><div class="detail-label">Note</div><div class="detail-val">${esc(e.commentaire)}</div></div>` : ''}
  `;
  openModal('modal-event-detail');
}

// ── SUPPRIMER COMPTE ──────────────────────────────────────
async function deleteCompte(id) {
  const c = comptes.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Supprimer le dossier "${c.nom}" ? Cette action est irréversible.`)) return;
  await api(`/comptes/${id}`, { method: 'DELETE' });
  await loadAll();
  renderCRM();
  renderStats();
}

// ── RÉCAP ÉQUIPE ──────────────────────────────────────────
async function genererRecap() {
  // Charger tous les comptes et users pour avoir la vue manager
  const allUsers = await api('/users');
  const allComptes = await api(`/comptes?user_id=${currentUser.id}`);

  const managers = allUsers.filter(u => u.role === 'manager');
  const salesList = allUsers.filter(u => u.role === 'sales');

  const qualLabels = {
    interet: 'Intérêt IA — à recontacter',
    essai: 'Signer pour essai 15j',
    adoption: 'Adoption en cours'
  };

  let texte = '';

  // Pour chaque manager, lister ses sales et leurs dossiers
  for (const mgr of managers) {
    texte += `${mgr.nom}\n`;
    const team = salesList.filter(s => s.manager_id === mgr.id);

    for (const sales of team) {
      const dossiers = allComptes.filter(c => c.user_id === sales.id);
      if (dossiers.length === 0) continue;

      texte += `${sales.nom}\n\n`;
      for (const d of dossiers) {
        texte += `* ${d.nom}`;
        if (d.secteur) texte += ` – ${d.secteur}`;
        texte += `.\n`;
        texte += `* ${qualLabels[d.qualification] || d.qualification}.\n`;
        if (d.note) texte += `* ${d.note}\n`;
        texte += `\n`;
      }
    }

    // Dossiers directement sous le manager
    const mgrDossiers = allComptes.filter(c => c.user_id === mgr.id);
    if (mgrDossiers.length > 0) {
      for (const d of mgrDossiers) {
        texte += `* ${d.nom}`;
        if (d.secteur) texte += ` – ${d.secteur}`;
        texte += `.\n`;
        if (d.note) texte += `* ${d.note}\n`;
        texte += `\n`;
      }
    }

    // Sales sans dossiers
    const salesSansDossier = team.filter(s => !allComptes.some(c => c.user_id === s.id));
    for (const s of salesSansDossier) {
      texte += `${s.nom}\nAucun dossier en cours.\n\n`;
    }

    texte += '\n';
  }

  document.getElementById('recap-content').textContent = texte.trim();
  openModal('modal-recap');
}

function copyRecap() {
  const text = document.getElementById('recap-content').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy-recap');
    btn.textContent = 'Copié !';
    setTimeout(() => { btn.textContent = 'Copier'; }, 2000);
  });
}

// ── ADMIN ─────────────────────────────────────────────────
function renderAdmin() {
  const avatarColors = ['#2563eb','#7c3aed','#16a34a','#d97706','#dc2626','#0891b2','#be185d'];
  const color = (id) => avatarColors[id % avatarColors.length];

  const managers = users.filter(u => u.role === 'manager');
  const sales = users.filter(u => u.role === 'sales');

  const managerHTML = managers.length ? managers.map(u => {
    const team = users.filter(s => s.manager_id === u.id);
    const nbComptes = comptes.filter(c => c.user_id === u.id || team.some(s => s.id === c.user_id)).length;
    return `
    <div class="admin-card">
      <div class="admin-avatar" style="background:${color(u.id)}">${initials(u.nom)}</div>
      <div class="admin-info">
        <div class="admin-name">${esc(u.nom)}</div>
        <div class="admin-meta">${team.length} sales dans l'équipe · ${nbComptes} compte${nbComptes>1?'s':''}</div>
      </div>
      <span class="admin-team-tag">Manager</span>
      <div class="admin-actions">
        <button class="btn-icon" onclick="openModalUser(${u.id})" title="Modifier">✏️</button>
        <button class="btn-icon danger" onclick="deleteUser(${u.id})" title="Supprimer">🗑</button>
      </div>
    </div>`;
  }).join('') : `<div class="admin-empty">Aucun manager — ajoutez-en un</div>`;

  const salesHTML = sales.length ? sales.map(u => {
    const mgr = users.find(m => m.id === u.manager_id);
    const nbComptes = comptes.filter(c => c.user_id === u.id).length;
    return `
    <div class="admin-card">
      <div class="admin-avatar" style="background:${color(u.id)}">${initials(u.nom)}</div>
      <div class="admin-info">
        <div class="admin-name">${esc(u.nom)}</div>
        <div class="admin-meta">${mgr ? `Manager : ${esc(mgr.nom)}` : 'Aucun manager assigné'} · ${nbComptes} compte${nbComptes>1?'s':''}</div>
      </div>
      <div class="admin-actions">
        <button class="btn-icon" onclick="openModalUser(${u.id})" title="Modifier">✏️</button>
        <button class="btn-icon danger" onclick="deleteUser(${u.id})" title="Supprimer">🗑</button>
      </div>
    </div>`;
  }).join('') : `<div class="admin-empty">Aucun sales — ajoutez-en un</div>`;

  document.getElementById('admin-body').innerHTML = `
    <div class="admin-section">
      <div class="admin-section-title">Managers (${managers.length})</div>
      <div class="admin-cards">${managerHTML}</div>
    </div>
    <div class="admin-section">
      <div class="admin-section-title">Sales (${sales.length})</div>
      <div class="admin-cards">${salesHTML}</div>
    </div>
  `;
}

function openModalUser(userId = null) {
  editingUserId = userId;
  const form = document.getElementById('form-user');
  form.reset();
  document.getElementById('modal-user-title').textContent = userId ? 'Modifier le membre' : 'Nouveau membre';
  document.getElementById('submit-user').textContent = userId ? 'Enregistrer' : 'Créer';

  const managers = users.filter(u => u.role === 'manager');
  document.getElementById('select-manager-id').innerHTML = managers.map(m =>
    `<option value="${m.id}">${esc(m.nom)}</option>`
  ).join('');

  if (userId) {
    const u = users.find(x => x.id === userId);
    if (u) {
      form.nom.value = u.nom;
      form.role.value = u.role;
      if (u.manager_id) form.manager_id.value = u.manager_id;
      toggleManagerSelect(u.role);
    }
  } else {
    toggleManagerSelect('manager');
  }
  openModal('modal-user');
}

function toggleManagerSelect(role) {
  document.getElementById('manager-select-group').style.display = role === 'sales' ? 'block' : 'none';
}

async function deleteUser(id) {
  const u = users.find(x => x.id === id);
  if (!u) return;
  if (!confirm(`Supprimer ${u.nom} ?`)) return;
  const res = await api(`/users/${id}`, { method: 'DELETE' });
  if (res.error) { alert(res.error); return; }
  users = await api('/users');
  renderAdmin();
}

// ── UTILS ─────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function dateStr(d) { return d.toISOString().split('T')[0]; }
function formatDate(s) { if (!s) return ''; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; }
function initials(n) { return (n||'').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) || '?'; }
function fmt(v) { return parseInt(v||0).toLocaleString('fr-FR'); }
function fmtK(v) { v = parseInt(v||0); return v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? Math.round(v/1000)+'K' : String(v); }
