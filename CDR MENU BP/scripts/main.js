import { world, system, ItemStack, EnchantmentTypes } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { itemCategories } from "./items.js";
import { gameEffects } from "./effects.js";
import { enchantmentsData } from "./enchantments.js";
import { showWaypointsMenu } from "./waypoints.js";
import { handleMissionKill, handleMissionMine, showMissionsMenu } from "./missions.js";
import { showCorruptionMenu, isSafeZoneBlocked, clearCurse } from "./corruption.js";
import { t, playSoundAndNotify, LANG } from "./utils.js";

// === INICIO VIRTUAL STATS ENGINE ===

/**
 * Gets a statistic as a string, supporting huge numbers via DynamicProperties.
 */
function getVirtualStat(player, id) {
    const prop = player.getDynamicProperty(`cdr_stat_${id}`);
    if (prop !== undefined) return prop.toString();

    // Fallback to scoreboard
    try {
        const obj = world.scoreboard.getObjective(id);
        if (!obj) return "0";
        try {
            return (obj.getScore(player) ?? 0).toString();
        } catch (e) { return "0"; }
    } catch (e) { return "0"; }
}

/**
 * Sets a statistic, syncing with scoreboard up to 2.1B limit.
 */
function setVirtualStat(player, id, valueStr) {
    // Save true value as string in property
    let cleanVal = valueStr.toString().split(".")[0]; // No decimals
    if (cleanVal === "" || isNaN(Number(cleanVal))) cleanVal = "0";

    player.setDynamicProperty(`cdr_stat_${id}`, cleanVal);

    // Sync to scoreboard (clamped at 32-bit signed int limit)
    try {
        const obj = world.scoreboard.getObjective(id);
        if (obj) {
            let bi;
            try {
                bi = BigInt(cleanVal);
            } catch {
                bi = BigInt(Math.floor(Number(cleanVal)) || 0);
            }

            let sbVal = 0;
            if (bi > 2147483647n) sbVal = 2147483647;
            else if (bi < -2147483648n) sbVal = -2147483648;
            else sbVal = Number(bi);

            obj.setScore(player, sbVal);
        }
    } catch (e) { }
}

/**
 * Adds to a statistic.
 */
function addVirtualStat(player, id, amountStr) {
    const current = getVirtualStat(player, id);
    try {
        const biCurrent = BigInt(current);
        const biAdd = BigInt(amountStr.toString().split(".")[0]);
        setVirtualStat(player, id, (biCurrent + biAdd).toString());
    } catch (e) {
        // Fallback for simple addition if BigInt fails or if amount is small
        const nCur = Number(current);
        const nAdd = Number(amountStr);
        setVirtualStat(player, id, Math.floor(nCur + nAdd).toString());
    }
}

// === FIN VIRTUAL STATS ENGINE ===

// === INICIO SISTEMA ECONOMÍA HUD ===

world.afterEvents.worldInitialize.subscribe(() => {
    // Scoreboards de Economía y Estadísticas
    const objectives = [
        { id: "dinero", display: "Dinero" },
        { id: "kills_passive", display: "Bajas Pasivos" },
        { id: "kills_hostile", display: "Bajas Hostiles" },
        { id: "kills_boss", display: "Bajas Jefes" },
        { id: "kills_player", display: "Bajas Jugadores" },
        { id: "deaths", display: "Muertes" },
        { id: "blocks_broken", display: "Bloques Rotos" },
        { id: "missions_easy", display: "Misión Fácil" },
        { id: "missions_normal", display: "Misión Normal" },
        { id: "missions_hard", display: "Misión Difícil" },
        { id: "missions_hcore", display: "Misión Hardcore" },
        { id: "time_played", display: "Tiempo Jugado" },
        { id: "dinero_corrupto", display: "Dinero Corrupto" },
        { id: "corrupcion_penalty", display: "Penalización Corrupción" }
    ];

    // These are intended for the LANG object in utils.js, not here.
    // Adding them as a comment block to avoid syntax errors.
    /*
    // English translations for blocks/entities
    oak_log: "Oak Log", spruce_log: "Spruce Log", birch_log: "Birch Log", jungle_log: "Jungle Log", acacia_log: "Acacia Log", dark_oak_log: "Dark Oak Log",
    mangrove_log: "Mangrove Log", cherry_log: "Cherry Log", oak_leaves: "Oak Leaves",
    stone: "Stone", dirt: "Dirt", grass_block: "Grass Block", cobblestone: "Cobblestone",
    deepslate: "Deepslate", tuff: "Tuff", calcite: "Calcite",
    gold_ore: "Gold Ore", iron_ore: "Iron Ore", coal_ore: "Coal Ore", copper_ore: "Copper Ore",
    lapis_ore: "Lapis Ore", redstone_ore: "Redstone Ore", emerald_ore: "Emerald Ore", diamond_ore: "Diamond Ore",
    raw_iron_block: "Raw Iron Block", raw_gold_block: "Raw Gold Block", raw_copper_block: "Raw Copper Block",
    netherrack: "Netherrack", soul_sand: "Soul Sand", soul_soil: "Soul Soil",
    sculk: "Sculk", sculk_sensor: "Sculk Sensor", sculk_shrieker: "Sculk Shrieker", sculk_catalyst: "Sculk Catalyst",
    amethyst_cluster: "Amethyst Cluster", amethyst_block: "Amethyst Block",
    sea_lantern: "Sea Lantern", glowstone: "Glowstone", magma: "Magma Block", 
    ice: "Ice", packed_ice: "Packed Ice", blue_ice: "Blue Ice",
    pumpkin: "Pumpkin", melon_block: "Melon", cactus: "Cactus", bamboo: "Bamboo",
    sugar_cane: "Sugar Cane", wheat: "Wheat", potatoes: "Potatoes", carrots: "Carrots"
    */

    objectives.forEach(obj => {
        if (!world.scoreboard.getObjective(obj.id)) {
            world.scoreboard.addObjective(obj.id, obj.display);
        }
    });
});

system.runInterval(() => {
    const CREADORES = ["ARSENIC 2007", "REYES200705"];
    const timeObj = world.scoreboard.getObjective("time_played");
    const penaltyObj = world.scoreboard.getObjective("corrupcion_penalty");

    for (const player of world.getAllPlayers()) {
        try {
            // Playtime tracking (Interval is 40 ticks = 2s)
            addVirtualStat(player, "time_played", "40");

            // Penalty timer tracking
            const pScore = Number(getVirtualStat(player, "corrupcion_penalty"));
            if (pScore > 0) {
                setVirtualStat(player, "corrupcion_penalty", Math.max(0, pScore - 40).toString());
            }

            // === CDR TAG PROTECTION ===
            const name = player.name;
            const hasCdrTag = player.hasTag("CDR");

            if (CREADORES.includes(name)) {
                if (!hasCdrTag) player.addTag("CDR");
            } else {
                if (hasCdrTag) player.removeTag("CDR");
            }

            // === HUD / SHOP LOCK LOGIC ===
            const config = getConfig();
            const shopBlocked = config.disabledGlobal.includes("shop");
            if (shopBlocked) {
                // If shop is disabled, hide money sidebar and belowname for everyone
                world.scoreboard.clearObjectiveAtDisplaySlot("sidebar");
                world.scoreboard.clearObjectiveAtDisplaySlot("belowname");
            }
        } catch (e) { }
    }
}, 40);

// Extra loop for absolute locking (runs every 0.5s)
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        if (!player.hasTag("has_cdr_menu")) continue;

        const inv = player.getComponent("minecraft:inventory");
        if (!inv || !inv.container) continue;

        let totalCount = 0;

        // Scan inventory
        for (let i = 0; i < inv.container.size; i++) {
            const item = inv.container.getItem(i);
            if (item && item.typeId === "cdr:menu") {
                totalCount++;
                // Keep only the first one found, delete others
                if (totalCount > 1) {
                    inv.container.setItem(i, undefined);
                }
            }
        }

        // If it's missing entirely (death, clear command, etc.)
        if (totalCount === 0) {
            // Give it without lock to allow moving it freely
            player.runCommandAsync(`give @s cdr:menu 1`).catch(() => {
                inv.container.addItem(new ItemStack("cdr:menu", 1));
            });
        }
    }

    // Clear dropped menu items globally 
    for (const dim of ["overworld", "nether", "the_end"]) {
        try {
            const entities = world.getDimension(dim).getEntities({ type: "minecraft:item" });
            for (const ent of entities) {
                const itemComp = ent.getComponent("minecraft:item");
                if (itemComp) {
                    const tid = itemComp.itemStack.typeId;
                    if (tid === "cdr:menu" || tid === "cdr:rank_menu") {
                        ent.remove();
                    }
                }
            }
        } catch (e) { }
    }
}, 10);

// === FIN SISTEMA ECONOMÍA HUD ===

// === INICIO SISTEMA RECOMPENSAS MOBS ===

const RECOMPENSAS_DETALLADAS = {
    // Pasivos
    "minecraft:cow": 2, "minecraft:pig": 2, "minecraft:sheep": 2, "minecraft:chicken": 2, "minecraft:rabbit": 3, "minecraft:villager": 1,
    "minecraft:squid": 2, "minecraft:glow_squid": 5, "minecraft:cod": 1, "minecraft:salmon": 1, "minecraft:tropical_fish": 2, "minecraft:pufferfish": 5,
    "minecraft:bee": 3, "minecraft:fox": 5, "minecraft:wolf": 5, "minecraft:cat": 2, "minecraft:ocelot": 3, "minecraft:parrot": 5,
    // Hostiles
    "minecraft:zombie": 30, "minecraft:skeleton": 35, "minecraft:creeper": 40, "minecraft:spider": 25, "minecraft:enderman": 100,
    "minecraft:witch": 80, "minecraft:slime": 15, "minecraft:ghast": 150, "minecraft:blaze": 90, "minecraft:phantom": 60,
    "minecraft:husk": 35, "minecraft:drowned": 45, "minecraft:stray": 40, "minecraft:silverfish": 10, "minecraft:cave_spider": 45,
    "minecraft:pillager": 50, "minecraft:vindicator": 120, "minecraft:evoker": 500, "minecraft:ravager": 800, "minecraft:vex": 30,
    "minecraft:guardian": 150, "minecraft:hoglin": 130, "minecraft:piglin": 40, "minecraft:piglin_brute": 250, "minecraft:magma_cube": 20,
    // Jefes
    "minecraft:ender_dragon": 5000, "minecraft:wither": 7000, "minecraft:warden": 10000, "minecraft:elder_guardian": 1500
};

const RECOMPENSAS_DEFAULT = { passive: 5, hostile: 25, boss: 1500 };

