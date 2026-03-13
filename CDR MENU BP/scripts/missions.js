import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { showCorruptionMenu, handleCursedKill, handleCursedMine } from "./corruption.js";
import { t, playSoundAndNotify } from "./utils.js";
import { getConfig, isFeatureBlocked, getPerms } from "./main.js";

// === CONSTANTS ===
const TICKS_PER_DAY = 24000;
const ROTATION_DAYS = 5;
const ROTATION_TICKS_MS = ROTATION_DAYS * 24 * 60 * 60 * 1000; // 5 days in ms

// Reward calculation: baseReward * categoryMultiplier * adminMultiplier
const REWARD_TIERS = {
    easy: { base: 100, mult: 1.0, amount: [10, 30] },
    normal: { base: 250, mult: 2.0, amount: [20, 50] },
    hard: { base: 600, mult: 5.0, amount: [30, 80] },
    hardcore: { base: 1500, mult: 10.0, amount: [50, 150] }
};

const MISSION_TARGETS = {
    easy: {
        KILL: [
            "minecraft:zombie", "minecraft:skeleton", "minecraft:spider", "minecraft:creeper",
            "minecraft:pig", "minecraft:cow", "minecraft:sheep", "minecraft:chicken",
            "minecraft:rabbit", "minecraft:squid", "minecraft:glow_squid", "minecraft:cod",
            "minecraft:salmon", "minecraft:tropical_fish", "minecraft:pufferfish", "minecraft:bee",
            "minecraft:fox", "minecraft:wolf", "minecraft:cat", "minecraft:ocelot",
            "minecraft:parrot", "minecraft:turtle", "minecraft:frog", "minecraft:tadpole",
            "minecraft:bat", "minecraft:goat", "minecraft:armadillo", "minecraft:silverfish",
            "minecraft:cave_spider", "minecraft:slime", "minecraft:strider", "minecraft:villager",
            "minecraft:wandering_trader", "minecraft:donkey", "minecraft:horse", "minecraft:mule",
            "minecraft:skeleton_horse", "minecraft:zombie_horse", "minecraft:llama", "minecraft:trader_llama",
            "minecraft:panda", "minecraft:polar_bear", "minecraft:snow_golem", "minecraft:iron_golem",
            "minecraft:axolotl", "minecraft:allay", "minecraft:sniffer", "minecraft:camel",
            "minecraft:mooshroom"
        ],
        MINE: [
            "minecraft:stone", "minecraft:dirt", "minecraft:grass_block", "minecraft:cobblestone",
            "minecraft:sand", "minecraft:gravel", "minecraft:oak_log", "minecraft:spruce_log",
            "minecraft:birch_log", "minecraft:jungle_log", "minecraft:acacia_log", "minecraft:dark_oak_log",
            "minecraft:mangrove_log", "minecraft:cherry_log", "minecraft:oak_leaves", "minecraft:spruce_leaves",
            "minecraft:birch_leaves", "minecraft:jungle_leaves", "minecraft:acacia_leaves", "minecraft:dark_oak_leaves",
            "minecraft:coal_ore", "minecraft:iron_ore", "minecraft:copper_ore", "minecraft:moss_block",
            "minecraft:azalea", "minecraft:flowering_azalea", "minecraft:mud", "minecraft:clay",
            "minecraft:snow", "minecraft:ice", "minecraft:tuff", "minecraft:calcite",
            "minecraft:dandelion", "minecraft:poppy", "minecraft:blue_orchid", "minecraft:allium",
            "minecraft:azure_bluet", "minecraft:red_tulip", "minecraft:orange_tulip", "minecraft:white_tulip",
            "minecraft:pink_tulip", "minecraft:oxeye_daisy", "minecraft:cornflower", "minecraft:lily_of_the_valley",
            "minecraft:sunflower", "minecraft:lilac", "minecraft:rose_bush", "minecraft:peony",
            "minecraft:wheat", "minecraft:carrots", "minecraft:potatoes", "minecraft:beetroot",
            "minecraft:sweet_berry_bush", "minecraft:kelp", "minecraft:seagrass", "minecraft:cactus",
            "minecraft:pumpkin", "minecraft:melon_block", "minecraft:bamboo", "minecraft:sugar_cane",
            "minecraft:andesite", "minecraft:diorite", "minecraft:granite", "minecraft:polished_andesite",
            "minecraft:polished_diorite", "minecraft:polished_granite", "minecraft:birch_sapling", "minecraft:oak_sapling",
            "minecraft:spruce_sapling", "minecraft:jungle_sapling", "minecraft:acacia_sapling", "minecraft:dark_oak_sapling"
        ]
    },
    normal: {
        KILL: [
            "minecraft:enderman", "minecraft:drowned", "minecraft:husk", "minecraft:stray",
            "minecraft:witch", "minecraft:phantom", "minecraft:pillager", "minecraft:vindicator",
            "minecraft:guardian", "minecraft:blaze", "minecraft:ghast", "minecraft:magma_cube",
            "minecraft:hoglin", "minecraft:piglin", "minecraft:zombified_piglin", "minecraft:shulker",
            "minecraft:endermite", "minecraft:vex", "minecraft:breeze", "minecraft:bogged",
            "minecraft:zombie_villager", "minecraft:illusioner", "minecraft:zoglin", "minecraft:piglin_brute"
        ],
        MINE: [
            "minecraft:gold_ore", "minecraft:lapis_ore", "minecraft:redstone_ore", "minecraft:deepslate_coal_ore",
            "minecraft:deepslate_iron_ore", "minecraft:deepslate_copper_ore", "minecraft:deepslate_gold_ore",
            "minecraft:deepslate_lapis_ore", "minecraft:deepslate_redstone_ore", "minecraft:nether_quartz_ore",
            "minecraft:nether_gold_ore", "minecraft:netherrack", "minecraft:soul_sand", "minecraft:soul_soil",
            "minecraft:blackstone", "minecraft:basalt", "minecraft:magma", "minecraft:glowstone",
            "minecraft:prismarine", "minecraft:dark_prismarine", "minecraft:prismarine_bricks", "minecraft:crying_obsidian",
            "minecraft:amethyst_block", "minecraft:amethyst_cluster", "minecraft:budding_amethyst", "minecraft:sculk",
            "minecraft:pointed_dripstone", "minecraft:dripstone_block", "minecraft:glow_berries", "minecraft:sea_lantern",
            "minecraft:white_concrete", "minecraft:orange_concrete", "minecraft:magenta_concrete", "minecraft:light_blue_concrete",
            "minecraft:yellow_concrete", "minecraft:lime_concrete", "minecraft:pink_concrete", "minecraft:gray_concrete",
            "minecraft:light_gray_concrete", "minecraft:cyan_concrete", "minecraft:purple_concrete", "minecraft:blue_concrete",
            "minecraft:brown_concrete", "minecraft:green_concrete", "minecraft:red_concrete", "minecraft:black_concrete",
            "minecraft:white_wool", "minecraft:orange_wool", "minecraft:pink_wool", "minecraft:gray_wool",
            "minecraft:cyan_wool", "minecraft:purple_wool", "minecraft:blue_wool", "minecraft:green_wool",
            "minecraft:red_wool", "minecraft:black_wool",
            "minecraft:white_terracotta", "minecraft:orange_terracotta", "minecraft:pink_terracotta", "minecraft:gray_terracotta",
            "minecraft:cyan_terracotta", "minecraft:purple_terracotta", "minecraft:blue_terracotta", "minecraft:green_terracotta",
            "minecraft:red_terracotta", "minecraft:black_terracotta",
            "minecraft:white_stained_glass", "minecraft:orange_stained_glass", "minecraft:pink_stained_glass", "minecraft:gray_stained_glass",
            "minecraft:cyan_stained_glass", "minecraft:purple_stained_glass", "minecraft:blue_stained_glass", "minecraft:green_stained_glass",
            "minecraft:red_stained_glass", "minecraft:black_stained_glass"
        ]
    },
    hard: {
        KILL: [
            "minecraft:evoker", "minecraft:ravager", "minecraft:elder_guardian", "minecraft:piglin_brute",
            "minecraft:wither_skeleton", "minecraft:shulker", "minecraft:breeze", "minecraft:warden",
            "minecraft:vindicator", "minecraft:ghast", "minecraft:blaze", "minecraft:phantom",
            "minecraft:witch", "minecraft:guardian", "minecraft:magma_cube", "minecraft:hoglin",
            "minecraft:zoglin", "minecraft:iron_golem", "minecraft:enderman", "minecraft:husk",
            "minecraft:stray", "minecraft:drowned", "minecraft:pillager", "minecraft:vex",
            "minecraft:creeper", "minecraft:silverfish", "minecraft:endermite", "minecraft:bogged"
        ],
        MINE: [
            "minecraft:diamond_ore", "minecraft:emerald_ore", "minecraft:deepslate_diamond_ore", "minecraft:deepslate_emerald_ore",
            "minecraft:ancient_debris", "minecraft:obsidian", "minecraft:crying_obsidian", "minecraft:gilded_blackstone",
            "minecraft:sculk_catalyst", "minecraft:sculk_shrieker", "minecraft:sculk_sensor", "minecraft:beacon",
            "minecraft:conduit", "minecraft:lodestone", "minecraft:respawn_anchor", "minecraft:ender_chest",
            "minecraft:enchanting_table", "minecraft:anvil", "minecraft:brewing_stand", "minecraft:cauldron",
            "minecraft:dragon_egg", "minecraft:sea_lantern", "minecraft:shroomlight", "minecraft:froglight",
            "minecraft:sponge", "minecraft:wet_sponge", "minecraft:prismarine", "minecraft:dark_prismarine",
            "minecraft:prismarine_bricks", "minecraft:blue_ice", "minecraft:packed_ice", "minecraft:mycelium",
            "minecraft:white_terracotta", "minecraft:orange_terracotta", "minecraft:magenta_terracotta", "minecraft:light_blue_terracotta",
            "minecraft:yellow_terracotta", "minecraft:lime_terracotta", "minecraft:pink_terracotta", "minecraft:gray_terracotta",
            "minecraft:light_gray_terracotta", "minecraft:cyan_terracotta", "minecraft:purple_terracotta", "minecraft:blue_terracotta",
            "minecraft:brown_terracotta", "minecraft:green_terracotta", "minecraft:red_terracotta", "minecraft:black_terracotta",
            "minecraft:white_glazed_terracotta", "minecraft:orange_glazed_terracotta", "minecraft:magenta_glazed_terracotta", "minecraft:light_blue_glazed_terracotta",
            "minecraft:yellow_glazed_terracotta", "minecraft:lime_glazed_terracotta", "minecraft:pink_glazed_terracotta", "minecraft:gray_glazed_terracotta",
            "minecraft:light_gray_glazed_terracotta", "minecraft:cyan_glazed_terracotta", "minecraft:purple_glazed_terracotta", "minecraft:blue_glazed_terracotta",
            "minecraft:brown_glazed_terracotta", "minecraft:green_glazed_terracotta", "minecraft:red_glazed_terracotta", "minecraft:black_glazed_terracotta",
            "minecraft:white_concrete", "minecraft:orange_concrete", "minecraft:magenta_concrete", "minecraft:light_blue_concrete",
            "minecraft:yellow_concrete", "minecraft:lime_concrete", "minecraft:pink_concrete", "minecraft:gray_concrete",
            "minecraft:light_gray_concrete", "minecraft:cyan_concrete", "minecraft:purple_concrete", "minecraft:blue_concrete",
            "minecraft:brown_concrete", "minecraft:green_concrete", "minecraft:red_concrete", "minecraft:black_concrete"
        ]
    },
    hardcore: {
        KILL: [
            "minecraft:ender_dragon", "minecraft:wither", "minecraft:warden", "minecraft:elder_guardian",
            "minecraft:ravager", "minecraft:evoker", "minecraft:piglin_brute", "minecraft:iron_golem"
        ],
        MINE: [
            "minecraft:ancient_debris", "minecraft:netherite_block", "minecraft:diamond_block", "minecraft:emerald_block",
            "minecraft:gold_block", "minecraft:iron_block", "minecraft:copper_block", "minecraft:exposed_copper",
            "minecraft:weathered_copper", "minecraft:oxidized_copper", "minecraft:waxed_copper_block", "minecraft:waxed_exposed_copper",
            "minecraft:waxed_weathered_copper", "minecraft:waxed_oxidized_copper", "minecraft:raw_iron_block", "minecraft:raw_gold_block",
            "minecraft:raw_copper_block", "minecraft:lapis_block", "minecraft:coal_block", "minecraft:redstone_block",
            "minecraft:amethyst_block", "minecraft:budding_amethyst", "minecraft:sculk_shrieker", "minecraft:sculk_catalyst",
            "minecraft:sculk_sensor", "minecraft:calibrated_sculk_sensor", "minecraft:beacon", "minecraft:conduit",
            "minecraft:lodestone", "minecraft:respawn_anchor", "minecraft:ender_chest", "minecraft:dragon_egg",
            "minecraft:heavy_core", "minecraft:vault", "minecraft:trial_spawner", "minecraft:spawner"
        ]
    }
};

