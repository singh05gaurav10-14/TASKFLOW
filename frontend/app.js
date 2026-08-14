/* ==========================================================================
   app.js — TaskFlow  |  Mobile master-detail + Desktop 3-column
   ========================================================================== */
"use strict";

/* ── Configuration ──────────────────────────────────────────────────────── */
const API_BASE = "http://127.0.0.1:8000";

/* ── App state ──────────────────────────────────────────────────────────── */
let selectedUserId       = null;
let selectedUserName     = null;
let selectedProjectId    = null;
let selectedProjectTitle = null;
let currentTasks         = [];

/* ── localStorage task cache helpers ───────────────────────────────────── */
/**
 * Per-project cache key so switching projects never shows stale data.
 *   key format:  "tf_tasks_<projectId>"
 */
function _taskCacheKey(projectId) {
  return `tf_tasks_${projectId}`;
}

/**
 * Read the cached task array for a project.
 * Returns an array (possibly empty); never throws — corrupt data yields [].
 */
function getTaskCache(projectId) {
  try {
    const raw = localStorage.getItem(_taskCacheKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * Write the current task array to the cache for a project.
 * Silently ignores storage errors (e.g. private-browsing quota exceeded).
 */
function setTaskCache(projectId, tasks) {
  try {
    localStorage.setItem(_taskCacheKey(projectId), JSON.stringify(tasks));
  } catch (_) {
    // QuotaExceededError or SecurityError — carry on without caching
  }
}

/* ── Mobile navigation state ────────────────────────────────────────────── */
// Possible values: "users" | "projects" | "tasks" | "detail"
let mobileViewStack   = ["users"];
let mobileCurrentTask = null;

function isMobile() {
  return window.innerWidth < 768;
}

/* ── DOM refs: header / alert ───────────────────────────────────────────── */
const headerStatus       = document.getElementById("header-status");
const mobileHeaderStatus = document.getElementById("mobile-header-status");
const alertBanner        = document.getElementById("alert-banner");
const alertText          = document.getElementById("alert-text");
const alertClose         = document.getElementById("alert-close");

/* ── DOM refs: mobile header ────────────────────────────────────────────── */
const mobileBackBtn     = document.getElementById("mobile-back-btn");
const mobileHeaderTitle = document.getElementById("mobile-header-title");
const mobileBreadcrumb  = document.getElementById("mobile-breadcrumb");

/* ── DOM refs: desktop breadcrumb ───────────────────────────────────────── */
const bcUser    = document.getElementById("bc-user");
const bcProject = document.getElementById("bc-project");

/* ── DOM refs: users panel ──────────────────────────────────────────────── */
const btnToggleUserForm = document.getElementById("btn-toggle-user-form");
const userCreateForm    = document.getElementById("user-create-form");
const formNewUser       = document.getElementById("form-new-user");
const uName             = document.getElementById("u-name");
const uEmail            = document.getElementById("u-email");
const uNameErr          = document.getElementById("u-name-err");
const uEmailErr         = document.getElementById("u-email-err");
const btnCancelUser     = document.getElementById("btn-cancel-user");
const userListEl        = document.getElementById("user-list");

/* ── DOM refs: projects panel ───────────────────────────────────────────── */
const btnToggleProjectForm = document.getElementById("btn-toggle-project-form");
const projectCreateForm    = document.getElementById("project-create-form");
const formNewProject       = document.getElementById("form-new-project");
const pTitle               = document.getElementById("p-title");
const pDesc                = document.getElementById("p-desc");
const pTitleErr            = document.getElementById("p-title-err");
const btnCancelProject     = document.getElementById("btn-cancel-project");
const projectListEl        = document.getElementById("project-list");

/* ── DOM refs: tasks panel ──────────────────────────────────────────────── */
const btnToggleTaskForm = document.getElementById("btn-toggle-task-form");
const taskCreateForm    = document.getElementById("task-create-form");
const formNewTask       = document.getElementById("form-new-task");
const tTitle            = document.getElementById("t-title");
const tDesc             = document.getElementById("t-desc");
const tPriority         = document.getElementById("t-priority");
const tDue              = document.getElementById("t-due");
const tTitleErr         = document.getElementById("t-title-err");
const btnCancelTask     = document.getElementById("btn-cancel-task");
const taskListEl        = document.getElementById("task-list");

/* ── DOM refs: task controls ────────────────────────────────────────────── */
const taskSearchInput = document.getElementById("task-search");
const searchAlgo      = document.getElementById("search-algo");
const btnSearch       = document.getElementById("btn-search");
const btnSearchClear  = document.getElementById("btn-search-clear");
const filterStatus    = document.getElementById("filter-status");
const filterPriority  = document.getElementById("filter-priority");
const sortBy          = document.getElementById("sort-by");
const taskCountChip   = document.getElementById("task-count");

/* ── DOM refs: project stats ────────────────────────────────────────────── */
const projectStats = document.getElementById("project-stats");
const statTotal    = document.getElementById("stat-total");
const statTodo     = document.getElementById("stat-todo");
const statIp       = document.getElementById("stat-ip");
const statDone     = document.getElementById("stat-done");

/* ── DOM refs: quick-add ────────────────────────────────────────────────── */
const formQuickAdd = document.getElementById("form-quick-add");
const qaDesc       = document.getElementById("qa-desc");
const qaDescErr    = document.getElementById("qa-desc-err");

/* ── DOM refs: edit modal ───────────────────────────────────────────────── */
const editModal     = document.getElementById("edit-modal");
const editForm      = document.getElementById("edit-form");
const editTaskId    = document.getElementById("edit-task-id");
const editTitle     = document.getElementById("edit-title");
const editDesc      = document.getElementById("edit-desc");
const editPriority  = document.getElementById("edit-priority");
const editStatus    = document.getElementById("edit-status");
const editDue       = document.getElementById("edit-due");
const editTitleErr  = document.getElementById("edit-title-err");
const modalCloseX   = document.getElementById("modal-close-x");
const editCancelBtn = document.getElementById("edit-cancel-btn");

/* ── DOM refs: mobile task detail ───────────────────────────────────────── */
const mobileTaskDetail    = document.getElementById("mobile-task-detail");
const detailTitle         = document.getElementById("detail-title");
const detailPriorityBadge = document.getElementById("detail-priority-badge");
const detailDescText      = document.getElementById("detail-desc-text");
const detailStatusBadge   = document.getElementById("detail-status-badge");
const detailDue           = document.getElementById("detail-due");
const detailAssignedUser  = document.getElementById("detail-assigned-user");
const detailProject       = document.getElementById("detail-project");
const detailStatusBtns    = document.getElementById("detail-status-buttons");
const detailTimeline      = document.getElementById("detail-timeline");
const detailDeleteBtn     = document.getElementById("detail-delete-btn");

/* ── DOM refs: FABs ─────────────────────────────────────────────────────── */
const fabContainer  = document.getElementById("fab-container");
const fabAddUser    = document.getElementById("fab-add-user");
const fabAddProject = document.getElementById("fab-add-project");
const fabAddTask    = document.getElementById("fab-add-task");

/* ── DOM refs: mobile form overlay ─────────────────────────────────────── */
const mobileFormOverlay = document.getElementById("mobile-form-overlay");
const mobileFormInner   = document.getElementById("mobile-form-inner");

/* ==========================================================================
   Alert banner
   ========================================================================== */
function showAlert(message, isError = false) {
  alertText.textContent = message;
  alertBanner.classList.toggle("alert-error", isError);
  alertBanner.classList.toggle("alert-info",  !isError);
  alertBanner.hidden = false;
  alertClose.hidden  = false;
}

function hideAlert() {
  alertBanner.hidden = true;
  alertClose.hidden  = true;
  alertText.textContent = "";
}

alertClose.addEventListener("click", hideAlert);

/* ==========================================================================
   Toast notifications
   ========================================================================== */
const toastStack = document.getElementById("toast-stack");

function toast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.setAttribute("role", "status");

  const icon   = { success: "✔", error: "✖", info: "ℹ" }[type] ?? "ℹ";
  const iconEl = document.createElement("span");
  iconEl.className   = "toast-icon";
  iconEl.textContent = icon;

  const textEl = document.createElement("span");
  textEl.className   = "toast-text";
  textEl.textContent = message;

  const closeEl = document.createElement("button");
  closeEl.className   = "toast-close";
  closeEl.textContent = "✕";
  closeEl.setAttribute("aria-label", "Dismiss");
  closeEl.addEventListener("click", () => dismiss(el));

  el.appendChild(iconEl);
  el.appendChild(textEl);
  el.appendChild(closeEl);
  toastStack.appendChild(el);

  requestAnimationFrame(() => el.classList.add("toast-visible"));
  const timer = setTimeout(() => dismiss(el), 3000);
  el._dismissTimer = timer;

  function dismiss(node) {
    clearTimeout(node._dismissTimer);
    node.classList.remove("toast-visible");
    node.classList.add("toast-hiding");
    node.addEventListener("transitionend", () => node.remove(), { once: true });
  }
}

/* ==========================================================================
   API layer
   ========================================================================== */
async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const b = await res.json();
      if (typeof b.detail === "string") {
        // e.g. "User with id=5 not found."
        detail = b.detail;
      } else if (Array.isArray(b.detail)) {
        // FastAPI 422 — detail is an array of {loc, msg, type} objects
        detail = b.detail.map(e => e.msg ?? JSON.stringify(e)).join("; ");
      } else if (b.detail !== undefined) {
        detail = JSON.stringify(b.detail);
      }
    } catch (_) {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

const apiListUsers     = ()      => apiFetch("/users/");
const apiCreateUser    = (d)     => apiFetch("/users/",  { method: "POST", body: JSON.stringify(d) });
const apiDeleteUser    = (id)    => apiFetch(`/users/${id}`, { method: "DELETE" });

const apiListProjects  = ()      => apiFetch("/projects/");
const apiCreateProject = (d)     => apiFetch("/projects/", { method: "POST", body: JSON.stringify(d) });
const apiUpdateProject = (id, d) => apiFetch(`/projects/${id}`, { method: "PUT",  body: JSON.stringify(d) });
const apiDeleteProject = (id)    => apiFetch(`/projects/${id}`, { method: "DELETE" });

const apiListTasks  = (pid, sort) =>
  apiFetch(`/tasks/?project_id=${pid}${sort ? "&sort=" + sort : ""}`);
const apiSearchTask = (title, algo) =>
  apiFetch(`/tasks/search?title=${encodeURIComponent(title)}&algo=${algo}`);
const apiCreateTask = (d)     => apiFetch("/tasks/",  { method: "POST", body: JSON.stringify(d) });
const apiUpdateTask = (id, d) => apiFetch(`/tasks/${id}`, { method: "PUT",  body: JSON.stringify(d) });
const apiDeleteTask = (id)    => apiFetch(`/tasks/${id}`, { method: "DELETE" });
const apiQuickAdd   = (d)     => apiFetch("/tasks/quick-add", { method: "POST", body: JSON.stringify(d) });
const apiProjectStats = (id)  => apiFetch(`/stats/projects/${id}`);

/* ==========================================================================
   Validation helpers
   ========================================================================== */
function validateField(input, errEl, message) {
  if (!input.value.trim()) {
    errEl.textContent = message;
    input.setAttribute("aria-invalid", "true");
    return false;
  }
  errEl.textContent = "";
  input.removeAttribute("aria-invalid");
  return true;
}

function clearFieldError(input, errEl) {
  input.addEventListener("input", () => {
    if (input.value.trim()) {
      errEl.textContent = "";
      input.removeAttribute("aria-invalid");
    }
  });
}

clearFieldError(uName,     uNameErr);
clearFieldError(uEmail,    uEmailErr);
clearFieldError(pTitle,    pTitleErr);
clearFieldError(tTitle,    tTitleErr);
clearFieldError(editTitle, editTitleErr);

function statusLabel(s) {
  return { todo: "To Do", in_progress: "In Progress", done: "Done" }[s] ?? s;
}


/* ==========================================================================
   MOBILE NAVIGATION ENGINE
   ========================================================================== */

/**
 * Map screen names to their DOM elements.
 * The detail screen sits outside .workspace but is handled the same way.
 */
const SCREENS = {
  users:    document.getElementById("panel-users"),
  projects: document.getElementById("panel-projects"),
  tasks:    document.getElementById("panel-tasks"),
  detail:   document.getElementById("mobile-task-detail"),
};

/**
 * Push a new screen onto the view stack and animate it in (slide from right).
 */
function pushView(screenName) {
  if (!isMobile()) return;

  const prev = mobileViewStack[mobileViewStack.length - 1];
  mobileViewStack.push(screenName);

  _applyScreenVisibility();
  _animateTransition(prev, screenName, "forward");
  updateMobileHeader();
  updateFABs();
}

/**
 * Pop the current screen and animate back (slide to right).
 */
function popView() {
  if (!isMobile() || mobileViewStack.length <= 1) return;

  const current = mobileViewStack.pop();
  const prev    = mobileViewStack[mobileViewStack.length - 1];

  _applyScreenVisibility();
  _animateTransition(current, prev, "back");
  updateMobileHeader();
  updateFABs();
}

/**
 * Set which screen element should be "active" (visible) based on the stack top.
 * All others get pointer-events removed so they can't intercept touches.
 */
function _applyScreenVisibility() {
  const active = mobileViewStack[mobileViewStack.length - 1];
  Object.entries(SCREENS).forEach(([name, el]) => {
    if (!el) return;
    if (name === active) {
      el.classList.add("mobile-active");
      el.hidden = false;
    } else {
      el.classList.remove("mobile-active");
      // Keep hidden=false so CSS transitions can still run; hide after animation
    }
  });
}

/**
 * Run CSS slide animations between two screens.
 * forward: fromEl exits left, toEl enters from right.
 * back:    fromEl exits right, toEl enters from left.
 */
function _animateTransition(fromName, toName, direction) {
  const fromEl = SCREENS[fromName];
  const toEl   = SCREENS[toName];
  if (!fromEl || !toEl) return;

  // Strip any leftover animation classes first
  const allAnim = [
    "mobile-screen-enter", "mobile-screen-exit",
    "mobile-screen-enter-back", "mobile-screen-exit-back",
  ];
  [fromEl, toEl].forEach(el => el.classList.remove(...allAnim));

  if (direction === "forward") {
    fromEl.classList.add("mobile-screen-exit");
    toEl.classList.add("mobile-screen-enter");
  } else {
    fromEl.classList.add("mobile-screen-exit-back");
    toEl.classList.add("mobile-screen-enter-back");
  }

  // Clean up after animation
  const cleanup = () => {
    [fromEl, toEl].forEach(el => el.classList.remove(...allAnim));
    // Hide the screen that exited (keep the one we entered visible)
    fromEl.hidden = (fromName === "detail");
  };
  toEl.addEventListener("animationend", cleanup, { once: true });
}

/**
 * Update mobile header: title text, breadcrumb trail, back-button visibility.
 */
function updateMobileHeader() {
  if (!isMobile()) return;

  const screen = mobileViewStack[mobileViewStack.length - 1];
  const depth  = mobileViewStack.length;

  // Back button — shown whenever we are not at root
  mobileBackBtn.hidden = depth <= 1;

  // Title — replace text node after the icon span
  const titles = {
    users:   "TaskFlow",
    projects: selectedUserName     ?? "Projects",
    tasks:    selectedProjectTitle ?? "Tasks",
    detail:   mobileCurrentTask?.title ?? "Task Detail",
  };
  // Remove existing text nodes
  Array.from(mobileHeaderTitle.childNodes)
    .filter(n => n.nodeType === Node.TEXT_NODE)
    .forEach(n => n.remove());
  mobileHeaderTitle.appendChild(
    document.createTextNode(" " + (titles[screen] ?? "TaskFlow"))
  );

  // Breadcrumb
  _renderMobileBreadcrumb(screen);
}

function _renderMobileBreadcrumb(screen) {
  mobileBreadcrumb.innerHTML = "";

  const crumbs = ["Workspace"];
  if (["projects", "tasks", "detail"].includes(screen))
    crumbs.push(selectedUserName ?? "User");
  if (["tasks", "detail"].includes(screen))
    crumbs.push(selectedProjectTitle ?? "Project");
  if (screen === "detail" && mobileCurrentTask) {
    const t = mobileCurrentTask.title;
    crumbs.push(t.length > 18 ? t.slice(0, 16) + "…" : t);
  }

  crumbs.forEach((text, i) => {
    const span = document.createElement("span");
    span.className   = "mbc-item";
    span.textContent = text;
    mobileBreadcrumb.appendChild(span);

    if (i < crumbs.length - 1) {
      const sep = document.createElement("span");
      sep.className   = "mbc-sep";
      sep.textContent = "›";
      sep.setAttribute("aria-hidden", "true");
      mobileBreadcrumb.appendChild(sep);
    }
  });
}

/**
 * Show only the FAB relevant to the current mobile screen.
 */
function updateFABs() {
  if (!isMobile()) {
    fabContainer.setAttribute("aria-hidden", "true");
    fabAddUser.hidden = fabAddProject.hidden = fabAddTask.hidden = true;
    return;
  }

  fabContainer.removeAttribute("aria-hidden");
  const screen = mobileViewStack[mobileViewStack.length - 1];
  fabAddUser.hidden    = screen !== "users";
  fabAddProject.hidden = screen !== "projects";
  fabAddTask.hidden    = screen !== "tasks";
}

/**
 * Switch layout mode between mobile (absolute panels) and desktop (grid).
 */
function applyMobileLayout() {
  const workspace   = document.getElementById("workspace");
  const siteHeader  = document.querySelector(".site-header");
  const desktopBc   = document.querySelector(".breadcrumb.desktop-only");

  if (isMobile()) {
    workspace.classList.add("mobile-nav-active");
    siteHeader?.classList.add("desktop-header-hidden");
    desktopBc?.classList.add("desktop-header-hidden");

    // Make sure only the current screen is active
    _applyScreenVisibility();
    // Detail screen starts hidden
    if (!mobileViewStack.includes("detail")) {
      mobileTaskDetail.hidden = true;
      mobileTaskDetail.classList.remove("mobile-active");
    }
    updateMobileHeader();
    updateFABs();
  } else {
    workspace.classList.remove("mobile-nav-active");
    siteHeader?.classList.remove("desktop-header-hidden");
    desktopBc?.classList.remove("desktop-header-hidden");

    // Restore all panels to normal (grid layout handles visibility)
    Object.values(SCREENS).forEach(el => {
      if (!el) return;
      el.classList.remove(
        "mobile-active", "mobile-screen-enter", "mobile-screen-exit",
        "mobile-screen-enter-back", "mobile-screen-exit-back"
      );
    });
    mobileTaskDetail.hidden = true;
    fabContainer.setAttribute("aria-hidden", "true");
    fabAddUser.hidden = fabAddProject.hidden = fabAddTask.hidden = true;
  }
}

// Re-evaluate layout whenever viewport width crosses the 768px boundary
let _lastMobile = isMobile();
window.addEventListener("resize", () => {
  const nowMobile = isMobile();
  if (nowMobile !== _lastMobile) {
    _lastMobile = nowMobile;
    if (!nowMobile) mobileViewStack = ["users"];
    applyMobileLayout();
  }
});

/* Back button — closes overlay if open, otherwise pops the view stack */
mobileBackBtn.addEventListener("click", () => {
  if (!mobileFormOverlay.hidden) {
    closeMobileFormOverlay();
    return;
  }
  popView();
});

/* ==========================================================================
   MOBILE FORM OVERLAY (bottom sheet)
   ========================================================================== */
function openMobileFormOverlay(contentNode) {
  mobileFormInner.innerHTML = "";
  mobileFormInner.appendChild(contentNode);
  mobileFormOverlay.hidden = false;
  requestAnimationFrame(() =>
    mobileFormOverlay.classList.add("mobile-form-overlay-open")
  );
  mobileFormInner.querySelector("input, textarea, select, button")?.focus();
}

function closeMobileFormOverlay() {
  mobileFormOverlay.classList.remove("mobile-form-overlay-open");
  mobileFormOverlay.addEventListener("transitionend", () => {
    mobileFormOverlay.hidden = true;
    mobileFormInner.innerHTML = "";
  }, { once: true });
}

// Tap backdrop to close
mobileFormOverlay.addEventListener("click", (e) => {
  if (e.target === mobileFormOverlay) closeMobileFormOverlay();
});

/* ==========================================================================
   Desktop breadcrumb updater
   ========================================================================== */
function updateBreadcrumb(userName, projectTitle) {
  bcUser.textContent    = userName     ?? bcUser.dataset.empty;
  bcProject.textContent = projectTitle ?? bcProject.dataset.empty;
}


/* ==========================================================================
   PANEL 1 — USERS
   ========================================================================== */

function renderUsers(users) {
  userListEl.innerHTML = "";
  if (!users.length) {
    const li = document.createElement("li");
    li.className   = "entity-empty";
    li.textContent = "No users yet. Tap + to create one.";
    userListEl.appendChild(li);
    return;
  }
  users.forEach(u => userListEl.appendChild(buildUserCard(u)));
}

function buildUserCard(user) {
  const li = document.createElement("li");
  li.className  = "entity-card";
  li.dataset.id = user.id;
  if (user.id === selectedUserId) li.classList.add("is-selected");

  // Avatar
  const avatar = document.createElement("div");
  avatar.className   = "card-avatar";
  avatar.textContent = user.name.charAt(0).toUpperCase();
  avatar.setAttribute("aria-hidden", "true");

  const info  = document.createElement("div");
  info.className = "card-info";

  const name  = document.createElement("span");
  name.className   = "card-title";
  name.textContent = user.name;

  const email = document.createElement("span");
  email.className   = "card-sub";
  email.textContent = user.email;

  info.appendChild(name);
  info.appendChild(email);

  const del = document.createElement("button");
  del.type      = "button";
  del.className = "btn btn-danger btn-sm card-del";
  del.textContent = "✕";
  del.setAttribute("aria-label", `Delete user ${user.name}`);
  del.addEventListener("click", (e) => { e.stopPropagation(); handleDeleteUser(user.id); });

  const chevron = document.createElement("span");
  chevron.className = "card-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
    viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="9 18 15 12 9 6"></polyline></svg>`;

  li.appendChild(avatar);
  li.appendChild(info);
  li.appendChild(del);
  li.appendChild(chevron);
  li.addEventListener("click", () => selectUser(user));
  return li;
}

async function loadUsers() {
  try {
    const users = await apiListUsers();
    renderUsers(users);
  } catch (err) {
    showAlert("Could not load users: " + err.message, true);
  }
}

async function selectUser(user) {
  selectedUserId       = user.id;
  selectedUserName     = user.name;
  selectedProjectId    = null;
  selectedProjectTitle = null;
  currentTasks         = [];

  document.querySelectorAll("#user-list .entity-card").forEach(el =>
    el.classList.toggle("is-selected", Number(el.dataset.id) === user.id)
  );

  updateBreadcrumb(user.name, null);
  btnToggleProjectForm.disabled = false;

  renderTasksEmpty("Select a project to see tasks.");
  projectStats.hidden = true;
  btnToggleTaskForm.disabled = true;
  if (!taskCreateForm.hidden) togglePanel(taskCreateForm, btnToggleTaskForm);

  await loadProjectsForUser(user.id);
  if (isMobile()) pushView("projects");
}

async function handleDeleteUser(id) {
  if (!confirm("Delete this user and all their projects?")) return;
  try {
    await apiDeleteUser(id);
    if (selectedUserId === id) {
      selectedUserId = selectedUserName = selectedProjectId = selectedProjectTitle = null;
      currentTasks   = [];
      updateBreadcrumb(null, null);
      btnToggleProjectForm.disabled = btnToggleTaskForm.disabled = true;
      renderProjectsEmpty("Select a user to see projects.");
      renderTasksEmpty("Select a project to see tasks.");
      projectStats.hidden = true;
      if (isMobile()) {
        mobileViewStack = ["users"];
        mobileTaskDetail.hidden = true;
        mobileTaskDetail.classList.remove("mobile-active");
        _applyScreenVisibility();
        updateMobileHeader();
        updateFABs();
      }
    }
    await loadUsers();
    toast("User deleted.", "info");
  } catch (err) {
    showAlert("Delete failed: " + err.message, true);
  }
}

/* Toggle collapsible form panels (desktop only) */
function togglePanel(formEl, btnEl) {
  const nowHidden = !formEl.hidden;
  formEl.hidden   = nowHidden;
  btnEl.setAttribute("aria-expanded", String(!nowHidden));
}

btnToggleUserForm.addEventListener("click", () => togglePanel(userCreateForm, btnToggleUserForm));

btnCancelUser.addEventListener("click", () => {
  formNewUser.reset();
  uNameErr.textContent = uEmailErr.textContent = "";
  togglePanel(userCreateForm, btnToggleUserForm);
});
document.getElementById("btn-close-user-form").addEventListener("click", () => {
  formNewUser.reset();
  uNameErr.textContent = uEmailErr.textContent = "";
  togglePanel(userCreateForm, btnToggleUserForm);
});

formNewUser.addEventListener("submit", async (e) => {
  e.preventDefault();
  const okName  = validateField(uName,  uNameErr,  "Name is required.");
  const okEmail = validateField(uEmail, uEmailErr, "Email is required.");
  if (!okName || !okEmail) return;
  try {
    await apiCreateUser({ name: uName.value.trim(), email: uEmail.value.trim() });
    formNewUser.reset();
    if (isMobile()) closeMobileFormOverlay();
    else            togglePanel(userCreateForm, btnToggleUserForm);
    await loadUsers();
    toast("✦ User created successfully!", "success");
  } catch (err) {
    showAlert("Could not create user: " + err.message, true);
  }
});

/* FAB — Add User (mobile) */
fabAddUser.addEventListener("click", () => {
  const frag = document.createDocumentFragment();
  const h3   = document.createElement("h3");
  h3.textContent = "New User";
  frag.appendChild(h3);

  // Clone the form so it can appear in the overlay
  const clonedForm = formNewUser.cloneNode(true);
  clonedForm.id = "mobile-form-new-user";

  // Wire up the cloned form inputs
  const mName  = clonedForm.querySelector("#u-name");
  const mEmail = clonedForm.querySelector("#u-email");
  const mNameErr  = clonedForm.querySelector("#u-name-err");
  const mEmailErr = clonedForm.querySelector("#u-email-err");

  // Give cloned elements unique ids to avoid duplicate-id issues
  mName.id  = "m-u-name";  mName.setAttribute("aria-describedby",  "m-u-name-err");
  mEmail.id = "m-u-email"; mEmail.setAttribute("aria-describedby", "m-u-email-err");
  mNameErr.id  = "m-u-name-err";
  mEmailErr.id = "m-u-email-err";

  clonedForm.querySelector("[type=submit]").textContent = "Create User";
  clonedForm.querySelector("#btn-cancel-user")?.remove();

  clonedForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const okN = validateField(mName,  mNameErr,  "Name is required.");
    const okE = validateField(mEmail, mEmailErr, "Email is required.");
    if (!okN || !okE) return;
    try {
      await apiCreateUser({ name: mName.value.trim(), email: mEmail.value.trim() });
      closeMobileFormOverlay();
      await loadUsers();
      toast("✦ User created!", "success");
    } catch (err) {
      showAlert("Could not create user: " + err.message, true);
    }
  });

  frag.appendChild(clonedForm);
  const wrapper = document.createElement("div");
  wrapper.appendChild(frag);
  openMobileFormOverlay(wrapper);
});


/* ==========================================================================
   PANEL 2 — PROJECTS
   ========================================================================== */

function renderProjectsEmpty(msg) {
  projectListEl.innerHTML = "";
  const li = document.createElement("li");
  li.className   = "entity-empty";
  li.textContent = msg;
  projectListEl.appendChild(li);
}

function renderProjects(projects) {
  projectListEl.innerHTML = "";
  if (!projects.length) {
    renderProjectsEmpty("No projects yet. Tap + to create one.");
    return;
  }
  projects.forEach(p => projectListEl.appendChild(buildProjectCard(p)));
}

function buildProjectCard(project) {
  const li = document.createElement("li");
  li.className  = "entity-card";
  li.dataset.id = project.id;
  if (project.id === selectedProjectId) li.classList.add("is-selected");

  const info  = document.createElement("div");
  info.className = "card-info";

  const titleEl = document.createElement("span");
  titleEl.className   = "card-title";
  titleEl.textContent = project.title;
  info.appendChild(titleEl);

  if (project.description) {
    const desc = document.createElement("span");
    desc.className   = "card-sub";
    desc.textContent = project.description;
    info.appendChild(desc);
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const editBtn = document.createElement("button");
  editBtn.type      = "button";
  editBtn.className = "btn btn-secondary btn-sm card-edit";
  editBtn.textContent = "✎";
  editBtn.setAttribute("aria-label", `Edit project ${project.title}`);
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openProjectEditInline(project, li, titleEl);
  });

  const del = document.createElement("button");
  del.type      = "button";
  del.className = "btn btn-danger btn-sm card-del";
  del.textContent = "✕";
  del.setAttribute("aria-label", `Delete project ${project.title}`);
  del.addEventListener("click", (e) => { e.stopPropagation(); handleDeleteProject(project.id); });

  actions.appendChild(editBtn);
  actions.appendChild(del);

  const chevron = document.createElement("span");
  chevron.className = "card-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
    viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="9 18 15 12 9 6"></polyline></svg>`;

  li.appendChild(info);
  li.appendChild(actions);
  li.appendChild(chevron);
  li.addEventListener("click", () => selectProject(project));
  return li;
}

function openProjectEditInline(project, li, titleEl) {
  const input = document.createElement("input");
  input.type      = "text";
  input.className = "inline-edit-input";
  input.value     = project.title;

  const save   = document.createElement("button");
  save.type      = "button";
  save.className = "btn btn-primary btn-sm";
  save.textContent = "Save";

  const cancel = document.createElement("button");
  cancel.type      = "button";
  cancel.className = "btn btn-secondary btn-sm";
  cancel.textContent = "Cancel";

  const btnRow = document.createElement("div");
  btnRow.className = "inline-edit-buttons";
  btnRow.appendChild(save);
  btnRow.appendChild(cancel);

  const row = document.createElement("div");
  row.className = "inline-edit-row";
  row.appendChild(input);
  row.appendChild(btnRow);

  titleEl.replaceWith(row);
  input.focus();
  input.select();

  cancel.addEventListener("click", () => row.replaceWith(titleEl));

  save.addEventListener("click", async () => {
    const val = input.value.trim();
    if (!val) { input.setAttribute("aria-invalid", "true"); return; }
    try {
      const updated = await apiUpdateProject(project.id, { title: val });
      project.title    = updated.title;
      titleEl.textContent = updated.title;
      row.replaceWith(titleEl);
      if (selectedProjectId === project.id) {
        bcProject.textContent = updated.title;
        selectedProjectTitle  = updated.title;
        if (isMobile()) updateMobileHeader();
      }
      toast("Project updated.", "success");
    } catch (err) {
      showAlert("Update failed: " + err.message, true);
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  { e.preventDefault(); save.click(); }
    if (e.key === "Escape") { cancel.click(); }
  });
}

async function loadProjectsForUser(userId) {
  try {
    const data = await apiFetch(`/users/${userId}/projects`);
    renderProjects(data.projects);
  } catch (err) {
    showAlert("Could not load projects: " + err.message, true);
    renderProjectsEmpty("Failed to load projects.");
  }
}

async function selectProject(project) {
  selectedProjectId    = project.id;
  selectedProjectTitle = project.title;

  document.querySelectorAll("#project-list .entity-card").forEach(el =>
    el.classList.toggle("is-selected", Number(el.dataset.id) === project.id)
  );

  bcProject.textContent      = project.title;
  btnToggleTaskForm.disabled = false;

  await loadTasksForProject(project.id);
  await loadProjectStats(project.id);

  if (isMobile()) pushView("tasks");
}

async function handleDeleteProject(id) {
  if (!confirm("Delete this project and all its tasks?")) return;
  try {
    await apiDeleteProject(id);
    if (selectedProjectId === id) {
      selectedProjectId = selectedProjectTitle = null;
      currentTasks = [];
      bcProject.textContent      = bcProject.dataset.empty;
      btnToggleTaskForm.disabled = true;
      renderTasksEmpty("Select a project to see tasks.");
      projectStats.hidden = true;
      if (isMobile()) {
        // Pop back to projects screen if tasks or detail is open
        while (mobileViewStack.length > 1 &&
               ["tasks","detail"].includes(mobileViewStack[mobileViewStack.length - 1])) {
          mobileViewStack.pop();
        }
        _applyScreenVisibility();
        updateMobileHeader();
        updateFABs();
      }
    }
    if (selectedUserId) await loadProjectsForUser(selectedUserId);
    toast("Project deleted.", "info");
  } catch (err) {
    showAlert("Delete failed: " + err.message, true);
  }
}

btnToggleProjectForm.addEventListener("click", () => togglePanel(projectCreateForm, btnToggleProjectForm));

btnCancelProject.addEventListener("click", () => {
  formNewProject.reset(); pTitleErr.textContent = "";
  togglePanel(projectCreateForm, btnToggleProjectForm);
});
document.getElementById("btn-close-project-form").addEventListener("click", () => {
  formNewProject.reset(); pTitleErr.textContent = "";
  togglePanel(projectCreateForm, btnToggleProjectForm);
});

formNewProject.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateField(pTitle, pTitleErr, "Title is required.")) return;
  try {
    await apiCreateProject({
      title:       pTitle.value.trim(),
      description: pDesc.value.trim() || null,
      owner_id:    selectedUserId,
    });
    formNewProject.reset();
    if (isMobile()) closeMobileFormOverlay();
    else            togglePanel(projectCreateForm, btnToggleProjectForm);
    await loadProjectsForUser(selectedUserId);
    toast("✦ Project created successfully!", "success");
  } catch (err) {
    showAlert("Could not create project: " + err.message, true);
  }
});

