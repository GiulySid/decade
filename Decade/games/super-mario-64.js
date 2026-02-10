/**
 * super-mario-64.js
 * N64-style Super Mario 64 inspired mini platformer (Level 6)
 *
 * Difficulty upgrades:
 * - Coins placed higher / more scattered / harder
 * - Enemies faster
 * - Flag position on pole depends on coins collected:
 *   0 coins => bottom, all coins => top
 *
 * NEW:
 * - Stomping an enemy grants +1 coin
 * - Platforms arranged in multi-level tiers (2+ jumps to reach higher coins)
 */

(function () {
	"use strict";

	function createSuperMario64Game(level) {
		const cfg = level.config || {};

		const STAGE_LENGTH = cfg.stageLength || 3200;
		const TIME_LIMIT = cfg.timeLimit || 90;
		const START_LIVES = cfg.lives || 3;

		// Difficulty knobs
		const ENEMY_SPEED_MULT = 1.35;
		const COIN_COUNT = 20; // Reduced for higher difficulty
		const COIN_HIGH_BIAS = 0.95; // Much higher bias - coins are very difficult to reach
		const STOMP_COINS_NEEDED = 3; // Must stomp 3 enemies to win

		const _ctx = CanvasRenderer.getContext();
		const _canvas = CanvasRenderer.getCanvas();

		// --- Palette (Mario 64 inspired) ---
		const COLORS = {
			sky: "#5c94fc",
			ground: "#c68642",
			grass: "#3cb44b",
			marioRed: "#e52521",
			marioBlue: "#2c5aa0",
			skin: "#f1c27d",
			white: "#ffffff",
			black: "#000000",
			coin: "#f2c14e",
			enemy: "#8b4513",
			hud: "#ffffff",
			hudShadow: "#000000",
			flagPole: "#ffffff",
			flag: "#3cb44b",
		};

		const HUD_PAD = 14;

		const GROUND_Y = Math.floor(_canvas.height * 0.72);
		const GRAVITY = 1400;
		const JUMP_V = 620;
		const MOVE_SPEED = 260;
		const RUN_SPEED = 360;

		let _isRunning = false;
		let _isPaused = false;
		let _isGameOver = false;
		let _hasWon = false;

		let _lastTime = 0;
		let _startTime = 0;
		let _animationId = null;
		let _restartTimeout = null;

		const _keys = {};

		let _cameraX = 0;
		let score = 0;
		let coins = 0;
		let stompCoins = 0; // Coins from stomping enemies (separate from collectible coins)
		let lives = START_LIVES;

		// --- Player (Mario) ---
		const mario = {
			x: 80,
			y: GROUND_Y - 34,
			w: 24,
			h: 34,
			vx: 0,
			vy: 0,
			onGround: true,
			facing: 1,
			invUntil: 0,
		};

		/**
		 * Platforms (tiered / multi-level)
		 * Designed so higher coins require chaining 2–3 jumps.
		 * Think "stair-step" & "double deck" sections.
		 */
		const platforms = [
			// Tier group 1 (early)
			{ x: 320, y: GROUND_Y - 70, w: 120, h: 16 },
			{ x: 470, y: GROUND_Y - 110, w: 110, h: 16 },

			// Tier group 2
			{ x: 700, y: GROUND_Y - 80, w: 130, h: 16 },
			{ x: 860, y: GROUND_Y - 125, w: 120, h: 16 },
			{ x: 1010, y: GROUND_Y - 155, w: 110, h: 16 },

			// Tier group 3 (mid)
			{ x: 1320, y: GROUND_Y - 90, w: 140, h: 16 },
			{ x: 1490, y: GROUND_Y - 130, w: 130, h: 16 },
			{ x: 1660, y: GROUND_Y - 165, w: 120, h: 16 },

			// Tier group 4 (late, harder)
			{ x: 1980, y: GROUND_Y - 95, w: 150, h: 16 },
			{ x: 2160, y: GROUND_Y - 135, w: 140, h: 16 },
			{ x: 2340, y: GROUND_Y - 175, w: 150, h: 16 },

			// Tier group 5 (near end)
			{ x: 2620, y: GROUND_Y - 105, w: 150, h: 16 },
			{ x: 2800, y: GROUND_Y - 150, w: 150, h: 16 },
		];

		// ? block (classic Mario) on a higher platform - hit from below to spawn mushroom
		const qBlockPlatform = platforms[4]; // { x: 1010, y: GROUND_Y - 155 } - tier group 2, highest
		const questionBlock = {
			x: qBlockPlatform.x + (qBlockPlatform.w - 32) / 2,
			y: qBlockPlatform.y - 100,
			w: 32,
			h: 32,
			hit: false,
		};

		// Hidden platforms - revealed when ? block is hit (to reach flying mushroom)
		const hiddenPlatforms = [
			{ x: 900, y: GROUND_Y - 250, w: 100, h: 16, revealed: false },
			{ x: 1050, y: GROUND_Y - 300, w: 120, h: 16, revealed: false },
			{ x: 1200, y: GROUND_Y - 240, w: 100, h: 16, revealed: false },
			{ x: 1380, y: GROUND_Y - 290, w: 110, h: 16, revealed: false },
			{ x: 1540, y: GROUND_Y - 220, w: 100, h: 16, revealed: false },
		];

		// Pink mushroom (virus collectible) - flies randomly when spawned
		let mushroom = null;
		const MUSHROOM_ZONE_TOP = GROUND_Y - 360;
		const MUSHROOM_ZONE_BOTTOM = GROUND_Y - 140;

		// Virus collect animation (tetris-style)
		let _virusCollectAnim = null;
		let _foundTextLeftMs = 0;
		const _sparkles = [];
		const _sparkleColors = ["#ffffff", "#a8e6cf", "#ffd0df", "#fff1a8"];

		let enemies = [];
		let coinsArr = [];
		let totalCoins = 0;
		let coinAnimations = []; // Floating coin animations from stomping

		// --- Flagpole (WIN GOAL) ---
		const flagPole = {
			x: STAGE_LENGTH - 120,
			y: GROUND_Y - 180,
			w: 10,
			h: 180,
			flagW: 26,
			flagH: 14,
		};

		// --- Helpers ---
		function now() {
			return performance.now();
		}
		function clamp(v, a, b) {
			return Math.max(a, Math.min(b, v));
		}
		function lerp(a, b, t) {
			return a + (b - a) * t;
		}

		function rectsOverlap(a, b) {
			return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
		}

		function worldToScreenX(x) {
			return Math.floor(x - _cameraX);
		}

		// Deterministic RNG
		function makeRng(seed) {
			let s = seed >>> 0;
			return function rand() {
				s = (1664525 * s + 1013904223) >>> 0;
				return s / 4294967296;
			};
		}

		function _reset() {
			_cameraX = 0;
			score = 0;
			coins = 0;
			stompCoins = 0;
			lives = START_LIVES;

			mario.x = 80;
			mario.y = GROUND_Y - mario.h;
			mario.vx = 0;
			mario.vy = 0;
			mario.onGround = true;
			mario.invUntil = 0;

			enemies = [];
			coinsArr = [];
			coinAnimations = [];

			questionBlock.hit = false;
			for (const p of hiddenPlatforms) p.revealed = false;
			mushroom = null;
			_virusCollectAnim = null;
			_foundTextLeftMs = 0;
			_sparkles.length = 0;

			// Coins: higher + on platforms + "multi-jump routes"
			const rng = makeRng((level.year || 2021) * 99991);
			totalCoins = COIN_COUNT;

			// build a list of "anchor points" around tier platforms
			const platformAnchors = [];
			for (const p of platforms) {
				// multiple anchor spots per platform
				platformAnchors.push({ x: p.x + 18, y: p.y - 18 });
				platformAnchors.push({ x: p.x + p.w * 0.5, y: p.y - 22 });
				platformAnchors.push({ x: p.x + p.w - 26, y: p.y - 18 });

				// some extra-high coins above upper tiers
				if (p.y < GROUND_Y - 140) {
					platformAnchors.push({ x: p.x + p.w * 0.5, y: p.y - 44 });
				}
			}

			// place coins higher and more difficult to reach
			for (let i = 0; i < COIN_COUNT; i++) {
				let x, y;

				if (rng() < 0.85) {
					// Most coins on/above platforms, but higher up
					const a = platformAnchors[Math.floor(rng() * platformAnchors.length)];
					x = a.x + (rng() - 0.5) * 18;
					// Push coins even higher above platforms
					y = a.y - (8 + rng() * 20); // Extra height above platform anchors
				} else {
					// Scattered but very high (never bottom)
					const t = i / Math.max(1, COIN_COUNT - 1);
					const baseX = 220 + t * (STAGE_LENGTH - 500);
					x = clamp(baseX + (rng() - 0.5) * 220, 160, STAGE_LENGTH - 180);

					// Very high bias - coins are much higher
					const high = rng() < COIN_HIGH_BIAS;
					y = high ? GROUND_Y - (150 + rng() * 80) : GROUND_Y - (120 + rng() * 50);
				}

				coinsArr.push({ x, y, w: 10, h: 10, taken: false });
			}

			_isGameOver = false;
			_hasWon = false;

			_updateHUD();
		}

		function _updateHUD() {
			StateManager.updateLevelData({
				score,
				coins,
				totalCoins,
				stompCoins,
				stompCoinsNeeded: STOMP_COINS_NEEDED,
				lives,
				timeLeft: Math.max(0, TIME_LIMIT - (now() - _startTime) / 1000),
			});
		}

		// --- Input ---
		function _onKeyDown(e) {
			if (_isPaused) return;

			_keys[e.code] = true;

			// Debug skip
			if (e.code === "NumpadMultiply" || (e.code === "Digit8" && e.shiftKey)) {
				_triggerWin();
				e.preventDefault();
			}

			if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
				e.preventDefault();
			}
		}

		function _onKeyUp(e) {
			_keys[e.code] = false;
		}

		// --- Gameplay ---
		function _spawnEnemy() {
			const x = clamp(_cameraX + _canvas.width + 100, 200, STAGE_LENGTH - 80);
			enemies.push({
				x,
				y: GROUND_Y - 24,
				w: 22,
				h: 24,
				vx: -80 * ENEMY_SPEED_MULT,
				alive: true,
			});
		}

		function _damageMario() {
			const t = now();
			if (t < mario.invUntil) return;

			lives -= 1;
			mario.invUntil = t + 1000;

			if (lives <= 0) {
				_triggerGameOver();
			}

			_updateHUD();
		}

		function _triggerGameOver() {
			_isGameOver = true;
			_isRunning = false;

			_restartTimeout = setTimeout(() => {
				_reset();
				_startTime = now();
				_isRunning = true;
				_lastTime = _startTime;
				_loop();
			}, 2500);
		}

		function _triggerWin() {
			if (_hasWon) return;
			_hasWon = true;
			_isRunning = false;

			setTimeout(() => {
				EventBus.emit(EventBus.Events.MINIGAME_END, {
					success: true,
					score,
					coins,
					stompCoins,
					lives,
					time: now() - _startTime,
				});
			}, 900);
		}

		// --- Physics ---
		function _applyPhysics(dt) {
			const dtS = dt / 1000;

			let move = 0;
			if (_keys["ArrowLeft"] || _keys["KeyA"]) move -= 1;
			if (_keys["ArrowRight"] || _keys["KeyD"]) move += 1;

			const running = _keys["Space"];
			const speed = running ? RUN_SPEED : MOVE_SPEED;

			mario.vx = move * speed;
			if (move !== 0) mario.facing = move > 0 ? 1 : -1;

			const jumpPressed = _keys["KeyZ"] || _keys["ArrowUp"];

			if (jumpPressed && mario.onGround) {
				mario.vy = -JUMP_V;
				mario.onGround = false;
			}

			mario.vy += GRAVITY * dtS;

			mario.x += mario.vx * dtS;
			mario.y += mario.vy * dtS;

			mario.x = clamp(mario.x, 10, STAGE_LENGTH - mario.w - 10);

			// Ground collision
			if (mario.y + mario.h >= GROUND_Y) {
				mario.y = GROUND_Y - mario.h;
				mario.vy = 0;
				mario.onGround = true;
			}

			// Platform collisions (from above)
			for (const p of platforms) {
				const wasAbove = mario.y + mario.h - mario.vy * dtS <= p.y;
				const falling = mario.vy >= 0;

				if (wasAbove && falling && rectsOverlap(mario, p)) {
					mario.y = p.y - mario.h;
					mario.vy = 0;
					mario.onGround = true;
				}
			}

			// Hidden platforms (when revealed)
			for (const p of hiddenPlatforms) {
				if (!p.revealed) continue;
				const wasAbove = mario.y + mario.h - mario.vy * dtS <= p.y;
				const falling = mario.vy >= 0;
				if (wasAbove && falling && rectsOverlap(mario, p)) {
					mario.y = p.y - mario.h;
					mario.vy = 0;
					mario.onGround = true;
				}
			}

			// ? block as platform (Mario can stand on it)
			const wasAboveBlock = mario.y + mario.h - mario.vy * dtS <= questionBlock.y;
			const fallingBlock = mario.vy >= 0;
			if (wasAboveBlock && fallingBlock && rectsOverlap(mario, questionBlock)) {
				mario.y = questionBlock.y - mario.h;
				mario.vy = 0;
				mario.onGround = true;
			}

			// Camera follow
			const target = mario.x - _canvas.width * 0.35;
			_cameraX = clamp(target, 0, Math.max(0, STAGE_LENGTH - _canvas.width));
		}

		function _updateEnemies(dt) {
			const dtS = dt / 1000;

			for (let i = enemies.length - 1; i >= 0; i--) {
				const e = enemies[i];

				// pressure chase boost
				const chaseBoost = Math.abs(e.x - mario.x) < 160 ? 1.25 : 1.0;
				e.x += e.vx * chaseBoost * dtS;

				if (e.x < _cameraX - 120) {
					enemies.splice(i, 1);
					continue;
				}

				const fromAbove = mario.vy > 0 && mario.y + mario.h <= e.y + 6;
				if (rectsOverlap(mario, e)) {
					if (fromAbove) {
						// stomp kill - create coin animation
						const enemyX = e.x;
						const enemyY = e.y;

						coinAnimations.push({
							x: enemyX + e.w / 2,
							y: enemyY,
							vy: -120, // float upward
							life: 1000, // ms
							rotation: 0,
							rotationSpeed: 0.15,
						});

						enemies.splice(i, 1);
						mario.vy = -320;

						// reward: stomp coin (separate from collectible coins) + score
						stompCoins += 1;
						score += 110; // slightly more rewarding than base
						_updateHUD();
					} else {
						_damageMario();
					}
				}
			}

			if (Math.random() < 0.007 * (dt / 16)) {
				_spawnEnemy();
			}
		}

		function _collectCoins() {
			for (const c of coinsArr) {
				if (!c.taken && rectsOverlap(mario, c)) {
					c.taken = true;
					coins += 1;
					score += 10;
					_updateHUD();
				}
			}
		}

		// ? block: hit from below (jumping up into it)
		function _checkQuestionBlock() {
			if (questionBlock.hit) return;
			if (!rectsOverlap(mario, questionBlock)) return;
			if (mario.vy >= 0) return; // must be jumping up

			questionBlock.hit = true;

			// Reveal hidden platforms
			for (const p of hiddenPlatforms) p.revealed = true;

			// Spawn pink mushroom - starts at block, flies quickly in upper zone
			mushroom = {
				x: questionBlock.x + (questionBlock.w - 24) / 2,
				y: questionBlock.y - 40,
				w: 24,
				h: 22,
				vx: 180 * (Math.random() < 0.5 ? 1 : -1),
				vy: -120,
				dirChangeAcc: 0,
			};
		}

		// Pink mushroom: flies randomly in upper zone
		function _updateMushroom(dt) {
			if (!mushroom) return;
			const dtS = dt / 1000;

			mushroom.dirChangeAcc += dt;
			if (mushroom.dirChangeAcc >= 500) {
				mushroom.dirChangeAcc = 0;
				mushroom.vx = (Math.random() - 0.5) * 360;
				mushroom.vy = (Math.random() - 0.5) * 240;
			}

			mushroom.x += mushroom.vx * dtS;
			mushroom.y += mushroom.vy * dtS;

			// Stay in horizontal bounds
			if (mushroom.x < 80) mushroom.vx = Math.abs(mushroom.vx || 140);
			if (mushroom.x + mushroom.w > STAGE_LENGTH - 80) mushroom.vx = -Math.abs(mushroom.vx || 140);

			// Stay in vertical zone (above platforms)
			if (mushroom.y < MUSHROOM_ZONE_TOP) mushroom.vy = Math.abs(mushroom.vy || 100);
			if (mushroom.y + mushroom.h > MUSHROOM_ZONE_BOTTOM) mushroom.vy = -Math.abs(mushroom.vy || 100);

			// Clamp position
			mushroom.x = clamp(mushroom.x, 80, STAGE_LENGTH - mushroom.w - 80);
			mushroom.y = clamp(mushroom.y, MUSHROOM_ZONE_TOP, MUSHROOM_ZONE_BOTTOM - mushroom.h);
		}

		function _collectMushroom() {
			if (!mushroom) return;
			if (!rectsOverlap(mario, mushroom)) return;

			const cx = mushroom.x + mushroom.w / 2;
			const cy = mushroom.y + mushroom.h / 2;
			const sx = worldToScreenX(cx);

			if (typeof StateManager !== "undefined" && StateManager.collectItem) {
				const lvl = StateManager.getCurrentLevel ? StateManager.getCurrentLevel() : 6;
				StateManager.collectItem({ eraKey: "era2", level: lvl, itemId: "virus" });
			}

			_virusCollectAnim = {
				fromX: sx,
				fromY: cy,
				toX: 50,
				toY: 45,
				startMs: now(),
				durationMs: 1100,
				active: true,
			};
			_spawnSparkleBurst(sx, cy, 28);
			_foundTextLeftMs = 500;

			mushroom = null;
			_updateHUD();
		}

		function _checkFlagpole() {
			const poleRect = {
				x: flagPole.x,
				y: flagPole.y,
				w: flagPole.w,
				h: flagPole.h,
			};

			if (rectsOverlap(mario, poleRect)) {
				// Only win if all coins collected AND 3 stomp coins obtained
				const allCoinsCollected = coins >= totalCoins;
				const enoughStompCoins = stompCoins >= STOMP_COINS_NEEDED;

				if (allCoinsCollected && enoughStompCoins) {
					_triggerWin();
				}
				// Otherwise, flag is at bottom and touching it does nothing
			}
		}

		function _checkTimeLimit() {
			if (!TIME_LIMIT) return;
			const elapsed = (now() - _startTime) / 1000;
			if (elapsed >= TIME_LIMIT) {
				_triggerGameOver();
			}
		}

		// Virus collect animation (tetris-style)
		function _rand(min, max) {
			return min + Math.random() * (max - min);
		}
		function _randInt(min, max) {
			return Math.floor(_rand(min, max + 1));
		}
		function _clampV(v, lo, hi) {
			return Math.max(lo, Math.min(hi, v));
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
		function _updateVirusCollectEffects(dtMs) {
			if (_sparkles.length > 0) {
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
			if (_virusCollectAnim && _virusCollectAnim.active) {
				const elapsed = now() - _virusCollectAnim.startMs;
				if (elapsed >= _virusCollectAnim.durationMs) {
					_virusCollectAnim.active = false;
					_virusCollectAnim = null;
				}
			}
			if (_foundTextLeftMs > 0) _foundTextLeftMs = Math.max(0, _foundTextLeftMs - dtMs);
		}
		function _renderSparkles() {
			if (!_sparkles.length) return;
			for (let i = 0; i < _sparkles.length; i++) {
				const p = _sparkles[i];
				const a = _clampV(p.lifeMs / p.maxLifeMs, 0, 1);
				_ctx.save();
				_ctx.globalAlpha = Math.min(1, a);
				_ctx.fillStyle = p.color;
				const px = Math.round(p.x);
				const py = Math.round(p.y);
				const s = p.size;
				_ctx.fillRect(px, py, 1 * s, 1 * s);
				_ctx.fillRect(px - 1 * s, py, 1 * s, 1 * s);
				_ctx.fillRect(px + 1 * s, py, 1 * s, 1 * s);
				_ctx.fillRect(px, py - 1 * s, 1 * s, 1 * s);
				_ctx.fillRect(px, py + 1 * s, 1 * s, 1 * s);
				_ctx.restore();
			}
		}
		function _renderVirusCollectAnim() {
			if (!_virusCollectAnim || !_virusCollectAnim.active) return;
			const elapsed = now() - _virusCollectAnim.startMs;
			const duration = _virusCollectAnim.durationMs;
			const phaseA = 350;
			const phaseB = duration - phaseA;
			let x = _virusCollectAnim.fromX;
			let y = _virusCollectAnim.fromY;
			let scale = 1;
			let alpha = 1;
			if (elapsed <= phaseA) {
				const t = _clampV(elapsed / phaseA, 0, 1);
				scale = 0.6 + (1.15 - 0.6) * _easeOutElastic(t);
			} else {
				const t = _clampV((elapsed - phaseA) / phaseB, 0, 1);
				const e = _easeInOutCubic(t);
				x = _virusCollectAnim.fromX + (_virusCollectAnim.toX - _virusCollectAnim.fromX) * e;
				y =
					_virusCollectAnim.fromY +
					(_virusCollectAnim.toY - _virusCollectAnim.fromY) * e -
					Math.sin(Math.PI * t) * 34;
				scale = 1.15 + (0.35 - 1.15) * e;
				alpha = 1 - 0.05 * e;
			}
			_ctx.save();
			_ctx.globalAlpha = alpha;
			_ctx.textAlign = "center";
			_ctx.textBaseline = "middle";
			const sizePx = Math.max(10, Math.round(72 * scale));
			_ctx.font = `bold ${sizePx}px Arial, sans-serif`;
			_ctx.fillStyle = "#ffffff";
			_ctx.fillText("🦠", Math.round(x), Math.round(y));
			_ctx.restore();
			if (_foundTextLeftMs > 0) {
				const t = _clampV(_foundTextLeftMs / 400, 0, 1);
				_ctx.save();
				_ctx.globalAlpha = Math.min(1, t);
				CanvasRenderer.drawText("FOUND 🦠!", _virusCollectAnim.fromX, _virusCollectAnim.fromY + 54, {
					color: COLORS.hud,
					size: 16,
					align: "center",
				});
				_ctx.restore();
			}
		}

		function _updateCoinAnimations(dt) {
			const dtS = dt / 1000;

			for (let i = coinAnimations.length - 1; i >= 0; i--) {
				const anim = coinAnimations[i];

				// Update position (float upward)
				anim.y += anim.vy * dtS;
				anim.vy *= 0.98; // slight deceleration

				// Update rotation
				anim.rotation += anim.rotationSpeed;

				// Update life
				anim.life -= dt;

				// Remove when expired
				if (anim.life <= 0) {
					coinAnimations.splice(i, 1);
				}
			}
		}

		// Flag vertical position: shows coin progress, but win only when both conditions met
		function _getFlagY() {
			const allCoinsCollected = coins >= totalCoins;
			const enoughStompCoins = stompCoins >= STOMP_COINS_NEEDED;
			const canWin = allCoinsCollected && enoughStompCoins;

			const topY = flagPole.y + 8;
			const bottomY = flagPole.y + flagPole.h - (flagPole.flagH + 10);

			// Show coin progress (flag moves up as coins are collected)
			const coinProgress = totalCoins > 0 ? clamp(coins / totalCoins, 0, 1) : 0;
			const progressY = lerp(bottomY, topY, coinProgress);

			// If both conditions met, flag is at top (can win)
			// Otherwise, flag shows coin progress
			return canWin ? topY : progressY;
		}

		// --- Rendering ---
		function _render() {
			CanvasRenderer.clear(COLORS.sky);

			_ctx.fillStyle = COLORS.grass;
			_ctx.fillRect(0, GROUND_Y - 20, _canvas.width, 20);

			_ctx.fillStyle = COLORS.ground;
			_ctx.fillRect(0, GROUND_Y, _canvas.width, _canvas.height - GROUND_Y);

			// Platforms
			_ctx.fillStyle = COLORS.ground;
			for (const p of platforms) {
				const sx = worldToScreenX(p.x);
				if (sx > _canvas.width || sx + p.w < 0) continue;
				_ctx.fillRect(sx, p.y, p.w, p.h);
			}

			// Hidden platforms (when revealed)
			for (const p of hiddenPlatforms) {
				if (!p.revealed) continue;
				const sx = worldToScreenX(p.x);
				if (sx > _canvas.width || sx + p.w < 0) continue;
				_ctx.fillStyle = "#8B4513";
				_ctx.fillRect(sx, p.y, p.w, p.h);
				_ctx.fillStyle = "#A0522D";
				_ctx.fillRect(sx + 2, p.y + 2, p.w - 4, p.h - 4);
			}

			// ? block (classic Mario style)
			const qSx = worldToScreenX(questionBlock.x);
			if (qSx > -50 && qSx < _canvas.width + 50) {
				_ctx.fillStyle = "#f7dc1e";
				_ctx.fillRect(qSx, questionBlock.y, questionBlock.w, questionBlock.h);
				_ctx.strokeStyle = "#b7950b";
				_ctx.lineWidth = 2;
				_ctx.strokeRect(qSx, questionBlock.y, questionBlock.w, questionBlock.h);
				if (!questionBlock.hit) {
					_ctx.fillStyle = "#000000";
					_ctx.font = "bold 20px Arial, sans-serif";
					_ctx.textAlign = "center";
					_ctx.textBaseline = "middle";
					_ctx.fillText("?", qSx + questionBlock.w / 2, questionBlock.y + questionBlock.h / 2);
				} else {
					_ctx.fillStyle = "#8B4513";
					_ctx.fillRect(qSx + 2, questionBlock.y + 2, questionBlock.w - 4, questionBlock.h - 4);
				}
			}

			// Pink mushroom (virus collectible)
			if (mushroom) {
				const mSx = worldToScreenX(mushroom.x);
				if (mSx > -40 && mSx < _canvas.width + 40) {
					_ctx.fillStyle = "#ff69b4";
					_ctx.beginPath();
					_ctx.ellipse(mSx + mushroom.w / 2, mushroom.y + mushroom.h - 6, mushroom.w / 2, 8, 0, 0, Math.PI * 2);
					_ctx.fill();
					_ctx.fillStyle = "#ffb6c1";
					_ctx.beginPath();
					_ctx.ellipse(mSx + mushroom.w / 2, mushroom.y + 8, mushroom.w / 2 - 2, 10, 0, 0, Math.PI * 2);
					_ctx.fill();
					_ctx.fillStyle = "#ffffff";
					_ctx.beginPath();
					_ctx.arc(mSx + 6, mushroom.y + 6, 3, 0, Math.PI * 2);
					_ctx.arc(mSx + mushroom.w - 6, mushroom.y + 6, 3, 0, Math.PI * 2);
					_ctx.fill();
				}
			}

			// Flagpole + flag pos based on coins
			const poleX = worldToScreenX(flagPole.x);
			if (poleX > -50 && poleX < _canvas.width + 50) {
				_ctx.fillStyle = COLORS.flagPole;
				_ctx.fillRect(poleX, flagPole.y, flagPole.w, flagPole.h);

				const flagY = _getFlagY();
				_ctx.fillStyle = COLORS.flag;
				_ctx.fillRect(poleX + flagPole.w, flagY, flagPole.flagW, flagPole.flagH);

				_ctx.fillStyle = COLORS.black;
				_ctx.fillRect(poleX - 6, GROUND_Y - 6, 22, 6);
			}

			// Coins
			_ctx.fillStyle = COLORS.coin;
			for (const c of coinsArr) {
				if (c.taken) continue;
				const sx = worldToScreenX(c.x);
				if (sx < -30 || sx > _canvas.width + 30) continue;
				_ctx.beginPath();
				_ctx.arc(sx + 5, c.y + 5, 5, 0, Math.PI * 2);
				_ctx.fill();
			}

			// Enemies
			_ctx.fillStyle = COLORS.enemy;
			for (const e of enemies) {
				const sx = worldToScreenX(e.x);
				_ctx.fillRect(sx, e.y, e.w, e.h);
			}

			// Coin animations (from stomping enemies)
			for (const anim of coinAnimations) {
				const sx = worldToScreenX(anim.x);
				const screenY = anim.y;

				// Skip if off screen
				if (sx < -30 || sx > _canvas.width + 30 || screenY < -30 || screenY > _canvas.height + 30) {
					continue;
				}

				// Fade out as life decreases
				const alpha = clamp(anim.life / 1000, 0, 1);
				_ctx.save();
				_ctx.globalAlpha = alpha;

				// Rotate coin
				_ctx.translate(sx, screenY);
				_ctx.rotate(anim.rotation);

				// Draw coin (slightly larger than collectible coins)
				_ctx.fillStyle = COLORS.coin;
				_ctx.beginPath();
				_ctx.arc(0, 0, 7, 0, Math.PI * 2);
				_ctx.fill();

				// Highlight
				_ctx.fillStyle = "#ffdd77";
				_ctx.beginPath();
				_ctx.arc(-2, -2, 3, 0, Math.PI * 2);
				_ctx.fill();

				_ctx.restore();
			}

			// Sparkles + virus collect animation
			_renderSparkles();
			_renderVirusCollectAnim();

			// Mario (white + shrink on invincible)
			const sx = worldToScreenX(mario.x);
			const inv = now() < mario.invUntil;
			const scale = inv ? 0.9 : 1.0;
			const drawW = mario.w * scale;
			const drawH = mario.h * scale;
			const dx = sx + (mario.w - drawW) / 2;
			const dy = mario.y + (mario.h - drawH) / 2;

			_ctx.fillStyle = inv ? COLORS.white : COLORS.marioBlue;
			_ctx.fillRect(dx, dy + 10 * scale, drawW, drawH - 10 * scale);

			_ctx.fillStyle = COLORS.marioRed;
			_ctx.fillRect(dx, dy, drawW, 14 * scale);

			_ctx.fillStyle = COLORS.skin;
			_ctx.fillRect(dx + 4 * scale, dy - 6 * scale, drawW - 8 * scale, 10 * scale);

			_ctx.fillStyle = COLORS.marioRed;
			_ctx.fillRect(dx + 2 * scale, dy - 10 * scale, drawW - 4 * scale, 6 * scale);

			// HUD
			const timeLeft = Math.max(0, Math.floor(TIME_LIMIT - (now() - _startTime) / 1000));

			_ctx.font = "14px 'Press Start 2P'";
			_ctx.fillStyle = COLORS.hudShadow;
			_ctx.fillText(`LIVES ${lives}`, HUD_PAD + 2, 24);
			_ctx.fillText(`COINS ${coins}/${totalCoins}`, HUD_PAD + 2, 44);
			_ctx.fillText(`STOMP ${stompCoins}/${STOMP_COINS_NEEDED}`, HUD_PAD + 2, 64);
			_ctx.fillText(`SCORE ${score}`, HUD_PAD + 2, 84);
			_ctx.fillText(`TIME ${timeLeft}`, HUD_PAD + 2, 104);

			_ctx.fillStyle = COLORS.hud;
			_ctx.fillText(`LIVES ${lives}`, HUD_PAD, 22);
			_ctx.fillText(`COINS ${coins}/${totalCoins}`, HUD_PAD, 42);
			// Highlight stomp coins if requirement met
			_ctx.fillStyle = stompCoins >= STOMP_COINS_NEEDED ? COLORS.flag : COLORS.hud;
			_ctx.fillText(`STOMP ${stompCoins}/${STOMP_COINS_NEEDED}`, HUD_PAD, 62);
			_ctx.fillStyle = COLORS.hud;
			_ctx.fillText(`SCORE ${score}`, HUD_PAD, 82);
			_ctx.fillText(`TIME ${timeLeft}`, HUD_PAD, 102);

			// Controls hint
			const rightX = _canvas.width - HUD_PAD;
			CanvasRenderer.drawText("ARROWS: MOVE", rightX, 22, { align: "right", color: "#dddddd", size: 8 });
			CanvasRenderer.drawText("X/UP: JUMP", rightX, 34, { align: "right", color: "#dddddd", size: 8 });
			CanvasRenderer.drawText("A/SPACE: RUN", rightX, 46, { align: "right", color: "#dddddd", size: 8 });

			// Game over overlay
			if (_isGameOver) {
				CanvasRenderer.fade(0.7);
				CanvasRenderer.drawText("GAME OVER", _canvas.width / 2, _canvas.height / 2 - 10, {
					align: "center",
					size: 24,
					color: "#ffffff",
				});
				CanvasRenderer.drawText("RESTARTING...", _canvas.width / 2, _canvas.height / 2 + 20, {
					align: "center",
					size: 10,
					color: "#ffffff",
				});
			}

			// Pause overlay
			if (_isPaused) {
				CanvasRenderer.fade(0.5);
				CanvasRenderer.drawText("PAUSED", _canvas.width / 2, _canvas.height / 2, {
					align: "center",
					size: 24,
					color: "#ffffff",
				});
			}
		}

		// --- Loop ---
		function _loop(t = now()) {
			if (!_isRunning) {
				_render();
				return;
			}

			const dt = t - _lastTime;
			_lastTime = t;

			if (!_isPaused && !_isGameOver && !_hasWon) {
				_applyPhysics(dt);
				_checkQuestionBlock();
				_updateEnemies(dt);
				_updateMushroom(dt);
				_updateCoinAnimations(dt);
				_collectCoins();
				_collectMushroom();
				_updateVirusCollectEffects(dt);
				_checkFlagpole();
				_checkTimeLimit();
				_updateHUD();
			}

			_render();
			_animationId = requestAnimationFrame(_loop);
		}

		// --- Lifecycle ---
		function init() {
			_reset();
			_render();
		}

		function start() {
			_isRunning = true;
			_isPaused = false;
			_isGameOver = false;
			_hasWon = false;

			_startTime = now();
			_lastTime = _startTime;

			window.addEventListener("keydown", _onKeyDown);
			window.addEventListener("keyup", _onKeyUp);

			_loop();
		}

		function pause() {
			_isPaused = true;
		}

		function resume() {
			_isPaused = false;
			_lastTime = now();
		}

		function stop() {
			_isRunning = false;
			_isGameOver = false; // Prevent auto-restart

			if (_animationId) cancelAnimationFrame(_animationId);
			if (_restartTimeout) {
				clearTimeout(_restartTimeout);
				_restartTimeout = null;
			}

			window.removeEventListener("keydown", _onKeyDown);
			window.removeEventListener("keyup", _onKeyUp);
		}

		function destroy() {
			stop();
		}

		return {
			init,
			start,
			pause,
			resume,
			stop,
			destroy,
			getState: () => ({
				score,
				coins,
				lives,
				time: now() - _startTime,
			}),
		};
	}

	GameLoader.registerGame("super-mario-64", createSuperMario64Game);
	console.log("[SuperMario64] Game module loaded");
})();
