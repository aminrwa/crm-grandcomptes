const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── BASE DE DONNÉES ───────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        nom TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('manager','sales')),
        manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS comptes (
        id SERIAL PRIMARY KEY,
        nom TEXT NOT NULL,
        secteur TEXT DEFAULT '',
        qualification TEXT DEFAULT 'interet',
        date_adoption TEXT,
        duree_essai INTEGER DEFAULT 15,
        valeur INTEGER DEFAULT 0,
        sales TEXT DEFAULT '',
        manager TEXT DEFAULT '',
        commission_sales INTEGER DEFAULT 50,
        commission_manager INTEGER DEFAULT 50,
        nb_praticiens INTEGER DEFAULT 0,
        prix_licence NUMERIC DEFAULT 0,
        frais_config_prospect NUMERIC DEFAULT 0,
        note TEXT DEFAULT '',
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        date_creation TEXT
      );

      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        compte_id INTEGER,
        nom TEXT NOT NULL,
        secteur TEXT DEFAULT '',
        sales TEXT DEFAULT '',
        manager TEXT DEFAULT '',
        commission_sales INTEGER DEFAULT 50,
        commission_manager INTEGER DEFAULT 50,
        prix_mensuel NUMERIC DEFAULT 0,
        frais_config NUMERIC DEFAULT 0,
        commission_totale NUMERIC DEFAULT 0,
        date_conversion TEXT,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS evenements (
        id SERIAL PRIMARY KEY,
        compte_id INTEGER REFERENCES comptes(id) ON DELETE CASCADE,
        titre TEXT NOT NULL,
        date TEXT,
        heure TEXT DEFAULT '',
        type TEXT DEFAULT 'rdv',
        commentaire TEXT DEFAULT '',
        lieu TEXT DEFAULT ''
      );
    `);

    // Données initiales si la table users est vide
    const { rows } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) === 0) {
      await client.query(`
        INSERT INTO users (nom, role) VALUES ('Mon Manager', 'manager');
      `);
      console.log('✅ Utilisateur par défaut créé — configurez votre équipe dans l\'onglet Équipe');
    }

    // Migration : ajouter les nouvelles colonnes si elles n'existent pas
    await client.query(`
      ALTER TABLE comptes ADD COLUMN IF NOT EXISTS nb_praticiens INTEGER DEFAULT 0;
      ALTER TABLE comptes ADD COLUMN IF NOT EXISTS prix_licence NUMERIC DEFAULT 0;
      ALTER TABLE comptes ADD COLUMN IF NOT EXISTS frais_config_prospect NUMERIC DEFAULT 0;
      ALTER TABLE comptes ADD COLUMN IF NOT EXISTS forfait_conso TEXT DEFAULT '';
      ALTER TABLE comptes ADD COLUMN IF NOT EXISTS forfait_conso_special NUMERIC DEFAULT 0;
    `);

    console.log('✅ Base de données initialisée');
  } finally {
    client.release();
  }
}

// ── USERS ─────────────────────────────────────────────────
app.get('/api/users', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY role DESC, nom ASC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', async (req, res) => {
  try {
    const { nom, role, manager_id } = req.body;
    if (!nom || !role) return res.status(400).json({ error: 'Nom et rôle requis' });
    const mid = role === 'sales' && manager_id ? parseInt(manager_id) : null;
    const { rows } = await pool.query(
      'INSERT INTO users (nom, role, manager_id) VALUES ($1,$2,$3) RETURNING *',
      [nom.trim(), role, mid]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { nom, role, manager_id } = req.body;
    const mid = role === 'sales' && manager_id ? parseInt(manager_id) : null;
    const { rows } = await pool.query(
      'UPDATE users SET nom=$1, role=$2, manager_id=$3 WHERE id=$4 RETURNING *',
      [nom.trim(), role, mid, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) FROM comptes WHERE user_id=$1', [req.params.id]);
    if (parseInt(rows[0].count) > 0) return res.status(400).json({ error: 'Cet utilisateur a des comptes actifs' });
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── COMPTES ───────────────────────────────────────────────
async function getUserIds(uid) {
  const { rows: uRows } = await pool.query('SELECT * FROM users WHERE id=$1', [uid]);
  const user = uRows[0];
  if (!user) return { user: null, ids: [] };
  let ids = [uid];
  if (user.role === 'manager') {
    const { rows: sRows } = await pool.query('SELECT id FROM users WHERE manager_id=$1', [uid]);
    ids = [uid, ...sRows.map(r => r.id)];
  }
  return { user, ids };
}

app.get('/api/comptes', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      const { rows } = await pool.query('SELECT * FROM comptes ORDER BY id DESC');
      return res.json(rows);
    }
    const { ids } = await getUserIds(parseInt(user_id));
    const { rows } = await pool.query('SELECT * FROM comptes WHERE user_id = ANY($1) ORDER BY id DESC', [ids]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/comptes/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM comptes WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Compte introuvable' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/comptes', async (req, res) => {
  try {
    const { nom, secteur, qualification, date_adoption, duree_essai, valeur, nb_praticiens, prix_licence, frais_config_prospect, forfait_conso, forfait_conso_special, sales, manager, commission_sales, commission_manager, note, user_id } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(
      `INSERT INTO comptes (nom, secteur, qualification, date_adoption, duree_essai, valeur, nb_praticiens, prix_licence, frais_config_prospect, forfait_conso, forfait_conso_special, sales, manager, commission_sales, commission_manager, note, user_id, date_creation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [nom, secteur||'', qualification||'interet', date_adoption||null, duree_essai||15, valeur||0, nb_praticiens||0, prix_licence||0, frais_config_prospect||0, forfait_conso||'', forfait_conso_special||0, sales||'', manager||'', commission_sales||50, commission_manager||50, note||'', user_id||null, today]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/comptes/:id', async (req, res) => {
  try {
    const { nom, secteur, qualification, date_adoption, duree_essai, valeur, nb_praticiens, prix_licence, frais_config_prospect, forfait_conso, forfait_conso_special, sales, manager, commission_sales, commission_manager, note } = req.body;
    const { rows } = await pool.query(
      `UPDATE comptes SET nom=$1, secteur=$2, qualification=$3, date_adoption=$4, duree_essai=$5, valeur=$6,
       nb_praticiens=$7, prix_licence=$8, frais_config_prospect=$9, forfait_conso=$10, forfait_conso_special=$11,
       sales=$12, manager=$13, commission_sales=$14, commission_manager=$15, note=$16 WHERE id=$17 RETURNING *`,
      [nom, secteur||'', qualification||'interet', date_adoption||null, duree_essai||15, valeur||0, nb_praticiens||0, prix_licence||0, frais_config_prospect||0, forfait_conso||'', forfait_conso_special||0, sales||'', manager||'', commission_sales||50, commission_manager||50, note||'', req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Compte introuvable' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/comptes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM comptes WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CONVERSION EN CLIENT ──────────────────────────────────
app.post('/api/comptes/:id/convertir', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: cRows } = await client.query('SELECT * FROM comptes WHERE id=$1', [req.params.id]);
    const compte = cRows[0];
    if (!compte) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Compte introuvable' }); }
    const pm = parseFloat(req.body.prix_mensuel) || 0;
    const fc = parseFloat(req.body.frais_config) || 0;
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await client.query(
      `INSERT INTO clients (compte_id, nom, secteur, sales, manager, commission_sales, commission_manager, prix_mensuel, frais_config, commission_totale, date_conversion, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [compte.id, compte.nom, compte.secteur, compte.sales, compte.manager, compte.commission_sales, compte.commission_manager, pm, fc, pm * 12, today, compte.user_id]
    );
    await client.query('DELETE FROM comptes WHERE id=$1', [compte.id]);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ── CLIENTS ───────────────────────────────────────────────
app.get('/api/clients', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      const { rows } = await pool.query('SELECT * FROM clients ORDER BY id DESC');
      return res.json(rows);
    }
    const { ids } = await getUserIds(parseInt(user_id));
    const { rows } = await pool.query('SELECT * FROM clients WHERE user_id = ANY($1) ORDER BY id DESC', [ids]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const { prix_mensuel, frais_config } = req.body;
    const pm = parseFloat(prix_mensuel) || 0;
    const { rows } = await pool.query(
      'UPDATE clients SET prix_mensuel=$1, frais_config=$2, commission_totale=$3 WHERE id=$4 RETURNING *',
      [pm, parseFloat(frais_config)||0, pm * 12, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ÉVÉNEMENTS ────────────────────────────────────────────
app.get('/api/evenements', async (req, res) => {
  try {
    const { compte_id } = req.query;
    let rows;
    if (compte_id) {
      const r = await pool.query(
        `SELECT e.*, c.nom as compte_nom FROM evenements e
         LEFT JOIN comptes c ON c.id = e.compte_id
         WHERE e.compte_id=$1 ORDER BY e.date ASC, e.heure ASC`,
        [compte_id]
      );
      rows = r.rows;
    } else {
      const r = await pool.query(
        `SELECT e.*, c.nom as compte_nom FROM evenements e
         LEFT JOIN comptes c ON c.id = e.compte_id
         ORDER BY e.date ASC, e.heure ASC`
      );
      rows = r.rows;
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/evenements', async (req, res) => {
  try {
    const { compte_id, titre, date, heure, type, commentaire, lieu } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO evenements (compte_id, titre, date, heure, type, commentaire, lieu) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [compte_id, titre, date, heure||'', type||'rdv', commentaire||'', lieu||'']
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/evenements/:id', async (req, res) => {
  try {
    const { titre, date, heure, type, commentaire, lieu } = req.body;
    const { rows } = await pool.query(
      'UPDATE evenements SET titre=$1, date=$2, heure=$3, type=$4, commentaire=$5, lieu=$6 WHERE id=$7 RETURNING *',
      [titre, date, heure||'', type, commentaire||'', lieu||'', req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/evenements/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM evenements WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── STATS ─────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const { user_id } = req.query;
    const { ids } = await getUserIds(parseInt(user_id));
    const { rows: cRows } = await pool.query(
      'SELECT COALESCE(SUM(valeur),0) as pipeline, COUNT(*) as nb FROM comptes WHERE user_id = ANY($1)', [ids]
    );
    const { rows: clRows } = await pool.query(
      'SELECT COALESCE(SUM(prix_mensuel),0) as mrr, COUNT(*) as nb FROM clients WHERE user_id = ANY($1)', [ids]
    );
    res.json({
      pipeline: parseInt(cRows[0].pipeline),
      nb_comptes: parseInt(cRows[0].nb),
      mrr: parseFloat(clRows[0].mrr),
      nb_clients: parseInt(clRows[0].nb)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DÉMARRAGE ─────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => console.log(`\n✅ CRM Grand Comptes v3 démarré sur le port ${PORT}\n`));
  })
  .catch(err => {
    console.error('❌ Erreur base de données :', err.message);
    process.exit(1);
  });