/* FAB — Add Project (mobile) */
fabAddProject.addEventListener("click", () => {
  const wrapper = document.createElement("div");
  const h3 = document.createElement("h3");
  h3.textContent = "New Project";
  wrapper.appendChild(h3);

  const form = document.createElement("form");
  form.noValidate = true;
  form.innerHTML = `
    <div class="field-group">
      <label for="mob-p-title">Title *</label>
      <input type="text" id="mob-p-title" placeholder="Project title"
             autocomplete="off" aria-required="true" />
      <span class="field-error" id="mob-p-title-err" role="alert"></span>
    </div>
    <div class="field-group">
      <label for="mob-p-desc">Description</label>
      <textarea id="mob-p-desc" rows="2" placeholder="Optional description"></textarea>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">Create Project</button>
    </div>`;

  const mPTitle = form.querySelector("#mob-p-title");
  const mPTitleErr = form.querySelector("#mob-p-title-err");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateField(mPTitle, mPTitleErr, "Title is required.")) return;
    try {
      await apiCreateProject({
        title:       mPTitle.value.trim(),
        description: form.querySelector("#mob-p-desc").value.trim() || null,
        owner_id:    selectedUserId,
      });
      closeMobileFormOverlay();
      await loadProjectsForUser(selectedUserId);
      toast("✦ Project created!", "success");
    } catch (err) {
      showAlert("Could not create project: " + err.message, true);
    }
  });

  wrapper.appendChild(form);
  openMobileFormOverlay(wrapper);
});


