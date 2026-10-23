import { resolve } from 'node:path';
import { DiscordClient, discordConfig } from '../apps/api/src/discord.js';
import { discordCommands } from '../apps/api/src/discord-reminders.js';
try { process.loadEnvFile(resolve(import.meta.dirname, '../.env')); } catch { /* environment may be supplied by deployment */ }
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify(discordCommands, null, 2));
  console.log('Preview saja. Gunakan npm run discord:register -- --apply untuk mendaftarkan perintah ke server beta.');
} else {
  const config = discordConfig();
  if (!config) throw new Error('Set DISCORD_ENABLED=true dan lengkapi konfigurasi terlebih dahulu.');
  // Upsert only our command; preserve all unrelated commands and the global Activity entry point.
  await new DiscordClient(config).request(`/applications/${config.applicationId}/guilds/${config.guildId}/commands`, { method: 'POST', body: discordCommands[0] });
  console.log('Perintah /nyambung terdaftar di server beta.');
}
