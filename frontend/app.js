/* ==========================================================================
   app.js — TaskFlow three-panel UI (User → Project → Task)
   - All user-supplied text is set via textContent (never innerHTML).
   - All interactions use addEventListener (no inline onclick).
   - ORM relationships used via /users/{id}/projects and /projects/{id}/tasks.
   ========================================================================== */
"use strict";

/* ── Configuration ──────────────────────────────────────────────────────── */
const API_BASE = "http://127.0.0.1:8000";

/* ── App state ──────────────────────────────────────────────────────────── */
let selectedUserId    = null;
let selectedProjectId = null;
let currentTasks      = [];   // tasks for the selected project

/* ── DOM refs: header / alert ───────────────────────────────────────────── */
const headerStatus  = document.getElementById("header-status");
const alertBanner   = document.getElementById("alert-banner");
const alertText     = document.getElementById("alert-text");
const alertClose    = document.getElementById("alert-close");

/* ── DOM refs: breadcrumb ───────────────────────────────────────────────── */
const bcUser    = document.getElementById("bc-user");
const bcProject = document.getElementById("bc-project");

/* ── DOM refs: users panel ──────────────────────────────────────────────── */
const btnToggleUserForm  = document.getElementById("btn-toggle-user-form");
const userCreateForm     = document.getElementById("user-create-form");
const formNewUser        = document.getElementById("form-new-user");
const uName              = document.getElementById("u-name");
const uEmail             = document.getElementById("u-email");
const uNameErr           = document.getElementById("u-name-err");
const uEmailErr          = document.getElementById("u-email-err");
const btnCancelUser      = document.getElementById("btn-cancel-user");
const userListEl         = document.getElementById("user-list");

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
const editModal   = document.getElementById("edit-modal");
const editForm    = document.getElementById("edit-form");
const editTaskId  = document.getElementById("edit-task-id");
const editTitle   = document.getElementById("edit-title");
const editDesc    = document.getElementById("edit-desc");
const editPriority = document.getElementById("edit-priority");
const editStatus  = document.getElementById("edit-status");
const editDue     = document.getElementById("edit-due");
const editTitleErr = document.getElementById("edit-title-err");
const modalCloseX = document.getElementById("modal-close-x");
const editCancelBtn = document.getElementById("edit-cancel-btn");

/* ==========================================================================
   Alert banner helpers
   ========================================================================== */
function showAlert(message, isError = false) {
  alertText.textContent = message;
  alertBanner.classList.toggle("alert-error", isError);
  alertBanner.classList.toggle("alert-info", !isError);
  alertBanner.hidden = false;
  alertClose.hidden = false;   // show the ✕ only when there is an active alert
}

function hideAlert() {
  alertBanner.hidden = true;
  alertClose.hidden = true;    // hide the ✕ once the banner is gone
  alertText.textContent = "";
}

alertClose.addEventListener("click", hideAlert);

/* ==========================================================================
   Toast notifications (auto-dismiss after 3 s)
   ========================================================================== */
const toastStack = document.getElementById("toast-stack");

/**
 * Show a brief toast notification.
 * @param {string} message
 * @param {"success"|"error"|"info"} type
 */
function toast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.setAttribute("role", "status");

  const icon = { success: "✔", error: "✖", info: "ℹ" }[type] ?? "ℹ";
  const iconEl = document.createElement("span");
  iconEl.className = "toast-icon";
  iconEl.textContent = icon;

  const textEl = document.createElement("span");
  textEl.className = "toast-text";
  textEl.textContent = message;

  const closeEl = document.createElement("button");
  closeEl.className = "toast-close";
  closeEl.textContent = "✕";
  closeEl.setAttribute("aria-label", "Dismiss");
  closeEl.addEventListener("click", () => dismiss(el));

  el.appendChild(iconEl);
  el.appendChild(textEl);
  el.appendChild(closeEl);
  toastStack.appendChild(el);

  // Trigger slide-in
  requestAnimationFrame(() => el.classList.add("toast-visible"));

  // Auto-dismiss after 3 s
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
   Backend API layer — fetch wrappers
   ========================================================================== */