// Helper for translated action type
function getActionType(player, action) {
    if (action === "KILL") return t(player, "mission_kill");
    if (action === "MINE") return t(player, "mission_mine");
    return action;
}

// === GLOBAL STATE MANAGEMENT ===

function getGlobalBoard() {
    try {
        const data = world.getDynamicProperty("cdr_mission_board");
        if (data) return JSON.parse(data);
    } catch (e) { }
    return generateNewBoard();
}

function saveGlobalBoard(board) {
    world.setDynamicProperty("cdr_mission_board", JSON.stringify(board));
}

function generateNewBoard() {
    const currentTick = Date.now();
    const expiresAt = currentTick + ROTATION_TICKS_MS;

    const board = {
        expiresAt: expiresAt,
        missions: {
            easy: generateMission("easy"),
            normal: generateMission("normal"),
            hard: generateMission("hard"),
            hardcore: generateMission("hardcore")
        }
    };
    saveGlobalBoard(board);
    return board;
}

function generateMission(tier) {
    const actions = ["KILL", "MINE"];
    const action = actions[Math.floor(Math.random() * actions.length)];

    let targets = MISSION_TARGETS[tier][action];
    // Fallback if targets are empty
    if (!targets || targets.length === 0) targets = ["minecraft:zombie"];

    const target = targets[Math.floor(Math.random() * targets.length)];
    const range = REWARD_TIERS[tier].amount;
    const amount = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
    const baseReward = REWARD_TIERS[tier].base;

    return {
        id: `${tier}_${action}_${target}_${Date.now()}`,
        tier: tier,
        action: action,
        target: target,
        amount: amount,
        baseReward: baseReward
    };
}

