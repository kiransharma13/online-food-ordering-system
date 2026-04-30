import { renderNav } from "../nav.js";
import { api } from "../api.js";
import { redirectIfSignedOut } from "../auth-guard.js";

const navRoot = document.getElementById("nav-root");
const gate = document.getElementById("orders-gate");
const root = document.getElementById("orders-root");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const session = await redirectIfSignedOut();
if (!session) {
  throw new Error("redirect");
}

await renderNav(navRoot, session);

gate.classList.add("hidden");
root.classList.remove("hidden");
try {
  const { orders } = await api("/api/orders");
  if (orders.length === 0) {
    root.innerHTML = `<div class="card empty-state"><p>No orders yet.</p><p class="mt-1"><a href="index.html">Browse the menu</a></p></div>`;
  } else {
    root.innerHTML = `<div class="order-list">${orders
      .map(
        (o) => `
        <article class="order-card">
          <div class="order-card__head">
            <div>
              <strong>Order #${o.id}</strong>
              <span class="badge" style="margin-left:0.5rem">${escapeHtml(o.status)}</span>
            </div>
            <div><strong>${escapeHtml(o.total)}</strong></div>
          </div>
          <div class="order-card__meta">${escapeHtml(o.createdAt)}</div>
          <ul class="order-items">
            ${o.items
              .map(
                (li) =>
                  `<li>${escapeHtml(li.name)} × ${li.quantity} — ${escapeHtml(li.lineTotal)} <span style="opacity:0.7">(@ ${escapeHtml(
                    li.unitPrice
                  )})</span></li>`
              )
              .join("")}
          </ul>
        </article>
      `
      )
      .join("")}</div>`;
  }
} catch (err) {
  root.innerHTML = `<p class="alert alert-error">${escapeHtml(err.message || "Could not load orders.")}</p>`;
}