/* ==========================================================================
   PANEL 3 — TASKS
   ========================================================================== */

function renderTasksEmpty(msg) {
  taskListEl.innerHTML = "";
  const li = document.createElement("li");
  li.className   = "entity-empty";
  li.textContent = msg;
  taskListEl.appendChild(li);
}

function renderTasks(tasks) {
  const statusVal   = filterStatus.value;
  const priorityVal = filterPriority.value;

  const visible = tasks.filter(t => {
    const okS = statusVal   === "all" || t.status   === statusVal;
    const okP = priorityVal === "all" || t.priority === priorityVal;
    return okS && okP;
  });

  const total = currentTasks.length;
  const shown = visible.length;
  if (taskCountChip) {
    taskCountChip.textContent =
      total === 0 ? "" :
      shown === total ? `${total} task${total !== 1 ? "s" : ""}` :
      `${shown} / ${total} tasks`;
    taskCountChip.hidden = total === 0;
  }

  taskListEl.innerHTML = "";
  if (!visible.length) {
    renderTasksEmpty(total === 0 ? "No tasks yet." : "No tasks match the current filters.");
    return;
  }
  visible.forEach(t => taskListEl.appendChild(buildTaskCard(t)));
}

function buildTaskCard(task) {
  const li = document.createElement("li");
  li.className        = "task-item";
  li.dataset.id       = task.id;
  li.dataset.priority = task.priority;
  li.dataset.status   = task.status;

  // Checkbox
  const checkbox = document.createElement("input");
  checkbox.type      = "checkbox";
  checkbox.className = "task-checkbox";
  checkbox.checked   = task.status === "done";
  checkbox.setAttribute("aria-label", `Mark "${task.title}" as done`);
  checkbox.addEventListener("change", async (e) => {
    e.stopPropagation();
    const newStatus = checkbox.checked ? "done" : "todo";
    try {
      const updated = await apiUpdateTask(task.id, { ...task, status: newStatus });
      currentTasks = currentTasks.map(t => (t.id === task.id ? updated : t));
      setTaskCache(selectedProjectId, currentTasks);   // ← cache after update
      renderTasks(currentTasks);
      await loadProjectStats(selectedProjectId);
    } catch (err) {
      showAlert("Could not update task: " + err.message, true);
      checkbox.checked = !checkbox.checked;
    }
  });

  const body = document.createElement("div");
  body.className = "task-body";

  const titleEl = document.createElement("p");
  titleEl.className   = "task-title";
  titleEl.textContent = task.title;
  body.appendChild(titleEl);

  if (task.description) {
    const descEl = document.createElement("p");
    descEl.className   = "task-desc";
    descEl.textContent = task.description;
    body.appendChild(descEl);
  }

  const meta = document.createElement("div");
  meta.className = "task-meta";

  const pb = document.createElement("span");
  pb.className   = `task-badge badge-priority-${task.priority}`;
  pb.textContent = task.priority;
  meta.appendChild(pb);

  const sb = document.createElement("span");
  sb.className   = `task-badge badge-status-${task.status}`;
  sb.textContent = statusLabel(task.status);
  meta.appendChild(sb);

  if (task.due_date) {
    const due = document.createElement("span");
    due.className   = "task-due";
    due.textContent = "Due: " + task.due_date;
    meta.appendChild(due);
  }

  body.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "task-actions";

  const editBtn = document.createElement("button");
  editBtn.type      = "button";
  editBtn.className = "btn btn-secondary btn-icon";
  editBtn.textContent = "Edit";
  editBtn.setAttribute("aria-label", "Edit task");
  editBtn.addEventListener("click", (e) => { e.stopPropagation(); openEditModal(task); });

  const delBtn = document.createElement("button");
  delBtn.type      = "button";
  delBtn.className = "btn btn-danger btn-icon";
  delBtn.textContent = "Delete";
  delBtn.setAttribute("aria-label", "Delete task");
  delBtn.addEventListener("click", (e) => { e.stopPropagation(); handleDeleteTask(task.id); });

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  // Mobile: tapping the body opens the detail screen
  body.addEventListener("click", () => {
    if (isMobile()) openTaskDetail(task);
  });

  // Chevron hint on mobile
  const chev = document.createElement("span");
  chev.className = "card-chevron task-chevron";
  chev.setAttribute("aria-hidden", "true");
  chev.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"
    viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="9 18 15 12 9 6"></polyline></svg>`;

  li.appendChild(checkbox);
  li.appendChild(body);
  li.appendChild(actions);
  li.appendChild(chev);
  return li;
}

async function loadTasksForProject(projectId) {
  const sort = sortBy.value || undefined;

  // ── 1. Seed from cache immediately so the list never shows blank while
  //       the network request is in flight (JSON.parse from localStorage).
  const cached = getTaskCache(projectId);
  if (cached.length) {
    currentTasks = cached;
    renderTasks(currentTasks);
  }

  // ── 2. Fetch live data from the backend.
  try {
    const live = await apiListTasks(projectId, sort);
    currentTasks = live;
    renderTasks(currentTasks);
    // ── 3. Persist the fresh list so the next load can seed from it.
    setTaskCache(projectId, currentTasks);
  } catch (err) {
    // If we already seeded from cache, leave that data visible.
    if (!cached.length) renderTasksEmpty("Failed to load tasks.");
    showAlert("Could not load tasks: " + err.message, true);
  }
}

async function loadProjectStats(projectId) {
  try {
    const stats    = await apiProjectStats(projectId);
    statTotal.textContent = `Total: ${stats.total_tasks}`;
    const byStatus = Object.fromEntries(stats.by_status.map(r => [r.status, r.count]));
    statTodo.textContent = `To Do: ${byStatus.todo ?? 0}`;
    statIp.textContent   = `In Progress: ${byStatus.in_progress ?? 0}`;
    statDone.textContent = `Done: ${byStatus.done ?? 0}`;
    projectStats.hidden  = false;
  } catch (_) {
    projectStats.hidden = true;
  }
}

/* ── Filter / sort controls ─────────────────────────────────────────────── */
filterStatus.addEventListener("change",   () => renderTasks(currentTasks));
filterPriority.addEventListener("change", () => renderTasks(currentTasks));
sortBy.addEventListener("change", async () => {
  if (selectedProjectId) await loadTasksForProject(selectedProjectId);
});

/* ── Search controls ────────────────────────────────────────────────────── */
taskSearchInput.addEventListener("input", () => {
  btnSearchClear.hidden = taskSearchInput.value.trim() === "";
});

btnSearch.addEventListener("click", async () => {
  const q = taskSearchInput.value.trim();
  if (!q) return;
  try {
    const found = await apiSearchTask(q, searchAlgo.value);
    renderTasks([found]);
    btnSearchClear.hidden = false;
    showAlert(`Found task via ${searchAlgo.value} search.`);
  } catch (err) {
    showAlert("Search: " + err.message, true);
  }
});

btnSearchClear.addEventListener("click", () => {
  taskSearchInput.value = "";
  btnSearchClear.hidden = true;
  renderTasks(currentTasks);
  hideAlert();
});

taskSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnSearch.click();
});

/* ── Desktop add-task form ──────────────────────────────────────────────── */
btnToggleTaskForm.addEventListener("click", () => togglePanel(taskCreateForm, btnToggleTaskForm));

btnCancelTask.addEventListener("click", () => {
  formNewTask.reset(); tTitleErr.textContent = "";
  togglePanel(taskCreateForm, btnToggleTaskForm);
});
document.getElementById("btn-close-task-form").addEventListener("click", () => {
  formNewTask.reset(); tTitleErr.textContent = "";
  togglePanel(taskCreateForm, btnToggleTaskForm);
});

formNewTask.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateField(tTitle, tTitleErr, "Title is required.")) return;
  try {
    const created = await apiCreateTask({
      title:       tTitle.value.trim(),
      description: tDesc.value.trim() || null,
      priority:    tPriority.value,
      due_date:    tDue.value || null,
      status:      "todo",
      project_id:  selectedProjectId,
    });
    formNewTask.reset();
    if (isMobile()) closeMobileFormOverlay();
    else { taskCreateForm.hidden = true; btnToggleTaskForm.setAttribute("aria-expanded","false"); }
    await loadTasksForProject(selectedProjectId);   // already writes cache inside
    await loadProjectStats(selectedProjectId);
    _flashNewCard(created.id);
    toast("✦ Task created successfully!", "success");
  } catch (err) {
    showAlert("Could not add task: " + err.message, true);
  }
});

function _flashNewCard(id) {
  const card = taskListEl.querySelector(`[data-id="${id}"]`);
  if (!card) return;
  card.classList.add("task-new-flash");
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  card.addEventListener("animationend", () => card.classList.remove("task-new-flash"), { once: true });
}

/* ── Quick-Add form ─────────────────────────────────────────────────────── */
formQuickAdd.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateField(qaDesc, qaDescErr, "Description is required.")) return;
  try {
    const created = await apiQuickAdd({ description: qaDesc.value.trim(), project_id: selectedProjectId });
    qaDesc.value = ""; qaDescErr.textContent = "";
    if (isMobile()) closeMobileFormOverlay();
    else { taskCreateForm.hidden = true; btnToggleTaskForm.setAttribute("aria-expanded","false"); }
    await loadTasksForProject(selectedProjectId);   // already writes cache inside
    await loadProjectStats(selectedProjectId);
    _flashNewCard(created.id);
    toast(`✦ Quick-Added: "${created.title}"`, "success");
  } catch (err) {
    showAlert("Quick-add failed: " + err.message, true);
  }
});

/* ── Delete task ────────────────────────────────────────────────────────── */
async function handleDeleteTask(id) {
  if (!confirm("Delete this task?")) return;
  try {
    await apiDeleteTask(id);
    currentTasks = currentTasks.filter(t => t.id !== id);
    setTaskCache(selectedProjectId, currentTasks);   // ← cache after delete
    renderTasks(currentTasks);
    await loadProjectStats(selectedProjectId);
    if (isMobile() && mobileCurrentTask?.id === id) {
      mobileCurrentTask = null;
      popView();
    }
    toast("Task deleted.", "info");
  } catch (err) {
    showAlert("Delete failed: " + err.message, true);
  }
}

/* ── FAB — Add Task (mobile) ────────────────────────────────────────────── */
fabAddTask.addEventListener("click", () => {
  const wrapper = document.createElement("div");
  const h3 = document.createElement("h3");
  h3.textContent = "New Task";
  wrapper.appendChild(h3);

  const form = document.createElement("form");
  form.noValidate = true;
  form.innerHTML = `
    <div class="field-group">
      <label for="mob-t-title">Title *</label>
      <input type="text" id="mob-t-title" placeholder="Task title"
             autocomplete="off" aria-required="true" />
      <span class="field-error" id="mob-t-title-err" role="alert"></span>
    </div>
    <div class="field-group">
      <label for="mob-t-desc">Description</label>
      <input type="text" id="mob-t-desc" placeholder="Optional" autocomplete="off" />
    </div>
    <div class="field-group">
      <label for="mob-t-priority">Priority</label>
      <select id="mob-t-priority">
        <option value="low">Low</option>
        <option value="medium" selected>Medium</option>
        <option value="high">High</option>
      </select>
    </div>
    <div class="field-group">
      <label for="mob-t-due">Due date</label>
      <input type="date" id="mob-t-due" />
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">Add Task</button>
    </div>`;

  const mTTitle    = form.querySelector("#mob-t-title");
  const mTTitleErr = form.querySelector("#mob-t-title-err");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateField(mTTitle, mTTitleErr, "Title is required.")) return;
    try {
      const created = await apiCreateTask({
        title:       mTTitle.value.trim(),
        description: form.querySelector("#mob-t-desc").value.trim() || null,
        priority:    form.querySelector("#mob-t-priority").value,
        due_date:    form.querySelector("#mob-t-due").value || null,
        status:      "todo",
        project_id:  selectedProjectId,
      });
      closeMobileFormOverlay();
      await loadTasksForProject(selectedProjectId);
      await loadProjectStats(selectedProjectId);
      _flashNewCard(created.id);
      toast("✦ Task created!", "success");
    } catch (err) {
      showAlert("Could not add task: " + err.message, true);
    }
  });

  wrapper.appendChild(form);
  openMobileFormOverlay(wrapper);
});

/* ==========================================================================
   TASK DETAIL SCREEN  (Screen 4 — mobile only)
   ========================================================================== */

function openTaskDetail(task) {
  mobileCurrentTask = task;

  // Populate fields
  detailTitle.textContent        = task.title;
  detailDescText.textContent     = task.description ?? "";
  detailDue.textContent          = task.due_date ?? "—";
  detailAssignedUser.textContent = selectedUserName    ?? "—";
  detailProject.textContent      = selectedProjectTitle ?? "—";

  // Priority badge
  detailPriorityBadge.textContent = task.priority;
  detailPriorityBadge.className   = `task-badge badge-priority-${task.priority}`;

  // Status badge
  detailStatusBadge.textContent = statusLabel(task.status);
  detailStatusBadge.className   = `task-badge badge-status-${task.status}`;

  // Status buttons — highlight current
  detailStatusBtns.querySelectorAll(".detail-status-btn").forEach(btn => {
    const pressed = btn.dataset.status === task.status;
    btn.setAttribute("aria-pressed", String(pressed));
  });

  // Timeline
  _buildTimeline(task);

  // Show the screen
  mobileTaskDetail.hidden = false;
  pushView("detail");
}

function _buildTimeline(task) {
  detailTimeline.innerHTML = "";

  const events = [
    { event: "Task created", time: "Just now" },
    { event: `Priority set to ${task.priority}`, time: "" },
    { event: `Status: ${statusLabel(task.status)}`, time: "" },
  ];
  if (task.due_date) events.push({ event: `Due date: ${task.due_date}`, time: "" });

  events.forEach(({ event, time }) => {
    const li = document.createElement("li");
    li.className = "timeline-item";

    const evEl = document.createElement("div");
    evEl.className   = "timeline-event";
    evEl.textContent = event;

    li.appendChild(evEl);
    if (time) {
      const tEl = document.createElement("div");
      tEl.className   = "timeline-time";
      tEl.textContent = time;
      li.appendChild(tEl);
    }
    detailTimeline.appendChild(li);
  });
}

/* Status-change buttons in detail view */
detailStatusBtns.addEventListener("click", async (e) => {
  const btn = e.target.closest(".detail-status-btn");
  if (!btn || !mobileCurrentTask) return;
  const newStatus = btn.dataset.status;
  try {
    const updated = await apiUpdateTask(mobileCurrentTask.id, { ...mobileCurrentTask, status: newStatus });
    currentTasks = currentTasks.map(t => (t.id === updated.id ? updated : t));
    setTaskCache(selectedProjectId, currentTasks);   // ← cache after status change
    mobileCurrentTask = updated;
    // Refresh badge + buttons
    detailStatusBadge.textContent = statusLabel(updated.status);
    detailStatusBadge.className   = `task-badge badge-status-${updated.status}`;
    detailStatusBtns.querySelectorAll(".detail-status-btn").forEach(b => {
      b.setAttribute("aria-pressed", String(b.dataset.status === updated.status));
    });
    renderTasks(currentTasks);
    await loadProjectStats(selectedProjectId);
    toast("Status updated.", "success");
  } catch (err) {
    showAlert("Update failed: " + err.message, true);
  }
});

/* Delete from detail view */
detailDeleteBtn.addEventListener("click", () => {
  if (mobileCurrentTask) handleDeleteTask(mobileCurrentTask.id);
});

/* ==========================================================================
   EDIT TASK MODAL  (shared desktop + mobile)
   ========================================================================== */
function openEditModal(task) {
  editTaskId.value         = task.id;
  editTitle.value          = task.title;
  editDesc.value           = task.description ?? "";
  editPriority.value       = task.priority;
  editStatus.value         = task.status;
  editDue.value            = task.due_date ?? "";
  editTitleErr.textContent = "";
  editTitle.removeAttribute("aria-invalid");
  editModal.showModal();
}

modalCloseX.addEventListener("click",   () => editModal.close());
editCancelBtn.addEventListener("click", () => editModal.close());

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateField(editTitle, editTitleErr, "Title is required.")) return;
  const id = Number(editTaskId.value);
  try {
    const updated = await apiUpdateTask(id, {
      title:       editTitle.value.trim(),
      description: editDesc.value.trim() || null,
      priority:    editPriority.value,
      status:      editStatus.value,
      due_date:    editDue.value.trim() || null,
    });
    currentTasks = currentTasks.map(t => (t.id === id ? updated : t));
    setTaskCache(selectedProjectId, currentTasks);   // ← cache after edit
    renderTasks(currentTasks);
    await loadProjectStats(selectedProjectId);
    if (mobileCurrentTask?.id === id) openTaskDetail(updated);
    editModal.close();
    toast("Task updated.", "success");
  } catch (err) {
    showAlert("Update failed: " + err.message, true);
    editModal.close();
  }
});

/* ==========================================================================
   INIT — Bootstrap the app on first load
   ========================================================================== */
(async function init() {
  applyMobileLayout();
  await loadUsers();
})();