async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch (_) {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Users ──────────────────────────────────────────────────────────────────
const apiListUsers   = ()       => apiFetch("/users/");
const apiCreateUser  = (data)   => apiFetch("/users/", { method: "POST", body: JSON.stringify(data) });
const apiDeleteUser  = (id)     => apiFetch(`/users/${id}`, { method: "DELETE" });

// ── Projects ───────────────────────────────────────────────────────────────
const apiListProjects   = ()       => apiFetch("/projects/");
const apiCreateProject  = (data)   => apiFetch("/projects/", { method: "POST", body: JSON.stringify(data) });
const apiUpdateProject  = (id, d)  => apiFetch(`/projects/${id}`, { method: "PUT", body: JSON.stringify(d) });
const apiDeleteProject  = (id)     => apiFetch(`/projects/${id}`, { method: "DELETE" });

// ── Tasks ──────────────────────────────────────────────────────────────────
const apiListTasks   = (projectId, sort) =>
  apiFetch(`/tasks/?project_id=${projectId}${sort ? "&sort=" + sort : ""}`);
const apiSearchTask  = (title, algo) =>
  apiFetch(`/tasks/search?title=${encodeURIComponent(title)}&algo=${algo}`);
const apiCreateTask  = (data)  => apiFetch("/tasks/", { method: "POST", body: JSON.stringify(data) });
const apiUpdateTask  = (id, d) => apiFetch(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(d) });
const apiDeleteTask  = (id)    => apiFetch(`/tasks/${id}`, { method: "DELETE" });
const apiQuickAdd    = (data)  => apiFetch("/tasks/quick-add", { method: "POST", body: JSON.stringify(data) });
const apiProjectStats = (id)   => apiFetch(`/stats/projects/${id}`);


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

clearFieldError(uName,  uNameErr);
clearFieldError(uEmail, uEmailErr);
clearFieldError(pTitle, pTitleErr);
clearFieldError(tTitle, tTitleErr);
clearFieldError(editTitle, editTitleErr);

/* ==========================================================================
   Breadcrumb updater
   ========================================================================== */
function updateBreadcrumb(userName, projectTitle) {
  bcUser.textContent    = userName    ?? bcUser.dataset.empty;
  bcProject.textContent = projectTitle ?? bcProject.dataset.empty;
}

/* ==========================================================================
   PANEL 1 — USERS
   ========================================================================== */

/** Render the list of users into #user-list */
function renderUsers(users) {
  userListEl.innerHTML = "";
  if (!users.length) {
    const li = document.createElement("li");
    li.className = "entity-empty";
    li.textContent = "No users yet. Click + to create one.";
    userListEl.appendChild(li);
    return;
  }
  users.forEach(user => userListEl.appendChild(buildUserCard(user)));
}

function buildUserCard(user) {
  const li = document.createElement("li");
  li.className = "entity-card";
  li.dataset.id = user.id;
  if (user.id === selectedUserId) li.classList.add("is-selected");

  const info = document.createElement("div");
  info.className = "card-info";

  const name = document.createElement("span");
  name.className = "card-title";
  name.textContent = user.name;

  const email = document.createElement("span");
  email.className = "card-sub";
  email.textContent = user.email;

  info.appendChild(name);
  info.appendChild(email);

  const del = document.createElement("button");
  del.type = "button";
  del.className = "btn btn-danger btn-sm card-del";
  del.textContent = "✕";
  del.setAttribute("aria-label", `Delete user ${user.name}`);
  del.addEventListener("click", (e) => { e.stopPropagation(); handleDeleteUser(user.id); });

  li.appendChild(info);
  li.appendChild(del);
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
  selectedUserId    = user.id;
  selectedProjectId = null;
  currentTasks      = [];

  // Update highlight
  document.querySelectorAll("#user-list .entity-card").forEach(el =>
    el.classList.toggle("is-selected", Number(el.dataset.id) === user.id)
  );

  updateBreadcrumb(user.name, null);
  btnToggleProjectForm.disabled = false;

  // Clear tasks panel
  renderTasksEmpty("Select a project to see tasks.");
  projectStats.hidden = true;
  btnToggleTaskForm.disabled = true;
  if (!taskCreateForm.hidden) togglePanel(taskCreateForm, btnToggleTaskForm);

  await loadProjectsForUser(user.id);
}

async function handleDeleteUser(id) {
  if (!confirm("Delete this user and all their projects?")) return;
  try {
    await apiDeleteUser(id);
    if (selectedUserId === id) {
      selectedUserId = null;
      selectedProjectId = null;
      currentTasks = [];
      updateBreadcrumb(null, null);
      btnToggleProjectForm.disabled = true;
      btnToggleTaskForm.disabled = true;
      renderProjectsEmpty("Select a user to see projects.");
      renderTasksEmpty("Select a project to see tasks.");
      projectStats.hidden = true;
    }
    await loadUsers();
    toast("User deleted.", "info");
  } catch (err) {
    showAlert("Delete failed: " + err.message, true);
  }
}

