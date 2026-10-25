import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
  type Message,
} from "discord.js";
import {
  listTodos,
  addTodo,
  updateTodoStatus,
  deleteTodo,
  type TodoItem,
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
  "`!todo` (or `!todo list [category]`) - Show todos with interactive buttons (Public)\n" +
  "`!todo add [category] <title>` - Add todo (Whitelist required)\n" +
  "`!todo done <id>` - Mark as completed (Whitelist required)\n" +
  "`!todo undone <id>` - Mark as incomplete (Whitelist required)\n" +
  "`!todo del <id>` - Delete a todo (Whitelist required)\n" +
  "`!todo clear [count]` - Clear chat messages (Whitelist required)\n\n" +
  "**Category Commands:**\n" +
  "`!todo category` (or `!todo category list`) - List categories (Public)\n" +
  "`!todo category add <name>` - Add new category (Whitelist required)\n" +
  "`!todo category del <name|id>` - Delete a category (Whitelist required)\n\n" +
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

interface DiscordViewOptions {
  status?: 'all' | 'pending' | 'completed';
  category?: string;
}

function buildDiscordView(allItems: TodoItem[], options: DiscordViewOptions = {}): {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const status = options.status || 'all';
  const category = options.category || 'all';

  const total = allItems.length;
  const pendingCount = allItems.filter((t) => !t.completed).length;
  const completedCount = total - pendingCount;

  let filtered = allItems;
  if (category !== 'all') {
    filtered = filtered.filter((t) => (t.category || 'general').toLowerCase() === category.toLowerCase());
  }
  if (status === 'pending') {
    filtered = filtered.filter((t) => !t.completed);
  } else if (status === 'completed') {
    filtered = filtered.filter((t) => t.completed);
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  // Filter tabs
  const filterRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`filter_all:${category}`)
      .setLabel(`${status === 'all' ? '● ' : ''}All (${total})`)
      .setStyle(status === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`filter_pending:${category}`)
      .setLabel(`${status === 'pending' ? '● ' : ''}Pending (${pendingCount})`)
      .setStyle(status === 'pending' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`filter_completed:${category}`)
      .setLabel(`${status === 'completed' ? '● ' : ''}Done (${completedCount})`)
      .setStyle(status === 'completed' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
  rows.push(filterRow);

  // Up to 2 task action buttons
  const displayTasks = filtered.slice(0, 2);
  if (displayTasks.length > 0) {
    const taskRow = new ActionRowBuilder<ButtonBuilder>();
    for (const t of displayTasks) {
      if (t.completed) {
        taskRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`todo_toggle:${t.id}:${status}:${category}`)
            .setLabel(`⬜ Reopen #${t.id}`)
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`todo_del:${t.id}:${status}:${category}`)
            .setLabel(`🗑️ Del #${t.id}`)
            .setStyle(ButtonStyle.Danger)
        );
      } else {
        taskRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`todo_toggle:${t.id}:${status}:${category}`)
            .setLabel(`✅ Done #${t.id}`)
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`todo_del:${t.id}:${status}:${category}`)
            .setLabel(`🗑️ Del #${t.id}`)
            .setStyle(ButtonStyle.Danger)
        );
      }
    }
    rows.push(taskRow);
  }

  // Action utilities
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("todo_modal_add")
      .setLabel("➕ Add Todo")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`todo_refresh:${status}:${category}`)
      .setLabel("🔄 Refresh")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("todo_cats_menu")
      .setLabel("📁 Categories")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("todo_clear_prompt")
      .setLabel("🧹 Clear Chat")
      .setStyle(ButtonStyle.Secondary)
  );
  rows.push(actionRow);

  let content = "";
  if (filtered.length === 0) {
    const catNote = category !== 'all' ? ` in [${category.toUpperCase()}]` : '';
    content = `📋 **Todos Manifest**\n*No ${status === 'all' ? '' : status + ' '}tasks found${catNote}. Click ➕ Add Todo below.*`;
  } else {
    const catNote = category !== 'all' ? ` [${category.toUpperCase()}]` : '';
    const statusNote = status !== 'all' ? ` (${status.toUpperCase()})` : '';
    const lines = filtered.map(
      (t) => `${t.completed ? "✅" : "⬜"} **#${t.id}** [${t.category}] ${t.title}`
    );
    content = `📋 **Todos${catNote}${statusNote}:**\n${lines.join("\n")}`;
  }

  return { content, components: rows };
}

