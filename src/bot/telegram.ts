import { Bot } from "grammy";
import { listTodos, addTodo, updateTodoStatus, deleteTodo } from "../db";

export function createTelegramBot(token: string) {
  const bot = new Bot(token);

  bot.command(["start", "help"], async (ctx) => {
    await ctx.reply(
      "📋 *Todo List Bot*\n\n" +
      "Commands:\n" +
      "/todos or /list - List all todos\n" +
      "/add <title> - Add a new todo\n" +
      "/done <id> - Mark as completed\n" +
      "/undone <id> - Mark as incomplete\n" +
      "/del <id> - Delete a todo",
      { parse_mode: "Markdown" }
    );
  });

  bot.command(["todos", "list"], async (ctx) => {
    try {
      const items = await listTodos();
      if (items.length === 0) {
        return await ctx.reply("Todo list is empty. Add one with /add <title>");
      }
      const lines = items.map(
        (t) => `${t.completed ? "✅" : "⬜"} #${t.id} ${t.title}`
      );
      await ctx.reply(`📋 *Todos:*\n${lines.join("\n")}`, { parse_mode: "Markdown" });
    } catch (err: any) {
      console.error("Telegram /todos error:", err);
      await ctx.reply(`Error fetching todos: ${err.message}`);
    }
  });

  bot.command("add", async (ctx) => {
    const title = ctx.match?.trim();
    if (!title) {
      return await ctx.reply("Usage: /add <title>");
    }
    try {
      const item = await addTodo(title);
      await ctx.reply(`Added todo #${item.id}: "${item.title}"`);
    } catch (err: any) {
      console.error("Telegram /add error:", err);
      await ctx.reply(`Error adding todo: ${err.message}`);
    }
  });

  bot.command("done", async (ctx) => {
    const id = parseInt(ctx.match?.trim() || "", 10);
    if (isNaN(id)) {
      return await ctx.reply("Usage: /done <id>");
    }
    try {
      const item = await updateTodoStatus(id, true);
      if (!item) {
        return await ctx.reply(`Todo #${id} not found.`);
      }
      await ctx.reply(`Marked #${item.id} as completed ✅`);
    } catch (err: any) {
      console.error("Telegram /done error:", err);
      await ctx.reply(`Error updating todo: ${err.message}`);
    }
  });

  bot.command("undone", async (ctx) => {
    const id = parseInt(ctx.match?.trim() || "", 10);
    if (isNaN(id)) {
      return await ctx.reply("Usage: /undone <id>");
    }
    try {
      const item = await updateTodoStatus(id, false);
      if (!item) {
        return await ctx.reply(`Todo #${id} not found.`);
      }
      await ctx.reply(`Marked #${item.id} as incomplete ⬜`);
    } catch (err: any) {
      console.error("Telegram /undone error:", err);
      await ctx.reply(`Error updating todo: ${err.message}`);
    }
  });

  bot.command("del", async (ctx) => {
    const id = parseInt(ctx.match?.trim() || "", 10);
    if (isNaN(id)) {
      return await ctx.reply("Usage: /del <id>");
    }
    try {
      const ok = await deleteTodo(id);
      if (!ok) {
        return await ctx.reply(`Todo #${id} not found.`);
      }
      await ctx.reply(`Deleted todo #${id} 🗑️`);
    } catch (err: any) {
      console.error("Telegram /del error:", err);
      await ctx.reply(`Error deleting todo: ${err.message}`);
    }
  });

  return bot;
}
