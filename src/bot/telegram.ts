import { Bot, InlineKeyboard, Keyboard, type Context } from "grammy";
import {
  listTodos,
  addTodo,
  updateTodo,
  updateTodoStatus,
  deleteTodo,
  getTodoStats,
  type TodoItem,
} from "../modules/todo";
import {
  listCategories,
  addCategory,
  deleteCategory,
  type CategoryWithCount,
} from "../modules/category";
import { isUserWhitelisted } from "../modules/whitelist";

const HELP_TEXT =
  "📋 *Todo List & Management Bot*\n\n" +
  "*Todo Commands:*\n" +
  "/todo (or /todo list [category]) - List todos with interactive buttons (Public)\n" +
  "/todo add [category] <title> - Add todo (Whitelist required)\n" +
  "/todo done <id> - Mark as completed (Whitelist required)\n" +
  "/todo undone <id> - Mark as incomplete (Whitelist required)\n" +
  "/todo del <id> - Delete a todo (Whitelist required)\n" +
  "/todo stats - View analytics dashboard (Public)\n" +
  "/todo clear [count] - Clear chat messages (Whitelist required)\n\n" +
  "*Category Commands:*\n" +
  "/todo category (or list) - List categories (Public)\n" +
  "/todo category add <name> - Add category (Whitelist required)\n" +
  "/todo category del <name|id> - Delete category (Whitelist required)\n\n" +
  "/todo help - Show this help message";

export function getPersistentKeyboard(): Keyboard {
  return new Keyboard()
    .text("📋 Tasks")
    .text("➕ Add Task")
    .row()
    .text("📁 Categories")
    .text("📊 Stats")
    .row()
    .text("🧹 Clear Chat")
    .text("❓ Help")
    .resized()
    .persistent();
}

function renderProgressBar(percentage: number, length: number = 10): string {
  const filled = Math.min(Math.max(Math.round((percentage / 100) * length), 0), length);
  const empty = length - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

async function checkWhitelist(ctx: Context, isCallback = false): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId) return false;
  const allowed = await isUserWhitelisted("telegram", userId);
  if (!allowed) {
    if (isCallback || ctx.callbackQuery) {
      try {
        await ctx.answerCallbackQuery({
          text: `⛔ Access Denied\nYour ID: ${userId}\nWhitelist required.`,
          show_alert: true,
        });
      } catch {}
    } else {
      await ctx.reply(
        `⛔ *Access Denied*\n\nYour Telegram User ID is \`${userId}\`.\nYou must be whitelisted via the web dashboard to make changes.`,
        { parse_mode: "Markdown" }
      );
    }
    return false;
  }
  return true;
}

function parseTitleAndCategory(rawInput: string): { title: string; category: string } {
  const text = rawInput.trim();
  const bracketMatch = text.match(/^\[([a-zA-Z0-9_-]+)\]\s+(.+)$/);
  if (bracketMatch) {
    return { category: bracketMatch[1].toLowerCase(), title: bracketMatch[2].trim() };
  }
  const colonMatch = text.match(/^([a-zA-Z0-9_-]+):\s+(.+)$/);
  if (colonMatch) {
    return { category: colonMatch[1].toLowerCase(), title: colonMatch[2].trim() };
  }
  const flagMatch = text.match(/^(.+?)\s+(?:-c|--category)\s+([a-zA-Z0-9_-]+)$/);
  if (flagMatch) {
    return { category: flagMatch[2].toLowerCase(), title: flagMatch[1].trim() };
  }
  return { category: "general", title: text };
}

interface ViewOptions {
  page?: number;
  status?: "all" | "pending" | "completed";
  category?: string;
}

