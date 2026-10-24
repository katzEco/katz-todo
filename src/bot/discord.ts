import { Client, GatewayIntentBits, type Message } from "discord.js";
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
  "📋 **Todo List & Management Bot**\n\n" +
  "**Todo Commands:**\n" +
  "`!todo` (or `!todo list [category]`) - Show todos (Public)\n" +
  "`!todo add [category] <title>` - Add todo (Whitelist required)\n" +
  "`!todo done <id>` - Mark as completed (Whitelist required)\n" +
  "`!todo undone <id>` - Mark as incomplete (Whitelist required)\n" +
  "`!todo del <id>` - Delete a todo (Whitelist required)\n\n" +
  "**Category Commands:**\n" +
  "`!category` (or `!category list`) - List categories (Public)\n" +
  "`!category add <name>` - Add new category (Whitelist required)\n" +
  "`!category del <name|id>` - Delete a category (Whitelist required)\n\n" +
  "`!todo help` - Show this help message";

async function checkWhitelist(message: Message): Promise<boolean> {
  const userId = message.author.id;
  const allowed = await isUserWhitelisted("discord", userId);
  if (!allowed) {
    await message.reply(
      `⛔ **Access Denied**\nYour Discord User ID is \`${userId}\`.\nYou must be whitelisted via the web dashboard to make changes.`
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
async function handleList(message: Message, categoryFilter?: string) {
  const items = await listTodos(categoryFilter);
  if (items.length === 0) {
    const filterNote = categoryFilter ? ` in category "${categoryFilter}"` : '';
    await message.reply(`Todo list is empty${filterNote}. Add one with \`!todo add <title>\``);
    return;
  }
  const lines = items.map(
    (t) => `${t.completed ? "✅" : "⬜"} **#${t.id}** [${t.category}] ${t.title}`
  );
  const header = categoryFilter ? `📋 **Todos (${categoryFilter.toUpperCase()}):**` : `📋 **Todos:**`;
  await message.reply(`${header}\n${lines.join("\n")}`);
}

// Protected: Add todo (Whitelist required)
async function handleAdd(message: Message, rawText: string) {
  if (!(await checkWhitelist(message))) return;

  if (!rawText) {
    await message.reply("Usage: `!todo add <title>` or `!todo add [category] <title>`");
    return;
  }
  const { title, category } = parseTitleAndCategory(rawText);
  const item = await addTodo(title, category);
  await message.reply(`Added todo **#${item.id}** [${item.category}]: "${item.title}"`);
}

// Protected: Complete todo (Whitelist required)
async function handleDone(message: Message, idStr: string) {
  if (!(await checkWhitelist(message))) return;

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    await message.reply("Usage: `!todo done <id>`");
    return;
  }
  const item = await updateTodoStatus(id, true);
  if (!item) {
    await message.reply(`Todo #${id} not found.`);
    return;
  }
  await message.reply(`Marked **#${item.id}** [${item.category}] as completed ✅`);
}

// Protected: Reopen todo (Whitelist required)
async function handleUndone(message: Message, idStr: string) {
  if (!(await checkWhitelist(message))) return;

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    await message.reply("Usage: `!todo undone <id>`");
    return;
  }
  const item = await updateTodoStatus(id, false);
  if (!item) {
    await message.reply(`Todo #${id} not found.`);
    return;
  }
  await message.reply(`Marked **#${item.id}** [${item.category}] as incomplete ⬜`);
}

// Protected: Delete todo (Whitelist required)
async function handleDelete(message: Message, idStr: string) {
  if (!(await checkWhitelist(message))) return;

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    await message.reply("Usage: `!todo del <id>`");
    return;
  }
  const ok = await deleteTodo(id);
  if (!ok) {
    await message.reply(`Todo #${id} not found.`);
    return;
  }
  await message.reply(`Deleted todo **#${id}** 🗑️`);
}

