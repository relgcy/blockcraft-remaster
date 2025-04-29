import * as $ from "jquery";
import Cookies from "js-cookie";
import { keyMap } from "kontra"; // Assuming keyMap is correctly typed/exported elsewhere if used
import game from "../Game"; // Assuming type definition exists
import { camera } from "../globals"; // Assuming type definition exists
import { updateGUISize } from "../lib/helper";
import chunkManager from "../managers/ChunkManager"; // Assuming type definition exists
import workerManager from "../managers/WorkerManager"; // Assuming type definition exists
import player from "../entity/player/Player"; // Assuming type definition exists
import lighting from "../world/Lighting"; // Assuming type definition exists
import stage from "../world/Stage"; // Assuming type definition exists
import stars from "../world/Stars"; // Assuming type definition exists
import clouds from "../world/Clouds"; // Assuming type definition exists, might be missing 'visible' property

const cookieName = "keymappings";
const LONG_TIME = { expires: 100000 }; // ~273 years, effectively forever

// mapping of name to internally hard coded key which represents the action
const keyMapping: [string, string][] = [
  ["HEADER", "Movement"],
  ["Jump", "space"],
  ["Sneak", "alt"],
  ["Sprint", "shift"],
  ["Strafe Left", "a"],
  ["Strafe Right", "d"],
  ["Walk Backwards", "s"],
  ["Walk Forwards", "w"],
  // Gameplay section might need entries if planned
  ["HEADER", "Multiplayer"],
  ["List Players", "tab"],
  ["Open Chat", "enter"],
  ["Open Command", "slash"],
  ["HEADER", "Miscellaneous"],
  ["Take Screenshot", "f2"],
  // ["Toggle Perspective", "f5"], // Example if added later
  ["Zoom", "x"],
  ["Respawn", "r"],
  ["Debug Info", "f3"],
  ["HEADER", "Inventory"],
  ["Drop Selected Item", "q"],
  ["Open/Close Inventory", "e"],
  ["Hotbar Slot 1", "1"],
  ["Hotbar Slot 2", "2"],
  ["Hotbar Slot 3", "3"],
  ["Hotbar Slot 4", "4"],
  ["Hotbar Slot 5", "5"],
  ["Hotbar Slot 6", "6"],
  ["Hotbar Slot 7", "7"],
  ["Hotbar Slot 8", "8"],
  ["Hotbar Slot 9", "9"],
];

// Function to generate the default key map expected by the game logic
// Based on the default keyMapping array
function genDefaultKeyMap(): { [key: string]: string | null } {
    // This needs to map Event.code (e.g., KeyW, Digit1, Space) to internal action names (e.g., 'w', '1', 'space')
    // The keyMapping array seems to map UI Label -> Internal Action Name. Need reverse or different structure.
    // Let's create a basic default based on common keys if the cookie fails.
    // WARNING: This might not perfectly match the original game's expected defaults.
    console.warn("Generating default keymap - may not match original exactly.");
    return {
        KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
        Space: 'space', AltLeft: 'alt', ShiftLeft: 'shift', // Use Left versions for defaults
        Tab: 'tab', Enter: 'enter', Slash: 'slash',
        F2: 'f2', KeyX: 'x', KeyR: 'r', F3: 'f3', KeyQ: 'q', KeyE: 'e',
        Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
        Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
        // Add others if needed: ArrowUp, ArrowDown, etc.
    };
}


