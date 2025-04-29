import Cookies from "js-cookie";
import Ola from "ola";
import * as THREE from "three";
import game from "./Game";
import { camera, connectionDelay, g, isState, players, scene } from "./globals";
import masterRenderer from "./graphics/MasterRenderer";
import hud from "./gui/HUD";
import { connectError, refreshServers, showServerSelect, updateMenu } from "./gui/mainmenu/serverlist";
import { showSettings } from "./gui/mainmenu/settings";
import { update as updateKeyboardInput } from "./input/KeyboardInput";
import PointerLock, { onWindowResize } from "./input/PointerLock";
import { addKeyboardControls, addVideoControls } from "./input/settings";
import inventory from "./items/Inventory";
import { round, updateGUISize } from "./lib/helper";
import chat from "./managers/ChatManager";
import chunkManager from "./managers/ChunkManager";
import entityManager from "./managers/EntityManager";
import PlayerManager from "./managers/PlayerManager";
import textureManager from "./managers/TextureManager";
import workerManager from "./managers/WorkerManager";
import world from "./world/WorldManager";
import player from "./entity/player/Player";
import { animateServerEntities, animateServerPlayers, updatePlayers } from "./server";
import stage from "./world/Stage";
import stats from "./stats/ThreeStats.ts";
import { initStatistics } from "./stats/statslist";
import threeStats from "./stats/ThreeStats";
import { initInput } from "./input/input";
import { init as initKontra } from "kontra";
import audioManager from "./audio/AudioManager";
// side effect based
import "../public/style.css";
import "./gui/mainmenu/tabs";

/*
Authenticates the player and provides server details from each running server.
Handles menu progression logic.
*/

// Setup
let lastConnection = Date.now() - connectionDelay;

// Initialize server connection
function connect(url) {
  console.log("Connecting to server with url: " + url);
  if (url in g.servers) {
    g.currentServer = g.servers[url];
  }
  g.socket.io.uri = url;
  g.socket.connect();
}

// Disconnect server
export function disconnectServer() {
  if (!isState("inGame")) return;

  $(".menu-button").hide();
  $("#disconnecting-bar").show();
  document.exitPointerLock();

  g.initialized = false;
  g.joined = false;
  g.currentServer = undefined;
  g.maxDisconnected = Object.keys(chunkManager.currChunks).length;
  g.disconnectedAnimate = new Ola(0);
  g.socket.disconnect();

  console.log("Disconnecting from server... (Cells to unload: " + g.maxDisconnected + ")");

  // Reset chunk manager
  chunkManager.reqChunks = {};

  // Remove all chunks
  world.cells = {};

  // Remove all players
  for (let id in players) {
    scene.remove(players[id].entity);
    delete players[id];
  }

  // Remove all entities
  for (let id in world.entities) {
    if (!world.entities[id].mesh) continue;

    let mesh = world.entities[id].mesh;
    if (mesh.type == "Group") {
      for (let i = 0; i < mesh.children.length; i++) {
        let child = mesh.children[i];
        if (child.type == "Group") {
          for (let c of child.children) {
            c.geometry.dispose();
            c.material.dispose();
          }
        } else {
          child.geometry.dispose();
          child.material.dispose();
        }
      }
      scene.remove(mesh);
    } else {
      mesh.geometry.dispose();
      mesh.material.dispose();
      scene.remove(mesh);
    }

    delete world.entities[id];
  }

  g.state += 1;
}

// Menu progression logic
$(document).ready(function () {
  init();
  initKontra();
  initInput();

  // Refresh servers
  $("#refresh-servers").click(function () {
    refreshServers();
  });

  // Menu progression (0: Start Menu, 1: Server Select, 2: Loading Game, 3: In Game)
  $("#start-button").click(function (event) {
    nextState(event);
  });

  // Enter username input
  $("#name-input").keyup(function (event) {
    if (event.code === "Enter") nextState();
  });

  // Enter direct connect input
  $("#direct-connect-input").keyup(function (event) {
    if (event.code === "Enter") {
      nextState();
      return;
    }

    let val = $("#direct-connect-input").val();
    Cookies.set("directConnect", val, { expires: 365 });
    if (val) {
      $("#server-bar").text(`Direct Connect`);
      $("#server-bar").css({ "background-color": "green" });
    } else if (g.currentServer) {
      $("#server-bar").text(`Join server (${g.currentServer.region})`);
      $("#server-bar").css({ "background-color": "green" });
    }
  });

  if (DEV_MODE) {
    // TODO: Add callbacks to nextState() so setTimeout isn't needed
    nextState();
    $("#direct-connect-input").val("localhost:3001");
    nextState();
    nextState();
    setTimeout(nextState, 2000);
  }
});

