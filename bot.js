const express = require('express');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// إعداد سيرفر الويب القوي لمنع النوم في Render
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send('Bot is active and running 24/7!');
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

app.listen(port, () => {
    console.log(`Web server is running on port ${port}`);
});

// إعداد عميل ديسكورد
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

// قائمة خاصة لتتبع الأعضاء الذين تم كتمهم بواسطة البوت حصرياً
const botMutedMembers = new Set();

// دالة لتوليد لوحة تحكم الرومات النشطة مع الأزرار، قوائم النقل، وقوائم الرسائل المنفردة
async function getVoiceControlPanel(guild) {
    await guild.channels.fetch();
    const activeVoiceChannels = guild.channels.cache.filter(c => c.isVoiceBased() && c.members.size > 0);
    
    // جلب جميع الرومات الصوتية مرتبة حسب ترتيب السيرفر (Position)
    const allVoiceChannels = guild.channels.cache
        .filter(c => c.isVoiceBased())
        .sort((a, b) => a.position - b.position);

    const embed = new EmbedBuilder()
        .setTitle('🎙️ لوحة تحكم الرومات النشطة')
        .setDescription('الرومات النشطة حالياً، مع أزرار الميوت، قوائم النقل، وقوائم إرسال الرسائل المنفردة:')
        .setColor(0x2f3136);

    const rows = [];

    if (activeVoiceChannels.size === 0) {
        embed.addFields({ name: 'الحالة', value: 'لا توجد رومات صوتية فيها أعضاء حالياً.' });
    } else {
        activeVoiceChannels.forEach(vc => {
            const memberCount = vc.members.size;
            
            // 1. أزرار الميوت والفك
            const muteRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`mute_${vc.id}`)
                    .setLabel(`🔇 ميوت ${vc.name} (${memberCount})`)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`unmute_${vc.id}`)
                    .setLabel(`🔊 فك ${vc.name} (${memberCount})`)
                    .setStyle(ButtonStyle.Success)
            );
            rows.push(muteRow);

            // 2. قائمة النقل المنفردة
            const moveOptions = [];
            allVoiceChannels.forEach(targetVc => {
                if (targetVc.id !== vc.id) {
                    moveOptions.push({
                        label: targetVc.name.slice(0, 100),
                        description: `نقل أعضاء ${vc.name} إلى هذا الروم`,
                        value: `move_${vc.id}_to_${targetVc.id}`
                    });
                }
            });

            if (moveOptions.length > 0) {
                const selectMoveMenu = new StringSelectMenuBuilder()
                    .setCustomId(`select_move_${vc.id}`)
                    .setPlaceholder(`📂 اختر روم لنقل أعضاء [ ${vc.name} ]...`)
                    .addOptions(moveOptions.slice(0, 25));

                rows.push(new ActionRowBuilder().addComponents(selectMoveMenu));
            }

            // 3. قائمة الرسائل المنفردة الخاصة بهذا الروم (مالها دخل بالميوت ولا النقل)
            const msgSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`msg_menu_${vc.id}`)
                .setPlaceholder(`✉️ خيارات الرسائل الخاصة لـ [ ${vc.name} ]`)
                .addOptions([
                    {
                        label: 'إرسال رسالة لمتواجدين هذا الروم فقط',
                        description: 'إرسال رسالة خاصة لكل شخص جالس داخل هذا الروم حالياً',
                        value: `send_vc_members_${vc.id}`
                    }
                ]);
            rows.push(new ActionRowBuilder().addComponents(msgSelectMenu));
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

// الحماية الذكية لميوت البوت وميوت الإداريين
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    if (guild.id !== GUILD_ID) return;

    const memberId = newState.id;

    if (botMutedMembers.has(memberId) && oldState.serverMute && !newState.serverMute) {
        if (newState.member && newState.member.voice) {
            await newState.member.voice.setMute(true).catch(() => {});
        }
    }

    if (panelMessage) {
        try {
            const panelData = await getVoiceControlPanel(guild);
            await panelMessage.edit(panelData).catch(() => {});
        } catch (error) {
            console.error('خطأ أثناء تحديث اللوحة:', error);
        }
    }
});

