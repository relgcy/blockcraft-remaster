import * as $ from "jquery";
import Cookies from "js-cookie";

// Import THREE namespace is required for type assertions like THREE.Mesh
import * as THREE from 'three';

// Import necessary Kontra functions
// --- !!! IMPORTANT !!! ---
// Ensure kontra.initKeys() is called ONCE globally in your game's setup code!
import { keyMap, keyPressed, onKey } from "kontra"; // Removed bindKeys, added onKey

// Import project-specific modules (Client-Side)
import { giveCommandHint, nextCommand, prevCommand } from "../commands";
import { camera, g } from "../globals"; // Assuming type definitions for these exist or are imported
import hud from "../gui/HUD";
// Ensure axesHelper is correctly initialized/exported from index.js or another module
import { axesHelper } from "../index.js";
import inventory from "../items/Inventory";
import chat from "../managers/ChatManager.js";
import player from "../entity/player/Player"; // Assuming Player.ts has proper definitions
import threeStats from "../stats/ThreeStats"; // Assuming type definitions exist
import screenshotter from "../gui/Screenshot";

// --- Global Variable Assumption ---
// Declaring assumed globals. Ideally, replace with imports or context/dependency injection.
// NOTE: Accessing server-side concepts like 'world' directly from the client is problematic.
declare let world: any; // TODO: Define proper type or import client-side representation
declare let chunkManager: any; // TODO: Define proper type or import
declare let players: any; // TODO: Define proper type (e.g., { [id: string]: Player }) or import
declare let game: any; // TODO: Define proper type or import


let doublePressDelay: number = 200;
let lastKeypressTime: number = 0;

// Helper function to check key press state with conditions
export function keyPressedPlayer(key: string): boolean {
    const initialized = g?.initialized ?? false;
    const controlsEnabled = player?.controls?.enabled ?? false;
    // Use Kontra's keyPressed function
    return keyPressed(key) && controlsEnabled && !chat?.showChatBar && initialized;
}

// --- Event Listeners using kontra.onKey ---

// 'f' key - Hint about flying
onKey('f', (event: KeyboardEvent) => { // Use KeyboardEvent type
    // event.repeat is standard for KeyboardEvent
    if (event.repeat) return;

    if (player?.controls?.enabled && !chat?.showChatBar && player?.mode !== "survival") {
        chat?.addChat({ text: "Double tap space in creative mode to fly", color: "cyan" });
    }
}, { preventDefault: false }); // Keep preventDefault option

// 'space' key - Double tap to toggle fly
onKey('space', (event: KeyboardEvent) => {
    if (event.repeat) return;
    if (!player?.controls?.enabled || chat?.showChatBar) return;

    let pressTime = Date.now(); // Use Date.now() which is simpler
    if (pressTime - lastKeypressTime <= doublePressDelay) {
        if (player?.mode !== 'survival') {
             player?.toggleFly();
        }
        pressTime = 0; // Reset time to prevent immediate re-trigger
    }
    lastKeypressTime = pressTime;
}, { preventDefault: false });

// Number keys for hotbar (1-9)
onKey(['1', '2', '3', '4', '5', '6', '7', '8', '9'], (event: KeyboardEvent) => {
    if (!player?.controls?.enabled || chat?.showChatBar) return;
    if (player) {
       // Use standard event.key for numbers
       player.currSlot = parseInt(event.key, 10) - 1;
    }
}, { preventDefault: false });

// 'r' key - Respawn Request
onKey('r', (event: KeyboardEvent) => {
    if (event.repeat) return;
    if (!player?.controls?.enabled || chat?.showChatBar) return;

    // --- !!! WARNING !!! ---
    // Client should ideally ONLY emit the socket event. Relying on global 'world' is problematic.
    try {
        // Check if world exists and has blockSize property
        if (world && typeof world.blockSize === 'number') {
            player?.respawn(world.blockSize);
        } else {
            console.warn("Respawn: 'world' or 'world.blockSize' not accessible. Falling back.");
            player?.respawn(16); // Fallback size? Or respawn() takes no args?
        }
    } catch (e) {
        console.error("Error during client-side respawn attempt:", e);
        player?.respawn(16); // Fallback
    }

    g?.socket?.emit("respawn");
}, { preventDefault: false });