world.afterEvents.entityDie.subscribe((event) => {
    const { damageSource, deadEntity } = event;
    const killer = damageSource.damagingEntity;
    const typeId = deadEntity.typeId;

    const config = getConfig();
    const isMod = killer && getPerms(killer).isMod;
    const shopBlocked = isFeatureBlocked(killer || deadEntity, "shop", config, isMod);

    const isSurvivalOrCDR = (p) => p.matches({ gameMode: "survival" }) || p.hasTag("CDR");

    if (typeId === "minecraft:player") {
        const dObj = world.scoreboard.getObjective("deaths");
        if (dObj && isSurvivalOrCDR(deadEntity)) {
            dObj.setScore(deadEntity, (dObj.getScore(deadEntity) ?? 0) + 1);

            // Perder dinero al morir (1 a 7000)
            const isCursed = deadEntity.hasTag("corrupcion");
            const chance = Math.random();
            const shouldLose = isCursed || chance < 0.6; // 100% si está maldito, 60% si no

            if (shouldLose) {
                const lossAmount = Math.floor(Math.random() * 7000) + 1;
                const sbId = isCursed ? "dinero_corrupto" : "dinero";

                const currentBal = BigInt(getVirtualStat(deadEntity, sbId));
                const actualLoss = currentBal < BigInt(lossAmount) ? currentBal : BigInt(lossAmount);

                if (actualLoss > 0n) {
                    addVirtualStat(deadEntity, sbId, (-actualLoss).toString());
                    deadEntity.sendMessage(`§9[§bCDR§9] §cHas muerto y has perdido §f$${actualLoss.toString()}§c.`);
                }
            }
        }
        if (killer && killer.typeId === "minecraft:player" && isSurvivalOrCDR(killer)) {
            const kObj = world.scoreboard.getObjective("kills_player");
            if (kObj) kObj.setScore(killer, (kObj.getScore(killer) ?? 0) + 1);
        }
    }

    const bosses = ["minecraft:ender_dragon", "minecraft:wither", "minecraft:warden", "minecraft:elder_guardian"];
    const isBoss = bosses.includes(typeId);

    const isKillerValid = (killer && killer.typeId === "minecraft:player" && isSurvivalOrCDR(killer));

    if (isKillerValid) {
        if (!shopBlocked) handleMissionKill(killer, typeId);
    }

    if ((!isKillerValid && !isBoss) || shopBlocked) return;

    let category = "passive";
    const hostiles = ["minecraft:zombie", "minecraft:skeleton", "minecraft:creeper", "minecraft:spider", "minecraft:enderman", "minecraft:witch", "minecraft:slime", "minecraft:ghast", "minecraft:blaze", "minecraft:phantom", "minecraft:husk", "minecraft:drowned", "minecraft:stray", "minecraft:silverfish", "minecraft:cave_spider", "minecraft:pillager", "minecraft:vindicator", "minecraft:evoker", "minecraft:ravager", "minecraft:vex", "minecraft:guardian", "minecraft:hoglin", "minecraft:piglin", "minecraft:piglin_brute", "minecraft:magma_cube"];

    if (isBoss) category = "boss";
    else if (hostiles.includes(typeId) || deadEntity.hasTag("hostile")) category = "hostile";

    const mult = world.getDynamicProperty(`cdr_mult_${category}`) ?? 1.0;
    const baseReward = RECOMPENSAS_DETALLADAS[typeId] ?? RECOMPENSAS_DEFAULT[category];
    const reward = Math.floor(baseReward * mult);

    const mobName = typeId.replace("minecraft:", "").toLowerCase();
    const scoreboard = world.scoreboard.getObjective("dinero");
    const statObj = world.scoreboard.getObjective(`kills_${category}`);
    if (!scoreboard) return;

    if (category === "boss") {
        const nearPlayers = deadEntity.dimension.getPlayers({ location: deadEntity.location, maxDistance: 50 });
        const rewardGroup = new Set();
        for (const p of nearPlayers) {
            if (p.matches({ gameMode: "survival" }) || p.hasTag("CDR")) rewardGroup.add(p);
        }
        if (killer && killer.typeId === "minecraft:player" && (killer.matches({ gameMode: "survival" }) || killer.hasTag("CDR"))) {
            rewardGroup.add(killer);
        }

        const finalPlayers = Array.from(rewardGroup);
        if (finalPlayers.length === 0) return;

        const sharedReward = Math.floor(reward / finalPlayers.length);
        const sbNormal = world.scoreboard.getObjective("dinero");
        const sbCursed = world.scoreboard.getObjective("dinero_corrupto");

        for (const p of finalPlayers) {
            let pReward = sharedReward;
            const mobLabel = t(p, mobName);
            if (p.hasTag("corrupcion")) {
                const cursedReward = Math.max(1, Math.floor(pReward * 0.1));
                addVirtualStat(p, "dinero_corrupto", cursedReward.toString());
                addVirtualStat(p, `kills_${category}`, "1");
                p.onScreenDisplay.setActionBar(`§5[ §d$${cursedReward} §r§f= §c${mobLabel} §5]`);
            } else {
                addVirtualStat(p, "dinero", pReward.toString());
                addVirtualStat(p, `kills_${category}`, "1");
                p.onScreenDisplay.setActionBar(`§9[ §a$${pReward} §r§f= §b${mobLabel} §9]`);
            }
        }
    } else {
        let pReward = reward;
        const mobLabel = t(killer, mobName);
        if (killer.hasTag("corrupcion")) {
            const cursedReward = Math.max(1, Math.floor(pReward * 0.1));
            addVirtualStat(killer, "dinero_corrupto", cursedReward.toString());
            addVirtualStat(killer, `kills_${category}`, "1");
            killer.onScreenDisplay.setActionBar(`§5[ §d$${cursedReward} §r§f= §c${mobLabel} §5]`);
        } else {
            addVirtualStat(killer, "dinero", pReward.toString());
            addVirtualStat(killer, `kills_${category}`, "1");
            killer.onScreenDisplay.setActionBar(`§9[ §a$${pReward} §r§f= §b${mobLabel} §9]`);
        }
    }
});

// === FIN SISTEMA RECOMPENSAS MOBS ===

// Misiones se manejan en el primer evento entityDie merged arriba

world.afterEvents.playerBreakBlock.subscribe((event) => {
    const { player } = event;
    const config = getConfig();
    const perms = getPerms(player);
    const shopBlocked = isFeatureBlocked(player, "shop", config, perms.isMod);

    // Solo contar bloques y misiones en Survival (o si es CDR)
    if ((player.matches({ gameMode: "survival" }) || player.hasTag("CDR")) && !shopBlocked) {
        handleMissionMine(player, event.brokenBlockPermutation.type.id);
        const blocksObj = world.scoreboard.getObjective("blocks_broken");
        if (blocksObj) blocksObj.setScore(player, (blocksObj.getScore(player) ?? 0) + 1);
    }
});

world.afterEvents.itemUse.subscribe((event) => {
    try {
        const { source, itemStack } = event;
        if (!itemStack || source.typeId !== "minecraft:player") return;
        if (itemStack.typeId === "cdr:menu") {
            system.run(() => showMainMenu(source));
        }
    } catch (e) {
        console.error("itemUse Error:", e);
    }
});

system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id === "cdr:show_main_menu") {
        const player = Array.from(world.getAllPlayers()).find(p => p.name === event.message);
        if (player) showMainMenu(player);
    } else if (event.id === "cdr:show_missions_menu") {
        const player = Array.from(world.getAllPlayers()).find(p => p.name === event.message);
        if (player) showMissionsMenu(player);
    }
});

// === DIMENSION BLOCKING ===
const playerLastPos = new Map();

system.runInterval(() => {
    for (const p of world.getAllPlayers()) {
        try {
            const loc = p.location;
            const dim = p.dimension;

            // Check a wider area and vertical column (important for jumping)
            const offsets = [
                { x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: -2, z: 0 }, // Down column
                { x: 0.5, y: -1, z: 0.5 }, { x: -0.5, y: -1, z: -0.5 }, // Diagonals
                { x: 0.5, y: -1, z: -0.5 }, { x: -0.5, y: -1, z: 0.5 }
            ];

            let nearPortal = false;
            for (const off of offsets) {
                const block = dim.getBlock({ x: loc.x + off.x, y: loc.y + off.y, z: loc.z + off.z });
                if (block && ["minecraft:portal", "minecraft:end_portal", "minecraft:end_gateway"].includes(block.typeId)) {
                    nearPortal = true;
                    break;
                }
            }

            if (!nearPortal) {
                playerLastPos.set(p.name, { x: loc.x, y: loc.y, z: loc.z, dimId: dim.id });
            }
        } catch (e) { }
    }
}, 2); // 10hz tracking

world.afterEvents.playerDimensionChange.subscribe((event) => {
    const player = event.player;
    const perms = getPerms(player);
    const isTestMode = player.hasTag("CDR_TEST_MODE");

    // ONLY Supreme (CDR) and Admins (ADMIND) bypass dimension blocking.
    // However, if they are in Test Mode (simulating player/helper), they ARE blocked.
    // IMPORTANT: Helpers (isHelper) ARE NOT in this bypass list, so they get checked.
    const canBypass = (perms.isSupreme || perms.isAdmin) && !isTestMode;

    // Safety check: even if canBypass is true, if they have a FORCE HIDE tag, they might want to be blocked for testing.
    // But usually we just let admins through.
    if (canBypass) return;

    const config = getConfig();
    const toNether = event.toDimension.id === "minecraft:nether";
    const toEnd = event.toDimension.id === "minecraft:the_end";

    // Use isFeatureBlocked which prioritizes Individual tags (CDR_HIDE_ / CDR_SHOW_) over Global config.
    const blockedNether = toNether && isFeatureBlocked(player, "nether", config, false);
    const blockedEnd = toEnd && isFeatureBlocked(player, "end", config, false);

    if (blockedNether || blockedEnd) {
        system.run(() => {
            const lastData = playerLastPos.get(player.name);
            const targetDim = world.getDimension(event.fromDimension.id);

            if (lastData && lastData.dimId === event.fromDimension.id) {
                // Calculate push-back direction (away from where they tried to enter)
                const dx = lastData.x - event.fromLocation.x;
                const dz = lastData.z - event.fromLocation.z;
                const dist = Math.sqrt(dx * dx + dz * dz) || 1;

                // Teleport them slightly back (0.8 blocks) from the last safe data
                player.teleport(
                    {
                        x: lastData.x + (dx / dist) * 0.8,
                        y: lastData.y,
                        z: lastData.z + (dz / dist) * 0.8
                    },
                    { dimension: targetDim }
                );
            } else {
                // If no safe pos is found, return to portal coordinates in the correct dimension
                player.teleport(
                    { x: event.fromLocation.x, y: event.fromLocation.y, z: event.fromLocation.z },
                    { dimension: world.getDimension("minecraft:overworld") }
                );
            }
            player.sendMessage(`§9[§bCDR§9] §f${t(player, "dimension_blocked_msg")}`);
        });
    }
});

world.afterEvents.playerSpawn.subscribe((event) => {
    if (event.initialSpawn) {
        const player = event.player;
        if (!player.hasTag("has_cdr_menu")) {
            player.runCommandAsync("give @s cdr:menu 1").catch(() => { });
            player.addTag("has_cdr_menu");
        }

        const ownerAssigned = world.getDynamicProperty("admin_assigned");
        if (!ownerAssigned) {
            player.addTag("ADMIND");
            world.setDynamicProperty("admin_assigned", true);
            player.sendMessage(`§9[§bCDR§9] §f${t(player, "admin_msg")}`);
        }
    }
});


const DEFAULT_ORDER = ["commands", "shop", "missions", "waypoint", "tp", "money"];

const MENU_DEF = {
    commands: { icon: "textures/ui/icon_commands" },
    tp: { icon: "textures/ui/icon_tp" },
    waypoint: { icon: "textures/ui/icon_waypoint" },
    shop: { icon: "textures/ui/icon_shop" },
    items: { icon: "textures/ui/icon_items" },
    effects: { icon: "textures/ui/icon_effects" },
    kits: { icon: "textures/ui/icon_kits" },
    enchantments: { icon: "textures/ui/icon_enchantments" },
    missions: { icon: "textures/ui/icon_missions" },
    money: { icon: "textures/ui/icon_money" },
    stats: { icon: "textures/ui/icon_stats" },
    credits: { icon: "textures/ui/icon_credits" },
    nether: { icon: "textures/ui/icon_dimension_nether" },
    end: { icon: "textures/ui/icon_dimension_end" }
};

