// RawBlock Todo, Category, Whitelist & Bot Status Client Controller
let todos = [];
let categories = [];
let whitelist = [];
let currentStatusFilter = 'all';
let currentCategoryFilter = 'all';
let searchQuery = '';
let isSubmitting = false;

function logEvent(msg) {
  const stream = document.getElementById('terminal-stream');
  if (!stream) return;
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const entry = document.createElement('div');
  entry.className = 'terminal-entry';
  entry.innerHTML = '<span class="terminal-time">[' + timeStr + ']</span> ' + escapeHtml(msg);
  stream.prepend(entry);
  while (stream.children.length > 30) {
    stream.removeChild(stream.lastChild);
  }
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = isError ? 'error' : '';
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Data Loaders
async function fetchTodos(isInitial = false) {
  try {
    const res = await fetch('/todos');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    
    const prevCount = todos.length;
    todos = Array.isArray(data) ? data : [];
    
    updateMetrics();
    renderTodoList();

    if (isInitial) {
      logEvent('SYNCHRONIZED ' + todos.length + ' TASKS WITH BACKEND');
    } else if (prevCount !== todos.length) {
      logEvent('SYNC: TOTAL TASK COUNT NOW ' + todos.length);
    }
  } catch (err) {
    console.error('Fetch todos error:', err);
    if (isInitial) {
      showToast('Failed to load tasks', true);
      logEvent('ERROR: COULD NOT REACH /todos');
    }
  }
}

async function fetchCategories() {
  try {
    const res = await fetch('/categories');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    categories = Array.isArray(data) ? data : [];
    renderCategoryUI();
  } catch (err) {
    console.error('Fetch categories error:', err);
  }
}

async function fetchWhitelist() {
  try {
    const res = await fetch('/whitelist');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    whitelist = Array.isArray(data) ? data : [];
    renderWhitelistUI();
  } catch (err) {
    console.error('Fetch whitelist error:', err);
  }
}

async function fetchBotStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const bots = data.bots || {};

    // 1. Telegram Status
    const tgChip = document.getElementById('chip-telegram');
    const tgBadge = document.getElementById('status-tg-badge');
    const tgUser = document.getElementById('status-tg-user');

    if (bots.telegram) {
      const { status, username } = bots.telegram;
      if (status === 'connected') {
        if (tgChip) {
          tgChip.className = 'chip chip-green';
          tgChip.textContent = `● TG: @${username || 'BOT'} (ONLINE)`;
        }
        if (tgBadge) tgBadge.innerHTML = '<span class="chip chip-green" style="padding: 2px 6px;">CONNECTED</span>';
        if (tgUser) tgUser.textContent = `@${username || 'connected'}`;
      } else if (status === 'not_configured') {
        if (tgChip) {
          tgChip.className = 'chip chip-muted';
          tgChip.textContent = '● TG: DISABLED';
        }
        if (tgBadge) tgBadge.innerHTML = '<span class="chip chip-muted" style="padding: 2px 6px;">NOT CONFIGURED</span>';
        if (tgUser) tgUser.textContent = 'NO TOKEN SET';
      } else if (status === 'error') {
        if (tgChip) {
          tgChip.className = 'chip chip-red';
          tgChip.textContent = '● TG: ERROR';
        }
        if (tgBadge) tgBadge.innerHTML = '<span class="chip chip-red" style="padding: 2px 6px;">ERROR</span>';
        if (tgUser) tgUser.textContent = bots.telegram.error || 'Connection Failed';
      } else {
        if (tgChip) {
          tgChip.className = 'chip chip-peach';
          tgChip.textContent = '● TG: CONNECTING...';
        }
        if (tgBadge) tgBadge.innerHTML = '<span class="chip chip-peach" style="padding: 2px 6px;">CONNECTING</span>';
        if (tgUser) tgUser.textContent = '-';
      }
    }

    // 2. Discord Status
    const discordChip = document.getElementById('chip-discord');
    const discordBadge = document.getElementById('status-discord-badge');
    const discordUser = document.getElementById('status-discord-user');

    if (bots.discord) {
      const { status, tag } = bots.discord;
      if (status === 'connected') {
        if (discordChip) {
          discordChip.className = 'chip chip-green';
          discordChip.textContent = `● DISCORD: ${tag || 'BOT'} (ONLINE)`;
        }
        if (discordBadge) discordBadge.innerHTML = '<span class="chip chip-green" style="padding: 2px 6px;">CONNECTED</span>';
        if (discordUser) discordUser.textContent = tag || 'connected';
      } else if (status === 'not_configured') {
        if (discordChip) {
          discordChip.className = 'chip chip-muted';
          discordChip.textContent = '● DISCORD: DISABLED';
        }
        if (discordBadge) discordBadge.innerHTML = '<span class="chip chip-muted" style="padding: 2px 6px;">NOT CONFIGURED</span>';
        if (discordUser) discordUser.textContent = 'NO TOKEN SET';
      } else if (status === 'error') {
        if (discordChip) {
          discordChip.className = 'chip chip-red';
          discordChip.textContent = '● DISCORD: ERROR';
        }
        if (discordBadge) discordBadge.innerHTML = '<span class="chip chip-red" style="padding: 2px 6px;">ERROR</span>';
        if (discordUser) discordUser.textContent = bots.discord.error || 'Connection Failed';
      } else {
        if (discordChip) {
          discordChip.className = 'chip chip-peach';
          discordChip.textContent = '● DISCORD: CONNECTING...';
        }
        if (discordBadge) discordBadge.innerHTML = '<span class="chip chip-peach" style="padding: 2px 6px;">CONNECTING</span>';
        if (discordUser) discordUser.textContent = '-';
      }
    }

    // 3. Overall badge
    const overallBadge = document.getElementById('bot-overall-badge');
    if (overallBadge) {
      const tgOk = bots.telegram?.status === 'connected';
      const dcOk = bots.discord?.status === 'connected';
      if (tgOk || dcOk) {
        overallBadge.style.color = 'var(--green)';
        overallBadge.textContent = '[ACTIVE]';
      } else {
        overallBadge.style.color = 'var(--peach)';
        overallBadge.textContent = '[STANDALONE]';
      }
    }

  } catch (err) {
    console.error('Fetch bot status error:', err);
  }
}

