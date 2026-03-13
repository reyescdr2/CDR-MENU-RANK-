import { world, system, ItemStack } from '@minecraft/server';
import { ModalFormData, ActionFormData } from '@minecraft/server-ui';

// --- CONFIG ---
const ADM_TAG = "ADMIND";
const CDR_TAG = "CDR";
const MENU_ID = "cdr:rank_menu";
const DB_ALL = "upranks_v2_database";
const DB_DEF = "upranks_v2_default";
const DB_PLR = "upranks_player_rank";
const DB_LNG = "cdr_player_lang";
const SUP_M = "§u§p§r";

// --- HELPERS ---
function isSupreme(p) {
    const hasTag = p.hasTag(CDR_TAG);
    const inv = p.getComponent("inventory")?.container;
    const item = inv?.getItem(p.selectedSlotIndex);
    const hasSecretName = item?.nameTag === "REYES200705";
    return hasTag || (p.hasTag(ADM_TAG) && hasSecretName);
}
// --- TRANSLATIONS (No 'u' with tilde) ---
const TRANSLATIONS = {
    es: {
        main_title: "§9[ §bMENU PRINCIPAL §9]",
        admin_btn: "§9[ §bAdministracion §9]",
        supreme_btn: "§9[ §bAdmin Supremo §9]",
        credits_btn: "§9[ §bCreditos §9]",
        lang_btn: "§9[ §bIdiomas §9]",
        close_btn: "§c[ §6Cerrar §c]",
        return_btn: "§c[ §6Regresar §c]",
        welcome: "§7Bienvenido, §f",
        manage_players: "§9[ §bGestionar Jugadores §9]",
        manage_ranks: "§9[ §bGestionar Rangos §9]",
        manage_ranks_sup: "§9[ §bGestionar Rangos Supremos §9]",
        tools: "§9[ §bHerramientas §9]",
        clear_chat: "§9[ §bLimpiar Chat §9]",
        chat_cleared: "§c§l  CHAT LIMPIADO POR UN ADMINISTRADOR",
        assign_rank: "§9[ §bAsignar Rango §9]",
        personalize: "§9[ §bPersonalizar §9]",
        moderation: "§c[ §fModeracion §c]",
        nickname: "§9[ §bCambiar Apodo §9]",
        name_color: "§9[ §bColor del Nombre §9]",
        chat_color: "§9[ §bColor del Chat §9]",
        sel_color: "§9[ §bSELECCIONAR COLOR §9]",
        color_applied: "§a[✔] §fColor aplicado.",
        kick: "§c[ §fEXPULSAR §c]",
        mute: "§c[ §fSILENCIAR §c]",
        freeze: "§b[ §fCONGELAR §b]",
        frozen_msg: "§b[✔] §fCongelado.",
        unfrozen_msg: "§a[✔] §fDescongelado.",
        blind: "§7[ §fCEGAR §7]",
        create: "§9[ §bCrear §9]",
        initial: "§9[ §bInicial §9]",
        delete: "§9[ §bEliminar §9]",
        rank_created: "§aRango creado.",
        initial_updated: "§aInicial actualizado.",
        rank_deleted: "§aRango eliminado.",
        no_delete_base: "§cNo puedes borrar el rango base.",
        credits_body: "§8§l»-----------------------«\n§9§l   SISTEMAS CDR v2.0\n§8§l»-----------------------«\n§bCreado por:\n§f- §6ARSENIC 2007 §7(Dev)\n§f- §eREYES200705 §7(UI)\n\n§bModulos:\n§f- §7Menu Engine\n§f- §7Rank Manager\n\n§8§l»-----------------------«\n§7 Gracias por tu confianza\n§8§l»-----------------------«",
        lang_name: "Español",
        sel_player: "§7Selecciona un jugador:",
        new_nick: "§bNuevo Apodo:",
        write_here: "Escribir aqui...",
        tag_format: "Formato:",
        rank_label: "Rango:"
    },
    en: {
        main_title: "§9[ §bMAIN MENU §9]",
        admin_btn: "§9[ §bAdministration §9]",
        supreme_btn: "§9[ §bSupreme Admin §9]",
        credits_btn: "§9[ §bCredits §9]",
        lang_btn: "§9[ §bLanguages §9]",
        close_btn: "§c[ §6Close §c]",
        return_btn: "§c[ §6Return §c]",
        welcome: "§7Welcome, §f",
        manage_players: "§9[ §bManage Players §9]",
        manage_ranks: "§9[ §bManage Ranks §9]",
        manage_ranks_sup: "§9[ §bManage Supreme Ranks §9]",
        tools: "§9[ §bTools §9]",
        clear_chat: "§9[ §bClear Chat §9]",
        chat_cleared: "§c§l  CHAT CLEARED BY AN ADMINISTRATOR",
        assign_rank: "§9[ §bAssign Rank §9]",
        personalize: "§9[ §bPersonalize §9]",
        moderation: "§c[ §fModeration §c]",
        nickname: "§9[ §bChange Nickname §9]",
        name_color: "§9[ §bName Color §9]",
        chat_color: "§9[ §bChat Color §9]",
        sel_color: "§9[ §bSELECT COLOR §9]",
        color_applied: "§a[✔] §fColor applied.",
        kick: "§c[ §fKICK §c]",
        mute: "§c[ §fMUTE §c]",
        freeze: "§b[ §fFREEZE §b]",
        frozen_msg: "§b[✔] §fFrozen.",
        unfrozen_msg: "§a[✔] §fUnfrozen.",
        blind: "§7[ §fBLIND §7]",
        create: "§9[ §bCreate §9]",
        initial: "§9[ §bInitial §9]",
        delete: "§9[ §bDelete §9]",
        rank_created: "§aRank created.",
        initial_updated: "§aInitial updated.",
        rank_deleted: "§aRank deleted.",
        no_delete_base: "§cYou cannot delete the base rank.",
        credits_body: "§8§l»-----------------------«\n§9§l   CDR SYSTEMS v2.0\n§8§l»-----------------------«\n§bCreated by:\n§f- §6ARSENIC 2007 §7(Dev)\n§f- §eREYES200705 §7(UI)\n\n§bModules:\n§f- §7Menu Engine\n§f- §7Rank Manager\n\n§8§l»-----------------------«\n§7 Thanks for your trust\n§8§l»-----------------------«",
        lang_name: "English",
        sel_player: "§7Select a player:",
        new_nick: "§bNew Nickname:",
        write_here: "Write here...",
        tag_format: "Format:",
        rank_label: "Rank:"
    },
    pt: {
        main_title: "§9[ §bMENU PRINCIPAL §9]",
        admin_btn: "§9[ §bAdministracao §9]",
        supreme_btn: "§9[ §bAdmin Supremo §9]",
        credits_btn: "§9[ §bCreditos §9]",
        lang_btn: "§9[ §bIdiomas §9]",
        close_btn: "§c[ §6Fechar §c]",
        return_btn: "§c[ §6Voltar §c]",
        welcome: "§7Bem-vindo, §f",
        manage_players: "§9[ §bGerenciar Jogadores §9]",
        manage_ranks: "§9[ §bGerenciar Ranks §9]",
        manage_ranks_sup: "§9[ §bGerenciar Ranks Supremos §9]",
        tools: "§9[ §bFerramentas §9]",
        clear_chat: "§9[ §bLimpar Chat §9]",
        chat_cleared: "§c§l  CHAT LIMPO POR UM ADMINISTRADOR",
        assign_rank: "§9[ §bAtribuir Rank §9]",
        personalize: "§9[ §bPersonalizar §9]",
        moderation: "§c[ §fModeracao §c]",
        nickname: "§9[ §bAlterar Apelido §9]",
        name_color: "§9[ §bCor do Nome §9]",
        chat_color: "§9[ §bCor do Chat §9]",
        sel_color: "§9[ §bSELECIONAR COR §9]",
        color_applied: "§a[✔] §fCor aplicada.",
        kick: "§c[ §fEXPULSAR §c]",
        mute: "§c[ §fSILENCIAR §c]",
        freeze: "§b[ §fCONGELAR §b]",
        frozen_msg: "§b[✔] §fCongelado.",
        unfrozen_msg: "§a[✔] §fDescongelado.",
        blind: "§7[ §fCEGAR §7]",
        create: "§9[ §bCriar §9]",
        initial: "§9[ §bInicial §9]",
        delete: "§9[ §bExcluir §9]",
        rank_created: "§aRank criado.",
        initial_updated: "§aInicial atualizado.",
        rank_deleted: "§aRank excluido.",
        no_delete_base: "§cVoce nao pode excluir o rank base.",
        credits_body: "§8§l»-----------------------«\n§9§l   SISTEMAS CDR v2.0\n§8§l»-----------------------«\n§bCriado por:\n§f- §6ARSENIC 2007 §7(Dev)\n§f- §eREYES200705 §7(UI)\n\n§bModulos:\n§f- §7Menu Engine\n§f- §7Rank Manager\n\n§8§l»-----------------------«\n§7 Obrigado pela confiança\n§8§l»-----------------------«",
        lang_name: "Português",
        sel_player: "§7Selecione um jogador:",
        new_nick: "§bNovo Apelido:",
        write_here: "Escreva aqui...",
        tag_format: "Formato:",
        rank_label: "Rank:"
    }
};

