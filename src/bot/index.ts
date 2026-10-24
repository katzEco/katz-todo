import { initDb } from "../db";
import { createTelegramBot } from "./telegram";
import { createDiscordBot } from "./discord";

export async function startBots(): Promise<void> {
  console.log("Connecting to PostgreSQL and Redis...");
  await initDb();
  console.log("Database initialized (table: todo_items)");

  const telegramToken = process.env.TELEGRAM_TOKEN;
  const discordToken = process.env.DISCORD_TOKEN;

  if (!telegramToken && !discordToken) {
    console.warn("Warning: Neither TELEGRAM_TOKEN nor DISCORD_TOKEN set. Running Hono only.");
    return;
  }

  if (telegramToken) {
    console.log("Starting Telegram bot...");
    const tgBot = createTelegramBot(telegramToken);
    tgBot.start({
      onStart: (botInfo) => {
        console.log(`Telegram bot running as @${botInfo.username}`);
      },
    });
  }

  if (discordToken) {
    console.log("Starting Discord bot...");
    const discordClient = createDiscordBot(discordToken);
    await discordClient.login(discordToken);
  }
}

if (import.meta.main) {
  startBots().catch((err) => {
    console.error("Fatal error starting bot runner:", err);
    process.exit(1);
  });
}