function updateMetrics() {
  const total = todos.length;
  const completed = todos.filter(t => t.completed).length;
  const pending = total - completed;
  const rate = total === 0 ? 0 : Math.round((completed / total) * 100);

  const totalEl = document.getElementById('stat-total');
  const pendingEl = document.getElementById('stat-pending');
  const completedEl = document.getElementById('stat-completed');
  const rateEl = document.getElementById('stat-rate');
  const barEl = document.getElementById('stat-bar');

  if (totalEl) totalEl.textContent = total;
  if (pendingEl) pendingEl.textContent = pending;
  if (completedEl) completedEl.textContent = completed;
  if (rateEl) rateEl.textContent = rate + '%';
  if (barEl) barEl.style.width = rate + '%';
}

function renderCategoryUI() {
  const select = document.getElementById('task-category');
  if (select) {
    const currentVal = select.value;
    select.innerHTML = categories.map(c => `
      <option value="${escapeHtml(c.name)}">${escapeHtml(c.name.toUpperCase())}</option>
    `).join('');
    if (currentVal && categories.some(c => c.name === currentVal)) {
      select.value = currentVal;
    }
  }

  const chipContainer = document.getElementById('category-filter-chips');
  if (chipContainer) {
    let chipsHtml = `
      <button class="btn btn-filter ${currentCategoryFilter === 'all' ? 'active' : ''}" onclick="setCategoryFilter('all', this)">
        ALL
      </button>
    `;
    chipsHtml += categories.map(c => `
      <button class="btn btn-filter ${currentCategoryFilter === c.name ? 'active' : ''}" onclick="setCategoryFilter('${escapeHtml(c.name)}', this)">
        ${escapeHtml(c.name.toUpperCase())} (${c.todo_count || 0})
      </button>
    `).join('');
    chipContainer.innerHTML = chipsHtml;
  }

  const tableBody = document.getElementById('category-table-body');
  if (tableBody) {
    tableBody.innerHTML = categories.map(c => `
      <tr>
        <td><strong>${escapeHtml(c.name)}</strong></td>
        <td>${c.todo_count || 0}</td>
        <td>
          ${c.name === 'general' ? '<span style="color: var(--overlay-0);">LOCK</span>' : `
            <button class="btn btn-destructive" style="padding: 2px 6px; font-size: 10px; height: 24px;" onclick="handleDeleteCategory(${c.id}, '${escapeHtml(c.name)}')">
              DEL
            </button>
          `}
        </td>
      </tr>
    `).join('');
  }
}