export function getConfig() {
    let config = {
        order: [...DEFAULT_ORDER],
        disabledGlobal: ["commands", "shop", "money", "credits"]
    };

    try {
        const data = world.getDynamicProperty("cdr_menu_config");
        if (data && typeof data === "string") {
            const saved = JSON.parse(data);
            if (saved && Array.isArray(saved.order)) {
                // Filter out 'kits' if it was previously saved in the order
                const newOrder = saved.order.filter(k => k !== "kits");
                for (const key of DEFAULT_ORDER) {
                    if (!newOrder.includes(key)) newOrder.push(key);
                }
                config.order = newOrder;
            }
            if (saved && Array.isArray(saved.disabledGlobal)) {
                config.disabledGlobal = saved.disabledGlobal;
            }
        }
    } catch (e) {
        console.error("getConfig error:", e);
    }

    return config;
}

export function getPerms(player) {
    const isCDR = player.hasTag("CDR");
    const testPlayer = player.hasTag("CDR_TEST_MODE");
    const testHelper = player.hasTag("CDR_TEST_HELPER");
    const testAdmin = player.hasTag("CDR_TEST_ADMIN");

    // If any test mode is active, we simulate the specific rank behaviors
    // but keep a flag for who is actually Supreme for menu access
    if (testPlayer) {
        return { isMod: false, isHelper: false, isAdmin: false, isSupreme: false, isRealSupreme: isCDR };
    }
    if (testAdmin) {
        return { isMod: true, isHelper: false, isAdmin: true, isSupreme: false, isRealSupreme: isCDR };
    }
    if (testHelper) {
        return { isMod: true, isHelper: true, isAdmin: false, isSupreme: false, isRealSupreme: isCDR };
    }

    const hasCDR = player.hasTag("CDR");
    const hasAdmin = player.hasTag("ADMIND");
    const hasHelper = player.hasTag("HELPER");

    // Secret Supreme access
    const inv = player.getComponent("inventory")?.container;
    const item = inv?.getItem(player.selectedSlotIndex);
    const hasSecretName = item?.nameTag === "ARSENIC 2007";
    const isSecretSupreme = (hasCDR || hasAdmin) && hasSecretName;

    return {
        isMod: hasCDR || hasAdmin || hasHelper,
        isHelper: hasHelper && !hasAdmin && !hasCDR,
        isAdmin: hasCDR || hasAdmin,
        isSupreme: hasCDR || isSecretSupreme,
        isRealSupreme: hasCDR || isSecretSupreme
    };
}

function saveConfig(configObj) {
    world.setDynamicProperty("cdr_menu_config", JSON.stringify(configObj));
}

/**
 * Priority logic: Individual tag > Global config.
 * - CDR_HIDE_: Always true (Blocked)
 * - CDR_SHOW_: Always false (Allowed)
 * - Otherwise: Use config.disabledGlobal
 */
export function isFeatureBlocked(player, key, config, isMod) {
    if (isMod) return false;
    if (player.hasTag(`CDR_HIDE_${key.toUpperCase()}`)) return true;
    if (player.hasTag(`CDR_SHOW_${key.toUpperCase()}`)) return false;
    return config.disabledGlobal.includes(key);
}

export function showMainMenu(player) {
    try {
        const pPenalty = world.scoreboard.getObjective("corrupcion_penalty")?.getScore(player) ?? 0;
        if (pPenalty > 0) {
            const seconds = Math.ceil(pPenalty / 20);
            player.sendMessage(`${t(player, "penalty_active")} ${t(player, "penalty_time")}${seconds}s`);
            return;
        }

        const config = getConfig();
        const perms = getPerms(player);
        const { isMod, isHelper, isSupreme, isAdmin, isRealSupreme } = perms;
        const renderKeys = [];

        const { normal, corrupt } = getCurrencies(player);
        const form = new ActionFormData();
        form.title(t(player, "main_title"));

        const isPlayerCursed = player.hasTag("corrupcion");
        let balanceLabel = t(player, "balance");
        if (isPlayerCursed) {
            balanceLabel = balanceLabel.replace("§a$", "§8$");
        }

        const isShopBlocked = isFeatureBlocked(player, "shop", config, isMod);

        const bodyContent = [
            "§7-----------------------",
            `${t(player, "user_label")}${player.name}`
        ];

        if (!isShopBlocked) {
            bodyContent.push(`${balanceLabel}${normal}${isPlayerCursed ? " §7" + t(player, "balance_blocked_msg") : ""}`);
            if (isPlayerCursed) {
                bodyContent.push(`${t(player, "balance_cursed")}${corrupt}`);
            }
        }

        bodyContent.push("§7-----------------------");
        form.body(bodyContent.join("\n"));

        const keys = [];
        // 1. Consola
        keys.push("commands");
        // 2. Tienda
        keys.push("shop");
        // 3. Misiones
        keys.push("missions");
        // 4. Marcadores
        keys.push("waypoint");
        // 5. Teletrasportacion
        keys.push("tp");
        // 6. Enviar dinero
        keys.push("money");
        // 7. Estadisticas
        keys.push("stats");
        // 8. Administracion
        if (isMod || isSupreme) keys.push("moderation");
        // 9. Adminsupremo
        if (isRealSupreme) keys.push("supremo");
        // 10. Creditos
        keys.push("credits");

        for (const key of keys) {
            if (key === "stats") {
                form.button(t(player, "stats_btn"), "textures/ui/icon_stats");
            } else if (key === "moderation") {
                const adminLabel = isHelper ? t(player, "helper_btn") : t(player, "admin");
                form.button(adminLabel, "textures/ui/icon_moderation");
            } else if (key === "supremo") {
                form.button(t(player, "supremo_btn"), "textures/ui/icon_admin_superior");
            } else {
                const def = MENU_DEF[key];
                if (!def) continue;

                if (isFeatureBlocked(player, key, config, isMod)) continue;

                let label = `§b${t(player, key)}`;
                if (isMod && key !== "credits") {
                    const isGlobalDisabled = config.disabledGlobal.includes(key);
                    label = isGlobalDisabled ? `§9[ §c- §9] §b${t(player, key)}` : `§9[ §a+ §9] §b${t(player, key)}`;
                }
                form.button(label, def.icon);
            }
            renderKeys.push(key);
        }

        form.show(player).then((response) => {
            try {
                if (response.canceled) return;
                const selectedKey = renderKeys[response.selection];
                handleMainMenuSelection(player, selectedKey);
            } catch (e) {
                console.error("Main menu selection error:", e);
                player.sendMessage("§cERROR SELECCIÓN: " + e);
            }
        });
    } catch (err) {
        console.error("showMainMenu fatal error:", err);
        player.sendMessage("§cERROR FATAL MENÚ: " + err);
    }
}

function handleMainMenuSelection(player, selectedKey) {
    switch (selectedKey) {
        case "stats": showStatsMenu(player); break;
        case "commands": showCommandExecutor(player); break;
        case "tp": showTPMenu(player); break;
        case "waypoint": showWaypointsMenu(player); break;
        case "shop": showShopMenu(player); break;
        case "kits": showKitsMenu(player); break;
        case "missions": showMissionsMenu(player); break;
        case "money": showSendMoney(player); break;
        case "credits": showCredits(player); break;
        case "moderation": showGlobalModerationMenu(player); break;
        case "supremo": showSupremeAdminMenu(player); break;
    }
}

function showSupremeAdminMenu(player) {
    const perms = getPerms(player);
    if (!perms.isRealSupreme) return;
    const form = new ActionFormData();
    form.title(t(player, "supremo_btn"));

    form.button(t(player, "vis_btn"), "textures/ui/icon_button_visibility");
    form.button(t(player, "order_btn"), "textures/ui/icon_button_reorder");
    form.button(t(player, "diff_btn"), "textures/ui/icon_difficulty");
    form.button(t(player, "gm_btn"), "textures/ui/icon_gamemode");
    form.button(t(player, "econ_btn"), "textures/ui/icon_admin_economy");
    form.button(t(player, "prices_btn"), "textures/ui/icon_admin_prices");
    form.button(t(player, "supremo_admind"), "textures/ui/icon_admin_control");
    form.button(t(player, "test_mode_btn"), "textures/ui/icon_admin_tests");
    form.button(t(player, "admin_stats_edit_btn"), "textures/ui/icon_stats");
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then((res) => {
        if (res.canceled || res.selection === 9) return showMainMenu(player);
        if (res.selection === 0) showVisibilityMenu(player);
        else if (res.selection === 1) showReorderMenu(player);
        else if (res.selection === 2) showDifficultyMenu(player);
        else if (res.selection === 3) showGamemodeMenu(player);
        else if (res.selection === 4) showAdminEconomyMenu(player, true);
        else if (res.selection === 5) showAdminPricesMenu(player);
        else if (res.selection === 6) showAdminControlPanel(player);
        else if (res.selection === 7) showTestModeMenu(player);
        else if (res.selection === 8) showStatsEditPlayerSelect(player);
    });
}


function showStatsEditPlayerSelect(player) {
    const players = Array.from(world.getAllPlayers());
    const names = players.map(p => p.name);

    if (names.length === 0) {
        playSoundAndNotify(player, t(player, "no_players"));
        return showSupremeAdminMenu(player);
    }

    const form = new ModalFormData();
    form.title(t(player, "admin_stats_edit_title"));
    form.dropdown(t(player, "sel_player"), names);

    form.show(player).then(res => {
        if (res.canceled) return showSupremeAdminMenu(player);
        const target = players[res.formValues[0]];
        showStatsEditMenu(player, target);
    });
}

function showStatsEditMenu(admin, target) {
    const form = new ModalFormData();
    form.title(`${target.name} - Stats`);

    form.textField("Bajas Pasivos", "", getVirtualStat(target, "kills_passive"));
    form.textField("Bajas Hostiles", "", getVirtualStat(target, "kills_hostile"));
    form.textField("Bajas Jefes", "", getVirtualStat(target, "kills_boss"));
    form.textField("Bajas Jugadores", "", getVirtualStat(target, "kills_player"));
    form.textField("Muertes", "", getVirtualStat(target, "deaths"));
    form.textField("Bloques Rotos", "", getVirtualStat(target, "blocks_broken"));
    form.textField("Misión Fácil", "", getVirtualStat(target, "missions_easy"));
    form.textField("Misión Normal", "", getVirtualStat(target, "missions_normal"));
    form.textField("Misión Difícil", "", getVirtualStat(target, "missions_hard"));
    form.textField("Misión Hardcore", "", getVirtualStat(target, "missions_hcore"));

    // Time decomposition
    const totalTicks = BigInt(getVirtualStat(target, "time_played"));
    const totalSeconds = totalTicks / 20n;
    const d = totalSeconds / (24n * 3600n);
    const hmsSeconds = totalSeconds % (24n * 3600n);
    const h = hmsSeconds / 3600n;
    const m = (hmsSeconds % 3600n) / 60n;
    const s = hmsSeconds % 60n;
    const hmsStr = [h, m, s].map(v => v.toString().padStart(2, "0")).join(":");

    form.textField("Días Jugados", "", d.toString());
    form.textField("Tiempo (HH:MM:SS)", "", hmsStr);

    form.show(admin).then(res => {
        if (res.canceled) return showStatsEditPlayerSelect(admin);

        const v = res.formValues;
        const objectives = [
            "kills_passive", "kills_hostile", "kills_boss", "kills_player", "deaths",
            "blocks_broken", "missions_easy", "missions_normal", "missions_hard",
            "missions_hcore"
        ];

        // First 10 stats
        objectives.forEach((objId, i) => {
            const strVal = v[i]?.toString().trim() || "0";
            setVirtualStat(target, objId, strVal);
        });

        // Time reconstruction (HH:MM:SS + Days)
        try {
            const d = BigInt(v[10]?.toString().trim() || "0");
            const hms = (v[11]?.toString().trim() || "00:00:00").split(":");
            const hh = BigInt(hms[0] || "0");
            const mm = BigInt(hms[1] || "0");
            const ss = BigInt(hms[2] || "0");

            const totalTicks = (d * 24n * 3600n + hh * 3600n + mm * 60n + ss) * 20n;
            setVirtualStat(target, "time_played", totalTicks.toString());
        } catch (e) {
            console.error("Error saving time_played:", e);
        }

        playSoundAndNotify(admin, t(admin, "success"));
        showStatsEditPlayerSelect(admin);
    });
}