// Public: List todos (Allowed for everyone)
async function handleList(message: Message, categoryFilter?: string) {
  try {
    const items = await listTodos();
    const { content, components } = buildDiscordView(items, { category: categoryFilter || 'all' });
    await message.reply({ content, components });
  } catch (err: any) {
    console.error("Discord list error:", err);
    await message.reply(`Error fetching todos: ${err.message}`);
  }
}

// Protected: Add todo (Whitelist required)
async function handleAdd(message: Message, rawText: string) {
  if (!(await checkWhitelist(message))) return;

  if (!rawText) {
    const cats = await listCategories();
    const catRow = new ActionRowBuilder<ButtonBuilder>();
    for (const c of cats.slice(0, 4)) {
      catRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`cat_pick:${c.name}`)
          .setLabel(`📂 ${c.name}`)
          .setStyle(ButtonStyle.Primary)
      );
    }
    await message.reply({
      content: "Usage: `!todo add <title>` or `!todo add [category] <title>`\nOr tap a category below:",
      components: catRow.components.length > 0 ? [catRow] : [],
    });
    return;
  }

  try {
    const { title, category } = parseTitleAndCategory(rawText);
    const item = await addTodo(title, category);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`todo_done:${item.id}`)
        .setLabel(`✅ Done #${item.id}`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`todo_del:${item.id}`)
        .setLabel(`🗑️ Del #${item.id}`)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("todo_refresh")
        .setLabel("📋 View List")
        .setStyle(ButtonStyle.Secondary)
    );
    await message.reply({
      content: `Added todo **#${item.id}** [${item.category}]: "${item.title}"`,
      components: [row],
    });
  } catch (err: any) {
    console.error("Discord add error:", err);
    await message.reply(`Error adding todo: ${err.message}`);
  }
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