// 'q' key - Drop item
onKey('q', (event: KeyboardEvent) => {
    if (event.repeat) return;
    if (!player?.controls?.enabled || chat?.showChatBar) return;
    player?.dropItem();
}, { preventDefault: false });

// 'enter' and 'slash' keys - Toggle chat
onKey(['enter', 'slash'], (event: KeyboardEvent) => {
    if (event.repeat) return;
    if (!player?.controls?.enabled) return;

    const key = event.key.toLowerCase(); // Use standard event.key
    const slashOpen = key === '/' && !chat?.showChatBar;

    // Prevent chat toggle if modifier keys are pressed
    if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
    }

    // Prevent default form submission for Enter, or address bar focus for Slash
    if (key === 'enter' || slashOpen) {
        event.preventDefault();
        if (chat) {
           chat.showChatBar = !chat.showChatBar;
           // Focus/blur input field when chat toggles
           try {
               if (chat.showChatBar) {
                   $("#chat-input").trigger("focus");
               } else {
                   $("#chat-input").trigger("blur");
               }
           } catch(e) { console.error("Error focusing/blurring chat input:", e); }
        }
    }
    // No preventDefault option needed in onKey call itself
});

// 'up' arrow key - Chat history prev / Inventory scroll up
onKey('arrowup', (event: KeyboardEvent) => {
    if (!g?.initialized) return;
    if (chat?.showChatBar) {
        event.preventDefault(); // Prevent cursor move in input
        prevCommand();
    } else if (player?.controls?.enabled) {
        event.preventDefault(); // Prevent page scroll
        inventory?.scroll(1);
    }
});

// 'down' arrow key - Chat history next / Inventory scroll down
onKey('arrowdown', (event: KeyboardEvent) => {
    if (!g?.initialized) return;
    if (chat?.showChatBar) {
        event.preventDefault(); // Prevent cursor move in input
        nextCommand();
    } else if (player?.controls?.enabled) {
        event.preventDefault(); // Prevent page scroll
        inventory?.scroll(-1);
    }
});


// --- Function Keys ---

// F1 - Toggle camera mode / GUI visibility
let lastGamemode: string | undefined = undefined;
onKey('f1', (event: KeyboardEvent) => {
    if (event.repeat) return;
    event.preventDefault(); // Prevent browser help
    if (!player || !hud || !threeStats || !g || !Cookies) return;

    if (player.mode === "camera" && !player.toggleGUI) return;

    lastGamemode = !player.toggleGUI ? player.mode : (player.mode !== "camera" ? player.mode : lastGamemode);
    player.mode = !player.toggleGUI ? "camera" : (lastGamemode ?? player.mode);

    player.toggleGUI = !player.toggleGUI;

    const showStatsCookie = Cookies.get("showStats") === "true";
    const currentDebug = game?.debug ?? g?.debug ?? false; // Use game global if exists
    hud.showStats = player.toggleGUI && showStatsCookie;
    // Ensure threeStats exists before accessing showStats
    if (threeStats) threeStats.showStats = player.toggleGUI && (hud.showStats || currentDebug);
    try { $("#chat-input").attr("placeholder", player.toggleGUI ? "> Press Enter to Chat" : ""); }
    catch (e) { console.error("Error updating chat placeholder:", e); }
});

// F2 - Take screenshot
onKey('f2', (event: KeyboardEvent) => {
    if (event.repeat) return;
    event.preventDefault();
    screenshotter?.takeScreenshot();
});

