import * as $ from "jquery";
import Cookies from "js-cookie";
// --- Import necessary Kontra functions ---
import { initKeys, keyMap, keyPressed, onKey } from "kontra";
// --- Import other dependencies ---
import { giveCommandHint, nextCommand, prevCommand } from "../commands";
import { camera, g } from "../globals";
import hud from "../gui/HUD";
// --- Import dependencies needed for this file AND updateDebug ---
// VERIFY THESE PATHS AND EXPORT TYPES (default vs named { })
import game from '../Game.js';                      // Assumed default export
import world from '../world/WorldManager.js';      // Default export (path confirmed)
import chunkManager from '../managers/ChunkManager.js';// Assumed default export
import { axesHelper } from '../index.js';            // Assumed named export from index.js
// --- Other imports ---
import inventory from "../items/Inventory";
import chat from "../managers/ChatManager.js";
import player from "../entity/player/Player"; // Local player instance
import threeStats from "../stats/ThreeStats";
import screenshotter from "../gui/Screenshot";

// --- Initialize Kontra's keyboard listeners ---
initKeys();

let doublePressDelay = 200;
let lastKeypressTime = 0;

export function keyPressedPlayer(key) {
  return keyPressed(key) && player.controls.enabled && !chat.showChatBar && g.initialized;
}

// --- Restored export function update() ---
export function update() {
  if (hud) { // Check if hud is defined
     // This handles the 'tab' key check originally expected by index.js
     hud.showPlayerTab = keyPressedPlayer("tab");
  }
}


onKey(
  "f",
  (event) => {
    if (event.repeat) return;
    if (player.controls.enabled && !chat.showChatBar && player.mode != "survival") {
      chat.addChat({ text: "Double tap space in creative mode to fly", color: "cyan" });
    }
  },
  { preventDefault: false, handler: "keydown" }
);

onKey(
  "space",
  (event) => {
    if (event.repeat) return;
    let pressTime = new Date().getTime();
    if (pressTime - lastKeypressTime <= doublePressDelay) {
      pressTime = 0;
      player.toggleFly();
    }
    lastKeypressTime = pressTime;
  },
  { preventDefault: false, handler: "keydown" }
);

// number keys for hotbar
onKey(
  ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  (e) => {
    if (!player.controls.enabled || chat.showChatBar || !keyMap[e.code]) return;
    player.currSlot = parseInt(keyMap[e.code]) - 1;
  },
  { preventDefault: false }
);

// zoom
onKey(
  "x",
  () => {
    if (!player.controls.enabled || chat.showChatBar || !camera) return;
    camera.zoom = g.zoomLevel ?? 3;
    g.enableZoom = true;
  },
  { preventDefault: false, handler: "keydown" }
);
onKey(
  "x",
  () => {
    g.enableZoom = false;
    if (camera) camera.zoom = 1;
  },
  { preventDefault: false, handler: "keyup" }
);

// respawn - Uses imported world and g.socket
onKey(
  "r",
  (event) => {
    if (!player.controls.enabled || chat.showChatBar || event.repeat || !world?.blockSize) {
         console.warn("Cannot respawn: world object or blockSize not found.");
         return;
    }
    player.respawn(world.blockSize); // Uses imported world

    if (g.socket?.emit) { // Uses socket from global 'g'
        g.socket.emit("respawn");
    } else {
        console.warn("Cannot emit respawn event: g.socket or emit function not found.");
    }
  },
  { preventDefault: false, handler: "keydown" }
);

// drop
onKey(
  "q",
  (event) => {
    if (!player.controls.enabled || chat.showChatBar || event.repeat) return;
    player.dropItem();
  },
  { preventDefault: false, handler: "keydown" }
);

// --- Removed the onKey handlers for 'tab' as update() handles it ---
// onKey(
//   "tab",
//   () => { if (hud) hud.showPlayerTab = true; },
//   { preventDefault: true, handler: "keydown" }
// );
// onKey(
//   "tab",
//   () => { if (hud) hud.showPlayerTab = false; },
//   { preventDefault: true, handler: "keyup" }
// );

// open chat
onKey(
  ["enter", "slash"],
  (e) => {
    if (e.repeat) return;
    if (!player.controls.enabled) return;
    const slashOpen = e.code === "Slash" && !chat.showChatBar;
    if (e.code == "Enter" || slashOpen) chat.showChatBar = !chat.showChatBar;
  },
  { preventDefault: false, handler: "keydown" }
);

onKey(
  "up",
  () => {
    if (!g.initialized) return;
    if (chat.showChatBar) prevCommand(); else inventory.scroll(1);
  },
  { preventDefault: false }
);

