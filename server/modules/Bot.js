const THREE = require("three");
// const Ola = require("ola"); // Ola likely not needed if not smoothing bot state itself
const Function = require("./Function"); // Assuming still needed

// Bot States
const STATE_IDLE = 'IDLE'; // State when target (spawner) is gone or bot has nothing to do
// const STATE_SEARCHING = 'SEARCHING'; // No longer needed
const STATE_MOVING_TO_TARGET = 'MOVING_TO_TARGET';
const STATE_MELEE_COMBAT = 'MELEE_COMBAT';
const STATE_RANGED_COMBAT = 'RANGED_COMBAT';
const STATE_FLEEING = 'FLEEING';

// Bot Constants (tune these)
const MELEE_RANGE = 2.5 * 16;
const BOW_MIN_RANGE = 6 * 16;
const BOW_MAX_RANGE = 20 * 16;
// const DETECTION_RADIUS = 25 * 16; // No longer needed for general detection
const FLEE_HEALTH_THRESHOLD = 5;
const MELEE_COOLDOWN_TIME = 0.6;
const BOW_COOLDOWN_TIME = 1.0;
const BOW_CHARGE_TIME = 1.0;
const JUMP_COOLDOWN_TIME = 1.5;
const STRAFE_CHANGE_TIME = 2.0;