// تنفيذ الأزرار، القوائم المنسدلة، والنوافذ المنبثقة
client.on('interactionCreate', async interaction => {
    try {
        const guild = await interaction.guild.fetch();

        // 1. التعامل مع القوائم المنسدلة
        if (interaction.isStringSelectMenu()) {
            // أ. قائمة الرسائل الخاصة المنفردة
            if (interaction.customId.startsWith('msg_menu_')) {
                const selectedValue = interaction.values[0];
                if (selectedValue.startsWith('send_vc_members_')) {
                    const vcId = selectedValue.split('_')[3];
                    
                    // فتح نافذة منبثقة (Modal) لكتابة الرسالة الشخصية
                    const modal = new ModalBuilder()
                        .setCustomId(`modal_msg_${vcId}`)
                        .setTitle('اكتب رسالتك الشخصية');

                    const messageInput = new TextInputBuilder()
                        .setCustomId('custom_message_text')
                        .setLabel('محتوى الرسالة التي ستُرسل بالخاص:')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('اكتب هنا رسالتك الشخصية لمتواجدين الروم...')
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
                    return await interaction.showModal(modal);
                }
            }

            // ب. قائمة النقل
            if (interaction.customId.startsWith('select_move_')) {
                await interaction.deferUpdate();

                const selectedValue = interaction.values[0];
                const parts = selectedValue.split('_');
                const fromChannelId = parts[1];
                const targetChannelId = parts[3];

                const fromChannel = await guild.channels.fetch(fromChannelId).catch(() => {});
                const targetChannel = await guild.channels.fetch(targetChannelId).catch(() => {});

                if (!fromChannel || !targetChannel || !fromChannel.isVoiceBased() || !targetChannel.isVoiceBased()) return;

                const movePromises = [];
                fromChannel.members.forEach(member => {
                    if (member.voice) {
                        movePromises.push(member.voice.setChannel(targetChannel).catch(() => {}));
                    }
                });

                await Promise.all(movePromises);
            }
            return;
        }

        // 2. التعامل مع النوافذ المنبثقة (Modals) عند إرسال الرسالة الشخصية
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('modal_msg_')) {
                const vcId = interaction.customId.split('_')[2];
                const messageText = interaction.fields.getTextInputValue('custom_message_text');

                await interaction.deferReply({ ephemeral: true });

                const channel = await guild.channels.fetch(vcId).catch(() => {});
                if (!channel || !channel.isVoiceBased()) {
                    return interaction.editReply('❌ عذراً، هذا الروم لم يعد موجوداً أو فارغاً.');
                }

                let successCount = 0;
                let failCount = 0;

                for (const [memberId, member] of channel.members) {
                    if (!member.user.bot) {
                        try {
                            await member.send(messageText);
                            successCount++;
                        } catch (err) {
                            failCount++; // في حال كان الخاص مغلقاً
                        }
                    }
                }

                return interaction.editReply(`✅ تم إرسال رسالتك الشخصية بنجاح إلى **${successCount}** عضو في روم **${channel.name}**! (فشل لـ ${failCount} بسبب إغلاق الخاص).`);
            }
            return;
        }

        // 3. التعامل مع أزرار الميوت والفك القديمة
        if (!interaction.isButton()) return;

        const [action, channelId] = interaction.customId.split('_');
        if (action !== 'mute' && action !== 'unmute') return;

        await interaction.deferUpdate();

        const channel = await guild.channels.fetch(channelId).catch(() => {});
        if (!channel || !channel.isVoiceBased()) return;

        const shouldMute = (action === 'mute');
        const promises = [];

        channel.members.forEach(member => {
            if (member.voice) {
                if (shouldMute) {
                    botMutedMembers.add(member.id);
                    promises.push(member.voice.setMute(true).catch(() => {}));
                } else {
                    if (botMutedMembers.has(member.id)) {
                        botMutedMembers.delete(member.id);
                        promises.push(member.voice.setMute(false).catch(() => {}));
                    }
                }
            }
        });

        await Promise.all(promises);
    } catch (error) {
        console.error(error);
    }
});

client.login(process.env.DISCORD_TOKEN);
