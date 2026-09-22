const express = require('express');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

// إعداد سيرفر الويب البسيط عشان البوت ما يطفي في Render
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is alive and running!');
});

app.listen(port, () => {
    console.log(`Web server is running on port ${port}`);
});

// إعداد عميل دسكورد
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const GUILD_ID = '1200422663424847882'; // آيدي سيرفرك
const LOG_CHANNEL_ID = '1539617469201915964'; // آيدي قناة ميوت-الرومات
const ADMIN_ROLE_ID = 'حط_آيدي_رول_الإدارة_هنا'; // <--- حط آيدي الرول اللي مسموح لها تفك الميوت عبر الزر

// دالة لتوليد أزرار الرومات النشطة (بالطول)
async function getVoiceControlPanel(guild) {
    await guild.channels.fetch();
    const activeVoiceChannels = guild.channels.cache.filter(c => c.isVoiceBased() && c.members.size > 0);

    const embed = new EmbedBuilder()
        .setTitle('🎙️ لوحة تحكم الرومات النشطة')
        .setDescription('الرومات النشطة حالياً والأزرار مرتبة بالطول للتحكم الفوري والصامت:')
        .setColor(0x2f3136);

    const rows = [];

    if (activeVoiceChannels.size === 0) {
        embed.addFields({ name: 'الحالة', value: 'لا توجد رومات صوتية فيها أعضاء حالياً.' });
    } else {
        activeVoiceChannels.forEach(vc => {
            const memberCount = vc.members.size;
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`mute_${vc.id}`)
                    .setLabel(`🔇 ميوت ${vc.name} (${memberCount})`)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`unmute_${vc.id}`)
                    .setLabel(`🔊 فك ${vc.name} (${memberCount})`)
                    .setStyle(ButtonStyle.Success)
            );
            rows.push(row);
        });
    }

    return { embeds: [embed], components: rows };
}

let panelMessage = null;

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const channel = await guild.channels.fetch(LOG_CHANNEL_ID);

        if (channel && channel.isTextBased()) {
            const messages = await channel.messages.fetch({ limit: 10 });
            await channel.bulkDelete(messages).catch(() => {});

            const panelData = await getVoiceControlPanel(guild);
            panelMessage = await channel.send(panelData);
            console.log('تم إرسال لوحة التحكم بنجاح!');
        }
    } catch (error) {
        console.error('خطأ عند بدء البوت:', error);
    }
});

// الحماية الصارمة: منع أي شخص من فك الميوت عن نفسه يدويًا
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    if (guild.id !== GUILD_ID) return;

    // إذا كان العضو محطوط عليه ميوت سيرفر، وشاله بنفسه (أو بأي طريقة يدوية)، يرجعه البوت فوراَ
    if (oldState.serverMute && !newState.serverMute) {
        if (newState.member && newState.member.voice) {
            // إعادة تطبيق الميوت بشكل فوري
            newState.member.voice.setMute(true).catch(() => {});
        }
    }

    // تحديث اللوحة تلقائياً عند دخول وخروج الأعضاء
    if (panelMessage) {
        try {
            const panelData = await getVoiceControlPanel(guild);
            await panelMessage.edit(panelData).catch(() => {});
        } catch (error) {
            console.error('خطأ أثناء تحديث اللوحة:', error);
        }
    }
});

// تنفيذ الميوت أو الفك الجماعي عبر الأزرار مع التحقق من صلاحية الرول
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const [action, channelId] = interaction.customId.split('_');
    if (action !== 'mute' && action !== 'unmute') return;

    try {
        // إذا كان الزر "فك ميوت"، نتأكد أن الضاغط معه رول الإدارة المسموح له فقط
        if (action === 'unmute') {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!member.roles.cache.has(ADMIN_ROLE_ID)) {
                await interaction.reply({ content: '❌ عذراً، لا تمتلك الصلاحية لفك الميوت عن الروم!', ephemeral: true });
                return;
            }
        }

        await interaction.deferUpdate();

        const guild = await interaction.guild.fetch();
        const channel = await guild.channels.fetch(channelId);

        if (!channel || !channel.isVoiceBased()) return;

        const shouldMute = (action === 'mute');
        
        // تنفيذ الميوت أو الفك للجميع في نفس الثانية دفعة واحدة
        const promises = [];
        channel.members.forEach(member => {
            if (member.voice) {
                promises.push(member.voice.setMute(shouldMute).catch(() => {}));
            }
        });

        await Promise.all(promises);
    } catch (error) {
        console.error(error);
    }
});

client.login(process.env.DISCORD_TOKEN);