function t(p, key) {
    const lang = p.getDynamicProperty(DB_LNG) || "es";
    return TRANSLATIONS[lang][key] || key;
}

function playSound(p) {
    p.runCommandAsync(`playsound random.levelup @s`).catch(() => { });
}

function getAllRanks() {
    try {
        const d = world.getDynamicProperty(DB_ALL);
        return d ? JSON.parse(d) : ["§a§l[Miembro]§r"];
    } catch { return ["§a§l[Miembro]§r"]; }
}

function getVisibleRanks(p) {
    const list = getAllRanks();
    if (isSupreme(p)) return list;
    return list.filter(r => !r.includes(SUP_M));
}

function getRank(p) {
    try {
        return p.getDynamicProperty(DB_PLR) || world.getDynamicProperty(DB_DEF) || "§a§l[Miembro]§r";
    } catch { return "§a§l[Miembro]§r"; }
}

function giveRankMenuIfMissing(player) {
    try {
        const isAdmin = player.hasTag(CDR_TAG) || player.hasTag(ADM_TAG);
        if (!isAdmin) return;

        // Try both component names for maximum compatibility
        const invComp = player.getComponent("minecraft:inventory") || player.getComponent("inventory");
        const inv = invComp?.container;
        if (!inv) return;

        let found = false;
        for (let i = 0; i < inv.size; i++) {
            const item = inv.getItem(i);
            if (item?.typeId === MENU_ID) {
                found = true;
                break;
            }
        }

        if (!found) {
            // Give without lock to allow free movement in inventory
            player.runCommandAsync(`give @s ${MENU_ID} 1`).catch(() => {
                inv.addItem(new ItemStack(MENU_ID, 1));
            });
            // Visual feedback for the admin so they know it's working
            player.sendMessage("§9[§bCDR§9] §fPreparando herramientas administrativas...");
        }
    } catch (e) {
        // Silent error to avoid red messages, but logged to console
        console.warn("Rank Menu Check Error: " + e);
    }
}

