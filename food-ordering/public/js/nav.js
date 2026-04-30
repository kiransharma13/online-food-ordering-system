import { initAuthModal } from "./auth-modal.js";

function activeKey() {
  const file = (window.location.pathname || "").split("/").pop() || "";
  if (file === "index.html" || file === "") return "menu";
  if (file === "login.html") return "login";
  if (file === "register.html") return "register";
  if (file === "cart.html") return "cart";
  if (file === "orders.html") return "orders";
  return "";
}

/** @param preloaded Optional result of /api/me to skip a second request */
export async function renderNav(container, preloaded = null) {
  if (!container) return { user: null };
  let me = preloaded;
  if (!me) {
    try {
      me = await fetch("/api/me", { credentials: "same-origin" }).then((r) => r.json());
    } catch {
      me = { user: null };
    }
  }

  const key = activeKey();
  const authed = !!me.user;

  const links = authed
    ? `
      <span class="nav-user">Hi, ${escapeHtml(me.user.name)}</span>
      <a href="index.html" class="${key === "menu" ? "is-active" : ""}">Menu</a>
      <a href="cart.html" class="${key === "cart" ? "is-active" : ""}">Cart</a>
      <a href="orders.html" class="${key === "orders" ? "is-active" : ""}">Orders</a>
      <a href="#" id="nav-logout">Log out</a>
    `
    : `
      <span class="nav-auth-actions">
        <button type="button" class="btn btn-ghost btn-nav" data-auth-open="login">Sign in</button>
        <button type="button" class="btn btn-primary btn-nav" data-auth-open="register">Sign up</button>
      </span>
    `;

  container.innerHTML = `
    <div class="site-header__inner">
      <a class="brand" href="index.html">Fork &amp; Plate</a>
      <nav class="nav-links">${links}</nav>
    </div>
  `;

  const logout = container.querySelector("#nav-logout");
  if (logout) {
    logout.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
      } catch {
        /* ignore */
      }
      window.location.href = "index.html";
    });
  }

  if (!authed) {
    initAuthModal();
  }

  return me;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
