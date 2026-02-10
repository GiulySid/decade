/**
 * kirby-64.js
 * N64-vibe Kirby-inspired mini platformer for Level 5 (2020)
 *
 * Controls:
 * - ArrowLeft / ArrowRight (or A/D): move
 * - Z (or ArrowUp): jump
 * - Hold jump in air: float (slow fall)
 * - X (or Space): inhale (absorb enemies)
 *
 * Win: collect starsToWin stars
 * Lose: timeLimit reached OR HP <= 0
 *
 * Engine integration:
 * - GameLoader.registerGame('kirby-64', factory)
 * - Uses CanvasRenderer, StateManager, EventBus.Events.MINIGAME_END
 */

(function () {
	"use strict";

	function createKirby64Game(level) {
		const cfg = level && level.config ? level.config : {};
		const DIFFICULTY = cfg.difficulty || 1.8;

		const STARS_TO_WIN = cfg.starsToWin || 18;
		const STAGE_LENGTH = cfg.stageLength || 2600; // virtual world width in px

		const TIME_LIMIT_S = cfg.timeLimit || 75;

		const _ctx = CanvasRenderer.getContext();
		const _canvas = CanvasRenderer.getCanvas();

		// --- Colors (green grass, blue sky, pink platforms) ---
		const COLORS = {
			sky: "#87CEEB",
			skyLight: "#B0E0E6",
			grass: "#5cb85c",
			grassDark: "#449d44",
			path: "#d4a84b",
			pathDark: "#b8923d",
			pink: "#ffb6c1",
			pinkCheck: "#ffc0cb",
			pinkHi: "#ff69b4",
			text: "#f4f1de",
			accent: "#f2c14e",
			enemy: "#f2c14e",
			flower: "#9b59b6",
			flowerCenter: "#e8daef",
			star: "#f2c14e",
			uiDim: "#8b8b8b",
		};

		// Kirby sprite
		let _kirbyImg = null;

		// --- Playfield ---
		const GROUND_Y = Math.floor(_canvas.height * 0.75);
		const GRAVITY = 1100; // px/s^2
		const FLOAT_GRAVITY = 280; // when floating
		const MOVE_SPEED = 240; // px/s
		const JUMP_V = 520; // px/s

		// --- State ---
		let _isRunning = false;
		let _isPaused = false;
		let _isGameOver = false;
		let _animationId = null;
		let _lastTime = 0;
		let _startTime = 0;
		let _restartTimeout = null;

		const _keys = {};

		let _cameraX = 0;

		// Player (Kirby-like blob)
		const player = {
			x: 80,
			y: GROUND_Y - 42,
			w: 42,
			h: 38,
			vx: 0,
			vy: 0,
			onGround: true,
			hp: 3,
			invUntil: 0,
			facing: 1, // 1 right, -1 left
		};

		// Platforms: pink checkered + blue checkered
		const platforms = [
			{ x: 260, y: GROUND_Y - 95, w: 100, h: 14, pink: true },
			{ x: 560, y: GROUND_Y - 150, w: 120, h: 14, pink: false },
			{ x: 920, y: GROUND_Y - 110, w: 100, h: 14, pink: true },
			{ x: 1320, y: GROUND_Y - 165, w: 130, h: 14, pink: true },
			{ x: 1780, y: GROUND_Y - 125, w: 110, h: 14, pink: false },
			{ x: 2140, y: GROUND_Y - 155, w: 140, h: 14, pink: true },
		].map((p) => ({ ...p }));

		// Hidden platform (revealed when purple flower absorbed)
		const hiddenPlatform = { x: 1180, y: GROUND_Y - 250, w: 140, h: 14, pink: true };
		let hiddenPlatformRevealed = false;
		const hiddenPlatformStars = [];
		let heart = null;
		let _virusCollectAnim = null;
		let _foundTextLeftMs = 0;
		const _sparkles = [];
		const _sparkleColors = ["#ffffff", "#a8e6cf", "#ffd0df", "#fff1a8"];

		// Stars to collect
		let stars = [];
		// Enemies (simple walkers)
		let enemies = [];

		let score = 0;
		let starsCollected = 0;

		// Inhale (absorb enemies)
		let _inhaling = false;
		let _inhaleStart = 0;
		const INHALE_DURATION = 420;
		const INHALE_RANGE = 120;
		const INHALE_ENEMY_DURATION = 160;

		// enemy spawn
		let _enemyTimer = 0;
		const ENEMY_INTERVAL = 1600 / DIFFICULTY;

		// --- Helpers ---
		function clamp(v, a, b) {
			return Math.max(a, Math.min(b, v));
		}
		function nowMs() {
			return performance.now();
		}

		function rectsOverlap(a, b) {
			return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
		}

		function worldToScreenX(x) {
			return Math.floor(x - _cameraX);
		}

		function _reset() {
			_cameraX = 0;
			score = 0;
			starsCollected = 0;
			enemies = [];
			stars = [];
			hiddenPlatformStars.length = 0;
			heart = null;
			hiddenPlatformRevealed = false;
			_virusCollectAnim = null;
			_foundTextLeftMs = 0;
			_sparkles.length = 0;
			_inhaling = false;

			player.x = 80;
			player.y = GROUND_Y - player.h;
			player.vx = 0;
			player.vy = 0;
			player.onGround = true;
			player.hp = 3;
			player.invUntil = 0;
			player.facing = 1;

			// Fewer stars, harder placement (on platforms and ground)
			const starCount = Math.max(STARS_TO_WIN + 4, 24);
			for (let i = 0; i < starCount; i++) {
				const x = 180 + (i * (STAGE_LENGTH - 360)) / Math.max(1, starCount - 1);
				const plat = platforms[i % platforms.length];
				const y = i % 4 === 0 ? plat.y - 14 : GROUND_Y - 48 - (i % 3) * 18;
				stars.push({ x, y, w: 10, h: 10, taken: false });
			}

			_updateHUD();
		}

		function _populateHiddenPlatform() {
			hiddenPlatformStars.length = 0;
			for (let i = 0; i < 6; i++) {
				hiddenPlatformStars.push({
					x: hiddenPlatform.x + 20 + i * 18,
					y: hiddenPlatform.y - 14,
					w: 10,
					h: 10,
					taken: false,
				});
			}
			heart = {
				x: hiddenPlatform.x - 200,
				y: hiddenPlatform.y - 100,
				w: 24,
				h: 22,
				taken: false,
			};
		}

		function _updateHUD() {
			StateManager.updateLevelData({
				score,
				starsCollected,
				starsToWin: STARS_TO_WIN,
				hp: player.hp,
				timeLeft: Math.max(0, TIME_LIMIT_S - (nowMs() - _startTime) / 1000),
			});
		}

		// --- Input ---
		function _handleKeyDown(e) {
			if (_isPaused || _isGameOver) return;
			_keys[e.code] = true;

			// Debug skip
			if (e.code === "NumpadMultiply" || (e.code === "Digit8" && e.shiftKey)) {
				_end(true);
				e.preventDefault();
			}

			// prevent scroll
			if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
				e.preventDefault();
			}
		}
		function _handleKeyUp(e) {
			_keys[e.code] = false;
		}

		// --- Gameplay ---
		function _startInhale() {
			if (_inhaling) return;
			_inhaling = true;
			_inhaleStart = nowMs();
		}

		function _spawnEnemy() {
			// spawn slightly ahead of camera, within stage
			const spawnX = clamp(_cameraX + _canvas.width + 120 + Math.random() * 180, 200, STAGE_LENGTH - 80);
			const isFlower = !hiddenPlatformRevealed && Math.random() < 0.12;
			enemies.push({
				x: spawnX,
				y: GROUND_Y - (isFlower ? 24 : 26),
				w: 22,
				h: 20,
				vx: -60 - 20 * DIFFICULTY,
				hp: 1,
				isFlower,
			});
		}

		function _damagePlayer() {
			const t = nowMs();
			if (t < player.invUntil) return;

			player.hp -= 1;
			player.invUntil = t + 900;

			_updateHUD();

			if (player.hp <= 0) {
				_end(false);
			}
		}

		function _end(success) {
			_isRunning = false;
			if (_animationId) cancelAnimationFrame(_animationId);

			if (success) {
				EventBus.emit(EventBus.Events.MINIGAME_END, {
					success: true,
					score,
					starsCollected,
					time: nowMs() - _startTime,
				});
			} else {
				// Game over - auto-restart after delay
				_isGameOver = true;
				_restartTimeout = setTimeout(() => {
					if (_isGameOver) {
						console.log("[Kirby64] Auto-restarting...");
						_isGameOver = false;
						_reset();
						_isRunning = true;
						_startTime = nowMs();
						_lastTime = nowMs();
						_tick();
					}
				}, 2000);
			}
		}

		// --- Physics / collisions ---
		function _applyPlayerPhysics(dt) {
			const dtS = dt / 1000;

			let move = 0;
			if (_keys["ArrowLeft"] || _keys["KeyA"]) move -= 1;
			if (_keys["ArrowRight"] || _keys["KeyD"]) move += 1;

			player.vx = move * MOVE_SPEED;
			if (move !== 0) player.facing = move > 0 ? 1 : -1;

			const jumpPressed = _keys["KeyZ"] || _keys["ArrowUp"];
			const inhalePressed = _keys["KeyX"] || _keys["Space"];

			if (inhalePressed) _startInhale();

			// Jump (only on ground)
			if (jumpPressed && player.onGround) {
				player.vy = -JUMP_V;
				player.onGround = false;
			}

			// Gravity (float if holding jump while airborne)
			const floating = jumpPressed && !player.onGround && player.vy > -120;
			const g = floating ? FLOAT_GRAVITY : GRAVITY;
			player.vy += g * dtS;

			// integrate
			player.x += player.vx * dtS;
			player.y += player.vy * dtS;

			// clamp world bounds
			player.x = clamp(player.x, 10, STAGE_LENGTH - player.w - 10);

			// ground collision
			if (player.y + player.h >= GROUND_Y) {
				player.y = GROUND_Y - player.h;
				player.vy = 0;
				player.onGround = true;
			}

			// platform collisions (from above only)
			const allPlats = hiddenPlatformRevealed ? [...platforms, hiddenPlatform] : platforms;
			for (const p of allPlats) {
				const prevY = player.y - player.vy * dtS;
				const wasAbove = prevY + player.h <= p.y;
				const isFalling = player.vy >= 0;

				if (wasAbove && isFalling) {
					const playerRect = { x: player.x, y: player.y, w: player.w, h: player.h };
					const platRect = { x: p.x, y: p.y, w: p.w, h: p.h };
					if (rectsOverlap(playerRect, platRect)) {
						player.y = p.y - player.h;
						player.vy = 0;
						player.onGround = true;
					}
				}
			}

			// camera follow
			const target = player.x - _canvas.width * 0.35;
			_cameraX = clamp(target, 0, Math.max(0, STAGE_LENGTH - _canvas.width));
		}

		function _updateEnemies(dt) {
			const dtS = dt / 1000;
			const t = nowMs();

			// End inhale after duration
			if (_inhaling && t - _inhaleStart >= INHALE_DURATION) {
				_inhaling = false;
			}

			for (let i = enemies.length - 1; i >= 0; i--) {
				const e = enemies[i];

				if (e.inhaling) {
					// Enemy being sucked in: shrink and move fast toward player
					const elapsed = t - e.inhaleStart;
					const p = Math.min(1, elapsed / INHALE_ENEMY_DURATION);
					const pc = player.x + player.w / 2;
					const ec0 = e.origX + e.origW / 2;
					const centerX = ec0 + (pc - ec0) * p;
					const centerY = e.origY + e.origH / 2 + (player.y + player.h / 2 - (e.origY + e.origH / 2)) * p;
					const shrink = 1 - p;
					e.w = Math.max(2, e.origW * shrink);
					e.h = Math.max(2, e.origH * shrink);
					e.x = centerX - e.w / 2;
					e.y = centerY - e.h / 2;
					if (p >= 1) {
						if (e.isFlower && !hiddenPlatformRevealed) {
							hiddenPlatformRevealed = true;
							_populateHiddenPlatform();
						}
						enemies.splice(i, 1);
						score += 10;
						_updateHUD();
					}
					continue;
				}

				e.x += e.vx * dtS;

				// despawn behind camera
				if (e.x < _cameraX - 120) {
					enemies.splice(i, 1);
					continue;
				}

				// Inhale: start sucking enemy in
				if (_inhaling) {
					const inFront = (player.facing === 1 && e.x > player.x) || (player.facing === -1 && e.x < player.x);
					const dx = Math.abs(e.x + e.w / 2 - (player.x + player.w / 2));
					const dy = Math.abs(e.y + e.h / 2 - (player.y + player.h / 2));
					if (inFront && dx < INHALE_RANGE && dy < 55) {
						e.inhaling = true;
						e.inhaleStart = t;
						e.origX = e.x;
						e.origY = e.y;
						e.origW = e.w;
						e.origH = e.h;
						continue;
					}
				}

				// collide with player (only when not inhaling)
				if (!_inhaling && rectsOverlap(e, player)) {
					_damagePlayer();
				}
			}
		}

		function _collectStars() {
			for (const s of stars) {
				if (s.taken) continue;
				if (rectsOverlap({ x: s.x, y: s.y, w: s.w, h: s.h }, player)) {
					s.taken = true;
					starsCollected += 1;
					score += 5;
					_updateHUD();
					if (starsCollected >= STARS_TO_WIN) {
						_end(true);
						return;
					}
				}
			}
			// Hidden platform stars
			for (const s of hiddenPlatformStars) {
				if (s.taken) continue;
				if (rectsOverlap({ x: s.x, y: s.y, w: s.w, h: s.h }, player)) {
					s.taken = true;
					starsCollected += 1;
					score += 5;
					_updateHUD();
					if (starsCollected >= STARS_TO_WIN) {
						_end(true);
						return;
					}
				}
			}
			// Heart collectible (era2)
			if (heart && !heart.taken && rectsOverlap(heart, player)) {
				heart.taken = true;
				if (typeof StateManager !== "undefined" && StateManager.collectItem) {
					const lvl = StateManager.getCurrentLevel ? StateManager.getCurrentLevel() : 5;
					StateManager.collectItem({ eraKey: "era2", level: lvl, itemId: "virus" });
				}
				const cx = heart.x + heart.w / 2;
				const cy = heart.y + heart.h / 2;
				const sx = worldToScreenX(cx);
				_virusCollectAnim = {
					fromX: sx,
					fromY: cy,
					toX: 50,
					toY: 45,
					startMs: nowMs(),
					durationMs: 1100,
					active: true,
				};
				_spawnSparkleBurst(sx, cy, 28);
				_foundTextLeftMs = 500;
				_updateHUD();
			}
		}

		function _checkTimeLimit() {
			if (!TIME_LIMIT_S || TIME_LIMIT_S <= 0) return;
			const elapsed = (nowMs() - _startTime) / 1000;
			if (elapsed >= TIME_LIMIT_S) {
				_end(false);
			}
		}

		// --- Rendering ---
		function _render() {
			CanvasRenderer.clear(COLORS.sky);

			_renderBackground();
			_renderPlatformsAndGround();
			_renderStars();
			_renderHiddenPlatformStars();
			_renderHeart();
			_renderEnemies();
			_renderInhale();
			_renderPlayer();
			_renderSparkles();
			_renderVirusCollectAnim();
			_renderUI();

			if (_isGameOver) {
				_renderGameOver();
			}
		}

		function _renderBackground() {
			// simple “N64-ish” layered bands
			_ctx.fillStyle = COLORS.sky;
			_ctx.fillRect(0, 0, _canvas.width, _canvas.height);
			const par = _cameraX * 0.2;
			_ctx.fillStyle = "rgba(255, 182, 193, 0.4)";
			for (let i = 0; i < 8; i++) {
				const x = ((i * 280 - (par % 280)) % (_canvas.width + 120)) - 60;
				_ctx.beginPath();
				_ctx.arc(x, 80 + (i % 3) * 40, 60, 0, Math.PI * 2);
				_ctx.fill();
			}
		}

		function _renderPlatformsAndGround() {
			// Green grass ground
			_ctx.fillStyle = COLORS.grassDark;
			_ctx.fillRect(0, GROUND_Y, _canvas.width, _canvas.height - GROUND_Y);
			_ctx.fillStyle = COLORS.grass;
			_ctx.fillRect(0, GROUND_Y, _canvas.width, _canvas.height - GROUND_Y - 8);

			// Winding path (yellow/orange cobblestone)
			const pathY = GROUND_Y + 4;
			_ctx.fillStyle = COLORS.pathDark;
			_ctx.fillRect(0, pathY, _canvas.width, 12);
			_ctx.fillStyle = COLORS.path;
			for (let i = 0; i < 40; i++) {
				const px = ((i * 80 - ((_cameraX * 0.3) % 80)) % (_canvas.width + 60)) - 30;
				_ctx.fillRect(px, pathY + 2, 24, 8);
			}

			// Hidden platform (when revealed)
			if (hiddenPlatformRevealed) {
				const p = hiddenPlatform;
				const sx = worldToScreenX(p.x);
				if (sx <= _canvas.width && sx + p.w >= 0) {
					const checkSize = 12;
					const c1 = COLORS.pinkHi;
					const c2 = COLORS.pinkCheck;
					for (let cx = 0; cx < p.w; cx += checkSize) {
						for (let cy = 0; cy < p.h; cy += checkSize) {
							_ctx.fillStyle = ((cx + cy) / checkSize) % 2 === 0 ? c1 : c2;
							_ctx.fillRect(sx + cx, p.y + cy, checkSize, checkSize);
						}
					}
				}
			}

			// Platforms (pink checkered or blue checkered)
			for (const p of platforms) {
				const sx = worldToScreenX(p.x);
				if (sx > _canvas.width || sx + p.w < 0) continue;
				const checkSize = 12;
				const c1 = p.pink ? COLORS.pinkHi : "#ADD8E6";
				const c2 = p.pink ? COLORS.pinkHi : "#ADD8E6";
				for (let cx = 0; cx < p.w; cx += checkSize) {
					for (let cy = 0; cy < p.h; cy += checkSize) {
						_ctx.fillStyle = ((cx + cy) / checkSize) % 2 === 0 ? c1 : c2;
						_ctx.fillRect(sx + cx, p.y + cy, checkSize, checkSize);
					}
				}
			}
		}

		function _renderStars() {
			_ctx.fillStyle = COLORS.star;
			for (const s of stars) {
				if (s.taken) continue;
				const sx = worldToScreenX(s.x);
				if (sx < -20 || sx > _canvas.width + 20) continue;

				// simple pixel star
				_ctx.fillRect(sx + 4, s.y, 2, 10);
				_ctx.fillRect(sx, s.y + 4, 10, 2);
				_ctx.fillRect(sx + 2, s.y + 2, 6, 6);
			}
		}

		function _renderPlayer() {
			const sx = worldToScreenX(player.x);
			const t = nowMs();
			const inv = t < player.invUntil;

			// Stretch vertically when jumping (squash when falling slightly)
			const isJumping = !player.onGround;
			const stretchY = isJumping && player.vy < 0 ? 1.15 : isJumping ? 0.92 : 1;
			const drawW = player.w;
			const drawH = player.h * stretchY;
			const drawY = player.y + player.h - drawH;

			if (_kirbyImg && _kirbyImg.complete && _kirbyImg.naturalWidth) {
				_ctx.save();
				_ctx.translate(sx + drawW / 2, drawY + drawH / 2);
				_ctx.scale(player.facing, 1);
				_ctx.translate(-drawW / 2, -drawH / 2);
				if (inv && Math.floor((player.invUntil - t) / 80) % 2 === 0) _ctx.globalAlpha = 0.5;
				_ctx.drawImage(_kirbyImg, 0, 0, drawW, drawH);
				_ctx.restore();
			} else {
				// Fallback: Kirby-ish blob
				_ctx.fillStyle = inv ? COLORS.accent : COLORS.pink;
				_ctx.fillRect(sx, drawY + 4, drawW, drawH - 6);
				_ctx.fillRect(sx + 4, drawY, drawW - 8, drawH);
				_ctx.fillStyle = COLORS.text;
				_ctx.fillRect(sx + (player.facing === 1 ? 16 : 8), drawY + 9, 2, 2);
			}
		}

		function _renderEnemies() {
			for (const e of enemies) {
				const sx = worldToScreenX(e.x);
				if (sx < -40 || sx > _canvas.width + 40) continue;
				if (e.isFlower) {
					const r = Math.max(1, e.w / 2 - 2);
					const innerR = Math.min(4, r * 0.5);
					_ctx.fillStyle = COLORS.flower;
					_ctx.beginPath();
					_ctx.arc(sx + e.w / 2, e.y + e.h / 2, r, 0, Math.PI * 2);
					_ctx.fill();
					_ctx.fillStyle = COLORS.flowerCenter;
					_ctx.beginPath();
					_ctx.arc(sx + e.w / 2, e.y + e.h / 2 - 1, innerR, 0, Math.PI * 2);
					_ctx.fill();
				} else {
					_ctx.fillStyle = COLORS.enemy;
					_ctx.fillRect(sx, e.y, e.w, e.h);
					_ctx.fillStyle = "#ffdd77";
					_ctx.fillRect(sx, e.y, e.w, 3);
					_ctx.fillStyle = COLORS.enemy;
				}
			}
		}

		function _renderHiddenPlatformStars() {
			if (!hiddenPlatformRevealed) return;
			_ctx.fillStyle = COLORS.star;
			for (const s of hiddenPlatformStars) {
				if (s.taken) continue;
				const sx = worldToScreenX(s.x);
				if (sx < -20 || sx > _canvas.width + 20) continue;
				_ctx.fillRect(sx + 4, s.y, 2, 10);
				_ctx.fillRect(sx, s.y + 4, 10, 2);
				_ctx.fillRect(sx + 2, s.y + 2, 6, 6);
			}
		}

		function _renderHeart() {
			if (!heart || heart.taken) return;
			const sx = worldToScreenX(heart.x);
			if (sx < -30 || sx > _canvas.width + 30) return;
			const cx = sx + heart.w / 2;
			const cy = heart.y + heart.h / 2;
			const s = heart.w / 3;
			_ctx.fillStyle = "#e63946";
			_ctx.beginPath();
			_ctx.moveTo(cx, cy + s * 0.4);
			_ctx.bezierCurveTo(cx - s, cy + s * 0.2, cx - s * 1.1, cy - s * 0.6, cx, cy - s * 0.2);
			_ctx.bezierCurveTo(cx + s * 1.1, cy - s * 0.6, cx + s, cy + s * 0.2, cx, cy + s * 0.4);
			_ctx.fill();
		}

		// Tetris-style heart collect animation (sparkles + big throbbing emoji)
		function _rand(min, max) {
			return min + Math.random() * (max - min);
		}
		function _randInt(min, max) {
			return Math.floor(_rand(min, max + 1));
		}
		function _clamp(v, lo, hi) {
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
				const elapsed = nowMs() - _virusCollectAnim.startMs;
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

		function _renderVirusCollectAnim() {
			if (!_virusCollectAnim || !_virusCollectAnim.active) return;
			const now = nowMs();
			const elapsed = now - _virusCollectAnim.startMs;
			const duration = _virusCollectAnim.durationMs;
			const phaseA = 350;
			const phaseB = duration - phaseA;

			let x = _virusCollectAnim.fromX;
			let y = _virusCollectAnim.fromY;
			let scale = 1;
			let alpha = 1;

			if (elapsed <= phaseA) {
				const t = _clamp(elapsed / phaseA, 0, 1);
				scale = 0.6 + (1.15 - 0.6) * _easeOutElastic(t);
			} else {
				const t = _clamp((elapsed - phaseA) / phaseB, 0, 1);
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
			const baseSize = 72;
			const sizePx = Math.max(10, Math.round(baseSize * scale));
			_ctx.font = `bold ${sizePx}px Arial, sans-serif`;
			_ctx.fillStyle = "#ffffff";
			_ctx.fillText("🦠", Math.round(x), Math.round(y));
			_ctx.restore();

			if (_foundTextLeftMs > 0) {
				const t = _clamp(_foundTextLeftMs / 400, 0, 1);
				_ctx.save();
				_ctx.globalAlpha = Math.min(1, t);
				CanvasRenderer.drawText("FOUND 🦠!", _virusCollectAnim.fromX, _virusCollectAnim.fromY + 54, {
					color: COLORS.text,
					size: 16,
					align: "center",
				});
				_ctx.restore();
			}
		}

		function _renderInhale() {
			if (!_inhaling) return;
			const sx = worldToScreenX(player.x);
			const progress = Math.min(1, (nowMs() - _inhaleStart) / INHALE_DURATION);
			const mouthX = player.facing === 1 ? sx + player.w : sx;
			const mouthY = player.y + player.h / 2;
			const dir = player.facing;
			const funnelW = 100;
			const funnelDepth = 80;

			_ctx.save();
			// Lines from outside (wide) converging toward Kirby's mouth
			_ctx.strokeStyle = "rgba(255, 182, 193, 0.85)";
			_ctx.lineWidth = 2;
			const lineCount = 8;
			const animOffset = (1 - progress) * 30;
			for (let i = 0; i < lineCount; i++) {
				const t = i / (lineCount - 1);
				const outerY = mouthY - funnelW / 2 + t * funnelW;
				const outerX = mouthX + dir * (funnelDepth + animOffset);
				_ctx.globalAlpha = 0.9 - progress * 0.4;
				_ctx.beginPath();
				_ctx.moveTo(outerX, outerY);
				_ctx.lineTo(mouthX + dir * 8, mouthY);
				_ctx.stroke();
			}
			// Curved converging strokes (funnel shape)
			for (let j = 0; j < 3; j++) {
				const depth = funnelDepth * (0.3 + j * 0.35) + animOffset;
				const w = funnelW * (1 - j * 0.3);
				_ctx.globalAlpha = 0.7 - j * 0.2 - progress * 0.2;
				_ctx.beginPath();
				_ctx.moveTo(mouthX + dir * depth, mouthY - w / 2);
				_ctx.quadraticCurveTo(mouthX + dir * (depth * 0.5), mouthY, mouthX + dir * 5, mouthY);
				_ctx.moveTo(mouthX + dir * depth, mouthY + w / 2);
				_ctx.quadraticCurveTo(mouthX + dir * (depth * 0.5), mouthY, mouthX + dir * 5, mouthY);
				_ctx.stroke();
			}
			_ctx.restore();
		}

		function _renderUI() {
			// Lives (HP)
			CanvasRenderer.drawText("HP", 20, 18, { color: COLORS.uiDim, size: 10, align: "left" });
			for (let i = 0; i < 3; i++) {
				const c = i < player.hp ? COLORS.pink : "#333333";
				CanvasRenderer.drawRect(20 + i * 18, 32, 14, 14, c);
			}

			// Stars collected
			CanvasRenderer.drawText("STARS", 20, 60, { color: COLORS.uiDim, size: 10, align: "left" });
			CanvasRenderer.drawText(`${starsCollected}/${STARS_TO_WIN}`, 20, 76, {
				color: COLORS.star,
				size: 14,
				align: "left",
			});

			// Score
			CanvasRenderer.drawText("SCORE", 20, 105, { color: COLORS.uiDim, size: 10, align: "left" });
			CanvasRenderer.drawText(score.toString(), 20, 121, { color: COLORS.text, size: 14, align: "left" });

			// Controls hint (right side)
			CanvasRenderer.drawText("ARROWS: MOVE", _canvas.width - 18, 18, {
				color: COLORS.uiDim,
				size: 8,
				align: "right",
			});
			CanvasRenderer.drawText("X/UP: JUMP (HOLD=FLOAT)", _canvas.width - 18, 30, {
				color: COLORS.uiDim,
				size: 8,
				align: "right",
			});
			CanvasRenderer.drawText("X/SPACE: INHALE", _canvas.width - 18, 42, {
				color: COLORS.uiDim,
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
			CanvasRenderer.drawText(`Stars: ${starsCollected}/${STARS_TO_WIN}`, _canvas.width / 2, _canvas.height / 2, {
				color: COLORS.text,
				size: 12,
				align: "center",
			});
			CanvasRenderer.drawText(`Score: ${score}`, _canvas.width / 2, _canvas.height / 2 + 25, {
				color: COLORS.uiDim,
				size: 10,
				align: "center",
			});
		}

		// --- Main loop ---
		function _tick(t = nowMs()) {
			if (!_isRunning) {
				_render();
				return;
			}
			const dt = t - _lastTime;
			_lastTime = t;

			if (!_isPaused) {
				_applyPlayerPhysics(dt);
				_updateEnemies(dt);
				_updateVirusCollectEffects(dt);

				_enemyTimer += dt;
				if (_enemyTimer >= ENEMY_INTERVAL && enemies.length < 4) {
					_enemyTimer = 0;
					_spawnEnemy();
				}

				_collectStars();
				_checkTimeLimit();
				_updateHUD();
			}

			_render();
			_animationId = requestAnimationFrame(_tick);
		}

		// --- Lifecycle ---
		function init() {
			_kirbyImg = new Image();
			_kirbyImg.src = "Decade/assets/sprites/kirby.png";
			_reset();
			_render();
		}

		function start() {
			_isRunning = true;
			_isPaused = false;
			_startTime = nowMs();
			_lastTime = _startTime;

			window.addEventListener("keydown", _handleKeyDown);
			window.addEventListener("keyup", _handleKeyUp);

			_tick();
		}

		function pause() {
			_isPaused = true;
		}

		function resume() {
			_isPaused = false;
			_lastTime = nowMs();
		}

		function stop() {
			_isRunning = false;
			_isGameOver = false; // Prevent auto-restart

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
				starsCollected,
				hp: player.hp,
				time: nowMs() - _startTime,
			}),
		};
	}

	GameLoader.registerGame("kirby-64", createKirby64Game);
	console.log("[Kirby64] Game module loaded");
})();
