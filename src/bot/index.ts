import { initDb } from "../db";
import { createTelegramBot } from "./telegram";
import { createDiscordBot } from "./discord";

export interface BotConnectionInfo {
  status: "connected" | "disconnected" | "not_configured" | "error";
  username?: string | null;
  tag?: string | null;
  error?: string | null;
}

export interface BotsState {
  telegram: BotConnectionInfo;
  discord: BotConnectionInfo;
}

export const botsState: BotsState = {
  telegram: {
    status: process.env.TELEGRAM_TOKEN ? "disconnected" : "not_configured",
    username: null,
  },
  discord: {
    status: process.env.DISCORD_TOKEN ? "disconnected" : "not_configured",
    tag: null,
  },
};

export function getBotsStatus(): BotsState {
  return botsState;
}

export async function startBots(): Promise<void> {
  console.log("Connecting to PostgreSQL and Redis...");
  await initDb();
  console.log("Database initialized (table: todo_items, categories, api_whitelist)");

  const telegramToken = process.env.TELEGRAM_TOKEN;
  const discordToken = process.env.DISCORD_TOKEN;

  if (!telegramToken && !discordToken) {
    console.warn("Warning: Neither TELEGRAM_TOKEN nor DISCORD_TOKEN set. Running Hono only.");
    return;
  }

  if (telegramToken) {
    console.log("Starting Telegram bot...");
    try {
      const tgBot = createTelegramBot(telegramToken);
      tgBot.start({
        onStart: (botInfo) => {
          botsState.telegram.status = "connected";
          botsState.telegram.username = botInfo.username;
          console.log(`Telegram bot running as @${botInfo.username}`);
        },
      }).catch((err) => {
        botsState.telegram.status = "error";
        botsState.telegram.error = err.message;
        console.error("Telegram bot runner error:", err);
      });
    } catch (err: any) {
      botsState.telegram.status = "error";
      botsState.telegram.error = err.message;
      console.error("Telegram bot init error:", err);
    }
  }

  if (discordToken) {
    console.log("Starting Discord bot...");
    try {
      const discordClient = createDiscordBot(discordToken);
      discordClient.on("ready", () => {
        botsState.discord.status = "connected";
        botsState.discord.tag = discordClient.user?.tag || null;
        console.log(`Discord bot logged in as ${discordClient.user?.tag}`);
      });
      discordClient.on("error", (err) => {
        botsState.discord.status = "error";
        botsState.discord.error = err.message;
        console.error("Discord bot error:", err);
      });
      await discordClient.login(discordToken);
    } catch (err: any) {
      botsState.discord.status = "error";
      botsState.discord.error = err.message;
      console.error("Discord bot login error:", err);
    }
  }
}

if (import.meta.main) {
  startBots().catch((err) => {
    console.error("Fatal error starting bot runner:", err);
    process.exit(1);
  });
}