function renderWhitelistUI() {
  const tableBody = document.getElementById('whitelist-table-body');
  if (!tableBody) return;

  if (whitelist.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; color: var(--overlay-0);">NO USER ID WHITELIST RULES (OPEN ACCESS)</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = whitelist.map(w => {
    const isTg = w.type === 'telegram';
    const color = isTg ? 'var(--sapphire)' : 'var(--peach)';
    return `
      <tr>
        <td><span class="category-badge" style="color: ${color}; border-color: ${color};">[${escapeHtml(w.type.toUpperCase())}]</span></td>
        <td>
          <div style="font-weight: 700; font-family: 'Space Mono', monospace; font-size: 12px;">${escapeHtml(w.value)}</div>
          ${w.label ? `<div style="font-size: 10px; color: var(--subtext-0);">${escapeHtml(w.label)}</div>` : ''}
        </td>
        <td>
          <button class="btn btn-destructive" style="padding: 2px 6px; font-size: 10px; height: 24px;" onclick="handleDeleteWhitelist(${w.id}, '${escapeHtml(w.value)}')">
            DEL
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function setStatusFilter(filter, el) {
  currentStatusFilter = filter;
  document.querySelectorAll('.filter-bar .btn-filter').forEach(btn => btn.classList.remove('active'));
  if (el) el.classList.add('active');
  renderTodoList();
}

function setCategoryFilter(category, el) {
  currentCategoryFilter = category;
  document.querySelectorAll('#category-filter-chips .btn-filter').forEach(btn => btn.classList.remove('active'));
  if (el) el.classList.add('active');
  renderTodoList();
}

function handleSearch(val) {
  searchQuery = (val || '').trim().toLowerCase();
  renderTodoList();
}

function renderTodoList() {
  const container = document.getElementById('todo-container');
  if (!container) return;

  let filtered = todos.filter(t => {
    if (currentStatusFilter === 'pending' && t.completed) return false;
    if (currentStatusFilter === 'completed' && !t.completed) return false;

    if (currentCategoryFilter !== 'all') {
      const taskCat = (t.category || 'general').toLowerCase();
      if (taskCat !== currentCategoryFilter.toLowerCase()) return false;
    }

    if (searchQuery) {
      const matchTitle = t.title && t.title.toLowerCase().includes(searchQuery);
      const matchCat = t.category && t.category.toLowerCase().includes(searchQuery);
      if (!matchTitle && !matchCat) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">// NO MATCHING TASKS //</div>
        <div class="empty-desc">No tasks found for current filter. Use form above or bot command: /todo add [category] &lt;title&gt;</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(t => {
    const cat = t.category || 'general';
    return `
      <div class="todo-item ${t.completed ? 'completed' : ''}" id="todo-${t.id}">
        <div class="todo-left">
          <input
            type="checkbox"
            class="todo-checkbox"
            ${t.completed ? 'checked' : ''}
            onchange="handleToggleStatus(${t.id}, this.checked)"
            aria-label="Toggle completed"
          />
          <span class="todo-id">#${t.id}</span>
          <span class="category-badge">[${escapeHtml(cat.toUpperCase())}]</span>
          <span class="todo-title">${escapeHtml(t.title)}</span>
          <span class="todo-time">${formatDate(t.created_at)}</span>
        </div>
        <div class="todo-right">
          <button
            class="btn btn-destructive"
            onclick="handleDeleteTask(${t.id})"
            title="Delete task"
          >
            DEL
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Add Task
async function handleAddTask(e) {
  e.preventDefault();
  if (isSubmitting) return;

  const input = document.getElementById('task-input');
  const catSelect = document.getElementById('task-category');
  const title = input.value.trim();
  const category = (catSelect ? catSelect.value : 'general').trim();

  if (!title) return;

  isSubmitting = true;
  const submitBtn = document.getElementById('btn-submit');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetch('/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, category })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to add task');
    }

    const created = await res.json();
    input.value = '';
    showToast(`Created task #${created.id} [${created.category}]`);
    logEvent(`CREATED TASK #${created.id} [${created.category}]: "${created.title}"`);
    await fetchTodos();
    await fetchCategories();
    input.focus();
  } catch (err) {
    showToast(err.message, true);
    logEvent('ERROR CREATING TASK: ' + err.message);
  } finally {
    isSubmitting = false;
    if (submitBtn) submitBtn.disabled = false;
  }
}

// Category Management Handlers
async function handleAddCategory(e) {
  e.preventDefault();
  const input = document.getElementById('new-category-input');
  const name = input.value.trim().toLowerCase();
  if (!name) return;

  try {
    const res = await fetch('/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to add category');
    }

    const created = await res.json();
    input.value = '';
    showToast(`Created category "${created.name}"`);
    logEvent(`CREATED CATEGORY: "${created.name}"`);
    await fetchCategories();
  } catch (err) {
    showToast(err.message, true);
    logEvent('ERROR ADDING CATEGORY: ' + err.message);
  }
}

