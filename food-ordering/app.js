const path = require("path");
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcrypt");
const { pool } = require("./db");
const { ensureDb } = require("./initDb");

const app = express();
const BCRYPT_ROUNDS = 12;

/** express-session must sign cookies with *some* secret (library requirement). Default is fine for a hobby app; set SESSION_SECRET in prod if you care about stronger signing. */
const SESSION_SECRET =
  process.env.SESSION_SECRET || "fork-plate-side-project-not-for-production";

app.set("trust proxy", 1);

if (process.env.VERCEL) {
  app.use(async (req, res, next) => {
    try {
      await ensureDb();
      next();
    } catch (e) {
      next(e);
    }
  });
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.status(500).json({ error: "Server error." });
    });
  };
}

app.use(express.json());
app.use(
  session({
    name: "sid",
    store: new pgSession({
      pool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: !!(process.env.VERCEL || process.env.NODE_ENV === "production"),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

function requireUser(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Sign in required." });
  }
  next();
}

function formatRupee(paise) {
  const rupees = paise / 100;
  const n = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
  return `₹${n}`;
}

app.post(
  "/api/register",
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const name = String(req.body.name || "").trim();

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    try {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const result = await pool.query(
        "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id",
        [email, passwordHash, name]
      );
      const userId = result.rows[0].id;
      req.session.userId = userId;
      req.session.userName = name;
      req.session.userEmail = email;
      return res.json({ ok: true, user: { id: userId, email, name } });
    } catch (e) {
      if (e.code === "23505") {
        return res.status(409).json({ error: "An account with this email already exists." });
      }
      console.error(e);
      return res.status(500).json({ error: "Could not create account." });
    }
  })
);

app.post(
  "/api/login",
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const { rows } = await pool.query(
      "SELECT id, email, name, password_hash FROM users WHERE email = $1",
      [email]
    );
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    return res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
  })
);

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ ok: true });
  });
});

app.get("/api/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  res.json({
    user: {
      id: req.session.userId,
      email: req.session.userEmail,
      name: req.session.userName,
    },
  });
});

app.get(
  "/api/menu",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, description, price_paise, category, image_url
       FROM menu_items
       ORDER BY CASE category
         WHEN 'Mains' THEN 0
         WHEN 'Drinks' THEN 1
         WHEN 'Desserts' THEN 2
         ELSE 3
       END, sort_order, name`
    );
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        price: formatRupee(r.price_paise),
        imageUrl: r.image_url || "",
      })),
    });
  })
);

app.get(
  "/api/cart",
  requireUser,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ci.id AS cart_item_id, ci.quantity, m.id AS menu_item_id, m.name, m.description, m.price_paise, m.image_url
       FROM cart_items ci
       JOIN menu_items m ON m.id = ci.menu_item_id
       WHERE ci.user_id = $1
       ORDER BY ci.id`,
      [req.session.userId]
    );

    let subtotal = 0;
    const items = rows.map((r) => {
      const line = r.quantity * r.price_paise;
      subtotal += line;
      return {
        cartItemId: r.cart_item_id,
        menuItemId: r.menu_item_id,
        name: r.name,
        description: r.description,
        imageUrl: r.image_url || "",
        quantity: r.quantity,
        unitPrice: formatRupee(r.price_paise),
        lineTotal: formatRupee(line),
      };
    });

    res.json({ items, subtotal: formatRupee(subtotal) });
  })
);

app.post(
  "/api/cart/items",
  requireUser,
  asyncHandler(async (req, res) => {
    const menuItemId = Number(req.body.menuItemId);
    const quantity = Math.max(1, Math.min(99, Number(req.body.quantity) || 1));

    if (!Number.isInteger(menuItemId) || menuItemId <= 0) {
      return res.status(400).json({ error: "Invalid menu item." });
    }

    const menu = await pool.query("SELECT id FROM menu_items WHERE id = $1", [menuItemId]);
    if (menu.rows.length === 0) {
      return res.status(404).json({ error: "Menu item not found." });
    }

    const existing = await pool.query(
      "SELECT id, quantity FROM cart_items WHERE user_id = $1 AND menu_item_id = $2",
      [req.session.userId, menuItemId]
    );

    if (existing.rows[0]) {
      const row = existing.rows[0];
      const newQty = Math.min(99, row.quantity + quantity);
      await pool.query("UPDATE cart_items SET quantity = $1 WHERE id = $2", [newQty, row.id]);
    } else {
      await pool.query(
        "INSERT INTO cart_items (user_id, menu_item_id, quantity) VALUES ($1, $2, $3)",
        [req.session.userId, menuItemId, quantity]
      );
    }

    res.json({ ok: true });
  })
);

