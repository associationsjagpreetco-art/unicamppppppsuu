// server.js — UniCampus Store Backend API
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'unicampus-store-dev-secret-change-in-production';
const TOKEN_EXPIRY = '30d';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toPublicUser(row) {
  if (!row) return null;
  return { id: row.id, uid: row.uid, name: row.name, email: row.email, phone: row.phone, role: row.role };
}

function toPublicProduct(row) {
  // Public/storefront view — no cost (that's internal profit-margin data)
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    categoryLabel: row.categoryLabel,
    price: row.price,
    originalPrice: row.originalPrice,
    mrp: row.originalPrice, // alias the storefront already expects
    rating: row.rating,
    reviewsCount: row.reviewsCount,
    image: row.image,
    emoji: row.emoji,
    description: row.description,
    inStock: !!row.inStock,
    stockCount: row.stockCount,
    tags: JSON.parse(row.tags || '[]')
  };
}

function toAdminProduct(row) {
  return { ...toPublicProduct(row), cost: row.cost };
}

function signToken(user) {
  return jwt.sign({ id: user.id, uid: user.uid, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch (_e) { req.user = null; }
  }
  next();
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_e) {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access only' });
    next();
  });
}

function orderTimeNow() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function rowToOrder(row) {
  return {
    orderId: row.orderId,
    isGuest: !!row.isGuest,
    items: JSON.parse(row.itemsJson),
    subtotal: row.subtotal,
    discount: row.discount,
    total: row.total,
    paymentMethod: row.paymentMethod,
    transactionRef: row.transactionRef,
    student: JSON.parse(row.studentJson),
    status: row.status,
    orderTime: row.orderTime
  };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
app.post('/api/auth/register', (req, res) => {
  const { name, uid, email, phone, password } = req.body || {};
  if (!name || !uid || !password) {
    return res.status(400).json({ error: 'Name, Student ID and password are required' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE uid = ?').get(uid.trim());
  if (existing) return res.status(409).json({ error: 'This Student ID is already registered. Please sign in instead.' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`
    INSERT INTO users (uid, name, email, phone, passwordHash, role) VALUES (?, ?, ?, ?, ?, 'student')
  `).run(uid.trim(), name.trim(), email || '', phone || '', passwordHash);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = signToken(user);
  res.json({ token, user: toPublicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { uid, password } = req.body || {};
  if (!uid || !password) return res.status(400).json({ error: 'Student ID and password are required' });
  const user = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid.trim());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid Student ID or password' });
  }
  const token = signToken(user);
  res.json({ token, user: toPublicUser(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: toPublicUser(user) });
});

// ---------------------------------------------------------------------------
// Products (public storefront)
// ---------------------------------------------------------------------------
app.get('/api/products', (_req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY rowid ASC').all();
  res.json({ products: rows.map(toPublicProduct) });
});

// ---------------------------------------------------------------------------
// Admin — products (full CRUD, price changes go live instantly for everyone)
// ---------------------------------------------------------------------------
app.get('/api/admin/products', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY rowid ASC').all();
  res.json({ products: rows.map(toAdminProduct) });
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category || b.price === undefined) {
    return res.status(400).json({ error: 'name, category and price are required' });
  }
  const id = b.id || ('custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  db.prepare(`
    INSERT INTO products (id, name, category, categoryLabel, price, originalPrice, cost, rating, reviewsCount, image, emoji, description, inStock, stockCount, tags)
    VALUES (@id, @name, @category, @categoryLabel, @price, @originalPrice, @cost, @rating, @reviewsCount, @image, @emoji, @description, @inStock, @stockCount, @tags)
  `).run({
    id,
    name: b.name,
    category: b.category,
    categoryLabel: b.categoryLabel || b.category,
    price: Number(b.price),
    originalPrice: b.originalPrice !== undefined ? Number(b.originalPrice) : Number(b.price),
    cost: b.cost !== undefined ? Number(b.cost) : Math.round(Number(b.price) * 0.6),
    rating: b.rating !== undefined ? Number(b.rating) : 4.5,
    reviewsCount: b.reviewsCount !== undefined ? Number(b.reviewsCount) : 0,
    image: b.image || '',
    emoji: b.emoji || '📦',
    description: b.description || '',
    inStock: b.inStock === false ? 0 : 1,
    stockCount: b.stockCount !== undefined ? Number(b.stockCount) : 0,
    tags: JSON.stringify(b.tags || [])
  });
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.json({ product: toAdminProduct(row) });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const b = req.body || {};
  const merged = {
    name: b.name ?? existing.name,
    category: b.category ?? existing.category,
    categoryLabel: b.categoryLabel ?? b.category ?? existing.categoryLabel,
    price: b.price !== undefined ? Number(b.price) : existing.price,
    originalPrice: b.originalPrice !== undefined ? Number(b.originalPrice) : existing.originalPrice,
    cost: b.cost !== undefined ? Number(b.cost) : existing.cost,
    rating: b.rating !== undefined ? Number(b.rating) : existing.rating,
    reviewsCount: b.reviewsCount !== undefined ? Number(b.reviewsCount) : existing.reviewsCount,
    image: b.image ?? existing.image,
    emoji: b.emoji ?? existing.emoji,
    description: b.description ?? existing.description,
    inStock: b.inStock !== undefined ? (b.inStock ? 1 : 0) : existing.inStock,
    stockCount: b.stockCount !== undefined ? Number(b.stockCount) : existing.stockCount,
    tags: b.tags !== undefined ? JSON.stringify(b.tags) : existing.tags
  };
  db.prepare(`
    UPDATE products SET name=@name, category=@category, categoryLabel=@categoryLabel, price=@price,
      originalPrice=@originalPrice, cost=@cost, rating=@rating, reviewsCount=@reviewsCount, image=@image,
      emoji=@emoji, description=@description, inStock=@inStock, stockCount=@stockCount, tags=@tags,
      updatedAt=datetime('now')
    WHERE id=@id
  `).run({ ...merged, id: req.params.id });
  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json({ product: toAdminProduct(updated) });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
app.post('/api/orders', optionalAuth, (req, res) => {
  const { items, subtotal, discount, total, paymentMethod, transactionRef, student } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
  const userId = req.user ? req.user.id : null;

  db.prepare(`
    INSERT INTO orders (orderId, userId, isGuest, itemsJson, subtotal, discount, total, paymentMethod, transactionRef, studentJson, status, orderTime)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Processing', ?)
  `).run(
    orderId, userId, userId ? 0 : 1, JSON.stringify(items),
    subtotal || 0, discount || 0, total || 0, paymentMethod || '',
    transactionRef || '', JSON.stringify(student || {}), orderTimeNow()
  );

  const row = db.prepare('SELECT * FROM orders WHERE orderId = ?').get(orderId);
  res.json({ order: rowToOrder(row) });
});

app.get('/api/orders/my', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE userId = ? ORDER BY id DESC').all(req.user.id);
  res.json({ orders: rows.map(rowToOrder) });
});

app.get('/api/admin/orders', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  res.json({ orders: rows.map(rowToOrder) });
});

app.put('/api/admin/orders/:orderId/status', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!['Processing', 'Completed', 'Pending', 'Cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const existing = db.prepare('SELECT * FROM orders WHERE orderId = ?').get(req.params.orderId);
  if (!existing) return res.status(404).json({ error: 'Order not found' });
  db.prepare('UPDATE orders SET status = ? WHERE orderId = ?').run(status, req.params.orderId);
  const row = db.prepare('SELECT * FROM orders WHERE orderId = ?').get(req.params.orderId);
  res.json({ order: rowToOrder(row) });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`UniCampus Store API running on http://localhost:${PORT}`));
