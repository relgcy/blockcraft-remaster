import * as THREE from "three";
import skinManager from "../managers/SkinManager";
import game from "../Game"; // Assuming 'game' provides debug status, etc.

// --- Global Variable Assumption ---
// This file assumes 'world' and 'player' (likely passed as 'p') exist in the global scope
// or are otherwise accessible when these static methods are called.
// NOTE: Accessing 'world.blockSize' directly from client-side graphics code
// is problematic if 'world' represents server-side state and may cause errors.

class PlayerMesh {
  static initPlayerMesh(p) {
    PlayerMesh.addPlayerMesh(p);
    PlayerMesh.addSkeleton(p);
    PlayerMesh.setPlayerArmor(p);
  }

  static addMesh(geometry, material) {
    let mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  static clearPlayerArmor(p) {
    if (!p?.armorMesh) return; // Add safety check
    for (let type in p.armorMesh) {
        // Check own property and if mesh exists
        if (Object.prototype.hasOwnProperty.call(p.armorMesh, type) && p.armorMesh[type]) {
            p.armorMesh[type].visible = false;
        }
    }
  }

  static updateArmor(p, p_) {
    if (!p?.armor || !p_?.armor) return; // Add safety check

    let needsUpdate = false;

    for (let type in p_.armor) {
      // Check own property to avoid iterating prototype chain
      if (Object.prototype.hasOwnProperty.call(p_.armor, type)) {
          if (p.armor[type] !== p_.armor[type]) {
            p.armor[type] = p_.armor[type];
            needsUpdate = true;
          }
      }
    }

    if (needsUpdate) PlayerMesh.setPlayerArmor(p);
  }

  static setPlayerArmor(p) {
    if (!p?.armor || !p?.armorMesh || !skinManager) return; // Add safety check

    PlayerMesh.clearPlayerArmor(p);

    // Use optional chaining for safer access in case armor types are missing
    const helmetType = skinManager.armorOrder?.[p.armor.helmet];
    const chestplateType = skinManager.armorOrder?.[p.armor.chestplate];
    const leggingsType = skinManager.armorOrder?.[p.armor.leggings];
    const bootsType = skinManager.armorOrder?.[p.armor.boots];

    try { // Add try-catch for safety when accessing potentially unloaded skins/armor
        if (helmetType && p.armorMesh.helmet) {
            p.armorMesh.helmet.visible = true;
            p.armorMesh.helmet.material = skinManager.getArmor(helmetType).head;
        }

        if (chestplateType) {
            if (p.armorMesh.chestplate) {
                p.armorMesh.chestplate.visible = true;
                p.armorMesh.chestplate.material = skinManager.getArmor(chestplateType).body;
            }
            if (p.armorMesh.leftArm) {
                p.armorMesh.leftArm.visible = true;
                p.armorMesh.leftArm.material = skinManager.getArmor(chestplateType).armPlates;
            }
            if (p.armorMesh.rightArm) {
                p.armorMesh.rightArm.visible = true;
                p.armorMesh.rightArm.material = skinManager.getArmor(chestplateType).armPlates;
            }
        }

        if (leggingsType) {
             if (p.armorMesh.leggingsTop) {
                p.armorMesh.leggingsTop.visible = true;
                p.armorMesh.leggingsTop.material = skinManager.getArmor(leggingsType).leggingsTop;
             }
             if (p.armorMesh.leftLeggings) {
                p.armorMesh.leftLeggings.visible = true;
                p.armorMesh.leftLeggings.material = skinManager.getArmor(leggingsType).leggings;
             }
             if (p.armorMesh.rightLeggings) {
                p.armorMesh.rightLeggings.visible = true;
                p.armorMesh.rightLeggings.material = skinManager.getArmor(leggingsType).leggings;
             }
        }

        if (bootsType) {
            if (p.armorMesh.leftBoots) {
                p.armorMesh.leftBoots.visible = true;
                p.armorMesh.leftBoots.material = skinManager.getArmor(bootsType).boots;
            }
            if (p.armorMesh.rightBoots) {
                p.armorMesh.rightBoots.visible = true;
                p.armorMesh.rightBoots.material = skinManager.getArmor(bootsType).boots;
            }
        }
    } catch (error) {
        console.error("Error setting player armor visuals:", error);
    }
  }

  static addHead(p) {
    // Rely on global 'world' and 'player' (passed as 'p')
    // Add checks to prevent errors if they are not available at runtime
    if (typeof world === 'undefined' || !world || !player?.dim || !skinManager || !p) {
         console.error("Cannot add head: Missing world, player.dim, skinManager, or player data (p).");
         return;
    }

    const { blockSize } = world; // Relies on global 'world'
    const playerMat = skinManager.getSkin(p.skin || "steve");
    const helmetMat = skinManager.getArmor("diamond").head; // Default/placeholder armor mat
    const dim = player.dim;

    // --- THREE.JS UPDATE ---
    // Changed BoxBufferGeometry to BoxGeometry
    p.mesh.head = PlayerMesh.addMesh(new THREE.BoxGeometry(dim.headSize, dim.headSize, dim.headSize), playerMat.head);
    p.armorMesh.helmet = PlayerMesh.addMesh(new THREE.BoxGeometry(dim.headSize + 1, dim.headSize + 1, dim.headSize + 1), helmetMat);

    p.head = new THREE.Group();
    p.head.add(p.mesh.head, p.armorMesh.helmet);
    // Use blockSize safely
    p.head.position.set(0, (blockSize ?? 16) * 0.25, 0);

    p.headPivot = new THREE.Group();
    p.headPivot.add(p.head);

    p.neck = new THREE.Object3D();
    p.neck.add(p.headPivot);

    p.neck.position.set(0, -(blockSize ?? 16) * 0.075, 0);
  }

  static addTorso(p) {
    if (typeof world === 'undefined' || !world || !player?.dim || !skinManager || !p) {
         console.error("Cannot add torso: Missing world, player.dim, skinManager, or player data (p).");
         return;
    }

    const { blockSize } = world;
    const playerMat = skinManager.getSkin(p.skin || "steve");
    const chestplateMat = skinManager.getArmor("diamond").body;
    const leggingsMath = skinManager.getArmor("diamond").leggingsTop;
    const dim = player.dim;

    // --- THREE.JS UPDATE ---
    // Changed BoxBufferGeometry to BoxGeometry
    p.mesh.torso = PlayerMesh.addMesh(new THREE.BoxGeometry(dim.torso, dim.torsoHeight, dim.legSize), playerMat.body);
    p.armorMesh.chestplate = PlayerMesh.addMesh(
      new THREE.BoxGeometry(dim.torso + 1, dim.torsoHeight + 1, dim.legSize + 1),
      chestplateMat
    );
    p.armorMesh.leggingsTop = PlayerMesh.addMesh(
      new THREE.BoxGeometry(dim.torso + 0.5, (dim.torsoHeight * 5) / 12, dim.legSize + 0.5),
      leggingsMath
    );
    // Position adjustments need valid dimensions
    if (dim.torsoHeight) {
       p.armorMesh.leggingsTop.position.y -= (dim.torsoHeight * (1 - 5 / 12)) / 2 + 1;
    }


    // Add body
    p.torso = new THREE.Group();
    p.torso.add(p.mesh.torso, p.armorMesh.chestplate, p.armorMesh.leggingsTop);

    p.torso.position.set(0, -(blockSize ?? 16) * 0.45, 0);
  }

  static addArms(p) {
     if (typeof world === 'undefined' || !world || !player?.dim || !skinManager || !p) {
         console.error("Cannot add arms: Missing world, player.dim, skinManager, or player data (p).");
         return;
    }

    const { blockSize } = world;
    const playerMat = skinManager.getSkin(p.skin || "steve");
    const armMat = skinManager.getArmor("diamond").armPlates;
    const dim = player.dim;

    const armSize = p.skin === "alex" ? dim.armSizeSlim : dim.armSize;
    const leftShoulderOffset = p.skin === "alex" ? -5.45 : dim.armSize * -1.5;
    const rightShoulderOffset = p.skin === "alex" ? -0.55 : dim.armSize * 1.5;

    // --- THREE.JS UPDATE ---
    // Changed BoxBufferGeometry to BoxGeometry
    p.mesh.arm = PlayerMesh.addMesh(new THREE.BoxGeometry(armSize, dim.armHeight, dim.armSize), playerMat.arm);
    let armPlatesMesh = PlayerMesh.addMesh(new THREE.BoxGeometry(armSize + 1, (dim.armHeight * 5) / 12, armSize + 1), armMat);

    // Position adjustments need valid dimensions
    if (dim.armHeight) {
        armPlatesMesh.position.y += (dim.armHeight * (1 - 5 / 12)) / 2 + 1;
    }

    p.armorMesh.leftArm = armPlatesMesh.clone();
    p.armorMesh.leftArm.rotation.y += Math.PI;
    p.leftArm = new THREE.Group();
    p.leftArm.add(p.mesh.arm, p.armorMesh.leftArm);

    p.armorMesh.rightArm = armPlatesMesh.clone();
    p.rightArm = new THREE.Group();
    p.rightArm.add(p.mesh.arm.clone(), p.armorMesh.rightArm);

    // Shoulder joints
    p.leftShoulderJoint = new THREE.Object3D();
    p.leftShoulderJoint.add(p.leftArm);
    p.leftShoulderJoint.position.set(0, -(blockSize ?? 16) * 0.3, 0);

    p.leftShoulder = new THREE.Object3D();
    p.leftShoulder.position.set(leftShoulderOffset, -(blockSize ?? 16) * 0.15, 0);
    p.leftShoulder.add(p.leftShoulderJoint);

    p.rightShoulderJoint = new THREE.Object3D();
    p.rightShoulderJoint.add(p.rightArm);
    p.rightShoulderJoint.position.set(0, -(blockSize ?? 16) * 0.3, 0);

    p.rightShoulder = new THREE.Object3D();
    p.rightShoulder.position.set(rightShoulderOffset, -(blockSize ?? 16) * 0.15, 0);
    p.rightShoulder.add(p.rightShoulderJoint);
  }

  static addLegs(p) {
     if (typeof world === 'undefined' || !world || !player?.dim || !skinManager || !p) {
         console.error("Cannot add legs: Missing world, player.dim, skinManager, or player data (p).");
         return;
    }

    const { blockSize } = world;
    const playerMat = skinManager.getSkin(p.skin || "steve");
    const leggingsMat = skinManager.getArmor("diamond").leggings;
    const bootsMat = skinManager.getArmor("diamond").boots;
    const dim = player.dim;

    // --- THREE.JS UPDATE ---
    // Changed BoxBufferGeometry to BoxGeometry
    p.mesh.leg = PlayerMesh.addMesh(new THREE.BoxGeometry(dim.legSize, dim.legHeight, dim.legSize), playerMat.leg);
    let leggingsMesh = PlayerMesh.addMesh(
      new THREE.BoxGeometry(dim.legSize + 0.5, dim.legHeight * 0.75, dim.legSize + 0.5),
      leggingsMat
    );
    let bootsMesh = PlayerMesh.addMesh(new THREE.BoxGeometry(dim.legSize + 1, dim.legHeight * 0.5, dim.legSize + 1), bootsMat);

    // Position adjustments need valid dimensions
    if (dim.legHeight) {
        leggingsMesh.position.y += dim.legHeight * 0.125;
        bootsMesh.position.y -= dim.legHeight * 0.3;
    }

    p.armorMesh.leftLeggings = leggingsMesh.clone();
    p.armorMesh.leftBoots = bootsMesh.clone();
    p.leftLeg = new THREE.Group();
    p.leftLeg.add(p.mesh.leg, p.armorMesh.leftLeggings, p.armorMesh.leftBoots);

    p.armorMesh.rightLeggings = leggingsMesh.clone();
    p.armorMesh.rightBoots = bootsMesh.clone();
    p.rightLeg = new THREE.Group();
    p.rightLeg.add(p.mesh.leg.clone(), p.armorMesh.rightLeggings, p.armorMesh.rightBoots);

    p.leftHip = new THREE.Object3D();
    p.leftHip.add(p.leftLeg);
    p.rightHip = new THREE.Object3D();
    p.rightHip.add(p.rightLeg);

    const baseHipY = -(blockSize ?? 16) * 0.45 - (blockSize ?? 16) * 0.75;
    // Use dim.legSize safely
    const legSize = dim.legSize ?? 4; // Provide a default if undefined
    p.leftHip.position.set(-legSize * 0.5, baseHipY, 0);
    p.rightHip.position.set(legSize * 0.5, baseHipY, 0);
  }

  static addSkeleton(p) {
    // Assume 'game' is accessible globally or imported via 'import game from "../Game";'
    if (!p || typeof game === 'undefined' || !game) {
         console.error("Cannot add skeleton: Missing player data (p) or game object.");
         return;
    }

    // Create skeleton of head, body, arms, and legs
    p.skeleton = new THREE.Group();
    p.body = new THREE.Group(); // Group containing torso and limbs

    // Add parts only if they exist
    if (p.torso) p.body.add(p.torso);
    if (p.leftShoulder) p.body.add(p.leftShoulder);
    if (p.rightShoulder) p.body.add(p.rightShoulder);
    if (p.leftHip) p.body.add(p.leftHip);
    if (p.rightHip) p.body.add(p.rightHip);

    p.skeleton.add(p.body);

    if (p.neck) p.skeleton.add(p.neck); // Add neck if it exists
    p.skeleton.name = p.id ?? 'player-skeleton'; // Use ID if available

    // Bounding Box Helper
    p.bbox = new THREE.Group(); // Use Group for potential future additions
    try { // Creating BoxHelper can fail if skeleton has no geometry yet
        let bboxHelper = new THREE.BoxHelper(p.skeleton, 0xffff00);
        if (p.skin === "alex") bboxHelper.position.x = 1.4; // Specific adjustment for Alex skin
        bboxHelper.matrixAutoUpdate = true; // Default is true, but explicit
        bboxHelper.visible = game.debug || false; // Use game global
        bboxHelper.name = "bbox";
        p.bbox.add(bboxHelper);
    } catch(e) {
        console.warn("Could not create BoxHelper for player skeleton:", e);
    }

    p.skeleton.add(p.bbox);
  }

  static addPlayerMesh(p) {
    if (!p) return; // Add safety check
    p.mesh = {}; // Initialize mesh parts object
    p.armorMesh = {}; // Initialize armor parts object

    // Call functions to add parts, they have internal safety checks now
    PlayerMesh.addHead(p);
    PlayerMesh.addTorso(p);
    PlayerMesh.addArms(p);
    PlayerMesh.addLegs(p);
  }
}

export default PlayerMesh;