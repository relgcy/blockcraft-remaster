import Ola from "ola";
import * as $ from "jquery";
import { keyPressed } from "kontra";
import player from "../entity/player/Player";
import game from "../Game";
import inventory from "../items/Inventory";
import { clamp } from "../lib/helper"; // Assuming clamp is correctly defined/imported
import { camera, g } from "../globals";

// Scrolling
let scrollProgress = 0;
let lastDirection = 0;

// --- Fix: Changed event handling ---
$(document).on("wheel", function (e: JQuery.TriggeredEvent<Document, undefined, Document, Document>) { // Use more specific jQuery event type
  if (!g.initialized || !e.originalEvent) return; // Ensure originalEvent exists

  // Cast originalEvent to WheelEvent
  const wheelEvent = e.originalEvent as WheelEvent;

  // Use deltaY. Negate it to match wheelDelta convention (up is positive).
  // Use Math.sign to just get direction (+1 or -1 or 0), similar to dividing wheelDelta by 120.
  let scrollDirection = -Math.sign(wheelEvent.deltaY);

  // If scroll happened and direction changed, reset progress
  if (scrollDirection !== 0 && scrollDirection !== lastDirection) {
    scrollProgress = 0;
  }

  // Accumulate scroll progress only if a scroll occurred
  if (scrollDirection !== 0) {
      // Simple accumulation based on direction ticks
      scrollProgress += scrollDirection;
      lastDirection = scrollDirection;
  }


  let scroll = 0; // The final action (-1, 0, or 1)
  // Determine threshold based on sensitivity setting (ensure it's at least 1 tick)
  // Use optional chaining and default value for game.scrollSens
  let scrollSensitivityThreshold = Math.max(1, Math.round(8 / parseInt(game?.scrollSens ?? "8")));

  // Check if accumulated progress meets the threshold for an action
  if (scrollProgress >= scrollSensitivityThreshold) {
    scroll = 1; // Action: Scroll Up
    scrollProgress = 0; // Reset progress
  } else if (scrollProgress <= -scrollSensitivityThreshold) {
    scroll = -1; // Action: Scroll Down
    scrollProgress = 0; // Reset progress
  }
  // --- End Fix ---


  // --- Rest of the handler using the calculated 'scroll' value (-1, 0, or 1) ---
  if (inventory.showInventory && player.mode == "creative") {
    // Use the 'scroll' action value directly
    if (scroll !== 0) {
        inventory.scroll(scroll); // Pass +1 or -1
    }
    return; // Don't process further if inventory is open in creative
  }

  // Ignore scroll if controls disabled or in spectator/camera mode
  if (!player.controls.enabled || player.mode == "spectator" || player.mode == "camera") return;

  let scrollDirectionMultiplier = game.invertMouse ? 1 : -1; // Keep original multiplier name for clarity
  let isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  // This Safari shift key logic might need re-evaluation with deltaY,
  // as horizontal scroll might use deltaX. Assuming it's still intended for vertical.
  if (isSafari && keyPressed("shift")) {
    scrollDirectionMultiplier *= -1;
  }

  // Zoom with X key + Scroll wheel
  if (g.enableZoom && camera) { // Check camera exists
    // Apply scroll action to zoom level
    if (scroll * scrollDirectionMultiplier !== 0) {
        // Use the scroll action (-1 or +1) adjusted by multiplier
        // Clamp function needs to be defined/imported correctly
        g.zoomLevel = clamp(g.zoomLevel - scroll * scrollDirectionMultiplier * 0.2, 0.1, 10); // Adjust step (0.2) as needed
        camera.zoom = g.zoomLevel;
    }
    return; // Don't scroll hotbar if zooming
  }

  // Scroll in toolbar using the 'scroll' action value
  if (scroll * scrollDirectionMultiplier > 0) { // Corresponds to original scroll up logic
    player.currSlot += 1;
    if (player.currSlot > 8) player.currSlot = 0;
  } else if (scroll * scrollDirectionMultiplier < 0) { // Corresponds to original scroll down logic
    player.currSlot -= 1;
    if (player.currSlot < 0) player.currSlot = 8;
  }
});
// --- End of wheel event handler ---


const mouse = Ola({ x: 0, y: 0 }, 10); // Mouse position smoothing
$("body").on("mousemove", function (e) {
  // Update smoothed mouse position
  mouse.x = e.pageX;
  mouse.y = e.pageY;
});

export { mouse };

// Key event handling (mousedown/mouseup) - Seems okay, but check player methods exist
$("html").on("mousedown", function (event) {
  if (!g.initialized) return;
  // Allow clicks even if inventory is shown for inventory interaction below?
  // Let's separate: block world interaction if inventory shown OR controls disabled
  if (!player.controls.enabled || inventory.showInventory) return;

  switch (event.which) {
    case 1: // Left click
      player.punch(); // Assumes player.punch() exists
      player.click = true; // Set flag? Check if used consistently
      player.key.leftClick = Date.now(); // Set click time
      break;
    case 2: // Middle click
      event.preventDefault();
      player.getBlock(); // Assumes player.getBlock() exists
      break;
    case 3: // Right click
      player.place = true; // Flag for placing
      player.key.rightClick = Date.now(); // Timestamp for holding
      // Only set lastRightClick on initial press? Or keep updating?
      // Original logic seemed to set it once - let's keep it that way maybe?
      // This seems complex, Player.ts handles bow logic based on this.
      if (!player.key.lastRightClick) player.key.lastRightClick = Date.now();
      break;
    default:
      // Ignore other buttons
  }
});

$("html").on("mouseup", function (event) {
  if (!g.initialized) return;
  // Reset states regardless of inventory/controls? Maybe not.
  if (!player.controls.enabled || inventory.showInventory) return;

  switch (event.which) {
    case 1: // Left click up
      player.click = false; // Reset flag?
      player.key.leftClick = 0; // Reset timestamp = stops mining
      break;
    case 2: // Middle click up
      break;
    case 3: // Right click up
      player.place = false; // Stop placing flag
      player.key.rightClick = 0; // Reset timestamp = stops holding
      player.key.lastRightClick = 0; // Reset timestamp used for bow charge start
      break;
    default:
      // Ignore
  }
});

// Inventory Interaction - Bound to body
$("body")
  .on("mousedown", function (e) {
    if (!g.initialized || !inventory.showInventory) return; // Only when inventory is shown
    switch (e.which) {
      case 1:
        inventory.selectInventory("left", true);
        g.mouseLeft = true;
        break;
      case 2:
         e.preventDefault(); // Prevent default middle-click scroll action in inventory
        inventory.selectInventory("middle", true);
        g.mouseMiddle = true;
        break;
      case 3:
        e.preventDefault(); // Prevent context menu in inventory
        inventory.selectInventory("right", true);
        g.mouseRight = true;
        break;
      default:
       //Ignore
    }
  })
  .on("mouseup", function (e) {
    if (!g.initialized || !inventory.showInventory) return;
    switch (e.which) {
      case 1:
        g.mouseLeft = false;
        inventory.unselect();
        break;
      case 2:
        g.mouseMiddle = false;
        // inventory.unselect(); // Does middle click need unselect?
        break;
      case 3:
        g.mouseRight = false;
        inventory.unselect();
        break;
      default:
        // Ignore
    }
  });

// Double click handling
$("body").on("dblclick", function () {
  if (!g.initialized || !inventory.showInventory) return; // Only in inventory
  inventory.selectInventory("double");
});