const express = require('express');
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send('Bot is active and running 24/7!');
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
const MANAGER_ROOM_ID = '1555573365748531251';
const DEPUTY_ROOM_ID = '1555941998819811439';

// رومات الانتخابات والقضاة
const PUBLIC_VOTE_ROOM = '1559895002769920010';
const ADMIN_VOTE_ROOM = '1559895171938652290';

// تخزين المرشحين والأصوات
const candidatesList = [];
const userVotedSet = new Set();

// جدول الرومات الخاصة وأصحابها
const SPECIAL_ROOMS = {
    '1329454808553357312': '890351885339480115',
    '1555941900773498951': '1200448943365034036',
    '1431905620230930473': '1218664301729026254',
    '1511922936297160834': '713105913334071358',
    '1527063216860172429': '1173308991619743865'
};

const voiceControlMessages = new Map();

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);
    try {
        const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
        if (!guild) return console.log('❌ السيرفر غير موجود أو الآيدي خاطئ');

        const cleanBotMessages = async (channel) => {
            if (!channel || !channel.isTextBased()) return;
            try {
                const fetched = await channel.messages.fetch({ limit: 50 });
                const botMsgs = fetched.filter(m => m.author.id === client.user.id);
                if (botMsgs.size > 0) {
                    await channel.bulkDelete(botMsgs, true).catch(async () => {
                        for (const [id, msg] of botMsgs) {
                            await msg.delete().catch(() => {});
                        }
                    });
                }
            } catch (e) {}
        };

        // 1. لوحة التحكم الرئيسية
        const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => {});
        if (logChannel && logChannel.isTextBased()) {
            await cleanBotMessages(logChannel);
            const embed = new EmbedBuilder()
                .setTitle('⚖️ لوحة التحكم الإدارية الرسمية')
                .setDescription('مرحباً بك في لوحة تحكم السيرفر الرسمية.\nاستخدم الأزرار أدناه للإرسال الموجه والتوجيهات الرسمية:')
                .setColor(0x2f3136);

            const rows = [];
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('global_send_role_btn').setLabel('📢 إرسال رسالة لرول معين').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('global_send_user_btn').setLabel('✉️ إرسال رسالة لعضو معين').setStyle(ButtonStyle.Secondary)
            ));

            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('send_to_server_channel_btn').setLabel('📂 إرسال رسالة لروم في السيرفر').setStyle(ButtonStyle.Success)
            ));

            await logChannel.send({ embeds: [embed], components: rows });
        }

        // 2. روم المسؤولين للانتخابات
        const adminVoteChan = await guild.channels.fetch(ADMIN_VOTE_ROOM).catch(() => {});
        if (adminVoteChan && adminVoteChan.isTextBased()) {
            await cleanBotMessages(adminVoteChan);
            const adminEmbed = new EmbedBuilder()
                .setTitle('⚖️ وزارة العدل - لوحة إدارة المترشحين (خاص للمسؤولين)')
                .setDescription('مرحباً بك في غرفة تحكم المسؤولين للانتخابات القضائية.\nيمكنك من هنا إضافة المتقدمين لمنصب القضاة ومتابعة عدد الأصوات السري لكل مرشح:')
                .setColor(0x111111)
                .setFooter({ text: 'وزارة العدل - قسم شؤون القضاء' });

            const adminRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('add_candidate_modal_btn').setLabel('➕ إضافة مرشح جديد للقضاة').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('view_votes_results_btn').setLabel('📊 عرض الأصوات والنتائج (سرية)').setStyle(ButtonStyle.Secondary)
            );

            await adminVoteChan.send({ embeds: [adminEmbed], components: [adminRow] });
        }

        // 3. روم العلَن للانتخابات
        const publicVoteChan = await guild.channels.fetch(PUBLIC_VOTE_ROOM).catch(() => {});
        if (publicVoteChan && publicVoteChan.isTextBased()) {
            await cleanBotMessages(publicVoteChan);
            const publicEmbed = new EmbedBuilder()
                .setTitle('⚖️ وزارة العدل - انتخابات القضاة الرسمية')
                .setDescription('المواطنين الكرام، انطلاقاً من تعزيز العدالة وشفافية الاختيار، تم فتح باب التصويت لاختيار قاضي جديد.\nيرجى الاطلاع على المرشحين أدناه والإدلاء بصوتكم بكل نزاهة (يحق لك التصويت مرة واحدة فقط ولا يمكنك التصويت لنفسك):')
                .setColor(0xC9B037)
                .setFooter({ text: 'وزارة العدل - الانتخابات القضائية' });

            const voteRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_voting_booth_btn').setLabel('🗳️ اضغط هنا للمشاركة والتصويت').setStyle(ButtonStyle.Primary)
            );

            await publicVoteChan.send({ embeds: [publicEmbed], components: [voteRow] });
        }

        // لوحة إدارة القروب
        const managerChannel = await guild.channels.fetch(MANAGER_ROOM_ID).catch(() => {});
        if (managerChannel && managerChannel.isTextBased()) {
            await cleanBotMessages(managerChannel);
            const managerEmbed = new EmbedBuilder()
                .setTitle('🛡️ لوحة إدارة القروب الرسمية')
                .setDescription('مرحباً بك يا مدير القروب. يمكنك من هنا إرسال التوجيهات الرسمية المعتمدة للأعضاء أو الرولات:')
                .setColor(0xFF0000);

            const managerRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('manager_send_role_btn').setLabel('📢 إرسال رسالة لرول معين').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('manager_send_user_btn').setLabel('✉️ إرسال رسالة لعضو معين').setStyle(ButtonStyle.Secondary)
            );

            await managerChannel.send({ embeds: [managerEmbed], components: [managerRow] });
        }

        // لوحة نائب المدير
        const deputyChannel = await guild.channels.fetch(DEPUTY_ROOM_ID).catch(() => {});
        if (deputyChannel && deputyChannel.isTextBased()) {
            await cleanBotMessages(deputyChannel);
            const deputyEmbed = new EmbedBuilder()
                .setTitle('🛡️ لوحة إدارة نائب المدير الرسمية')
                .setDescription('مرحباً بك يا نائب المدير. يمكنك من هنا إرسال التوجيهات والإشعارات الرسمية للأعضاء أو الرولات:')
                .setColor(0x3498DB);

            const deputyRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('deputy_send_role_btn').setLabel('📢 إرسال رسالة لرول معين').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('deputy_send_user_btn').setLabel('✉️ إرسال رسالة لعضو معين').setStyle(ButtonStyle.Secondary)
            );

            await deputyChannel.send({ embeds: [deputyEmbed], components: [deputyRow] });
        }
    } catch (error) {
        console.error('خطأ عند بدء البوت:', error);
    }
});