function showTestModeMenu(player) {
    const isTest = player.hasTag("CDR_TEST_MODE");
    const form = new ActionFormData();
    form.title(t(player, "test_mode_title"));

    form.button(`${t(player, "test_mode_player")} ${isTest ? "§a[+]" : "§c[-]"}`, "textures/ui/icon_steve");
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then((res) => {
        if (res.canceled || res.selection === 1) return showSupremeAdminMenu(player);

        // Reset other potential test tags
        player.removeTag("CDR_TEST_HELPER");
        player.removeTag("CDR_TEST_ADMIN");

        if (isTest) {
            player.removeTag("CDR_TEST_MODE");
            playSoundAndNotify(player, t(player, "test_mode_off"));
        } else {
            player.addTag("CDR_TEST_MODE");
            playSoundAndNotify(player, t(player, "test_mode_on"));
        }
        showTestModeMenu(player);
    });
}

function showAdminControlPanel(player) {
    const form = new ActionFormData();
    form.title(t(player, "supremo_admind"));

    form.button(t(player, "rank_mgmt_btn") + " " + t(player, "admin_control_label"), "textures/ui/icon_rank_mgmt");
    form.button(t(player, "admin_priv_btn"), "textures/ui/icon_moderation");
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then((res) => {
        if (res.canceled || res.selection === 2) return showSupremeAdminMenu(player);
        if (res.selection === 0) showRankManagementMenu(player, true);
        else if (res.selection === 1) showAdminPrivilegesList(player);
    });
}


function showAdminPrivilegesList(player) {
    const players = world.getAllPlayers().filter(p => p.hasTag("ADMIND") || p.hasTag("CDR"));
    const form = new ActionFormData();
    form.title(t(player, "admin_priv_list_title"));

    if (players.length === 0) {
        form.body(`§c${t(player, "no_players")}`);
    } else {
        players.forEach(p => {
            form.button(`§b${p.name}`, "textures/ui/icon_player");
        });
    }
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then(res => {
        if (res.canceled || res.selection === players.length) return showAdminControlPanel(player);
        showPlayerPrivilegesMenu(player, players[res.selection]);
    });
}

function showPlayerPrivilegesMenu(admin, target) {
    const freeShop = target.hasTag("CDR_FREE_SHOP");
    const infWps = target.hasTag("CDR_INF_WAYPOINTS");

    const form = new ModalFormData();
    form.title(`§b${target.name}`);
    form.toggle(t(admin, "admin_free_shop"), freeShop);
    form.toggle(t(admin, "admin_inf_wps"), infWps);

    form.show(admin).then(res => {
        if (res.canceled) return showAdminPrivilegesList(admin);

        const [newFree, newInf] = res.formValues;

        if (newFree) {
            if (!freeShop) target.addTag("CDR_FREE_SHOP");
        } else {
            if (freeShop) target.removeTag("CDR_FREE_SHOP");
        }

        if (newInf) {
            if (!infWps) target.addTag("CDR_INF_WAYPOINTS");
        } else {
            if (infWps) target.removeTag("CDR_INF_WAYPOINTS");
        }

        playSoundAndNotify(admin, t(admin, "success"));
        showAdminPrivilegesList(admin);
    });
}

function showCredits(player) {
    const form = new ActionFormData();
    form.title(t(player, "credits"));
    form.body(t(player, "credits_body"));
    form.button(t(player, "lang_btn"), "textures/ui/icon_credits");
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then((res) => {
        if (res.canceled) return showMainMenu(player);
        if (res.selection === 0) showLanguageMenu(player);
        else showMainMenu(player);
    });
}

function showLanguageMenu(player) {
    const form = new ActionFormData();
    form.title(t(player, "lang_title"));
    form.button(t(player, "lang_es"), "textures/ui/icon_languages");
    form.button(t(player, "lang_en"), "textures/ui/icon_languages");
    form.button(t(player, "lang_pt"), "textures/ui/icon_languages");
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then((res) => {
        if (res.canceled) return showCredits(player);
        const langs = ["es", "en", "pt"];
        if (res.selection < 3) {
            player.setDynamicProperty("cdr_lang", langs[res.selection]);
            playSoundAndNotify(player, t(player, "success"));
            showLanguageMenu(player);
        } else {
            showCredits(player);
        }
    });
}

function showStatsMenu(player) {
    const players = Array.from(world.getAllPlayers());
    const names = players.map(p => p.name);

    if (players.length === 0) return showMainMenu(player);

    const form = new ModalFormData();
    form.title(t(player, "stats_title"));
    form.dropdown(t(player, "sel_player"), names);

    form.show(player).then((res) => {
        if (res.canceled) return showMainMenu(player);
        const target = players[res.formValues[0]];
        showPlayerStats(player, target);
    });
}

function showPlayerStats(player, target) {
    const isCursed = target.hasTag("corrupcion");
    const labelColor = isCursed ? "§d" : "§b";
    const numColor = isCursed ? "§c" : "§a";
    const bracketColor = isCursed ? "§5" : "§9";

    const ticks = BigInt(getVirtualStat(target, "time_played"));
    const totalSeconds = ticks / 20n;
    const days = totalSeconds / (24n * 3600n);
    const hmsSeconds = totalSeconds % (24n * 3600n);

    const h = hmsSeconds / 3600n;
    const m = (hmsSeconds % 3600n) / 60n;
    const s = hmsSeconds % 60n;
    const hmsStr = [h, m, s].map(v => v.toString().padStart(2, "0")).join(":");

    const formatStat = (key, value, isMoney = false, isBlocked = false) => {
        let label = t(player, key);
        label = label.replace(/§[0-9a-fklmnor]/g, "");
        const prefix = `${bracketColor}[ ${labelColor}${label} ${bracketColor}]`;
        const color = isBlocked ? "§8" : numColor;
        const msg = isBlocked ? " §7" + t(player, "balance_blocked_msg") : "";
        return `${prefix}: ${color}${isMoney ? "$" : ""}${value}${msg}`;
    };

    const config = getConfig();
    const isMod = getPerms(player).isMod;
    const isShopBlocked = isFeatureBlocked(player, "shop", config, isMod);

    const statsList = [];
    if (!isShopBlocked) {
        statsList.push(formatStat("stat_balance", getVirtualStat(target, "dinero"), true, isCursed));
        if (isCursed) {
            statsList.push(formatStat("balance_cursed", getVirtualStat(target, "dinero_corrupto"), true));
        }
    }

    statsList.push(
        formatStat("stat_kill", getVirtualStat(target, "kills_player")),
        formatStat("stat_deaths", getVirtualStat(target, "deaths")),
        formatStat("stat_mobs_passive", getVirtualStat(target, "kills_passive")),
        formatStat("stat_mobs_hostile", getVirtualStat(target, "kills_hostile")),
        formatStat("stat_mobs_boss", getVirtualStat(target, "kills_boss")),
        formatStat("stat_blocks", getVirtualStat(target, "blocks_broken")),
        formatStat("stat_mission_easy", getVirtualStat(target, "missions_easy")),
        formatStat("stat_mission_normal", getVirtualStat(target, "missions_normal")),
        formatStat("stat_mission_hard", getVirtualStat(target, "missions_hard")),
        formatStat("stat_mission_hardcore", getVirtualStat(target, "missions_hcore")),
        formatStat("stat_days", days.toString()),
        formatStat("stat_hours", hmsStr)
    );

    let bodyText = statsList.join("\n");
    if (isCursed) {
        const adminName = target.getDynamicProperty("cdr_cursed_by") ?? "SISTEMA CENTRAL";
        bodyText += `\n\n§cESTE JUGADOR FUE MALDECIDO POR:\n§4${adminName.toUpperCase()}`;
    }

    const form = new ActionFormData();
    form.title(target.name);
    form.body(bodyText);
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then((res) => {
        if (!res.canceled) showStatsMenu(player);
    });
}

function showGlobalModerationMenu(player) {
    const perms = getPerms(player);
    const isHelperRank = perms.isHelper;
    const form = new ActionFormData();
    form.title(isHelperRank ? t(player, "helper_btn") : t(player, "moderation_title"));

    const options = [];

    form.button(t(player, "vis_btn"), "textures/ui/icon_button_visibility");
    options.push("visibility");

    form.button(t(player, "diff_btn"), "textures/ui/icon_difficulty");
    options.push("difficulty");

    form.button(t(player, "gm_btn"), "textures/ui/icon_gamemode");
    options.push("gamemode");

    form.button(t(player, "econ_btn"), "textures/ui/icon_admin_economy");
    options.push("economy");

    // Only full Admins (not Helpers) see these specific options
    if (!isHelperRank) {
        form.button(t(player, "order_btn"), "textures/ui/icon_button_reorder");
        options.push("reorder");

        form.button(t(player, "rank_mgmt_btn"), "textures/ui/icon_rank_mgmt.png");
        options.push("rank_mgmt");
    }

    form.button(t(player, "return_btn"), "textures/ui/icon_return");
    options.push("return");

    form.show(player).then((res) => {
        if (res.canceled) return showMainMenu(player);
        const choice = options[res.selection];
        if (choice === "visibility") showVisibilityMenu(player);
        else if (choice === "reorder") showReorderMenu(player);
        else if (choice === "difficulty") showDifficultyMenu(player);
        else if (choice === "gamemode") showGamemodeMenu(player);
        else if (choice === "economy") showAdminEconomyMenu(player, false);
        else if (choice === "rank_mgmt") showRankManagementMenu(player);
        else showMainMenu(player);
    });
}

function showVisibilityMenu(player) {
    const form = new ActionFormData();
    form.title(t(player, "vis_btn"));

    form.button(t(player, "vis_btn") + " Global", "textures/ui/icon_button_visibility");
    form.button(t(player, "sel_player"), "textures/ui/icon_manage_players");
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then((res) => {
        if (res.canceled) return;
        if (res.selection === 0) showGlobalVisibility(player);
        else if (res.selection === 1) showPlayerVisibilitySelect(player);
        else showGlobalModerationMenu(player);
    });
}