async function handleDeleteCategory(id, name) {
  if (name === 'general') {
    showToast('Cannot delete default "general" category', true);
    return;
  }

  if (!confirm(`Confirm deletion of category "${name}"?`)) return;

  try {
    const res = await fetch(`/categories/${id}`, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error('Delete failed');

    showToast(`Deleted category "${name}"`);
    logEvent(`DELETED CATEGORY: "${name}"`);
    if (currentCategoryFilter === name) {
      currentCategoryFilter = 'all';
    }
    await fetchCategories();
    await fetchTodos();
  } catch (err) {
    showToast('Failed to delete category', true);
    logEvent('ERROR DELETING CATEGORY: ' + err.message);
  }
}

// Whitelist Management Handlers
async function handleAddWhitelist(e) {
  e.preventDefault();
  const typeSelect = document.getElementById('whitelist-type');
  const valInput = document.getElementById('whitelist-val');
  const labelInput = document.getElementById('whitelist-label');

  const type = typeSelect ? typeSelect.value : 'telegram';
  const value = valInput.value.trim();
  const label = labelInput.value.trim();

  if (!value) return;

  try {
    const res = await fetch('/whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, value, label })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to add whitelist entry');
    }

    valInput.value = '';
    labelInput.value = '';
    showToast(`Whitelisted [${type.toUpperCase()}] ${value}`);
    logEvent(`WHITELIST ADDED: [${type.toUpperCase()}] ${value}`);
    await fetchWhitelist();
  } catch (err) {
    showToast(err.message, true);
    logEvent('ERROR ADDING TO WHITELIST: ' + err.message);
  }
}

async function handleDeleteWhitelist(id, value) {
  if (!confirm(`Remove "${value}" from whitelist?`)) return;

  try {
    const res = await fetch(`/whitelist/${id}`, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error('Delete failed');

    showToast(`Removed "${value}" from whitelist`);
    logEvent(`WHITELIST REMOVED: "${value}"`);
    await fetchWhitelist();
  } catch (err) {
    showToast('Failed to remove from whitelist', true);
    logEvent('ERROR REMOVING WHITELIST: ' + err.message);
  }
}

// Toggle & Delete Tasks
async function handleToggleStatus(id, completed) {
  try {
    const res = await fetch('/todos/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed })
    });

    if (!res.ok) throw new Error('Update failed');
    await res.json();

    const idx = todos.findIndex(t => t.id === id);
    if (idx !== -1) {
      todos[idx].completed = completed;
      updateMetrics();
      renderTodoList();
    }

    showToast(`Task #${id} ${completed ? 'completed' : 'reopened'}`);
    logEvent(`TASK #${id} ${completed ? 'COMPLETED' : 'REOPENED'}`);
  } catch (err) {
    showToast('Failed to update task #' + id, true);
    logEvent(`ERROR UPDATING TASK #${id}: ${err.message}`);
    await fetchTodos();
  }
}

async function handleDeleteTask(id) {
  if (!confirm(`CONFIRM DELETION: Task #${id}?`)) return;

  try {
    const res = await fetch('/todos/' + id, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error('Delete failed');

    todos = todos.filter(t => t.id !== id);
    updateMetrics();
    renderTodoList();

    showToast(`Deleted task #${id}`);
    logEvent(`DELETED TASK #${id}`);
    await fetchCategories();
  } catch (err) {
    showToast('Failed to delete task #' + id, true);
    logEvent(`ERROR DELETING TASK #${id}: ${err.message}`);
    await fetchTodos();
  }
}

// Global hooks
window.handleAddTask = handleAddTask;
window.handleAddCategory = handleAddCategory;
window.handleDeleteCategory = handleDeleteCategory;
window.handleAddWhitelist = handleAddWhitelist;
window.handleDeleteWhitelist = handleDeleteWhitelist;
window.handleToggleStatus = handleToggleStatus;
window.handleDeleteTask = handleDeleteTask;
window.setStatusFilter = setStatusFilter;
window.setCategoryFilter = setCategoryFilter;
window.handleSearch = handleSearch;

// Init
fetchBotStatus();
fetchCategories();
fetchWhitelist();
fetchTodos(true);

setInterval(() => {
  fetchTodos(false);
  fetchCategories();
  fetchBotStatus();
  fetchWhitelist();
}, 5000);