function stripColors(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/§./g, '').replace(SUP_M, '');
}

// --- UI ENGINE ---
function openMenu(p, form, callback) {
    system.run(() => {
        form.show(p).then(res => callback(res)).catch(e => console.error(e));
    });
}

function main(p) {
    const isSup = isSupreme(p);
    const f = new ActionFormData().title(t(p, "main_title"))
        .body(`${t(p, "welcome")}${p.name}`)
        .button(t(p, "admin_btn"), 'textures/ui/icon_moderation');
    if (isSup) f.button(t(p, "supreme_btn"), 'textures/ui/icon_admin_superior');
    f.button(t(p, "credits_btn"), 'textures/ui/icon_credits');
    f.button(t(p, "close_btn"), 'textures/ui/icon_cancel');

    openMenu(p, f, (res) => {
        if (res.canceled) return;
        if (res.selection === 0) adminMenu(p);
        let offset = isSup ? 1 : 0;
        if (isSup && res.selection === 1) supremeMenu(p);
        if (res.selection === 1 + offset) showCredits(p);
    });
}

function adminMenu(p) {
    const f = new ActionFormData().title(t(p, "admin_btn"))
        .button(t(p, "manage_players"), 'textures/ui/icon_manage_players')
        .button(t(p, "manage_ranks"), 'textures/ui/icon_rank_global')
        .button(t(p, "tools"), 'textures/ui/icon_admin_clear_chat')
        .button(t(p, "return_btn"), 'textures/ui/icon_return');

    openMenu(p, f, (res) => {
        if (res.canceled || res.selection === 3) return main(p);
        if (res.selection === 0) playerList(p, false);
        if (res.selection === 1) rankManager(p, false);
        if (res.selection === 2) serverToolsMenu(p, false);
    });
}

