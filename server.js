// server.js – backend simples para o almoxarifado v7.8
// Guarda todo o estado (users, items, reqs) em um único registro no SQLite.

const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { randomUUID } = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- Banco de dados ---
const db = new sqlite3.Database("./data.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    )
  `);
});

// Estado inicial (se o banco estiver vazio)
function initialState() {
  return {
    users: [
      { id: randomUUID(), name: "Admin", username: "admin", password: "admin", role: "ADMIN" },
      { id: randomUUID(), name: "Almox", username: "almox", password: "almox", role: "ALMOX" },
      { id: randomUUID(), name: "Solicitante", username: "sol", password: "sol", role: "SOLICITANTE" },
    ],
    items: [],
    reqs: [],
  };
}

function getState(cb) {
  db.get("SELECT data FROM app_state WHERE id = 1", (err, row) => {
    if (err) return cb(err);
    if (!row) {
      // Se não tiver nada, cria com estado inicial
      const st = initialState();
      const dataStr = JSON.stringify(st);
      db.run("INSERT INTO app_state (id, data) VALUES (1, ?)", dataStr, (err2) => {
        if (err2) return cb(err2);
        cb(null, st);
      });
    } else {
      try {
        const st = JSON.parse(row.data);
        cb(null, st);
      } catch (e) {
        cb(e);
      }
    }
  });
}

function saveState(state, cb) {
  const dataStr = JSON.stringify(state);
  db.run(
    `INSERT INTO app_state (id, data) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
    dataStr,
    cb
  );
}

// --- APIs ---

// Devolve tudo (users, items, reqs)
app.get("/api/state", (req, res) => {
  getState((err, state) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao carregar estado" });
    }
    res.json(state);
  });
});

// Substitui tudo (users, items, reqs)
app.post("/api/state", (req, res) => {
  const body = req.body || {};
  const state = {
    users: body.users || [],
    items: body.items || [],
    reqs: body.reqs || [],
  };
  saveState(state, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao salvar estado" });
    }
    res.json({ ok: true });
  });
});

// Endpoint de login (opcional – hoje o app faz login no front mesmo)
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  getState((err, state) => {
    if (err) return res.status(500).json({ error: "Erro ao ler usuários" });
    const user =
      (state.users || []).find(
        (u) => u.username === username && u.password === password
      ) || null;
    if (!user) return res.status(401).json({ error: "Credenciais inválidas" });
    res.json({ user });
  });
});

// Inicia servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