/* Toggle collapsible form panels */
function togglePanel(formEl, btnEl) {
  const nowHidden = !formEl.hidden;
  formEl.hidden = nowHidden;
  btnEl.setAttribute("aria-expanded", String(!nowHidden));
}

btnToggleUserForm.addEventListener("click", () => {
  togglePanel(userCreateForm, btnToggleUserForm);
});
btnCancelUser.addEventListener("click", () => {
  formNewUser.reset();
  uNameErr.textContent = "";
  uEmailErr.textContent = "";
  togglePanel(userCreateForm, btnToggleUserForm);
});
// Close-X button at the top of the user form
document.getElementById("btn-close-user-form").addEventListener("click", () => {
  formNewUser.reset();
  uNameErr.textContent = "";
  uEmailErr.textContent = "";
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
    togglePanel(userCreateForm, btnToggleUserForm);
    await loadUsers();
    toast("✦ User created successfully!", "success");
  } catch (err) {
    showAlert("Could not create user: " + err.message, true);
  }
});


/* ==========================================================================
   PANEL 2 — PROJECTS
   ========================================================================== */

function renderProjectsEmpty(msg) {
  projectListEl.innerHTML = "";
  const li = document.createElement("li");
  li.className = "entity-empty";
  li.textContent = msg;
  projectListEl.appendChild(li);
}

function renderProjects(projects) {
  projectListEl.innerHTML = "";
  if (!projects.length) {
    renderProjectsEmpty("No projects yet. Click + to create one.");
    return;
  }
  projects.forEach(p => projectListEl.appendChild(buildProjectCard(p)));
}

function buildProjectCard(project) {
  const li = document.createElement("li");
  li.className = "entity-card";
  li.dataset.id = project.id;
  if (project.id === selectedProjectId) li.classList.add("is-selected");

  const info = document.createElement("div");
  info.className = "card-info";

  const title = document.createElement("span");
  title.className = "card-title";
  title.textContent = project.title;

  info.appendChild(title);

  if (project.description) {
    const desc = document.createElement("span");
    desc.className = "card-sub";
    desc.textContent = project.description;
    info.appendChild(desc);
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn-secondary btn-sm card-edit";
  editBtn.textContent = "✎";
  editBtn.setAttribute("aria-label", `Edit project ${project.title}`);
  editBtn.addEventListener("click", (e) => { e.stopPropagation(); openProjectEditInline(project, li, title); });

  const del = document.createElement("button");
  del.type = "button";
  del.className = "btn btn-danger btn-sm card-del";
  del.textContent = "✕";
  del.setAttribute("aria-label", `Delete project ${project.title}`);
  del.addEventListener("click", (e) => { e.stopPropagation(); handleDeleteProject(project.id); });

  actions.appendChild(editBtn);
  actions.appendChild(del);
  li.appendChild(info);
  li.appendChild(actions);
  li.addEventListener("click", () => selectProject(project));
  return li;
}

/** Inline edit: replace the title span with an input box */
function openProjectEditInline(project, li, titleEl) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "inline-edit-input";
  input.value = project.title;

  const save = document.createElement("button");
  save.type = "button";
  save.className = "btn btn-primary btn-sm";
  save.textContent = "Save";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn btn-secondary btn-sm";
  cancel.textContent = "Cancel";

  // Buttons sit in their own row so the input gets full width
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
  // Select all text so the user can start typing immediately
  input.select();

  cancel.addEventListener("click", () => row.replaceWith(titleEl));
  save.addEventListener("click", async () => {
    const val = input.value.trim();
    if (!val) { input.setAttribute("aria-invalid", "true"); return; }
    try {
      const updated = await apiUpdateProject(project.id, { title: val });
      project.title = updated.title;
      titleEl.textContent = updated.title;
      row.replaceWith(titleEl);
      if (selectedProjectId === project.id) {
        bcProject.textContent = updated.title;
      }
      toast("Project updated.", "success");
    } catch (err) {
      showAlert("Update failed: " + err.message, true);
    }
  });

  // Also save on Enter key
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  { e.preventDefault(); save.click(); }
    if (e.key === "Escape") { cancel.click(); }
  });
}

async function loadProjectsForUser(userId) {
  try {
    // Use the ORM relationship endpoint: GET /users/{id}/projects
    const userWithProjects = await apiFetch(`/users/${userId}/projects`);
    renderProjects(userWithProjects.projects);
  } catch (err) {
    showAlert("Could not load projects: " + err.message, true);
    renderProjectsEmpty("Failed to load projects.");
  }
}