function buildTodoKeyboard(
  allItems: TodoItem[],
  categories: CategoryWithCount[],
  options: ViewOptions = {}
): { text: string; keyboard: InlineKeyboard } {
  const page = options.page || 0;
  const status = options.status || "all";
  const category = (options.category || "all").toLowerCase();
  const pageSize = 5;

  const total = allItems.length;
  const pendingCount = allItems.filter((t) => !t.completed).length;
  const completedCount = total - pendingCount;

  let filtered = allItems;
  if (category !== "all") {
    filtered = filtered.filter(
      (t) => (t.category || "general").toLowerCase() === category
    );
  }
  if (status === "pending") {
    filtered = filtered.filter((t) => !t.completed);
  } else if (status === "completed") {
    filtered = filtered.filter((t) => t.completed);
  }

  const totalPages = Math.max(Math.ceil(filtered.length / pageSize), 1);
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const pageItems = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const kb = new InlineKeyboard();

  // Row 0: Category filter chips
  kb.text(`${category === "all" ? "🏷️ All" : "All"}`, `v:p:0:s:${status}:c:all`);
  const topCats = categories.slice(0, 3);
  for (const c of topCats) {
    const isSelected = category === c.name.toLowerCase();
    kb.text(`${isSelected ? "● " : ""}${c.name}`, `v:p:0:s:${status}:c:${c.name}`);
  }
  kb.row();

  // Row 1: Status filter tabs
  kb.text(`${status === "all" ? "● " : ""}All (${total})`, `v:p:${safePage}:s:all:c:${category}`)
    .text(
      `${status === "pending" ? "● " : ""}Pending (${pendingCount})`,
      `v:p:${safePage}:s:pending:c:${category}`
    )
    .text(
      `${status === "completed" ? "● " : ""}Done (${completedCount})`,
      `v:p:${safePage}:s:completed:c:${category}`
    )
    .row();

  // Task rows: Toggle + Manage Settings + Quick Delete
  for (const t of pageItems) {
    const icon = t.completed ? "✅" : "⬜";
    const shortTitle = t.title.length > 14 ? t.title.slice(0, 12) + "…" : t.title;
    kb.text(
      `${icon} #${t.id} ${shortTitle}`,
      `toggle:${t.id}:p:${safePage}:s:${status}:c:${category}`
    )
      .text(`⚙️`, `det:${t.id}:p:${safePage}:s:${status}:c:${category}`)
      .text(`🗑️`, `del:${t.id}:p:${safePage}:s:${status}:c:${category}`)
      .row();
  }

  // Pagination row if needed
  if (totalPages > 1) {
    if (safePage > 0) {
      kb.text("◀ Prev", `v:p:${safePage - 1}:s:${status}:c:${category}`);
    } else {
      kb.text("·", "noop");
    }
    kb.text(`${safePage + 1}/${totalPages}`, "noop");
    if (safePage < totalPages - 1) {
      kb.text("Next ▶", `v:p:${safePage + 1}:s:${status}:c:${category}`);
    } else {
      kb.text("·", "noop");
    }
    kb.row();
  }

  // Action Bar
  kb.text("➕ Add", "prompt_add")
    .text("📊 Stats", "stats")
    .text("📁 Cats", "cats")
    .text("🔄", `v:p:${safePage}:s:${status}:c:${category}`)
    .row()
    .text("🧹 Clear Chat", "clear_confirm");

  let text = "";
  if (filtered.length === 0) {
    const filterDesc = category !== "all" ? ` in category [${category.toUpperCase()}]` : "";
    text = `📋 *Todo Manifest*\n_No ${
      status === "all" ? "" : status + " "
    }tasks found${filterDesc}._\nTap *➕ Add* below to create one.`;
  } else {
    const catLabel = category !== "all" ? ` [${category.toUpperCase()}]` : "";
    const statusLabel = status !== "all" ? ` (${status.toUpperCase()})` : "";
    const lines = pageItems.map(
      (t) => `${t.completed ? "✅" : "⬜"} *#${t.id}* [${t.category}] ${t.title}`
    );
    text = `📋 *Todos${catLabel}${statusLabel}* (Page ${safePage + 1}/${totalPages}):\n\n${lines.join(
      "\n"
    )}`;
  }

  return { text, keyboard: kb };
}

// Render or update todo list with interactive buttons
async function renderUpdatedTodoList(ctx: Context, options: ViewOptions = {}) {
  try {
    const [items, cats] = await Promise.all([listTodos(), listCategories()]);
    const { text, keyboard } = buildTodoKeyboard(items, cats, options);

    if (ctx.callbackQuery?.message) {
      try {
        return await ctx.editMessageText(text, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      } catch {
        return;
      }
    }
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
  } catch (err: any) {
    console.error("Telegram list error:", err);
    if (!ctx.callbackQuery) {
      await ctx.reply(`Error fetching todos: ${err.message}`);
    }
  }
}

// Render individual task details and management card
async function renderTaskDetails(
  ctx: Context,
  id: number,
  page: number,
  status: "all" | "pending" | "completed",
  category: string
) {
  const items = await listTodos();
  const task = items.find((t) => t.id === id);
  if (!task) {
    return await renderUpdatedTodoList(ctx, { page, status, category });
  }

  const createdStr = new Date(task.created_at).toLocaleString();
  const text =
    `📋 *Task #${task.id} Details*\n\n` +
    `• *Title:* ${task.title}\n` +
    `• *Category:* \`[${task.category}]\`\n` +
    `• *Status:* ${task.completed ? "✅ Completed" : "⏳ Pending"}\n` +
    `• *Created:* ${createdStr}`;

  const kb = new InlineKeyboard()
    .text(
      task.completed ? "⬜ Reopen Task" : "✅ Mark Completed",
      `toggle:${task.id}:p:${page}:s:${status}:c:${category}`
    )
    .row()
    .text("🏷️ Move Category", `mov:${task.id}:p:${page}:s:${status}:c:${category}`)
    .text("🗑️ Delete", `del:${task.id}:p:${page}:s:${status}:c:${category}`)
    .row()
    .text("◀ Back to Tasks", `v:p:${page}:s:${status}:c:${category}`);

  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
    } catch {}
  } else {
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
  }
}