export function checkBoardRotation() {
    let board = getGlobalBoard();
    const currentTick = Date.now();

    if (currentTick >= board.expiresAt) {
        board = generateNewBoard();
        // Notify players on rotation (using es as default for broad system msg or ideally multilingual)
        world.sendMessage(`§b[CDR Misiones] §f${t({ getDynamicProperty: () => "es" }, "board_updated")}`);
    }
    return board;
}

// === PLAYER STATE MANAGEMENT ===

export function getPlayerMission(player) {
    try {
        const data = player.getDynamicProperty("cdr_active_mission");
        if (data) return JSON.parse(data);
    } catch (e) { }
    return null;
}

function savePlayerMission(player, missionData) {
    if (missionData === null) {
        player.setDynamicProperty("cdr_active_mission", undefined);
    } else {
        player.setDynamicProperty("cdr_active_mission", JSON.stringify(missionData));
    }
}

function attemptAcceptMission(player, mission, boardExpiresAt) {
    const current = getPlayerMission(player);
    if (current) {
        if (current.status === "active") {
            playSoundAndNotify(player, `§c${t(player, "error")}: ${t(player, "only_one_at_time")}`);
            return false;
        }
    }

    const newMission = {
        ...mission,
        progress: 0,
        boardExpiresAt: boardExpiresAt,
        status: "active"
    };

    savePlayerMission(player, newMission);
    playSoundAndNotify(player, `§a${t(player, "mission_accept")}`);
    return true;
}