// Menu progression states
function nextState(e) {
  if (isState("start")) {
    // Start Menu -> Server Select
    player.skin = "steve";

    if (e) {
      // Choose skin
      let x = e.pageX;
      let y = e.pageY;
      let offset = $("#steve-bar").offset();
      let steve =
        x > offset.left && x < offset.left + $("#steve-bar").width() && y > offset.top && y < offset.top + $("#steve-bar").height();
      if (steve) {
        player.skin = "steve";
      } else {
        player.skin = "alex";
      }
    }

    showServerSelect();

    g.state += 1;
  } else if (
    isState("serverSelect") &&
    (g.currentServer || $("#direct-connect-input").val()) &&
    Date.now() - lastConnection > connectionDelay
  ) {
    // Server Select -> Connecting to Server
    // Direct connection
    let directConnect = $("#direct-connect-input").val();
    if (directConnect) {
      connect(directConnect);
    } else {
      connect(g.currentServer.link);
    }

    $("#server-bar").text(`Connecting to server...`);
    $("#server-bar").css({ "background-color": "orange" });

    // Wait for connection to server
    g.state += 1;
  } else if (isState("loading") && g.loaded > g.maxLoaded) {
    // Loading Game -> Loading Chunks
    console.log("Loading chunks...");
    g.loadedAnimate = new Ola(Object.keys(chunkManager.currChunks).length);
    g.state += 1;
  } else if (isState("loadingChunks") && Object.keys(chunkManager.currChunks).length >= g.maxChunks) {
    // Loading Chunks -> In Game
    console.log("Requesting pointer lock");
    PointerLock.requestPointerLock();
    updateGUISize();
    chat.initChat();

    $(".menu-button").hide();
    $("#ingame-bar").show();
    g.state += 1;
  } else if (isState("inGame")) {
    // In Game

    if (e) {
      let x = e.pageX;
      let y = e.pageY;
      let disconnectButton =
        x > $("#disconnect-bar").offset().left &&
        x < $("#disconnect-bar").offset().left + $("#disconnect-bar").width() &&
        y > $("#disconnect-bar").offset().top &&
        y < $("#disconnect-bar").offset().top + $("#disconnect-bar").height();

      if (disconnectButton) {
        // Disconnect from server
        disconnectServer();
      } else {
        // Return to game
        PointerLock.requestPointerLock();
      }
    } else {
      PointerLock.requestPointerLock();
    }
  } else if (isState("disconnecting")) {
    // Disconnecting from server
  }
}

export function prevState() {
  if (isState("loading")) {
    // Go back to server select menu
    showServerSelect();

    g.state = 1;
  } else if (isState("loadingChunks")) {
    showServerSelect();

    g.state = 1;
  } else if (isState("disconnecting")) {
    // Go back to server select menu
    showServerSelect();

    g.loaded -= 1;
    g.state -= 5;
  }
}

export const axesHelper = new THREE.AxesHelper(0.5);
axesHelper.position.z -= 3;

// Initialize game
function init() {
  let t = Date.now();
  console.log("Initalizing game...");
  window.addEventListener("resize", onWindowResize, false); // Add resize event

  camera.add(axesHelper);

  hud.showStats = Cookies.get("showStats") === "true";
  game.debug = Cookies.get("debug") === "true";
  threeStats.showStats = hud.showStats;

  addVideoControls(); // Add video settings
  addKeyboardControls(); // Add keyboard controls
  initStatistics(); // Add statistics to record
  masterRenderer.init();
  PointerLock.initPointerLock(); // Initialize pointer lock
  updateGUISize(); // Update the GUI size
  workerManager.init();

  console.log("Game initialized in " + (Date.now() - t) + "ms"); // Log time

  animate(); // Start the animation loop
}

// #########################################################################
// GAME LOOP
// #########################################################################
let then = performance.now();
let prevTime = performance.now();

