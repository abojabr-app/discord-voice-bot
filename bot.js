const express = require('express');
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

const GUILD_ID = '1200422663424847882';
const LOG_CHANNEL_ID = '1539617469201915964';
const INBOX_CHANNEL_ID = '1555355545504850103';

const botMutedMembers = new Set();

async function getVoiceControlPanel(guild) {
    await guild.channels.fetch();
    const allVoiceChannels = guild.channels.cache
        .filter(c => c.isVoiceBased())
        .sort((a, b) => a.position - b.position);

    const embed = new EmbedBuilder()
        .setTitle('🎙️ لوحة تحكم الرومات النشطة والدائمة')
        .setDescription('إليك جميع الرومات الصوتية في السيرفر مع خيارات التحكم، النقل، وإرسال الرسائل الخاصة:')
        .setColor(0x2f3136);

    const rows = [];

    if (allVoiceChannels.size === 0) {
        embed.addFields({ name: 'الحالة', value: 'لا توجد رومات صوتية في السيرفر حالياً.' });
    } else {
        // قائمة منسوحة لاختيار الروم لعمليات الإرسال الخاصة تفادياً لحدود ديسكورد
        const msgOptions = [];
        allVoiceChannels.forEach(vc => {
            msgOptions.push({
                label: vc.name.slice(0, 100),
                description: `خيارات إرسال رسائل من روم: ${vc.name}`.slice(0, 100),
                value: `panel_msg_vc_${vc.id}`
            });
        });

        if (msgOptions.length > 0) {
            rows.appendItem ? null : null; // للتوضيح
            rows.push(new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('global_msg_select_room')
                    .setPlaceholder('✉️ اختر الروم لإرسال رسالة (لرول أو عضو)...')
                    .addOptions(msgOptions.slice(0, 25))
            ));
        }

        // عرض الرومات مع أزرار الميوت السريعة (نأخذ أول 8 رومات كحد أقصى عشان ما نتجاوز الحد المسموح للأزرار)
        let count = 0;
        allVoiceChannels.forEach(vc => {
            if (count >= 8) return; // حماية لعدم تجاوز الحد الأقصى للمكونات
            count++;

            const memberCount = vc.members.size;
            const muteRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`mute_${vc.id}`)
                    .setLabel(`🔇 ميوت ${vc.name.slice(0, 15)} (${memberCount})`)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`unmute_${vc.id}`)
                    .setLabel(`🔊 فك (${memberCount})`)
                    .setStyle(ButtonStyle.Success)
            );
            rows.push(muteRow);
        });
    }

    return { embeds: [embed], components: rows.slice(0, 25) };
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

client.on('messageCreate', async message => {
    if (message.guild || message.author.bot) return;

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const inboxChannel = await guild.channels.fetch(INBOX_CHANNEL_ID).catch(() => {});

        if (!inboxChannel || !inboxChannel.isTextBased()) return;

        const dmEmbed = new EmbedBuilder()
            .setTitle('📥 رد جديد في الخاص (DM)')
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 1024 }))
            .setDescription(message.content || '[رسالة تحتوى على مرفق أو صورة]')
            .addFields(
                { name: '👤 اسم العضو', value: `${message.author} (${message.author.tag})`, inline: true },
                { name: '🆔 الآيدي', value: `\`${message.author.id}\``, inline: true }
            )
            .setColor(0x5865F2)
            .setTimestamp()
            .setFooter({ text: guild.name, iconURL: guild.iconURL() });

        await inboxChannel.send({ embeds: [dmEmbed] });
    } catch (error) {
        console.error('خطأ أثناء تحويل رسالة الخاص:', error);
    }
});

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