export function cancelPlayerMission(player) {
    savePlayerMission(player, null);
    playSoundAndNotify(player, `§e${t(player, "mission_cancel")}`);
}

// === TRACKING LOGIC ===

export function handleMissionKill(player, killedEntityId) {
    if (!player.matches({ gameMode: "survival" }) && !player.hasTag("CDR")) return;

    const config = getConfig();
    if (isFeatureBlocked(player, "shop", config, getPerms(player).isMod)) return;

    handleCursedKill(player, killedEntityId);
    let active = getPlayerMission(player);
    if (!active || active.status !== "active" || active.action !== "KILL") return;

    if (Date.now() >= active.boardExpiresAt) {
        active.status = "failed";
        savePlayerMission(player, active);
        player.sendMessage(`§9[§bCDR§9] §f${t(player, "mission_failed")}`);
        return;
    }
    if (active.target === killedEntityId) {
        active.progress++;
        if (active.progress >= active.amount) {
            completeMission(player, active);
        } else {
            savePlayerMission(player, active);
            player.onScreenDisplay.setActionBar(`§9[§bCDR§9] §f§a${t(player, "mission_prog")}: ${active.progress}/${active.amount}`);
        }
    }
}

export function handleMissionMine(player, brokenBlockId) {
    if (!player.matches({ gameMode: "survival" }) && !player.hasTag("CDR")) return;

    const config = getConfig();
    if (isFeatureBlocked(player, "shop", config, getPerms(player).isMod)) return;

    handleCursedMine(player, brokenBlockId);
    let active = getPlayerMission(player);
    if (!active || active.status !== "active" || active.action !== "MINE") return;

    if (Date.now() >= active.boardExpiresAt) {
        active.status = "failed";
        savePlayerMission(player, active);
        player.sendMessage(`§9[§bCDR§9] §f${t(player, "mission_failed")}`);
        return;
    }

    if (active.target === brokenBlockId) {
        active.progress++;
        if (active.progress >= active.amount) {
            completeMission(player, active);
        } else {
            savePlayerMission(player, active);
            player.onScreenDisplay.setActionBar(`§9[§bCDR§9] §f§a${t(player, "mission_prog")}: ${active.progress}/${active.amount}`);
        }
    }
}