function animate() {
  // TODO: Clean up
  requestAnimationFrame(animate);

  // Get the frame's delta
  var time = performance.now();
  g.elapse = time - then;

  g.delta = (time - prevTime) / 1000;
  g.delta = Math.min(g.delta, 0.1);

  let logicTime = performance.now();
  game.startMemoryMonitor();

  updateMenu(nextState); // Update the menu
  player.update(g.delta, world); // Update player
  chunkManager.update(player); // Update chunks
  animateServerPlayers(); // Update server players
  animateServerEntities(g.delta); // Animate server entities
  sendPacket(); // Send events to server
  axesHelper.lookAt(new THREE.Vector3(0, 0, 100000000));
  game.logicTime = performance.now() - logicTime;

  let renderTime = performance.now();
  stage.update(); // Update the stage
  masterRenderer.render(scene, camera);
  game.renderTime = performance.now() - renderTime;

  let canvasTime = performance.now();
  hud.update(); // Update the HUD
  stats.update();
  game.canvasTime = performance.now() - canvasTime;

  prevTime = time;

  // Update fps and memory usage
  player.fps = round(stats.fps, 1);
  game.fpsList.unshift(performance.now() - time);
  if (game.fpsList.length > 50) {
    game.fps = 1000 / game.fpsList.average();
    game.fpsList.length = 25;
  }

  game.endMemoryMonitor();

  updateKeyboardInput();
}

// Send packet to server
function sendPacket() {
  if (Date.now() - game.lastPacket > game.packetDelay) {
    game.lastPacket = Date.now();
    g.socket.emit("packet", {
      pos: player.pos,
      vel: player.newMove,
      localVel: player.velocity,
      onObject: player.onObject,
      rot: player.rot, // Rotation of body
      dir: player.dir, // Rotation of head
      walking: player.walking, // CHANGED
      sneaking: player.sneaking,
      punching: player.punching,
      blocking: player.blocking,
      currSlot: player.currSlot,
      mode: player.mode,
      fps: round(stats.fps, 1),
      showInventory: inventory.showInventory,
      bowCharge: player.bowCharge,
    });
  }
}

$("#welcome-button")[0].click();

document.addEventListener("contextmenu", (event) => event.preventDefault()); // Prevent right-click

// Get cookie username
let name = Cookies.get("Name");
if (name) $("#name-input").val(name);

// Connection to server successful
g.socket.on("connect", function () {
  console.log("Connected successfully with id: " + g.socket.id);
  lastConnection = Date.now();

  showSettings();
  g.state += 1;
});

// Reconnection attempt
g.socket.io.on("reconnect_attempt", function () {
  console.log("Attempting to reconnect...");
});

// Reconnection to server unsuccessful
g.socket.io.on("reconnect_failed", function () {
  console.log("Reconnection failed!");
  g.socket.disconnect();
  connectError();
});

// Disconnected from server
let disconnectId = undefined;
let disconnectCounter = 5;
g.socket.on("disconnect", function (reason) {
  console.log("Disconnected from server due to:", reason);

  if (reason == "io server disconnect") {
    // Served closed the connection
    disconnectServer();
  }

  if (reason == "transport close") {
    g.socket.disconnect();
    chat.addChat({
      text: "The server has restarted for a new update.",
      color: "red",
    });
    disconnectId = setInterval(function () {
      chat.addChat({
        text: `Your browser will refresh in ${disconnectCounter} seconds.`,
        color: "red",
      });
      disconnectCounter -= 1;
      if (disconnectCounter == 0) {
        clearInterval(disconnectId);
        window.location.reload(true);
      }
    }, 1000);
  }
});

// Kicked from server
g.socket.on("kick", function (reason) {
  let msg = reason ? "Kicked from server due to: " + reason : "Kicked from server";
  console.log(msg);
  disconnectServer();
  connectError("kicked", reason);
});

// Update session token
g.socket.on("uniqueToken", function (token) {
  Cookies.set("token", token, { expires: 10000 });
  game.token = token;
});

