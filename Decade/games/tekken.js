/**
 * tekken.js
 * PS2-style 2D fighting mini-game for Level 9 (2024)
 *
 * Win condition: Best of 3 rounds (first to 2 wins)
 * Lose condition: Lose the match (CPU wins 2 rounds)
 */

(function () {
	"use strict";

	/**
	 * Tekken game factory
	 * @param {Object} config - Level configuration
	 * @returns {Object} Game instance
	 */
	function createTekkenGame(config) {
		// =========================================
		// CONSTANTS
		// =========================================

		const cfg = config.config || {};
		const ROUNDS_TO_WIN = cfg.roundsToWin || 2;
		const MAX_ROUNDS = cfg.maxRounds || 3;
		const ROUND_TIME_LIMIT = cfg.timeLimit || 60; // seconds
		const P1_MAX_HP = cfg.p1MaxHp || 100;
		const P2_MAX_HP = cfg.p2MaxHp || 100;
		const WALK_SPEED = cfg.walkSpeed || 220; // pixels per second
		const JUMP_VEL = cfg.jumpVel || 680; // pixels per second (higher for bigger sprite to clear enemy)
		const GRAVITY = cfg.gravity || 1400; // pixels per second squared
		const AI_AGGRESSION = cfg.aiAggression || 0.55; // 0-1

		// Fighter dimensions
		const FIGHTER_WIDTH = 40;
		const FIGHTER_HEIGHT = 60;
		const GROUND_Y = 360; // Ground level
		const ARENA_WIDTH = 600;
		const ARENA_LEFT = 100;
		const ARENA_RIGHT = ARENA_LEFT + ARENA_WIDTH;

		// Attack settings
		const PUNCH_DAMAGE = 8;
		const KICK_DAMAGE = 12;
		const HEAVY_DAMAGE = 20;
		const PUNCH_COOLDOWN = 300; // ms
		const KICK_COOLDOWN = 500;
		const HEAVY_COOLDOWN = 800;
		const ATTACK_ACTIVE_TIME = 120; // ms
		const HIT_STUN_TIME = 250; // ms
		const KNOCKBACK_DISTANCE = 40;
		const BLOCK_DAMAGE_REDUCTION = 0.7;

		// PS2-style color palette
		const COLORS = {
			background: "#0a0a1a",
			ground: "#1a1a2e",
			groundLine: "#2a2a3a",

			p1: "#8b4fa8", // Purple/black
			p1Accent: "#b86fd4",
			p2: "#4a6fa8", // Blue/gray
			p2Accent: "#6b8fd4",

			healthBarBg: "#2a2a3a",
			healthBarP1: "#8b4fa8",
			healthBarP2: "#4a6fa8",
			timer: "#f4f1de",
			text: "#f4f1de",

			impactFlash: "#ffffff",
		};

		// =========================================
		// STATE
		// =========================================

		let _canvas = null;
		let _ctx = null;
		let _isRunning = false;
		let _isPaused = false;
		let _isGameOver = false;
		let _animationId = null;
		let _lastTime = 0;
		let _gameStartTime = 0;

		// Game state machine
		const STATE = {
			INTRO: "intro",
			FIGHTING: "fighting",
			ROUND_END: "round_end",
			MATCH_END: "match_end",
			GAME_OVER_OVERLAY: "game_over_overlay",
		};
		let _gameState = STATE.INTRO;
		let _stateTimer = 0;

		// Match state
		let _roundNumber = 1;
		let _p1RoundsWon = 0;
		let _p2RoundsWon = 0;
		let _roundTimeLeft = ROUND_TIME_LIMIT;
		let _roundEndReason = ""; // 'ko', 'timeout', 'draw'

		// Fighters
		let _p1 = null;
		let _p2 = null;

		// P1 sprites (still, step, block, kick - kick used for punch and kick)
		const _p1Sprites = {};
		let _p1SpritesLoaded = false;
		const _bgImages = {}; // round 1, 2, 3

		// Effects
		let _screenShake = 0;
		let _impactFlash = 0;
		let _impactFlashColor = "#ffffff"; // Red if P1 hit, blue if P2 hit
		let _comboText = null; // { x, y, timer, alpha }

		// Acorn collectible (3 combo hits on P2)
		let _p1ComboHitsCount = 0;
		let _acornAwarded = false;
		let _acornCollectAnim = null;
		let _sparkles = [];
		let _foundTextLeftMs = 0;
		const _sparkleColors = ["#ffffff", "#fff1a8", "#d4a574", "#8b4513"];

		// Input
		const _keys = {};
		let _lastP1AttackTime = 0;
		let _lastP2AttackTime = 0;
		let _lastP2DecisionTime = 0;
		let _p2NextDecisionDelay = 0;

		// Auto-restart
		let _restartTimeout = null;
		let _debugSkip = false;

		// =========================================
		// FIGHTER CLASS
		// =========================================

		function createFighter(x, y, isPlayer) {
			return {
				x: x,
				y: y,
				vx: 0,
				vy: 0,
				hp: isPlayer ? P1_MAX_HP : P2_MAX_HP,
				maxHp: isPlayer ? P1_MAX_HP : P2_MAX_HP,
				facing: isPlayer ? 1 : -1, // 1 = right, -1 = left
				isGrounded: true,
				isCrouching: false,
				isBlocking: false,
				state: "idle", // 'idle', 'walking', 'jumping', 'crouching', 'attacking', 'hit', 'blocking'
				attackType: null, // 'punch', 'kick', 'heavy'
				attackTimer: 0,
				hitStunTimer: 0,
				isPlayer: isPlayer,
				color: isPlayer ? COLORS.p1 : COLORS.p2,
				accentColor: isPlayer ? COLORS.p1Accent : COLORS.p2Accent,
			};
		}

		// =========================================
		// INITIALIZATION
		// =========================================

		function init() {
			console.log("[Tekken] Initializing...");
			_canvas = document.getElementById("game-canvas");
			if (!_canvas) {
				console.error("[Tekken] Canvas not found");
				return;
			}
			_ctx = _canvas.getContext("2d");
			_ctx.imageSmoothingEnabled = false;

			// Load P1 sprites
			const base = "Decade/assets/sprites/tekken/";
			const names = ["still", "step", "block", "kick"];
			const sides = ["left", "right"];
			let loaded = 0;
			const total = names.length * sides.length;
			names.forEach((name) => {
				sides.forEach((side) => {
					const key = `${name}_${side}`;
					const img = new Image();
					img.onload = () => {
						_p1Sprites[key] = img;
						loaded++;
						if (loaded >= total) _p1SpritesLoaded = true;
					};
					img.onerror = () => {
						loaded++;
						if (loaded >= total) _p1SpritesLoaded = true;
					};
					img.src = `${base}player1_${name}_${side}.png`;
				});
			});

			["tekken_background.png", "tekken_background2.png", "tekken_background3.png"].forEach((name, i) => {
				const img = new Image();
				img.src = `${base}${name}`;
				_bgImages[i + 1] = img;
			});

			_resetMatch();
			_render();
		}

		function _resetMatch() {
			_roundNumber = 1;
			_p1RoundsWon = 0;
			_p2RoundsWon = 0;
			_resetAcornForNewMatch();
			_resetRound();
		}

		function _resetRound() {
			_gameState = STATE.INTRO;
			_stateTimer = 0;
			_roundTimeLeft = ROUND_TIME_LIMIT;
			_roundEndReason = "";

			// Reset fighters
			_p1 = createFighter(ARENA_LEFT + 150, GROUND_Y, true);
			_p2 = createFighter(ARENA_RIGHT - 150, GROUND_Y, false);

			_screenShake = 0;
			_impactFlash = 0;
			_impactFlashColor = "#ffffff";
			_comboText = null;
			_lastP1AttackTime = 0;
			_lastP2AttackTime = 0;
			_lastP2DecisionTime = 0;
			_p2NextDecisionDelay = 0;
		}

		// Acorn: reset per match (combo count persists across rounds)
		function _resetAcornForNewMatch() {
			_p1ComboHitsCount = 0;
			_acornAwarded = false;
			_acornCollectAnim = null;
			_foundTextLeftMs = 0;
		}

		// =========================================
		// INPUT HANDLING
		// =========================================

		function _handleKeyDown(e) {
			_keys[e.code] = true;

			// Debug skip (score 0 so overlay shows 0000)
			if (e.code === "NumpadMultiply" || (e.code === "Digit8" && e.shiftKey)) {
				_debugSkip = true;
				_p1RoundsWon = 2;
				_triggerMatchWin();
			}
		}

		function _handleKeyUp(e) {
			_keys[e.code] = false;
		}

		// =========================================
		// UPDATE LOGIC
		// =========================================

		function _update(dt) {
			if (_isPaused || _isGameOver) return;

			const dtS = dt / 1000;

			// State machine
			switch (_gameState) {
				case STATE.INTRO:
					_stateTimer += dt;
					if (_stateTimer > 2000) {
						// 2 second intro
						_gameState = STATE.FIGHTING;
						_stateTimer = 0;
					}
					break;

				case STATE.FIGHTING:
					_roundTimeLeft -= dtS;
					if (_roundTimeLeft <= 0) {
						_roundTimeLeft = 0;
						_checkRoundEnd();
					}

					_updateFighters(dt);
					_updateAI(dt);
					_checkHits();
					_updateEffects(dt);
					break;

				case STATE.ROUND_END:
					_stateTimer += dt;
					if (_stateTimer > 2000) {
						// 2 second round end
						_nextRound();
					}
					break;

				case STATE.MATCH_END:
					// Match complete, emit event
					break;

				case STATE.GAME_OVER_OVERLAY:
					_stateTimer += dt;
					if (_stateTimer > 2500) {
						// 2.5 second overlay
						_resetMatch();
						_gameState = STATE.INTRO;
						_stateTimer = 0;
					}
					break;
			}

			_updateHUD();
		}

		function _updateFighters(dt) {
			const dtS = dt / 1000;

			// Update P1 (player)
			_updateFighter(_p1, dtS, true);

			// Update P2 (CPU)
			_updateFighter(_p2, dtS, false);

			// Face each other
			if (_p1.x < _p2.x) {
				_p1.facing = 1;
				_p2.facing = -1;
			} else {
				_p1.facing = -1;
				_p2.facing = 1;
			}
		}

		function _updateFighter(fighter, dtS, isPlayer) {
			// Update timers
			if (fighter.attackTimer > 0) {
				fighter.attackTimer -= dtS * 1000;
				if (fighter.attackTimer <= 0) {
					fighter.state = "idle";
					fighter.attackType = null;
					fighter.attackWasCombo = false;
				}
			}

			if (fighter.hitStunTimer > 0) {
				fighter.hitStunTimer -= dtS * 1000;
				if (fighter.hitStunTimer <= 0) {
					fighter.state = "idle";
				}
			}

			// Skip input/physics if in hit stun or attacking
			if (fighter.hitStunTimer > 0 || fighter.attackTimer > 0) {
				fighter.vx *= 0.8; // Friction
				fighter.x += fighter.vx * dtS;
				_clampFighter(fighter);
				return;
			}

			if (isPlayer) {
				_handlePlayerInput(fighter, dtS);
			}

			// Apply gravity
			if (!fighter.isGrounded) {
				fighter.vy += GRAVITY * dtS;
			}

			// Update position
			fighter.x += fighter.vx * dtS;
			fighter.y += fighter.vy * dtS;

			// Ground collision
			if (fighter.y >= GROUND_Y) {
				fighter.y = GROUND_Y;
				fighter.vy = 0;
				fighter.isGrounded = true;
				if (fighter.state === "jumping") {
					fighter.state = "idle";
				}
			}

			// Friction
			if (fighter.isGrounded) {
				fighter.vx *= 0.85;
			}

			_clampFighter(fighter);
		}

		function _handlePlayerInput(fighter, dtS) {
			const now = performance.now();

			// Movement
			let moving = false;
			if (_keys["ArrowLeft"] || _keys["KeyA"]) {
				fighter.vx = -WALK_SPEED;
				fighter.facing = -1;
				moving = true;
			} else if (_keys["ArrowRight"] || _keys["KeyD"]) {
				fighter.vx = WALK_SPEED;
				fighter.facing = 1;
				moving = true;
			}

			// Jump
			if ((_keys["ArrowUp"] || _keys["KeyW"]) && fighter.isGrounded && fighter.state !== "jumping") {
				fighter.vy = -JUMP_VEL;
				fighter.isGrounded = false;
				fighter.state = "jumping";
			}

			// Crouch
			if (_keys["ArrowDown"] || _keys["KeyS"]) {
				fighter.isCrouching = true;
				fighter.state = "crouching";
			} else {
				fighter.isCrouching = false;
			}

			// Block (check Space key - can be 'Space' or 'Spacebar')
			if (_keys["Space"] || _keys["Spacebar"]) {
				fighter.isBlocking = true;
				if (fighter.state !== "attacking") {
					fighter.state = "blocking";
				}
			} else {
				fighter.isBlocking = false;
			}

			// Attacks (only if not blocking)
			if (!fighter.isBlocking) {
				// Combo: Jump + Heavy
				if (
					fighter.state === "jumping" &&
					_keys["ShiftLeft"] &&
					now - _lastP1AttackTime > HEAVY_COOLDOWN &&
					fighter.attackTimer <= 0
				) {
					fighter.state = "attacking";
					fighter.attackType = "heavy";
					fighter.attackTimer = ATTACK_ACTIVE_TIME;
					fighter.attackWasCombo = true;
					_lastP1AttackTime = now;
					_showComboText(fighter.x, fighter.y - FIGHTER_HEIGHT);
				}
				// Combo: Crouch + Kick
				else if (
					fighter.isCrouching &&
					_keys["KeyK"] &&
					now - _lastP1AttackTime > KICK_COOLDOWN &&
					fighter.attackTimer <= 0
				) {
					fighter.state = "attacking";
					fighter.attackType = "kick";
					fighter.attackTimer = ATTACK_ACTIVE_TIME;
					fighter.attackWasCombo = true;
					_lastP1AttackTime = now;
					_showComboText(fighter.x, fighter.y);
				}
				// Regular attacks
				else if (_keys["KeyJ"] && now - _lastP1AttackTime > PUNCH_COOLDOWN && fighter.state !== "attacking") {
					fighter.state = "attacking";
					fighter.attackType = "punch";
					fighter.attackTimer = ATTACK_ACTIVE_TIME;
					_lastP1AttackTime = now;
				} else if (_keys["KeyK"] && now - _lastP1AttackTime > KICK_COOLDOWN && fighter.state !== "attacking") {
					fighter.state = "attacking";
					fighter.attackType = "kick";
					fighter.attackTimer = ATTACK_ACTIVE_TIME;
					_lastP1AttackTime = now;
				} else if (
					_keys["ShiftLeft"] &&
					now - _lastP1AttackTime > HEAVY_COOLDOWN &&
					fighter.state !== "attacking"
				) {
					fighter.state = "attacking";
					fighter.attackType = "heavy";
					fighter.attackTimer = ATTACK_ACTIVE_TIME;
					_lastP1AttackTime = now;
				}
			}

			// Update state
			if (
				!moving &&
				fighter.isGrounded &&
				!fighter.isCrouching &&
				!fighter.isBlocking &&
				fighter.state !== "attacking"
			) {
				fighter.state = "idle";
			} else if (moving && fighter.isGrounded && fighter.state !== "attacking") {
				fighter.state = "walking";
			}
		}

		function _updateAI(dt) {
			const now = performance.now();
			const fighter = _p2;

			if (fighter.hitStunTimer > 0 || fighter.attackTimer > 0) return;

			const dist = Math.abs(_p1.x - fighter.x);

			// Random decision timing – wait before making next choice
			if (now - _lastP2DecisionTime < _p2NextDecisionDelay) return;

			// Simple AI behavior
			if (dist > 200) {
				// Move toward player
				if (_p1.x < fighter.x) {
					fighter.vx = -WALK_SPEED * 0.8;
				} else {
					fighter.vx = WALK_SPEED * 0.8;
				}
				fighter.state = "walking";
				_p2NextDecisionDelay = 80 + Math.random() * 120; // 80–200 ms
				_lastP2DecisionTime = now;
			} else {
				// Close range: choose action with varied timing and type
				fighter.vx *= 0.9;

				const action = Math.random();

				if (action < 0.25) {
					fighter.isBlocking = true;
					fighter.state = "blocking";
					_p2NextDecisionDelay = 150 + Math.random() * 350; // 150–500 ms
				} else if (action < 0.7) {
					// Attack – pick random type
					const attackRoll = Math.random();
					let attackType = null;
					let cooldown = 0;
					if (attackRoll < 0.45 && now - _lastP2AttackTime > PUNCH_COOLDOWN) {
						attackType = "punch";
						cooldown = PUNCH_COOLDOWN;
					} else if (attackRoll < 0.75 && now - _lastP2AttackTime > KICK_COOLDOWN) {
						attackType = "kick";
						cooldown = KICK_COOLDOWN;
					} else if (now - _lastP2AttackTime > HEAVY_COOLDOWN) {
						attackType = "heavy";
						cooldown = HEAVY_COOLDOWN;
					}
					if (attackType) {
						fighter.state = "attacking";
						fighter.attackType = attackType;
						fighter.attackTimer = ATTACK_ACTIVE_TIME;
						_lastP2AttackTime = now;
						_p2NextDecisionDelay = cooldown * 0.5 + Math.random() * 400; // varied follow-up
					} else {
						_p2NextDecisionDelay = 100 + Math.random() * 200;
					}
				} else if (action < 0.9) {
					fighter.vx = (fighter.facing === 1 ? -1 : 1) * WALK_SPEED * 0.5;
					fighter.state = "walking";
					_p2NextDecisionDelay = 120 + Math.random() * 280; // 120–400 ms
				} else {
					// Idle / slight pause
					_p2NextDecisionDelay = 80 + Math.random() * 320; // 80–400 ms
				}
				_lastP2DecisionTime = now;
			}

			// Adaptive: block more if player attacks frequently
			if (now - _lastP1AttackTime < 500 && Math.random() < 0.6) {
				fighter.isBlocking = true;
				fighter.state = "blocking";
			}
		}

		function _clampFighter(fighter) {
			fighter.x = Math.max(ARENA_LEFT + FIGHTER_WIDTH / 2, Math.min(ARENA_RIGHT - FIGHTER_WIDTH / 2, fighter.x));
		}

		function _checkHits() {
			// Check if P1 hits P2 first – if player scores, don't also apply P2's hit (no trade)
			if (_p1.attackTimer > 0 && _p1.attackType && _p2.hitStunTimer <= 0) {
				const hitbox = _getAttackHitbox(_p1);
				if (_checkHitboxCollision(hitbox, _p2)) {
					_applyHit(_p1, _p2);
					return; // Player landed the hit, skip P2 hit check
				}
			}

			// Check if P2 hits P1
			if (_p2.attackTimer > 0 && _p2.attackType && _p1.hitStunTimer <= 0) {
				const hitbox = _getAttackHitbox(_p2);
				if (_checkHitboxCollision(hitbox, _p1)) {
					_applyHit(_p2, _p1);
				}
			}
		}

		function _getAttackHitbox(attacker) {
			let range, hitboxY, hitboxHeight;

			if (attacker.attackType === "punch") {
				// Punch: small, higher on body (upper body/head area)
				range = 50;
				hitboxY = attacker.y - FIGHTER_HEIGHT * 0.7; // Upper body
				hitboxHeight = FIGHTER_HEIGHT * 0.25; // Small height
			} else if (attacker.attackType === "kick") {
				// Kick: bigger, lower on body (legs area)
				range = 65;
				hitboxY = attacker.y - FIGHTER_HEIGHT * 0.2; // Lower body/legs
				hitboxHeight = FIGHTER_HEIGHT * 0.4; // Medium height
			} else {
				// Heavy attack: full length
				range = 85;
				hitboxY = attacker.y - FIGHTER_HEIGHT / 2; // Full body
				hitboxHeight = FIGHTER_HEIGHT * 0.8; // Full height
			}

			// Place hitbox in front of attacker in attack direction (works for both left and right)
			const edge = attacker.x + attacker.facing * (FIGHTER_WIDTH / 2);
			const hitboxX = attacker.facing === 1 ? edge : edge - range;

			return {
				x: hitboxX,
				y: hitboxY,
				width: range,
				height: hitboxHeight,
			};
		}

		function _checkHitboxCollision(hitbox, target) {
			const targetBox = {
				x: target.x - FIGHTER_WIDTH / 2,
				y: target.y - FIGHTER_HEIGHT,
				width: FIGHTER_WIDTH,
				height: FIGHTER_HEIGHT,
			};

			return (
				hitbox.x < targetBox.x + targetBox.width &&
				hitbox.x + hitbox.width > targetBox.x &&
				hitbox.y < targetBox.y + targetBox.height &&
				hitbox.y + hitbox.height > targetBox.y
			);
		}

		function _applyHit(attacker, defender) {
			// Check if defender is blocking
			const isBlocked = defender.isBlocking && defender.facing === -attacker.facing;

			let damage = 0;
			if (attacker.attackType === "punch") {
				damage = PUNCH_DAMAGE;
			} else if (attacker.attackType === "kick") {
				damage = KICK_DAMAGE;
			} else if (attacker.attackType === "heavy") {
				damage = HEAVY_DAMAGE;
			}

			if (isBlocked) {
				damage = Math.floor(damage * (1 - BLOCK_DAMAGE_REDUCTION));
			}

			defender.hp = Math.max(0, defender.hp - damage);

			// Apply knockback and stun
			if (!isBlocked || damage > 0) {
				const knockback = isBlocked ? KNOCKBACK_DISTANCE * 0.3 : KNOCKBACK_DISTANCE;
				defender.x += attacker.facing * knockback;
				defender.vx = attacker.facing * (isBlocked ? 50 : 150);
				defender.hitStunTimer = HIT_STUN_TIME;
				defender.state = "hit";

				// Screen effects
				_screenShake = 80;
				_impactFlash = 120;
				// Red flash if P1 hit, blue flash if P2 hit
				_impactFlashColor = defender.isPlayer ? "#ff0000" : "#0000ff";
			}

			// Acorn collectible: P1 lands combo on P2 three times
			if (attacker.isPlayer && defender.isPlayer === false && attacker.attackWasCombo) {
				attacker.attackWasCombo = false;
				_p1ComboHitsCount++;
				if (_p1ComboHitsCount >= 3 && !_acornAwarded) {
					_triggerAcornAward(attacker.x, attacker.y);
				}
			}

			// Check for KO
			if (defender.hp <= 0) {
				_roundEndReason = "ko";
				_checkRoundEnd();
			}
		}

		function _updateEffects(dt) {
			if (_screenShake > 0) {
				_screenShake -= dt;
				if (_screenShake < 0) _screenShake = 0;
			}
			if (_impactFlash > 0) {
				_impactFlash -= dt;
				if (_impactFlash < 0) _impactFlash = 0;
			}
			if (_comboText) {
				_comboText.timer -= dt;
				_comboText.y -= dt * 0.1; // Float upward
				_comboText.alpha = Math.min(1, _comboText.timer / 1000); // Fade out
				if (_comboText.timer <= 0) {
					_comboText = null;
				}
			}
			// Sparkles
			if (_sparkles.length > 0) {
				const dtS = dt / 1000;
				const gravity = 320;
				for (let i = _sparkles.length - 1; i >= 0; i--) {
					const p = _sparkles[i];
					p.vy += gravity * dtS;
					p.x += p.vx * dtS;
					p.y += p.vy * dtS;
					p.lifeMs -= dt;
					if (p.lifeMs <= 0) _sparkles.splice(i, 1);
				}
			}
			if (_acornCollectAnim && _acornCollectAnim.active) {
				const elapsed = performance.now() - _acornCollectAnim.startMs;
				if (elapsed >= _acornCollectAnim.durationMs) {
					_acornCollectAnim.active = false;
					_acornCollectAnim = null;
				}
			}
			if (_foundTextLeftMs > 0) _foundTextLeftMs = Math.max(0, _foundTextLeftMs - dt);
		}

		function _showComboText(x, y) {
			_comboText = {
				x: x,
				y: y,
				timer: 1000, // 1 second
				alpha: 1,
			};
		}

		function _triggerAcornAward(centerX, centerY) {
			if (_acornAwarded) return;
			try {
				if (
					typeof StateManager !== "undefined" &&
					typeof StateManager.isCollected === "function" &&
					StateManager.isCollected("era3", 9)
				) {
					_acornAwarded = true;
					return;
				}
			} catch (_) {}
			_acornAwarded = true;
			try {
				if (typeof StateManager !== "undefined" && StateManager.collectItem) {
					StateManager.collectItem({ eraKey: "era3", level: 9, itemId: "acorn" });
				}
			} catch (_) {}
			const letterboxHeight = 40;
			const padding = 20;
			const toX = padding + 50;
			const toY = letterboxHeight + padding + 30;
			_acornCollectAnim = {
				fromX: centerX,
				fromY: centerY,
				toX: toX,
				toY: toY,
				startMs: performance.now(),
				durationMs: 1100,
				active: true,
			};
			_spawnSparkleBurst(centerX, centerY, 28);
			_foundTextLeftMs = 500;
		}

		function _spawnSparkleBurst(x, y, count) {
			for (let i = 0; i < count; i++) {
				const color = _sparkleColors[Math.floor(Math.random() * _sparkleColors.length)];
				const size = 1 + Math.floor(Math.random() * 3);
				const angle = Math.random() * Math.PI * 2;
				const speed = 120 + Math.random() * 400;
				_sparkles.push({
					x: x + (Math.random() - 0.5) * 20,
					y: y + (Math.random() - 0.5) * 20,
					vx: Math.cos(angle) * speed,
					vy: Math.sin(angle) * speed - 40 - Math.random() * 120,
					lifeMs: 420 + Math.random() * 480,
					maxLifeMs: 900,
					size,
					color,
				});
			}
		}

		function _easeOutElastic(t) {
			if (t === 0) return 0;
			if (t === 1) return 1;
			const c4 = (2 * Math.PI) / 3;
			return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
		}
		function _easeInOutCubic(t) {
			return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
		}

		function _checkRoundEnd() {
			if (_roundEndReason === "ko") {
				// KO - attacker wins
				if (_p1.hp <= 0) {
					_p2RoundsWon++;
				} else {
					_p1RoundsWon++;
				}
			} else if (_roundTimeLeft <= 0) {
				// Timeout
				if (_p1.hp > _p2.hp) {
					_p1RoundsWon++;
					_roundEndReason = "timeout";
				} else if (_p2.hp > _p1.hp) {
					_p2RoundsWon++;
					_roundEndReason = "timeout";
				} else {
					// Draw - restart round
					_roundEndReason = "draw";
					_resetRound();
					return;
				}
			}

			_gameState = STATE.ROUND_END;
			_stateTimer = 0;

			// Check match end
			if (_p1RoundsWon >= ROUNDS_TO_WIN) {
				_triggerMatchWin();
			} else if (_p2RoundsWon >= ROUNDS_TO_WIN) {
				_triggerMatchLoss();
			}
		}

		function _nextRound() {
			_roundNumber++;
			_resetRound();
		}

		function _triggerMatchWin() {
			_gameState = STATE.MATCH_END;
			_isGameOver = true;

			const skip = _debugSkip;
			_debugSkip = false;
			const score = skip ? 0 : _p1RoundsWon * 100;

			if (typeof EventBus !== "undefined") {
				EventBus.emit(EventBus.Events.MINIGAME_END, {
					success: true,
					score,
					roundsWon: _p1RoundsWon,
					roundsLost: _p2RoundsWon,
				});
			}
		}

		function _triggerMatchLoss() {
			_gameState = STATE.GAME_OVER_OVERLAY;
			_stateTimer = 0;
			_isGameOver = true;

			// Auto-restart after delay
			if (_restartTimeout) {
				clearTimeout(_restartTimeout);
			}
			_restartTimeout = setTimeout(() => {
				_resetMatch();
				_gameState = STATE.INTRO;
				_stateTimer = 0;
				_isGameOver = false;
			}, 2500);
		}

		function _updateHUD() {
			if (typeof StateManager !== "undefined") {
				StateManager.updateLevelData({
					p1Hp: _p1 ? _p1.hp : 0,
					p2Hp: _p2 ? _p2.hp : 0,
					roundNumber: _roundNumber,
					p1RoundsWon: _p1RoundsWon,
					p2RoundsWon: _p2RoundsWon,
					timeLeft: Math.ceil(_roundTimeLeft),
					score: _p1RoundsWon * 100,
				});
			}
		}

		// =========================================
		// RENDERING
		// =========================================

		function _render() {
			if (!_ctx) return;

			// Clear
			CanvasRenderer.clear(COLORS.background);

			// Apply screen shake
			const shakeX = _screenShake > 0 ? (Math.random() - 0.5) * 4 : 0;
			const shakeY = _screenShake > 0 ? (Math.random() - 0.5) * 4 : 0;
			_ctx.save();
			_ctx.translate(shakeX, shakeY);

			// Draw background image (per round)
			const bg = _bgImages[_roundNumber] || _bgImages[1];
			if (bg && bg.complete && bg.naturalWidth > 0) {
				_ctx.drawImage(bg, 0, 0, _canvas.width, _canvas.height);
			}

			// Draw ground (only if no background image)
			if (!bg || !bg.complete || !bg.naturalWidth) {
				CanvasRenderer.drawRect(0, GROUND_Y, _canvas.width, _canvas.height - GROUND_Y, COLORS.ground);
				CanvasRenderer.drawLine(0, GROUND_Y, _canvas.width, GROUND_Y, COLORS.groundLine, 2);
			}

			// Draw fighters
			if (_p1 && _p2) {
				_drawFighter(_p1);
				_drawFighter(_p2);
			}

			_ctx.restore();

			// Impact flash (red if P1 hit, blue if P2 hit)
			if (_impactFlash > 0) {
				const alpha = _impactFlash / 120;
				const color = _impactFlashColor === "#ff0000" ? "255, 0, 0" : "0, 0, 255";
				_ctx.fillStyle = `rgba(${color}, ${alpha * 0.55})`;
				_ctx.fillRect(0, 0, _canvas.width, _canvas.height);
			}

			// Draw UI
			_drawUI();

			// Draw letterbox bars (PS2 cinematic)
			_drawLetterbox();

			// Acorn collect animation (sparkles + fly-to-HUD)
			_renderSparkles();
			_renderAcornCollectAnim();

			// Draw combo text
			if (_comboText) {
				CanvasRenderer.setAlpha(_comboText.alpha);
				CanvasRenderer.drawText("COMBO", _comboText.x, _comboText.y, {
					color: "#ff00ff",
					size: 20,
					align: "center",
				});
				CanvasRenderer.setAlpha(1);
			}

			// Draw overlays
			if (_gameState === STATE.INTRO) {
				_drawRoundIntro();
			} else if (_gameState === STATE.ROUND_END) {
				_drawRoundEnd();
			} else if (_gameState === STATE.GAME_OVER_OVERLAY) {
				_drawGameOver();
			}
		}

		function _drawFighter(fighter) {
			const x = fighter.x;
			const y = fighter.y - FIGHTER_HEIGHT / 2;

			// P1: use sprites (still, step, block, kick - kick for both punch and kick)
			if (fighter.isPlayer && _p1SpritesLoaded) {
				const side = fighter.facing === 1 ? "right" : "left";
				let spriteName;
				if (fighter.state === "blocking") {
					spriteName = `block_${side}`;
				} else if (
					fighter.state === "attacking" &&
					(fighter.attackType === "punch" || fighter.attackType === "kick" || fighter.attackType === "heavy")
				) {
					spriteName = `kick_${side}`;
				} else if (fighter.state === "walking" || fighter.state === "jumping") {
					spriteName = `step_${side}`;
				} else {
					spriteName = `still_${side}`;
				}
				const img = _p1Sprites[spriteName];
				if (img) {
					const drawW = FIGHTER_WIDTH * 2.8;
					const drawH = FIGHTER_HEIGHT * 2.8;
					const dx = x - drawW / 2;
					const dy = fighter.y - drawH + 65;
					_ctx.drawImage(img, dx, dy, drawW, drawH);
					if (fighter.attackTimer > 0 && fighter.attackType) {
						_drawAttackBar(fighter);
					}
					return;
				}
			}

			// Fallback: draw silhouette (P2 or before sprites load)
			CanvasRenderer.drawRect(x - FIGHTER_WIDTH / 2, y, FIGHTER_WIDTH, FIGHTER_HEIGHT, fighter.color);
			CanvasRenderer.drawRect(
				x - FIGHTER_WIDTH / 4,
				y + 10,
				FIGHTER_WIDTH / 2,
				FIGHTER_HEIGHT / 3,
				fighter.accentColor
			);
			if (fighter.attackTimer > 0 && fighter.attackType) {
				_drawAttackBar(fighter);
			}
		}

		function _drawAttackBar(fighter) {
			const color =
				fighter.attackType === "punch" ? "#ff8800" : fighter.attackType === "kick" ? "#00aaff" : "#aa00ff"; // heavy
			const indicatorY = fighter.y - FIGHTER_HEIGHT * 0.5;
			const attackX = fighter.x + fighter.facing * (FIGHTER_WIDTH / 2 + 10);
			CanvasRenderer.drawRect(attackX - 5, indicatorY, 10, 40, color);
		}

		function _renderSparkles() {
			if (!_sparkles.length || !_ctx) return;
			for (let i = 0; i < _sparkles.length; i++) {
				const p = _sparkles[i];
				const a = Math.min(1, Math.max(0, p.lifeMs / p.maxLifeMs));
				_ctx.save();
				_ctx.globalAlpha = a;
				_ctx.fillStyle = p.color;
				const x = Math.round(p.x);
				const y = Math.round(p.y);
				const s = p.size;
				_ctx.fillRect(x, y, s, s);
				_ctx.fillRect(x - s, y, s, s);
				_ctx.fillRect(x + s, y, s, s);
				_ctx.fillRect(x, y - s, s, s);
				_ctx.fillRect(x, y + s, s, s);
				_ctx.restore();
			}
		}

		function _renderAcornCollectAnim() {
			if (!_acornCollectAnim || !_acornCollectAnim.active || !_ctx) return;
			const now = performance.now();
			const elapsed = now - _acornCollectAnim.startMs;
			const duration = _acornCollectAnim.durationMs;
			const phaseA = 350;
			const phaseB = duration - phaseA;

			let x = _acornCollectAnim.fromX;
			let y = _acornCollectAnim.fromY;
			let scale = 1;
			let alpha = 1;

			if (elapsed <= phaseA) {
				const t = Math.min(1, Math.max(0, elapsed / phaseA));
				scale = 0.6 + 0.55 * _easeOutElastic(t);
			} else {
				const t = Math.min(1, Math.max(0, (elapsed - phaseA) / phaseB));
				const e = _easeInOutCubic(t);
				x = _acornCollectAnim.fromX + (_acornCollectAnim.toX - _acornCollectAnim.fromX) * e;
				y =
					_acornCollectAnim.fromY +
					(_acornCollectAnim.toY - _acornCollectAnim.fromY) * e -
					Math.sin(Math.PI * t) * 34;
				scale = 1.15 + (0.35 - 1.15) * e;
				alpha = 1 - 0.05 * e;
			}

			_ctx.save();
			_ctx.globalAlpha = alpha;
			_ctx.textAlign = "center";
			_ctx.textBaseline = "middle";
			const baseSize = 72;
			const sizePx = Math.max(10, Math.round(baseSize * scale));
			_ctx.font = `bold ${sizePx}px Arial, sans-serif`;
			_ctx.fillStyle = "#ffffff";
			_ctx.fillText("🌰", Math.round(x), Math.round(y));
			_ctx.restore();

			if (_foundTextLeftMs > 0) {
				const t2 = Math.min(1, _foundTextLeftMs / 400);
				_ctx.save();
				_ctx.globalAlpha = t2;
				CanvasRenderer.drawText("FOUND 🌰!", _acornCollectAnim.fromX, _acornCollectAnim.fromY + 54, {
					color: COLORS.text,
					size: 16,
					align: "center",
				});
				_ctx.restore();
			}
		}

		function _drawUI() {
			const letterboxHeight = 40;
			const padding = 20;
			const uiY = letterboxHeight + padding; // Start below letterbox

			// P1 Health bar (top-left)
			const barWidth = 200;
			const barHeight = 20;
			const p1X = padding;
			const p1Y = uiY;

			CanvasRenderer.drawRect(p1X, p1Y, barWidth, barHeight, COLORS.healthBarBg);
			if (_p1) {
				const hpPercent = _p1.hp / _p1.maxHp;
				CanvasRenderer.drawRect(p1X, p1Y, barWidth * hpPercent, barHeight, COLORS.healthBarP1);
			}
			CanvasRenderer.drawRectOutline(p1X, p1Y, barWidth, barHeight, COLORS.text, 2);
			CanvasRenderer.drawText("P1", p1X + 5, p1Y + 15, { color: COLORS.text, size: 10 });

			// P2 Health bar (top-right)
			const p2X = _canvas.width - barWidth - padding;
			const p2Y = uiY;

			CanvasRenderer.drawRect(p2X, p2Y, barWidth, barHeight, COLORS.healthBarBg);
			if (_p2) {
				const hpPercent = _p2.hp / _p2.maxHp;
				CanvasRenderer.drawRect(p2X, p2Y, barWidth * hpPercent, barHeight, COLORS.healthBarP2);
			}
			CanvasRenderer.drawRectOutline(p2X, p2Y, barWidth, barHeight, COLORS.text, 2);
			CanvasRenderer.drawText("P2", p2X + barWidth - 25, p2Y + 15, { color: COLORS.text, size: 10 });

			// Timer (center-top)
			const timeText = Math.ceil(_roundTimeLeft).toString();
			CanvasRenderer.drawText(timeText, _canvas.width / 2, uiY + 15, {
				color: COLORS.timer,
				size: 16,
				align: "center",
			});

			// Round win markers
			const markerSize = 8;
			const markerY = p1Y + barHeight + 10;

			// P1 wins
			for (let i = 0; i < ROUNDS_TO_WIN; i++) {
				const markerX = p1X + i * (markerSize + 5);
				const filled = i < _p1RoundsWon;
				CanvasRenderer.drawCircle(
					markerX + markerSize / 2,
					markerY + markerSize / 2,
					markerSize / 2,
					filled ? COLORS.healthBarP1 : COLORS.healthBarBg
				);
				CanvasRenderer.drawRectOutline(markerX, markerY, markerSize, markerSize, COLORS.text, 1);
			}

			// P2 wins
			for (let i = 0; i < ROUNDS_TO_WIN; i++) {
				const markerX = p2X + barWidth - (i + 1) * (markerSize + 5);
				const filled = i < _p2RoundsWon;
				CanvasRenderer.drawCircle(
					markerX + markerSize / 2,
					markerY + markerSize / 2,
					markerSize / 2,
					filled ? COLORS.healthBarP2 : COLORS.healthBarBg
				);
				CanvasRenderer.drawRectOutline(markerX, markerY, markerSize, markerSize, COLORS.text, 1);
			}

			// Controls hint (above letterbox bars)
			const controlsY = _canvas.height - letterboxHeight - 30; // Higher up to avoid letterbox
			CanvasRenderer.drawText(
				"ARROWS: Move | ✕/J: Punch | ❏/K: Kick | △/SHIFT: Heavy | O/SPACE: Block",
				_canvas.width / 2,
				controlsY,
				{
					color: COLORS.text,
					size: 10,
					align: "center",
				}
			);
			// Combo hints on second line
			CanvasRenderer.drawText("JUMP+△/SHIFT: Combo | DOWN+❏/K: Combo", _canvas.width / 2, controlsY + 15, {
				color: COLORS.text,
				size: 10,
				align: "center",
			});
		}

		function _drawLetterbox() {
			const barHeight = 40;
			CanvasRenderer.drawRect(0, 0, _canvas.width, barHeight, "#000000");
			CanvasRenderer.drawRect(0, _canvas.height - barHeight, _canvas.width, barHeight, "#000000");
		}

		function _drawRoundIntro() {
			const text = `ROUND ${_roundNumber}`;
			CanvasRenderer.drawText(text, _canvas.width / 2, _canvas.height / 2 - 20, {
				color: COLORS.text,
				size: 24,
				align: "center",
			});

			if (_stateTimer > 1000) {
				CanvasRenderer.drawText("FIGHT!", _canvas.width / 2, _canvas.height / 2 + 20, {
					color: "#ff0000",
					size: 32,
					align: "center",
				});
			}
		}

		function _drawRoundEnd() {
			let text = "";
			if (_roundEndReason === "ko") {
				text = "KO!";
			} else if (_roundEndReason === "timeout") {
				text = "TIME!";
			}

			CanvasRenderer.drawText(text, _canvas.width / 2, _canvas.height / 2, {
				color: "#ff0000",
				size: 32,
				align: "center",
			});
		}

		function _drawGameOver() {
			CanvasRenderer.fade(0.7);
			CanvasRenderer.drawText("YOU LOSE", _canvas.width / 2, _canvas.height / 2, {
				color: "#ff0000",
				size: 36,
				align: "center",
			});
		}

		// =========================================
		// GAME LOOP
		// =========================================

		function _gameLoop(currentTime = performance.now()) {
			if (!_isRunning) return;

			if (_lastTime === 0) {
				_lastTime = currentTime;
			}

			const dt = currentTime - _lastTime;
			_lastTime = currentTime;

			if (!_isPaused) {
				_update(dt);
			}

			_render();

			_animationId = requestAnimationFrame(_gameLoop);
		}

		// =========================================
		// LIFECYCLE METHODS
		// =========================================

		function start() {
			if (_isRunning) return;
			console.log("[Tekken] Starting...");
			_isRunning = true;
			_isPaused = false;
			_lastTime = 0;
			_gameStartTime = performance.now();

			window.addEventListener("keydown", _handleKeyDown);
			window.addEventListener("keyup", _handleKeyUp);

			_gameLoop();
		}

		function pause() {
			if (!_isRunning || _isPaused) return;
			console.log("[Tekken] Paused");
			_isPaused = true;
		}

		function resume() {
			if (!_isRunning || !_isPaused) return;
			console.log("[Tekken] Resumed");
			_isPaused = false;
			_lastTime = performance.now();
		}

		function stop() {
			if (!_isRunning) return;
			console.log("[Tekken] Stopping...");
			_isRunning = false;
			_isPaused = false;

			if (_animationId) {
				cancelAnimationFrame(_animationId);
				_animationId = null;
			}

			window.removeEventListener("keydown", _handleKeyDown);
			window.removeEventListener("keyup", _handleKeyUp);

			if (_restartTimeout) {
				clearTimeout(_restartTimeout);
				_restartTimeout = null;
			}
		}

		function destroy() {
			stop();
			console.log("[Tekken] Destroyed");
		}

		function getState() {
			return {
				round: _roundNumber,
				p1RoundsWon: _p1RoundsWon,
				p2RoundsWon: _p2RoundsWon,
				p1Hp: _p1 ? _p1.hp : 0,
				p2Hp: _p2 ? _p2.hp : 0,
				timeLeft: _roundTimeLeft,
			};
		}

		// Return game instance
		return {
			init,
			start,
			pause,
			resume,
			stop,
			destroy,
			getState,
		};
	}

	// Register game
	if (typeof GameLoader !== "undefined" && GameLoader.registerGame) {
		GameLoader.registerGame("tekken", createTekkenGame);
	}
})();
