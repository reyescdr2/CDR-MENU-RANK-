import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { isSafeZoneBlocked } from "./corruption.js";
import { t, playSoundAndNotify } from "./utils.js";

function showMainMenu(player) {
    system.run(() => {
        world.getDimension("overworld").runCommandAsync(`scriptevent cdr:show_main_menu "${player.name}"`).catch(() => { });
    });
}

const WP_PREFIX = "WP|";
const LIMIT_PREFIX = "CDR_WP_LIMIT:";

function getWaypoints(player) {
    const tags = player.getTags();
    const wpTags = tags.filter(tag => tag.startsWith(WP_PREFIX));

    return wpTags.map(tag => {
        const parts = tag.split("|");
        return {
            rawTag: tag,
            name: parts[1],
            x: parseFloat(parts[2]),
            y: parseFloat(parts[3]),
            z: parseFloat(parts[4]),
            dimension: parts[5]
        };
    });
}

function saveWaypoint(player, name) {
    const safeName = name.replace(/\|/g, "-");
    const x = Math.floor(player.location.x);
    const y = Math.floor(player.location.y);
    const z = Math.floor(player.location.z);
    const dimension = player.dimension.id;

    const tag = `${WP_PREFIX}${safeName}|${x}|${y}|${z}|${dimension}`;
    player.addTag(tag);
}

function deleteWaypoint(player, rawTag) {
    player.removeTag(rawTag);
}

// LÍMITES POR DIMENSIÓN
function getGlobalWPLimits() {
    let owLimit = world.getDynamicProperty("cdr_wp_limit_ow");
    let netLimit = world.getDynamicProperty("cdr_wp_limit_net");
    let endLimit = world.getDynamicProperty("cdr_wp_limit_end");

    return {
        overworld: typeof owLimit === "number" ? owLimit : 3,
        nether: typeof netLimit === "number" ? netLimit : 1,
        the_end: typeof endLimit === "number" ? endLimit : 1
    };
}

function setGlobalWPLimits(ow, net, end) {
    world.setDynamicProperty("cdr_wp_limit_ow", ow);
    world.setDynamicProperty("cdr_wp_limit_net", net);
    world.setDynamicProperty("cdr_wp_limit_end", end);
}

function getPlayerWPLimits(player) {
    const tags = player.getTags();
    const limits = getGlobalWPLimits();

    for (const tag of tags) {
        if (tag.startsWith(LIMIT_PREFIX)) {
            // format: CDR_WP_LIMIT:ow:net:end   (e.g., CDR_WP_LIMIT:5:2:1)
            const parts = tag.replace(LIMIT_PREFIX, "").split(":");
            if (parts.length === 3) {
                const ow = parseInt(parts[0]);
                const net = parseInt(parts[1]);
                const end = parseInt(parts[2]);
                if (!isNaN(ow) && !isNaN(net) && !isNaN(end)) {
                    limits.overworld = ow;
                    limits.nether = net;
                    limits.the_end = end;
                    // Note: If player has this tag, it overrides completely
                    limits.isCustom = true;
                    return limits;
                }
            }
        }
    }
    limits.isCustom = false;
    return limits;
}

function setPlayerWPLimits(player, ow, net, end) {
    // Remove old limit tags
    const tags = player.getTags();
    for (const tag of tags) {
        if (tag.startsWith(LIMIT_PREFIX)) {
            player.removeTag(tag);
        }
    }
    if (ow !== null && net !== null && end !== null) {
        player.addTag(`${LIMIT_PREFIX}${ow}:${net}:${end}`);
    }
}

