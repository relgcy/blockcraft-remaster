import * as THREE from "three";
import Ola from "ola";
import game from "../Game";
// Correct source for world seems to be WorldManager - ensure path is correct from this file's location
import world from "../world/WorldManager";
import textureManager from "./TextureManager";
import { scene } from "../globals"; // Assuming scene is a valid THREE.Scene object
import Item3D from "../graphics/Item3D";
import player from "../entity/player/Player"; // Assuming this is the client's player instance

class EntityManager {
  // Get the canvas for the entity
  getCanvas(type, width = 16, height = 16) {
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("2d");
    // Safety check for textureManager
    let atlas = textureManager?.getTextureAtlas(type);
    if (!atlas) {
        console.warn(`Texture atlas not found for type: ${type}`);
        // Return a dummy canvas/context to avoid downstream errors, or handle differently
        return { canvas, ctx, atlas: null };
    }
    canvas.width = width;
    canvas.height = height;
    return { canvas, ctx, atlas };
  }

  // Convert the canvas texture to a material
  textureToMat(canvas, options = {}) {
    if (!canvas) return null; // Safety check
    let texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    // Make sure needsUpdate is true so texture uploads on first use
    texture.needsUpdate = true;
    return new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
      // Use provided options safely
      depthWrite: options.depthWrite ?? false, // Default to false if not provided
      side: THREE.DoubleSide,
      alphaTest: 0.1 // Often needed with transparent textures from canvas
    });
  }

  // Get the material
  getMat(width, height, offX = 0, offY = 0) {
    let { canvas, ctx, atlas } = this.getCanvas("entity", width, height);
    // Ensure atlas was loaded before drawing
    if (ctx && atlas) {
      try {
        ctx.drawImage(atlas, offX, offY, width, height, 0, 0, width, height);
      } catch (e) {
        console.error("Error drawing image to canvas in getMat:", e);
      }
    } else {
        console.warn("Could not get canvas/context/atlas in getMat");
    }
    return this.textureToMat(canvas);
  }

  // Add item mesh to the scene
  addToScene(entity, mesh, type, isThrowable) {
    // Safety checks for critical objects
    if (!world?.entities || !entity || !mesh || !scene) {
        console.error("addToScene called with missing arguments or globals.");
        return;
    }

    let entities = world.entities;
    let id = entity.id;

    // Avoid overwriting if entity already exists unexpectedly
    if (entities[id]) {
        console.warn(`Entity with ID ${id} already exists in addToScene. Overwriting.`);
        // Consider cleaning up old mesh here if necessary
        // this.removeEntity({ type: "remove_item", id: id });
    }

    entities[id] = entity;
    if (type == "arrow") {
      entities[id].mesh = mesh;
      // Use optional chaining/defaults for position
      mesh.position.set(entity.pos?.x ?? 0, entity.pos?.y ?? 0, entity.pos?.z ?? 0);
    } else {
      let innerMesh = new THREE.Group();
      innerMesh.add(mesh);
      entities[id].mesh = new THREE.Group();

      // Positioning based on type
      if (type == "block") {
          innerMesh.position.set(-2, 0, -2); // Consider making these constants or based on size
      } else if (type == "item" && !isThrowable) {
          mesh.rotation.x = Math.PI / 2;
          mesh.position.y += 8; // Magic number, consider relating to item size
          innerMesh.position.set(0, 0, -4); // Magic number
      } else if (type == "item") { // This implies isThrowable === true
          mesh.rotation.set(0, 0, 0);
          innerMesh.rotation.y = Math.PI / 2;
          innerMesh.position.set(-4, -4, 0); // Magic numbers
      }

      // Add bounding box if geometry exists on innerMesh's children
      if (innerMesh.children[0]?.geometry) {
          try {
              entities[id].bbox = new THREE.BoxHelper(innerMesh, 0xffff00);
              entities[id].bbox.matrixAutoUpdate = true;
              entities[id].bbox.visible = game?.debug || false; // Use optional chaining
              entities[id].mesh.add(entities[id].bbox);
          } catch (e) {
              console.warn("Could not create BoxHelper in addToScene:", e);
          }
      }
      entities[id].mesh.add(innerMesh);
    }
    mesh.name = "item"; // Should this be entity.name or entity.type?

    scene.add(entities[id].mesh);
  }

  // Add entity to the world
  addEntity(entity) {
    // Basic safety checks
    if (!entity || !entity.type) {
        console.warn("addEntity called with invalid entity data.");
        return;
    }
    // Check needed globals/managers
    if (typeof world === 'undefined' || !world || !textureManager || !Item3D) {
        console.error("addEntity cannot proceed: Missing world, textureManager, or Item3D.");
        return;
    }

    const { blockSize } = world; // Relies on world being available
    const defaultBlockSize = 16; // Fallback if blockSize is missing

    // Consider making throwables a Set for faster lookups
    const throwables = new Set(["ender_pearl", "fireball", "snowball", "egg"]);

    if (entity.type == "item") {
      if (!entity.pos) {
          console.warn("Item entity added without position:", entity);
          return; // Cannot add item without position
      }

      // Initialize vel if needed
      if (entity.vel) {
          // Use default values if components are missing
          entity.vel = new Ola({ x: entity.vel.x ?? 0, y: entity.vel.y ?? 0, z: entity.vel.z ?? 0 });
      }

      if (entity.name == "arrow") {
        // Ensure velocity exists for direction calculation
        const velX = entity.vel?.x ?? 0;
        const velY = entity.vel?.y ?? 0;
        const velZ = entity.vel?.z ?? 0;
        // Avoid normalizing zero vector
        const dir = (velX === 0 && velY === 0 && velZ === 0)
            ? new THREE.Vector3(0, 0, -1) // Default direction if no velocity
            : new THREE.Vector3(velX, velY, velZ).normalize();

        const mx = new THREE.Matrix4().lookAt(dir, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
        entity.qt = new THREE.Quaternion().setFromRotationMatrix(mx);

        // Get materials safely
        const mat = this.getMat(16, 5, 0, 0);
        const mat2 = this.getMat(5, 5, 0, 5);
        if (!mat || !mat2) {
            console.error("Failed to get materials for arrow.");
            return;
        }
        mat.depthWrite = true;
        mat2.depthWrite = true;

        let arrow = new THREE.Group();
        // --- THREE.JS UPDATE ---
        // Changed PlaneBufferGeometry to PlaneGeometry
        let arrow1 = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), mat);
        let arrow2 = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), mat);
        let arrow3 = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mat2);

        arrow1.rotation.y = -Math.PI / 2;
        arrow2.rotation.x = -Math.PI / 2;
        arrow2.rotation.z = -Math.PI / 2;
        arrow3.position.z = -7; // Consider relating this to arrow size

        arrow.add(arrow1, arrow2, arrow3);

        // Add bounding box safely
        try {
            entity.bbox = new THREE.BoxHelper(arrow, 0xffff00);
            entity.bbox.visible = game?.debug || false;
            arrow.add(entity.bbox);
        } catch (e) {
            console.warn("Could not create BoxHelper for arrow:", e);
        }

        arrow.setRotationFromQuaternion(entity.qt);

        this.addToScene(entity, arrow, "arrow");
      } else if (entity.class == "item" && throwables.has(entity.name)) {
        // Add throwable item
        const pixelSize = (blockSize ?? defaultBlockSize) / 2;
        const item_mesh = Item3D.getMesh(entity, pixelSize / 16);
        if (item_mesh) { // Check if mesh creation succeeded
           this.addToScene(entity, item_mesh, "item", true);
        }
      } else if (entity.class == "item") {
        // Add non-throwable item
        const pixelSize = (blockSize ?? defaultBlockSize) / 2;
        const item_mesh = Item3D.getMesh(entity, pixelSize / 16);
         if (item_mesh) { // Check if mesh creation succeeded
            this.addToScene(entity, item_mesh, "item");
         }
      } else {
        // Add block entity
        const uvVoxel = (entity.v ?? 1) - 1; // Use default voxel value if missing
        let block_geometry = new THREE.BufferGeometry();
        // Ensure world and method exist
        if (world?.generateGeometryBlockEntity) {
           const { positions, normals, uvs, indices } = world.generateGeometryBlockEntity(uvVoxel);
           // Check if geometry data is valid before setting attributes
           if (positions && normals && uvs && indices) {
              block_geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
              block_geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
              block_geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
              block_geometry.setIndex(indices);
              block_geometry.computeBoundingSphere();

              // Ensure textureManager and material exist
              if (textureManager?.materialTransparent) {
                 let block_mesh = new THREE.Mesh(block_geometry, textureManager.materialTransparent);
                 block_mesh.castShadow = true;
                 block_mesh.receiveShadow = true;
                 this.addToScene(entity, block_mesh, "block");
              } else {
                  console.error("Missing textureManager.materialTransparent for block entity.");
              }
           } else {
               console.error("Invalid geometry data generated for block entity:", entity);
           }
        } else {
            console.error("world.generateGeometryBlockEntity method not found.");
        }
      }
    } else if (entity.type == "remove_item") {
        if (!world?.entities || !world.entities[entity.id]?.mesh || !scene) {
            // Entity or mesh doesn't exist or scene isn't available, nothing to remove
            return;
        }
        const entityToRemove = world.entities[entity.id];
        const mesh = entityToRemove.mesh;

        // Properly dispose of geometries and materials to free GPU memory
        if (mesh instanceof THREE.Group) {
            // Iterate through children recursively for nested groups
            const disposeRecursive = (obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    // Handle array of materials
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(mat => mat.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            };
            mesh.traverse(disposeRecursive);
        } else if (mesh instanceof THREE.Mesh) {
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(mat => mat.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
        }

        scene.remove(mesh);
        delete world.entities[entity.id]; // Remove reference
    }
  }

  // Add new entities to the world
  addEntities(entities) {
    // Check if entities is iterable
    if (!entities || typeof entities[Symbol.iterator] !== 'function') {
        console.warn("addEntities called with non-iterable data:", entities);
        return;
    }
    for (let entity of entities) {
      this.addEntity(entity); // addEntity has its own safety checks
    }
  }

  // Update the entities based on the server's state
  updateEntities(entities) {
      // Check globals and inputs
      if (!entities || typeof entities !== 'object' || !world?.entities) {
          // console.warn("updateEntities called with invalid data or missing world.entities");
          return;
      }

      for (let id in entities) {
          if (Object.prototype.hasOwnProperty.call(entities, id)) {
              const entityUpdate = entities[id];
              const existingEntity = world.entities[id];

              // Only update existing entities of type item
              if (entityUpdate?.type === "item" && existingEntity) {
                  // Safely update properties
                  existingEntity.onObject = entityUpdate.onGround ?? existingEntity.onObject; // Use existing value if update is missing

                  if (existingEntity.name === "arrow" && !existingEntity.onObject) {
                      // Update position and velocity for arrows in flight
                      if(entityUpdate.pos) existingEntity.pos = entityUpdate.pos;
                      if(entityUpdate.vel && existingEntity.vel?.set) { // Check if vel object and set method exist
                           existingEntity.vel.set(entityUpdate.vel);
                      }
                  } else {
                      // Update position for other items or arrows on ground
                      if(entityUpdate.pos) existingEntity.pos = entityUpdate.pos;
                  }

                  // Update mesh position if it hasn't been set yet or needs sync
                  // Check if mesh and position exist
                  if (existingEntity.mesh?.position && existingEntity.pos) {
                      // Only update if significantly different or initially zero? (Simple update for now)
                      existingEntity.mesh.position.set(existingEntity.pos.x ?? 0, existingEntity.pos.y ?? 0, existingEntity.pos.z ?? 0);

                      // Update arrow rotation if applicable and qt data exists
                      if (existingEntity.name === "arrow" && entityUpdate.qt && existingEntity.mesh?.setRotationFromQuaternion) {
                          // Assuming qt is in {x, y, z, w} format
                          const qt = new THREE.Quaternion(entityUpdate.qt.x, entityUpdate.qt.y, entityUpdate.qt.z, entityUpdate.qt.w);
                          existingEntity.mesh.setRotationFromQuaternion(qt);
                      }
                  }
              }
          }
      }
  }
}
// Create and export a singleton instance
const entityManager = new EntityManager();
export default entityManager;