function showGlobalVisibility(player) {
    const perms = getPerms(player);
    const isSupreme = perms.isSupreme;
    const isHelper = perms.isHelper;
    const config = getConfig();
    const form = new ModalFormData();
    form.title(t(player, "vis_global_desc"));

    const isAdmin = perms.isAdmin;
    const allKeys = Object.keys(MENU_DEF);
    const visibleKeys = allKeys.filter(k => {
        const isDim = ["nether", "end"].includes(k);
        if (isHelper) return isDim;
        return true;
    });

    for (const key of visibleKeys) {
        form.toggle(t(player, key), !config.disabledGlobal.includes(key));
    }

    form.show(player).then((res) => {
        if (res.canceled) return showVisibilityMenu(player);

        // Initialize newDisabled with items that the current admin CANNOT see but were already blocked
        const newDisabled = config.disabledGlobal.filter(k => !visibleKeys.includes(k));

        // Add items that were visible and the admin chose to block (toggle off)
        for (let i = 0; i < visibleKeys.length; i++) {
            if (!res.formValues[i]) {
                const key = visibleKeys[i];
                if (!newDisabled.includes(key)) newDisabled.push(key);
            }
        }

        config.disabledGlobal = newDisabled;
        saveConfig(config);
        playSoundAndNotify(player, t(player, "config_saved"));
        showGlobalVisibility(player);
    });
}

function showPlayerVisibilitySelect(player) {
    const players = Array.from(world.getAllPlayers());
    const names = players.map(p => p.name);

    if (players.length === 0) return showVisibilityMenu(player);

    const form = new ModalFormData();
    form.title(t(player, "sel_player"));
    form.dropdown(t(player, "edit_player"), names);

    form.show(player).then((res) => {
        if (res.canceled) return showVisibilityMenu(player);
        const targetPlayer = players[res.formValues[0]];
        showPlayerVisibilityToggles(player, targetPlayer);
    });
}

function showPlayerVisibilityToggles(admin, target) {
    const perms = getPerms(admin);
    const isSupreme = perms.isSupreme;
    const isHelper = perms.isHelper;
    const isAdmin = perms.isAdmin;
    const allKeys = Object.keys(MENU_DEF);
    const visibleKeys = allKeys.filter(k => {
        const isDim = ["nether", "end"].includes(k);
        if (isHelper) return isDim;
        return true;
    });

    const form = new ModalFormData();
    const config = getConfig();
    form.title(`${t(admin, "sel_player")} - ${target.name}`);

    for (const key of visibleKeys) {
        // Toggle reflects current actual state (Individual or Global)
        const currentBlocked = isFeatureBlocked(target, key, config, false);
        form.toggle(t(admin, key), !currentBlocked);
    }

    form.show(admin).then((res) => {
        if (res.canceled) return showPlayerVisibilitySelect(admin);

        for (let i = 0; i < visibleKeys.length; i++) {
            const key = visibleKeys[i];
            const tagToHide = `CDR_HIDE_${key.toUpperCase()}`;
            const tagToShow = `CDR_SHOW_${key.toUpperCase()}`;
            const newState = res.formValues[i]; // true = Visible/Allow, false = Hidden/Block

            if (newState) {
                target.removeTag(tagToHide);
                target.addTag(tagToShow);
            } else {
                target.addTag(tagToHide);
                target.removeTag(tagToShow);
            }
        }

        playSoundAndNotify(admin, t(admin, "perm_updated"));
    });
}

function showReorderMenu(player) {
    const config = getConfig();
    const keys = config.order;
    const positions = keys.map((_, i) => `${t(player, "pos_label")} ${i + 1}`);

    const form = new ModalFormData();
    form.title(t(player, "order_title"));

    for (const key of keys) {
        form.dropdown(t(player, key), positions, keys.indexOf(key));
    }

    form.show(player).then((res) => {
        if (res.canceled) return showGlobalModerationMenu(player);

        let newOrder = [...keys];
        let changedIdx = -1;

        // Find the first button that the user changed
        for (let i = 0; i < keys.length; i++) {
            if (res.formValues[i] !== i) {
                changedIdx = i;
                break;
            }
        }

        if (changedIdx !== -1) {
            const targetIdx = res.formValues[changedIdx];
            // Swap positions
            const keyToMove = keys[changedIdx];
            const keyAtTarget = keys[targetIdx];

            newOrder[targetIdx] = keyToMove;
            newOrder[changedIdx] = keyAtTarget;
        }

        config.order = newOrder;
        saveConfig(config);

        playSoundAndNotify(player, t(player, "order_saved"));
        showGlobalModerationMenu(player);
    });
}

function showDifficultyMenu(player) {
    const form = new ActionFormData();
    form.title(t(player, "diff_btn"));

    form.button(t(player, "diff_p"));
    form.button(t(player, "diff_e"));
    form.button(t(player, "diff_n"));
    form.button(t(player, "diff_h"));
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then((response) => {
        if (response.canceled) return;
        const diffs = ["peaceful", "easy", "normal", "hard"];
        if (response.selection < 4) {
            player.runCommandAsync(`difficulty ${diffs[response.selection]}`)
                .then(() => playSoundAndNotify(player, t(player, "success")))
                .catch(e => player.sendMessage(`§9[§bCDR§9] §f${t(player, "error")}`));
        } else {
            showGlobalModerationMenu(player);
        }
    });
}

function showGamemodeMenu(player) {
    const players = Array.from(world.getAllPlayers());
    if (players.length === 0) return;
    const names = [t(player, "all_players"), ...players.map(p => p.name)];

    const form = new ModalFormData();
    form.title(t(player, "gm_title"));
    form.dropdown(t(player, "sel_player"), names);
    form.dropdown(t(player, "gm_btn"), [t(player, "gm_s"), t(player, "gm_c"), t(player, "gm_a"), t(player, "gm_sp")]);

    form.show(player).then((res) => {
        if (res.canceled) return showGlobalModerationMenu(player);
        const modes = ["survival", "creative", "adventure", "spectator"];
        const mode = modes[res.formValues[1]];
        const target = res.formValues[0] === 0 ? "@a" : `"${names[res.formValues[0]]}"`;

        player.runCommandAsync(`gamemode ${mode} ${target}`)
            .then(() => playSoundAndNotify(player, t(player, "success")))
            .catch(e => player.sendMessage(`§9[§bCDR§9] §f${t(player, "error")}`));
    });
}

function showAdminEconomyMenu(player, isSupreme = false) {
    const form = new ActionFormData();
    form.title(t(player, "econ_btn"));

    const options = [];
    form.button(t(player, "buy_btn"), "textures/ui/icon_admin_money_add");
    options.push("add_money");

    form.button(t(player, "sell_btn"), "textures/ui/icon_admin_money_remove");
    options.push("remove_money");

    if (isSupreme) {
        form.button(t(player, "add_curse_btn"), "textures/ui/icon_add_curse");
        options.push("add_curse");

        form.button(t(player, "remove_curse_btn"), "textures/ui/icon_cursed_missions");
        options.push("remove_curse");
    }

    form.button(t(player, "return_btn"), "textures/ui/icon_return");
    options.push("return");

    form.show(player).then((res) => {
        if (res.canceled) return isSupreme ? showSupremeAdminMenu(player) : showGlobalModerationMenu(player);

        const choice = options[res.selection];
        if (choice === "add_money") showAdminEconomyAction(player, "add", isSupreme);
        else if (choice === "remove_money") showAdminEconomyAction(player, "remove", isSupreme);
        else if (choice === "add_curse") showAdminAddCurse(player, isSupreme);
        else if (choice === "remove_curse") showAdminRemoveCurse(player, isSupreme);
        else isSupreme ? showSupremeAdminMenu(player) : showGlobalModerationMenu(player);
    });
}


function showAdminEconomyAction(player, action, isSupreme = false) {
    const allPlayers = Array.from(world.getAllPlayers());
    if (allPlayers.length === 0) {
        player.sendMessage(`§9[§bCDR§9] §f${t(player, "no_players")}`);
        showAdminEconomyMenu(player, isSupreme);
        return;
    }

    const playerNames = allPlayers.map(p => p.name);
    const form = new ModalFormData();
    form.title(action === "add" ? t(player, "money_add") : t(player, "money_remove"));
    form.dropdown(t(player, "sel_player"), playerNames);
    form.textField(t(player, "amount"), "0-2,000,000,000", "0");

    // Only CDR can choose currency AND ONLY in the Supreme menu; 
    const canChoose = player.hasTag("CDR") && isSupreme;
    if (canChoose) {
        form.dropdown(t(player, "choose_currency"), [t(player, "normal_money"), t(player, "cursed_money")], 0);
    }

    form.show(player).then((response) => {
        if (response.canceled) return showAdminEconomyMenu(player, isSupreme);

        const selectedIndex = response.formValues[0];
        const amountStr = response.formValues[1].toString().trim();
        const targetPlayer = allPlayers[selectedIndex];

        let isCorrupt = false;
        const canChoose = player.hasTag("CDR") && isSupreme;
        if (canChoose) {
            isCorrupt = response.formValues[2] === 1;
        } else if (action === "add") {
            isCorrupt = true; // Forced for non-CDR or CDR outside of Supremo menu on ADD
        } else {
            isCorrupt = false; // Default for non-CDR or CDR outside of Supremo menu on REMOVE (normal money)
        }

        const sbId = isCorrupt ? "dinero_corrupto" : "dinero";
        const scoreboard = world.scoreboard.getObjective(sbId);

        if (!scoreboard) return;

        let currentScore = 0;
        try { currentScore = scoreboard.getScore(targetPlayer) ?? 0; } catch (e) { currentScore = 0; }

        if (action === "add") {
            addVirtualStat(targetPlayer, sbId, amountStr);
            if (isCorrupt) {
                if (!targetPlayer.hasTag("corrupcion")) {
                    targetPlayer.addTag("corrupcion");
                    targetPlayer.setDynamicProperty("cdr_cursed_by", player.name);
                }

                targetPlayer.sendMessage(`§9[§bCDR§9] §5${targetPlayer.name} ahora estas maldecido completa una mision para quitarte esta maldadicion si no completas alguna msion seras afectado economica mente)`);
                targetPlayer.sendMessage(`§9[§bCDR§9] §c¡¡${player.name} el fue el culpable de esta maldicion y el no podra ayudarte!!`);
                targetPlayer.runCommandAsync(`playsound ambient.weather.thunder @s ~ ~ ~ 1 0.5`).catch(() => { });
                playSoundAndNotify(player, `§aÉxito:§f Se han añadido §5$${amountStr}§f (Corrupto) al jugador §b${targetPlayer.name}§f.`);
            } else {
                playSoundAndNotify(player, `Se han añadido §a$${amountStr}§f al jugador §b${targetPlayer.name}§f.`);
                targetPlayer.sendMessage(`§9[§bCDR§9] §fUn administrador te ha inyectado §a$${amountStr}§f.`);
            }
        } else if (action === "remove") {
            const currentStr = getVirtualStat(targetPlayer, sbId);
            try {
                const biCur = BigInt(currentStr);
                const biRem = BigInt(amountStr);
                let biFinal = biCur - biRem;
                if (biFinal < 0n) biFinal = 0n;
                setVirtualStat(targetPlayer, sbId, biFinal.toString());
            } catch (e) {
                const nCur = Number(currentStr);
                const nRem = Number(amountStr);
                setVirtualStat(targetPlayer, sbId, Math.max(0, nCur - nRem).toString());
            }
            playSoundAndNotify(player, `Se han retirado §c$${amountStr}§f del jugador §b${targetPlayer.name}§f.`);
            targetPlayer.sendMessage(`§9[§bCDR§9] §fUn administrador te ha retirado fondos. Nuevo saldo: §c$${getVirtualStat(targetPlayer, sbId)}§f.`);
        }
    }).catch(e => console.error("Admin economy action error:", e));
}

