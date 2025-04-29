import Ola from "ola";
import * as $ from "jquery";
import { keyPressed } from "kontra"; // Assuming TS file can import from kontra correctly
import player from "../entity/player/Player"; // Assuming Player.ts exists
import game from "../Game"; // Assuming Game.js exists
import inventory from "../items/Inventory"; // Assuming Inventory.js exists
import { clamp } from "../lib/helper";
import { camera, g } from "../globals"; // Assuming types defined

// Scrolling state variables
let scrollProgress: number = 0;
let lastDirection: number = 0;

// Note: Using jQuery's .bind() for 'wheel' might have slightly different event object properties
// compared to addEventListener. .originalEvent should contain the native event.
$(document).on("wheel", function (e: JQuery.TriggeredEvent) { // Use jQuery specific event type
  // Make sure globals and player state are ready
  if (!g?.initialized || !player) return;

  // Access the original browser event for standard properties
  const originalEvent = e.originalEvent as WheelEvent; // Assert type to WheelEvent
  if (!originalEvent) return; // Exit if original event isn't available

  // --- FIX for wheelDelta ---
  // Use standard deltaY property (note the minus sign for direction convention)
  // Smaller deltaY values usually mean finer scrolling, normalize behavior if needed.
  const scrollDelta = -originalEvent.deltaY;
  // Simple normalization: treat any non-zero scroll as 1 or -1 unit for this logic?
  // Or use the actual deltaY magnitude? The old code divided wheelDelta by 120.
  // Let's try to mimic the old scaling approximately. deltaY is often ~100 per "tick".
  const normalizedScroll = scrollDelta / 100; // Adjust divisor as needed based on testing

  if (Math.sign(normalizedScroll) !== lastDirection && lastDirection !== 0) { // Reset progress if direction changes
    scrollProgress = 0;
  }
  scrollProgress += normalizedScroll;
  lastDirection = Math.sign(normalizedScroll);

  let scroll = 0; // -1 for up, 1 for down (based on original wheelDelta logic)
  // Ensure game object exists before accessing scrollSens
  const scrollSensitivity = 8 / parseInt(game?.scrollSens ?? "8"); // Use default if missing

  // Determine scroll direction based on accumulated progress
  if (scrollProgress >= scrollSensitivity) {
    scroll = -1; // Scrolled Up (negative deltaY -> positive normalizedScroll -> negative scroll needed?) -> Let's match old logic assuming wheelDelta > 0 is up
    scrollProgress = 0;
  } else if (scrollProgress <= -scrollSensitivity) {
    scroll = 1; // Scrolled Down (positive deltaY -> negative normalizedScroll -> positive scroll needed?)
    scrollProgress = 0;
  }

  // Handle creative inventory scrolling
  if (inventory?.showInventory && player.mode === "creative") {
    // Assuming inventory scroll expects -1 (up) and 1 (down)
    if (scroll !== 0) {
      inventory.scroll(scroll);
    }
    return; // Don't process toolbar/zoom scroll if inventory is open
  }

  // Handle regular game scrolling (toolbar/zoom)
  if (!player.controls?.enabled || player.mode === "spectator" || player.mode === "camera") return;

  // Check Safari/Shift inversion (keep as is, but be aware userAgent sniffing is fragile)
  let scrollDirection = game?.invertMouse ? 1 : -1; // Use default if game missing
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator?.userAgent ?? ""); // Check navigator exists
  if (isSafari && keyPressed("shift")) { // Check keyPressed function exists
    scrollDirection *= -1;
  }

  const effectiveScroll = scroll * scrollDirection;

  // Zoom with X key held down
  if (g?.enableZoom) { // Check global zoom flag
    if (effectiveScroll < 0) { // Zoom In
      g.zoomLevel = clamp(g.zoomLevel + 0.2, 0.1, 10);
    } else if (effectiveScroll > 0) { // Zoom Out
      g.zoomLevel = clamp(g.zoomLevel - 0.2, 0.1, 10);
    }
    // Check camera exists before setting zoom and updating
    if (camera && typeof camera.updateProjectionMatrix === 'function') {
        camera.zoom = g.zoomLevel;
        camera.updateProjectionMatrix();
    }
    return; // Don't scroll toolbar if zooming
  }

  // Scroll in toolbar
  if (effectiveScroll > 0) { // Scroll right (index increases)
    player.currSlot = (player.currSlot + 1) % 9; // Wrap around using modulo 9 (0-8)
  } else if (effectiveScroll < 0) { // Scroll left (index decreases)
    player.currSlot = (player.currSlot - 1 + 9) % 9; // Wrap around using modulo 9
  }
});