app.patch(
  "/api/cart/items/:cartItemId",
  requireUser,
  asyncHandler(async (req, res) => {
    const cartItemId = Number(req.params.cartItemId);
    const quantity = Number(req.body.quantity);

    if (!Number.isInteger(cartItemId) || cartItemId <= 0) {
      return res.status(400).json({ error: "Invalid cart item." });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({ error: "Quantity must be between 1 and 99." });
    }

    const row = await pool.query(
      "SELECT id FROM cart_items WHERE id = $1 AND user_id = $2",
      [cartItemId, req.session.userId]
    );
    if (row.rows.length === 0) {
      return res.status(404).json({ error: "Cart item not found." });
    }

    await pool.query("UPDATE cart_items SET quantity = $1 WHERE id = $2", [quantity, cartItemId]);
    res.json({ ok: true });
  })
);

app.delete(
  "/api/cart/items/:cartItemId",
  requireUser,
  asyncHandler(async (req, res) => {
    const cartItemId = Number(req.params.cartItemId);
    const result = await pool.query("DELETE FROM cart_items WHERE id = $1 AND user_id = $2", [
      cartItemId,
      req.session.userId,
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Cart item not found." });
    }
    res.json({ ok: true });
  })
);

app.post(
  "/api/orders",
  requireUser,
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;

    const { rows: cartRows } = await pool.query(
      `SELECT ci.id AS cart_item_id, ci.quantity, m.id AS menu_item_id, m.name, m.price_paise
       FROM cart_items ci
       JOIN menu_items m ON m.id = ci.menu_item_id
       WHERE ci.user_id = $1`,
      [userId]
    );

    if (cartRows.length === 0) {
      return res.status(400).json({ error: "Your cart is empty." });
    }

    let total = 0;
    for (const r of cartRows) {
      total += r.quantity * r.price_paise;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const orderIns = await client.query(
        "INSERT INTO orders (user_id, total_paise) VALUES ($1, $2) RETURNING id",
        [userId, total]
      );
      const orderId = orderIns.rows[0].id;
      for (const r of cartRows) {
        await client.query(
          `INSERT INTO order_items (order_id, menu_item_id, name_snapshot, quantity, unit_price_paise)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, r.menu_item_id, r.name, r.quantity, r.price_paise]
        );
      }
      await client.query("DELETE FROM cart_items WHERE user_id = $1", [userId]);
      await client.query("COMMIT");
      res.json({ ok: true, orderId, total: formatRupee(total) });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(500).json({ error: "Could not place order." });
    } finally {
      client.release();
    }
  })
);

app.get(
  "/api/orders",
  requireUser,
  asyncHandler(async (req, res) => {
    const { rows: orders } = await pool.query(
      `SELECT id, total_paise, status, created_at
       FROM orders
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.session.userId]
    );

    const out = [];
    for (const o of orders) {
      const { rows: items } = await pool.query(
        `SELECT name_snapshot AS name, quantity, unit_price_paise
         FROM order_items
         WHERE order_id = $1
         ORDER BY id`,
        [o.id]
      );
      out.push({
        id: o.id,
        status: o.status,
        createdAt: o.created_at,
        total: formatRupee(o.total_paise),
        items: items.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          unitPrice: formatRupee(it.unit_price_paise),
          lineTotal: formatRupee(it.quantity * it.unit_price_paise),
        })),
      });
    }

    res.json({ orders: out });
  })
);

app.use(express.static(path.join(__dirname, "public")));

module.exports = app;
