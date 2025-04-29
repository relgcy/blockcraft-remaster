import * as THREE from "three";
import Ola from "ola";
import game from "../Game";
import world from "../world/WorldManager";
import textureManager from "./TextureManager";
import { scene } from "../globals";
import Item3D from "../graphics/Item3D";
// Removed unused import: import player from "../entity/player/Player";

// Moved constant array outside the method
const throwables = ["ender_pearl", "fireball", "snowball", "egg"];

class EntityManager {
  // Get the canvas for the entity
  getCanvas(type, width = 16, height = 16) {
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("2d");
    // Assuming textureManager and getTextureAtlas always return a valid atlas
    let atlas = textureManager.getTextureAtlas(type);
    canvas.width = width;
    canvas.height = height;
    return { canvas, ctx, atlas };
  }

  // Convert the canvas texture to a material
  textureToMat(canvas, options = {}) {
    let texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
      depthWrite: options.depthWrite || false,
      side: THREE.DoubleSide,
    });
  }

  // Get the material
  getMat(width, height, offX = 0, offY = 0) {
    let { canvas, ctx, atlas } = this.getCanvas("entity", width, height);
    // DrawImage might throw if atlas isn't loaded, but we assume it is.
    ctx.drawImage(atlas, offX, offY, width, height, 0, 0, width, height);
    return this.textureToMat(canvas);
  }

  // Add item mesh to the scene
  addToScene(entity, mesh, type, isThrowable) {
    // Assuming world.entities always exists
    let entities = world.entities;
    let id = entity.id;

    entities[id] = entity;
    if (type == "arrow") {
      entities[id].mesh = mesh;
      // Assuming entity.pos always exists for arrows
      mesh.position.set(entity.pos.x, entity.pos.y, entity.pos.z);
    } else {
      let innerMesh = new THREE.Group();
      innerMesh.add(mesh);
      entities[id].mesh = new THREE.Group();
      if (type == "block") innerMesh.position.set(-2, 0, -2);
      if (type == "item" && !isThrowable) {
        mesh.rotation.x = Math.PI / 2;
        mesh.position.y += 8;
        innerMesh.position.set(0, 0, -4);
      } else if (type == "item") { // This implies isThrowable == true
        mesh.rotation.set(0, 0, 0);
        innerMesh.rotation.y = Math.PI / 2;
        innerMesh.position.set(-4, -4, 0);
      }

      entities[id].bbox = new THREE.BoxHelper(innerMesh, 0xffff00);
      entities[id].bbox.matrixAutoUpdate = true;
      // Use optional chaining for game.debug
      entities[id].bbox.visible = game?.debug || false;
      entities[id].mesh.add(entities[id].bbox);
      entities[id].mesh.add(innerMesh);
    }
    mesh.name = "item"; // Assign name to the passed mesh (block_mesh, item_mesh, arrow group)

    scene.add(entities[id].mesh);
  }

  // Add entity to the world
  addEntity(entity) {
    // Assuming world and world.blockSize exist
    let blockSize = world?.blockSize || 16; // Default blocksize if world undefined
    // throwables array moved outside this method

    if (entity.type == "item") {
      if (!entity.pos) return;

      if (entity.vel) {
        // Ensure entity.vel has x, y, z before creating Ola instance
        if (typeof entity.vel.x === 'number' && typeof entity.vel.y === 'number' && typeof entity.vel.z === 'number') {
             entity.vel = new Ola({ x: entity.vel.x, y: entity.vel.y, z: entity.vel.z });
        } else {
            console.warn("Entity velocity incomplete, cannot create Ola.", entity);
            // Handle missing velocity components if necessary
        }
      }


      if (entity.name == "arrow") {
        // Ensure entity.vel exists and is valid before normalizing
        if (!entity.vel || typeof entity.vel.x !== 'number' || typeof entity.vel.y !== 'number' || typeof entity.vel.z !== 'number') {
            console.warn("Arrow entity missing valid velocity.", entity);
            return; // Cannot proceed without velocity
        }
        let dir = new THREE.Vector3(entity.vel.x, entity.vel.y, entity.vel.z).normalize();
        let mx = new THREE.Matrix4().lookAt(dir, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
        entity.qt = new THREE.Quaternion().setFromRotationMatrix(mx);

        let mat = this.getMat(16, 5, 0, 0); // Arrow side
        let mat2 = this.getMat(5, 5, 0, 5); // Arrow back
        mat.depthWrite = true;
        mat2.depthWrite = true;

        let arrow = new THREE.Group();
        // --- Fix: Use PlaneGeometry ---
        let arrow1 = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), mat);
        let arrow2 = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), mat);
        let arrow3 = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mat2);

        arrow1.rotation.y = -Math.PI / 2;
        arrow2.rotation.x = -Math.PI / 2;
        arrow2.rotation.z = -Math.PI / 2;
        arrow3.position.z = -7;

        arrow.add(arrow1, arrow2, arrow3);
        entity.bbox = new THREE.BoxHelper(arrow, 0xffff00);
        // Use optional chaining for game.debug
        entity.bbox.visible = game?.debug || false;
        arrow.add(entity.bbox);

        // Ensure entity.qt is a valid Quaternion before setting rotation
        if (entity.qt instanceof THREE.Quaternion) {
            arrow.setRotationFromQuaternion(entity.qt);
        }

        this.addToScene(entity, arrow, "arrow");

      } else if (entity.class == "item" && throwables.includes(entity.name)) {
        // Add throwable
        let pixelSize = blockSize / 2;
        let item_mesh = Item3D.getMesh(entity, pixelSize / 16);
        this.addToScene(entity, item_mesh, "item", true);
      } else if (entity.class == "item") {
        // Add item
        let pixelSize = blockSize / 2;
        let item_mesh = Item3D.getMesh(entity, pixelSize / 16);
        this.addToScene(entity, item_mesh, "item");
      } else {
        // Add block
        let uvVoxel = entity.v - 1; // Assuming entity.v always exists for blocks
        let block_geometry = new THREE.BufferGeometry();
        // Assuming world.generateGeometryBlockEntity always exists and returns valid data
        const { positions, normals, uvs, indices } = world.generateGeometryBlockEntity(uvVoxel);
        block_geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
        block_geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
        block_geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
        block_geometry.setIndex(indices);
        block_geometry.computeBoundingSphere();

        // Assuming textureManager.materialTransparent exists
        let block_mesh = new THREE.Mesh(block_geometry, textureManager.materialTransparent);
        block_mesh.castShadow = true;
        block_mesh.receiveShadow = true;
        this.addToScene(entity, block_mesh, "block");
      }
    } else if (entity.type == "remove_item") {
        // Check world and world.entities before accessing
        const existingEntity = world?.entities?.[entity.id];
        if (existingEntity?.mesh) {
            let mesh = existingEntity.mesh;
            // Simplified dispose logic using traverse
            mesh.traverse((object) => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    // Handle potential array of materials
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
            scene.remove(mesh); // Remove the top-level mesh group/object

            delete world.entities[entity.id];
        }
    }

  }

  // Add new entities to the world
  addEntities(entities) {
    // Ensure entities is iterable
    if (!entities || typeof entities[Symbol.iterator] !== 'function') return;
    for (let entity of entities) {
      // Optional: Add check if entity is valid before adding
      if (entity && entity.id) {
          this.addEntity(entity);
      }
    }
  }

  // Update the entities based on the server's state
  updateEntities(entities) {
     // Ensure entities is an object
     if (!entities || typeof entities !== 'object') return;

     // Assuming world and world.entities exist
     const worldEntities = world?.entities;
     if (!worldEntities) return;

    for (let id in entities) {
      // Ensure entities[id] exists and has a type
      let entity = entities[id];
      if (!entity || !entity.type) continue;

      let existingEntity = worldEntities[id];

      if (entity.type == "item" && existingEntity) {
        existingEntity.onObject = entity.onGround; // Assuming entity.onGround exists

        // Ensure pos exists before using it
        if(entity.pos) {
            existingEntity.pos = entity.pos;
        }

        // Handle velocity update only for arrows not on ground
        if (entity.name == "arrow" && !entity.onGround) {
            // Ensure vel exists and has properties before setting
            if (existingEntity.vel?.set && entity.vel &&
                typeof entity.vel.x === 'number' &&
                typeof entity.vel.y === 'number' &&
                typeof entity.vel.z === 'number') {
                existingEntity.vel.set(entity.vel);
            }
        }

        // Update mesh position if it hasn't been set yet (or needs correction)
        // Check if mesh and position exist before accessing length/set
        if (existingEntity.mesh?.position && existingEntity.mesh.position.lengthSq() === 0 && entity.pos) {
          existingEntity.mesh.position.set(entity.pos.x, entity.pos.y, entity.pos.z);
        }
      }
    }
  }
}

// Create and export the singleton instance
const entityManager = new EntityManager();
export default entityManager;