// bot.js

const { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { analyzeUser, getUserGroupRank, getUserId } = require('./robloxAnalyzer');

// === CONFIG ===
const DISCORD_TOKEN = 'MTM4NjY1MDYwNTA0ODY5MjgwNw.G5UVb3.iwC7iYNv4n2hSi7tmn5XOgPEytZSgMdhlWzj4k'; // Replace this!
const CLIENT_ID = '1386650605048692807';         // Replace this!
const GUILD_ID = "1380140387221508178"
const LOG_CHANNEL_ID = '1386798196843610142';


// === Initialize Discord Bot ===
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// === Slash Command Definition ===
const commands = [
  new SlashCommandBuilder()
    .setName('bgc')
    .setDescription('Analyze a Roblox user')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Roblox username to analyze')
        .setRequired(true)
    ).toJSON(), // ✅ Note the parentheses

  new SlashCommandBuilder()
    .setName('eh')
    .setDescription('Kullanicinin ehliyetine bak')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Roblox username to analyze')
        .setRequired(true)
    ).toJSON(),
    
    new SlashCommandBuilder()
    .setName('gl')
    .setDescription('Groupları Loglar')
    .addStringOption(option =>
      option.setName('groupid')
        .setDescription('Group to document')
        .setRequired(true)
    ).toJSON()
];


// === Register Commands ===
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  const commands = await rest.get(Routes.applicationCommands(CLIENT_ID));
  for (const command of commands) {
    await rest.delete(Routes.applicationCommand(CLIENT_ID, command.id));
    console.log(`🗑️ Deleted global command: ${command.name}`);
  }
})();

(async () => {
  try {
    console.log('🔄 Registering slash commands...');
    const useGlobal = false;

    await rest.put(
        useGlobal
            ? Routes.applicationCommands(CLIENT_ID)
            : Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
);

    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error('❌ Failed to register slash commands:', error);
  }
  
})();

// === Bot Ready ===
client.once(Events.ClientReady, () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

// === Command Handler ===
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'bgc') return;

  const username = interaction.options.getString('username');
  await interaction.deferReply(); // Reserve the reply

  try {
    const { filename, createdAt, friendCount, groupCount} = await analyzeUser(username);
    const userId = await getUserId(username);
    const licance = await getUserGroupRank(userId,16489754);
    await interaction.editReply({
        embeds: [{
            title: `Analysis for ${username}`,
            description:
                `📅 **Account Created:** ${new Date(createdAt).toDateString()}\n` +
                `👥 **Friends:** ${friendCount}\n` +
                `🏘️ **Groups:** ${groupCount}\n` +
                `🚗**Ehliyet:** ${licance ? `${licance.role} (Rank ${licance.rank})` : "Not in group"}\n`,
            footer: { text: 'Full HTML report attached above.' }
        }],
        files: [{ attachment: filename, name: filename }]
    });

    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
    await logChannel.send({
        content: `*** /bgc was used by @${interaction.user.tag}, to ${username}. ***`,
        embeds: [{
            title: `Analysis for ${username}`,
            description:
                `📅 **Account Created:** ${new Date(createdAt).toDateString()}\n` +
                `👥 **Friends:** ${friendCount}\n` +
                `🏘️ **Groups:** ${groupCount}\n` +
                `🚗**Ehliyet:** ${licance ? `${licance.role} (Rank ${licance.rank})` : "Not in group"}\n`,
            footer: { text: `Full HTML report attached above.` }
        }],
        files: [{ attachment: filename, name: filename }]
    });



    fs.unlinkSync(filename); // Clean up
  } catch (error) {
    console.error('❌ Error in analyzeUser:', error);
    if (error.code === 'CONFIDENTIAL_USER') {
        await interaction.editReply('❌ This user is blocked from analysis. Reason: CLASSIFIED INFORMATION.');
    } else {
        await interaction.editReply('❌ Failed to fetch data. Please check the username.');
    }
    
  }


});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'eh') return;

  const username = interaction.options.getString('username');
  await interaction.deferReply();

  try {
    const userId = await getUserId(username);
    const licance = await getUserGroupRank(userId,16489754);

    await interaction.editReply({
        embeds: [{
            title: `Licence  for ${username}`,
            description:
                licance && licance.inGroup
                    ? `🚗**Ehliyet:** ${licance.role} (Rank ${licance.rank})`
                : "🚫 Kullanici grupta değil veya bilgi alınamadı.",
            footer: { text: 'For full user analysis use /bgc' }
        }],
    })

    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
    await logChannel.send({
        content: `*** /eh was used by @${interaction.user.tag}, to ${username}. ***`,
        embeds: [{
            description:
                licance && licance.inGroup
                    ? `🚗**Ehliyet:** ${licance.role} (Rank ${licance.rank})`
                : "🚫 Kullanici grupta değil veya bilgi alınamadı."
        }],
    });
  } catch (error) {
    console.error('❌ Error in analyzeUser:', error);
    if (error.code === 'CONFIDENTIAL_USER') {
        await interaction.editReply('❌ This user is blocked from analysis. Reason: CLASSIFIED INFORMATION.');
    } else {
        await interaction.editReply('❌ Failed to fetch data. Please check the username.');
    }
    
  }


});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'gl') return;

  const groupIdStr = interaction.options.getString('groupid');
  const groupId = parseInt(groupIdStr, 10);
  if (isNaN(groupId)) {
    await interaction.reply({ content: '❌ Invalid group ID provided.', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    // saveGroupUsersHtml returns the filename
    const { saveGroupUsersHtml } = require('./robloxAnalyzer');
    const filename = await saveGroupUsersHtml(groupId);

    await interaction.editReply({
      content: `📊 Group ${groupId} user list by rank:`,
      files: [{ attachment: filename, name: filename }]
    });

    // Optional: log to your log channel
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
    await logChannel.send({
      content: `*** /gl was used by @${interaction.user.tag} for group ${groupId}. ***`,
      files: [{ attachment: filename, name: filename }]
    });

    fs.unlinkSync(filename); // Clean up the file after sending

  } catch (error) {
    console.error('❌ Error in /gl command:', error);
    await interaction.editReply('❌ Failed to fetch group data or generate report. Please check the group ID.');
  }
});





// === Login ===
client.login(DISCORD_TOKEN);
