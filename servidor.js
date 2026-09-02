'use strict';
try { require('dotenv').config(); } catch (e) { /* dotenv opcional: solo para correr local con .env */ }

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDARIO DE PRESENTACIONES — back office
//   Guarda checks / hechos relevantes / fechas cargadas como pares clave-valor
//   en Postgres, en el mismo formato que ya usaba el front (window.storage).
//   Sin login: cualquiera con el link entra y ve/marca lo mismo.
// ═══════════════════════════════════════════════════════════════════════════════

const path = require('path');
const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT || 3000);

if (!process.env.DATABASE_URL) {
  throw new Error('Falta DATABASE_URL (agregá un plugin Postgres en Railway y linkealo a este servicio)');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/data/:key', async (req, res) => {
  try {
    const r = await pool.query('SELECT value FROM kv_store WHERE key = $1', [req.params.key]);
    res.json({ value: r.rows[0] ? r.rows[0].value : null });
  } catch (e) {
    console.error('[GET /api/data]', e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.put('/api/data/:key', async (req, res) => {
  try {
    const value = req.body && typeof req.body.value === 'string' ? req.body.value : null;
    await pool.query(
      `INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [req.params.key, value]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[PUT /api/data]', e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

ensureSchema()
  .then(() => {
    app.listen(PORT, () => console.log('calendario-presentaciones escuchando en :' + PORT));
  })
  .catch((err) => {
    console.error('No se pudo inicializar el schema de la base:', err);
    process.exit(1);
  });