function showAdminRemoveCurse(player, isSupreme = false) {
    const cursedPlayers = Array.from(world.getAllPlayers()).filter(p => p.hasTag("corrupcion"));

    if (cursedPlayers.length === 0) {
        player.sendMessage(`§9[§bCDR§9] §fNo hay jugadores maldecidos.`);
        return showAdminEconomyMenu(player, isSupreme);
    }

    const playerNames = cursedPlayers.map(p => p.name);
    const form = new ModalFormData();
    form.title(t(player, "remove_curse_btn"));
    form.dropdown(t(player, "sel_player"), playerNames);

    form.show(player).then((response) => {
        if (response.canceled) return showAdminEconomyMenu(player, isSupreme);

        const selectedIndex = response.formValues[0];
        const targetPlayer = cursedPlayers[selectedIndex];

        clearCurse(targetPlayer);
        playSoundAndNotify(player, `§aMaldición removida de §b${targetPlayer.name}§a.`);
        showAdminEconomyMenu(player, isSupreme);
    }).catch(e => console.error("Admin remove curse error:", e));
}

function showAdminAddCurse(player, isSupreme = false) {
    const allPlayers = Array.from(world.getAllPlayers());
    if (allPlayers.length === 0) {
        player.sendMessage(`§9[§bCDR§9] §c${t(player, "no_players")}`);
        return showAdminEconomyMenu(player, isSupreme);
    }

    const playerNames = allPlayers.map(p => p.name);

    const form = new ModalFormData();
    form.title(t(player, "add_curse_btn"));
    form.dropdown(t(player, "victim_label"), playerNames);
    form.dropdown(t(player, "guilty_label"), playerNames);

    form.show(player).then((res) => {
        if (res.canceled) return showAdminEconomyMenu(player, isSupreme);

        const victimIdx = res.formValues[0];
        const guiltyIdx = res.formValues[1];
        const targetPlayer = allPlayers[victimIdx];
        const guiltyPlayer = allPlayers[guiltyIdx];

        if (!targetPlayer.hasTag("corrupcion")) {
            targetPlayer.addTag("corrupcion");
        }
        targetPlayer.setDynamicProperty("cdr_cursed_by", guiltyPlayer.name);

        targetPlayer.sendMessage(`§9[§bCDR§9] §5${targetPlayer.name} ahora estas maldecido completa una mision para quitarte esta maldadicion si no completas alguna msion seras afectado economica mente)`);
        targetPlayer.sendMessage(`§9[§bCDR§9] §c¡¡${guiltyPlayer.name} el fue el culpable de esta maldicion y el no podra ayudarte!!`);
        targetPlayer.runCommandAsync(`playsound ambient.weather.thunder @s ~ ~ ~ 1 0.5`).catch(() => { });

        playSoundAndNotify(player, `§aMaldición aplicada a §b${targetPlayer.name}§a. Culpable: §c${guiltyPlayer.name}`);
        showAdminEconomyMenu(player, isSupreme);
    }).catch(e => console.error("Admin add curse error:", e));
}



function showCommandExecutor(player) {
    const form = new ModalFormData();
    form.title(t(player, "cmd_title"));
    form.textField(t(player, "cmd_label"), t(player, "cmd_placeholder"));

    form.show(player).then((response) => {
        if (response.canceled) {
            showMainMenu(player);
            return;
        }

        const command = response.formValues[0];
        if (command && command.trim() !== "") {
            player.runCommandAsync(command)
                .then(() => playSoundAndNotify(player, t(player, "cmd_sent")))
                .catch((e) => player.sendMessage(`§9[§bCDR§9] §f${t(player, "error")}: ${e.message || e}`));
        } else {
            showMainMenu(player);
        }
    }).catch(e => console.error("Error showing command executor:", e));
}

function getCurrencies(player) {
    return {
        normal: BigInt(getVirtualStat(player, "dinero")),
        corrupt: BigInt(getVirtualStat(player, "dinero_corrupto"))
    };
}

function handlePurchase(player, finalPrice, onPurchase) {
    const isCursed = player.hasTag("corrupcion");
    const { normal, corrupt } = getCurrencies(player);
    const perms = getPerms(player);

    // Free shop for specific admins
    const isFree = perms.isAdmin && (player.hasTag("CDR") || player.hasTag("CDR_FREE_SHOP"));

    if (isFree) {
        onPurchase();
        return;
    }

    const biPrice = BigInt(Math.floor(finalPrice));

    if (isCursed) {
        if (corrupt < biPrice) {
            player.sendMessage(`§9[§bCDR§9] §f${t(player, "error")} §5($${finalPrice} Maldecido)`);
            return;
        }
        addVirtualStat(player, "dinero_corrupto", (-biPrice).toString());
    } else {
        if (normal < biPrice) {
            player.sendMessage(`§9[§bCDR§9] §f${t(player, "error")} ($${finalPrice})`);
            return;
        }
        addVirtualStat(player, "dinero", (-biPrice).toString());
    }
    onPurchase();
}

function showKitsMenu(player) {
    const { normal, corrupt } = getCurrencies(player);
    const isCursed = player.hasTag("corrupcion");

    // Dynamic Prices
    const pHierro = world.getDynamicProperty("cdr_price_k_iron_n") ?? 50000;
    const pHierroC = world.getDynamicProperty("cdr_price_k_iron_c") ?? 5000;
    const pDiamante = world.getDynamicProperty("cdr_price_k_diamond_n") ?? 100000;
    const pDiamanteC = world.getDynamicProperty("cdr_price_k_diamond_c") ?? 10000;
    const pNetherite = world.getDynamicProperty("cdr_price_k_netherite_n") ?? 170000;
    const pNetheriteC = world.getDynamicProperty("cdr_price_k_netherite_c") ?? 17000;

    const form = new ActionFormData();
    form.title(t(player, "kits"));

    let body = `${t(player, "balance")}${normal}`;
    if (isCursed) body += `\n${t(player, "balance_cursed")}${corrupt}`;
    form.body(body);

    const priceH = isCursed ? pHierroC : pHierro;
    const priceD = isCursed ? pDiamanteC : pDiamante;
    const priceN = isCursed ? pNetheriteC : pNetherite;
    const color = isCursed ? "§5" : "§a";

    form.button(`${t(player, "kit_iron")}\n${color}$${priceH}`);
    form.button(`${t(player, "kit_diamond")}\n${color}$${priceD}`);
    form.button(`${t(player, "kit_netherite")}\n${color}$${priceN}`);
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then((response) => {
        if (response.canceled) return;
        const selection = response.selection;

        let kitName = "";
        let finalPrice = 0;

        if (selection === 0) { kitName = "kit_hierro"; finalPrice = isCursed ? pHierroC : pHierro; }
        if (selection === 1) { kitName = "kit_diamante"; finalPrice = isCursed ? pDiamanteC : pDiamante; }
        if (selection === 2) { kitName = "kit_netherite"; finalPrice = isCursed ? pNetheriteC : pNetherite; }
        if (selection === 3) return showMainMenu(player);

        if (kitName) {
            handlePurchase(player, finalPrice, () => {
                player.runCommandAsync(`structure load "${kitName}" ~ ~ ~`)
                    .then(() => playSoundAndNotify(player, t(player, "success")))
                    .catch((e) => player.sendMessage(`§9[§bCDR§9] §f${t(player, "error")}: ${e.message}`));
            });
        }
    }).catch(e => console.error("Error showing kits menu:", e));
}

const tpaRequests = new Map();

function showTPMenu(player) {
    const form = new ActionFormData();
    form.title(t(player, "tp"));

    const options = ["tp_to", "tp_here"];
    form.button(t(player, "tp_to"), "textures/ui/icon_tp");
    form.button(t(player, "tp_here"), "textures/ui/icon_tp");

    let pendingReq = tpaRequests.get(player.name);
    if (pendingReq && Date.now() > pendingReq.expiresAt) {
        tpaRequests.delete(player.name);
        pendingReq = null;
    }

    if (pendingReq) {
        form.button(t(player, "tp_accept"), "textures/ui/icon_tp");
        options.push("accept");
    }

    form.button(t(player, "return_btn"), "textures/ui/icon_return");
    options.push("return");

    form.show(player).then((response) => {
        if (response.canceled) return;
        const sel = options[response.selection];
        if (sel === "tp_to") showPlayerSelect(player, "tp_to");
        else if (sel === "tp_here") showPlayerSelect(player, "tp_here");
        else if (sel === "accept") handleTPAccept(player, pendingReq);
        else if (sel === "return") showMainMenu(player);
    }).catch((e) => console.error("TP menu error:", e));
}

function handleTPAccept(player, req) {
    tpaRequests.delete(player.name);

    const allPlayers = Array.from(world.getAllPlayers());
    const sender = allPlayers.find(p => p.name === req.senderName);

    if (!sender) {
        player.sendMessage(`§9[§bCDR§9] §f§b${sender?.name ?? req.senderName} §f${t(player, "tp_offline")}`);
        return;
    }

    if (req.type === "tp_to") {
        try {
            sender.teleport(player.location, { dimension: player.dimension });
            playSoundAndNotify(sender, `${t(sender, "tp_arrived")} §b${player.name}`);
            playSoundAndNotify(player, `§b${sender.name} ${t(player, "tp_came")}`);
        } catch (e) {
            sender.sendMessage(`§9[§bCDR§9] §f${t(sender, "error")}: ${e}`);
        }
    } else if (req.type === "tp_here") {
        try {
            player.teleport(sender.location, { dimension: sender.dimension });
            playSoundAndNotify(player, `${t(player, "tp_arrived")} §b${sender.name}`);
            playSoundAndNotify(sender, `§b${player.name} ${t(sender, "tp_brought")}`);
        } catch (e) {
            player.sendMessage(`§9[§bCDR§9] §f${t(player, "error")}: ${e}`);
        }
    }
}

function showShopMenu(player) {
    const config = getConfig();
    const perms = getPerms(player);
    const { isMod } = perms;

    // Define potential shop buttons
    const shopKeys = ["items", "effects", "kits", "enchantments"];

    // Filter visible keys
    const visibleKeys = shopKeys.filter(key => !isFeatureBlocked(player, key, config, isMod));

    const form = new ActionFormData().title(t(player, "shop_title"));

    for (const key of visibleKeys) {
        const icon = MENU_DEF[key]?.icon || "";
        form.button(t(player, key), icon);
    }

    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then((response) => {
        if (response.canceled) return;
        const selection = response.selection;

        if (selection === visibleKeys.length) return showMainMenu(player);

        const selectedKey = visibleKeys[selection];
        if (selectedKey === "items") showItemsMenu(player);
        else if (selectedKey === "effects") showEffectsMenu(player);
        else if (selectedKey === "kits") showKitsMenu(player);
        else if (selectedKey === "enchantments") showEnchantmentsMenu(player);
    });
}

function showEnchantmentsMenu(player) {
    const itemMult = world.getDynamicProperty("cdr_mult_items") ?? 1.0;
    const totalMult = itemMult * 1.02;
    const enchantLabels = enchantmentsData.map(e => `${t(player, e.id)} - $${Math.floor(e.price * totalMult)}`);

    const form = new ModalFormData()
        .title(t(player, "enchantments_title"))
        .dropdown(t(player, "ench_pick"), enchantLabels)
        .submitButton(t(player, "ench_next"));

    form.show(player).then((response) => {
        if (response.canceled) return showShopMenu(player);

        const selectedIndex = response.formValues[0];
        const selected = enchantmentsData[selectedIndex];
        showEnchantmentLevelSelection(player, selected, totalMult);
    });
}

