import { renderNav } from "../nav.js";
import { api } from "../api.js";
import { redirectIfSignedOut } from "../auth-guard.js";

const navRoot = document.getElementById("nav-root");
const gate = document.getElementById("cart-gate");
const content = document.getElementById("cart-content");
const wrap = document.getElementById("cart-table-wrap");
const subtotalEl = document.getElementById("cart-subtotal");
const checkoutBtn = document.getElementById("checkout-btn");
const checkoutMsg = document.getElementById("checkout-msg");

const session = await redirectIfSignedOut();
if (!session) {
  /* browser navigating away */
  throw new Error("redirect");
}

await renderNav(navRoot, session);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

gate.classList.add("hidden");
content.classList.remove("hidden");

let saveTimers = new Map();

async function loadCart() {
  const data = await api("/api/cart");
  subtotalEl.textContent = data.subtotal;

  if (data.items.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><p>Your cart is empty.</p><p class="mt-1"><a href="index.html">Browse the menu</a></p></div>`;
    checkoutBtn.disabled = true;
    return;
  }

  checkoutBtn.disabled = false;
  const rows = data.items
    .map((it) => {
      const thumb = it.imageUrl
        ? `<img class="cart-thumb" src="${escapeHtml(it.imageUrl)}" alt="" width="72" height="72" loading="lazy" referrerpolicy="no-referrer" />`
        : `<div class="cart-thumb cart-thumb--empty" aria-hidden="true"></div>`;
      return `
    <tr data-cart-id="${it.cartItemId}">
      <td class="cart-item-cell">
        <div class="cart-item-row">
          ${thumb}
          <div class="cart-item-text">
            <strong>${escapeHtml(it.name)}</strong>
            <div class="cart-item-desc">${escapeHtml(it.description)}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="cart-qty">
          <input type="number" min="1" max="99" value="${it.quantity}" aria-label="Quantity for ${escapeHtml(
        it.name
      )}" class="qty-input" data-cart-id="${it.cartItemId}" />
        </div>
      </td>
      <td>${escapeHtml(it.unitPrice)}</td>
      <td><strong>${escapeHtml(it.lineTotal)}</strong></td>
      <td><button type="button" class="btn btn-ghost btn-sm remove-btn" data-cart-id="${it.cartItemId}">Remove</button></td>
    </tr>`;
    })
    .join("");

  wrap.innerHTML = `
    <table class="cart-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Each</th>
          <th>Line</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function scheduleSave(cartItemId, quantity) {
  const prev = saveTimers.get(cartItemId);
  if (prev) clearTimeout(prev);
  const t = setTimeout(async () => {
    saveTimers.delete(cartItemId);
    try {
      await api(`/api/cart/items/${cartItemId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity }),
      });
      await loadCart();
    } catch (err) {
      alert(err.message || "Could not update quantity.");
      await loadCart();
    }
  }, 400);
  saveTimers.set(cartItemId, t);
}

wrap.addEventListener("change", (e) => {
  const input = e.target.closest(".qty-input");
  if (!input) return;
  const id = Number(input.dataset.cartId);
  let q = Number(input.value);
  if (!Number.isFinite(q)) q = 1;
  q = Math.max(1, Math.min(99, Math.floor(q)));
  input.value = String(q);
  scheduleSave(id, q);
});

wrap.addEventListener("click", async (e) => {
  const btn = e.target.closest(".remove-btn");
  if (!btn) return;
  const id = Number(btn.dataset.cartId);
  try {
    await api(`/api/cart/items/${id}`, { method: "DELETE" });
    await loadCart();
  } catch (err) {
    alert(err.message || "Could not remove item.");
  }
});

checkoutBtn.addEventListener("click", async () => {
  checkoutMsg.innerHTML = "";
  checkoutBtn.disabled = true;
  try {
    const res = await api("/api/orders", { method: "POST", body: JSON.stringify({}) });
      checkoutMsg.innerHTML = `<div class="alert alert-success">Order #${res.orderId} placed. Total: ${escapeHtml(
        res.total
      )}. <a href="orders.html">View orders</a></div>`;
    await loadCart();
  } catch (err) {
    checkoutMsg.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message || "Checkout failed.")}</div>`;
  } finally {
    checkoutBtn.disabled = false;
  }
});

loadCart().catch((err) => {
  wrap.innerHTML = `<p class="alert alert-error">${escapeHtml(err.message || "Could not load cart.")}</p>`;
});
