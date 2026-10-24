import { Bot, type Context } from "grammy";
import {
  listTodos,
  addTodo,
  updateTodoStatus,
  deleteTodo,
} from "../modules/todo";
import {
  listCategories,
  addCategory,
  deleteCategory,
} from "../modules/category";
import { isUserWhitelisted } from "../modules/whitelist";

const HELP_TEXT =
  "📋 *Todo List & Management Bot*\n\n" +
  "*Todo Commands:*\n" +
  "/todo (or /todo list [category]) - List todos (Public)\n" +
  "/todo add [category] <title> - Add todo (Whitelist required)\n" +
  "/todo done <id> - Mark as completed (Whitelist required)\n" +
  "/todo undone <id> - Mark as incomplete (Whitelist required)\n" +
  "/todo del <id> - Delete a todo (Whitelist required)\n\n" +
  "*Category Commands:*\n" +
  "/category (or list) - List categories (Public)\n" +
  "/category add <name> - Add category (Whitelist required)\n" +
  "/category del <name|id> - Delete category (Whitelist required)\n\n" +
  "/todo help - Show this help message";

async function checkWhitelist(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId) return false;
  const allowed = await isUserWhitelisted("telegram", userId);
  if (!allowed) {
    await ctx.reply(
      `⛔ *Access Denied*\n\nYour Telegram User ID is \`${userId}\`.\nYou must be whitelisted via the web dashboard to make changes.`,
      { parse_mode: "Markdown" }
    );
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
  return { category: 'general', title: text };
}

// Public: List todos (Allowed for everyone)
async function handleList(ctx: Context, categoryFilter?: string) {
  try {
    const items = await listTodos(categoryFilter);
    if (items.length === 0) {
      const filterNote = categoryFilter ? ` in category "${categoryFilter}"` : '';
      return await ctx.reply(`Todo list is empty${filterNote}. Add one with /todo add <title>`);
    }
    const lines = items.map(
      (t) => `${t.completed ? "✅" : "⬜"} #${t.id} [${t.category}] ${t.title}`
    );
    const header = categoryFilter ? `📋 *Todos (${categoryFilter.toUpperCase()}):*` : `📋 *Todos:*`;
    await ctx.reply(`${header}\n${lines.join("\n")}`, { parse_mode: "Markdown" });
  } catch (err: any) {
    console.error("Telegram list error:", err);
    await ctx.reply(`Error fetching todos: ${err.message}`);
  }
}

// Protected: Add todo (Whitelist required)
async function handleAdd(ctx: Context, rawText: string) {
  if (!(await checkWhitelist(ctx))) return;

  if (!rawText) {
    return await ctx.reply("Usage: /todo add <title> or /todo add [category] <title>");
  }
  try {
    const { title, category } = parseTitleAndCategory(rawText);
    const item = await addTodo(title, category);
    await ctx.reply(`Added todo #${item.id} [${item.category}]: "${item.title}"`);
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

// Categories: List is public; Add and Delete require whitelist
async function handleCategoryCommand(ctx: Context, rawArgs: string) {
  const [sub, ...rest] = (rawArgs || "").trim().split(/\s+/);
  const subCmd = sub ? sub.toLowerCase() : "";
  const val = rest.join(" ").trim();

  // Public: List categories
  if (!subCmd || subCmd === "list" || subCmd === "ls") {
    try {
      const cats = await listCategories();
      if (cats.length === 0) {
        return await ctx.reply("No categories found.");
      }
      const lines = cats.map((c) => `• *${c.name}* (${c.todo_count} tasks) [id: ${c.id}]`);
      return await ctx.reply(`📁 *Categories:*\n${lines.join("\n")}`, { parse_mode: "Markdown" });
    } catch (err: any) {
      return await ctx.reply(`Error listing categories: ${err.message}`);
    }
  }

  // Protected: Add category
  if (subCmd === "add") {
    if (!(await checkWhitelist(ctx))) return;
    if (!val) {
      return await ctx.reply("Usage: /category add <name>");
    }
    try {
      const cat = await addCategory(val);
      return await ctx.reply(`Added category *#${cat.id}*: "${cat.name}"`, { parse_mode: "Markdown" });
    } catch (err: any) {
      return await ctx.reply(`Error adding category: ${err.message}`);
    }
  }

  // Protected: Delete category
  if (subCmd === "del" || subCmd === "delete" || subCmd === "rm") {
    if (!(await checkWhitelist(ctx))) return;
    if (!val) {
      return await ctx.reply("Usage: /category del <name|id>");
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
    `Unknown category action: "${subCmd}".\nUsage:\n/category (or list)\n/category add <name>\n/category del <name|id>`,
    { parse_mode: "Markdown" }
  );
}

export function createTelegramBot(token: string) {
  const bot = new Bot(token);

  // Public: Help and Start commands
  bot.command(["start", "help"], async (ctx) => {
    const userId = ctx.from?.id;
    const isWhitelisted = userId ? await isUserWhitelisted("telegram", userId) : false;
    const statusText = `\n\n🆔 *Your Telegram User ID:* \`${userId}\` (${isWhitelisted ? "✅ Whitelisted" : "❌ Not Whitelisted"})`;
    await ctx.reply(HELP_TEXT + statusText, { parse_mode: "Markdown" });
  });

  // Category command
  bot.command(["category", "cat"], async (ctx) => {
    await handleCategoryCommand(ctx, ctx.match || "");
  });

  // Todo command
  bot.command(["todo", "todos"], async (ctx) => {
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
      const userId = ctx.from?.id;
      const isWhitelisted = userId ? await isUserWhitelisted("telegram", userId) : false;
      const statusText = `\n\n🆔 *Your Telegram User ID:* \`${userId}\` (${isWhitelisted ? "✅ Whitelisted" : "❌ Not Whitelisted"})`;
      return await ctx.reply(HELP_TEXT + statusText, { parse_mode: "Markdown" }); // Public
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
    } else {
      return await ctx.reply(
        `Unknown subcommand: "${subcommand}".\n\n${HELP_TEXT}`,
        { parse_mode: "Markdown" }
      );
    }
  });

  // Direct fallbacks
  bot.command("list", (ctx) => handleList(ctx, ctx.match?.trim())); // Public
  bot.command("add", (ctx) => handleAdd(ctx, (ctx.match || "").trim())); // Protected
  bot.command("done", (ctx) => handleDone(ctx, (ctx.match || "").trim())); // Protected
  bot.command("undone", (ctx) => handleUndone(ctx, (ctx.match || "").trim())); // Protected
  bot.command(["del", "delete"], (ctx) => handleDelete(ctx, (ctx.match || "").trim())); // Protected

  return bot;
}
