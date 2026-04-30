import { api } from "./api.js";

let rootEl = null;
let lastFocus = null;
let documentClickBound = false;

function ensureDom() {
  if (rootEl) return;

  const wrap = document.createElement("div");
  wrap.id = "auth-modal-root";
  wrap.className = "modal-root hidden";
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = `
    <div class="modal-backdrop" tabindex="-1" aria-hidden="true"></div>
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div class="modal-panel card" style="box-shadow: var(--shadow)">
        <header class="modal-header">
          <div>
            <p class="modal-eyebrow">Fork &amp; Plate</p>
            <h2 id="auth-modal-title" class="modal-title">Sign in</h2>
            <p class="modal-lead" id="auth-modal-lead">Welcome back — your cart syncs here.</p>
          </div>
          <button type="button" class="modal-close btn btn-ghost" data-auth-close aria-label="Close dialog">✕</button>
        </header>

        <div class="modal-tabs" role="tablist" aria-label="Account">
          <button type="button" class="modal-tab is-active" role="tab" aria-selected="true" data-auth-tab="login" id="tab-login">Sign in</button>
          <button type="button" class="modal-tab" role="tab" aria-selected="false" data-auth-tab="register" id="tab-register">Sign up</button>
        </div>

        <div class="modal-body">
          <div id="auth-err-login" class="alert alert-error hidden" role="alert"></div>
          <form id="auth-form-login" class="form-stack auth-form" data-panel="login">
            <div>
              <label for="auth-login-email">Email</label>
              <input id="auth-login-email" name="email" type="email" autocomplete="email" required />
            </div>
            <div>
              <label for="auth-login-password">Password</label>
              <input id="auth-login-password" name="password" type="password" autocomplete="current-password" required />
            </div>
            <button type="submit" class="btn btn-primary">Sign in</button>
          </form>

          <div id="auth-err-register" class="alert alert-error hidden" role="alert"></div>
          <form id="auth-form-register" class="form-stack auth-form hidden" data-panel="register">
            <div>
              <label for="auth-reg-name">Name</label>
              <input id="auth-reg-name" name="name" type="text" autocomplete="name" required />
            </div>
            <div>
              <label for="auth-reg-email">Email</label>
              <input id="auth-reg-email" name="email" type="email" autocomplete="email" required />
            </div>
            <div>
              <label for="auth-reg-password">Password</label>
              <input id="auth-reg-password" name="password" type="password" autocomplete="new-password" minlength="8" required />
              <p class="modal-hint">At least 8 characters.</p>
            </div>
            <button type="submit" class="btn btn-primary">Create account</button>
          </form>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  rootEl = wrap;

  const title = wrap.querySelector("#auth-modal-title");
  const lead = wrap.querySelector("#auth-modal-lead");
  const tabLogin = wrap.querySelector('[data-auth-tab="login"]');
  const tabRegister = wrap.querySelector('[data-auth-tab="register"]');
  const formLogin = wrap.querySelector("#auth-form-login");
  const formRegister = wrap.querySelector("#auth-form-register");
  const errLogin = wrap.querySelector("#auth-err-login");
  const errRegister = wrap.querySelector("#auth-err-register");

  function setTab(tab) {
    const isLogin = tab === "login";
    title.textContent = isLogin ? "Sign in" : "Sign up";
    lead.textContent = isLogin
      ? "Welcome back — your cart syncs here."
      : "Create an account to save your cart and track orders.";
    tabLogin.classList.toggle("is-active", isLogin);
    tabRegister.classList.toggle("is-active", !isLogin);
    tabLogin.setAttribute("aria-selected", String(isLogin));
    tabRegister.setAttribute("aria-selected", String(!isLogin));
    formLogin.classList.toggle("hidden", !isLogin);
    formRegister.classList.toggle("hidden", isLogin);
    errLogin.classList.add("hidden");
    errRegister.classList.add("hidden");
    wrap.dataset.activeTab = tab;
    if (isLogin) wrap.querySelector("#auth-login-email")?.focus();
    else wrap.querySelector("#auth-reg-name")?.focus();
  }

  wrap.addEventListener("click", (e) => {
    const gated = rootEl.classList.contains("modal-root--no-dismiss");
    if (e.target.closest("[data-auth-close]")) {
      e.preventDefault();
      if (!gated) closeAuthModal();
      return;
    }
    if (!gated && e.target.classList.contains("modal-backdrop")) {
      closeAuthModal();
    }
  });

  wrap.querySelector(".modal-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-auth-tab]");
    if (!btn) return;
    setTab(btn.dataset.authTab);
  });

  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    errLogin.classList.add("hidden");
    const email = formLogin.email.value.trim();
    const password = formLogin.password.value;
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ email, password }) });
      closeAuthModal();
      window.location.reload();
    } catch (err) {
      errLogin.textContent = err.message || "Sign in failed.";
      errLogin.classList.remove("hidden");
    }
  });

  formRegister.addEventListener("submit", async (e) => {
    e.preventDefault();
    errRegister.classList.add("hidden");
    const name = formRegister.name.value.trim();
    const email = formRegister.email.value.trim();
    const password = formRegister.password.value;
    try {
      await api("/api/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
      closeAuthModal();
      window.location.reload();
    } catch (err) {
      errRegister.textContent = err.message || "Could not create account.";
      errRegister.classList.remove("hidden");
    }
  });

  wrap._setTab = setTab;
}

function onKeydown(e) {
  if (e.key === "Escape" && rootEl && !rootEl.classList.contains("modal-root--no-dismiss")) {
    closeAuthModal();
  }
}

/** @param {{ gate?: boolean }} [options] — gate: no close button, backdrop, or Escape */
export function openAuthModal(tab = "login", options = {}) {
  ensureDom();
  const t = tab === "register" ? "register" : "login";
  const alreadyOpen = rootEl && !rootEl.classList.contains("hidden") && rootEl.classList.contains("is-visible");
  rootEl.classList.toggle("modal-root--no-dismiss", !!options.gate);
  if (alreadyOpen) {
    rootEl._setTab(t);
    return;
  }
  lastFocus = document.activeElement;
  rootEl.classList.remove("hidden");
  rootEl.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  rootEl._setTab(t);
  document.addEventListener("keydown", onKeydown);
  requestAnimationFrame(() => rootEl.classList.add("is-visible"));
}

export function closeAuthModal() {
  if (!rootEl || rootEl.classList.contains("hidden")) return;
  rootEl.classList.remove("is-visible", "modal-root--no-dismiss");
  document.removeEventListener("keydown", onKeydown);
  document.body.classList.remove("modal-open");
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    rootEl.classList.add("hidden");
    rootEl.setAttribute("aria-hidden", "true");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  };
  setTimeout(done, 220);
}

/** Wires header buttons (safe to call from each page; binds once). */
export function initAuthModal() {
  ensureDom();
  if (documentClickBound) return;
  documentClickBound = true;
  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-auth-open]");
    if (!opener) return;
    e.preventDefault();
    const tab = opener.getAttribute("data-auth-open") === "register" ? "register" : "login";
    openAuthModal(tab);
  });
}