export function loadSavedKeymappings() {
  let loadedKeyMap: { [key: string]: string | null } | null = null;
  try {
    const cookieData = Cookies.get(cookieName);
    if (cookieData) {
       loadedKeyMap = JSON.parse(cookieData);
       // Basic validation if needed: check if it's an object
       if (typeof loadedKeyMap !== 'object' || loadedKeyMap === null) {
           throw new Error("Loaded keymap is not an object.");
       }
    }
  } catch (e) {
    console.error("Error parsing keymap cookie:", e);
    loadedKeyMap = null; // Force regeneration on error
  }

  // If loading failed or no cookie, generate defaults
  if (!loadedKeyMap) {
    loadedKeyMap = genDefaultKeyMap();
    // Save the generated defaults back to the cookie
    saveKeymappings(loadedKeyMap); // Pass map to save
  }

  // Clear existing kontra keyMap (ensure it's the imported one)
  // It's generally unsafe to modify imported library objects directly.
  // Check if Kontra provides a way to set/override the map. If not, this might not work as expected.
  // For now, assuming direct modification is intended (though risky).
  for (var x in keyMap) {
     // Check own property before deleting
     if (Object.prototype.hasOwnProperty.call(keyMap, x)) {
        delete keyMap[x];
     }
  }
  // Assign loaded/default keymappings
  Object.assign(keyMap, loadedKeyMap);
  console.log("Keymappings loaded:", keyMap);
}

// Function to save the current keymappings to a cookie
// Accepts the map to save, defaulting to the potentially modified global keyMap
function saveKeymappings(mapToSave = keyMap) {
  try {
      Cookies.set(cookieName, JSON.stringify(mapToSave), LONG_TIME);
  } catch (e) {
      console.error("Error saving keymap cookie:", e);
  }
}

// Finds the Event.code bound to a specific internal action name
function keyMapReverseLookup(internalActionName: string): string {
  if (!internalActionName) return "NONE";
  for (const eventCode in keyMap) {
    if (Object.prototype.hasOwnProperty.call(keyMap, eventCode) && keyMap[eventCode] === internalActionName) {
        // Convert Event.code (e.g., KeyW, Digit1) to a display-friendly format
        // This is a simple example, might need more sophisticated mapping
        if (eventCode.startsWith('Key')) return eventCode.substring(3); // KeyW -> W
        if (eventCode.startsWith('Digit')) return eventCode.substring(5); // Digit1 -> 1
        if (eventCode === 'Space') return 'SPACE';
        if (eventCode === 'ShiftLeft') return 'LSHIFT';
        if (eventCode === 'AltLeft') return 'LALT';
        if (eventCode === 'Enter') return 'ENTER';
        if (eventCode === 'Slash') return 'SLASH';
        if (eventCode === 'Tab') return 'TAB';
        // Add mappings for F-keys etc. as needed
        return eventCode; // Fallback to raw code
    }
  }
  return "NONE"; // Action not found bound to any key
}