async function selectProject(project) {
  selectedProjectId = project.id;

  document.querySelectorAll("#project-list .entity-card").forEach(el =>
    el.classList.toggle("is-selected", Number(el.dataset.id) === project.id)
  );

  bcProject.textContent = project.title;
  btnToggleTaskForm.disabled = false;

  await loadTasksForProject(project.id);
  await loadProjectStats(project.id);
}

async function handleDeleteProject(id) {
  if (!confirm("Delete this project and all its tasks?")) return;
  try {
    await apiDeleteProject(id);
    if (selectedProjectId === id) {
      selectedProjectId = null;
      currentTasks = [];
      bcProject.textContent = bcProject.dataset.empty;
      btnToggleTaskForm.disabled = true;
      renderTasksEmpty("Select a project to see tasks.");
      projectStats.hidden = true;
    }
    if (selectedUserId) await loadProjectsForUser(selectedUserId);
    toast("Project deleted.", "info");
  } catch (err) {
    showAlert("Delete failed: " + err.message, true);
  }
}

btnToggleProjectForm.addEventListener("click", () => {
  togglePanel(projectCreateForm, btnToggleProjectForm);
});
btnCancelProject.addEventListener("click", () => {
  formNewProject.reset();
  pTitleErr.textContent = "";
  togglePanel(projectCreateForm, btnToggleProjectForm);
});
// Close-X button at the top of the project form
document.getElementById("btn-close-project-form").addEventListener("click", () => {
  formNewProject.reset();
  pTitleErr.textContent = "";
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
    togglePanel(projectCreateForm, btnToggleProjectForm);
    await loadProjectsForUser(selectedUserId);
    toast("✦ Project created successfully!", "success");
  } catch (err) {
    showAlert("Could not create project: " + err.message, true);
  }
});


/* ==========================================================================
   PANEL 3 — TASKS
   ========================================================================== */

function statusLabel(s) {
  return { todo: "To Do", in_progress: "In Progress", done: "Done" }[s] ?? s;
}

function renderTasksEmpty(msg) {
  taskListEl.innerHTML = "";
  const li = document.createElement("li");
  li.className = "entity-empty";
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

  taskListEl.innerHTML = "";
  if (!visible.length) {
    renderTasksEmpty("No tasks match the current filters.");
    return;
  }
  visible.forEach(t => taskListEl.appendChild(buildTaskCard(t)));
}

function buildTaskCard(task) {
  const li = document.createElement("li");
  li.className = "task-item";
  li.dataset.id       = task.id;
  li.dataset.priority = task.priority;
  li.dataset.status   = task.status;

  const body = document.createElement("div");
  body.className = "task-body";

  const titleEl = document.createElement("p");
  titleEl.className = "task-title";
  titleEl.textContent = task.title;
  body.appendChild(titleEl);

  if (task.description) {
    const descEl = document.createElement("p");
    descEl.className = "task-desc";
    descEl.textContent = task.description;
    body.appendChild(descEl);
  }

  const meta = document.createElement("div");
  meta.className = "task-meta";

  const pb = document.createElement("span");
  pb.className = `task-badge badge-priority-${task.priority}`;
  pb.textContent = task.priority;
  meta.appendChild(pb);

  const sb = document.createElement("span");
  sb.className = `task-badge badge-status-${task.status}`;
  sb.textContent = statusLabel(task.status);
  meta.appendChild(sb);

  if (task.due_date) {
    const due = document.createElement("span");
    due.className = "task-due";
    due.textContent = "Due: " + task.due_date;
    meta.appendChild(due);
  }

  body.appendChild(meta);
  li.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "task-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn-secondary btn-icon";
  editBtn.textContent = "Edit";
  editBtn.setAttribute("aria-label", "Edit task");
  editBtn.addEventListener("click", () => openEditModal(task));
  actions.appendChild(editBtn);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "btn btn-danger btn-icon";
  delBtn.textContent = "Delete";
  delBtn.setAttribute("aria-label", "Delete task");
  delBtn.addEventListener("click", () => handleDeleteTask(task.id));
  actions.appendChild(delBtn);

  li.appendChild(actions);
  return li;
}

async function loadTasksForProject(projectId) {
  const sort = sortBy.value || undefined;
  try {
    // Uses the ORM relationship: tasks are fetched filtered by project_id
    // which is wired via Task.project ←→ Project.tasks back_populates
    currentTasks = await apiListTasks(projectId, sort);
    renderTasks(currentTasks);
  } catch (err) {
    showAlert("Could not load tasks: " + err.message, true);
    renderTasksEmpty("Failed to load tasks.");
  }
}