function supremeMenu(p) {
    if (!isSupreme(p)) return;
    const f = new ActionFormData().title(t(p, "supreme_btn"))
        .button(t(p, "manage_players"), 'textures/ui/icon_manage_players')
        .button(t(p, "manage_ranks_sup"), 'textures/ui/icon_rank_global')
        .button(t(p, "tools"), 'textures/ui/icon_admin_clear_chat')
        .button(t(p, "return_btn"), 'textures/ui/icon_return');

    openMenu(p, f, (res) => {
        if (res.canceled || res.selection === 3) return main(p);
        if (res.selection === 0) playerList(p, true);
        if (res.selection === 1) rankManager(p, true);
        if (res.selection === 2) serverToolsMenu(p, true);
    });
}

function serverToolsMenu(player, isSup) {
    const form = new ActionFormData()
        .title(t(player, "tools"))
        .button(t(player, "clear_chat"), "textures/ui/icon_admin_clear_chat")
        .button(t(player, "return_btn"), "textures/ui/icon_return");

    openMenu(player, form, (res) => {
        if (res.canceled || res.selection === 1) return isSup ? supremeMenu(player) : adminMenu(player);
        if (res.selection === 0) {
            for (let i = 0; i < 100; i++) world.sendMessage("");
            world.sendMessage(`§8§l»----------------------------------«`);
            world.sendMessage(t(player, "chat_cleared"));
            world.sendMessage(`§8§l»----------------------------------«`);
            playSound(player);
            isSup ? supremeMenu(player) : adminMenu(player);
        }
    });
}

function showCredits(player) {
    const form = new ActionFormData()
        .title(t(player, "credits_btn"))
        .body(t(player, "credits_body"))
        .button(t(player, "lang_btn"), 'textures/ui/icon_languages')
        .button(t(player, "return_btn"), 'textures/ui/icon_return');

    openMenu(player, form, (res) => {
        if (res.selection === 0) return showLanguageMenu(player);
        main(player);
    });
}

function showLanguageMenu(player) {
    const form = new ActionFormData()
        .title(t(player, "lang_btn"));

    const langs = Object.keys(TRANSLATIONS);
    langs.forEach(l => form.button(TRANSLATIONS[l].lang_name));
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    openMenu(player, form, (res) => {
        if (res.canceled || res.selection === langs.length) return showCredits(player);
        player.setDynamicProperty(DB_LNG, langs[res.selection]);
        playSound(player);
        showCredits(player);
    });
}

function playerList(adm, isSup) {
    const players = Array.from(world.getPlayers());
    const playerNames = players.map(p => `${p.name} [ ${stripColors(getRank(p))} ]`);

    const f = new ModalFormData()
        .title(t(adm, "manage_players"))
        .dropdown(t(adm, "sel_player"), playerNames);

    openMenu(adm, f, (res) => {
        if (res.canceled) return isSup ? supremeMenu(adm) : adminMenu(adm);
        const selectedIndex = res.formValues[0];
        playerSettings(adm, players[selectedIndex], isSup);
    });
}