// Categories: List is public; Add and Delete require whitelist
async function handleCategoryCommand(message: Message, rawArgs: string) {
  const [sub, ...rest] = (rawArgs || "").trim().split(/\s+/);
  const subCmd = sub ? sub.toLowerCase() : "";
  const val = rest.join(" ").trim();

  // Public: List categories
  if (!subCmd || subCmd === "list" || subCmd === "ls") {
    try {
      const cats = await listCategories();
      if (cats.length === 0) {
        return await message.reply("No categories found.");
      }
      const lines = cats.map((c) => `• **${c.name}** (${c.todo_count} tasks) [id: ${c.id}]`);
      return await message.reply(`📁 **Categories:**\n${lines.join("\n")}`);
    } catch (err: any) {
      return await message.reply(`Error listing categories: ${err.message}`);
    }
  }

  // Protected: Add category
  if (subCmd === "add") {
    if (!(await checkWhitelist(message))) return;
    if (!val) {
      return await message.reply("Usage: `!category add <name>`");
    }
    try {
      const cat = await addCategory(val);
      return await message.reply(`Added category **#${cat.id}**: "${cat.name}"`);
    } catch (err: any) {
      return await message.reply(`Error adding category: ${err.message}`);
    }
  }

  // Protected: Delete category
  if (subCmd === "del" || subCmd === "delete" || subCmd === "rm") {
    if (!(await checkWhitelist(message))) return;
    if (!val) {
      return await message.reply("Usage: `!category del <name|id>`");
    }
    try {
      const ok = await deleteCategory(val);
      if (!ok) {
        return await message.reply(`Cannot delete category "${val}" (not found or protected "general").`);
      }
      return await message.reply(`Deleted category "${val}" 🗑️`);
    } catch (err: any) {
      return await message.reply(`Error deleting category: ${err.message}`);
    }
  }

  return await message.reply(
    `Unknown category action: "${subCmd}".\nUsage:\n\`!category\` (or list)\n\`!category add <name>\`\n\`!category del <name|id>\``
  );
}

export function createDiscordBot(token: string) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.on("clientReady", () => {
    console.log(`Discord bot logged in as ${client.user?.tag}`);
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    if (!content.startsWith("!") && !content.startsWith("/")) return;

    const [cmd, ...args] = content.slice(1).trim().split(/\s+/);
    const command = cmd.toLowerCase();
    const argText = args.join(" ").trim();

    // Public discovery: help
    if (command === "help") {
      const isSenderWhitelisted = await isUserWhitelisted("discord", message.author.id);
      const statusText = `\n\n🆔 **Your Discord User ID:** \`${message.author.id}\` (${isSenderWhitelisted ? "✅ Whitelisted" : "❌ Not Whitelisted"})`;
      await message.reply(HELP_TEXT + statusText);
      return;
    }

    try {
      if (command === "todo" || command === "todos") {
        const sub = args[0]?.toLowerCase();
        const subArgText = args.slice(1).join(" ").trim();

        if (!sub || sub === "list" || sub === "ls") {
          await handleList(message, subArgText || undefined); // Public
        } else if (sub === "help") {
          const isSenderWhitelisted = await isUserWhitelisted("discord", message.author.id);
          const statusText = `\n\n🆔 **Your Discord User ID:** \`${message.author.id}\` (${isSenderWhitelisted ? "✅ Whitelisted" : "❌ Not Whitelisted"})`;
          await message.reply(HELP_TEXT + statusText); // Public
        } else if (sub === "category" || sub === "cat") {
          await handleCategoryCommand(message, subArgText);
        } else if (sub === "add") {
          await handleAdd(message, subArgText); // Protected
        } else if (sub === "done") {
          await handleDone(message, subArgText); // Protected
        } else if (sub === "undone") {
          await handleUndone(message, subArgText); // Protected
        } else if (sub === "del" || sub === "delete" || sub === "rm") {
          await handleDelete(message, subArgText); // Protected
        } else {
          await message.reply(`Unknown subcommand: "${args[0]}".\n\n${HELP_TEXT}`);
        }
      } else if (command === "category" || command === "cat") {
        await handleCategoryCommand(message, argText);
      } else if (command === "list") {
        await handleList(message, argText || undefined); // Public
      } else if (command === "add") {
        await handleAdd(message, argText); // Protected
      } else if (command === "done") {
        await handleDone(message, argText); // Protected
      } else if (command === "undone") {
        await handleUndone(message, argText); // Protected
      } else if (command === "del" || command === "delete") {
        await handleDelete(message, argText); // Protected
      }
    } catch (err: any) {
      console.error("Discord bot error:", err);
      await message.reply(`Error executing command: ${err.message}`);
    }
  });

  return client;
}