// Render interactive category selector for moving a task
async function renderMoveCategoryMenu(
  ctx: Context,
  id: number,
  page: number,
  status: "all" | "pending" | "completed",
  category: string
) {
  const items = await listTodos();
  const task = items.find((t) => t.id === id);
  if (!task) return;

  const cats = await listCategories();
  const kb = new InlineKeyboard();

  for (let i = 0; i < cats.length; i++) {
    const c = cats[i];
    const isCurrent = task.category.toLowerCase() === c.name.toLowerCase();
    kb.text(
      `${isCurrent ? "● " : ""}${c.name}`,
      `setc:${id}:${c.name}:p:${page}:s:${status}:c:${category}`
    );
    if (i % 2 === 1) kb.row();
  }
  if (cats.length % 2 === 1) kb.row();

  kb.text("◀ Back to Task", `det:${id}:p:${page}:s:${status}:c:${category}`);

  const text =
    `🏷️ *Move Task #${task.id}*\n\n` +
    `Title: "${task.title}"\n` +
    `Current: \`[${task.category}]\`\n\n` +
    `_Tap a category below to reassign:_`;

  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
    } catch {}
  } else {
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
  }
}

// Visual Analytics & KPI Dashboard
async function handleStats(ctx: Context, isCallback = false) {
  try {
    const stats = await getTodoStats();
    const bar = renderProgressBar(stats.completionRate, 10);

    let catLines = "";
    const catEntries = Object.entries(stats.categoryCounts);
    if (catEntries.length > 0) {
      catLines =
        "\n\n*Categories:*\n" +
        catEntries.map(([name, count]) => `• \`${name}\`: ${count} tasks`).join("\n");
    }

    const text =
      `📊 *Todo Analytics Dashboard*\n\n` +
      `*Progress:* \`[${bar}] ${stats.completionRate}%\`\n\n` +
      `• *Total Tasks:* ${stats.total}\n` +
      `• *Completed:* ${stats.completed} ✅\n` +
      `• *Pending:* ${stats.pending} ⏳${catLines}`;

    const kb = new InlineKeyboard()
      .text("📋 All Tasks", "v:p:0:s:all:c:all")
      .text("⏳ Pending Only", "v:p:0:s:pending:c:all")
      .row()
      .text("➕ Add Task", "prompt_add")
      .text("📁 Categories", "cats")
      .text("🔄 Refresh Stats", "stats");

    if (isCallback && ctx.callbackQuery?.message) {
      try {
        await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
      } catch {}
      return;
    }
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
  } catch (err: any) {
    console.error("Telegram stats error:", err);
    await ctx.reply(`Error generating stats: ${err.message}`);
  }
}

// Categories Explorer view
async function handleCategoryInteractive(ctx: Context, isCallback = false) {
  try {
    const cats = await listCategories();
    const kb = new InlineKeyboard();

    for (let i = 0; i < cats.length; i++) {
      const c = cats[i];
      kb.text(`📂 ${c.name} (${c.todo_count})`, `v:p:0:s:all:c:${c.name}`);
      if (i % 2 === 1) kb.row();
    }
    if (cats.length % 2 === 1) kb.row();

    kb.text("➕ Add Category", "prompt_add_cat")
      .text("📋 All Tasks", "v:p:0:s:all:c:all")
      .row()
      .text("🔄 Refresh", "cats");

    const lines = cats.map((c) => `• *${c.name}* — ${c.todo_count} tasks`);
    const text = `📁 *Categories Explorer*\n_Tap any category to filter tasks:_\n\n${lines.join(
      "\n"
    )}`;

    if (isCallback && ctx.callbackQuery?.message) {
      try {
        await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
      } catch {}
      return;
    }
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
  } catch (err: any) {
    console.error("Telegram categories error:", err);
    await ctx.reply(`Error listing categories: ${err.message}`);
  }
}