// F3 - Toggle stats list
onKey('f3', (event: KeyboardEvent) => {
    if (event.repeat) return;
    event.preventDefault(); // Prevent browser find
    if (!hud || !threeStats || !Cookies || !chat) return;

    hud.showStats = !hud.showStats;
    if (threeStats) threeStats.showStats = hud.showStats; // Check threeStats exists
    Cookies.set("showStats", hud.showStats ? "true" : "false", { expires: 365 });
    chat.addChat({ text: "Stats list " + (hud.showStats ? "enabled" : "disabled"), discard: true });
});

// F5 - Toggle perspective
onKey('f5', (event: KeyboardEvent) => {
    if (event.repeat) return;
    event.preventDefault(); // Prevent browser refresh
    if (!player?.controls?.enabled || chat?.showChatBar) return;
    if (player) {
       player.perspective = (player.perspective + 1) % 3;
       player.toggleCameraPerspective();
    }
});

// F7 - Toggle debug mode
onKey('f7', (event: KeyboardEvent) => {
    if (event.repeat) return;
    event.preventDefault();
    // Use game global for debug flag
    if (typeof game !== 'undefined' && threeStats && Cookies && chat && hud) {
        game.debug = !game.debug;
        if (threeStats) threeStats.showStats = game.debug || hud.showStats;
        Cookies.set("debug", game.debug ? "true" : "false", { expires: 365 });
        if (typeof updateDebug === 'function') updateDebug(); // Check function exists
        chat.addChat({ text: "Debug mode " + (game.debug ? "enabled" : "disabled"), discard: true });
    } else {
        console.warn("Cannot toggle debug mode: 'game' object not found.");
    }
});

// F8 - Toggle cinematic mode
onKey('f8', (event: KeyboardEvent) => {
    if (event.repeat) return;
    event.preventDefault();
    if (!player?.controls?.enabled || chat?.showChatBar) return;
    if (player && chat) {
        player.cinematicMode = !player.cinematicMode;
        chat.addChat({ text: "Cinematic mode " + (player.cinematicMode ? "enabled" : "disabled"), discard: true });
    }
});

// F11 - Toggle fullscreen
onKey('f11', async (event: KeyboardEvent) => {
    if (event.repeat) return;
    // Do NOT preventDefault() by default for F11
    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
            chat?.addChat({ text: "Exited fullscreen", discard: true });
        } else {
            if (document.fullscreenEnabled) {
                await document.documentElement.requestFullscreen();
                chat?.addChat({ text: "Entered fullscreen", discard: true });
            } else {
                chat?.addChat({ text: "Fullscreen not enabled in browser", color: "orange", discard: true });
            }
        }
    } catch (err: any) { // Catch error with type any or unknown
        console.error(`Fullscreen toggle error:`, err);
        chat?.addChat({ text: "Fullscreen not supported or denied", color: "red", discard: true });
    }
}, { preventDefault: false }); // MUST explicitly allow default behavior


// --- Update function for continuous checks (called every frame) ---

export function update() {
    // Add guards for required objects
    if (!hud || !g || !player?.controls || !camera) return;

    // Tab key - Show player list
    hud.showPlayerTab = keyPressedPlayer("tab");

    // 'x' key - Zoom (Hold to zoom)
    const zoomKeyPressed = keyPressedPlayer('x');

    if (zoomKeyPressed) {
        // Apply zoom only if enabled and not already zooming
        if (!g.enableZoom) {
            g.enableZoom = true;
            camera.zoom = g.zoomLevel ?? 3; // Use configured zoom level or default
            camera.updateProjectionMatrix(); // Update camera after changing zoom
        }
    } else {
        // Reset zoom only if it was previously enabled
        if (g.enableZoom) {
            g.enableZoom = false;
            camera.zoom = 1; // Reset zoom
            camera.updateProjectionMatrix(); // Update camera after changing zoom
        }
    }
}