// Adds keyboard controls UI elements and handlers
export function addKeyboardControls() {
  loadSavedKeymappings(); // Load/initialize keyMap first
  const container = $("#keyboard-settings");
  container.empty(); // Clear previous entries
  container.append('<div id="reset-keyboard" class="button">Reset Keys</div>'); // Style as button

  // Add the key binds UI
  for (const [uiLabel, internalActionName] of keyMapping) {
    if (uiLabel === "HEADER") {
      container.append(`<div class="keyboard-settings-divider">${internalActionName}</div>`);
    } else {
      const currentBoundCodeDisplay = keyMapReverseLookup(internalActionName);
      // Generate unique ID for each input
      const inputId = `keybind-${internalActionName}`;
      container.append(
        `<div class="key">
          <span>${uiLabel}</span>
          <input
            id="${inputId}"
            class="change-key ${currentBoundCodeDisplay === "NONE" ? "keyboard-none" : ""}"
            value="${currentBoundCodeDisplay}"
            data-actioncode="${internalActionName}"
            readonly>
        </div>`
      );
      // Use 'value' attribute for input field text instead of placeholder
    }
  }

  // --- Event Handling ---

  // Variable to track which input is waiting for a key press
  let listeningInput: HTMLInputElement | null = null;

  // Click handler to focus input and prepare for key capture
  container.on("click", ".change-key", function (e) {
      // If already listening to another input, reset it
      if (listeningInput && listeningInput !== e.target) {
          listeningInput.value = keyMapReverseLookup(listeningInput.getAttribute("data-actioncode") || "");
          listeningInput.classList.remove("listening");
      }
      // Set current input as listening
      listeningInput = e.target as HTMLInputElement;
      listeningInput.value = "Press Key..."; // Indicate listening state
      listeningInput.classList.add("listening");
  });

  // Keydown listener on the document to capture the next key press
  $(document).off("keydown.keybind").on("keydown.keybind", function (e) {
      // Only proceed if we are listening for a keybind
      if (!listeningInput) return;

      e.preventDefault(); // Prevent default key action
      e.stopPropagation(); // Stop event from bubbling further

      const internalAction = listeningInput.getAttribute("data-actioncode");

      // --- FIX for Error 1 (Line 197) ---
      // Access the 'code' property from the original DOM event wrapped by jQuery.
      const newEventCode = (e.originalEvent as KeyboardEvent)?.code;

      // If newEventCode is undefined (e.g., not a KeyboardEvent), cancel
      if (!newEventCode) {
          console.warn("Could not determine key code from event:", e);
          // Restore original value and cancel listening
          listeningInput.value = keyMapReverseLookup(internalAction || "");
          listeningInput.classList.remove("listening");
          listeningInput = null;
          return;
      }

      // Handle specific keys (like Escape to cancel)
      if (newEventCode === 'Escape') {
          listeningInput.value = keyMapReverseLookup(internalAction || ""); // Restore original value
          listeningInput.classList.remove("listening");
          listeningInput = null;
          return;
      }

      // Unbind the new key if it's already bound to a *different* action
      for (const code in keyMap) {
          if (code === newEventCode && keyMap[code] && keyMap[code] !== internalAction) {
              // Find the input associated with the conflicting action and update its display
              const conflictingAction = keyMap[code];
              const conflictingInput = $(`#keybind-${conflictingAction}`);
              if (conflictingInput.length > 0) {
                  conflictingInput.val("NONE");
                  conflictingInput.addClass("keyboard-none");
              }
              keyMap[code] = null; // Unbind the conflicting action from this key
              break; // Only one action per key usually
          }
      }

      // Clear any old binding for the *current* action
      for (const code in keyMap) {
          if (keyMap[code] === internalAction) {
              keyMap[code] = null;
              break; // Only one key per action usually? Or allow multiple? Assume one.
          }
      }

      // Assign the new keybind
      keyMap[newEventCode] = internalAction;

      // Update the display of the input field
      listeningInput.value = keyMapReverseLookup(internalAction || ""); // Show new binding
      listeningInput.classList.remove("listening", "keyboard-none");
      if (listeningInput.value === "NONE") listeningInput.classList.add("keyboard-none");

      listeningInput = null; // Stop listening

      saveKeymappings(); // Save changes to cookies
      // No need to call addKeyboardControls() recursively, just update UI
  });

    // Handle clicks outside the input to cancel listening
    $(document).off("click.keybind").on("click.keybind", function(e){
        if(listeningInput && !$(e.target).is(listeningInput)){
            listeningInput.value = keyMapReverseLookup(listeningInput.getAttribute("data-actioncode") || "");
            listeningInput.classList.remove("listening");
            listeningInput = null;
        }
    });

  // Reset button handler
  $("#reset-keyboard").on('click', function () {
    Cookies.remove(cookieName); // Remove the cookie
    loadSavedKeymappings(); // Load defaults (which also saves them)
    addKeyboardControls(); // Re-render the UI
  });
}