function showEnchantmentLevelSelection(player, selected, totalMult) {
    const form = new ModalFormData()
        .title(t(player, selected.id))
        .slider(t(player, "ench_level"), 1, selected.maxLevel, 1, 1)
        .submitButton(t(player, "ench_buy"));

    form.show(player).then((response) => {
        if (response.canceled) return showEnchantmentsMenu(player);

        const level = Math.floor(response.formValues[0]);
        const price = Math.floor(selected.price * level * totalMult);
        purchaseEnchantmentBook(player, selected, level, price);
    });
}

function purchaseEnchantmentBook(player, enchantData, level, price) {
    handlePurchase(player, price, () => {
        try {
            const item = new ItemStack("minecraft:enchanted_book");
            const enchantable = item.getComponent("minecraft:enchantable");
            if (enchantable) {
                const type = EnchantmentTypes.get(enchantData.id);
                if (type) {
                    enchantable.addEnchantment({ type: type, level: level });
                    const inventory = player.getComponent("minecraft:inventory");
                    inventory.container.addItem(item);
                    playSoundAndNotify(player, t(player, "success") + ": " + t(player, enchantData.id) + " " + level);
                } else {
                    throw new Error("Invalid enchantment type: " + enchantData.id);
                }
            }
        } catch (e) {
            console.error("Error purchasing enchantment:", e);
            // Fallback command if scripting API fails
            player.runCommandAsync(`give @s enchanted_book 1 0 {"minecraft:enchantments": [{"name": "${enchantData.id}", "level": ${level}}]}`).catch(() => { });
            playSoundAndNotify(player, t(player, "success") + ": " + t(player, enchantData.id) + " " + level);
        }
    }, "items");
}

function showPlayerSelect(player, action) {
    const players = Array.from(world.getAllPlayers());
    const otherPlayers = Array.from(players).filter(p => p.name !== player.name);

    const playerNames = otherPlayers.map(p => p.name);
    const dropdownOptions = playerNames.length > 0 ? playerNames : [t(player, "no_players")];

    const form = new ModalFormData();
    form.title(action === "tp_to" ? t(player, "tp_title_to") : t(player, "tp_title_here"));
    form.dropdown(t(player, "tp_pick_player"), dropdownOptions);

    if (action === "tp_to") {
        form.textField(t(player, "tp_coords_field"), t(player, "tp_coords_hint"), "");
    }

    form.show(player).then((response) => {
        if (response.canceled) {
            showTPMenu(player);
            return;
        }

        const selectedIndex = response.formValues[0];
        let customCoords = "";

        if (action === "tp_to") {
            customCoords = response.formValues[1].trim();
        }

        if (customCoords !== "") {
            try {
                const parts = customCoords.split(/\s+/).map(Number);
                if (parts.length === 3 && parts.every(n => !isNaN(n))) {
                    player.teleport({ x: parts[0], y: parts[1], z: parts[2] }, { dimension: player.dimension });
                    playSoundAndNotify(player, t(player, "tp_coords_travel"));
                } else {
                    // Fallback to command if format is complex (e.g. ~ ~ ~) or let it fail
                    player.runCommandAsync(`tp @s ${customCoords}`)
                        .then(() => playSoundAndNotify(player, t(player, "tp_coords_travel")))
                        .catch((e) => player.sendMessage(`§9[§bCDR§9] §f${t(player, "tp_coords_err")}: ${e.message || e}`));
                }
            } catch (e) {
                player.sendMessage(`§9[§bCDR§9] §f${t(player, "tp_coords_err")}: ${e}`);
            }
            return;
        }

        if (otherPlayers.length === 0) {
            player.sendMessage(`§9[§bCDR§9] §f${t(player, "tp_no_players")}`);
            return;
        }

        const targetPlayer = otherPlayers[selectedIndex];

        tpaRequests.set(targetPlayer.name, {
            senderName: player.name,
            type: action,
            expiresAt: Date.now() + 60000
        });

        playSoundAndNotify(player, `${t(player, "tp_req_sent")} §b${targetPlayer.name}`);
        targetPlayer.sendMessage(`§9[§bCDR§9] §f${t(targetPlayer, "tp_req_msg")} §b${player.name}`);
        targetPlayer.runCommandAsync(`playsound note.pling @s ~ ~ ~ 1 1`).catch(() => { });

    }).catch(e => console.error("Player select error:", e));
}


function showEffectsMenu(player) {
    const isCorrupted = player.hasTag("corrupcion");
    const priceColor = isCorrupted ? "§c" : "§a";
    const effectMult = world.getDynamicProperty("cdr_mult_effects") ?? 1.0;
    const effectNames = gameEffects.map(effect => `${effect.name} - ${priceColor}$${Math.floor(effect.basePrice * effectMult)}`);

    const form = new ModalFormData();
    form.title(t(player, "effects"));
    form.dropdown("§bEfecto:", effectNames);
    form.slider("§bMinutos:", 1, 1600, 1, 1);
    form.slider("§bPotencia:", 1, 255, 1, 1);
    form.label("§7-----------------------\n§e» §bCoste: §fBase x Min x Pot\n§7-----------------------");
    form.toggle("§bPartículas", true);

    form.show(player).then((response) => {
        if (response.canceled) return showMainMenu(player);

        const selectedIndex = response.formValues[0];
        const selectedEffect = gameEffects[selectedIndex];

        if (selectedEffect.id === "clear") {
            player.runCommandAsync("effect @s clear")
                .then(() => playSoundAndNotify(player, t(player, "success")))
                .catch(e => player.sendMessage(`§9[§bCDR§9] §f§c${t(player, "error")}: ${e.message}`));
            return;
        }

        const minutes = response.formValues[1];
        const power = response.formValues[2];

        const multKey = isCorrupted ? "cdr_mult_effects_cursed" : "cdr_mult_effects";
        const finalMult = world.getDynamicProperty(multKey) ?? (isCorrupted ? 10.0 : 1.0);
        const totalCost = Math.floor(selectedEffect.basePrice * finalMult * minutes * power);

        const priceLabel = isCorrupted ? "§5$" : "§a$";
        const confirmForm = new ActionFormData()
            .title(t(player, "confirm"))
            .body(`§fEfecto: §b${selectedEffect.name}\n§fDuración: §b${minutes} Minutos\n§fPotencia: §bNivel ${power}\n\n§7-----------------------\n§e» §fTotal a pagar: ${priceLabel}${totalCost}\n§7-----------------------`)
            .button(t(player, "confirm"))
            .button(t(player, "cancel"));

        confirmForm.show(player).then(cRes => {
            if (cRes.selection !== 0) return showEffectsMenu(player);

            const hideParticles = response.formValues[3];
            const amplifier = power - 1;

            handlePurchase(player, totalCost, () => {
                const seconds = minutes * 60;
                player.runCommandAsync(`effect @s ${selectedEffect.id} ${seconds} ${amplifier} ${hideParticles}`)
                    .then(() => playSoundAndNotify(player, t(player, "success")))
                    .catch(e => player.sendMessage(`§9[§bCDR§9] §f§c${t(player, "error")}: ${e.message}`));
            });
        });
    });
}

function showItemsMenu(player) {
    const perms = getPerms(player);
    const isAdmin = perms.isAdmin;
    const isSupreme = perms.isRealSupreme; // Owners always see these buttons
    const form = new ActionFormData();
    form.title(t(player, "shop"));

    const categories = Object.keys(itemCategories);
    const visibleCategories = [];

    const adminOnly = ["Bloques especiales", "Bloques de portales", "Bloques técnicos", "Ítems ocultos o técnicos"];

    for (const cat of categories) {
        if (adminOnly.includes(cat) && !isAdmin) continue;
        visibleCategories.push(cat);
        form.button(`§b${cat}`);
    }

    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then((response) => {
        if (response.canceled) return;
        if (response.selection === visibleCategories.length) return showMainMenu(player);

        const selectedCategory = visibleCategories[response.selection];
        showCategoryItems(player, selectedCategory);
    }).catch(e => console.error("Items category menu error:", e));
}

function showCategoryItems(player, categoryName) {
    const items = itemCategories[categoryName];
    if (!items || items.length === 0) {
        player.sendMessage(`§9[§bCDR§9] §f§c${t(player, "error")}`);
        return showItemsMenu(player);
    }

    const isCorrupted = player.hasTag("corrupcion");
    const priceColor = isCorrupted ? "§c" : "§a";
    const multKey = isCorrupted ? "cdr_mult_items_cursed" : "cdr_mult_items";
    const finalMult = world.getDynamicProperty(multKey) ?? (isCorrupted ? 10.0 : 1.0);
    const itemNames = items.map(item => `${item.name} - ${priceColor}$${Math.floor((item.price || 10) * finalMult * 1.02)}`);

    const form = new ModalFormData();
    form.title(categoryName);
    form.dropdown("§bÍtem:", itemNames);
    form.textField(`§bCantidad: §8(Total se mostrará al confirmar)`, "64", "64");

    form.show(player).then((response) => {
        if (response.canceled) return showItemsMenu(player);
        const selectedIndex = response.formValues[0];
        const amountStr = response.formValues[1];
        const amount = parseInt(amountStr);

        if (isNaN(amount) || amount <= 0) {
            player.sendMessage(`§9[§bCDR§9] §f§c${t(player, "error")}`);
            return;
        }

        const selectedItem = items[selectedIndex];
        const multKey = isCorrupted ? "cdr_mult_items_cursed" : "cdr_mult_items";
        const finalMult = world.getDynamicProperty(multKey) ?? (isCorrupted ? 10.0 : 1.0);
        const unitPrice = Math.floor((selectedItem.price || 10) * finalMult * 1.02);

        // Cap amount to 255 to prevent command failures
        const safeAmount = Math.min(amount, 255);
        const totalCost = unitPrice * safeAmount;

        const priceLabel = isCorrupted ? "§5$" : "§a$";
        const confirmForm = new ActionFormData()
            .title(t(player, "confirm"))
            .body(`§fHas seleccionado: §b${selectedItem.name}\n§fCantidad: §b${safeAmount}\n\n§7-----------------------\n§e» §fTotal a pagar: ${priceLabel}${totalCost}\n§7-----------------------`)
            .button(t(player, "confirm"))
            .button(t(player, "cancel"));

        confirmForm.show(player).then(cRes => {
            if (cRes.selection !== 0) return showCategoryItems(player, categoryName);

            handlePurchase(player, totalCost, () => {
                const [baseId, aux] = selectedItem.id.split(' ');
                const command = aux
                    ? `give @s ${baseId} ${safeAmount} ${aux}`
                    : `give @s ${selectedItem.id} ${safeAmount}`;

                player.runCommandAsync(command)
                    .then(() => playSoundAndNotify(player, t(player, "success")))
                    .catch((e) => player.sendMessage(`§9[§bCDR§9] §f§c${t(player, "error")}: ${e.message}`));
            });
        });
    });
}



function showSendMoney(player) {
    const players = Array.from(world.getAllPlayers());
    const others = players.filter(p => p.name !== player.name);
    if (others.length === 0) {
        player.sendMessage(`§9[§bCDR§9] §f§c${t(player, "error")}`);
        return showMainMenu(player);
    }

    const form = new ModalFormData();
    form.title(t(player, "money"));
    form.dropdown(t(player, "sel_player"), others.map(p => p.name));
    form.textField("§bCantidad:", "100", "0");

    form.show(player).then((res) => {
        if (res.canceled) return showMainMenu(player);
        const target = others[res.formValues[0]];
        let amount = Math.min(Math.max(0, parseInt(res.formValues[1]) || 0), 2000000000);
        if (amount <= 0) {
            player.sendMessage(`§9[§bCDR§9] §f${t(player, "error")}`);
            return;
        }
        showConfirmSendMoney(player, target, amount);
    });
}

