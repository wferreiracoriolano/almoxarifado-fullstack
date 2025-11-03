
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { v4 as uuidv4 } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "devsecret123";

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/", express.static(path.join(__dirname, "public")));

// SQLite init
let db;
async function initDb() {
  db = await open({
    filename: path.join(__dirname, "db.sqlite"),
    driver: sqlite3.Database
  });
  await db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT,
      category TEXT,
      location TEXT,
      qty INTEGER DEFAULT 0,
      min INTEGER DEFAULT 0,
      image_url TEXT
    );
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      itemId TEXT NOT NULL,
      itemName TEXT,
      qty INTEGER NOT NULL,
      obs TEXT,
      status TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      decidedBy TEXT,
      decidedAt TEXT,
      FOREIGN KEY (itemId) REFERENCES items(id) ON DELETE CASCADE
    );
  `);

  // seed admin
  const admin = await db.get("SELECT * FROM users WHERE username = ?", "admin");
  if (!admin) {
    const hash = await bcrypt.hash("admin", 10);
    await db.run(
      "INSERT INTO users (id,name,username,password_hash,role) VALUES (?,?,?,?,?)",
      uuidv4(), "Admin", "admin", hash, "ADMIN"
    );
    console.log("Seeded admin/admin");
  }
}
await initDb();

// Auth helpers
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

// Multer storage for images
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "uploads")),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    cb(null, uuidv4() + ext.toLowerCase());
  }
});
const upload = multer({ storage });

// Routes
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const u = await db.get("SELECT * FROM users WHERE username = ?", username);
  if (!u) return res.status(401).json({ error: "Invalid credentials" });
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ id: u.id, name: u.name, role: u.role }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, user: { id: u.id, name: u.name, role: u.role } });
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Users (ADMIN)
app.get("/api/users", authMiddleware, requireRole("ADMIN"), async (req, res) => {
  const rows = await db.all("SELECT id,name,username,role FROM users ORDER BY rowid DESC");
  res.json(rows);
});
app.post("/api/users", authMiddleware, requireRole("ADMIN"), async (req, res) => {
  const { name, username, password, role } = req.body;
  if (!name || !username || !password || !role) return res.status(400).json({ error: "Missing fields" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    await db.run("INSERT INTO users (id,name,username,password_hash,role) VALUES (?,?,?,?,?)", id, name, username, hash, role);
    res.json({ id, name, username, role });
  } catch (e) {
    res.status(400).json({ error: "Username already exists" });
  }
});
app.delete("/api/users/:id", authMiddleware, requireRole("ADMIN"), async (req, res) => {
  await db.run("DELETE FROM users WHERE id = ?", req.params.id);
  res.json({ ok: true });
});

// Items
app.get("/api/items", authMiddleware, async (req, res) => {
  const rows = await db.all("SELECT * FROM items ORDER BY rowid DESC");
  res.json(rows);
});
app.post("/api/items", authMiddleware, requireRole("ADMIN","ALMOX"), upload.single("image"), async (req, res) => {
  const { name, code, category, location, qty = 0, min = 0 } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  const id = uuidv4();
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;
  await db.run(
    "INSERT INTO items (id,name,code,category,location,qty,min,image_url) VALUES (?,?,?,?,?,?,?,?)",
    id, name, code||null, category||null, location||null, Number(qty)||0, Number(min)||0, image_url
  );
  const item = await db.get("SELECT * FROM items WHERE id = ?", id);
  res.json(item);
});
app.patch("/api/items/:id/adjust", authMiddleware, requireRole("ADMIN","ALMOX"), async (req, res) => {
  const { delta } = req.body;
  const it = await db.get("SELECT * FROM items WHERE id = ?", req.params.id);
  if (!it) return res.status(404).json({ error: "Not found" });
  const newQty = Math.max(0, (it.qty||0) + Number(delta||0));
  await db.run("UPDATE items SET qty = ? WHERE id = ?", newQty, it.id);
  const belowMin = newQty < (it.min||0);
  res.json({ ...it, qty: newQty, belowMin });
});

// Requests
app.get("/api/requests", authMiddleware, async (req, res) => {
  const rows = await db.all("SELECT * FROM requests ORDER BY datetime(createdAt) DESC");
  res.json(rows);
});
app.post("/api/requests", authMiddleware, async (req, res) => {
  const { itemId, qty, obs } = req.body;
  const it = await db.get("SELECT * FROM items WHERE id = ?", itemId);
  if (!it) return res.status(400).json({ error: "Invalid item" });
  const id = uuidv4();
  const r = {
    id, itemId, itemName: it.name, qty: Number(qty)||1, obs: obs||null,
    status: "PENDENTE", createdBy: req.user.name, createdAt: new Date().toISOString(),
    decidedBy: null, decidedAt: null
  };
  await db.run("INSERT INTO requests (id,itemId,itemName,qty,obs,status,createdBy,createdAt,decidedBy,decidedAt) VALUES (?,?,?,?,?,?,?,?,?,?)",
    r.id, r.itemId, r.itemName, r.qty, r.obs, r.status, r.createdBy, r.createdAt, r.decidedBy, r.decidedAt
  );
  res.json(r);
});
app.post("/api/requests/:id/approve", authMiddleware, requireRole("ADMIN","ALMOX"), async (req, res) => {
  const r = await db.get("SELECT * FROM requests WHERE id = ?", req.params.id);
  if (!r) return res.status(404).json({ error: "Not found" });
  if (r.status !== "PENDENTE") return res.status(400).json({ error: "Not pending" });
  // baixa no estoque
  const it = await db.get("SELECT * FROM items WHERE id = ?", r.itemId);
  const newQty = Math.max(0, (it.qty||0) - r.qty);
  await db.run("UPDATE items SET qty = ? WHERE id = ?", newQty, it.id);
  await db.run("UPDATE requests SET status = ?, decidedBy = ?, decidedAt = ? WHERE id = ?",
    "APROVADA", req.user.name, new Date().toISOString(), r.id);
  const updated = await db.get("SELECT * FROM requests WHERE id = ?", r.id);
  const belowMin = newQty < (it.min||0);
  res.json({ request: updated, itemQty: newQty, belowMin });
});
app.post("/api/requests/:id/reject", authMiddleware, requireRole("ADMIN","ALMOX"), async (req, res) => {
  const r = await db.get("SELECT * FROM requests WHERE id = ?", req.params.id);
  if (!r) return res.status(404).json({ error: "Not found" });
  if (r.status !== "PENDENTE") return res.status(400).json({ error: "Not pending" });
  await db.run("UPDATE requests SET status = ?, decidedBy = ?, decidedAt = ? WHERE id = ?",
    "RECUSADA", req.user.name, new Date().toISOString(), r.id);
  const updated = await db.get("SELECT * FROM requests WHERE id = ?", r.id);
  res.json(updated);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