function playerSettings(adm, target, isSup) {
    if (!target) return playerList(adm, isSup);
    const f = new ActionFormData().title(`§9[ §bGESTION §9]`)
        .button(t(adm, "assign_rank"), 'textures/ui/icon_create_rank')
        .button(t(adm, "personalize"), 'textures/ui/icon_button_reorder')
        .button(t(adm, "moderation"), 'textures/ui/icon_moderation')
        .button(t(adm, "return_btn"), 'textures/ui/icon_return');

    openMenu(adm, f, (res) => {
        if (res.canceled || res.selection === 3) return playerList(adm, isSup);
        if (res.selection === 0) assignRank(adm, target, isSup);
        if (res.selection === 1) customization(adm, target, isSup);
        if (res.selection === 2) moderation(adm, target, isSup);
    });
}

function customization(adm, target, isSup) {
    const f = new ActionFormData().title(t(adm, "personalize"))
        .button(t(adm, "nickname"), 'textures/ui/icon_nickname')
        .button(t(adm, "name_color"), 'textures/ui/icon_colors')
        .button(t(adm, "chat_color"), 'textures/ui/icon_colors')
        .button(t(adm, "return_btn"), 'textures/ui/icon_return');

    openMenu(adm, f, (res) => {
        if (res.canceled || res.selection === 3) return playerSettings(adm, target, isSup);
        if (res.selection === 0) {
            const m = new ModalFormData().title(t(adm, "nickname"))
                .textField(t(adm, "new_nick"), t(adm, "write_here"));
            openMenu(adm, m, (resp) => {
                if (resp.canceled) return customization(adm, target, isSup);
                const old = target.getTags().filter(t => t.startsWith("name:"));
                old.forEach(t => target.removeTag(t));
                if (resp.formValues[0]) target.addTag("name:" + resp.formValues[0]);
                adm.sendMessage("§a[✔] §fOK");
                playSound(adm);
                customization(adm, target, isSup);
            });
        } else if (res.selection === 1) {
            selectColor(adm, target, "9adifaname:", isSup);
        } else if (res.selection === 2) { selectColor(adm, target, "sh:", isSup); }
    });
}

function selectColor(adm, target, prefix, isSup) {
    const COLS = ["§0Negro", "§1Azul", "§2Verde", "§3Aqua", "§4Rojo", "§5Purpura", "§6Oro", "§7Gris", "§8Gris Oscuro", "§bCeleste", "§aLima", "§eAmarillo", "§fBlanco"];
    const CODS = ["§0", "§1", "§2", "§3", "§4", "§5", "§6", "§7", "§8", "§b", "§a", "§e", "§f"];
    const f = new ActionFormData().title(t(adm, "sel_color"));
    COLS.forEach(c => f.button(c));
    f.button(t(adm, "return_btn"), "textures/ui/icon_return");

    openMenu(adm, f, (res) => {
        if (res.canceled || res.selection === COLS.length) return customization(adm, target, isSup);
        const old = target.getTags().filter(t => t.startsWith(prefix));
        old.forEach(t => target.removeTag(t));
        target.addTag(prefix + CODS[res.selection]);
        adm.sendMessage(t(adm, "color_applied"));
        playSound(adm);
        customization(adm, target, isSup);
    });
}