// Public: List todos (Allowed for everyone)
async function handleList(ctx: Context, categoryFilter?: string) {
  await renderUpdatedTodoList(ctx, { category: categoryFilter || "all" });
}

// Protected: Add todo prompt
async function handlePromptAdd(ctx: Context) {
  if (!(await checkWhitelist(ctx, Boolean(ctx.callbackQuery)))) return;
  const cats = await listCategories();
  const kb = new InlineKeyboard();
  for (let i = 0; i < cats.length && i < 6; i++) {
    kb.text(`📂 ${cats[i].name}`, `cat_pick:${cats[i].name}`);
    if (i % 2 === 1) kb.row();
  }

  const msg =
    `➕ *Create New Task*\n\n` +
    `Reply to this message with your task title:\n` +
    `• \`Buy groceries\` (general)\n` +
    `• \`[work] Finish presentation\`\n` +
    `• \`urgent: Fix server bug\`\n\n` +
    `Or tap a category below:`;

  await ctx.reply(msg, {
    parse_mode: "Markdown",
    reply_markup: {
      force_reply: true,
      input_field_placeholder: "e.g. [work] Finish report",
    },
  });
}

// Protected: Add category prompt
async function handlePromptAddCategory(ctx: Context) {
  if (!(await checkWhitelist(ctx, Boolean(ctx.callbackQuery)))) return;
  await ctx.reply(
    `📁 *Create New Category*\n\nReply directly to this message with category name:\nExample: \`finance\` or \`shopping\``,
    {
      parse_mode: "Markdown",
      reply_markup: {
        force_reply: true,
        input_field_placeholder: "e.g. finance",
      },
    }
  );
}

// Protected: Add todo (Whitelist required)
async function handleAdd(ctx: Context, rawText: string) {
  if (!(await checkWhitelist(ctx))) return;

  if (!rawText) {
    return await handlePromptAdd(ctx);
  }
  try {
    const { title, category } = parseTitleAndCategory(rawText);
    const item = await addTodo(title, category);
    const kb = new InlineKeyboard()
      .text(`✅ Done #${item.id}`, `done:${item.id}`)
      .text(`⚙️ Manage`, `det:${item.id}:p:0:s:all:c:all`)
      .row()
      .text("📋 View Tasks", "v:p:0:s:all:c:all")
      .text("➕ Add Another", "prompt_add");

    await ctx.reply(`Added todo #${item.id} [${item.category}]: "${item.title}"`, {
      reply_markup: kb,
    });
  } catch (err: any) {
    console.error("Telegram add error:", err);
    await ctx.reply(`Error adding todo: ${err.message}`);
  }
}

// Protected: Complete todo (Whitelist required)
async function handleDone(ctx: Context, idStr: string) {
  if (!(await checkWhitelist(ctx))) return;

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return await ctx.reply("Usage: /todo done <id>");
  }
  try {
    const item = await updateTodoStatus(id, true);
    if (!item) {
      return await ctx.reply(`Todo #${id} not found.`);
    }
    await ctx.reply(`Marked #${item.id} [${item.category}] as completed ✅`);
  } catch (err: any) {
    console.error("Telegram done error:", err);
    await ctx.reply(`Error updating todo: ${err.message}`);
  }
}

// Protected: Reopen todo (Whitelist required)
async function handleUndone(ctx: Context, idStr: string) {
  if (!(await checkWhitelist(ctx))) return;

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return await ctx.reply("Usage: /todo undone <id>");
  }
  try {
    const item = await updateTodoStatus(id, false);
    if (!item) {
      return await ctx.reply(`Todo #${id} not found.`);
    }
    await ctx.reply(`Marked #${item.id} [${item.category}] as incomplete ⬜`);
  } catch (err: any) {
    console.error("Telegram undone error:", err);
    await ctx.reply(`Error updating todo: ${err.message}`);
  }
}