onKey(
  "down",
  () => {
    if (!g.initialized) return;
    if (chat.showChatBar) nextCommand(); else inventory.scroll(-1);
  },
  { preventDefault: false }
);

// jQuery handler for command hints
$(window).on("keyup", function (event) {
  if (chat.showChatBar) {
    chat.hintText = "";
    let msg = $("#chat-input").val() as string;
    if (player?.controls.enabled && msg && msg[0] == "/") {
      chat.hintText = "";
      const msgParts = msg.slice(1).split(" "); // Assuming removeExtraSpaces isn't standard
      giveCommandHint(msgParts, event.keyCode === 9); // 9 = Tab
    }
  }
});

// function keys
// ###########################################

// Toggle camera mode
let lastGamemode = undefined;
onKey("f1", (event) => {
  if (event.repeat || !hud) return;
  if (player.mode == "camera" && !player.toggleGUI) return;
  lastGamemode = !player.toggleGUI ? player.mode : player.mode != "camera" ? player.mode : lastGamemode;
  player.mode = !player.toggleGUI ? "camera" : lastGamemode;
  hud.showStats = player.toggleGUI && Cookies.get("showStats") == "true";
  if (threeStats) {
      threeStats.showStats = player.toggleGUI && (hud.showStats || game?.debug == true);
  }
  !player.toggleGUI ? $("#chat-input").attr("placeholder", "") : $("#chat-input").attr("placeholder", "> Press Enter to Chat");
  player.toggleGUI = !player.toggleGUI;
});

// Take a screenshot
onKey("f2", (event) => {
  if (event.repeat || !screenshotter) return;
  screenshotter.takeScreenshot();
});

// Toggle stats list
onKey("f3", (event) => {
  if (event.repeat || !hud || !threeStats) return;
  hud.showStats = !hud.showStats;
  threeStats.showStats = hud.showStats;
  Cookies.set("showStats", hud.showStats ? "true" : "false", { expires: 365 });
  chat.addChat({ text: "Stats list " + (hud.showStats ? "enabled" : "disabled"), discard: true });
});

// Toggle perspective
onKey("f5", (event) => {
  if (event.repeat) return;
  player.perspective = (player.perspective + 1) % 3;
  player.toggleCameraPerspective();
});

// Toggle debug mode - Calls updateDebug
onKey("f7", (event) => {
  if (event.repeat || !game) return;
  game.debug = !game.debug;
  if (threeStats && hud) {
      threeStats.showStats = game.debug || hud.showStats;
  }
  Cookies.set("debug", game.debug ? "true" : "false", { expires: 365 });
  updateDebug(); // Call updateDebug again
  chat.addChat({ text: "Debug mode " + (game.debug ? "enabled" : "disabled"), discard: true });
});

// Toggle cinematic mode
onKey("f8", (event) => {
  if (event.repeat) return;
  event.preventDefault();
  player.cinematicMode = !player.cinematicMode;
  chat.addChat({ text: "Cinematic mode " + (player.cinematicMode ? "enabled" : "disabled"), discard: true });
});

// Toggle fullscreen
onKey("f11", (event) => {
  if (event.repeat) return;
  event.preventDefault();
  if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
    if (document.exitFullscreen) document.exitFullscreen();
    else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
    chat.addChat({ text: "Exited fullscreen", discard: true });
  } else {
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    else if ((document.documentElement as any).webkitRequestFullscreen) (document.documentElement as any).webkitRequestFullscreen();
    chat.addChat({ text: "Entered fullscreen", discard: true });
  }
});


// --- updateDebug function - Uses imported dependencies ---
function updateDebug() {
  const isDebug = !!game?.debug;

  // Toggle bounding box visibility for all entities managed by WorldManager
  if (world?.entities && typeof world.entities === 'object' && world.entities !== null) {
      for (const id in world.entities) {
          const entity = world.entities[id];
          if (entity?.bbox) {
              entity.bbox.visible = isDebug;
          }
      }
  }

  // --- Fix: Assignment to optional property ---
  // Also toggle the local player's skeleton bounding box separately
  const playerSkeleton = player?.skeleton;
  if (playerSkeleton) {
      const bboxObject = playerSkeleton.getObjectByName("bbox");
      if (bboxObject) {
          bboxObject.visible = isDebug;
      }
  }
  // --- End Fix ---

  // Axes helper
  if (axesHelper) axesHelper.visible = isDebug;

  // Chunk lines
  if (chunkManager?.debugLines && typeof chunkManager.debugLines === 'object') {
      for (let id in chunkManager.debugLines) {
        let line = chunkManager.debugLines[id];
        if (line) line.visible = isDebug;
      }
  }
}