client.on('interactionCreate', async interaction => {
    try {
        const guild = await interaction.guild.fetch();

        if (interaction.isRoleSelectMenu()) {
            if (interaction.customId.startsWith('role_select_')) {
                const vcId = interaction.customId.split('_')[2];
                const selectedRoleId = interaction.values[0];

                const modal = new ModalBuilder()
                    .setCustomId(`modal_role_msg_${vcId}_${selectedRoleId}`)
                    .setTitle('اكتب رسالة أصحاب الرول');

                const messageInput = new TextInputBuilder()
                    .setCustomId('role_message_text')
                    .setLabel('محتوى الرسالة:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('اكتب هنا رسالتك...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
                return await interaction.showModal(modal);
            }
        }

        if (interaction.isUserSelectMenu()) {
            if (interaction.customId.startsWith('user_select_')) {
                const vcId = interaction.customId.split('_')[2];
                const selectedUserId = interaction.values[0];

                const modal = new ModalBuilder()
                    .setCustomId(`modal_user_msg_${vcId}_${selectedUserId}`)
                    .setTitle('رسالة توجيه/تنبيه شخصية');

                const messageInput = new TextInputBuilder()
                    .setCustomId('user_message_text')
                    .setLabel('محتوى الرسالة الشخصية:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('اكتب التنبيه هنا...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
                return await interaction.showModal(modal);
            }
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'global_msg_select_room') {
                const selectedValue = interaction.values[0];
                const vcId = selectedValue.split('_')[3];

                const actionSelect = new StringSelectMenuBuilder()
                    .setCustomId(`action_type_menu_${vcId}`)
                    .setPlaceholder('⚙️ اختر نوع الإرسال المستهدف...')
                    .addOptions([
                        {
                            label: 'إرسال رسالة لأصحاب رول معين',
                            description: 'تحديد رول لإرسال رسالة خاصة لكل من يملكه',
                            value: `choose_role_${vcId}`
                        },
                        {
                            label: 'إرسال رسالة شخصية لعضو محدد',
                            description: 'تحديد شخص معين لإرسال تنبيه أو توجيه خاص له',
                            value: `choose_user_${vcId}`
                        }
                    ]);

                const row = new ActionRowBuilder().addComponents(actionSelect);
                return await interaction.reply({ content: '👇 اختر نوع الإرسال المطلوب:', components: [row], ephemeral: true });
            }

            if (interaction.customId.startsWith('action_type_menu_')) {
                const vcId = interaction.customId.split('_')[3];
                const selectedValue = interaction.values[0];

                if (selectedValue.startsWith('choose_role_')) {
                    const roleSelect = new RoleSelectMenuBuilder()
                        .setCustomId(`role_select_${vcId}`)
                        .setPlaceholder('🎯 اختر الرول المستهدف')
                        .setMinValues(1)
                        .setMaxValues(1);

                    const row = new ActionRowBuilder().addComponents(roleSelect);
                    return await interaction.update({ content: '👇 اختر الرول المطلوب إرسال الرسالة لأصحابه:', components: [row] });
                } 
                
                if (selectedValue.startsWith('choose_user_')) {
                    const userSelect = new UserSelectMenuBuilder()
                        .setCustomId(`user_select_${vcId}`)
                        .setPlaceholder('👤 اختر العضو المستهدف لتنبيهه')
                        .setMinValues(1)
                        .setMaxValues(1);

                    const row = new ActionRowBuilder().addComponents(userSelect);
                    return await interaction.update({ content: '👇 اختر العضو المطلوب إرسال الرسالة الشخصية له:', components: [row] });
                }
            }
            return;
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('modal_role_msg_')) {
                const parts = interaction.customId.split('_');
                const roleId = parts[4];
                const messageText = interaction.fields.getTextInputValue('role_message_text');

                await interaction.deferReply({ ephemeral: true });

                await guild.members.fetch();
                const targetRole = guild.roles.cache.get(roleId);
                const membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(roleId) && !m.user.bot);

                if (!targetRole || membersWithRole.size === 0) {
                    return interaction.editReply('❌ عذراً، لا يوجد أي عضو يملك هذا الرول حالياً.');
                }

                const roleEmbed = new EmbedBuilder()
                    .setTitle('📢 تنبيه إداري رسمي')
                    .setDescription(messageText)
                    .setColor(0x5865F2)
                    .setTimestamp()
                    .setFooter({ text: guild.name, iconURL: guild.iconURL() });

                let successCount = 0;
                let failCount = 0;

                for (const [memberId, member] of membersWithRole) {
                    try {
                        await member.send({ embeds: [roleEmbed] });
                        successCount++;
                    } catch (err) {
                        failCount++;
                    }
                }

                return interaction.editReply(`✅ تمت الإرسال بنجاح إلى **${successCount}** عضو يحملون رول **${targetRole.name}**! (فشل لـ ${failCount} بسبب إغلاق الخاص).`);
            }

            if (interaction.customId.startsWith('modal_user_msg_')) {
                const parts = interaction.customId.split('_');
                const userId = parts[4];
                const messageText = interaction.fields.getTextInputValue('user_message_text');

                await interaction.deferReply({ ephemeral: true });

                try {
                    const targetMember = await guild.members.fetch(userId);
                    if (!targetMember) {
                        return interaction.editReply('❌ لم يتم العثور على هذا العضو في السيرفر.');
                    }

                    const userEmbed = new EmbedBuilder()
                        .setTitle('✉️ توجيه أو تنبيه خاص لك')
                        .setDescription(messageText)
                        .setColor(0xFEE75C)
                        .setTimestamp()
                        .setFooter({ text: guild.name, iconURL: guild.iconURL() });

                    await targetMember.send({ embeds: [userEmbed] });
                    return interaction.editReply(`✅ تمت إرسال الرسالة الشخصية بنجاح إلى العضو **${targetMember.user.tag}**!`);
                } catch (err) {
                    return interaction.editReply('❌ فشل إرسال الرسالة الخاصة لهذا العضو (قد يكون مقفل الخاص).');
                }
            }
            return;
        }

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
