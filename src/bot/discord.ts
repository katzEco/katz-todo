import { Client, GatewayIntentBits } from "discord.js";
import { listTodos, addTodo, updateTodoStatus, deleteTodo } from "../db";

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
    if (!content.startsWith("!")) return;

    const [cmd, ...args] = content.slice(1).trim().split(/\s+/);
    const command = cmd.toLowerCase();
    const argText = args.join(" ");

    try {
      if (command === "todos" || command === "list") {
        const items = await listTodos();
        if (items.length === 0) {
          await message.reply("Todo list is empty. Add one with `!add <title>`");
          return;
        }
        const lines = items.map(
          (t) => `${t.completed ? "✅" : "⬜"} **#${t.id}** ${t.title}`
        );
        await message.reply(`📋 **Todos:**\n${lines.join("\n")}`);
      } else if (command === "add") {
        if (!argText) {
          await message.reply("Usage: `!add <title>`");
          return;
        }
        const item = await addTodo(argText);
        await message.reply(`Added todo **#${item.id}**: "${item.title}"`);
      } else if (command === "done") {
        const id = parseInt(argText, 10);
        if (isNaN(id)) {
          await message.reply("Usage: `!done <id>`");
          return;
        }
        const item = await updateTodoStatus(id, true);
        if (!item) {
          await message.reply(`Todo #${id} not found.`);
          return;
        }
        await message.reply(`Marked **#${item.id}** as completed ✅`);
      } else if (command === "undone") {
        const id = parseInt(argText, 10);
        if (isNaN(id)) {
          await message.reply("Usage: `!undone <id>`");
          return;
        }
        const item = await updateTodoStatus(id, false);
        if (!item) {
          await message.reply(`Todo #${id} not found.`);
          return;
        }
        await message.reply(`Marked **#${item.id}** as incomplete ⬜`);
      } else if (command === "del" || command === "delete") {
        const id = parseInt(argText, 10);
        if (isNaN(id)) {
          await message.reply("Usage: `!del <id>`");
          return;
        }
        const ok = await deleteTodo(id);
        if (!ok) {
          await message.reply(`Todo #${id} not found.`);
          return;
        }
        await message.reply(`Deleted todo **#${id}** 🗑️`);
      } else if (command === "help") {
        await message.reply(
          "📋 **Todo List Commands:**\n" +
          "`!todos` or `!list` - Show todos\n" +
          "`!add <title>` - Add a todo\n" +
          "`!done <id>` - Mark as completed\n" +
          "`!undone <id>` - Mark as incomplete\n" +
          "`!del <id>` - Delete a todo"
        );
      }
    } catch (err: any) {
      console.error("Discord bot error:", err);
      await message.reply(`Error executing command: ${err.message}`);
    }
  });

  return client;
}
