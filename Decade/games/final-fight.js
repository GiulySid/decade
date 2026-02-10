/**
 * final-fight.js
 * SNES-style beat-em-up mini-game for Level 4 (2019)
 *
 * Win condition: Defeat 12 enemies
 * Lose condition: Player HP reaches 0
 */

(function () {
	"use strict";

	/**
	 * Final Fight game factory
	 * @param {Object} config - Level configuration
	 * @returns {Object} Game instance
	 */
	function createFinalFightGame(config) {
		// =========================================
		// CONSTANTS
		// =========================================

		const ENEMIES_TO_WIN = config.config?.enemiesToWin || 12;
		const MAX_ENEMIES = config.config?.maxEnemiesOnScreen || 3;
		const WORLD_WIDTH = config.config?.stageLength || 1800;

		// Player settings
		const PLAYER_WIDTH = 24;
		const PLAYER_HEIGHT = 32;
		const PLAYER_SPEED = 180; // pixels per second
		const PLAYER_MAX_HP = 5;
		const ATTACK_COOLDOWN = 300; // ms between attacks
		const INVINCIBILITY_TIME = 800; // ms after being hit
		const ATTACK_RANGE = 28; // pixels

		// Jump (no vertical lane movement; only jump)
		const JUMP_VEL = 520; // px/s (jump impulse)
		const GRAVITY = 1600; // px/s^2
		const MAX_JUMP_HEIGHT = 80; // px (visual clamp)

		// Enemy settings
		const ENEMY_WIDTH = 24;
		const ENEMY_HEIGHT = 32;
		const ENEMY_SPEED = 80; // pixels per second
		const ENEMY_HP = 2;
		const SPAWN_INTERVAL = 2000; // ms between spawns

		// Special enemy: Golden Key (bigger, tougher). Killing it awards 💾 collectible for level 4.
		const KEY_ENEMY_CHANCE = 0.18; // spawn chance per spawn attempt (while not yet awarded)
		const KEY_ENEMY_W = 44;
		const KEY_ENEMY_H = 44;
		const KEY_ENEMY_HP = 6;
		const KEY_ENEMY_SPEED = 95;

		// SNES-style color palette
		const COLORS = {
			background: "#1a1c2c",
			backgroundMid: "#2a2040",
			ground: "#3b2d5a",
			groundLine: "#5c4a7a",

			player: "#4a9fff",
			playerHighlight: "#8ac4ff",
			playerHurt: "#ff6666",
			playerAttack: "#ffffff",

			enemy: "#f2c14e",
			enemyHighlight: "#ffdd77",
			enemyHurt: "#ff4444",

			key: "#ffd166",
			keyHighlight: "#fff1a8",
			keyEdge: "#caa200",

			text: "#f4f1de",
			textDim: "#8b8b8b",
			accent: "#f2c14e",
			hp: "#44ff44",
			hpLost: "#333333",
		};

		// =========================================
		// GAME STATE
		// =========================================

		let _isRunning = false;
		let _isPaused = false;
		let _isGameOver = false;
		let _isVictory = false;
		let _animationId = null;
		let _lastTime = 0;
		let _gameStartTime = 0;
		let _restartTimeout = null;

		// Canvas refs
		const _ctx = CanvasRenderer.getContext();
		const _canvas = CanvasRenderer.getCanvas();

		// Play area
		const GROUND_Y = _canvas.height * 0.65;
		const PLAY_AREA_TOP = GROUND_Y - 40;
		const PLAY_AREA_BOTTOM = GROUND_Y + 30;

		// Player state
		let _player = {
			x: 80,
			y: GROUND_Y,
			hp: PLAYER_MAX_HP,
			isInvincible: false,
			invincibilityTimer: 0,
			lastAttackTime: 0,
			isAttacking: false,
			attackTimer: 0,
			facingRight: true,

			// Jump state (render-only offset; hitboxes stay on ground)
			isJumping: false,
			jumpOffset: 0,
			jumpVel: 0,
		};

		// Camera/world
		let _cameraX = 0;

		// Enemies
		let _enemies = [];
		let _spawnTimer = 0;

		// Special key enemy flags
		let _keyEnemyAlive = false;
		let _floppyAwarded = false;

		// Collectible celebration FX (same style as Tetris)
		let _uiFloppyTargetX = 0;
		let _uiFloppyTargetY = 0;
		let _floppyAnim = null; // { startMs, durationMs, fromX, fromY, toX, toY, active }
		let _sparkles = [];
		let _sparkleStreamLeftMs = 0;
		let _sparkleSpawnAcc = 0;
		let _shakeTimeLeftMs = 0;
		let _shakeDurationMs = 0;
		let _shakeIntensityPx = 0;
		let _shakeX = 0;
		let _shakeY = 0;
		let _foundTextLeftMs = 0;

		const _sparkleColors = ["#ffffff", "#fff1a8", "#ffd0df", "#a8f7ff"];

		// Stats
		let _enemiesDefeated = 0;
		let _score = 0;

		// Input
		const _keys = {};

		// =========================================
		// INITIALIZATION
		// =========================================

		function init() {
			console.log("[FinalFight] Initializing...");
			// Cache score UI target based on _renderUI() positions:
			// score value at (20, 126)
			_uiFloppyTargetX = 20 + 70;
			_uiFloppyTargetY = 126 + 2;

			_resetGame();
			_render();
		}

		function _resetGame() {
			_isGameOver = false;
			_isVictory = false;

			// Reset player
			_player.x = 80;
			_player.y = GROUND_Y;
			_player.hp = PLAYER_MAX_HP;
			_player.isInvincible = false;
			_player.invincibilityTimer = 0;
			_player.lastAttackTime = 0;
			_player.isAttacking = false;
			_player.attackTimer = 0;
			_player.facingRight = true;
			_player.isJumping = false;
			_player.jumpOffset = 0;
			_player.jumpVel = 0;

			// Reset camera
			_cameraX = 0;

			// Clear enemies
			_enemies = [];
			_spawnTimer = 1000; // Spawn first enemy soon
			_keyEnemyAlive = false;

			_syncFloppyAwardedFromState();
			_resetFloppyFX();

			// Reset stats
			_enemiesDefeated = 0;
			_score = 0;

			_updateHUD();
		}

		function _syncFloppyAwardedFromState() {
			try {
				if (typeof StateManager !== "undefined" && typeof StateManager.isCollected === "function") {
					_floppyAwarded = !!StateManager.isCollected("era1", 4);
				} else {
					_floppyAwarded = false;
				}
			} catch (_) {
				_floppyAwarded = false;
			}
		}

		function _resetFloppyFX() {
			_floppyAnim = null;
			_sparkles = [];
			_sparkleStreamLeftMs = 0;
			_sparkleSpawnAcc = 0;
			_shakeTimeLeftMs = 0;
			_shakeDurationMs = 0;
			_shakeIntensityPx = 0;
			_shakeX = 0;
			_shakeY = 0;
			_foundTextLeftMs = 0;
		}

		function _rand(min, max) {
			return min + Math.random() * (max - min);
		}

		function _randInt(min, max) {
			return Math.floor(_rand(min, max + 1));
		}

		function _clamp(v, min, max) {
			return Math.max(min, Math.min(max, v));
		}

		function _easeInOutCubic(t) {
			return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
		}

		function _easeOutElastic(t) {
			if (t === 0) return 0;
			if (t === 1) return 1;
			const c4 = (2 * Math.PI) / 3;
			return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
		}

		function _spawnSparkleBurst(x, y, count) {
			const total = Math.max(0, count | 0);
			for (let i = 0; i < total; i++) {
				const color = _sparkleColors[_randInt(0, _sparkleColors.length - 1)];
				const size = _randInt(1, 3);
				const angle = _rand(0, Math.PI * 2);
				const speed = _rand(120, 520);
				_sparkles.push({
					x: x + _rand(-10, 10),
					y: y + _rand(-10, 10),
					vx: Math.cos(angle) * speed,
					vy: Math.sin(angle) * speed - _rand(40, 160),
					lifeMs: _randInt(420, 900),
					maxLifeMs: 900,
					size,
					color,
				});
			}
		}

		function _triggerFloppyAward() {
			if (_floppyAwarded) return;

			try {
				if (typeof StateManager !== "undefined" && typeof StateManager.isCollected === "function") {
					if (StateManager.isCollected("era1", 4)) {
						_floppyAwarded = true;
						return;
					}
				}
			} catch (_) {}

			_floppyAwarded = true;

			try {
				if (typeof StateManager !== "undefined" && typeof StateManager.collectItem === "function") {
					StateManager.collectItem({ eraKey: "era1", level: 4, itemId: "floppy" });
				}
			} catch (_) {}

			const startX = _canvas.width / 2;
			const startY = GROUND_Y;

			_floppyAnim = {
				startMs: performance.now(),
				durationMs: 1200,
				fromX: startX,
				fromY: startY,
				toX: _uiFloppyTargetX,
				toY: _uiFloppyTargetY,
				active: true,
			};

			_shakeDurationMs = 450;
			_shakeTimeLeftMs = 450;
			_shakeIntensityPx = 10;

			_spawnSparkleBurst(startX, startY - 40, _randInt(120, 220));
			_sparkleStreamLeftMs = 400;
			_sparkleSpawnAcc = 0;
			_foundTextLeftMs = 400;
		}

		function _updateFloppyFX(dtMs) {
			// Shake
			if (_shakeTimeLeftMs > 0) {
				_shakeTimeLeftMs = Math.max(0, _shakeTimeLeftMs - dtMs);
				const t = _shakeDurationMs > 0 ? _shakeTimeLeftMs / _shakeDurationMs : 0;
				const intensity = _shakeIntensityPx * t;
				_shakeX = Math.round(_rand(-1, 1) * intensity);
				_shakeY = Math.round(_rand(-1, 1) * intensity);
			} else {
				_shakeX = 0;
				_shakeY = 0;
			}

			// Sparkle stream (~400ms)
			if (_sparkleStreamLeftMs > 0) {
				_sparkleStreamLeftMs = Math.max(0, _sparkleStreamLeftMs - dtMs);
				_sparkleSpawnAcc += dtMs;
				const spawnEvery = 18;
				while (_sparkleSpawnAcc >= spawnEvery && _sparkleStreamLeftMs > 0) {
					_sparkleSpawnAcc -= spawnEvery;
					if (_floppyAnim && _floppyAnim.active) {
						_spawnSparkleBurst(_floppyAnim.fromX, _floppyAnim.fromY - 30, 1);
					}
				}
			}

			// Sparkles update
			if (_sparkles.length) {
				const dt = dtMs / 1000;
				const gravity = 320;
				for (let i = _sparkles.length - 1; i >= 0; i--) {
					const p = _sparkles[i];
					p.vy += gravity * dt;
					p.x += p.vx * dt;
					p.y += p.vy * dt;
					p.lifeMs -= dtMs;
					if (p.lifeMs <= 0) _sparkles.splice(i, 1);
				}
			}

			// Floppy anim timeline
			if (_floppyAnim && _floppyAnim.active) {
				const now = performance.now();
				const elapsed = now - _floppyAnim.startMs;
				if (elapsed >= _floppyAnim.durationMs) {
					_floppyAnim.active = false;
					_floppyAnim = null;
				}
			}

			if (_foundTextLeftMs > 0) {
				_foundTextLeftMs = Math.max(0, _foundTextLeftMs - dtMs);
			}
		}

		// =========================================
		// PLAYER
		// =========================================

		function _updatePlayer(dt) {
			let dx = 0;
			const dtSec = dt / 1000;

			// Movement
			if (_keys["ArrowLeft"] || _keys["KeyA"]) {
				dx = -1;
				_player.facingRight = false;
			}
			if (_keys["ArrowRight"] || _keys["KeyD"]) {
				dx = 1;
				_player.facingRight = true;
			}

			// Jump (no vertical movement lanes)
			if ((_keys["ArrowUp"] || _keys["KeyW"]) && !_player.isJumping) {
				_player.isJumping = true;
				_player.jumpVel = JUMP_VEL;
				_player.jumpOffset = 0;
			}

			// Apply movement
			_player.x += dx * PLAYER_SPEED * dtSec;

			// Clamp to play area
			_player.x = Math.max(20, Math.min(WORLD_WIDTH - PLAYER_WIDTH - 20, _player.x));
			// Player always rests on ground line (cannot move up/down)
			_player.y = GROUND_Y;

			// Jump physics (visual only)
			if (_player.isJumping) {
				_player.jumpOffset += _player.jumpVel * dtSec;
				_player.jumpVel -= GRAVITY * dtSec;

				// Clamp max jump height for stability
				if (_player.jumpOffset > MAX_JUMP_HEIGHT) {
					_player.jumpOffset = MAX_JUMP_HEIGHT;
					_player.jumpVel = Math.min(_player.jumpVel, 0);
				}

				// Land
				if (_player.jumpOffset <= 0 && _player.jumpVel <= 0) {
					_player.jumpOffset = 0;
					_player.jumpVel = 0;
					_player.isJumping = false;
				}
			}

			// Update camera to follow player
			const targetCameraX = _player.x - _canvas.width / 3;
			_cameraX = Math.max(0, Math.min(WORLD_WIDTH - _canvas.width, targetCameraX));

			// Attack
			if (_keys["KeyX"] || _keys["Space"]) {
				_tryAttack();
			}

			// Update invincibility
			if (_player.isInvincible) {
				_player.invincibilityTimer -= dt;
				if (_player.invincibilityTimer <= 0) {
					_player.isInvincible = false;
				}
			}

			// Update attack animation
			if (_player.isAttacking) {
				_player.attackTimer -= dt;
				if (_player.attackTimer <= 0) {
					_player.isAttacking = false;
				}
			}
		}

		function _tryAttack() {
			const now = performance.now();
			if (now - _player.lastAttackTime < ATTACK_COOLDOWN) return;

			_player.lastAttackTime = now;
			_player.isAttacking = true;
			_player.attackTimer = 150;

			// Attack hitbox
			const attackX = _player.facingRight ? _player.x + PLAYER_WIDTH : _player.x - ATTACK_RANGE;

			const attackBox = {
				x: attackX,
				// Attack originates from the player's current (jumped) height
				y: _player.y - (_player.jumpOffset || 0),
				w: ATTACK_RANGE,
				h: PLAYER_HEIGHT,
			};

			// Check hits
			for (const enemy of _enemies) {
				if (_rectsOverlap(attackBox, enemy)) {
					enemy.hp--;
					enemy.hurtTimer = 100;
					_score += 5;

					// Knockback
					enemy.x += _player.facingRight ? 20 : -20;
				}
			}

			_updateHUD();
		}

		function _damagePlayer() {
			if (_player.isInvincible) return;

			_player.hp--;
			_player.isInvincible = true;
			_player.invincibilityTimer = INVINCIBILITY_TIME;

			_updateHUD();

			if (_player.hp <= 0) {
				_gameOver();
			}
		}

		// =========================================
		// ENEMIES
		// =========================================

		function _spawnEnemy() {
			// Spawn ahead of player
			const spawnX = _player.x + _canvas.width * 0.6 + Math.random() * 100;

			if (spawnX > WORLD_WIDTH - 50) return; // Don't spawn past world end

			// Possibly spawn the special key enemy (once, while collectible not yet awarded)
			const canSpawnKey = !_floppyAwarded && !_keyEnemyAlive;
			const spawnKey = canSpawnKey && Math.random() < KEY_ENEMY_CHANCE;

			if (spawnKey) {
				_keyEnemyAlive = true;
				_enemies.push({
					x: spawnX,
					y: GROUND_Y,
					w: KEY_ENEMY_W,
					h: KEY_ENEMY_H,
					hp: KEY_ENEMY_HP,
					maxHp: KEY_ENEMY_HP,
					hurtTimer: 0,
					isKey: true,
					speed: KEY_ENEMY_SPEED,
				});
				return;
			}

			_enemies.push({
				x: spawnX,
				// Single-lane beat-em-up: enemies stay on the ground line (no up/down lanes)
				y: GROUND_Y,
				w: ENEMY_WIDTH,
				h: ENEMY_HEIGHT,
				hp: ENEMY_HP,
				maxHp: ENEMY_HP,
				hurtTimer: 0,
				isKey: false,
				speed: ENEMY_SPEED,
			});
		}

		function _updateEnemies(dt) {
			for (let i = _enemies.length - 1; i >= 0; i--) {
				const enemy = _enemies[i];

				// Single-lane: move toward player only on X, keep Y on ground
				const dx = _player.x - enemy.x;
				if (Math.abs(dx) > 10) {
					const spd = enemy.speed || ENEMY_SPEED;
					enemy.x += Math.sign(dx) * spd * (dt / 1000);
				}
				enemy.y = GROUND_Y;

				// Update hurt timer
				if (enemy.hurtTimer > 0) {
					enemy.hurtTimer -= dt;
				}

				// Check collision with player
				if (
					_rectsOverlap(enemy, {
						x: _player.x,
						// If player is jumping above the enemy, they should NOT get hit.
						y: _player.y - (_player.jumpOffset || 0),
						w: PLAYER_WIDTH,
						h: PLAYER_HEIGHT,
					})
				) {
					_damagePlayer();
				}

				// Remove dead enemies
				if (enemy.hp <= 0) {
					const wasKey = !!enemy.isKey;
					_enemies.splice(i, 1);
					if (wasKey) {
						_keyEnemyAlive = false;
						_triggerFloppyAward();
					}
					_enemiesDefeated++;
					_score += 50;
					_updateHUD();

					// Check win
					if (_enemiesDefeated >= ENEMIES_TO_WIN) {
						_winGame();
						return;
					}
				}
			}
		}

		function _updateSpawning(dt) {
			_spawnTimer += dt;

			if (_spawnTimer >= SPAWN_INTERVAL && _enemies.length < MAX_ENEMIES) {
				_spawnTimer = 0;
				_spawnEnemy();
			}
		}

		// =========================================
		// COLLISION
		// =========================================

		function _rectsOverlap(a, b) {
			return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
		}

		// =========================================
		// GAME END
		// =========================================

		function _gameOver() {
			console.log("[FinalFight] Game Over!");
			_isGameOver = true;

			_restartTimeout = setTimeout(() => {
				if (_isGameOver) {
					console.log("[FinalFight] Auto-restarting...");
					_resetGame();
					_isRunning = true;
					_gameStartTime = performance.now();
					_lastTime = performance.now();
					_gameLoop();
				}
			}, 2000);
		}

		function _winGame() {
			console.log("[FinalFight] Victory!");
			_isVictory = true;
			_isRunning = false;

			EventBus.emit(EventBus.Events.MINIGAME_END, {
				success: true,
				score: _score,
				enemiesDefeated: _enemiesDefeated,
				time: performance.now() - _gameStartTime,
			});
		}

		// =========================================
		// INPUT
		// =========================================

		function _handleKeyDown(e) {
			if (_isPaused || _isGameOver || _isVictory) return;

			_keys[e.code] = true;

			// Debug skip
			if (e.code === "NumpadMultiply" || (e.code === "Digit8" && e.shiftKey)) {
				_winGame();
				e.preventDefault();
			}

			if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
				e.preventDefault();
			}
		}

		function _handleKeyUp(e) {
			_keys[e.code] = false;
		}

		// =========================================
		// GAME LOOP
		// =========================================

		function start() {
			console.log("[FinalFight] Starting game...");

			_isRunning = true;
			_isPaused = false;
			_gameStartTime = performance.now();
			_lastTime = performance.now();

			window.addEventListener("keydown", _handleKeyDown);
			window.addEventListener("keyup", _handleKeyUp);

			_gameLoop();
		}

		function _gameLoop(currentTime = performance.now()) {
			if (!_isRunning) {
				_render();
				return;
			}

			const dt = currentTime - _lastTime;
			_lastTime = currentTime;

			if (!_isPaused && !_isGameOver && !_isVictory) {
				_update(dt);
			}

			_render();

			_animationId = requestAnimationFrame(_gameLoop);
		}

		function _update(dt) {
			_updatePlayer(dt);
			_updateFloppyFX(dt);
			_updateEnemies(dt);
			_updateSpawning(dt);
		}

		function _updateHUD() {
			StateManager.updateLevelData({
				score: _score,
				enemiesDefeated: _enemiesDefeated,
				enemiesToWin: ENEMIES_TO_WIN,
				hp: _player.hp,
			});
		}

		// =========================================
		// RENDERING
		// =========================================

		function _render() {
			CanvasRenderer.clear(COLORS.background);

			// Apply collectible camera shake to the whole scene+UI
			_ctx.save();
			_ctx.translate(_shakeX, _shakeY);

			_renderBackground();
			_renderGround();
			_renderEnemies();
			_renderPlayer();
			_renderUI();

			_renderSparkles();
			_renderFloppyAnim();

			_ctx.restore();

			if (_isGameOver) {
				_renderGameOver();
			} else if (_isVictory) {
				_renderVictory();
			}

			if (_isPaused) {
				_renderPauseOverlay();
			}
		}

		function _renderBackground() {
			// Parallax buildings
			const parallax = _cameraX * 0.3;

			_ctx.fillStyle = COLORS.backgroundMid;

			// Simple building silhouettes
			const buildings = [
				{ x: 50, w: 80, h: 120 },
				{ x: 180, w: 60, h: 90 },
				{ x: 280, w: 100, h: 150 },
				{ x: 420, w: 70, h: 100 },
				{ x: 530, w: 90, h: 130 },
				{ x: 680, w: 60, h: 80 },
				{ x: 780, w: 110, h: 140 },
			];

			for (const b of buildings) {
				const screenX = b.x - parallax;
				if (screenX > -b.w && screenX < _canvas.width + 100) {
					_ctx.fillRect(screenX, GROUND_Y + PLAYER_HEIGHT - b.h, b.w, b.h);
				}
			}
		}

		function _renderGround() {
			// Ground area
			CanvasRenderer.drawRect(
				0,
				GROUND_Y + PLAYER_HEIGHT,
				_canvas.width,
				_canvas.height - GROUND_Y - PLAYER_HEIGHT,
				COLORS.ground
			);

			// Ground line
			CanvasRenderer.drawRect(0, GROUND_Y + PLAYER_HEIGHT, _canvas.width, 3, COLORS.groundLine);
		}

		function _renderPlayer() {
			// Flicker when invincible
			if (_player.isInvincible && Math.floor(_player.invincibilityTimer / 50) % 2 === 0) {
				return;
			}

			const screenX = Math.floor(_player.x - _cameraX);
			const screenY = Math.floor(_player.y - (_player.jumpOffset || 0));

			// Body
			const bodyColor = _player.isInvincible ? COLORS.playerHurt : COLORS.player;
			CanvasRenderer.drawRect(screenX, screenY, PLAYER_WIDTH, PLAYER_HEIGHT, bodyColor);

			// Highlight
			_ctx.fillStyle = COLORS.playerHighlight;
			_ctx.fillRect(screenX, screenY, PLAYER_WIDTH, 4);
			_ctx.fillRect(screenX, screenY, 4, PLAYER_HEIGHT);

			// Attack effect
			if (_player.isAttacking) {
				const attackX = _player.facingRight ? screenX + PLAYER_WIDTH : screenX - ATTACK_RANGE;

				_ctx.fillStyle = COLORS.playerAttack;
				_ctx.globalAlpha = 0.7;
				_ctx.fillRect(attackX, screenY + 4, ATTACK_RANGE, PLAYER_HEIGHT - 8);
				_ctx.globalAlpha = 1;
			}
		}

		function _renderEnemies() {
			for (const enemy of _enemies) {
				const screenX = Math.floor(enemy.x - _cameraX);
				const screenY = Math.floor(enemy.y);

				// Skip if off screen
				if (screenX < -60 || screenX > _canvas.width + 60) continue;

				if (enemy.isKey) {
					_renderKeyEnemy(screenX, screenY, enemy);
					continue;
				}

				const color = enemy.hurtTimer > 0 ? COLORS.enemyHurt : COLORS.enemy;

				// Body
				CanvasRenderer.drawRect(screenX, screenY, ENEMY_WIDTH, ENEMY_HEIGHT, color);

				// Highlight
				_ctx.fillStyle = COLORS.enemyHighlight;
				_ctx.fillRect(screenX, screenY, ENEMY_WIDTH, 3);

				// HP indicator (small bar)
				const denom = enemy.maxHp || ENEMY_HP;
				const hpWidth = (enemy.hp / denom) * ENEMY_WIDTH;
				CanvasRenderer.drawRect(screenX, screenY - 6, ENEMY_WIDTH, 4, "#333333");
				CanvasRenderer.drawRect(screenX, screenY - 6, hpWidth, 4, "#ff4444");
			}
		}

		function _renderKeyEnemy(screenX, screenY, enemy) {
			const w = enemy.w;
			const h = enemy.h;

			// Golden key silhouette: ring + shaft + teeth
			const base = enemy.hurtTimer > 0 ? COLORS.enemyHurt : COLORS.key;
			const highlight = COLORS.keyHighlight;
			const edge = COLORS.keyEdge;

			// Ring (left)
			const cx = screenX + Math.floor(w * 0.28);
			const cy = screenY + Math.floor(h * 0.45);
			const rOuter = Math.floor(Math.min(w, h) * 0.22);
			const rInner = Math.max(3, rOuter - 4);
			CanvasRenderer.drawCircle(cx, cy, rOuter, base);
			CanvasRenderer.drawCircle(cx, cy, rInner, COLORS.backgroundMid);

			// Shaft (right)
			const shaftX = screenX + Math.floor(w * 0.4);
			const shaftY = screenY + Math.floor(h * 0.4);
			const shaftW = Math.floor(w * 0.55);
			const shaftH = Math.max(6, Math.floor(h * 0.16));
			CanvasRenderer.drawRect(shaftX, shaftY, shaftW, shaftH, base);

			// Teeth
			const toothW = Math.max(4, Math.floor(w * 0.1));
			CanvasRenderer.drawRect(
				shaftX + Math.floor(shaftW * 0.55),
				shaftY + shaftH,
				toothW,
				Math.floor(shaftH * 0.9),
				base
			);
			CanvasRenderer.drawRect(
				shaftX + Math.floor(shaftW * 0.78),
				shaftY + shaftH,
				toothW,
				Math.floor(shaftH * 0.65),
				base
			);

			// Subtle edge + highlight
			_ctx.fillStyle = edge;
			_ctx.fillRect(shaftX, shaftY, shaftW, 2);
			_ctx.fillRect(shaftX, shaftY, 2, shaftH);
			_ctx.fillStyle = highlight;
			_ctx.globalAlpha = 0.18;
			_ctx.fillRect(shaftX + 2, shaftY + 2, Math.max(1, shaftW - 4), Math.max(1, shaftH - 4));
			_ctx.globalAlpha = 1;

			// HP bar (wider)
			const denom = enemy.maxHp || KEY_ENEMY_HP;
			const hpW = Math.max(1, (enemy.hp / denom) * w);
			CanvasRenderer.drawRect(screenX, screenY - 8, w, 5, "#333333");
			CanvasRenderer.drawRect(screenX, screenY - 8, hpW, 5, "#ff4444");
		}

		function _renderSparkles() {
			if (!_sparkles.length) return;
			for (let i = 0; i < _sparkles.length; i++) {
				const p = _sparkles[i];
				const a = _clamp(p.lifeMs / p.maxLifeMs, 0, 1);
				_ctx.save();
				_ctx.globalAlpha = Math.min(1, a);
				_ctx.fillStyle = p.color;

				const x = Math.round(p.x);
				const y = Math.round(p.y);
				const s = p.size;

				_ctx.fillRect(x, y, 1 * s, 1 * s);
				_ctx.fillRect(x - 1 * s, y, 1 * s, 1 * s);
				_ctx.fillRect(x + 1 * s, y, 1 * s, 1 * s);
				_ctx.fillRect(x, y - 1 * s, 1 * s, 1 * s);
				_ctx.fillRect(x, y + 1 * s, 1 * s, 1 * s);

				_ctx.restore();
			}
		}

		function _renderFloppyAnim() {
			if (!_floppyAnim || !_floppyAnim.active) return;

			const now = performance.now();
			const elapsed = now - _floppyAnim.startMs;
			const duration = _floppyAnim.durationMs;

			const phaseA = 350;
			const phaseB = duration - phaseA;

			let x = _floppyAnim.fromX;
			let y = _floppyAnim.fromY;
			let alpha = 1;

			let scale = 1;
			if (elapsed <= phaseA) {
				const t = _clamp(elapsed / phaseA, 0, 1);
				scale = 0.6 + (1.15 - 0.6) * _easeOutElastic(t);
			} else {
				const t = _clamp((elapsed - phaseA) / phaseB, 0, 1);
				const e = _easeInOutCubic(t);
				x = _floppyAnim.fromX + (_floppyAnim.toX - _floppyAnim.fromX) * e;
				y = _floppyAnim.fromY + (_floppyAnim.toY - _floppyAnim.fromY) * e - Math.sin(Math.PI * t) * 34;
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
			_ctx.fillText("💾", Math.round(x), Math.round(y));
			_ctx.restore();

			if (_foundTextLeftMs > 0) {
				const t2 = _clamp(_foundTextLeftMs / 400, 0, 1);
				_ctx.save();
				_ctx.globalAlpha = Math.min(1, t2);
				CanvasRenderer.drawText("FOUND 💾!", _floppyAnim.fromX, _floppyAnim.fromY + 54, {
					color: COLORS.accent,
					size: 16,
					align: "center",
				});
				_ctx.restore();
			}
		}

		function _renderUI() {
			// HP
			CanvasRenderer.drawText("HP", 20, 20, {
				color: COLORS.textDim,
				size: 10,
				align: "left",
			});

			for (let i = 0; i < PLAYER_MAX_HP; i++) {
				const color = i < _player.hp ? COLORS.hp : COLORS.hpLost;
				CanvasRenderer.drawRect(20 + i * 18, 34, 14, 14, color);
			}

			// Enemies defeated
			CanvasRenderer.drawText("ENEMIES", 20, 65, {
				color: COLORS.textDim,
				size: 10,
				align: "left",
			});
			CanvasRenderer.drawText(`${_enemiesDefeated}/${ENEMIES_TO_WIN}`, 20, 81, {
				color: COLORS.accent,
				size: 14,
				align: "left",
			});

			// Score
			CanvasRenderer.drawText("SCORE", 20, 110, {
				color: COLORS.textDim,
				size: 10,
				align: "left",
			});
			CanvasRenderer.drawText(_score.toString(), 20, 126, {
				color: COLORS.text,
				size: 14,
				align: "left",
			});

			// Controls
			const hintX = _canvas.width - 20;
			CanvasRenderer.drawText("ARROWS: MOVE", hintX, 20, {
				color: COLORS.textDim,
				size: 8,
				align: "right",
			});
			CanvasRenderer.drawText("A/SPACE: PUNCH", hintX, 34, {
				color: COLORS.textDim,
				size: 8,
				align: "right",
			});
		}

		function _renderGameOver() {
			CanvasRenderer.fade(0.7);

			CanvasRenderer.drawText("GAME OVER", _canvas.width / 2, _canvas.height / 2 - 40, {
				color: COLORS.accent,
				size: 24,
				align: "center",
			});

			CanvasRenderer.drawText(
				`Enemies: ${_enemiesDefeated}/${ENEMIES_TO_WIN}`,
				_canvas.width / 2,
				_canvas.height / 2,
				{
					color: COLORS.text,
					size: 12,
					align: "center",
				}
			);
		}

		function _renderVictory() {
			CanvasRenderer.fade(0.5);

			CanvasRenderer.drawText("STAGE CLEAR", _canvas.width / 2, _canvas.height / 2 - 40, {
				color: COLORS.accent,
				size: 24,
				align: "center",
			});

			CanvasRenderer.drawText(`Score: ${_score}`, _canvas.width / 2, _canvas.height / 2, {
				color: COLORS.text,
				size: 12,
				align: "center",
			});
		}

		function _renderPauseOverlay() {
			CanvasRenderer.fade(0.5);

			CanvasRenderer.drawText("PAUSED", _canvas.width / 2, _canvas.height / 2, {
				color: COLORS.accent,
				size: 24,
				align: "center",
			});
		}

		// =========================================
		// LIFECYCLE
		// =========================================

		function pause() {
			console.log("[FinalFight] Paused");
			_isPaused = true;
		}

		function resume() {
			console.log("[FinalFight] Resumed");
			_isPaused = false;
			_lastTime = performance.now();
		}

		function stop() {
			console.log("[FinalFight] Stopped");
			_isRunning = false;
			_isGameOver = false;

			_resetFloppyFX();
			_keyEnemyAlive = false;

			if (_animationId) {
				cancelAnimationFrame(_animationId);
				_animationId = null;
			}

			if (_restartTimeout) {
				clearTimeout(_restartTimeout);
				_restartTimeout = null;
			}

			window.removeEventListener("keydown", _handleKeyDown);
			window.removeEventListener("keyup", _handleKeyUp);
		}

		function destroy() {
			console.log("[FinalFight] Destroyed");
			stop();
		}

		// =========================================
		// RETURN
		// =========================================

		return {
			init,
			start,
			pause,
			resume,
			stop,
			destroy,

			getState: () => ({
				isRunning: _isRunning,
				isPaused: _isPaused,
				isGameOver: _isGameOver,
				isVictory: _isVictory,
				enemiesDefeated: _enemiesDefeated,
				score: _score,
				playerHP: _player.hp,
			}),
		};
	}

	// =========================================
	// REGISTER GAME
	// =========================================

	GameLoader.registerGame("final-fight", createFinalFightGame);

	console.log("[FinalFight] Game module loaded");
})();
