// db.js — SQLite setup, schema, and one-time seeding for UniCampus Store
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'store.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    categoryLabel TEXT,
    price REAL NOT NULL,
    originalPrice REAL,
    cost REAL,
    rating REAL,
    reviewsCount INTEGER,
    image TEXT,
    emoji TEXT,
    description TEXT,
    inStock INTEGER DEFAULT 1,
    stockCount INTEGER DEFAULT 0,
    tags TEXT,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderId TEXT UNIQUE NOT NULL,
    userId INTEGER,
    isGuest INTEGER NOT NULL DEFAULT 0,
    itemsJson TEXT NOT NULL,
    subtotal REAL NOT NULL,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    paymentMethod TEXT,
    transactionRef TEXT,
    studentJson TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Processing',
    orderTime TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id)
  );
`);

// --- Seed products (only if table empty) ---
const productCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
if (productCount === 0) {
  const seedPath = path.join(__dirname, 'products_seed.json');
  if (fs.existsSync(seedPath)) {
    const products = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const insert = db.prepare(`
      INSERT INTO products (id, name, category, categoryLabel, price, originalPrice, cost, rating, reviewsCount, image, emoji, description, inStock, stockCount, tags)
      VALUES (@id, @name, @category, @categoryLabel, @price, @originalPrice, @cost, @rating, @reviewsCount, @image, @emoji, @description, @inStock, @stockCount, @tags)
    `);
    const insertMany = db.transaction((rows) => {
      for (const p of rows) {
        insert.run({
          id: p.id,
          name: p.name,
          category: p.category || null,
          categoryLabel: p.categoryLabel || p.category || null,
          price: p.price,
          originalPrice: p.originalPrice ?? p.price,
          cost: p.cost ?? Math.round(p.price * 0.6),
          rating: p.rating ?? 4.5,
          reviewsCount: p.reviewsCount ?? 0,
          image: p.image || null,
          emoji: p.emoji || '📦',
          description: p.description || null,
          inStock: p.inStock === false ? 0 : 1,
          stockCount: p.stockCount ?? 0,
          tags: JSON.stringify(p.tags || [])
        });
      }
    });
    insertMany(products);
    console.log(`Seeded ${products.length} products`);
  }
}

// --- Seed default admin (only if no admin exists) ---
const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
if (adminCount === 0) {
  const defaultAdminUid = process.env.ADMIN_UID || 'admin';
  const defaultAdminPass = process.env.ADMIN_PASSWORD || 'Unicampus@26';
  const hash = bcrypt.hashSync(defaultAdminPass, 10);
  db.prepare(`
    INSERT INTO users (uid, name, email, phone, passwordHash, role)
    VALUES (?, 'Store Admin', '', '', ?, 'admin')
  `).run(defaultAdminUid, hash);
  console.log(`Seeded default admin -> uid: "${defaultAdminUid}" password: "${defaultAdminPass}" (kept same as before so nothing changes for you)`);
}

module.exports = db;