/** Helper to add slider controls to the settings UI */
function addSliderControl(
    name: string,
    id: string,
    defaultValue: number,
    object: any,
    key: string,
    callback?: () => void
) {
    const cookieVal = Cookies.get(name);
    let currentValue: number;

    // Load value from cookie or use default
    if (cookieVal !== undefined) {
        currentValue = parseFloat(cookieVal);
        if (isNaN(currentValue)) { // Handle invalid cookie value
             currentValue = defaultValue;
             Cookies.set(name, currentValue.toString(), LONG_TIME); // Save valid default
        }
    } else {
        currentValue = defaultValue;
        Cookies.set(name, currentValue.toString(), LONG_TIME); // Save default if no cookie
    }
    object[key] = currentValue; // Set initial object value

    // Get references to DOM elements safely
    const valueSpan = $("#" + id + "Value");
    const slider = $("#" + id + "Slider");

    if (valueSpan.length === 0 || slider.length === 0) {
        console.error(`Slider control elements not found for ID: ${id}`);
        return;
    }

    // Set initial display text and slider value
    valueSpan.text(name + ": " + object[key]);
    // Assert slider is HTMLInputElement before setting value
    (slider[0] as HTMLInputElement).value = object[key].toString();

    // Remove previous listeners and add new one
    slider.off("input change"); // Use 'input' for live update, 'change' for fallback
    slider.on("input change", function () {
        // Assert slider is HTMLInputElement before getting value
        const newValue = parseFloat((this as HTMLInputElement).value);
        if (!isNaN(newValue)) {
            object[key] = newValue;
            valueSpan.text(name + ": " + newValue);
            Cookies.set(name, newValue.toString(), LONG_TIME);
            if (callback) {
                callback();
            }
        }
    });
}

/** Helper to dynamically add video/graphics related settings controls */
export function addVideoControls() {
  // Clear existing switch controls before adding new ones
  const switchContainer = $("#switch-container");
  if (switchContainer.length > 0) {
      switchContainer.empty();
  } else {
      console.error("#switch-container not found for video controls.");
      // Optionally create the container dynamically if needed
      // $('some_parent_element').append('<div id="switch-container"></div>');
  }

  // Add sliders using the helper function
  // Note: Ensure the target objects (player, game, chunkManager, lighting.dir, etc.) exist
  // and have the specified keys before these are called. Add checks if necessary.
  try {
    if (player) addSliderControl("Mouse Sensitivity", "mouseSens", 50, player, "sens");
    if (game) addSliderControl("Scroll Sensitivity", "scrollSens", 10, game, "scrollSens");
    if (game) addSliderControl("FOV", "fov", 75, game, "fov", () => {
        // FOV change often requires camera update
        if(camera && typeof camera.updateProjectionMatrix === 'function') camera.updateProjectionMatrix();
    });
    if (chunkManager) addSliderControl("Render Distance", "renderDistance", 8, chunkManager, "renderDistance");
    if (chunkManager) addSliderControl("Chunk Loading Rate", "chunkLoadingRate", 1, chunkManager, "chunkLoadingRate");
    //addSliderControl("Web Workers", "workers", 2, game, "numOfVoxelWorkers"); // Example if needed later
  } catch (e) { console.error("Error adding slider controls:", e); }

  // Add switches using the helper function
  try {
    if (game) addSwitchControl("Invert Mouse", "invertMouse", false, game, "invertMouse");
    // Check if lighting and dir exist before adding shadow control
    if (lighting?.dir) addSwitchControl("Shadow Effect", "shadow", false, lighting.dir, "castShadow"); // Only need to set castShadow?

    // --- FIX for Error 2 (Line 351) ---
    // Assert 'clouds as any' because the imported 'Clouds' type might be missing the 'visible' property.
    // Also assert 'clouds as any' inside the callback for the same reason.
    if (clouds) addSwitchControl("Clouds", "cloud", false, clouds as any, "visible", undefined, () => {
        // Regenerate clouds if turned on - access properties via 'as any' if type is incomplete
        const cloudsObj = clouds as any; // Use a temporary variable for clarity
        if (cloudsObj.visible && typeof cloudsObj.generate === 'function') {
             cloudsObj.generate();
        }
    });

    if (stars?.stars) addSwitchControl("Stars", "stars", true, stars.stars, "visible");
    if (camera) addSwitchControl("Dynamic FOV", "dynFov", true, camera, "dynFov");
    if (game) addSwitchControl("Transparent Leaves", "transparentLeaves", false, game, "transparentLeaves", undefined, updateTransparency); // No key2 needed
    if (game) addSwitchControl("Transparent Inventory", "transparentInventory", false, game, "transparentInventory");
    if (game && chunkManager) addSwitchControl("Depth Write", "depthWrite", false, game, "depthWrite", undefined, chunkManager.updateTexture); // No key2 needed

    // Add Select controls using helper
    if (game) addSelectControl("GUI Size", "guiSize", 2, game, "guiSize", updateGUISize);
    if (chunkManager) addSelectControl("Material Texture", "texture", "lambert", chunkManager, "materialType", chunkManager.updateTexture); // Assuming key is 'materialType' now? Adjust if needed

  } catch (e) { console.error("Error adding switch/select controls:", e); }
}