export function showWaypointsMenu(player) {
    const waypoints = getWaypoints(player);
    const isMod = player.hasTag("CDR") || player.hasTag("ADMIND");
    if (!isMod && isSafeZoneBlocked(player)) {
        player.sendMessage(`§9[§bCDR§9] §f${t(player, "safe_zone_blocked")}`);
        return;
    }
    const limits = getPlayerWPLimits(player);

    const usage = { overworld: 0, nether: 0, the_end: 0 };
    for (const wp of waypoints) {
        if (wp.dimension === "minecraft:overworld") usage.overworld++;
        if (wp.dimension === "minecraft:nether") usage.nether++;
        if (wp.dimension === "minecraft:the_end") usage.the_end++;
    }

    const currentDim = player.dimension.id.replace("minecraft:", "");
    const isInf = player.hasTag("CDR") || player.hasTag("CDR_INF_WAYPOINTS");
    let currentLimit = isInf ? Infinity : (limits[currentDim] ?? 0);
    let currentUsage = usage[currentDim];

    const form = new ActionFormData();
    form.title(t(player, "waypoint"));

    const owL = t(player, "ow_short");
    const netL = t(player, "net_short");
    const endL = t(player, "end_short");

    if (isInf) {
        form.body(`§b${owL}: §f${usage.overworld}/∞ §c${netL}: §f${usage.nether}/∞ §e${endL}: §f${usage.the_end}/∞`);
    } else {
        form.body(`§b${owL}: §f${usage.overworld}/${limits.overworld} §c${netL}: §f${usage.nether}/${limits.nether} §e${endL}: §f${usage.the_end}/${limits.the_end}`);
    }

    for (const wp of waypoints) {
        form.button(`§b${wp.name}`, "textures/ui/icon_waypoint");
    }

    form.button("§a+ " + t(player, "waypoint"), "textures/ui/icon_waypoint_create");
    if (isMod) form.button(t(player, "admin"), "textures/ui/icon_moderation");
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then((response) => {
        if (response.canceled) return;
        const sel = response.selection;

        if (sel === waypoints.length) {
            if (!isMod && currentUsage >= currentLimit) {
                player.sendMessage(`§9[§bCDR§9] §f${t(player, "limit_reached")} (${currentLimit})`);
                return;
            }
            showCreateWaypoint(player);
            return;
        }

        const statsOffset = isMod ? 1 : 0;
        if (isMod && sel === waypoints.length + 1) return showWaypointsModMenu(player);
        if (sel === waypoints.length + 1 + statsOffset) return showMainMenu(player);

        showWaypointOptions(player, waypoints[sel]);
    }).catch(e => console.error("Waypoints menu error:", e));
}

function showCreateWaypoint(player) {
    const form = new ModalFormData();
    form.title(t(player, "waypoint"));

    const dimId = player.dimension.id.replace("minecraft:", "");
    let dimKey = "ow_short";
    if (dimId === "nether") dimKey = "net_short";
    else if (dimId === "the_end") dimKey = "end_short";
    const dimName = t(player, dimKey);

    form.textField(t(player, "wp_create_desc"), `(${dimName})`);

    form.show(player).then((response) => {
        if (response.canceled) return showWaypointsMenu(player);

        const wpName = response.formValues[0].trim();
        if (wpName === "") {
            player.sendMessage(`§9[§bCDR§9] §f${t(player, "error")}`);
            return showWaypointsMenu(player);
        }

        saveWaypoint(player, wpName);
        playSoundAndNotify(player, t(player, "wp_saved_msg"));
    }).catch(e => console.error("Create Waypoint Error:", e));
}

function showWaypointOptions(player, wp) {
    const form = new ActionFormData();
    form.title(wp.name);

    form.button(t(player, "wp_go"), "textures/ui/icon_tp");
    form.button(t(player, "cancel"), "textures/ui/icon_waypoint_delete");
    form.button(t(player, "return_btn"), "textures/ui/icon_return");

    form.show(player).then((response) => {
        if (response.canceled) return;

        if (response.selection === 0) {
            if (isSafeZoneBlocked(player)) {
                player.sendMessage(`§9[§bCDR§9] §f${t(player, "safe_zone_blocked")}`);
                return;
            }

            // Cinematic Start: Darkness and Thunder
            player.addEffect("blindness", 140, { showParticles: false }); // 7 seconds
            player.runCommandAsync(`camerashake add @s 0.2 7 spectral`).catch(() => { });
            player.runCommandAsync(`playsound ambient.weather.thunder @s ~ ~ ~ 1 0.8`).catch(() => { });

            // Transition delay
            system.runTimeout(() => {
                try {
                    const targetDim = world.getDimension(wp.dimension);
                    player.teleport({ x: wp.x, y: wp.y, z: wp.z }, { dimension: targetDim });

                    // Immobilize during the ritual using inputpermissions (no FOV zoom)
                    player.runCommandAsync(`inputpermission set @s movement disabled`).catch(() => { });
                    player.runCommandAsync(`inputpermission set @s jump disabled`).catch(() => { });

                    // Start the pentagram ritual animation
                    startPentagramRitual(player, { x: wp.x, y: wp.y, z: wp.z }, targetDim);

                } catch (e) {
                    player.sendMessage(`§9[§bCDR§9] §f${t(player, "error")}: ${e}`);
                }
            }, 20); // 1 second into blindness the teleport happens
        } else if (response.selection === 1) {
            deleteWaypoint(player, wp.rawTag);
            playSoundAndNotify(player, t(player, "success"));
        } else {
            showWaypointsMenu(player);
        }
    }).catch(e => console.error("Waypoint Options Error:", e));
}