// --- jQuery Event Listener for Chat Input Hints (Separate from Kontra) ---
// Uses jQuery types if @types/jquery is installed
$(window).on("keyup", function (event: JQuery.KeyUpEvent) { // Use specific jQuery event type
    const chatInput = $("#chat-input")[0]; // Get raw DOM element
    if (!chat || !chatInput) return;

    // Check if the event target is the chat input itself
    if (chat.showChatBar && event.target === chatInput) {
        chat.hintText = "";
        // Use .val() safely, asserting type if needed, or use .toString()
        const msgValue = ($(chatInput).val() || "").toString();

        if (player?.controls?.enabled && msgValue.startsWith("/")) {
             // Ensure removeExtraSpaces is defined, e.g., on String.prototype
             // If not, remove the call or define the function
             /** @type {string[]} */
             let msgArgs: string[] = [];
             const commandPart = msgValue.length > 1 ? msgValue.slice(1) : "";
             if (commandPart && typeof (commandPart as any).removeExtraSpaces === 'function') {
                // @ts-ignore - Assuming removeExtraSpaces exists
                 msgArgs = commandPart.removeExtraSpaces().split(" ");
             } else if (commandPart) {
                 // Fallback if removeExtraSpaces doesn't exist
                 msgArgs = commandPart.replace(/\s+/g, ' ').trim().split(" ");
             } else {
                 msgArgs = [""]; // Represent empty command case
             }

            // --- !!! TYPE CHECK !!! ---
            // Ensure 'giveCommandHint' function signature accepts string[]
            // Example: export function giveCommandHint(args: string[], isTabComplete: boolean): void;
             giveCommandHint(msgArgs, event.key === 'Tab'); // Use event.key instead of keyCode

            // --- !!! POTENTIAL ERROR LOCATION FOR TS2367 !!! ---
            // Check if line 278 was somewhere around here comparing event.target or similar
            // Example of potential bad comparison: if (event.target === window) { ... }
            // Fix depends on what the original comparison was trying to do.
            // Please provide the original line 278 code if the error persists.
        }
    }
});


// --- Debug Update Function (Preserving original logic but warning about issues) ---
function updateDebug() {
    // Assume globals 'game', 'players', 'world', 'chunkManager' exist
    const isDebugging = game?.debug ?? g?.debug ?? false;

    try {
        // Player bounding boxes
        if (players && typeof players === 'object') {
            for (const id in players) {
                if (Object.prototype.hasOwnProperty.call(players, id)) {
                    const p = players[id];
                    if (p?.bbox) { // Check p exists and has bbox
                        p.bbox.visible = isDebugging;
                    }
                }
            }
        }
        // Local player separately
        if (player?.skeleton?.getObjectByName) { // Check methods exist
            // Use type assertion because getObjectByName returns Object3D|undefined
            const bbox = player.skeleton.getObjectByName("bbox") as THREE.Mesh | undefined;
            if (bbox) bbox.visible = isDebugging;
        }

        // --- !!! WARNING !!! ---
        // Accessing 'world.entities' and 'chunkManager.debugLines' directly from the client
        // is problematic if they represent server-side state. This will likely fail or show incorrect data.
        // Consider removing or getting this data via network requests/events if needed.

        // Entity bounding boxes (Attempting original logic, may fail)
        if (world?.entities && typeof world.entities === 'object') {
            for (const id in world.entities) {
                 if (Object.prototype.hasOwnProperty.call(world.entities, id)) {
                    const entity = world.entities[id];
                    if (entity?.bbox) { // Check entity and bbox exist
                        entity.bbox.visible = isDebugging;
                    }
                 }
            }
        }

        // Axes helper (Assuming this is client-side)
        if (axesHelper) {
            axesHelper.visible = isDebugging;
        }

        // Chunk lines (Attempting original logic, may fail)
        if (chunkManager?.debugLines && typeof chunkManager.debugLines === 'object') {
            for (const id in chunkManager.debugLines) {
                 if (Object.prototype.hasOwnProperty.call(chunkManager.debugLines, id)) {
                    const line = chunkManager.debugLines[id];
                    if (line) { // Check line exists
                        line.visible = isDebugging;
                    }
                 }
            }
        }

    } catch (error) {
        console.error("Error during updateDebug execution:", error);
    }
}