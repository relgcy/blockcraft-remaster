import * as THREE from "three";
import skinManager from "../managers/SkinManager";
import game from "../Game";
// Assuming 'world' and 'player' (for player.dim) are accessible, possibly via game or globals
// If not, they might need explicit imports like 'world' was needed in KeyboardInput.ts
// Example: import world from "../world/WorldManager";
// Example: import player from "../entity/player/Player"; // If accessing a global player template for dims

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
    for (let type in p.armorMesh) {
      p.armorMesh[type].visible = false;
    }
  }

  static updateArmor(p, p_) {
    let needsUpdate = false;

    for (let type in p_.armor) {
      if (p.armor[type] !== p_.armor[type]) {
        p.armor[type] = p_.armor[type];
        needsUpdate = true;
      }
    }

    if (needsUpdate) PlayerMesh.setPlayerArmor(p);
  }

  static setPlayerArmor(p) {
    PlayerMesh.clearPlayerArmor(p);

    let helmetType = skinManager.armorOrder[p.armor.helmet];
    let chestplateType = skinManager.armorOrder[p.armor.chestplate];
    let leggingsType = skinManager.armorOrder[p.armor.leggings];
    let bootsType = skinManager.armorOrder[p.armor.boots];

    if (helmetType) {
      p.armorMesh.helmet.visible = true;
      p.armorMesh.helmet.material = skinManager.getArmor(helmetType).head;
    }

    if (chestplateType) {
      p.armorMesh.chestplate.visible = true;
      p.armorMesh.chestplate.material = skinManager.getArmor(chestplateType).body;
      p.armorMesh.leftArm.visible = true;
      p.armorMesh.rightArm.visible = true;
      p.armorMesh.leftArm.material = skinManager.getArmor(chestplateType).armPlates;
      p.armorMesh.rightArm.material = skinManager.getArmor(chestplateType).armPlates;
    }

    if (leggingsType) {
      p.armorMesh.leggingsTop.visible = true;
      p.armorMesh.leggingsTop.material = skinManager.getArmor(leggingsType).leggingsTop;
      p.armorMesh.leftLeggings.visible = true;
      p.armorMesh.rightLeggings.visible = true;
      p.armorMesh.leftLeggings.material = skinManager.getArmor(leggingsType).leggings;
      p.armorMesh.rightLeggings.material = skinManager.getArmor(leggingsType).leggings;
    }

    if (bootsType) {
      p.armorMesh.leftBoots.visible = true;
      p.armorMesh.leftBoots.material = skinManager.getArmor(bootsType).boots;
      p.armorMesh.rightBoots.visible = true;
      p.armorMesh.rightBoots.material = skinManager.getArmor(bootsType).boots;
    }
  }

  static addHead(p) {
    // Assuming 'world' and 'player' (for dim) are accessible globally or via imports
    let blockSize = world?.blockSize || 16; // Use default if world is undefined
    let playerDim = player?.dim || { headSize: 8 }; // Use default if player or dim is undefined

    let playerMat = skinManager.getSkin(p.skin || "steve");
    let helmetMat = skinManager.getArmor("diamond").head; // Consider default/error handling

    // Use BoxGeometry instead of BoxBufferGeometry
    p.mesh.head = PlayerMesh.addMesh(new THREE.BoxGeometry(playerDim.headSize, playerDim.headSize, playerDim.headSize), playerMat.head);
    p.armorMesh.helmet = PlayerMesh.addMesh(new THREE.BoxGeometry(playerDim.headSize + 1, playerDim.headSize + 1, playerDim.headSize + 1), helmetMat);

    p.head = new THREE.Group();
    p.head.add(p.mesh.head, p.armorMesh.helmet);
    p.head.position.set(0, blockSize * 0.25, 0);

    p.headPivot = new THREE.Group();
    p.headPivot.add(p.head);

    p.neck = new THREE.Object3D();
    p.neck.add(p.headPivot);

    p.neck.position.set(0, -blockSize * 0.075, 0);
  }

  static addTorso(p) {
    let blockSize = world?.blockSize || 16;
    let playerDim = player?.dim || { torso: 8, torsoHeight: 12, legSize: 4 }; // Use defaults

    let playerMat = skinManager.getSkin(p.skin || "steve");
    let chestplateMat = skinManager.getArmor("diamond").body;
    let leggingsMath = skinManager.getArmor("diamond").leggingsTop;

    // Use BoxGeometry instead of BoxBufferGeometry
    p.mesh.torso = PlayerMesh.addMesh(new THREE.BoxGeometry(playerDim.torso, playerDim.torsoHeight, playerDim.legSize), playerMat.body);
    p.armorMesh.chestplate = PlayerMesh.addMesh(
      new THREE.BoxGeometry(playerDim.torso + 1, playerDim.torsoHeight + 1, playerDim.legSize + 1),
      chestplateMat
    );
    p.armorMesh.leggingsTop = PlayerMesh.addMesh(
      new THREE.BoxGeometry(playerDim.torso + 0.5, (playerDim.torsoHeight * 5) / 12, playerDim.legSize + 0.5),
      leggingsMath
    );
    p.armorMesh.leggingsTop.position.y -= (playerDim.torsoHeight * (1 - 5 / 12)) / 2 + 1;

    // Add body
    p.torso = new THREE.Group();
    p.torso.add(p.mesh.torso, p.armorMesh.chestplate, p.armorMesh.leggingsTop);

    p.torso.position.set(0, -blockSize * 0.45, 0);
  }

  static addArms(p) {
    let blockSize = world?.blockSize || 16;
    let playerDim = player?.dim || { armSize: 4, armHeight: 12, armSizeSlim: 3 }; // Use defaults

    let playerMat = skinManager.getSkin(p.skin || "steve");
    let armMat = skinManager.getArmor("diamond").armPlates;

    const armSize = p.skin == "alex" ? playerDim.armSizeSlim : playerDim.armSize;
    const leftShoulderOffset = p.skin == "alex" ? -5.45 : -armSize * 1.5; // Simplified expression
    const rightShoulderOffset = p.skin == "alex" ? -0.55 : armSize * 1.5; // Simplified expression

    // Use BoxGeometry instead of BoxBufferGeometry
    p.mesh.arm = PlayerMesh.addMesh(new THREE.BoxGeometry(armSize, playerDim.armHeight, armSize), playerMat.arm);
    let armPlatesMesh = PlayerMesh.addMesh(new THREE.BoxGeometry(armSize + 1, (playerDim.armHeight * 5) / 12, armSize + 1), armMat);
    armPlatesMesh.position.add(new THREE.Vector3().random().multiplyScalar(0.01)); // Small offset to prevent z-fighting?
    armPlatesMesh.position.y += (playerDim.armHeight * (1 - 5 / 12)) / 2 + 1;

    p.armorMesh.leftArm = armPlatesMesh.clone();
    p.armorMesh.leftArm.rotation.y += Math.PI; // Should this be here? Maybe on the group?
    p.leftArm = new THREE.Group();
    p.leftArm.add(p.mesh.arm, p.armorMesh.leftArm);

    p.armorMesh.rightArm = armPlatesMesh.clone();
    p.rightArm = new THREE.Group();
    p.rightArm.add(p.mesh.arm.clone(), p.armorMesh.rightArm);

    // Shoulder joints
    p.leftShoulderJoint = new THREE.Object3D();
    p.leftShoulderJoint.add(p.leftArm);
    // Position relative to shoulder pivot
    p.leftShoulderJoint.position.set(0, -playerDim.armHeight / 2, 0); // Centered vertically? Adjusted assumption

    p.leftShoulder = new THREE.Object3D();
    p.leftShoulder.position.set(leftShoulderOffset, -blockSize * 0.15, 0); // Keep original shoulder position
    p.leftShoulder.add(p.leftShoulderJoint);

    p.rightShoulderJoint = new THREE.Object3D();
    p.rightShoulderJoint.add(p.rightArm);
     // Position relative to shoulder pivot
    p.rightShoulderJoint.position.set(0, -playerDim.armHeight / 2, 0); // Centered vertically? Adjusted assumption

    p.rightShoulder = new THREE.Object3D();
    p.rightShoulder.position.set(rightShoulderOffset, -blockSize * 0.15, 0); // Keep original shoulder position
    p.rightShoulder.add(p.rightShoulderJoint);
  }

  static addLegs(p) {
     let blockSize = world?.blockSize || 16;
     let playerDim = player?.dim || { legSize: 4, legHeight: 12 }; // Use defaults

    let playerMat = skinManager.getSkin(p.skin || "steve");
    let leggingsMat = skinManager.getArmor("diamond").leggings;
    let bootsMat = skinManager.getArmor("diamond").boots;

    // Use BoxGeometry instead of BoxBufferGeometry
    p.mesh.leg = PlayerMesh.addMesh(new THREE.BoxGeometry(playerDim.legSize, playerDim.legHeight, playerDim.legSize), playerMat.leg);
    let leggingsMesh = PlayerMesh.addMesh(
      new THREE.BoxGeometry(playerDim.legSize + 0.5, playerDim.legHeight * 0.75, playerDim.legSize + 0.5),
      leggingsMat
    );
    let bootsMesh = PlayerMesh.addMesh(new THREE.BoxGeometry(playerDim.legSize + 1, playerDim.legHeight * 0.5, playerDim.legSize + 1), bootsMat);
    leggingsMesh.position.add(new THREE.Vector3().random().multiplyScalar(0.01)); // Prevent z-fighting?
    bootsMesh.position.add(new THREE.Vector3().random().multiplyScalar(0.01)); // Prevent z-fighting?
    leggingsMesh.position.y += playerDim.legHeight * 0.125; // Position leggings slightly up
    bootsMesh.position.y -= playerDim.legHeight * 0.25; // Position boots slightly down (original had 0.3, adjusting based on size 0.5)

    p.armorMesh.leftLeggings = leggingsMesh.clone();
    p.armorMesh.leftBoots = bootsMesh.clone();
    p.leftLeg = new THREE.Group();
    // Position relative to hip pivot
    p.leftLeg.position.set(0, -playerDim.legHeight / 2, 0); // Centered vertically?
    p.leftLeg.add(p.mesh.leg, p.armorMesh.leftLeggings, p.armorMesh.leftBoots);


    p.armorMesh.rightLeggings = leggingsMesh.clone();
    p.armorMesh.rightBoots = bootsMesh.clone();
    p.rightLeg = new THREE.Group();
    // Position relative to hip pivot
    p.rightLeg.position.set(0, -playerDim.legHeight / 2, 0); // Centered vertically?
    p.rightLeg.add(p.mesh.leg.clone(), p.armorMesh.rightLeggings, p.armorMesh.rightBoots);

    // Hip joints
    p.leftHip = new THREE.Object3D();
    p.leftHip.add(p.leftLeg);
    p.rightHip = new THREE.Object3D();
    p.rightHip.add(p.rightLeg);

    // Position hips relative to torso bottom
    const torsoBottomY = -blockSize * 0.45 - playerDim.torsoHeight / 2; // Estimate torso bottom Y
    p.leftHip.position.set(-playerDim.legSize * 0.5, torsoBottomY, 0); // Adjusted Y position
    p.rightHip.position.set(playerDim.legSize * 0.5, torsoBottomY, 0); // Adjusted Y position
  }

  static addSkeleton(p) {
    // Create skeleton of head, body, arms, and legs
    p.skeleton = new THREE.Group();
    p.body = new THREE.Group(); // Represents the central body part including torso and limbs attached to it

    p.body.add(p.torso);
    p.body.add(p.neck); // Neck/Head should attach to the main body

    p.body.add(p.leftShoulder);
    p.body.add(p.rightShoulder);
    p.body.add(p.leftHip);
    p.body.add(p.rightHip);

    p.skeleton.add(p.body); // Add the complete body group to the main skeleton
    p.skeleton.name = p.id || "playerSkeleton"; // Use ID if available

    // Bounding Box Helper
    p.bboxGroup = new THREE.Group(); // Use a group for the bbox helper if needed
    let bbox = new THREE.BoxHelper(p.body, 0xffff00); // Helper based on the main body group
    // Reset position if helper is based on the group already at origin
    bbox.position.set(0, 0, 0);
    // Adjust bbox position based on skin type if necessary (original code had offset for alex)
    // This offset might be better applied to the skeleton/body group itself if needed
    // if (p.skin == "alex") bbox.position.x = 1.4; // Re-evaluate if this offset is correct/needed

    bbox.matrixAutoUpdate = true; // Usually default, but explicit is fine
    bbox.visible = game?.debug || false; // Check game object existence
    bbox.name = "bbox";
    p.bboxGroup.add(bbox); // Add helper to its own group

    p.skeleton.add(p.bboxGroup); // Add bbox group to skeleton
  }

  static addPlayerMesh(p) {
    p.mesh = {}; // To hold base skin meshes
    p.armorMesh = {}; // To hold armor overlay meshes

    PlayerMesh.addHead(p);
    PlayerMesh.addTorso(p);
    PlayerMesh.addArms(p);
    PlayerMesh.addLegs(p);
  }
}

export default PlayerMesh;