// ----------------------------------------
// MODERACIÓN DE WAYPOINTS
// ----------------------------------------

function showWaypointsModMenu(admin) {
    const form = new ActionFormData();
    form.title(t(admin, "admin"));

    form.button(t(admin, "vis_btn"), "textures/ui/icon_wp_limits");
    form.button(t(admin, "sel_player"), "textures/ui/icon_manage_players");
    form.button(t(admin, "return_btn"), "textures/ui/icon_return");

    form.show(admin).then((response) => {
        if (response.canceled) return;
        if (response.selection === 0) showGlobalLimitMenu(admin);
        else if (response.selection === 1) showModPlayerList(admin);
        else showWaypointsMenu(admin);
    }).catch(e => console.error("Mod Menu error:", e));
}

function showGlobalLimitMenu(player) {
    const limits = getGlobalWPLimits();
    const form = new ModalFormData();
    form.title(t(player, "waypoint"));

    form.textField("OW:", "3", String(limits.overworld));
    form.textField("NET:", "1", String(limits.nether));
    form.textField("END:", "1", String(limits.the_end));

    form.show(player).then((res) => {
        if (res.canceled) return showWaypointsModMenu(player);
        const ow = parseInt(res.formValues[0]);
        const net = parseInt(res.formValues[1]);
        const end = parseInt(res.formValues[2]);

        if (isNaN(ow) || isNaN(net) || isNaN(end)) {
            player.sendMessage(`§9[§bCDR§9] §f${t(player, "error")}`);
            return;
        }

        setGlobalWPLimits(ow, net, end);
        playSoundAndNotify(player, t(player, "success"));
    });
}

function showModPlayerList(admin) {
    const players = Array.from(world.getAllPlayers());
    if (players.length === 0) {
        admin.sendMessage(`§9[§bCDR§9] §f${t(admin, "error")}`);
        return showWaypointsModMenu(admin);
    }
    const names = players.map(p => p.name);

    const form = new ModalFormData();
    form.title(t(admin, "sel_player"));
    form.dropdown(t(admin, "sel_player"), names);

    form.show(admin).then((res) => {
        if (res.canceled) return showWaypointsModMenu(admin);
        const target = players[res.formValues[0]];
        if (target) showPlayerModOptions(admin, target);
    });
}

function showPlayerModOptions(admin, target) {
    const form = new ActionFormData();
    const limits = getPlayerWPLimits(target);

    form.title(target.name);
    form.body(`§bOW: §f${limits.overworld} §cNET: §f${limits.nether} §eEND: §f${limits.the_end}`);

    form.button(t(admin, "vis_btn"), "textures/ui/icon_manage_players");
    form.button(t(admin, "waypoint"), "textures/ui/icon_waypoint");
    form.button(t(admin, "return_btn"), "textures/ui/icon_return");

    form.show(admin).then((res) => {
        if (res.canceled) return;
        if (res.selection === 0) showPlayerLimitEdit(admin, target, limits);
        else if (res.selection === 1) showPlayerAdminWaypoints(admin, target);
        else showModPlayerList(admin);
    });
}

function showPlayerLimitEdit(admin, target, cur) {
    const form = new ModalFormData();
    form.title(target.name);
    form.toggle(t(admin, "cancel"), !cur.isCustom);
    form.textField("OW:", "10", String(cur.overworld));
    form.textField("NET:", "5", String(cur.nether));
    form.textField("END:", "2", String(cur.the_end));

    form.show(admin).then((res) => {
        if (res.canceled) return showPlayerModOptions(admin, target);
        if (res.formValues[0]) {
            setPlayerWPLimits(target, null, null, null);
            return playSoundAndNotify(admin, t(admin, "success"));
        }
        const v = res.formValues.slice(1).map(x => parseInt(x));
        if (v.some(x => isNaN(x) || x < 0)) return admin.sendMessage(`§9[§bCDR§9] §f${t(admin, "error")}`);
        setPlayerWPLimits(target, v[0], v[1], v[2]);
        playSoundAndNotify(admin, t(admin, "success"));
    });
}

function showPlayerAdminWaypoints(admin, target) {
    const wps = getWaypoints(target);
    const form = new ActionFormData();
    form.title(target.name);
    wps.forEach(wp => form.button(`§b${wp.name}`, "textures/ui/icon_waypoint"));
    form.button(t(admin, "return_btn"), "textures/ui/icon_return");

    form.show(admin).then((res) => {
        if (res.canceled) return;
        if (res.selection === wps.length) return showPlayerModOptions(admin, target);
        showAdminWaypointAction(admin, target, wps[res.selection]);
    });
}