// Protected: Clear chat messages (Whitelist required)
async function handleClear(message: Message, countStr?: string) {
  if (!(await checkWhitelist(message))) return;

  const count = Math.min(Math.max(parseInt(countStr || "30", 10) || 30, 1), 100);

  if (message.channel && "bulkDelete" in message.channel) {
    try {
      const deleted = await message.channel.bulkDelete(count, true);
      const replyMsg = await message.channel.send(`🧹 Cleared ${deleted.size} messages.`);
      setTimeout(() => replyMsg.delete().catch(() => {}), 3500);
    } catch (err: any) {
      console.error("Discord clear error:", err);
      await message.reply(`Error clearing messages: ${err.message}`);
    }
  } else {
    await message.reply("Cannot bulk delete messages in this channel type.");
  }
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
      return await message.reply("Usage: `!todo category add <name>`");
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
      return await message.reply("Usage: `!todo category del <name|id>`");
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
    `Unknown category action: "${subCmd}".\nUsage:\n\`!todo category\` (or list)\n\`!todo category add <name>\`\n\`!todo category del <name|id>\``
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
      const helpRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("filter_all:all").setLabel("📋 View Todos").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("todo_modal_add").setLabel("➕ Add Todo").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("todo_cats_menu").setLabel("📁 Categories").setStyle(ButtonStyle.Secondary)
      );
      await message.reply({ content: HELP_TEXT + statusText, components: [helpRow] });
      return;
    }

    try {
      if (command === "task" || command === "tasks" || command === "todo" || command === "todos") {
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
        } else if (sub === "clear" || sub === "clearchat" || sub === "purge") {
          await handleClear(message, subArgText); // Protected
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
      } else if (command === "clear" || command === "clearchat" || command === "purge") {
        await handleClear(message, argText); // Protected
      }
    } catch (err: any) {
      console.error("Discord bot error:", err);
      await message.reply(`Error executing command: ${err.message}`);
    }
  });

  // Interactive buttons & modals handler
  client.on("interactionCreate", async (interaction) => {
    const userId = interaction.user.id;

    try {
      // 1. Native Modal Submission for Adding Task
      if (interaction.isModalSubmit() && interaction.customId === "modal_create_todo") {
        const allowed = await isUserWhitelisted("discord", userId);
        if (!allowed) {
          return await interaction.reply({
            content: `⛔ **Access Denied**\nYour Discord User ID is \`${userId}\`.\nYou must be whitelisted via the web dashboard to make changes.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        const title = interaction.fields.getTextInputValue("task_title").trim();
        const category = (interaction.fields.getTextInputValue("task_category") || "general").trim();
        if (!title) {
          return await interaction.reply({ content: "Task title cannot be empty.", flags: MessageFlags.Ephemeral });
        }
        const item = await addTodo(title, category);
        const allItems = await listTodos();
        const { content, components } = buildDiscordView(allItems);
        return await interaction.reply({
          content: `Added todo **#${item.id}** [${item.category}]: "${item.title}"\n\n${content}`,
          components,
        });
      }

      // 2. Select Menu for Category Filtering
      if (interaction.isStringSelectMenu() && interaction.customId === "cat_select_filter") {
        const selectedCat = interaction.values[0] || "all";
        const allItems = await listTodos();
        const { content, components } = buildDiscordView(allItems, { category: selectedCat });
        return await interaction.update({ content, components });
      }

      // 3. Button Interactions
      if (!interaction.isButton()) return;
      const customId = interaction.customId;

      // Modal trigger
      if (customId === "todo_modal_add") {
        const allowed = await isUserWhitelisted("discord", userId);
        if (!allowed) {
          return await interaction.reply({
            content: `⛔ **Access Denied**\nYour Discord User ID is \`${userId}\`.\nYou must be whitelisted via the web dashboard to make changes.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        const modal = new ModalBuilder()
          .setCustomId("modal_create_todo")
          .setTitle("Create New Todo");

        const titleInput = new TextInputBuilder()
          .setCustomId("task_title")
          .setLabel("What needs to be done?")
          .setPlaceholder("e.g. Finish quarterly report")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const catInput = new TextInputBuilder()
          .setCustomId("task_category")
          .setLabel("Category (optional)")
          .setPlaceholder("general, work, personal, urgent...")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(catInput)
        );

        return await interaction.showModal(modal);
      }

      // Filter tabs: filter_<status>:<category>
      if (customId.startsWith("filter_")) {
        const parts = customId.replace("filter_", "").split(":");
        const status = (parts[0] as 'all' | 'pending' | 'completed') || 'all';
        const category = parts[1] || 'all';
        const allItems = await listTodos();
        const { content, components } = buildDiscordView(allItems, { status, category });
        return await interaction.update({ content, components });
      }

      // Toggle done/reopen: todo_toggle:<id>:<status>:<category>
      if (customId.startsWith("todo_toggle:")) {
        const allowed = await isUserWhitelisted("discord", userId);
        if (!allowed) {
          return await interaction.reply({
            content: `⛔ **Access Denied**\nYour Discord User ID is \`${userId}\`.\nYou must be whitelisted via the web dashboard to make changes.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        const parts = customId.split(":");
        const id = parseInt(parts[1], 10);
        const status = (parts[2] as 'all' | 'pending' | 'completed') || 'all';
        const category = parts[3] || 'all';

        const allItems = await listTodos();
        const found = allItems.find((t) => t.id === id);
        const newCompleted = found ? !found.completed : true;
        await updateTodoStatus(id, newCompleted);

        const updatedItems = await listTodos();
        const { content, components } = buildDiscordView(updatedItems, { status, category });
        return await interaction.update({ content, components });
      }

      // Delete task: todo_del:<id>:<status>:<category> or simple todo_del:<id>
      if (customId.startsWith("todo_del:")) {
        const allowed = await isUserWhitelisted("discord", userId);
        if (!allowed) {
          return await interaction.reply({
            content: `⛔ **Access Denied**\nYour Discord User ID is \`${userId}\`.\nYou must be whitelisted via the web dashboard to make changes.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        const parts = customId.split(":");
        const id = parseInt(parts[1], 10);
        const status = (parts[2] as 'all' | 'pending' | 'completed') || 'all';
        const category = parts[3] || 'all';

        await deleteTodo(id);
        const updatedItems = await listTodos();
        const { content, components } = buildDiscordView(updatedItems, { status, category });
        return await interaction.update({ content, components });
      }

      // Refresh view: todo_refresh:<status>:<category>
      if (customId.startsWith("todo_refresh")) {
        const parts = customId.split(":");
        const status = (parts[1] as 'all' | 'pending' | 'completed') || 'all';
        const category = parts[2] || 'all';
        const allItems = await listTodos();
        const { content, components } = buildDiscordView(allItems, { status, category });
        return await interaction.update({ content, components });
      }

      // Interactive Category Explorer with Select Menu
      if (customId === "todo_cats_menu" || customId === "todo_cats") {
        const cats = await listCategories();
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("cat_select_filter")
          .setPlaceholder("Select category to filter tasks...")
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel("ALL CATEGORIES")
              .setValue("all")
              .setDescription("View all tasks across all categories")
          );

        for (const c of cats.slice(0, 24)) {
          selectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel(c.name.toUpperCase())
              .setValue(c.name)
              .setDescription(`${c.todo_count || 0} active tasks`)
          );
        }

        const menuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        const lines = cats.map((c) => `• **${c.name}** (${c.todo_count} tasks)`);
        return await interaction.reply({
          content: `📁 **Category Explorer:**\n${lines.join("\n")}`,
          components: [menuRow],
          flags: MessageFlags.Ephemeral,
        });
      }

      // Clear chat confirmation flow
      if (customId === "todo_clear_prompt" || customId === "todo_clear") {
        const allowed = await isUserWhitelisted("discord", userId);
        if (!allowed) {
          return await interaction.reply({
            content: `⛔ **Access Denied**\nYour Discord User ID is \`${userId}\`.\nYou must be whitelisted via the web dashboard to make changes.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("todo_clear_execute").setLabel("🧹 Yes, Delete 30 Messages").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("todo_clear_cancel").setLabel("❌ Cancel").setStyle(ButtonStyle.Secondary)
        );
        return await interaction.reply({
          content: "⚠️ **Confirm Clear Chat**\nAre you sure you want to delete the last 30 messages in this channel?",
          components: [confirmRow],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (customId === "todo_clear_execute") {
        const allowed = await isUserWhitelisted("discord", userId);
        if (!allowed) {
          return await interaction.reply({
            content: `⛔ **Access Denied**\nYour Discord User ID is \`${userId}\`.\nYou must be whitelisted via the web dashboard to make changes.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        if (interaction.channel && "bulkDelete" in interaction.channel) {
          await interaction.reply({ content: "🧹 Clearing chat...", flags: MessageFlags.Ephemeral });
          await interaction.channel.bulkDelete(30, true);
        } else {
          await interaction.reply({ content: "Cannot bulk delete in this channel type.", flags: MessageFlags.Ephemeral });
        }
        return;
      }

      if (customId === "todo_clear_cancel") {
        return await interaction.update({ content: "❌ Clear chat cancelled.", components: [] });
      }

      // Legacy fallback handlers
      if (customId.startsWith("todo_done:")) {
        const allowed = await isUserWhitelisted("discord", userId);
        if (!allowed) {
          return await interaction.reply({
            content: `⛔ **Access Denied**\nYour Discord User ID is \`${userId}\`.\nYou must be whitelisted via the web dashboard to make changes.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        const id = parseInt(customId.split(":")[1], 10);
        await updateTodoStatus(id, true);
        const allItems = await listTodos();
        const { content, components } = buildDiscordView(allItems);
        return await interaction.update({ content, components });
      }
    } catch (err: any) {
      console.error("Discord interaction error:", err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `Error: ${err.message}`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  });

  return client;
}
