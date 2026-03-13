import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { t, playSoundAndNotify } from "./utils.js";

const CURSED_MISSIONS = [
    { target: "minecraft:warden", action: "KILL", amount: 20 },
    { target: "minecraft:wither", action: "KILL", amount: 10 },
    { target: "minecraft:elder_guardian", action: "KILL", amount: 50 },
    { target: "minecraft:ender_dragon", action: "KILL", amount: 5 },
    { target: "minecraft:evoker", action: "KILL", amount: 100 },
    { target: "minecraft:ravager", action: "KILL", amount: 150 },
    { target: "minecraft:shulker", action: "KILL", amount: 300 },
    { target: "minecraft:ghast", action: "KILL", amount: 200 },
    { target: "minecraft:blaze", action: "KILL", amount: 1000 },
    { target: "minecraft:enderman", action: "KILL", amount: 2000 },
    { target: "minecraft:diamond_ore", action: "MINE", amount: 500 },
    { target: "minecraft:ancient_debris", action: "MINE", amount: 200 },
    { target: "minecraft:emerald_ore", action: "MINE", amount: 1000 },
    { target: "minecraft:gold_ore", action: "MINE", amount: 5000 },
    { target: "minecraft:iron_ore", action: "MINE", amount: 10000 },
    { target: "minecraft:obsidian", action: "MINE", amount: 5000 },
    { target: "minecraft:crying_obsidian", action: "MINE", amount: 1000 },
    { target: "minecraft:amethyst_cluster", action: "MINE", amount: 2000 },
    { target: "minecraft:sculk_shrieker", action: "MINE", amount: 300 },
    { target: "minecraft:deepslate_diamond_ore", action: "MINE", amount: 400 },
    ...Array.from({ length: 30 }, (_, i) => ({
        target: i % 2 === 0 ? "minecraft:wither_skeleton" : "minecraft:piglin_brute",
        action: "KILL",
        amount: 300 + (i * 10)
    }))
];

function getGlobalCursedBoard() {
    const currentDay = world.getDay();
    const rotation = Math.floor(currentDay / 10);
    try {
        const data = world.getDynamicProperty("cdr_cursed_board");
        if (data) {
            const board = JSON.parse(data);
            if (board.rotation === rotation) return board;
        }
    } catch (e) { }

    // Generate new board
    const shuffled = [...CURSED_MISSIONS].sort(() => 0.5 - Math.random());
    const newBoard = {
        rotation: rotation,
        missions: shuffled.slice(0, 5)
    };
    world.setDynamicProperty("cdr_cursed_board", JSON.stringify(newBoard));
    return newBoard;
}

function getPlayerProgress(player) {
    const board = getGlobalCursedBoard();
    try {
        const data = player.getDynamicProperty("cdr_cursed_prog");
        if (data) {
            const prog = JSON.parse(data);
            if (prog.rotation === board.rotation) return prog.values;
        }
    } catch (e) { }
    return [0, 0, 0, 0, 0];
}

function savePlayerProgress(player, values) {
    const board = getGlobalCursedBoard();
    player.setDynamicProperty("cdr_cursed_prog", JSON.stringify({
        rotation: board.rotation,
        values: values
    }));
}

export function showCorruptionMenu(player) {
    const pPenalty = getPenalty(player);
    if (pPenalty > 0) {
        const seconds = Math.ceil(pPenalty / 20);
        player.sendMessage(`${t(player, "penalty_active")} ${t(player, "penalty_time")}${seconds}s`);
        return;
    }

    const board = getGlobalCursedBoard();
    const progress = getPlayerProgress(player);

    const form = new ActionFormData();
    const cursedLabel = t(player, "cursed").replace(/§./g, "").replace("[", "").replace("]", "").trim();
    form.title(`§9[ §5${cursedLabel} §9]`);

    let body = `§b----------------------------\n`;
    board.missions.forEach((m, i) => {
        const cleanId = m.target.replace("minecraft:", "");
        const translatedTarget = t(player, cleanId);
        body += `§c${t(player, "mission_label")} ${i + 1}\n§7${translatedTarget}: ${progress[i]}/${m.amount}\n`;
        body += `§b----------------------------\n`;
    });

    body += `\n§c${t(player, "warning_curse_clear")}\n`;
    body += `§b----------------------------`;

    form.body(body);
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then(() => {
        system.run(() => {
            world.getDimension("overworld").runCommandAsync(`scriptevent cdr:show_missions_menu "${player.name}"`).catch(() => { });
        });
    });
}


export function handleCursedKill(player, killedEntityId) {
    if (!player.matches({ gameMode: "survival" }) && !player.hasTag("CDR")) return;
    if (!player.hasTag("corrupcion")) return;
    updateCursedProgress(player, "KILL", killedEntityId);
}

export function handleCursedMine(player, brokenBlockId) {
    if (!player.matches({ gameMode: "survival" }) && !player.hasTag("CDR")) return;
    if (!player.hasTag("corrupcion")) return;
    updateCursedProgress(player, "MINE", brokenBlockId);
}

function updateCursedProgress(player, action, id) {
    const board = getGlobalCursedBoard();
    const progress = getPlayerProgress(player);
    let changed = false;
    let updatedMissionIndex = -1;
    board.missions.forEach((m, i) => {
        if (m.action === action && m.target === id) {
            progress[i]++;
            changed = true;
            updatedMissionIndex = i;
            if (progress[i] >= m.amount) {
                clearCurse(player);
                return;
            }
        }
    });

    if (changed && player.hasTag("corrupcion")) {
        savePlayerProgress(player, progress);
        if (updatedMissionIndex !== -1) {
            const m = board.missions[updatedMissionIndex];
            const cleanId = m.target.replace("minecraft:", "");
            const translatedTarget = t(player, cleanId);
            player.onScreenDisplay.setActionBar(`§5[${t(player, "cursed")} ${updatedMissionIndex + 1}] §d${translatedTarget}: §f${progress[updatedMissionIndex]}/${m.amount}`);
        }
    }
}

export function clearCurse(player) {
    player.removeTag("corrupcion");
    const sbCorrupt = world.scoreboard.getObjective("dinero_corrupto");
    if (sbCorrupt) sbCorrupt.setScore(player, 0);
    player.setDynamicProperty("cdr_cursed_by", undefined);

    // Clear negative effects
    player.runCommandAsync("effect @s clear").catch(() => { });

    player.sendMessage(t(player, "cursed_cleared"));
    playSoundAndNotify(player, t(player, "maldicion_removida"));
    player.runCommandAsync(`playsound random.levelup @a[r=10] ~ ~ ~ 1 0.5`).catch(() => { });
}

export function applyPenalty(player, extreme = false) {
    const duration = extreme ? 2400 : 1200;
    player.addEffect("weakness", duration);
    player.addEffect("poison", extreme ? 400 : 200);
    player.addEffect("nausea", duration);
    player.addEffect("hunger", duration);
    player.addEffect("slowness", duration, { amplifier: 2 });

    player.dimension.spawnLightning(player.location);
    if (extreme) player.dimension.spawnLightning(player.location);

    const penaltyObj = world.scoreboard.getObjective("corrupcion_penalty");
    if (penaltyObj) {
        penaltyObj.setScore(player, extreme ? 12000 : 6000);
    }
}

export function getPenalty(player) {
    const penaltyObj = world.scoreboard.getObjective("corrupcion_penalty");
    if (penaltyObj) {
        try { return penaltyObj.getScore(player) ?? 0; } catch (e) { return 0; }
    }
    return 0;
}

export function isSafeZoneBlocked(player) {
    return getPenalty(player) > 0;
}