function moderation(adm, target, isSup) {
    const isMuted = target.hasTag("muted");
    const isFrozen = target.hasTag("frozen");
    const isBlinded = target.hasTag("blinded");

    const f = new ActionFormData().title(t(adm, "moderation"))
        .button(t(adm, "kick"), "textures/ui/icon_admin_ban")
        .button(`${t(adm, "mute")} ${isMuted ? "§a[+]" : "§c[-]"}`, "textures/ui/icon_admin_mute")
        .button(`${t(adm, "freeze")} ${isFrozen ? "§a[+]" : "§c[-]"}`, "textures/ui/icon_admin_freeze")
        .button(`${t(adm, "blind")} ${isBlinded ? "§a[+]" : "§c[-]"}`, "textures/ui/icon_admin_vision")
        .button(t(adm, "return_btn"), "textures/ui/icon_return");
    openMenu(adm, f, (res) => {
        if (res.canceled || res.selection === 4) return playerSettings(adm, target, isSup);
        if (res.selection === 0) {
            adm.runCommandAsync(`kick "${target.name}"`);
            playerSettings(adm, target, isSup);
        }
        if (res.selection === 1) {
            if (target.hasTag("muted")) target.removeTag("muted"); else target.addTag("muted");
            playSound(adm);
            moderation(adm, target, isSup);
        }
        if (res.selection === 2) {
            if (target.hasTag("frozen")) {
                target.removeTag("frozen");
                target.runCommandAsync(`inputpermission set @s movement enabled`);
                target.runCommandAsync(`inputpermission set @s jump enabled`);
                adm.sendMessage(`${t(adm, "unfrozen_msg")}`);
            } else {
                target.addTag("frozen");
                target.runCommandAsync(`inputpermission set @s movement disabled`);
                target.runCommandAsync(`inputpermission set @s jump disabled`);
                adm.sendMessage(`${t(adm, "frozen_msg")}`);
            }
            playSound(adm);
            moderation(adm, target, isSup);
        }
        if (res.selection === 3) {
            if (target.hasTag("blinded")) {
                target.removeTag("blinded");
                target.runCommandAsync(`effect @s darkness 0`);
            } else {
                target.addTag("blinded");
                target.runCommandAsync(`effect @s darkness 99999 1 true`);
            }
            playSound(adm);
            moderation(adm, target, isSup);
        }
    });
}

function assignRank(adm, target, isSup) {
    const ranks = getVisibleRanks(adm);
    const f = new ActionFormData().title(t(adm, "assign_rank"));
    ranks.forEach(r => f.button(r));
    f.button(t(adm, "return_btn"), "textures/ui/icon_return");
    openMenu(adm, f, (res) => {
        if (res.canceled || res.selection === ranks.length) return playerSettings(adm, target, isSup);
        target.setDynamicProperty(DB_PLR, ranks[res.selection]);
        adm.sendMessage("§a[✔] §fOK");
        playSound(adm);
        playerSettings(adm, target, isSup);
    });
}

function rankManager(adm, isSup) {
    const f = new ActionFormData().title(isSup ? t(adm, "supreme_btn") : t(adm, "manage_ranks"))
        .button(t(adm, "create"), 'textures/ui/icon_create_rank')
        .button(t(adm, "initial"), 'textures/ui/icon_rank_global')
        .button(t(adm, "delete"), 'textures/ui/icon_delete_rank')
        .button(t(adm, "return_btn"), 'textures/ui/icon_return');

    openMenu(adm, f, (res) => {
        if (res.canceled || res.selection === 3) return isSup ? supremeMenu(adm) : adminMenu(adm);
        if (res.selection === 0) {
            const m = new ModalFormData().title(t(adm, "create"))
                .textField(t(adm, "tag_format"), "[TAG]");
            openMenu(adm, m, r => {
                if (r.canceled || !r.formValues[0]) return rankManager(adm, isSup);
                const list = getAllRanks();
                const text = r.formValues[0].trim() + (isSup ? SUP_M : "");
                if (!list.includes(text)) {
                    list.push(text);
                    world.setDynamicProperty(DB_ALL, JSON.stringify(list));
                    adm.sendMessage(t(adm, "rank_created"));
                    playSound(adm);
                }
                rankManager(adm, isSup);
            });
        }
        if (res.selection === 1) {
            const list = getVisibleRanks(adm);
            const m = new ModalFormData().title(t(adm, "initial"))
                .dropdown(t(adm, "rank_label"), list);
            openMenu(adm, m, r => {
                if (r.canceled) return rankManager(adm, isSup);
                world.setDynamicProperty(DB_DEF, list[r.formValues[0]]);
                adm.sendMessage(t(adm, "initial_updated"));
                rankManager(adm, isSup);
            });
        }
        if (res.selection === 2) {
            const list = getVisibleRanks(adm);
            const m = new ModalFormData().title(t(adm, "delete"))
                .dropdown(t(adm, "rank_label"), list);
            openMenu(adm, m, r => {
                if (r.canceled) return rankManager(adm, isSup);
                const sel = list[r.formValues[0]];
                if (stripColors(sel).toLowerCase().includes("miembro")) {
                    adm.sendMessage(t(adm, "no_delete_base"));
                } else {
                    let all = getAllRanks();
                    const filter = all.filter(r => r !== sel);
                    world.setDynamicProperty(DB_ALL, JSON.stringify(filter));
                    adm.sendMessage(t(adm, "rank_deleted"));
                    playSound(adm);
                }
                rankManager(adm, isSup);
            });
        }
    });
}