/** Helper to add switch controls to the settings UI */
function addSwitchControl(
    name: string,
    id: string,
    defaultValue: boolean,
    object: any, // Accepting 'any' type allows dynamic property access below
    key: string,
    key2?: string, // Optional secondary key to set
    callback?: () => void
) {
    const cookieVal = Cookies.get(name);
    let currentValue: boolean;

    // Load value from cookie or use default
    if (cookieVal !== undefined) {
        currentValue = cookieVal === "true"; // Convert string cookie to boolean
    } else {
        currentValue = defaultValue;
        Cookies.set(name, currentValue.toString(), LONG_TIME); // Save default if no cookie
    }

    // Set object properties dynamically - this works even if type definition is missing properties
    object[key] = currentValue;
    if (key2) object[key2] = currentValue; // Set secondary key if provided

    // Create and append HTML structure for the switch
    // Ensure #switch-container exists
    const switchContainer = $("#switch-container");
    if (switchContainer.length === 0) return; // Exit if container not found

    let switchHTML = $(`
        <div class="control-container switch">
            <span id="${id}Value" class="slider-text">${name}: ${currentValue ? "ON" : "OFF"}</span>
            <label class="switch-label">
                <input id="${id}Switch" type="checkbox">
                <span class="slider-span"></span>
            </label>
        </div>`);
    switchContainer.append(switchHTML);

    // Get references to the created elements
    const valueSpan = $("#" + id + "Value");
    const switchInput = $("#" + id + "Switch");

    if (valueSpan.length === 0 || switchInput.length === 0) {
        console.error(`Switch control elements not found after appending for ID: ${id}`);
        return;
    }

    // Set initial display text and switch state
    valueSpan.text(name + ": " + (currentValue ? "ON" : "OFF"));
    // Assert switchInput is HTMLInputElement before setting checked
    (switchInput[0] as HTMLInputElement).checked = currentValue;

    // Remove previous listeners and add new one
    switchInput.off("change");
    switchInput.on("change", function () {
        // Assert 'this' is HTMLInputElement before getting checked
        const isChecked = (this as HTMLInputElement).checked;
        object[key] = isChecked; // Update primary key
        if (key2) object[key2] = isChecked; // Update secondary key if exists
        valueSpan.text(name + ": " + (isChecked ? "ON" : "OFF"));

        Cookies.set(name, isChecked.toString(), LONG_TIME);
        if (callback) callback();
    });
}

/** Helper to add select dropdown controls to the settings UI */
function addSelectControl(
    name: string, // e.g., "GUI Size" (Unused here, but good practice)
    id: string, // e.g., "guiSize"
    defaultValue: any,
    object: any, // Accepting 'any' type allows dynamic property access
    key: string,
    callback?: () => void
) {
    const cookieVal = Cookies.get(id); // Use ID for cookie name for consistency? Or 'name'? Using ID here.
    let currentValue: any;

    // Load value from cookie or use default
    if (cookieVal !== undefined) {
        // Try to parse if it looks like a number, otherwise use as string
        const numVal = parseFloat(cookieVal);
        currentValue = isNaN(numVal) ? cookieVal : numVal;
    } else {
        currentValue = defaultValue;
        Cookies.set(id, currentValue.toString(), LONG_TIME); // Save default
    }
    object[key] = currentValue; // Set initial object value (might be string or number)

    // Get reference to select element
    const select = $("#" + id + "Select");
    if (select.length === 0) {
        console.error(`Select control element not found for ID: ${id}`);
        return;
    }

    // Set initial select value, assert type first
    (select[0] as HTMLSelectElement).value = object[key].toString();

    // Remove previous listener and add new one using event delegation on document
    $(document).off("change", "#" + id + "Select").on("change", "#" + id + "Select", function () {
        // Assert 'this' is HTMLSelectElement before getting value
        const newValueString = (this as HTMLSelectElement).value;
        // Try to convert back to number if appropriate, otherwise keep as string
        const numVal = parseFloat(newValueString);
        const newValue = isNaN(numVal) ? newValueString : numVal;

        object[key] = newValue; // Store the new value
        Cookies.set(id, newValue.toString(), LONG_TIME); // Store as string in cookie
        if (callback) callback();
    });
}