module.exports = class Bot {
    constructor(playerData, world, options = {}) {
        this.playerData = playerData;
        this.world = world;
        this.options = options;
        this.type = "bot";

        // --- Target Logic Change ---
        this.spawnerId = options.spawnerId; // Store the ID of the player who spawned the bot
        this.target = this.spawnerId; // Target is now fixed to the spawner
        // --- End Target Logic Change ---

        this.targetPos = new THREE.Vector3(); // Last known position of target

        // State - Start by moving towards the target if they exist
        this.state = this.target ? STATE_MOVING_TO_TARGET : STATE_IDLE;

        // Movement related
        this.moveTargetPos = new THREE.Vector3(); // Where the bot is trying to move pathfinding-wise
        this.stuckTimer = 0;
        this.lastPos = new THREE.Vector3(); // Initialized below
        this.strafeDirection = 1;
        this.strafeTimer = Math.random() * STRAFE_CHANGE_TIME;
        this.jumpCooldown = Math.random() * JUMP_COOLDOWN_TIME;

        // Combat related
        this.meleeCooldown = 0;
        this.bowCooldown = 0;
        this.bowChargeTimer = 0;

        // Initialize bot's THREE.Vector3 properties safely
        this.playerData.pos = new THREE.Vector3().copy(this.playerData.pos || { x: 0, y: 300, z: 0 });
        this.playerData.vel = new THREE.Vector3().copy(this.playerData.vel || { x: 0, y: 0, z: 0 });
        this.playerData.rot = new THREE.Vector3().copy(this.playerData.rot || { x: 0, y: 0, z: 0 });
        this.lastPos.copy(this.playerData.pos); // Initialize lastPos


        // --- Simplified Bot Inventory/Equipment ---
        // TODO: Implement proper inventory giving based on difficulty/options
        this.hasBow = true;
        this.hasArrows = true; // Assume infinite for now
        this.hasMelee = true;

        // Set initial armor based on constructor data (using data directly if passed)
        let armorLevel = 0;
        if (typeof options.data === 'number') { // Example: if difficulty passed as 'data'
            armorLevel = options.data;
        } else if (typeof options.difficulty === 'number') {
             armorLevel = options.difficulty; // Or if passed as 'difficulty'
        }
        // Ensure level is within valid range (assuming 0-4 for armor types)
        armorLevel = Math.max(0, Math.min(4, Math.floor(armorLevel)));
        this.playerData.armor = {
             helmet: armorLevel,
             chestplate: armorLevel,
             leggings: armorLevel,
             boots: armorLevel,
        };


        console.log(`Bot ${this.playerData.id} created for spawner ${this.spawnerId}. State: ${this.state}`);
    }

    // --- Main Update Loop ---
    update(world, players, delta) {
        if (!this.playerData || this.playerData.hp <= 0 || !world) return;

        this.world = world;
        this.updateTimers(delta);

        // --- Target Logic Change ---
        // Check if the fixed target (spawner) still exists and is alive
        const targetPlayer = this.target ? players[this.target] : null;
        if (!targetPlayer || targetPlayer.hp <= 0) {
            // Target is gone (disconnected or died)
            this.target = null; // Clear target
            if (this.state !== STATE_IDLE) {
                 console.log(`Bot ${this.playerData.id} lost target ${this.spawnerId}. Switching to IDLE.`);
                 this.state = STATE_IDLE;
            }
        } else {
            // Update target position if target exists
            this.targetPos.copy(targetPlayer.pos);
             // If was idle but target reappeared (e.g. respawned), start moving
             if(this.state === STATE_IDLE) {
                 this.state = STATE_MOVING_TO_TARGET;
             }
        }
        // --- End Target Logic Change ---


        // State machine
        switch (this.state) {
            case STATE_IDLE:
                this.updateIdle(world, players, delta);
                break;
            // case STATE_SEARCHING: // Removed state
            //     this.updateSearching(world, players, delta);
            //     break;
            case STATE_MOVING_TO_TARGET:
                this.updateMovingToTarget(world, players, delta);
                break;
            case STATE_MELEE_COMBAT:
                this.updateMeleeCombat(world, players, delta);
                break;
            case STATE_RANGED_COMBAT:
                this.updateRangedCombat(world, players, delta);
                break;
            case STATE_FLEEING:
                this.updateFleeing(world, players, delta);
                break;
        }

        this.applyPhysics(world, delta);

        // Update bot player data for client sync
        this.playerData.sneaking = this.state === STATE_FLEEING; // Example: Sneak only when fleeing? Or never?
        this.playerData.walking = this.playerData.vel.lengthSq() > 0.1;
        this.playerData.punching = this.meleeCooldown > (MELEE_COOLDOWN_TIME - 0.2);
        // Bow charge is updated in attackRanged
    }

    // --- State Logic Methods ---
    updateIdle(world, players, delta) {
        // Bot does nothing if target is gone. Could add wandering later.
        // Stop movement
        this.playerData.vel.x *= 0.8; // Apply friction quickly
        this.playerData.vel.z *= 0.8;
        // Check if target reappeared (handled in main update now)
    }

    // updateSearching removed - bot always knows its target or is idle

    updateMovingToTarget(world, players, delta) {
        if (!this.target) { this.state = STATE_IDLE; return; } // Should not happen if main update handles this
        if (this.playerData.hp < FLEE_HEALTH_THRESHOLD) { this.state = STATE_FLEEING; return; }

        const targetDistSq = this.playerData.pos.distanceToSquared(this.targetPos);

        // Decide combat state based on distance
        if (targetDistSq <= MELEE_RANGE * MELEE_RANGE) {
            this.state = STATE_MELEE_COMBAT;
        } else if (this.hasBow && this.hasArrows && targetDistSq <= BOW_MAX_RANGE * BOW_MAX_RANGE) { // No minimum range check here, decide in RANGED state
            this.state = STATE_RANGED_COMBAT;
        } else {
            // Continue moving towards target
            this.moveTowards(this.targetPos, 3 * world.blockSize, delta);
            this.strafe(this.targetPos, 1.5 * world.blockSize, delta);
            this.attemptJump(delta);
            this.faceTarget(this.targetPos);
            this.avoidObstacles(delta);
        }
    }

    updateMeleeCombat(world, players, delta) {
        if (!this.target) { this.state = STATE_IDLE; return; }
        if (this.playerData.hp < FLEE_HEALTH_THRESHOLD) { this.state = STATE_FLEEING; return; }

        const targetDistSq = this.playerData.pos.distanceToSquared(this.targetPos);

        // If target moved out of melee range, switch to move/ranged
        if (targetDistSq > (MELEE_RANGE + 1 * world.blockSize) * (MELEE_RANGE + 1 * world.blockSize)) { // Reduced buffer
             // Check if bow is viable
             if (this.hasBow && this.hasArrows && targetDistSq >= BOW_MIN_RANGE * BOW_MIN_RANGE && targetDistSq <= BOW_MAX_RANGE * BOW_MAX_RANGE) {
                 this.state = STATE_RANGED_COMBAT;
             } else {
                this.state = STATE_MOVING_TO_TARGET;
             }
            return;
        }

        // Circle/Strafe around target
        this.strafe(this.targetPos, 2.5 * world.blockSize, delta, true);
        this.attemptJump(delta);
        this.faceTarget(this.targetPos);
        this.attackMelee(this.target, delta);
        this.avoidObstacles(delta);
    }

    updateRangedCombat(world, players, delta) {
        if (!this.target || !this.hasBow || !this.hasArrows) { this.state = STATE_IDLE; return; } // Can't use bow or no target
        if (this.playerData.hp < FLEE_HEALTH_THRESHOLD) { this.state = STATE_FLEEING; return; }

        const targetDistSq = this.playerData.pos.distanceToSquared(this.targetPos);

        // If target gets too close, switch to melee (force melee if they rush)
        if (targetDistSq < MELEE_RANGE * MELEE_RANGE) { // Switch immediately if in melee range
             this.state = STATE_MELEE_COMBAT;
             this.bowChargeTimer = 0;
             this.playerData.bowCharge = 0;
             return;
        }
        // If target gets too far, move closer
        if (targetDistSq > BOW_MAX_RANGE * BOW_MAX_RANGE) {
             this.state = STATE_MOVING_TO_TARGET;
             this.bowChargeTimer = 0;
             this.playerData.bowCharge = 0;
             return;
        }

        // Maintain distance and shoot
        const idealBowRange = (BOW_MIN_RANGE + BOW_MAX_RANGE) / 2;
        this.maintainDistance(this.targetPos, idealBowRange, delta);
        this.strafe(this.targetPos, 1 * world.blockSize, delta);
        this.faceTarget(this.targetPos);
        this.attackRanged(this.target, delta);
        this.avoidObstacles(delta);
    }

    updateFleeing(world, players, delta) {
        if (!this.target) { // Target gone, stop fleeing
            this.state = STATE_IDLE; // Or SEARCHING if you want it to re-acquire later
            return;
        }

        const targetDistSq = this.playerData.pos.distanceToSquared(this.targetPos);

        // If far enough away OR health recovered (TODO: add health check?), stop fleeing
        const fleeStopDistance = DETECTION_RADIUS * 1.2; // Flee a bit beyond detection radius
        if (targetDistSq > fleeStopDistance * fleeStopDistance /* || this.playerData.hp > FLEE_HEALTH_THRESHOLD * 2 */) {
             this.state = STATE_IDLE; // Or SEARCHING
             return;
        }

        // Move away from target
        let fleeDirection = this.playerData.pos.clone().sub(this.targetPos);
        if (fleeDirection.lengthSq() < 0.01) { // If on top of target, flee randomly
            fleeDirection.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        }
        fleeDirection.y = 0; // Don't flee up/down
        fleeDirection.normalize();
        this.playerData.vel.addScaledVector(fleeDirection, 4 * world.blockSize * delta); // Flee speed
        this.faceTarget(this.playerData.pos.clone().add(fleeDirection)); // Look where fleeing
        this.avoidObstacles(delta);
        this.attemptJump(delta);
    }

    // --- Helper Methods ---

    updateTimers(delta) {
        if (this.meleeCooldown > 0) this.meleeCooldown -= delta;
        if (this.bowCooldown > 0) this.bowCooldown -= delta;
        if (this.jumpCooldown > 0) this.jumpCooldown -= delta;
        if (this.strafeTimer > 0) this.strafeTimer -= delta;
        if (this.stuckTimer > 0) this.stuckTimer -= delta;
        // Don't decrement bowChargeTimer here, handled in attackRanged
    }

    // findTarget method removed - target is fixed

    faceTarget(targetPos) {
        if (!targetPos) return;
        const direction = targetPos.clone().sub(this.playerData.pos);
        // Prevent looking straight up/down if target is directly above/below
        if (direction.lengthSq() < 0.01) return;

        this.playerData.rot.y = Math.atan2(direction.x, direction.z); // Yaw

        // Calculate pitch - target eye level approx target.y + halfHeight
        const targetEyeHeight = this.playerData?.dim?.height ? this.playerData.dim.height * 0.8 : this.world.blockSize * 1.4; // Estimate target eye height
        const dy = (targetPos.y + targetEyeHeight) - (this.playerData.pos.y + targetEyeHeight); // Use bot's eye height too
        const horizontalDist = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
        this.playerData.rot.x = -Math.atan2(dy, horizontalDist); // Pitch

        // Clamp pitch to prevent extreme looking up/down
        this.playerData.rot.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.playerData.rot.x));
    }


    moveTowards(targetPos, speed, delta) {
        if (!targetPos) return;
        let direction = targetPos.clone().sub(this.playerData.pos);
        direction.y = 0; // Move along XZ plane
        if (direction.lengthSq() < 0.01) return; // Already at target horizontally
        direction.normalize();
        this.playerData.vel.addScaledVector(direction, speed * delta);
    }

    strafe(targetPos, speed, delta, forceChange = false) {
         if (!targetPos) return;
         if (this.strafeTimer <= 0 || forceChange) {
            this.strafeDirection *= -1; // Just switch direction
            this.strafeTimer = STRAFE_CHANGE_TIME * (0.5 + Math.random());
        }

        let direction = targetPos.clone().sub(this.playerData.pos);
        // Use current rotation for strafe direction to move perpendicular to where bot is looking
        const currentYaw = this.playerData.rot.y;
        let strafeVec = new THREE.Vector3(Math.cos(currentYaw), 0, -Math.sin(currentYaw)); // Right vector relative to look direction

        // let strafeVec = new THREE.Vector3(-direction.z, 0, direction.x).normalize(); // Old perpendicular based on target vector
        this.playerData.vel.addScaledVector(strafeVec, this.strafeDirection * speed * delta);
    }

     maintainDistance(targetPos, desiredDist, delta) {
        if (!targetPos) return;
        const targetDist = this.playerData.pos.distanceTo(targetPos);
        const distError = targetDist - desiredDist;
        const moveSpeed = 3 * this.world.blockSize;
        const tolerance = this.world.blockSize * 1.0; // Wiggle room

        if (Math.abs(distError) > tolerance) {
            let direction = targetPos.clone().sub(this.playerData.pos);
            direction.y = 0;
            if (direction.lengthSq() < 0.01) return; // Avoid normalizing zero vector
            direction.normalize();
            // Move away if too close (distError < 0), move closer if too far (distError > 0)
            this.playerData.vel.addScaledVector(direction, Math.sign(distError) * moveSpeed * delta);
        }
    }

    attemptJump(delta) {
         if (this.jumpCooldown <= 0 && Math.random() < 0.05) { // Reduced jump frequency
             if (this.isOnGround()) {
                 this.playerData.vel.y = this.playerData.initialJumpVelocity || 150; // Use player's jump velocity if available
                 this.jumpCooldown = JUMP_COOLDOWN_TIME * (0.8 + Math.random() * 0.4);
             }
         }
    }

    wander(delta) {
        // Simple wander: stand still and turn or pick random point
         if (Math.random() < 0.1) { // Chance to pick new target pos
            const angle = Math.random() * Math.PI * 2;
            const dist = (3 + Math.random() * 5) * this.world.blockSize;
            this.moveTargetPos.set(
                this.playerData.pos.x + Math.sin(angle) * dist,
                this.playerData.pos.y,
                this.playerData.pos.z + Math.cos(angle) * dist
            );
        }
         if (this.moveTargetPos && this.playerData.pos.distanceToSquared(this.moveTargetPos) > 1) {
              this.moveTowards(this.moveTargetPos, 1.5 * this.world.blockSize, delta);
              this.faceTarget(this.moveTargetPos);
         } else {
             // Stand still or turn slightly
             this.playerData.rot.y += (Math.random() - 0.5) * delta * 0.5;
             this.playerData.vel.x *= 0.9; // Dampen velocity
             this.playerData.vel.z *= 0.9;
         }
    }


    avoidObstacles(delta) {
         // Raycast slightly ahead + left/right? Too complex for basic version.
         // Simple: check voxel directly in path of velocity vector
         const checkDist = this.world.blockSize * 0.6;
         const checkVel = this.playerData.vel.clone().normalize();
         checkVel.y = 0; // Ignore vertical component for obstacle check
         if (checkVel.lengthSq() < 0.1) return false; // Not moving horizontally

         const checkPos = this.playerData.pos.clone();
         // Check near feet and mid-body height
         const feetY = checkPos.y - (this.playerData?.dim?.height ? this.playerData.dim.height * 0.4 : 10); // Estimate feet Y
         const midY = checkPos.y;

         const checkPosFeet = checkPos.clone().setY(feetY).addScaledVector(checkVel, checkDist);
         const checkPosMid = checkPos.clone().setY(midY).addScaledVector(checkVel, checkDist);

         const blockSize = this.world.blockSize;
         const isBlocked = this.collideVoxel(checkPosFeet.x / blockSize, checkPosFeet.y / blockSize, checkPosFeet.z / blockSize) ||
                           this.collideVoxel(checkPosMid.x / blockSize, checkPosMid.y / blockSize, checkPosMid.z / blockSize);


         if (isBlocked) {
              // Obstacle detected - Try a slight turn or jump
              if (this.isOnGround() && this.jumpCooldown <= 0) {
                  this.attemptJump(delta);
              } else {
                   // Apply a small force perpendicular to velocity to try and slide along wall
                   const slideDir = new THREE.Vector3(-checkVel.z, 0, checkVel.x).normalize();
                   this.playerData.vel.addScaledVector(slideDir, this.strafeDirection * 1 * blockSize * delta); // Adjust slide force
              }
              this.stuckTimer += delta * 2; // Increase stuck timer faster when avoiding
              return true;
         }
         return false;
    }


    attackMelee(targetId, delta) {
        if (this.meleeCooldown > 0) return;

        const targetData = players[targetId]; // Target should always be valid in this state
        if (!targetData) return;

        const distSq = this.playerData.pos.distanceToSquared(targetData.pos);
        // Use slightly larger range check to compensate for server latency?
        if (distSq <= (MELEE_RANGE + 0.5*this.world.blockSize) * (MELEE_RANGE + 0.5*this.world.blockSize)) {

            console.log(`Bot ${this.playerData.id} attacking ${targetId} in melee`);

            if (g.socket?.emit) {
                 // Calculate direction towards target's approximate center/head
                 const targetCenter = targetData.pos.clone();
                 targetCenter.y += this.world.blockSize * 0.6; // Aim higher than feet
                 let attackDirection = targetCenter.sub(this.playerData.pos).normalize();

                 g.socket.emit("punchPlayer", {
                    id: targetId,
                    dir: attackDirection.toArray(),
                    force: 400, // TODO: Vary force/crit based on bot skill/state?
                    crit: !this.isOnGround(),
                    curr: null, // TODO: Bot weapon
                    botId: this.playerData.id
                 });
            } else { console.warn("Bot cannot emit punchPlayer event: g.socket missing"); }

            this.meleeCooldown = MELEE_COOLDOWN_TIME;
            this.lastPunch = Date.now();
            this.playerData.punching = true;
        }
    }

    attackRanged(targetId, delta) {
        if (this.bowCooldown > 0 || !this.hasArrows) {
            this.bowChargeTimer = 0; // Ensure charge resets if cannot shoot
            this.playerData.bowCharge = 0;
            return;
        }

        const targetData = players[targetId];
        if (!targetData) return;

        // Aiming
        this.faceTarget(targetData.pos); // Bot faces target

        // Charge bow
        this.bowChargeTimer += delta;
        const chargeLevel = Math.min(Math.floor(this.bowChargeTimer / (BOW_CHARGE_TIME / 3)), 3);
        this.playerData.bowCharge = chargeLevel > 0 ? chargeLevel : 0;

        // Fire when charged enough (maybe not always full charge?)
        const fireChargeLevel = 3; // Require full charge for now
        if (chargeLevel >= fireChargeLevel) {
            console.log(`Bot ${this.playerData.id} firing bow at ${targetId}`);

             // Calculate fire direction (add inaccuracy)
             const targetCenter = targetData.pos.clone();
             targetCenter.y += this.world.blockSize * 0.6; // Aim higher
             let fireDirection = targetCenter.sub(this.playerData.pos);
             // Basic inaccuracy: add small random offset
             const inaccuracy = 0.05; // Radians, adjust for difficulty
             fireDirection.applyAxisAngle(new THREE.Vector3(0,1,0), (Math.random()-0.5)*2*inaccuracy); // Horizontal
             fireDirection.applyAxisAngle(new THREE.Vector3(1,0,0).applyQuaternion(this.playerData.skin.quaternion), (Math.random()-0.5)*2*inaccuracy); // Vertical (relative to bot's tilt?) - simpler: just add random y offset?
             fireDirection.y += (Math.random()-0.5)*0.1 * fireDirection.length(); // Simple Y offset inaccuracy
             fireDirection.normalize();


            if (g.socket?.emit) {
                 g.socket.emit("fireArrow", {
                     pos: this.playerData.pos.clone(),
                     dir: fireDirection.toArray(),
                     force: chargeLevel, // Send charge level (1-3)
                     botId: this.playerData.id
                 });
             } else { console.warn("Bot cannot emit fireArrow event: g.socket missing"); }

            this.bowCooldown = BOW_COOLDOWN_TIME * (0.8 + Math.random()*0.4); // Randomize cooldown slightly
            this.bowChargeTimer = 0;
            this.playerData.bowCharge = 0;
            // TODO: Decrement arrow count
        }
    }

    // --- Physics and Collision (Simplified placeholder - needs proper implementation) ---
    applyPhysics(world, delta) {
        const gravity = -9.81 * world.blockSize * 1.5;
        const maxFallSpeed = -5 * world.blockSize;
        const groundFriction = 10.0;
        const airFriction = 0.5;
        const flyFriction = 2.0;

        // Apply Gravity/Flying/Water vertical force handled elsewhere or simplified here
        if(!this.isOnGround() && !this.playerData.fly /*&& !this.inWater - add water check */) {
             this.playerData.vel.y += gravity * delta;
             this.playerData.vel.y = Math.max(maxFallSpeed, this.playerData.vel.y);
        }

        // Apply Friction
        const friction = this.isOnGround() ? groundFriction : (this.playerData.fly ? flyFriction : airFriction);
        this.playerData.vel.x *= (1 - Math.min(friction * delta, 1)); // Framerate independent friction
        this.playerData.vel.z *= (1 - Math.min(friction * delta, 1));
        if (this.playerData.fly) {
            this.playerData.vel.y *= (1 - Math.min(friction * delta, 1));
        }


        // --- Basic Collision Detection & Resolution ---
        const intendedMove = this.playerData.vel.clone().multiplyScalar(delta);
        this.resolveCollisions(intendedMove, 3); // Call collision resolution


        // Stuck check
        if (this.lastPos.distanceToSquared(this.playerData.pos) < 0.01 && intendedMove.lengthSq() > 0.1) {
             this.stuckTimer += delta;
             if(this.stuckTimer > 0.5 && this.isOnGround()) {
                 this.playerData.vel.y = this.playerData.initialJumpVelocity || 150;
                 this.stuckTimer = -0.5; // Prevent rapid re-jump
             }
        } else {
            this.stuckTimer = Math.max(0, this.stuckTimer - delta); // Decrease timer if moving
        }
        this.lastPos.copy(this.playerData.pos);
    }

    resolveCollisions(intendedMove, steps) {
        const stepMove = intendedMove.clone().divideScalar(steps);
        let groundCollision = false;

        for (let i = 0; i < steps; i++) {
            // Check Y
            this.playerData.pos.y += stepMove.y;
            if (this.collides(this.playerData.pos)) {
                 this.playerData.pos.y -= stepMove.y;
                 if (stepMove.y < 0) groundCollision = true; // Hit floor this frame
                 this.playerData.vel.y = 0;
                 stepMove.y = 0;
            }
             // Check X
             this.playerData.pos.x += stepMove.x;
             if (this.collides(this.playerData.pos)) {
                 this.playerData.pos.x -= stepMove.x;
                 this.playerData.vel.x = 0;
                 stepMove.x = 0;
             }
             // Check Z
             this.playerData.pos.z += stepMove.z;
             if (this.collides(this.playerData.pos)) {
                 this.playerData.pos.z -= stepMove.z;
                 this.playerData.vel.z = 0;
                 stepMove.z = 0;
             }
        }
        // Set ground state based on final collision result for the frame
        // This is imperfect, might need velocity check too
        // this.playerData.onObject = groundCollision; // Assuming onObject is a property synced to client
    }


    isOnGround() {
        // Refined check using collision slightly below feet
        const checkPos = this.playerData.pos.clone();
        checkPos.y -= 0.1; // Check just below origin
        return this.collides(checkPos);
    }

    // Collision check using Bot's AABB
    collides(pos) {
        if (!this.world || !this.playerData.dim) return false; // Need world and dimensions

        const halfWidth = (this.playerData.dim.armSize || 4) * 0.5; // Use half size
        const halfDepth = halfWidth; // Assume square base
        const halfHeight = (this.playerData.dim.height || 28) * 0.5; // Use player height

        const min = pos.clone().sub(new THREE.Vector3(halfWidth, halfHeight, halfDepth));
        const max = pos.clone().add(new THREE.Vector3(halfWidth, halfHeight, halfDepth));

        // Important: Ensure Y min/max are correct for collision box origin (feet or center?)
        // If pos is at feet: min.y = pos.y; max.y = pos.y + height;
        // If pos is at center: min.y = pos.y - halfHeight; max.y = pos.y + halfHeight;
        // Assuming pos is at feet origin for this calculation based on previous player code:
        min.y = pos.y;
        max.y = pos.y + halfHeight*2; // Full height from feet


        const minVoxel = min.divideScalar(this.world.blockSize).floor();
        const maxVoxel = max.divideScalar(this.world.blockSize).floor();

        for (let y = minVoxel.y; y <= maxVoxel.y; y++) {
            // Prevent checking below world
            if (y < 0) continue;
            for (let x = minVoxel.x; x <= maxVoxel.x; x++) {
                for (let z = minVoxel.z; z <= maxVoxel.z; z++) {
                    if (this.collideVoxel(x, y, z)) { // Check if voxel is solid
                        return true;
                    }
                }
            }
        }
        return false;
    }

    collideVoxel(voxelX, voxelY, voxelZ) {
        // Check if world and blockId exist before accessing
        if (!this.world?.blockId) return false;

        let voxel = this.world.getVoxel(voxelX, voxelY, voxelZ);
        const waterId = this.world.blockId["water"] ?? 1;
        const leavesOakId = this.world.blockId["leaves_oak"] ?? -1; // Example, add other leaves
        const leavesBirchId = this.world.blockId["leaves_birch"] ?? -1;
        // Add other non-solid block IDs here
        const nonSolidIds = [leavesOakId, leavesBirchId];

        return voxel > waterId && !nonSolidIds.includes(voxel) && voxel !== 255;
    }
};