// Mouse movement tracking using Ola for smoothing
// Assuming Ola is correctly imported and works as a function
const mouse = Ola({ x: 0, y: 0 }, 10); // Smooth factor 10

$("body").on("mousemove", function (e: JQuery.MouseMoveEvent) { // Use jQuery specific type
  // Update Ola state with current mouse coordinates
  // These coordinates are relative to the document
  mouse.x = e.pageX;
  mouse.y = e.pageY;
});

export { mouse }; // Export the smoothed mouse state

// --- Mouse Button Event Handling ---

// Use event.button (0: left, 1: middle, 2: right) instead of deprecated event.which

$("html").on("mousedown", function (event: JQuery.MouseDownEvent) {
  if (!g?.initialized || !player) return; // Basic checks

  // Don't process clicks if inventory is shown OR player controls disabled (unless target is GUI?)
  // This might need refinement depending on desired GUI interaction when controls are disabled.
  if (!player.controls?.enabled || inventory?.showInventory) return;

  switch (event.button) { // --- FIX: Use event.button ---
    case 0: // Left click
      player.punch(); // Assume this handles timing/state internally
      // player.click = true; // Original code didn't set this here?
      // player.key.leftClick = Date.now(); // Track click time if needed
      break;
    case 1: // Middle click
      event.preventDefault(); // Prevent default middle-click actions (like auto-scroll)
      player.getBlock(); // Assumes player has getBlock method
      break;
    case 2: // Right click
      // Prevent default context menu
      event.preventDefault();
      player.place = true;
      // Track right click timing if needed by player logic
      player.key.rightClick = Date.now();
      if (!player.key.lastRightClick) player.key.lastRightClick = Date.now();
      break;
    default:
      // Other buttons ignored
      break;
  }
});

$("html").on("mouseup", function (event: JQuery.MouseUpEvent) {
  if (!g?.initialized || !player) return;

  // Mouse up events often need to fire even if controls were disabled during the press
  // Reset state based on which button was released

  switch (event.button) { // --- FIX: Use event.button ---
    case 0: // Left click released
      player.click = false; // Reset click state
      player.key.leftClick = 0; // Reset click time tracking
      break;
    case 1: // Middle click released
      break;
    case 2: // Right click released
      player.place = false; // Reset place state
      player.key.rightClick = 0; // Reset click time tracking
      player.key.lastRightClick = 0;
      break;
    default:
      break;
  }
});

// Separate listeners for when inventory IS shown
$("body").on("mousedown", function (event: JQuery.MouseDownEvent) {
    // Only handle if inventory is explicitly shown
    if (!g?.initialized || !inventory?.showInventory || !player) return;

    // Stop propagation to prevent the "html" listener above from firing if clicking inside inventory area?
    // event.stopPropagation(); // Consider if needed

    switch (event.button) { // --- FIX: Use event.button ---
      case 0: // Left click
        inventory.selectInventory("left", true); // Assume this handles inventory logic
        g.mouseLeft = true; // Update global mouse state
        break;
      case 1: // Middle click
        inventory.selectInventory("middle", true);
        g.mouseMiddle = true;
        break;
      case 2: // Right click
        // Prevent context menu specifically over inventory maybe? Seems handled by global listener already.
        // event.preventDefault();
        inventory.selectInventory("right", true);
        g.mouseRight = true;
        break;
      default:
        break;
    }
  })
  .on("mouseup", function (event: JQuery.MouseUpEvent) {
    // Only handle if inventory is explicitly shown
    if (!g?.initialized || !inventory?.showInventory || !player) return;

    // event.stopPropagation(); // Consider if needed

    switch (event.button) { // --- FIX: Use event.button ---
      case 0: // Left click released
        g.mouseLeft = false;
        inventory.unselect(); // Handle inventory unselect logic
        break;
      case 1: // Middle click released
        g.mouseMiddle = false;
        break;
      case 2: // Right click released
        g.mouseRight = false;
        inventory.unselect();
        break;
      default:
        break;
    }
  });

// Double click listener for inventory
$("body").on("dblclick", function (event: JQuery.DoubleClickEvent) { // Use specific event type
  if (!g?.initialized || !inventory?.showInventory) return;
  // Pass event if needed by selectInventory, otherwise remove param
  inventory.selectInventory("double");
});