// Protected: Delete todo (Whitelist required)
async function handleDelete(ctx: Context, idStr: string) {
  if (!(await checkWhitelist(ctx))) return;

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return await ctx.reply("Usage: /todo del <id>");
  }
  try {
    const ok = await deleteTodo(id);
    if (!ok) {
      return await ctx.reply(`Todo #${id} not found.`);
    }
    await ctx.reply(`Deleted todo #${id} 🗑️`);
  } catch (err: any) {
    console.error("Telegram del error:", err);
    await ctx.reply(`Error deleting todo: ${err.message}`);
  }
}

// Protected: Clear chat prompt
async function handleClearPrompt(ctx: Context) {
  if (!(await checkWhitelist(ctx, Boolean(ctx.callbackQuery)))) return;
  const kb = new InlineKeyboard()
    .text("🧹 Yes, Delete 30 Messages", "clear_execute")
    .text("❌ Cancel", "clear_cancel");
  await ctx.reply(
    "⚠️ *Confirm Clear Chat*\nAre you sure you want to delete the last 30 messages in this chat?",
    {
      parse_mode: "Markdown",
      reply_markup: kb,
    }
  );
}

// Protected: Clear chat messages (Whitelist required)
async function handleClear(ctx: Context, countStr?: string) {
  if (!(await checkWhitelist(ctx))) return;

  const count = Math.min(Math.max(parseInt(countStr || "30", 10) || 30, 1), 100);
  const chatId = ctx.chat?.id;
  const currentId = ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;
  if (!chatId || !currentId) return;

  const ids: number[] = [];
  for (let i = 0; i <= count; i++) {
    if (currentId - i > 0) ids.push(currentId - i);
  }

  let deleted = 0;
  try {
    await ctx.api.deleteMessages(chatId, ids);
    deleted = ids.length;
  } catch {
    for (const id of ids) {
      try {
        await ctx.api.deleteMessage(chatId, id);
        deleted++;
      } catch {
        // Ignore individual delete failures
      }
    }
  }

  try {
    const notify = await ctx.reply(`🧹 Cleared ${deleted} messages.`);
    setTimeout(async () => {
      try {
        await ctx.api.deleteMessage(chatId, notify.message_id);
      } catch {}
    }, 3500);
  } catch {}
}