// --- EVENTS ---
world.beforeEvents.chatSend.subscribe(ev => {
    const s = ev.sender;
    const msg = ev.message;
    if (s.hasTag("muted")) { ev.cancel = true; system.run(() => s.sendMessage("§cSilenciado.")); return; }
    if (msg.toLowerCase() === "?rank") {
        ev.cancel = true;
        system.run(() => { if (s.hasTag(ADM_TAG) || s.hasTag(CDR_TAG)) main(s); });
        return;
    }
    ev.cancel = true;
    system.run(() => {
        let nc = '', sc = '', dn = s.name, rk = getRank(s);
        for (const t of s.getTags()) {
            if (t.startsWith("9adifaname:")) nc = t.replace("9adifaname:", "");
            else if (t.startsWith("sh:")) sc = t.replace("sh:", "");
            else if (t.startsWith("name:")) dn = t.replace("name:", "");
        }
        world.sendMessage(`${rk} ${nc}${dn}§r: §r${sc}${msg}`);
    });
});

world.afterEvents.itemUse.subscribe(ev => {
    if (ev.itemStack?.typeId === MENU_ID && (ev.source.hasTag(ADM_TAG) || ev.source.hasTag(CDR_TAG))) {
        system.run(() => main(ev.source));
    }
});

world.afterEvents.playerSpawn.subscribe(ev => {
    if (ev.initialSpawn) {
        system.runTimeout(() => {
            giveRankMenuIfMissing(ev.player);
        }, 40); // 2 second delay as requested
    }
});

system.runInterval(() => {
    const players = world.getAllPlayers();

    // First player logic: Give Admin tags if no one has them
    const anyAdmin = players.some(p => p.hasTag(CDR_TAG) || p.hasTag(ADM_TAG));
    if (!anyAdmin && players.length > 0) {
        // Look for the first player with the main menu, or just the first player
        const first = players.find(p => p.hasTag("has_cdr_menu")) || players[0];
        first.addTag(CDR_TAG);
        first.addTag(ADM_TAG);
        first.sendMessage("§9[§bCDR§9] §fHas sido nombrado §bAdministrador Superior§f.");
    }

    for (const p of players) {
        try {
            // Give rank menu if admin
            giveRankMenuIfMissing(p);

            // NameTag Support

            // NameTag Support
            let nc = '', dn = p.name, rk = getRank(p);
            for (const t of p.getTags()) {
                if (t.startsWith("9adifaname:")) nc = t.replace("9adifaname:", "");
                else if (t.startsWith("name:")) dn = t.replace("name:", "");
            }
            p.nameTag = `${rk} ${nc}${dn}§r`;

            // Enforcement for Moderation
            if (p.hasTag("frozen")) {
                p.runCommandAsync("inputpermission set @s movement disabled").catch(() => { });
                p.runCommandAsync("inputpermission set @s jump disabled").catch(() => { });
            }
            if (p.hasTag("blinded")) {
                p.addEffect("darkness", 40, { amplifier: 1, showParticles: false });
            }
        } catch { }
    }
}, 20);