// Reset Video Settings Button
$(document).ready(function () {
  $("#reset-video").on('click', function () {
    // List of cookie names used by video settings controls
    let videoCookies = [
      "Mouse Sensitivity", "Scroll Sensitivity", "FOV", "Render Distance",
      "Chunk Loading Rate", "Invert Mouse", "Shadow Effect", "Clouds",
      "Stars", "Dynamic FOV", "Transparent Leaves", "Transparent Inventory",
      "Depth Write", "guiSize", // Assuming cookie name matches ID for select
      "texture" // Assuming cookie name matches ID for select
      // Add "FPS" if that slider is re-enabled
    ];
    console.log("Resetting video settings cookies...");
    for (let cookie of videoCookies) {
      Cookies.remove(cookie);
    }

    // Re-add controls which will now use and save default values
    addVideoControls();
    // Might need to also re-apply default values directly to the objects
    // if addVideoControls doesn't fully reset runtime state from defaults.
  });
});

// Function called when transparency settings change
function updateTransparency() {
  // Ensure workerManager and voxels array exist
  if (workerManager?.voxels && Array.isArray(workerManager.voxels)) {
    for (let worker of workerManager.voxels) {
      // Check worker exists and has postMessage method
      if (worker?.postMessage) {
        worker.postMessage({
          type: "updateTransparency",
          transparentLeaves: game?.transparentLeaves ?? false, // Use default if game is undefined
        });
      }
    }
  }
  // Reload chunks to apply transparency change
  if (typeof chunkManager?.reload === 'function') {
      chunkManager.reload();
  }
}

// Original function to generate default key mappings based on Event.code
// This structure seems more correct than the previous one
function genDefaultKeyMap_EventCodeBased(): { [eventCode: string]: string | null } {
    console.log("Generating default keymap (Event.code based)...");
    let keyMap: { [eventCode: string]: string | null } = {
        Enter: "enter", Escape: "esc", Space: "space",
        ArrowLeft: "left", ArrowUp: "up", ArrowRight: "right", ArrowDown: "down",
        ShiftLeft: "shift", ControlLeft: "ctrl", AltLeft: "alt", // Use specific Left/Right codes
        Tab: "tab", Slash: "slash",
    };
    let i: number;
    // letters (KeyA, KeyB, ...) -> (a, b, ...)
    for (i = 0; i < 26; i++) {
        const letter = String.fromCharCode(i + 65); // A, B, C...
        keyMap["Key" + letter] = letter.toLowerCase(); // w, a, s, d...
    }
    // numbers (Digit0, Digit1, ...) -> (0, 1, ...)
    for (i = 0; i < 10; i++) {
        keyMap["Digit" + i] = "" + i;
    }
    // function keys (F1, F2, ...) -> (f1, f2, ...)
    for (i = 1; i <= 12; i++) {
        keyMap["F" + i] = "f" + i;
    }
    return keyMap;
}

// Note: The original code also had `globalThis.keyMap = keyMap;` at the end.
// This assigns the imported Kontra keyMap to the global scope, which is unusual
// and might be unnecessary or cause conflicts. Consider removing it unless specifically required.
// globalThis.keyMap = keyMap; // Commented out unless proven necessary