function completeMission(player, mission) {
    const adminMult = world.getDynamicProperty(`cdr_mult_mission_${mission.tier}`) ?? 1.0;
    const tierMult = REWARD_TIERS[mission.tier].mult;
    const finalReward = Math.floor(mission.baseReward * tierMult * adminMult);

    const isCursed = player.hasTag("corrupcion");
    const objectiveId = isCursed ? "dinero_corrupto" : "dinero";
    const scoreboard = world.scoreboard.getObjective(objectiveId);

    if (scoreboard) {
        const score = scoreboard.getScore(player) ?? 0;
        scoreboard.setScore(player, Math.min(score + finalReward, 2000000000));
    }

    // New: Track mission completion by tier
    const missionStatObj = world.scoreboard.getObjective(`missions_${mission.tier === "hardcore" ? "hcore" : mission.tier}`);
    if (missionStatObj) {
        const currentMissions = missionStatObj.getScore(player) ?? 0;
        missionStatObj.setScore(player, currentMissions + 1);
    }

    playSoundAndNotify(player, `§a${t(player, "success")} ($${finalReward})`);
    savePlayerMission(player, null);
}

// === UI INTEGRATION ===

export function showMissionsMenu(player) {
    const board = checkBoardRotation();
    const active = getPlayerMission(player);

    const form = new ActionFormData();
    form.title(t(player, "missions_title"));

    let body = "";
    if (active) {
        const statusColor = active.status === "failed" ? "§c" : "§a";
        const statusText = active.status === "failed" ? t(player, "mission_failed") : t(player, "mission_active");

        body += `§7-----------------------\n`;
        body += `§b[ §f${t(player, "mission_your")}: §b] ${statusColor}${statusText}\n`;
        body += `§b${t(player, "mission_obj")}: §f${getActionType(player, active.action)} ${active.amount} ${formatTargetName(player, active.target)}\n`;
        body += `§b${t(player, "mission_prog")}: §f${active.progress} / ${active.amount}\n`;
        body += `§7-----------------------\n\n`;
    }

    const msLeft = Math.max(0, board.expiresAt - Date.now());
    const daysLeft = (msLeft / (24 * 60 * 60 * 1000)).toFixed(1);
    body += `§b${t(player, "mission_renew")}: §f${daysLeft} ${t(player, "mission_days")}\n`;

    form.body(body);

    if (active && active.status === "failed") {
        form.button(`§c[ §f${t(player, "mission_abandon")} §c]`, "textures/ui/icon_admin_ban");
        form.button(t(player, "return_btn"), "textures/ui/icon_return");
        form.show(player).then(res => {
            if (res.canceled) return;
            if (res.selection === 0) {
                cancelPlayerMission(player);
                showMissionsMenu(player);
            } else {
                system.run(() => {
                    world.getDimension("overworld").runCommandAsync(`scriptevent cdr:show_main_menu "${player.name}"`).catch(() => { });
                });
            }
        });
        return;
    }

    form.button(t(player, "mission_easy"), "textures/ui/icon_difficulty");
    form.button(t(player, "mission_normal"), "textures/ui/icon_difficulty");
    form.button(t(player, "mission_hard"), "textures/ui/icon_difficulty");
    form.button(t(player, "mission_hardcore"), "textures/ui/icon_difficulty");

    if (player.hasTag("corrupcion")) {
        form.button(t(player, "cursed"), "textures/ui/icon_cursed_missions");
    }

    if (active) form.button(`§c[ §f${t(player, "mission_cancel")} §c]`, "textures/ui/icon_remove_curse");
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then(res => {
        if (res.canceled) return;
        const tiers = ["easy", "normal", "hard", "hardcore"];
        let offset = 4;
        const hasCorruption = player.hasTag("corrupcion");

        if (res.selection < 4) {
            showMissionDetails(player, board.missions[tiers[res.selection]], board.expiresAt);
        } else if (hasCorruption && res.selection === offset) {
            showCorruptionMenu(player);
        } else if (res.selection === (hasCorruption ? offset + 1 : offset) && active) {
            cancelPlayerMission(player);
            showMissionsMenu(player);
        } else {
            system.run(() => {
                world.getDimension("overworld").runCommandAsync(`scriptevent cdr:show_main_menu "${player.name}"`).catch(() => { });
            });
        }
    });
}

