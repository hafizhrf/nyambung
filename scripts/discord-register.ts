import { resolve } from 'node:path';
import { DiscordClient, discordConfig, discordGuildIds } from '../apps/api/src/discord.js';
import { discordCommands } from '../apps/api/src/discord-reminders.js';
try { process.loadEnvFile(resolve(import.meta.dirname, '../.env')); } catch { /* environment may be supplied by deployment */ }
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify(discordCommands, null, 2));
  console.log('Preview saja. Gunakan npm run discord:register -- --apply untuk mendaftarkan perintah ke server beta.');
} else {
  const config = discordConfig();
  if (!config) throw new Error('Set DISCORD_ENABLED=true dan lengkapi konfigurasi terlebih dahulu.');
  // Route Launch through the app so Discord does not post a new Game Invitation.
  const client=new DiscordClient(config);
  const commands=await client.request<{id:string;type:number}[]>(`/applications/${config.applicationId}/commands`);
  for(const command of commands.filter(command=>command.type===4))await client.request(`/applications/${config.applicationId}/commands/${command.id}`,{method:'PATCH',body:{handler:1}});
  // Preserve all unrelated commands.
  for(const guildId of discordGuildIds(config)) {
    await new DiscordClient(config).request(`/applications/${config.applicationId}/guilds/${guildId}/commands`, { method: 'POST', body: discordCommands[0] });
    console.log(`Perintah /nyambung terdaftar di server ${guildId}.`);
  }
}