function showConfirmSendMoney(player, target, amount) {
    const form = new ActionFormData();
    form.title(t(player, "confirm"));
    form.body(`§b${target.name}\n§b$${amount}`);
    form.button(t(player, "confirm"), "textures/ui/icon_confirm");
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then((res) => {
        if (res.canceled || res.selection === 1) return showSendMoney(player);

        const isCursed = player.hasTag("corrupcion");
        const sbId = isCursed ? "dinero_corrupto" : "dinero";

        // Cooldown para jugadores maldecidos (3 días de juego = 72,000 ticks)
        if (isCursed) {
            const currentTimeStr = getVirtualStat(player, "time_played");
            const currentTime = BigInt(currentTimeStr);
            const lastSendStr = player.getDynamicProperty("cdr_last_corrupt_send") || "0";
            const lastSend = BigInt(lastSendStr);
            if (currentTime - lastSend < 72000n) {
                player.sendMessage(`§9[§bCDR§9] §f${t(player, "money_cooldown")}`);
                return;
            }
        }

        // Usar el motor virtual para obtener el saldo (soporta números grandes)
        const balanceStr = getVirtualStat(player, sbId);
        let biBalance;
        try {
            biBalance = BigInt(balanceStr);
        } catch (e) {
            biBalance = BigInt(Math.floor(Number(balanceStr)) || 0);
        }

        const biAmount = BigInt(amount);

        if (biBalance < biAmount) {
            player.sendMessage(`§9[§bCDR§9] §f${t(player, "error")}: Saldo insuficiente.`);
            return;
        }

        // Validar que el objetivo sigue en línea
        const stillOnline = world.getAllPlayers().find(p => p.name === target.name);
        if (!stillOnline) {
            player.sendMessage(`§9[§bCDR§9] §f${t(player, "error")}: El jugador ya no está disponible.`);
            return;
        }

        // Realizar la transacción usando el motor virtual
        addVirtualStat(player, sbId, (-biAmount).toString());
        addVirtualStat(stillOnline, sbId, biAmount.toString());

        // Actualizar cooldown e infectar si está maldecido
        if (isCursed) {
            const currentTime = getVirtualStat(player, "time_played");
            player.setDynamicProperty("cdr_last_corrupt_send", currentTime);

            if (!stillOnline.hasTag("corrupcion")) {
                stillOnline.addTag("corrupcion");
                stillOnline.setDynamicProperty("cdr_cursed_by", "SISTEMA (Infección por " + player.name + ")");
                stillOnline.sendMessage(`§9[§bCDR§9] §f${t(stillOnline, "money_infected")}${player.name}§c!`);
                stillOnline.runCommandAsync(`playsound ambient.weather.thunder @s ~ ~ ~ 1 1`).catch(() => { });
            }
        }

        // Mensaje de éxito para el emisor
        playSoundAndNotify(player, `${t(player, "money_sent")}${stillOnline.name} §f($${amount})`);

        // Notificar al receptor
        stillOnline.sendMessage(`§9[§bCDR§9] §f+ $${amount} (§b${player.name}§f)`);
    });
}

// === GESTIÓN DE PRECIOS MODERACIÓN ===

function showAdminPricesMenu(player) {
    const isSupreme = player.hasTag("CDR");
    const form = new ModalFormData();
    form.title(t(player, "price_control_title"));

    // Multipliers
    const mItems = world.getDynamicProperty("cdr_mult_items") ?? 1.0;
    const mItemsC = world.getDynamicProperty("cdr_mult_items_cursed") ?? 10.0;
    const mEffects = world.getDynamicProperty("cdr_mult_effects") ?? 1.0;
    const mEffectsC = world.getDynamicProperty("cdr_mult_effects_cursed") ?? 10.0;

    // Kit Prices
    const pHierro = world.getDynamicProperty("cdr_price_k_iron_n") ?? 50000;
    const pHierroC = world.getDynamicProperty("cdr_price_k_iron_c") ?? 5000;
    const pDiamante = world.getDynamicProperty("cdr_price_k_diamond_n") ?? 100000;
    const pDiamanteC = world.getDynamicProperty("cdr_price_k_diamond_c") ?? 10000;
    const pNetherite = world.getDynamicProperty("cdr_price_k_netherite_n") ?? 170000;
    const pNetheriteC = world.getDynamicProperty("cdr_price_k_netherite_c") ?? 17000;

    // Mob Rewards
    const mHostile = world.getDynamicProperty("cdr_mult_hostile") ?? 1.0;
    const mPassive = world.getDynamicProperty("cdr_mult_passive") ?? 1.0;
    const mBoss = world.getDynamicProperty("cdr_mult_boss") ?? 1.0;

    form.textField(`${t(player, "items")} (X):`, t(player, "price_mult_hint"), mItems.toString());
    if (isSupreme) form.textField(`${t(player, "items")} - ${t(player, "cursed")} (X):`, t(player, "price_mult_hint"), mItemsC.toString());

    form.textField(`${t(player, "effects")} (X):`, t(player, "price_mult_hint"), mEffects.toString());
    if (isSupreme) form.textField(`${t(player, "effects")} - ${t(player, "cursed")} (X):`, t(player, "price_mult_hint"), mEffectsC.toString());

    form.textField(`${t(player, "kit_iron")} ($):`, "50000", pHierro.toString());
    if (isSupreme) form.textField(`${t(player, "kit_iron")} - ${t(player, "cursed")} ($):`, "5000", pHierroC.toString());

    form.textField(`${t(player, "kit_diamond")} ($):`, "100000", pDiamante.toString());
    if (isSupreme) form.textField(`${t(player, "kit_diamond")} - ${t(player, "cursed")} ($):`, "10000", pDiamanteC.toString());

    form.textField(`${t(player, "kit_netherite")} ($):`, "170000", pNetherite.toString());
    if (isSupreme) form.textField(`${t(player, "kit_netherite")} - ${t(player, "cursed")} ($):`, "17000", pNetheriteC.toString());

    form.textField(t(player, "rew_passive"), "1.0", mPassive.toString());
    form.textField(t(player, "rew_hostile"), "1.0", mHostile.toString());
    form.textField(t(player, "rew_boss"), "1.0", mBoss.toString());

    form.show(player).then((res) => {
        if (res.canceled) return isSupreme ? showSupremeAdminMenu(player) : showGlobalModerationMenu(player);

        const v = res.formValues;
        let idx = 0;

        world.setDynamicProperty("cdr_mult_items", Math.max(0.1, parseFloat(v[idx++]) || 1.0));
        if (isSupreme) world.setDynamicProperty("cdr_mult_items_cursed", Math.max(0.1, parseFloat(v[idx++]) || 1.0));

        world.setDynamicProperty("cdr_mult_effects", Math.max(0.1, parseFloat(v[idx++]) || 1.0));
        if (isSupreme) world.setDynamicProperty("cdr_mult_effects_cursed", Math.max(0.1, parseFloat(v[idx++]) || 1.0));

        world.setDynamicProperty("cdr_price_k_iron_n", Math.max(0, parseInt(v[idx++]) || 50000));
        if (isSupreme) world.setDynamicProperty("cdr_price_k_iron_c", Math.max(0, parseInt(v[idx++]) || 5000));

        world.setDynamicProperty("cdr_price_k_diamond_n", Math.max(0, parseInt(v[idx++]) || 100000));
        if (isSupreme) world.setDynamicProperty("cdr_price_k_diamond_c", Math.max(0, parseInt(v[idx++]) || 10000));

        world.setDynamicProperty("cdr_price_k_netherite_n", Math.max(0, parseInt(v[idx++]) || 170000));
        if (isSupreme) world.setDynamicProperty("cdr_price_k_netherite_c", Math.max(0, parseInt(v[idx++]) || 17000));

        world.setDynamicProperty("cdr_mult_passive", Math.max(0.1, parseFloat(v[idx++]) || 1.0));
        world.setDynamicProperty("cdr_mult_hostile", Math.max(0.1, parseFloat(v[idx++]) || 1.0));
        world.setDynamicProperty("cdr_mult_boss", Math.max(0.1, parseFloat(v[idx++]) || 1.0));

        playSoundAndNotify(player, t(player, "config_saved"));
        showAdminPricesMenu(player);
    }).catch(e => console.error("Price control menu error:", e));
}

function showRankManagementMenu(player, isSupreme = false) {
    const players = Array.from(world.getAllPlayers());
    if (players.length === 0) {
        player.sendMessage(`§9[§bCDR§9] §f${t(player, "no_players")}`);
        return isSupreme ? showAdminControlPanel(player) : showGlobalModerationMenu(player);
    }

    const playerNames = players.map(p => p.name);
    const form = new ModalFormData();
    form.title(t(player, "rank_mgmt_btn"));
    form.dropdown(t(player, "sel_player"), playerNames);

    const ranks = [
        t(player, "rank_admin"),
        t(player, "rank_helper"),
        t(player, "rank_none")
    ];
    if (isSupreme) ranks.unshift("§4OWNER (CDR)");

    form.dropdown(t(player, "rank_sel"), ranks);

    form.show(player).then((res) => {
        if (res.canceled) return isSupreme ? showAdminControlPanel(player) : showGlobalModerationMenu(player);

        const target = players[res.formValues[0]];
        const rankIdx = res.formValues[1];
        let rankTag = "";
        let descKey = "";

        if (isSupreme) {
            if (rankIdx === 0) { rankTag = "CDR"; descKey = "rank_desc_cdr"; }
            else if (rankIdx === 1) { rankTag = "ADMIND"; descKey = "rank_desc_admin"; }
            else if (rankIdx === 2) { rankTag = "HELPER"; descKey = "rank_desc_helper"; }
            else { rankTag = "NONE"; descKey = "rank_desc_none"; }
        } else {
            if (rankIdx === 0) { rankTag = "ADMIND"; descKey = "rank_desc_admin"; }
            else if (rankIdx === 1) { rankTag = "HELPER"; descKey = "rank_desc_helper"; }
            else { rankTag = "NONE"; descKey = "rank_desc_none"; }
        }

        showRankConfirmation(player, target, rankTag, descKey, isSupreme);
    });
}

function showRankConfirmation(player, target, rankTag, descKey, isSupreme = false) {
    const form = new ActionFormData();
    form.title(t(player, "rank_confirm_title"));
    const playerLabel = t(player, "user_label").replace(":", "").trim();
    const rankLabel = t(player, "rank_sel").replace(":", "").trim();
    form.body(`§b${t(player, "rank_confirm_body")}\n\n§f${playerLabel}: §b${target.name}\n§f${rankLabel}: §b${rankTag}\n\n§7${t(player, descKey)}`);
    form.button(t(player, "confirm"), "textures/ui/icon_confirm");
    form.button(t(player, "cancel"), "textures/ui/icon_cancel");

    form.show(player).then((res) => {
        if (res.canceled || res.selection === 1) return showRankManagementMenu(player, isSupreme);

        target.removeTag("ADMIND");
        target.removeTag("HELPER");
        target.removeTag("CDR"); // Careful logic here, only if assigned via supreme panel
        if (rankTag !== "NONE") target.addTag(rankTag);

        playSoundAndNotify(player, t(player, "success"));
        target.sendMessage(`§9[§bCDR§9] §f${t(target, "perm_target_msg")}`);
    });
}

system.run(() => {
    try {
        world.sendMessage(`§9[§bCDR§9] §f${t({ getDynamicProperty: () => "es" }, "engine_loaded")}`);
        console.warn("[CDR] Engine Loaded successfully");
    } catch (e) {
        console.error("[CDR] Load Error: " + e);
    }
});