// Initialize client
g.socket.on("joinResponse", function (data) {
  // Check if already initialized
  if (g.initialized) console.log("Already initialized game!"); //location.reload(true);

  // Check if blacklisted
  if (data.blacklisted) {
    disconnectServer();
    prevState();
    connectError("banned", data.reason);
    return;
  }

  // Initialize axesHelper
  axesHelper.visible = game.debug;

  // Receive common world attritutes
  Object.assign(world, data.world);

  // Initalize player
  player.join(data);

  // Set chunk pos
  chunkManager.cellPos = world.computeCellFromPlayer(player.pos.x, player.pos.y, player.pos.z);

  // Receive current server players
  let serverPlayers = data.serverPlayers;
  for (let id in serverPlayers) {
    if (id == g.socket.id || !serverPlayers[id]) continue;
    PlayerManager.addPlayer(players, id, serverPlayers[id]);
  }

  // Add pre-existing entities
  for (let id in data.world.entities) {
    entityManager.addEntity(data.world.entities[id]);
  }

  // Init voxel workers
  let worldData = {
    cellSize: world.cellSize,
    cellSliceSize: world.cellSliceSize,
    tileSize: world.tileSize,
    tileTextureWidth: world.tileTextureWidth,
    tileTextureHeight: world.tileTextureHeight,
    blockSize: world.blockSize,
    blockUVS: world.blockUVS,
    blockId: world.blockId,
    blockOrder: world.blockOrder,
    cells: world.cells,
  };

  workerManager.updateVoxelData(worldData);

  // Update to server tick
  game.tick = new Ola(data.tick);

  // Update item search
  inventory.updateItemSearch("");

  g.initialized = true;
  console.log("Successfully joined the server (" + data.info.region + ")");
  game.region = data.info.region;
});

// Load textures
g.socket.on("textureData", function (data) {
  if (g.loaded < g.maxLoaded) {
    world.tileSize = data.tileSize;
    world.tileTextureWidth = data.tileTextureWidth;
    world.tileTextureHeight = data.tileTextureHeight;
    textureManager.loadTextures(data);
  }
});

// Update chunk
g.socket.on("receiveChunk", async function (data) {
  await workerManager.updateRLEWorker(data); // Send decoding to the rleWorker
});

// Add newcoming players
g.socket.on("addPlayer", function (data) {
  if (!g.joined || data.id == g.socket.id) return;

  PlayerManager.addPlayer(players, data.id, data);
});

// Remove player
g.socket.on("removePlayer", function (id) {
  if (!g.initialized || !players[id]) return;

  let isBot = players[id].type == "bot";
  let name = players[id].name;

  scene.remove(players[id].entity);
  delete players[id];
  if (isBot) return;

  chat.addChat({
    text: name + " has left the server",
    color: "yellow",
    timer: 3000,
  });
});

// Receive knockback
g.socket.on("knockback", function (data) {
  let lateralForce = new THREE.Vector3(data.dir.x, data.dir.y, data.dir.z);
  lateralForce.normalize();
  lateralForce.multiplyScalar(data.force);
  player.knockbackVelocity.x = lateralForce.x;
  player.knockbackVelocity.y = data.explosion ? lateralForce.y : 300;
  player.knockbackVelocity.z = lateralForce.z;
});

// Receive punch
g.socket.on("punch", function (id) {
  if (id != g.socket.id && players && players[id]) {
    PlayerManager.updatePlayerColor(players[id], new THREE.Color(1, 0.5, 0.5));
    clearTimeout(players[id].punchId);
    players[id].punchId = setTimeout(function () {
      PlayerManager.updatePlayerColor(players[id], new THREE.Color(1, 1, 1));
    }, 400);
  }
});

// Receive damage
g.socket.on("damage", function (data) {
  camera.rotation.z = Math.PI / 12;
});

// Teleport player
g.socket.on("teleport", function (data) {
  player.setCoords(data.pos);
  camera.rotation.z = Math.PI / 12;
});

g.socket.on("update", async function (data) {
  await updateClient(JSON.parse(data));
});

g.socket.on("messageAll", function (data) {
  chat.addChat(data);
});

g.socket.on("message", function (data) {
  chat.addChat(data);
  if (data.type == "whisper") {
    player.lastWhisper = data.id;
  }
});

g.socket.on("refresh", function () {
  location.reload(true);
});

g.socket.on("ding", function () {
  audioManager.play("random.orb");
});

function updateClient(data) {
  if (!g.joined || !g.initialized) return;

  // Update players
  updatePlayers(data.serverPlayers);

  // Update blocks
  chunkManager.updateBlocks(data.updatedBlocks);

  // Add new entities
  entityManager.addEntities(data.newEntities);

  // Update existing entities TODO: cleanup
  entityManager.updateEntities(data.entities);

  // Update client player
  player.updateClient(data.serverPlayers[g.socket.id]);

  // Update server stats
  game.updateStatsMonitor(data);

  // Latency check
  game.checkLatency(data);
}