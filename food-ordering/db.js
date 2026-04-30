require("dotenv").config();
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL (see .env.example).");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/i.test(process.env.DATABASE_URL)
    ? false
    : { rejectUnauthorized: false },
});

/** Menu: amounts are paise (100 paise = ₹1). */
const MENU = [
  {
    name: "Margherita Pizza",
    description: "Tomato, mozzarella, fresh basil",
    price_paise: 39900,
    category: "Mains",
    sort_order: 1,
    image_url:
      "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Grilled Chicken Bowl",
    description: "Rice, greens, lemon herb chicken",
    price_paise: 32900,
    category: "Mains",
    sort_order: 2,
    image_url:
      "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Veggie Burger",
    description: "House patty, pickles, special sauce",
    price_paise: 22900,
    category: "Mains",
    sort_order: 3,
    image_url:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Iced Lemon Tea",
    description: "Fresh brewed, lightly sweet",
    price_paise: 6900,
    category: "Drinks",
    sort_order: 20,
    image_url:
      "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Chocolate Brownie",
    description: "Warm, served with drizzle",
    price_paise: 9900,
    category: "Desserts",
    sort_order: 30,
    image_url:
      "https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=900&q=80",
  },
];

async function init() {
  const ddl = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS menu_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_paise INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      sort_order INTEGER NOT NULL DEFAULT 0,
      image_url TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS cart_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      UNIQUE(user_id, menu_item_id)
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      total_paise INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'placed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      menu_item_id INTEGER NOT NULL,
      name_snapshot TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_paise INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)`,
  ];
  for (const sql of ddl) {
    await pool.query(sql);
  }

  const { rows: countRows } = await pool.query("SELECT COUNT(*)::int AS c FROM menu_items");
  const count = countRows[0].c;

  if (count === 0) {
    const insert = `
      INSERT INTO menu_items (name, description, price_paise, category, sort_order, image_url)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    for (const row of MENU) {
      await pool.query(insert, [
        row.name,
        row.description,
        row.price_paise,
        row.category,
        row.sort_order,
        row.image_url,
      ]);
    }
  }

  const syncSql =
    "UPDATE menu_items SET price_paise = $1, image_url = $2 WHERE name = $3";
  for (const row of MENU) {
    await pool.query(syncSql, [row.price_paise, row.image_url, row.name]);
  }
}

module.exports = { pool, init };
