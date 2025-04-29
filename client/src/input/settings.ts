import * as $ from "jquery";
import Cookies from "js-cookie";
import { keyMap, onKey, keyPressed } from "kontra"; // Assuming onKey, keyPressed are used if needed; keyMap is definitely used.
import game from "../Game";
import { camera } from "../globals";
import { updateGUISize } from "../lib/helper";
import chunkManager from "../managers/ChunkManager";
import workerManager from "../managers/WorkerManager";
import player from "../entity/player/Player";
import lighting from "../world/Lighting";
// import stage from "../world/Stage"; // stage seems unused in the provided functions
import stars from "../world/Stars";
import clouds from "../world/Clouds";

const cookieName = "keymappings";
const LONG_TIME = { expires: 100000 };

// Mapping of UI label to internal action name
const keyMapping: [string, string][] = [
  ["HEADER", "Movement"],
  ["Jump", "space"],
  ["Sneak", "alt"],
  ["Sprint", "shift"],
  ["Strafe Left", "a"],
  ["Strafe Right", "d"],
  ["Walk Backwards", "s"],
  ["Walk Forwards", "w"],
  ["HEADER", "Multiplayer"],
  ["List Players", "tab"],
  ["Open Chat", "enter"],
  ["Open Command", "slash"],
  ["HEADER", "Miscellaneous"],
  ["Take Screenshot", "f2"],
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

// Generates default key map (Event.code -> action name)
function genDefaultKeyMap(): { [key: string]: string | null } {
    console.warn("Generating default keymap - based on common keys.");
    return {
        KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
        Space: 'space', AltLeft: 'alt', ShiftLeft: 'shift',
        Tab: 'tab', Enter: 'enter', Slash: 'slash',
        F2: 'f2', KeyX: 'x', KeyR: 'r', F3: 'f3', KeyQ: 'q', KeyE: 'e',
        Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
        Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
    };
}

// Load saved keymappings from cookies or generate defaults
export function loadSavedKeymappings() {
  let loadedKeyMap: { [key: string]: string | null } | null = null;
  try {
    const cookieData = Cookies.get(cookieName);
    if (cookieData) {
       loadedKeyMap = JSON.parse(cookieData);
       if (typeof loadedKeyMap !== 'object' || loadedKeyMap === null) {
           throw new Error("Loaded keymap is not an object.");
       }
    }
  } catch (e) {
    console.error("Error parsing keymap cookie:", e);
    loadedKeyMap = null;
  }

  if (!loadedKeyMap) {
    loadedKeyMap = genDefaultKeyMap();
    saveKeymappings(loadedKeyMap);
  }

  // Clear existing kontra keyMap (use Object.keys for safety)
  Object.keys(keyMap).forEach(key => {
      delete keyMap[key];
  });
  // Assign loaded/default keymappings
  Object.assign(keyMap, loadedKeyMap);
  console.log("Keymappings loaded:", keyMap);
}

// Save keymappings to cookie
function saveKeymappings(mapToSave = keyMap) {
  try {
      Cookies.set(cookieName, JSON.stringify(mapToSave), LONG_TIME);
  } catch (e) {
      console.error("Error saving keymap cookie:", e);
  }
}

// Look up display key (e.g., 'W') from internal action name (e.g., 'w')
function keyMapReverseLookup(internalActionName: string): string {
  if (!internalActionName) return "NONE";
  for (const eventCode in keyMap) {
    if (Object.prototype.hasOwnProperty.call(keyMap, eventCode) && keyMap[eventCode] === internalActionName) {
        // Simple conversion from Event.code to display name
        if (eventCode.startsWith('Key')) return eventCode.substring(3);
        if (eventCode.startsWith('Digit')) return eventCode.substring(5);
        if (eventCode === 'Space') return 'SPACE';
        if (eventCode === 'ShiftLeft') return 'LSHIFT'; // Or just SHIFT
        if (eventCode === 'AltLeft') return 'LALT';     // Or just ALT
        if (eventCode === 'Enter') return 'ENTER';
        if (eventCode === 'Slash') return 'SLASH';
        if (eventCode === 'Tab') return 'TAB';
        // Add more mappings for F-keys, Numpad, other specific keys if needed
        return eventCode; // Fallback
    }
  }
  return "NONE";
}

// Adds keyboard controls UI elements and handlers
export function addKeyboardControls() {
  loadSavedKeymappings();
  const container = $("#keyboard-settings");
  container.empty();
  container.append('<div id="reset-keyboard" class="button">Reset Keys</div>');

  for (const [uiLabel, internalActionName] of keyMapping) {
    if (uiLabel === "HEADER") {
      container.append(`<div class="keyboard-settings-divider">${internalActionName}</div>`);
    } else {
      const currentBoundCodeDisplay = keyMapReverseLookup(internalActionName);
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
    }
  }

  let listeningInput: HTMLInputElement | null = null;

  container.on("click", ".change-key", function (e) {
      if (listeningInput && listeningInput !== e.target) {
          listeningInput.value = keyMapReverseLookup(listeningInput.getAttribute("data-actioncode") || "");
          listeningInput.classList.remove("listening");
      }
      listeningInput = e.target as HTMLInputElement;
      listeningInput.value = "Press Key...";
      listeningInput.classList.add("listening");
      e.stopPropagation();
  });

   $(document).off("keydown.keybind").on("keydown.keybind", function (e: JQuery.KeyDownEvent) {
      if (!listeningInput) return;

      e.preventDefault();
      e.stopPropagation();

      const keyboardEvent = e.originalEvent as KeyboardEvent;
      if (!keyboardEvent) return;
      const newEventCode = keyboardEvent.code;

      const internalAction = listeningInput.getAttribute("data-actioncode");

      if (newEventCode === 'Escape') {
          listeningInput.value = keyMapReverseLookup(internalAction || "");
          listeningInput.classList.remove("listening");
          listeningInput = null;
          return;
      }
      if (!internalAction) {
          console.error("Missing internal action code for input", listeningInput);
          listeningInput.classList.remove("listening");
          listeningInput = null;
          return;
      }

      for (const code in keyMap) {
          if (code === newEventCode && keyMap[code] && keyMap[code] !== internalAction) {
              const conflictingAction = keyMap[code]!;
              const conflictingInput = $(`#keybind-${conflictingAction}`);
              if (conflictingInput.length > 0) {
                  // Use .val() for jQuery input value setting
                  conflictingInput.val("NONE");
                  conflictingInput.addClass("keyboard-none");
              }
              keyMap[code] = null;
              break;
          }
      }

      for (const code in keyMap) {
          if (keyMap[code] === internalAction) {
              keyMap[code] = null;
              break;
          }
      }

      keyMap[newEventCode] = internalAction;

      listeningInput.value = keyMapReverseLookup(internalAction);
      listeningInput.classList.remove("listening", "keyboard-none");
      if (listeningInput.value === "NONE") listeningInput.classList.add("keyboard-none");

      listeningInput = null;

      saveKeymappings();
  });

  $(document).off("click.keybindCancel").on("click.keybindCancel", function(e){
      if(listeningInput && !$(e.target).is(listeningInput)){
          listeningInput.value = keyMapReverseLookup(listeningInput.getAttribute("data-actioncode") || "");
          listeningInput.classList.remove("listening");
          listeningInput = null;
      }
  });


  $("#reset-keyboard").off('click').on('click', function () {
    Cookies.remove(cookieName);
    loadSavedKeymappings();
    addKeyboardControls();
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

    if (cookieVal !== undefined) {
        currentValue = parseFloat(cookieVal);
        if (isNaN(currentValue)) {
             currentValue = defaultValue;
             Cookies.set(name, currentValue.toString(), LONG_TIME);
        }
    } else {
        currentValue = defaultValue;
        Cookies.set(name, currentValue.toString(), LONG_TIME);
    }
    object[key] = currentValue;

    const valueSpan = $("#" + id + "Value");
    const slider = $("#" + id + "Slider"); // This is a jQuery object

    if (valueSpan.length === 0 || slider.length === 0) {
        console.error(`Slider control elements not found for ID: ${id}`);
        return;
    }

    valueSpan.text(name + ": " + object[key]);

    // --- FIX for line 136: Assert slider[0] (the DOM element) is HTMLInputElement ---
    const sliderElement = slider[0] as HTMLInputElement | undefined;
    if (sliderElement) {
        sliderElement.value = object[key].toString();
    }
    // --- End Fix ---

    slider.off("input change");
    slider.on("input change", function () { // 'this' refers to the DOM element here
        // --- FIX for line 139: Assert 'this' is HTMLInputElement ---
        const newValue = parseFloat((this as HTMLInputElement).value);
        // --- End Fix ---
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
  const switchContainer = $("#switch-container");
  if (switchContainer.length > 0) {
      switchContainer.empty();
  } else {
      console.error("#switch-container not found for video controls.");
  }

  try {
    if (player) addSliderControl("Mouse Sensitivity", "mouseSens", 50, player, "sens");
    if (game) addSliderControl("Scroll Sensitivity", "scrollSens", 10, game, "scrollSens");
    if (game) addSliderControl("FOV", "fov", 75, game, "fov", () => {
        if(camera && typeof camera.updateProjectionMatrix === 'function') camera.updateProjectionMatrix();
    });
    if (chunkManager) addSliderControl("Render Distance", "renderDistance", 8, chunkManager, "renderDistance");
    if (chunkManager) addSliderControl("Chunk Loading Rate", "chunkLoadingRate", 1, chunkManager, "chunkLoadingRate");
  } catch (e) { console.error("Error adding slider controls:", e); }

  try {
    if (game) addSwitchControl("Invert Mouse", "invertMouse", false, game, "invertMouse");
    if (lighting?.dir) addSwitchControl("Shadow Effect", "shadow", false, lighting.dir, "castShadow");
    // Add 'as any' assertion if 'clouds' type definition is missing 'visible' property
    if (clouds) addSwitchControl("Clouds", "cloud", false, clouds as any, "visible", undefined, () => {
        const cloudsObj = clouds as any;
        if (cloudsObj.visible && typeof cloudsObj.generate === 'function') cloudsObj.generate();
    });
    if (stars?.stars) addSwitchControl("Stars", "stars", true, stars.stars, "visible");
    if (camera) addSwitchControl("Dynamic FOV", "dynFov", true, camera, "dynFov");
    if (game) addSwitchControl("Transparent Leaves", "transparentLeaves", false, game, "transparentLeaves", undefined, updateTransparency);
    if (game) addSwitchControl("Transparent Inventory", "transparentInventory", false, game, "transparentInventory");
    // Use optional chaining for chunkManager just in case
    if (game) addSwitchControl("Depth Write", "depthWrite", false, game, "depthWrite", undefined, chunkManager?.updateTexture);

    if (game) addSelectControl("GUI Size", "guiSize", 2, game, "guiSize", updateGUISize);
    if (chunkManager) addSelectControl("Material Texture", "texture", "lambert", chunkManager, "materialType", chunkManager.updateTexture);

  } catch (e) { console.error("Error adding switch/select controls:", e); }
}

/** Helper to add switch controls to the settings UI */
function addSwitchControl(
    name: string,
    id: string,
    defaultValue: boolean,
    object: any,
    key: string,
    key2?: string,
    callback?: () => void
) {
    const cookieVal = Cookies.get(name);
    let currentValue: boolean;

    if (cookieVal !== undefined) {
        currentValue = cookieVal === "true";
    } else {
        currentValue = defaultValue;
        Cookies.set(name, currentValue.toString(), LONG_TIME);
    }
    object[key] = currentValue;
    if (key2) object[key2] = currentValue;

    const switchContainer = $("#switch-container");
    if (switchContainer.length === 0) return;

    // Use template literals correctly
    const switchHTML = $(`
        <div class="control-container switch">
            <span id="${id}Value" class="slider-text">${name}: ${currentValue ? "ON" : "OFF"}</span>
            <label class="switch-label">
                <input id="${id}Switch" type="checkbox">
                <span class="slider-span"></span>
            </label>
        </div>`);
    switchContainer.append(switchHTML);

    const valueSpan = $("#" + id + "Value");
    const switchInput = $("#" + id + "Switch"); // This is a jQuery object

    if (valueSpan.length === 0 || switchInput.length === 0) {
        console.error(`Switch control elements not found after appending for ID: ${id}`);
        return;
    }

    valueSpan.text(name + ": " + (currentValue ? "ON" : "OFF"));
    // --- FIX for line 192: Assert switchInput[0] (DOM element) is HTMLInputElement ---
    const switchElement = switchInput[0] as HTMLInputElement | undefined;
    if (switchElement) {
        switchElement.checked = currentValue;
    }
    // --- End Fix ---

    switchInput.off("change");
    switchInput.on("change", function () { // 'this' refers to the DOM element here
        // --- FIX for line 195: Assert 'this' is HTMLInputElement ---
        const isChecked = (this as HTMLInputElement).checked;
        // --- End Fix ---
        object[key] = isChecked;
        if (key2) object[key2] = isChecked;
        valueSpan.text(name + ": " + (isChecked ? "ON" : "OFF"));

        Cookies.set(name, isChecked.toString(), LONG_TIME);
        if (callback) callback();
    });
}

/** Helper to add select dropdown controls to the settings UI */
function addSelectControl(
    name: string,
    id: string,
    defaultValue: any,
    object: any,
    key: string,
    callback?: () => void
) {
    const cookieVal = Cookies.get(id);
    let currentValue: any;

    if (cookieVal !== undefined) {
        const numVal = parseFloat(cookieVal);
        currentValue = isNaN(numVal) ? cookieVal : numVal;
    } else {
        currentValue = defaultValue;
        Cookies.set(id, currentValue.toString(), LONG_TIME);
    }
    object[key] = currentValue;

    const select = $("#" + id + "Select"); // jQuery object
    if (select.length === 0) {
        console.error(`Select control element not found for ID: ${id}`);
        return;
    }

    // --- FIX for line 211: Assert select[0] (DOM element) is HTMLSelectElement ---
    const selectElement = select[0] as HTMLSelectElement | undefined;
    if (selectElement) {
        selectElement.value = object[key].toString();
    }
    // --- End Fix ---

    // Use event delegation on a static parent or document if elements are dynamically added/removed often
    // Or ensure listener is attached after element creation if using direct binding like below
    select.off("change"); // Direct binding might be fine if #settings exists on load
    select.on("change", function () { // 'this' is the DOM element
        // --- FIX for line 213: Assert 'this' is HTMLSelectElement ---
        const newValueString = (this as HTMLSelectElement).value;
        // --- End Fix ---
        const numVal = parseFloat(newValueString);
        const newValue = isNaN(numVal) ? newValueString : numVal;

        object[key] = newValue;
        Cookies.set(id, newValue.toString(), LONG_TIME);
        if (callback) callback();
    });
}


// Reset Video Settings Button
$(document).ready(function () {
  $("#reset-video").off('click').on('click', function () { // Ensure only one click handler
    let videoCookies = [
      "Mouse Sensitivity", "Scroll Sensitivity", "FOV", "Render Distance",
      "Chunk Loading Rate", "Invert Mouse", "Shadow Effect", "Clouds",
      "Stars", "Dynamic FOV", "Transparent Leaves", "Transparent Inventory",
      "Depth Write", "guiSize",
      "texture"
    ];
    console.log("Resetting video settings cookies...");
    for (let cookie of videoCookies) {
      Cookies.remove(cookie);
    }
    // Re-render controls which will load+save defaults
    addVideoControls();
  });
});

// Function called when transparency settings change
function updateTransparency() {
  // Use optional chaining for safety
  if (workerManager?.voxels && Array.isArray(workerManager.voxels)) {
    for (let worker of workerManager.voxels) {
      if (worker?.postMessage) {
        worker.postMessage({
          type: "updateTransparency",
          transparentLeaves: game?.transparentLeaves ?? false,
        });
      }
    }
  }
  chunkManager?.reload?.(); // Use optional chaining for reload call
}

// Function to generate default key mappings based on Event.code (unused but kept for reference)
/* function genDefaultKeyMap_EventCodeBased(): { [eventCode: string]: string | null } {
    console.log("Generating default keymap (Event.code based)...");
    // ... implementation ...
    return keyMap;
} */