function showAdminWaypointAction(admin, target, wp) {
    const form = new ActionFormData();
    form.title(wp.name);
    form.button(t(admin, "confirm"), "textures/ui/icon_waypoint_rename");
    form.button(t(admin, "cancel"), "textures/ui/icon_waypoint_delete");
    form.button(t(admin, "return_btn"), "textures/ui/icon_return");

    form.show(admin).then((res) => {
        if (res.canceled) return;
        if (res.selection === 0) {
            const modal = new ModalFormData();
            modal.title(t(admin, "confirm"));
            modal.textField(t(admin, "confirm"), wp.name, wp.name);
            modal.show(admin).then((r) => {
                if (r.canceled) return showPlayerAdminWaypoints(admin, target);
                const name = r.formValues[0].trim().replace(/\|/g, "-");
                if (name === "") return;
                deleteWaypoint(target, wp.rawTag);
                target.addTag(`${WP_PREFIX}${name}|${wp.x}|${wp.y}|${wp.z}|${wp.dimension}`);
                playSoundAndNotify(admin, t(admin, "success"));
            });
        } else if (res.selection === 1) {
            deleteWaypoint(target, wp.rawTag);
            playSoundAndNotify(admin, t(admin, "success"));
        } else {
            showPlayerAdminWaypoints(admin, target);
        }
    });
}

// ----------------------------------------
// RITUAL DE TELETRANSPORTE (PENTAGRAMA)
// ----------------------------------------

function drawLine(dim, start, end, particle, density = 8) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const steps = dist * density;
    for (let i = 0; i <= steps; i++) {
        const p = i / (steps || 1);
        dim.spawnParticle(particle, {
            x: start.x + dx * p,
            y: start.y + dy * p,
            z: start.z + dz * p
        });
    }
}

function startPentagramRitual(player, loc, dim) {
    const R = 2.0; // Radio
    const h = 0.05; // Altura sobre el suelo
    const center = { x: loc.x, y: loc.y + h, z: loc.z };

    // Calcular los 5 vértices de la estrella
    const points = [];
    for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI / 5) - (Math.PI / 2);
        points.push({
            x: center.x + R * Math.cos(angle),
            y: center.y,
            z: center.z + R * Math.sin(angle)
        });
    }

    const starOrder = [0, 2, 4, 1, 3, 0];
    const starParticle = "minecraft:blue_flame_particle";
    const circleParticle = "minecraft:obsidian_tear_particle";

    let currentStep = 0;
    let progress = 0;
    let ticks = 0;

    const ritual = system.runInterval(() => {
        ticks++;

        // Círculo protector (siempre visible)
        for (let i = 0; i < 40; i++) {
            const a = (i / 40) * 2 * Math.PI;
            dim.spawnParticle(circleParticle, {
                x: center.x + R * Math.cos(a),
                y: center.y,
                z: center.z + R * Math.sin(a)
            });
        }

        // Dibujar líneas completadas
        for (let i = 0; i < currentStep; i++) {
            drawLine(dim, points[starOrder[i]], points[starOrder[i + 1]], starParticle, 10);
        }

        // Dibujar línea actual animada
        if (currentStep < starOrder.length - 1) {
            const start = points[starOrder[currentStep]];
            const end = points[starOrder[currentStep + 1]];
            const currentEnd = {
                x: start.x + (end.x - start.x) * progress,
                y: start.y + (end.y - start.y) * progress,
                z: start.z + (end.z - start.z) * progress
            };
            drawLine(dim, start, currentEnd, starParticle, 12);

            progress += 0.15; // Velocidad de dibujo
            if (progress >= 1) {
                progress = 0;
                currentStep++;
            }
        }

        // Finalizar después de un tiempo extra
        if (ticks > 140) { // 7 segundos total (3 extra como pidió el usuario)
            system.clearRun(ritual);

            // Restore movement
            player.runCommandAsync(`inputpermission set @s movement enabled`).catch(() => { });
            player.runCommandAsync(`inputpermission set @s jump enabled`).catch(() => { });

            // Explosión final sónica
            for (let i = 0; i < 20; i++) {
                dim.spawnParticle("minecraft:sonic_explosion", center);
            }
            player.runCommandAsync(`playsound ambient.weather.lightning.impact @s ~ ~ ~ 1 1`).catch(() => { });
        }
    }, 1);
}