// Categories command handler
async function handleCategoryCommand(ctx: Context, rawArgs: string) {
  const [sub, ...rest] = (rawArgs || "").trim().split(/\s+/);
  const subCmd = sub ? sub.toLowerCase() : "";
  const val = rest.join(" ").trim();

  // Public: List categories
  if (!subCmd || subCmd === "list" || subCmd === "ls") {
    return await handleCategoryInteractive(ctx);
  }

  // Protected: Add category
  if (subCmd === "add") {
    if (!(await checkWhitelist(ctx))) return;
    if (!val) {
      return await handlePromptAddCategory(ctx);
    }
    try {
      const cat = await addCategory(val);
      const kb = new InlineKeyboard()
        .text(`📂 View [${cat.name}]`, `v:p:0:s:all:c:${cat.name}`)
        .text("📁 All Categories", "cats");
      return await ctx.reply(`Added category *#${cat.id}*: "${cat.name}"`, {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
    } catch (err: any) {
      return await ctx.reply(`Error adding category: ${err.message}`);
    }
  }

  // Protected: Delete category
  if (subCmd === "del" || subCmd === "delete" || subCmd === "rm") {
    if (!(await checkWhitelist(ctx))) return;
    if (!val) {
      return await ctx.reply("Usage: /todo category del <name|id>");
    }
    try {
      const ok = await deleteCategory(val);
      if (!ok) {
        return await ctx.reply(`Cannot delete category "${val}" (not found or protected "general").`);
      }
      return await ctx.reply(`Deleted category "${val}" 🗑️`);
    } catch (err: any) {
      return await ctx.reply(`Error deleting category: ${err.message}`);
    }
  }

  return await ctx.reply(
    `Unknown category action: "${subCmd}".\nUsage:\n/todo category (or list)\n/todo category add <name>\n/todo category del <name|id>`,
    { parse_mode: "Markdown" }
  );
}

// Help message handler
async function handleHelp(ctx: Context) {
  const userId = ctx.from?.id;
  const isWhitelisted = userId ? await isUserWhitelisted("telegram", userId) : false;
  const statusText = `\n\n🆔 *Your Telegram User ID:* \`${userId}\` (${
    isWhitelisted ? "✅ Whitelisted" : "❌ Not Whitelisted"
  })`;
  const kb = new InlineKeyboard()
    .text("📋 View Tasks", "v:p:0:s:all:c:all")
    .text("➕ Add Task", "prompt_add")
    .row()
    .text("📁 Categories", "cats")
    .text("📊 Stats", "stats")
    .row()
    .text("🧹 Clear Chat", "clear_confirm");
  await ctx.reply(HELP_TEXT + statusText, {
    parse_mode: "Markdown",
    reply_markup: kb,
  });
}

export function createTelegramBot(token: string) {
  const bot = new Bot(token);

  // Persistent keyboard triggers via bot.hears
  bot.hears("📋 Tasks", (ctx) => handleList(ctx));
  bot.hears("➕ Add Task", (ctx) => handlePromptAdd(ctx));
  bot.hears("📁 Categories", (ctx) => handleCategoryInteractive(ctx));
  bot.hears("📊 Stats", (ctx) => handleStats(ctx));
  bot.hears("🧹 Clear Chat", (ctx) => handleClearPrompt(ctx));
  bot.hears("❓ Help", (ctx) => handleHelp(ctx));

  // Start command attaches persistent keyboard and renders tasks
  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    const isWhitelisted = userId ? await isUserWhitelisted("telegram", userId) : false;
    const welcome =
      `👋 *Welcome to Katzu Todo Bot!*\n\n` +
      `Manage your tasks with live buttons or fast commands.\n` +
      `Persistent quick-actions are docked below.\n\n` +
      `🆔 *Your User ID:* \`${userId}\` (${isWhitelisted ? "✅ Whitelisted" : "❌ Not Whitelisted"})\n` +
      `_Whitelist access managed via web dashboard._`;

    await ctx.reply(welcome, {
      parse_mode: "Markdown",
      reply_markup: getPersistentKeyboard(),
    });
    await renderUpdatedTodoList(ctx);
  });

  // Help command
  bot.command("help", (ctx) => handleHelp(ctx));

  // Stats command
  bot.command(["stats", "analytics"], (ctx) => handleStats(ctx));

  // Category command
  bot.command(["category", "cat"], async (ctx) => {
    await handleCategoryCommand(ctx, ctx.match || "");
  });

  // Task & Todo command
  bot.command(["task", "tasks", "todo", "todos"], async (ctx) => {
    const match = (ctx.match || "").trim();
    if (!match) {
      return await handleList(ctx); // Public
    }

    const [subcommand, ...rest] = match.split(/\s+/);
    const sub = subcommand.toLowerCase();
    const restText = rest.join(" ").trim();

    if (sub === "list" || sub === "ls") {
      return await handleList(ctx, restText || undefined); // Public
    } else if (sub === "help") {
      return await handleHelp(ctx);
    } else if (sub === "stats" || sub === "analytics") {
      return await handleStats(ctx);
    } else if (sub === "category" || sub === "cat") {
      return await handleCategoryCommand(ctx, restText);
    } else if (sub === "add") {
      return await handleAdd(ctx, restText); // Protected
    } else if (sub === "done") {
      return await handleDone(ctx, restText); // Protected
    } else if (sub === "undone") {
      return await handleUndone(ctx, restText); // Protected
    } else if (sub === "del" || sub === "delete" || sub === "rm") {
      return await handleDelete(ctx, restText); // Protected
    } else if (sub === "clear" || sub === "clearchat" || sub === "purge") {
      return await handleClear(ctx, restText); // Protected
    } else {
      return await ctx.reply(
        `Unknown subcommand: "${subcommand}".\n\n${HELP_TEXT}`,
        { parse_mode: "Markdown" }
      );
    }
  });

  // Interactive buttons callback handler
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data === "noop") {
      return await ctx.answerCallbackQuery();
    }

    // View navigation: v:p:<page>:s:<status>:c:<category>
    if (data.startsWith("v:")) {
      const match = data.match(/^v:p:(\d+):s:(all|pending|completed):c:([a-zA-Z0-9_-]+)$/);
      if (match) {
        const page = parseInt(match[1], 10);
        const status = match[2] as "all" | "pending" | "completed";
        const category = match[3];
        await ctx.answerCallbackQuery();
        return await renderUpdatedTodoList(ctx, { page, status, category });
      }
    }

    // Toggle done/undone: toggle:<id>:p:<page>:s:<status>:c:<category>
    if (data.startsWith("toggle:")) {
      if (!(await checkWhitelist(ctx, true))) return;
      const match = data.match(/^toggle:(\d+):p:(\d+):s:(all|pending|completed):c:([a-zA-Z0-9_-]+)$/);
      if (match) {
        const id = parseInt(match[1], 10);
        const page = parseInt(match[2], 10);
        const status = match[3] as "all" | "pending" | "completed";
        const category = match[4];

        const todos = await listTodos();
        const found = todos.find((t) => t.id === id);
        const newCompleted = found ? !found.completed : true;
        await updateTodoStatus(id, newCompleted);
        await ctx.answerCallbackQuery({
          text: newCompleted ? `Marked #${id} as completed ✅` : `Reopened #${id} ⬜`,
        });
        return await renderUpdatedTodoList(ctx, { page, status, category });
      }
    }

    // Task details card: det:<id>:p:<page>:s:<status>:c:<category>
    if (data.startsWith("det:")) {
      const match = data.match(/^det:(\d+):p:(\d+):s:(all|pending|completed):c:([a-zA-Z0-9_-]+)$/);
      if (match) {
        const id = parseInt(match[1], 10);
        const page = parseInt(match[2], 10);
        const status = match[3] as "all" | "pending" | "completed";
        const category = match[4];
        await ctx.answerCallbackQuery();
        return await renderTaskDetails(ctx, id, page, status, category);
      }
    }

    // Move task category selector: mov:<id>:p:<page>:s:<status>:c:<category>
    if (data.startsWith("mov:")) {
      if (!(await checkWhitelist(ctx, true))) return;
      const match = data.match(/^mov:(\d+):p:(\d+):s:(all|pending|completed):c:([a-zA-Z0-9_-]+)$/);
      if (match) {
        const id = parseInt(match[1], 10);
        const page = parseInt(match[2], 10);
        const status = match[3] as "all" | "pending" | "completed";
        const category = match[4];
        await ctx.answerCallbackQuery();
        return await renderMoveCategoryMenu(ctx, id, page, status, category);
      }
    }

    // Reassign task category: setc:<id>:<newCat>:p:<page>:s:<status>:c:<category>
    if (data.startsWith("setc:")) {
      if (!(await checkWhitelist(ctx, true))) return;
      const match = data.match(/^setc:(\d+):([a-zA-Z0-9_-]+):p:(\d+):s:(all|pending|completed):c:([a-zA-Z0-9_-]+)$/);
      if (match) {
        const id = parseInt(match[1], 10);
        const newCat = match[2];
        const page = parseInt(match[3], 10);
        const status = match[4] as "all" | "pending" | "completed";
        const category = match[5];

        await updateTodo(id, { category: newCat });
        await ctx.answerCallbackQuery({ text: `Moved #${id} to [${newCat}] 🏷️` });
        return await renderTaskDetails(ctx, id, page, status, category);
      }
    }

    // Delete task: del:<id>:p:<page>:s:<status>:c:<category> or simple del:<id>
    if (data.startsWith("del:")) {
      if (!(await checkWhitelist(ctx, true))) return;
      const match = data.match(/^del:(\d+)(?::p:(\d+):s:(all|pending|completed):c:([a-zA-Z0-9_-]+))?$/);
      if (match) {
        const id = parseInt(match[1], 10);
        const page = match[2] ? parseInt(match[2], 10) : 0;
        const status = (match[3] as "all" | "pending" | "completed") || "all";
        const category = match[4] || "all";

        await deleteTodo(id);
        await ctx.answerCallbackQuery({ text: `Deleted #${id} 🗑️` });
        return await renderUpdatedTodoList(ctx, { page, status, category });
      }
    }

    // Done single task from add confirmation
    if (data.startsWith("done:")) {
      if (!(await checkWhitelist(ctx, true))) return;
      const id = parseInt(data.replace("done:", ""), 10);
      await updateTodoStatus(id, true);
      await ctx.answerCallbackQuery({ text: `Marked #${id} as completed ✅` });
      return await renderUpdatedTodoList(ctx);
    }

    if (data === "refresh") {
      await ctx.answerCallbackQuery({ text: "Refreshed!" });
      return await renderUpdatedTodoList(ctx);
    }

    if (data === "stats") {
      await ctx.answerCallbackQuery();
      return await handleStats(ctx, true);
    }

    if (data === "cats") {
      await ctx.answerCallbackQuery();
      return await handleCategoryInteractive(ctx, true);
    }

    if (data === "prompt_add_cat") {
      if (!(await checkWhitelist(ctx, true))) return;
      await ctx.answerCallbackQuery();
      return await handlePromptAddCategory(ctx);
    }

    // Clear chat confirmation
    if (data === "clear_confirm") {
      if (!(await checkWhitelist(ctx, true))) return;
      await ctx.answerCallbackQuery();
      const kb = new InlineKeyboard()
        .text("🧹 Yes, Delete 30 Messages", "clear_execute")
        .text("❌ Cancel", "clear_cancel");
      return await ctx.reply(
        "⚠️ *Confirm Clear Chat*\nAre you sure you want to delete the last 30 messages in this chat?",
        {
          parse_mode: "Markdown",
          reply_markup: kb,
        }
      );
    }

    if (data === "clear_execute") {
      if (!(await checkWhitelist(ctx, true))) return;
      await ctx.answerCallbackQuery({ text: "Purging messages..." });
      return await handleClear(ctx);
    }

    if (data === "clear_cancel") {
      await ctx.answerCallbackQuery({ text: "Cancelled" });
      if (ctx.callbackQuery.message) {
        try {
          await ctx.deleteMessage();
        } catch {}
      }
      return;
    }

    if (data === "prompt_add") {
      if (!(await checkWhitelist(ctx, true))) return;
      await ctx.answerCallbackQuery();
      return await handlePromptAdd(ctx);
    }

    if (data.startsWith("cat_pick:")) {
      const cat = data.replace("cat_pick:", "");
      await ctx.answerCallbackQuery();
      return await ctx.reply(
        `Category *[${cat.toUpperCase()}]* selected.\nReply to this message with your task title:\n\n\`/todo add [${cat}] <title>\``,
        {
          parse_mode: "Markdown",
          reply_markup: {
            force_reply: true,
            input_field_placeholder: `[${cat}] Title here...`,
          },
        }
      );
    }

    await ctx.answerCallbackQuery();
  });

  // Reply handler for conversational task and category creation
  bot.on("message:text", async (ctx, next) => {
    if (ctx.message.text.startsWith("/")) return next();
    const reply = ctx.message.reply_to_message;

    // Conversational category creation
    if (reply?.text && reply.text.includes("Create New Category")) {
      if (!(await checkWhitelist(ctx))) return;
      const catName = ctx.message.text.trim();
      if (!catName) {
        return await ctx.reply("Category name cannot be empty.");
      }
      try {
        const cat = await addCategory(catName);
        const kb = new InlineKeyboard()
          .text(`📂 View [${cat.name}]`, `v:p:0:s:all:c:${cat.name}`)
          .text("📁 All Categories", "cats")
          .row()
          .text("➕ Add Another", "prompt_add_cat");
        return await ctx.reply(`Created category *#${cat.id}*: \`${cat.name}\` ✅`, {
          parse_mode: "Markdown",
          reply_markup: kb,
        });
      } catch (err: any) {
        return await ctx.reply(`Error adding category: ${err.message}`);
      }
    }

    // Conversational task creation
    if (
      reply?.text &&
      (reply.text.includes("Create New Task") ||
        reply.text.includes("Add Todo") ||
        reply.text.includes("Category ["))
    ) {
      if (!(await checkWhitelist(ctx))) return;
      const match = reply.text.match(/\[([a-zA-Z0-9_-]+)\]/);
      const defaultCat = match ? match[1].toLowerCase() : "general";
      const { title, category } = parseTitleAndCategory(ctx.message.text);
      const item = await addTodo(title, category === "general" ? defaultCat : category);
      const kb = new InlineKeyboard()
        .text(`✅ Done #${item.id}`, `done:${item.id}`)
        .text(`⚙️ Manage`, `det:${item.id}:p:0:s:all:c:all`)
        .row()
        .text("📋 View Tasks", "v:p:0:s:all:c:all")
        .text("➕ Add Another", "prompt_add");
      return await ctx.reply(`Added todo #${item.id} [${item.category}]: "${item.title}"`, {
        reply_markup: kb,
      });
    }

    return next();
  });

  // Direct fallbacks
  bot.command("list", (ctx) => handleList(ctx, ctx.match?.trim())); // Public
  bot.command("add", (ctx) => handleAdd(ctx, (ctx.match || "").trim())); // Protected
  bot.command("done", (ctx) => handleDone(ctx, (ctx.match || "").trim())); // Protected
  bot.command("undone", (ctx) => handleUndone(ctx, (ctx.match || "").trim())); // Protected
  bot.command(["del", "delete"], (ctx) => handleDelete(ctx, (ctx.match || "").trim())); // Protected
  bot.command(["clear", "clearchat", "purge"], (ctx) => handleClear(ctx, ctx.match?.trim())); // Protected

  return bot;
}
