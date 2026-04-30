import { renderNav } from "../nav.js";
import { api } from "../api.js";
import { openAuthModal } from "../auth-modal.js";

const navRoot = document.getElementById("nav-root");
const menuRoot = document.getElementById("menu-root");
const pageTitle = document.querySelector(".page-title");
const pageSub = document.querySelector(".page-sub");

const MENU_HERO_SRC =
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1800&q=80";

function groupByCategory(items) {
  const map = new Map();
  for (const it of items) {
    if (!map.has(it.category)) map.set(it.category, []);
    map.get(it.category).push(it);
  }
  return map;
}

function mediaBlock(imageUrl, name) {
  const alt = escapeHtml(name);
  if (!imageUrl) {
    return `<div class="menu-card__media menu-card__media--empty" role="img" aria-label="${alt}"></div>`;
  }
  const src = escapeHtml(imageUrl);
  return `<div class="menu-card__media">
    <img src="${src}" alt="${alt}" loading="lazy" decoding="async" width="900" height="675" referrerpolicy="no-referrer" />
  </div>`;
}

function renderMenu(items) {
  const hero = `
    <div class="page-hero">
      <img class="page-hero__img" src="${MENU_HERO_SRC}" alt="" width="1600" height="900" decoding="async" />
      <div class="page-hero__overlay"></div>
      <p class="page-hero__tagline">Fresh plates · local flavors</p>
    </div>`;

  const grouped = groupByCategory(items);
  const parts = [hero];
  for (const [category, list] of grouped) {
    parts.push(`<h2 class="section-label">${escapeHtml(category)}</h2>`);
    parts.push('<div class="menu-grid">');
    for (const it of list) {
      const img = it.imageUrl || "";
      parts.push(`
        <article class="menu-card" data-id="${it.id}">
          ${mediaBlock(img, it.name)}
          <div class="menu-card__body">
            <span class="menu-card__cat">${escapeHtml(category)}</span>
            <h3>${escapeHtml(it.name)}</h3>
            <p>${escapeHtml(it.description)}</p>
            <div class="menu-card__footer">
              <span class="price">${escapeHtml(it.price)}</span>
              <div class="menu-card__buy">
                <div class="qty-stepper" aria-label="Quantity">
                  <button type="button" class="qty-stepper__btn" data-qty-act="dec" aria-label="Decrease quantity">−</button>
                  <input class="qty-stepper__input menu-qty-input" type="number" min="1" max="99" value="1" inputmode="numeric" aria-label="Quantity for ${escapeHtml(
                    it.name
                  )}" />
                  <button type="button" class="qty-stepper__btn" data-qty-act="inc" aria-label="Increase quantity">+</button>
                </div>
                <button type="button" class="btn btn-primary btn-sm add-btn" data-id="${it.id}">Add to cart</button>
              </div>
            </div>
          </div>
        </article>
      `);
    }
    parts.push("</div>");
  }
  menuRoot.innerHTML = parts.join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readQtyFromCard(card) {
  const input = card.querySelector(".menu-qty-input");
  let n = Number(input?.value);
  if (!Number.isFinite(n)) n = 1;
  return Math.max(1, Math.min(99, Math.floor(n)));
}

function stripOpenQuery() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("open")) return;
  url.searchParams.delete("open");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

async function main() {
  const searchBefore = window.location.search;
  const { user } = await renderNav(navRoot);

  if (!user) {
    document.body.classList.add("guest-auth-gate");
    menuRoot.innerHTML = "";
    if (pageTitle) pageTitle.textContent = "";
    if (pageSub) pageSub.textContent = "";

    const q = new URLSearchParams(searchBefore).get("open");
    const tab = q === "register" ? "register" : "login";
    queueMicrotask(() => openAuthModal(tab, { gate: true }));
    stripOpenQuery();
    return;
  }

  document.body.classList.remove("guest-auth-gate");

  if (pageTitle) pageTitle.textContent = "Today’s menu";
  if (pageSub) {
    pageSub.textContent = "Choose a quantity, then add to cart — same items stack in your cart.";
  }
  const { items } = await api("/api/menu");
  renderMenu(items);

  menuRoot.addEventListener("click", async (e) => {
    const step = e.target.closest("[data-qty-act]");
    if (step) {
      const card = step.closest(".menu-card");
      const input = card.querySelector(".menu-qty-input");
      let n = Number(input.value) || 1;
      n += step.dataset.qtyAct === "inc" ? 1 : -1;
      n = Math.max(1, Math.min(99, n));
      input.value = String(n);
      return;
    }

    const btn = e.target.closest(".add-btn");
    if (!btn) return;
    const card = btn.closest(".menu-card");
    const id = Number(btn.dataset.id);
    const qty = readQtyFromCard(card);
    btn.disabled = true;
    try {
      await api("/api/cart/items", {
        method: "POST",
        body: JSON.stringify({ menuItemId: id, quantity: qty }),
      });
      btn.textContent = `Added ${qty}!`;
      setTimeout(() => {
        btn.textContent = "Add to cart";
        btn.disabled = false;
      }, 1000);
    } catch (err) {
      btn.disabled = false;
      alert(err.message || "Could not add to cart.");
    }
  });
}

main().catch((err) => {
  document.body.classList.remove("guest-auth-gate");
  menuRoot.innerHTML = `<p class="alert alert-error">${escapeHtml(err.message || "Failed to load.")}</p>`;
});