// التعامل مع الدخول للرومات الصوتية والتنبيهات
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    if (!guild || guild.id !== GUILD_ID) return;

    const memberId = newState.id;

    if (newState.channel && SPECIAL_ROOMS[newState.channel.id]) {
        const ownerId = SPECIAL_ROOMS[newState.channel.id];
        if (memberId !== ownerId) {
            const isOwnerInside = newState.channel.members.has(ownerId);
            if (!isOwnerInside) {
                try {
                    const ownerMember = await guild.members.fetch(ownerId).catch(() => null);
                    if (ownerMember) {
                        const alertEmbed = new EmbedBuilder()
                            .setTitle('🚨 تنبيه: شخص دخل رومك الخاص!')
                            .setDescription(`دخل شخص إلى رومك الصوتي وصاحب الروم غير موجود داخله حالياً.`)
                            .addFields(
                                { name: '👤 الشخص الداخل', value: `${newState.member} (\`${newState.member.user.tag}\`)`, inline: true },
                                { name: '🔊 اسم الروم', value: `${newState.channel.name}`, inline: true }
                            )
                            .setColor(0xED4245)
                            .setTimestamp();

                        await ownerMember.send({ embeds: [alertEmbed] }).catch(() => {});
                    }
                } catch (e) {}
            }
        }
    }

    const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => {});
    if (!logChannel || !logChannel.isTextBased()) return;

    if (oldState.channel && oldState.channel.members.size === 0) {
        if (voiceControlMessages.has(oldState.channel.id)) {
            try {
                const msg = await logChannel.messages.fetch(voiceControlMessages.get(oldState.channel.id));
                if (msg) await msg.delete();
            } catch (e) {}
            voiceControlMessages.delete(oldState.channel.id);
        }
    }

    if (newState.channel && newState.channel.members.size > 0) {
        const vc = newState.channel;
        if (!voiceControlMessages.has(vc.id)) {
            const embed = new EmbedBuilder()
                .setTitle(`🎛️ خيارات الروم الصوتي: ${vc.name}`)
                .setDescription(`تم دخول أعضاء إلى هذا الروم. استخدم الأزرار أدناه لكتم أو فك الكتم عن أعضاء الروم:`)
                .setColor(0x2f3136)
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`mute_room_${vc.id}`).setLabel('🔇 كتم أعضاء الروم').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`unmute_room_${vc.id}`).setLabel('🔊 فك الكتم').setStyle(ButtonStyle.Success)
            );

            try {
                const sentMsg = await logChannel.send({ embeds: [embed], components: [row] });
                voiceControlMessages.set(vc.id, sentMsg.id);
            } catch (err) {}
        }
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (!message.guild) {
        try {
            const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
            if (!guild) return;

            const inboxChannel = await guild.channels.fetch(INBOX_CHANNEL_ID).catch(() => {});
            if (!inboxChannel || !inboxChannel.isTextBased()) return;

            const dmEmbed = new EmbedBuilder()
                .setTitle('📥 رسالة جديدة من عضو بالخاص')
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 1024 }))
                .setDescription(message.content || '[رسالة تحتوي على مرفق أو صورة]')
                .addFields(
                    { name: '👤 اسم العضو', value: `${message.author} (\`${message.author.tag}\`)`, inline: true },
                    { name: '🆔 الآيدي', value: `\`${message.author.id}\``, inline: true }
                )
                .setColor(0x5865F2)
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`reply_user_modal_admin_${message.author.id}`)
                    .setLabel('💬 الرد على العضو (إداري)')
                    .setStyle(ButtonStyle.Primary)
            );

            await inboxChannel.send({ embeds: [dmEmbed], components: [row] });
        } catch (err) {}
    }
});