function showMissionDetails(player, mission, boardExpiresAt) {
    const adminMult = world.getDynamicProperty(`cdr_mult_mission_${mission.tier}`) ?? 1.0;
    const tierMult = REWARD_TIERS[mission.tier].mult;
    const reward = Math.floor(mission.baseReward * tierMult * adminMult);

    const form = new ActionFormData();
    // Limpiar formato para evitar dobles corchetes
    const tierRaw = t(player, "mission_" + mission.tier);
    const tierName = tierRaw.replace(/§./g, "").replace("[", "").replace("]", "").trim();
    form.title(`§9[ §b${tierName} §9]`);

    let body = `§b-----------------------\n`;
    body += `§b${t(player, "mission_task")}: §f${getActionType(player, mission.action)}\n`;
    body += `§b${t(player, "mission_obj")}: §f${formatTargetName(player, mission.target)}\n`;
    body += `§b${t(player, "items")}: §f${mission.amount}\n`;
    const isCursed = player.hasTag("corrupcion");
    const rewardColor = isCursed ? "§c" : "§a";
    body += `§b${t(player, "mission_reward")}: ${rewardColor}$${reward}\n`;
    body += `§b-----------------------\n`;
    form.body(body);

    const active = getPlayerMission(player);
    if (!active || active.status === "failed") {
        form.button(`§b[ §f${t(player, "mission_accept")} §b]`);
    } else {
        const busyText = active.id === mission.id ? t(player, "active") : t(player, "busy");
        form.button(`§c[ §f${busyText} §c]`);
    }

    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then(res => {
        if (res.canceled) return showMissionsMenu(player);
        if (res.selection === 0 && (!active || active.status === "failed")) {
            attemptAcceptMission(player, mission, boardExpiresAt);
            showMissionsMenu(player);
        } else {
            showMissionsMenu(player);
        }
    });
}

function formatTargetName(player, id) {
    if (!id) return "???";
    const cleanId = id.replace("minecraft:", "");
    const translated = t(player, cleanId);
    if (translated !== cleanId) return translated;

    const name = cleanId.replace(/_/g, " ");
    return name.charAt(0).toUpperCase() + name.slice(1);
}