async function loadProjectStats(projectId) {
  try {
    const stats = await apiProjectStats(projectId);
    statTotal.textContent = `Total: ${stats.total_tasks}`;
    const byStatus = Object.fromEntries(stats.by_status.map(r => [r.status, r.count]));
    statTodo.textContent = `To Do: ${byStatus.todo ?? 0}`;
    statIp.textContent   = `In Progress: ${byStatus.in_progress ?? 0}`;
    statDone.textContent = `Done: ${byStatus.done ?? 0}`;
    projectStats.hidden = false;
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

// Show ✕ clear button as soon as anything is typed; hide it when box is empty
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

/* ── Add task form ──────────────────────────────────────────────────────── */
btnToggleTaskForm.addEventListener("click", () => {
  togglePanel(taskCreateForm, btnToggleTaskForm);
});
btnCancelTask.addEventListener("click", () => {
  formNewTask.reset();
  tTitleErr.textContent = "";
  togglePanel(taskCreateForm, btnToggleTaskForm);
});
// Close-X button at the top of the task form
document.getElementById("btn-close-task-form").addEventListener("click", () => {
  formNewTask.reset();
  tTitleErr.textContent = "";
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
    // Collapse the create form and reset the toggle button
    taskCreateForm.hidden = true;
    btnToggleTaskForm.setAttribute("aria-expanded", "false");

    await loadTasksForProject(selectedProjectId);
    await loadProjectStats(selectedProjectId);

    // Scroll the newly created task card into view
    const newCard = taskListEl.querySelector(`[data-id="${created.id}"]`);
    if (newCard) {
      newCard.classList.add("task-new-flash");
      newCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      newCard.addEventListener("animationend", () => newCard.classList.remove("task-new-flash"), { once: true });
    }

    toast("✦ Task created successfully!", "success");
  } catch (err) {
    showAlert("Could not add task: " + err.message, true);
  }
});

/* ── Quick-Add form ─────────────────────────────────────────────────────── */
formQuickAdd.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateField(qaDesc, qaDescErr, "Description is required.")) return;

  try {
    const created = await apiQuickAdd({
      description: qaDesc.value.trim(),
      project_id:  selectedProjectId,
    });
    qaDesc.value = "";
    qaDescErr.textContent = "";

    // Collapse the whole create form (quick-add lives inside it)
    taskCreateForm.hidden = true;
    btnToggleTaskForm.setAttribute("aria-expanded", "false");

    await loadTasksForProject(selectedProjectId);
    await loadProjectStats(selectedProjectId);

    // Scroll the new task card into view and flash it green
    const newCard = taskListEl.querySelector(`[data-id="${created.id}"]`);
    if (newCard) {
      newCard.classList.add("task-new-flash");
      newCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      newCard.addEventListener("animationend", () => newCard.classList.remove("task-new-flash"), { once: true });
    }

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
    renderTasks(currentTasks);
    await loadProjectStats(selectedProjectId);
    toast("Task deleted.", "info");
  } catch (err) {
    showAlert("Delete failed: " + err.message, true);
  }
}


/* ==========================================================================
   Edit-task modal
   ========================================================================== */
function openEditModal(task) {
  editTaskId.value        = task.id;
  editTitle.value         = task.title;
  editDesc.value          = task.description ?? "";
  editPriority.value      = task.priority;
  editStatus.value        = task.status;
  editDue.value           = task.due_date ?? "";
  editTitleErr.textContent = "";
  editTitle.removeAttribute("aria-invalid");
  editModal.showModal();
}

modalCloseX.addEventListener("click",  () => editModal.close());
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
    renderTasks(currentTasks);
    await loadProjectStats(selectedProjectId);
    editModal.close();
    toast("Task updated.", "success");
  } catch (err) {
    showAlert("Update failed: " + err.message, true);
    editModal.close();
  }
});

/* ==========================================================================
   Bootstrap — run once the DOM is ready
   ========================================================================== */
async function bootstrap() {
  headerStatus.textContent = "Connecting…";
  try {
    await apiFetch("/");   // health-check
    headerStatus.textContent = "Connected";
    setTimeout(() => { headerStatus.textContent = ""; }, 2000);
  } catch (_) {
    headerStatus.textContent = "Backend unavailable";
    showAlert("Cannot reach the backend at " + API_BASE + ". Is it running?", true);
  }
  await loadUsers();
}

document.addEventListener("DOMContentLoaded", bootstrap);