client.on('interactionCreate', async interaction => {
    try {
        const guild = interaction.guild;
        if (!guild) return;

        const inboxChannel = await guild.channels.fetch(INBOX_CHANNEL_ID).catch(() => {});

        const getSenderInfo = (int) => {
            if (int.channelId === MANAGER_ROOM_ID || int.customId.includes('manager')) {
                return { title: 'توجيه رسمي من مدير القروب', label: 'مدير القروب' };
            }
            if (int.channelId === DEPUTY_ROOM_ID || int.customId.includes('deputy')) {
                return { title: 'توجيه رسمي من نائب المدير', label: 'نائب المدير' };
            }
            return { title: `توجيه رسمي من الإدارة (${int.user.username})`, label: 'إداري عام' };
        };

        if (interaction.isButton()) {
            const customId = interaction.customId;

            if (customId === 'add_candidate_modal_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_add_candidate')
                    .setTitle('وزارة العدل - إضافة مرشح قاضي جديد');

                const nameInput = new TextInputBuilder()
                    .setCustomId('cand_name')
                    .setLabel('الاسم الأساسي للمرشح:')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('مثال: القاضي فلان...')
                    .setRequired(true);

                const idInput = new TextInputBuilder()
                    .setCustomId('cand_user_id')
                    .setLabel('آيدي حساب ديسكورد للمرشح (User ID):')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('ألصق آيدي العضو هنا...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(idInput));
                return await interaction.showModal(modal);
            }

            if (customId === 'view_votes_results_btn') {
                if (candidatesList.length === 0) {
                    return await interaction.reply({ content: '⚠️ لا يوجد أي مرشحين مضافين حتى الآن في النظام.', ephemeral: true });
                }

                let resultsDesc = '📊 **إحصائيات الأصوات الحالية (خاص بالمسؤولين):**\n\n';
                candidatesList.forEach((c, index) => {
                    resultsDesc += `**${index + 1}. المرشح:** ${c.name} (<@${c.userId}>)\n📌 **عدد الأصوات:** \`${c.votes.size} صوت\`\n----------------------------------\n`;
                });

                const resEmbed = new EmbedBuilder()
                    .setTitle('⚖️ وزارة العدل - نتائج الأصوات السرية')
                    .setDescription(resultsDesc)
                    .setColor(0xC9B037)
                    .setTimestamp();

                return await interaction.reply({ embeds: [resEmbed], ephemeral: true });
            }

            if (customId === 'open_voting_booth_btn') {
                if (userVotedSet.has(interaction.user.id)) {
                    return await interaction.reply({ content: '❌ عذراً، لقد قمت بالتصويت مسبقاً ولا يمكنك التصويت مرتين!', ephemeral: true });
                }

                if (candidatesList.length === 0) {
                    return await interaction.reply({ content: '⚠️ لم يتم اعتماد أي مرشحين للانتخابات حتى الآن من قبل المسؤولين.', ephemeral: true });
                }

                const options = candidatesList.map(c => ({
                    label: c.name.slice(0, 100),
                    description: `تصويت لصالح المرشح المعتمد`.slice(0, 100),
                    value: `vote_for_${c.userId}`
                }));

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('public_vote_select_menu')
                    .setPlaceholder('🗳️ اختر المرشح الذي تود انتخابه...')
                    .addOptions(options.slice(0, 25));

                return await interaction.reply({
                    content: '👇 اختر من القائمة أدناه مرشحك المناسب لمنصب القاضي:',
                    components: [new ActionRowBuilder().addComponents(selectMenu)],
                    ephemeral: true
                });
            }

            if (customId.startsWith('mute_room_') || customId.startsWith('unmute_room_')) {
                const parts = customId.split('_');
                const action = parts[0]; 
                const channelId = parts[2];

                await interaction.deferUpdate();

                const channel = await guild.channels.fetch(channelId).catch(() => {});
                if (!channel || !channel.isVoiceBased()) return;

                const shouldMute = (action === 'mute');
                const promises = [];

                channel.members.forEach(member => {
                    if (member.voice) {
                        promises.push(member.voice.setMute(shouldMute).catch(() => {}));
                    }
                });

                await Promise.all(promises);
                return;
            }

            if (customId === 'send_to_server_channel_btn') {
                const channelSelect = new ChannelSelectMenuBuilder()
                    .setCustomId('direct_channel_select')
                    .setPlaceholder('📂 ابحث عن الروم بالاسم...')
                    .addChannelTypes(ChannelType.GuildText)
                    .setMinValues(1)
                    .setMaxValues(1);

                const manualButton = new ButtonBuilder()
                    .setCustomId('manual_channel_btn')
                    .setLabel('إذا لم تجد الروم اضغط هنا (بالآيدي)')
                    .setStyle(ButtonStyle.Secondary);

                return await interaction.reply({ 
                    content: '👇 اختر الروم من القائمة، أو اضغط الزر الأسفل للإدخال اليدوي بالآيدي:', 
                    components: [new ActionRowBuilder().addComponents(channelSelect), new ActionRowBuilder().addComponents(manualButton)], 
                    ephemeral: true 
                });
            }

            if (customId === 'manual_channel_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_id_channel')
                    .setTitle('إرسال رسالة لروم (بالآيدي اليدوي)');

                const idInput = new TextInputBuilder().setCustomId('target_id').setLabel('آيدي الروم (Channel ID):').setStyle(TextInputStyle.Short).setRequired(true);
                const msgInput = new TextInputBuilder().setCustomId('target_msg').setLabel('محتوى الرسالة الرسمية:').setStyle(TextInputStyle.Paragraph).setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(idInput), new ActionRowBuilder().addComponents(msgInput));
                return await interaction.showModal(modal);
            }

            if (customId.startsWith('reply_user_modal_')) {
                const parts = customId.split('_');
                const userId = parts[parts.length - 1];
                let suffix = 'admin';
                if (interaction.channelId === MANAGER_ROOM_ID) suffix = 'manager';
                if (interaction.channelId === DEPUTY_ROOM_ID) suffix = 'deputy';

                const modal = new ModalBuilder()
                    .setCustomId(`modal_direct_reply_${suffix}_${userId}`)
                    .setTitle('الرد الرسمي المباشر على العضو');

                const msgInput = new TextInputBuilder()
                    .setCustomId('reply_text')
                    .setLabel('محتوى الرد:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('اكتب ردك هنا...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(msgInput));
                return await interaction.showModal(modal);
            }

            if (customId === 'global_send_role_btn' || customId === 'manager_send_role_btn' || customId === 'deputy_send_role_btn') {
                let suffix = 'admin';
                if (customId.includes('manager')) suffix = 'manager';
                if (customId.includes('deputy')) suffix = 'deputy';

                const roleSelect = new RoleSelectMenuBuilder()
                    .setCustomId(`direct_role_select_${suffix}`)
                    .setPlaceholder('🎯 ابحث عن الرول بالاسم...')
                    .setMinValues(1)
                    .setMaxValues(1);

                const manualButton = new ButtonBuilder()
                    .setCustomId(`manual_role_btn_${suffix}`)
                    .setLabel('إذا لم تجد الرول اضغط هنا (بالآيدي)')
                    .setStyle(ButtonStyle.Secondary);

                return await interaction.reply({ 
                    content: '👇 اختر الرول من القائمة، أو اضغط الزر الأسفل للإدخال اليدوي بالآيدي:', 
                    components: [new ActionRowBuilder().addComponents(roleSelect), new ActionRowBuilder().addComponents(manualButton)], 
                    ephemeral: true 
                });
            }

            if (customId === 'global_send_user_btn' || customId === 'manager_send_user_btn' || customId === 'deputy_send_user_btn') {
                let suffix = 'admin';
                if (customId.includes('manager')) suffix = 'manager';
                if (customId.includes('deputy')) suffix = 'deputy';

                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId(`direct_user_select_${suffix}`)
                    .setPlaceholder('👤 ابحث عن العضو بالاسم...')
                    .setMinValues(1)
                    .setMaxValues(1);

                const manualButton = new ButtonBuilder()
                    .setCustomId(`manual_user_btn_${suffix}`)
                    .setLabel('إذا لم تجد العضو اضغط هنا (بالآيدي)')
                    .setStyle(ButtonStyle.Secondary);

                return await interaction.reply({ 
                    content: '👇 اختر العضو من القائمة، أو اضغط الزر الأسفل للإدخال اليدوي بالآيدي:', 
                    components: [new ActionRowBuilder().addComponents(userSelect), new ActionRowBuilder().addComponents(manualButton)], 
                    ephemeral: true 
                });
            }

            if (customId.startsWith('manual_role_btn_')) {
                const suffix = customId.replace('manual_role_btn_', '');
                const modal = new ModalBuilder()
                    .setCustomId(`modal_id_role_${suffix}`)
                    .setTitle('إرسال رسالة لرول (بالآيدي اليدوي)');

                const idInput = new TextInputBuilder().setCustomId('target_id').setLabel('آيدي الرول (Role ID):').setStyle(TextInputStyle.Short).setRequired(true);
                const msgInput = new TextInputBuilder().setCustomId('target_msg').setLabel('محتوى الرسالة الرسمية:').setStyle(TextInputStyle.Paragraph).setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(idInput), new ActionRowBuilder().addComponents(msgInput));
                return await interaction.showModal(modal);
            }

            if (customId.startsWith('manual_user_btn_')) {
                const suffix = customId.replace('manual_user_btn_', '');
                const modal = new ModalBuilder()
                    .setCustomId(`modal_id_user_${suffix}`)
                    .setTitle('إرسال رسالة لعضو (بالآيدي اليدوي)');

                const idInput = new TextInputBuilder().setCustomId('target_id').setLabel('آيدي العضو (User ID):').setStyle(TextInputStyle.Short).setRequired(true);
                const msgInput = new TextInputBuilder().setCustomId('target_msg').setLabel('محتوى الرسالة الرسمية:').setStyle(TextInputStyle.Paragraph).setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(idInput), new ActionRowBuilder().addComponents(msgInput));
                return await interaction.showModal(modal);
            }
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'public_vote_select_menu') {
                if (userVotedSet.has(interaction.user.id)) {
                    return await interaction.reply({ content: '❌ عذراً، لقد قمت بالتصويت مسبقاً!', ephemeral: true });
                }

                const selectedVal = interaction.values[0];
                const targetUserId = selectedVal.replace('vote_for_', '');

                if (interaction.user.id === targetUserId) {
                    return await interaction.reply({ content: '❌ لا يمكنك التصويت لنفسك في الانتخابات!', ephemeral: true });
                }

                const candidate = candidatesList.find(c => c.userId === targetUserId);
                if (!candidate) {
                    return await interaction.reply({ content: '❌ عذراً، هذا المرشح لم يعد موجوداً في القائمة.', ephemeral: true });
                }

                candidate.votes.add(interaction.user.id);
                userVotedSet.add(interaction.user.id);

                return await interaction.reply({
                    content: `✅ **تم اعتماد صوتك بنجاح لصالح المرشح:** ${candidate.name} (<@${candidate.userId}>).\nشكراً لمشاركتك في العملية الانتخابية لوزارة العدل.`,
                    ephemeral: true
                });
            }
        }

        if (interaction.isChannelSelectMenu() && interaction.customId === 'direct_channel_select') {
            const selectedChannelId = interaction.values[0];
            const modal = new ModalBuilder()
                .setCustomId(`modal_channel_msg_${selectedChannelId}`)
                .setTitle('اكتب رسالة الروم الرسمية');

            const messageInput = new TextInputBuilder().setCustomId('channel_message_text').setLabel('محتوى الرسالة:').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
            return await interaction.showModal(modal);
        }

        if (interaction.isRoleSelectMenu()) {
            let suffix = 'admin';
            if (interaction.customId.includes('_manager')) suffix = 'manager';
            if (interaction.customId.includes('_deputy')) suffix = 'deputy';

            const selectedRoleId = interaction.values[0];
            const modal = new ModalBuilder()
                .setCustomId(`modal_role_msg_${suffix}_${selectedRoleId}`)
                .setTitle('اكتب رسالة الرول الرسمية');

            const messageInput = new TextInputBuilder().setCustomId('role_message_text').setLabel('محتوى الرسالة:').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
            return await interaction.showModal(modal);
        }

        if (interaction.isUserSelectMenu()) {
            let suffix = 'admin';
            if (interaction.customId.includes('_manager')) suffix = 'manager';
            if (interaction.customId.includes('_deputy')) suffix = 'deputy';

            const selectedUserId = interaction.values[0];
            const modal = new ModalBuilder()
                .setCustomId(`modal_user_msg_${suffix}_${selectedUserId}`)
                .setTitle('رسالة توجيه رسمية شخصية');

            const messageInput = new TextInputBuilder().setCustomId('user_message_text').setLabel('محتوى الرسالة:').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
            return await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit()) {
            const customId = interaction.customId;
            const senderInfo = getSenderInfo(interaction);

            if (customId === 'modal_add_candidate') {
                const candName = interaction.fields.getTextInputValue('cand_name').trim();
                const candUserId = interaction.fields.getTextInputValue('cand_user_id').trim();

                candidatesList.push({
                    name: candName,
                    userId: candUserId,
                    votes: new Set()
                });

                return await interaction.reply({
                    content: `✅ **تمت إضافة المرشح بنجاح إلى قائمة قضاة المستقبل:**\n📌 **الاسم:** ${candName}\n👤 **الحساب:** <@${candUserId}> (\`${candUserId}\`)`,
                    ephemeral: true
                });
            }

            if (customId.startsWith('modal_channel_msg_') || customId === 'modal_id_channel') {
                let targetChannelId, channelMsg;

                if (customId.startsWith('modal_channel_msg_')) {
                    targetChannelId = customId.replace('modal_channel_msg_', '');
                    channelMsg = interaction.fields.getTextInputValue('channel_message_text');
                } else {
                    targetChannelId = interaction.fields.getTextInputValue('target_id').trim();
                    channelMsg = interaction.fields.getTextInputValue('target_msg');
                }

                await interaction.deferReply({ ephemeral: true });
                try {
                    const targetChannel = await guild.channels.fetch(targetChannelId).catch(() => null);
                    if (!targetChannel || !targetChannel.isTextBased()) {
                        return interaction.editReply('❌ عذراً، لم يتم العثور على الروم أو أنه ليس روم كتابي.');
                    }

                    const channelEmbed = new EmbedBuilder()
                        .setTitle(`📢 ${senderInfo.title}`)
                        .setDescription(channelMsg)
                        .setColor(0x2f3136)
                        .setTimestamp();

                    await targetChannel.send({ embeds: [channelEmbed] });

                    if (inboxChannel && inboxChannel.isTextBased()) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('📢 رسالة إدارية تم إرسالها لروم في السيرفر')
                            .addFields(
                                { name: '👤 المرسل', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                                { name: '🏷️ الصفة', value: `\`${senderInfo.label}\``, inline: true },
                                { name: '📂 الروم المستهدف', value: `${targetChannel} (\`${targetChannel.id}\`)`, inline: true },
                                { name: '💬 محتوى الرسالة', value: channelMsg, inline: false }
                            )
                            .setColor(0x57F287)
                            .setTimestamp();
                        await inboxChannel.send({ embeds: [logEmbed] }).catch(() => {});
                    }

                    return interaction.editReply(`✅ تم إرسال الرسالة الرسمية بنجاح إلى الروم ${targetChannel}!`);
                } catch (err) {
                    return interaction.editReply('❌ فشل إرسال الرسالة، تأكد من صحة آيدي الروم وأن البوت يملك صلاحية الإرسال هناك.');
                }
            }

            if (customId.startsWith('modal_direct_reply_')) {
                const parts = customId.split('_');
                const suffix = parts[3];
                const userId = parts[4];
                const replyText = interaction.fields.getTextInputValue('reply_text');

                let customSenderInfo = { title: 'توجيه رسمي من إدارة السيرفر', label: 'إداري عام' };
                if (suffix === 'manager') customSenderInfo = { title: 'توجيه رسمي من مدير القروب', label: 'مدير القروب' };
                if (suffix === 'deputy') customSenderInfo = { title: 'توجيه رسمي من نائب المدير', label: 'نائب المدير' };

                await interaction.deferReply({ ephemeral: true });
                try {
                    const targetMember = await guild.members.fetch(userId).catch(() => null);
                    if (!targetMember) return interaction.editReply('❌ عذراً، لم يتم العثور على هذا العضو.');

                    const replyEmbed = new EmbedBuilder()
                        .setTitle(`🛡️ ${customSenderInfo.title}`)
                        .setDescription(replyText)
                        .setColor(0xFEE75C)
                        .setTimestamp();

                    await targetMember.send({ embeds: [replyEmbed] });

                    if (inboxChannel && inboxChannel.isTextBased()) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('📤 رد إداري تم إرساله لعضو')
                            .addFields(
                                { name: '👤 المرسل', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                                { name: '🏷️ الصفة', value: `\`${customSenderInfo.label}\``, inline: true },
                                { name: '👥 العضو المستهدف', value: `${targetMember} (\`${targetMember.user.tag}\`)`, inline: true },
                                { name: '💬 محتوى الرد', value: replyText, inline: false }
                            )
                            .setColor(0x57F287)
                            .setTimestamp();
                        await inboxChannel.send({ embeds: [logEmbed] }).catch(() => {});
                    }

                    return interaction.editReply(`✅ تم إرسال الرد بنجاح إلى العضو **${targetMember.user.tag}**!`);
                } catch (err) {
                    return interaction.editReply('❌ فشل إرسال الرد (قد يكون مقفل الخاص).');
                }
            }

            if (customId.startsWith('modal_role_msg_') || customId.startsWith('modal_id_role_')) {
                let type, roleId, messageText;

                if (customId.startsWith('modal_role_msg_')) {
                    const parts = customId.split('_');
                    type = parts[3];
                    roleId = parts[4];
                    messageText = interaction.fields.getTextInputValue('role_message_text');
                } else {
                    const parts = customId.split('_');
                    type = parts[3];
                    roleId = interaction.fields.getTextInputValue('target_id').trim();
                    messageText = interaction.fields.getTextInputValue('target_msg');
                }

                let customSenderInfo = { title: 'توجيه رسمي من إدارة السيرفر', label: 'إداري عام' };
                if (type === 'manager') customSenderInfo = { title: 'توجيه رسمي من مدير القروب', label: 'مدير القروب' };
                if (type === 'deputy') customSenderInfo = { title: 'توجيه رسمي من نائب المدير', label: 'نائب المدير' };

                await interaction.deferReply({ ephemeral: true });
                const targetRole = await guild.roles.fetch(roleId).catch(() => null);
                if (!targetRole) return interaction.editReply('❌ عذراً، لم يتم العثور على رول بهذا الآيدي.');

                await guild.members.fetch();
                const membersWithRole = Array.from(targetRole.members.filter(m => !m.user.bot).values());

                const roleEmbed = new EmbedBuilder()
                    .setTitle(`📢 ${customSenderInfo.title}`)
                    .setDescription(messageText)
                    .setColor(0x5865F2)
                    .setTimestamp();

                let successCount = 0;
                let failedUsers = [];

                for (const member of membersWithRole) {
                    try {
                        await member.send({ embeds: [roleEmbed] });
                        successCount++;
                        await new Promise(resolve => setTimeout(resolve, 300));
                    } catch (err) {
                        failedUsers.push(`${member} (\`${member.user.tag}\` - ID: \`${member.id}\`)`);
                    }
                }

                if (inboxChannel && inboxChannel.isTextBased()) {
                    let deliveryStatus = "✅ تم الإرسال بنجاح لجميع الأعضاء بدون أخطاء.";
                    if (failedUsers.length > 0) {
                        deliveryStatus = `⚠️ لم يكتمل الإرسال للبعض!\n**العدد (${failedUsers.length}):**\n` + failedUsers.join('\n') + `\n*(السبب: قد يكون الخاص مغلقاً)*`;
                    }

                    const logEmbed = new EmbedBuilder()
                        .setTitle('📢 تقرير إرسال رسالة جماعية لرول')
                        .addFields(
                            { name: '👤 المرسل', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                            { name: '🏷️ الصفة', value: `\`${customSenderInfo.label}\``, inline: true },
                            { name: '🎯 الرول المستهدف', value: `${targetRole.name} (\`${targetRole.id}\`)`, inline: true },
                            { name: '📊 نسبة الوصول', value: `تم الإرسال بنجاح إلى **${successCount}** من أصل **${membersWithRole.length}** عضو`, inline: false },
                            { name: '📝 حالة التسليم والتفاصيل', value: deliveryStatus, inline: false },
                            { name: '💬 محتوى الرسالة', value: messageText, inline: false }
                        )
                        .setColor(failedUsers.length === 0 ? 0x57F287 : 0xED4245)
                        .setTimestamp();

                    await inboxChannel.send({ embeds: [logEmbed] }).catch(() => {});
                }

                return interaction.editReply(`✅ تم إنهاء الإرسال! وصل بنجاح إلى **${successCount}** من **${membersWithRole.length}** عضو.`);
            }

            if (customId.startsWith('modal_user_msg_') || customId.startsWith('modal_id_user_')) {
                let type, userId, messageText;

                if (customId.startsWith('modal_user_msg_')) {
                    const parts = customId.split('_');
                    type = parts[3];
                    userId = parts[4];
                    messageText = interaction.fields.getTextInputValue('user_message_text');
                } else {
                    const parts = customId.split('_');
                    type = parts[3];
                    userId = interaction.fields.getTextInputValue('target_id').trim();
                    messageText = interaction.fields.getTextInputValue('target_msg');
                }

                let customSenderInfo = { title: 'توجيه رسمي من إدارة السيرفر', label: 'إداري عام' };
                if (type === 'manager') customSenderInfo = { title: 'توجيه رسمي من مدير القروب', label: 'مدير القروب' };
                if (type === 'deputy') customSenderInfo = { title: 'توجيه رسمي من نائب المدير', label: 'نائب المدير' };

                await interaction.deferReply({ ephemeral: true });
                try {
                    const targetMember = await guild.members.fetch(userId).catch(() => null);
                    if (!targetMember) return interaction.editReply('❌ عذراً، لم يتم العثور على هذا العضو.');

                    const userEmbed = new EmbedBuilder()
                        .setTitle(`🛡️ ${customSenderInfo.title}`)
                        .setDescription(messageText)
                        .setColor(0xFEE75C)
                        .setTimestamp();

                    await targetMember.send({ embeds: [userEmbed] });

                    if (inboxChannel && inboxChannel.isTextBased()) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('✉️ رسالة إدارية خاصة تم إرسالها لعضو')
                            .addFields(
                                { name: '👤 المرسل', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                                { name: '🏷️ الصفة', value: `\`${customSenderInfo.label}\``, inline: true },
                                { name: '👥 العضو المستهدف', value: `${targetMember} (\`${targetMember.user.tag}\`)`, inline: true },
                                { name: '💬 محتوى الرسالة', value: messageText, inline: false }
                            )
                            .setColor(0x3498DB)
                            .setTimestamp();
                        await inboxChannel.send({ embeds: [logEmbed] }).catch(() => {});
                    }

                    return interaction.editReply(`✅ تمت إرسال الرسالة بنجاح إلى العضو **${targetMember.user.tag}**!`);
                } catch (err) {
                    return interaction.editReply('❌ فشل إرسال الرسالة الخاصة (قد يكون مقفل الخاص).');
                }
            }
        }
    } catch (error) {
        console.error('خطأ في التفاعل:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);
