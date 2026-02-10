/**
 * asteroid-survival.js
 * N64-era pseudo-3D Asteroid Survival mini-game for Level 5 (2020)
 *
 * Win condition: survive for surviveSecondsToWin
 * Lose condition: lose all lives
 *
 * Controls:
 *  - Arrow Keys / WASD: move ship
 *  - (Optional) Space: boost (short burst)
 */

(function () {
	"use strict";

	function createAsteroidSurvivalGame(levelCfg) {
		// =========================
		// CONFIG
		// =========================
		const cfg = levelCfg?.config || {};

		const DIFFICULTY = cfg.difficulty ?? 1.8;
		const TIME_LIMIT = cfg.timeLimit ?? 75; // overall limit (optional)
		const SURVIVE_TO_WIN = cfg.surviveSecondsToWin ?? 60;

		const START_LIVES = cfg.lives ?? 3;

		const BASE_SPAWN_MS = cfg.asteroidSpawnRate ?? 650;
		const SPEED_MIN = cfg.asteroidSpeedMin ?? 120;
		const SPEED_MAX = cfg.asteroidSpeedMax ?? 360;
		const MAX_ASTEROIDS = cfg.maxAsteroids ?? 18;

		const TARGET_SCORE = cfg.targetScore ?? 900;

		// Canvas refs (project pattern)
		const _ctx = CanvasRenderer.getContext();
		const _canvas = CanvasRenderer.getCanvas();

		// N64-ish palette (no green; stays consistent with your project vibe)
		const COLORS = {
			bg: "#16182a",
			bgMid: "#201b35",
			grid: "#2f2447",
			ship: "#f4f1de",
			shipAccent: "#d97f8b",
			asteroid: "#9b8fb8",
			asteroidHi: "#c7bddf",
			warning: "#f2c14e",
			text: "#f4f1de",
			dim: "#9c90b8",
		};

		// =========================
		// STATE
		// =========================
		let _isRunning = false;
		let _isPaused = false;
		let _isGameOver = false;
		let _isVictory = false;

		let _animationId = null;
		let _lastTime = 0;
		let _startTime = 0;
		let _elapsedMs = 0;
		let _restartTimeout = null;

		let _spawnAccMs = 0;
		let _asteroids = [];
		let _moons = [];
		let _moonSpawnAccMs = 0;
		const MOON_SPAWN_INTERVAL_MS = 6500;
		const _heartAnimations = [];

		let _score = 0;
		let _moonBonus = 0;
		let _moonsCollected = 0;
		let _virusCollected = false;
		let _virusCollectAnim = null;
		let _foundTextLeftMs = 0;
		const _sparkles = [];
		const _sparkleColors = ["#ffffff", "#a8e6cf", "#ffd0df", "#fff1a8"];

		// Hit + boost FX
		const _hitBursts = [];
		const _boostTrails = [];

		let _moonImg = null;
		let _shipImg = null;
		let _bgImg = null;

		let _lives = START_LIVES;
		let _hits = 0;

		const _keys = {};
		let _boostUntil = 0;

		// =========================
		// PLAYER (ship)
		// =========================
		const SHIP = {
			x: 0,
			y: 0,
			r: 10, // base collision radius
			speed: 220, // px/s
			invincibleUntil: 0,
		};

		// =========================
		// INIT / RESET
		// =========================
		function init() {
			console.log("[AsteroidSurvival] Initializing...");
			_moonImg = new Image();
			_moonImg.src = "Decade/assets/sprites/asteroid/asteroid_pink_moon.png";
			_shipImg = new Image();
			_shipImg.src = "Decade/assets/sprites/asteroid/asteroid_car.png";
			_bgImg = new Image();
			_bgImg.src = "Decade/assets/sprites/asteroid/asteroid_background.png";
			_reset();
			_render();
		}

		function _reset() {
			_isGameOver = false;
			_isVictory = false;

			_asteroids = [];
			_moons = [];
			_spawnAccMs = 0;
			_moonSpawnAccMs = 0;
			_heartAnimations.length = 0;

			_elapsedMs = 0;
			_score = 0;
			_moonBonus = 0;
			_moonsCollected = 0;
			_virusCollected = false;
			_virusCollectAnim = null;
			_foundTextLeftMs = 0;
			_sparkles.length = 0;
			_hitBursts.length = 0;
			_boostTrails.length = 0;
			_lives = START_LIVES;
			_hits = 0;

			SHIP.x = _canvas.width * 0.5;
			SHIP.y = _canvas.height * 0.65;
			SHIP.invincibleUntil = 0;

			_updateHUD();
		}

		// =========================
		// INPUT
		// =========================
		function _handleKeyDown(e) {
			if (_isPaused || _isGameOver || _isVictory) return;

			_keys[e.code] = true;

			// Optional boost on Space
			if (e.code === "Space") {
				_boostUntil = performance.now() + 250;
				e.preventDefault();
			}

			if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
				e.preventDefault();
			}

			// Debug skip (keep consistent with your other games style)
			if (e.code === "NumpadMultiply" || (e.code === "Digit8" && e.shiftKey)) {
				_win();
				e.preventDefault();
			}
		}

		function _handleKeyUp(e) {
			_keys[e.code] = false;
		}

		// =========================
		// LOOP
		// =========================
		function start() {
			console.log("[AsteroidSurvival] Starting...");
			_isRunning = true;
			_isPaused = false;

			_startTime = performance.now();
			_lastTime = performance.now();

			window.addEventListener("keydown", _handleKeyDown);
			window.addEventListener("keyup", _handleKeyUp);

			_gameLoop();
		}

		function _gameLoop(now = performance.now()) {
			if (!_isRunning) {
				_render();
				return;
			}

			const dt = now - _lastTime;
			_lastTime = now;

			if (!_isPaused && !_isGameOver && !_isVictory) {
				_update(dt);
			}

			_render();
			_animationId = requestAnimationFrame(_gameLoop);
		}

		// =========================
		// UPDATE
		// =========================
		function _update(dt) {
			_elapsedMs += dt;

			// End on TIME_LIMIT if you want it to matter:
			if (TIME_LIMIT > 0 && _elapsedMs / 1000 > TIME_LIMIT) {
				// If time limit exists, treat it as a hard cut:
				// win if survived enough, otherwise lose.
				if (_elapsedMs / 1000 >= SURVIVE_TO_WIN) _win();
				else _gameOver();
				return;
			}

			_updateShip(dt);
			_spawnAsteroids(dt);
			_spawnMoons(dt);
			_updateAsteroids(dt);
			_updateMoons(dt);
			_checkCollisions();
			_updateVirusCollectEffects(dt);

			// Score: survival ticks + moon pickups
			const survivalScore = Math.floor((_elapsedMs / 1000) * (TARGET_SCORE / SURVIVE_TO_WIN));
			_score = Math.min(TARGET_SCORE, survivalScore + _moonBonus);
			_updateHUD();

			// Win: survived enough seconds
			if (_elapsedMs / 1000 >= SURVIVE_TO_WIN) {
				_win();
				return;
			}
		}

		function _updateShip(dt) {
			const t = dt / 1000;

			let dx = 0;
			let dy = 0;

			if (_keys["ArrowLeft"] || _keys["KeyA"]) dx -= 1;
			if (_keys["ArrowRight"] || _keys["KeyD"]) dx += 1;
			if (_keys["ArrowUp"] || _keys["KeyW"]) dy -= 1;
			if (_keys["ArrowDown"] || _keys["KeyS"]) dy += 1;

			// Normalize diagonal
			if (dx !== 0 && dy !== 0) {
				dx *= 0.707;
				dy *= 0.707;
			}

			const now = performance.now();
			const boosting = now < _boostUntil;
			const speed = SHIP.speed * (boosting ? 1.6 : 1);

			SHIP.x += dx * speed * t;
			SHIP.y += dy * speed * t;

			// Clamp within screen (ship never leaves visible area)
			const pad = 18;
			SHIP.x = Math.max(pad, Math.min(_canvas.width - pad, SHIP.x));
			SHIP.y = Math.max(pad, Math.min(_canvas.height - pad, SHIP.y));

			// Spawn boost trail when actively boosting and moving
			if (boosting && (dx !== 0 || dy !== 0)) {
				_boostTrails.push({
					x: SHIP.x,
					y: SHIP.y,
					start: now,
				});
			}
		}

		function _spawnAsteroids(dt) {
			_spawnAccMs += dt;

			// spawn rate scales with difficulty and with time
			const seconds = _elapsedMs / 1000;
			const timeScale = 1 + Math.min(0.6, seconds / 90); // slowly ramps
			const diffScale = Math.max(0.6, Math.min(2.2, DIFFICULTY / 1.8));
			const spawnEvery = BASE_SPAWN_MS / (timeScale * diffScale);

			while (_spawnAccMs >= spawnEvery && _asteroids.length < MAX_ASTEROIDS) {
				_spawnAccMs -= spawnEvery;
				_asteroids.push(_createAsteroid());
			}
		}

		function _spawnMoons(dt) {
			_moonSpawnAccMs += dt;
			while (_moonSpawnAccMs >= MOON_SPAWN_INTERVAL_MS && _moons.length < 3) {
				_moonSpawnAccMs -= MOON_SPAWN_INTERVAL_MS;
				_moons.push(_createMoon());
			}
		}

		function _createMoon() {
			const pad = 40;
			return {
				x: pad + Math.random() * (_canvas.width - pad * 2),
				y: pad + Math.random() * (_canvas.height - pad * 2),
				r: 24,
				vx: (Math.random() - 0.5) * 25,
				vy: (Math.random() - 0.5) * 25,
				alive: true,
			};
		}

		function _updateMoons(dt) {
			const t = dt / 1000;
			for (const m of _moons) {
				m.x += m.vx * t;
				m.y += m.vy * t;
				if (m.x < -20) m.x = _canvas.width + 20;
				if (m.x > _canvas.width + 20) m.x = -20;
				if (m.y < -20) m.y = _canvas.height + 20;
				if (m.y > _canvas.height + 20) m.y = -20;
			}
			_moons = _moons.filter((m) => m.alive);
		}

		function _createAsteroid() {
			// Pseudo-3D: spawn with a "z" depth; move toward camera while growing
			const z = 0.15 + Math.random() * 0.85; // 0..1 depth (small = far)
			const x = Math.random() * _canvas.width;
			const y = Math.random() * (_canvas.height * 0.75);

			const baseR = 8 + Math.random() * 10;

			const speed = lerp(SPEED_MIN, SPEED_MAX, z) * (0.8 + Math.random() * 0.4);

			// Movement direction: toward center-ish for that "field" feel
			const cx = _canvas.width * 0.5;
			const cy = _canvas.height * 0.55;

			let vx = (cx - x) * 0.15 + (Math.random() - 0.5) * 120;
			let vy = (cy - y) * 0.15 + (Math.random() - 0.5) * 80;

			const vlen = Math.max(1, Math.hypot(vx, vy));
			vx = (vx / vlen) * 0.65;
			vy = (vy / vlen) * 0.65;

			return {
				x,
				y,
				z,
				baseR,
				speed,
				vx,
				vy,
				rot: Math.random() * Math.PI * 2,
				rotV: (Math.random() - 0.5) * 2.2,
				alive: true,
			};
		}

		function _updateAsteroids(dt) {
			const t = dt / 1000;

			for (const a of _asteroids) {
				// Approach camera: increase z; when z>1, it "passes" the camera and is recycled
				a.z += (a.speed / 900) * t;
				a.x += a.vx * a.speed * 0.35 * t;
				a.y += a.vy * a.speed * 0.35 * t;
				a.rot += a.rotV * t;

				// Wrap softly to keep field full
				if (a.x < -80) a.x = _canvas.width + 80;
				if (a.x > _canvas.width + 80) a.x = -80;
				if (a.y < -80) a.y = _canvas.height + 80;
				if (a.y > _canvas.height + 80) a.y = -80;

				// If it passes the camera, respawn it far
				if (a.z > 1.1) {
					// reset far away
					a.z = 0.12 + Math.random() * 0.25;
					a.x = Math.random() * _canvas.width;
					a.y = Math.random() * (_canvas.height * 0.75);
					a.baseR = 8 + Math.random() * 10;
					a.speed = lerp(SPEED_MIN, SPEED_MAX, a.z) * (0.8 + Math.random() * 0.4);
				}
			}

			// Keep list small and clean
			_asteroids = _asteroids.filter((a) => a.alive);
		}

		function _checkCollisions() {
			const now = performance.now();

			// Moon collection (+50, heart animation; after 3 moons: virus collectible)
			const shipR = SHIP.r;
			for (const m of _moons) {
				const dist = Math.hypot(m.x - SHIP.x, m.y - SHIP.y);
				if (dist < m.r + shipR) {
					m.alive = false;
					_moonBonus += 50;
					_moonsCollected += 1;
					if (typeof StateManager !== "undefined" && StateManager.addScore) StateManager.addScore(50);
					_heartAnimations.push({ x: m.x, y: m.y, startTime: performance.now() });
					// After 3 moons: virus collectible with big animation
					if (_moonsCollected >= 3 && !_virusCollected) {
						_virusCollected = true;
						if (typeof StateManager !== "undefined" && StateManager.collectItem) {
							const lvl = StateManager.getCurrentLevel ? StateManager.getCurrentLevel() : 5;
							StateManager.collectItem({ eraKey: "era2", level: lvl, itemId: "virus" });
						}
						_virusCollectAnim = {
							fromX: m.x,
							fromY: m.y,
							toX: 50,
							toY: 45,
							startMs: performance.now(),
							durationMs: 1100,
							active: true,
						};
						_spawnSparkleBurst(m.x, m.y, 28);
						_foundTextLeftMs = 500;
					}
					break;
				}
			}

			if (now < SHIP.invincibleUntil) return;

			for (const a of _asteroids) {
				// asteroid radius scales with z (pseudo-3D)
				const r = a.baseR * (0.5 + a.z * 1.6);
				const dx = a.x - SHIP.x;
				const dy = a.y - SHIP.y;
				const dist = Math.hypot(dx, dy);

				if (dist < r + shipR) {
					_hit();
					break;
				}
			}
		}

		function _hit() {
			_lives -= 1;
			_hits += 1;
			SHIP.invincibleUntil = performance.now() + 900;

			// Hit burst FX at ship position
			_hitBursts.push({
				x: SHIP.x,
				y: SHIP.y,
				start: performance.now(),
				duration: 450,
			});

			_updateHUD();

			if (_lives <= 0) {
				_gameOver();
			}
		}

		// =========================
		// END STATES
		// =========================
		function _gameOver() {
			console.log("[AsteroidSurvival] Game Over");
			_isGameOver = true;

			// Auto-restart after delay
			_restartTimeout = setTimeout(() => {
				if (_isGameOver) {
					console.log("[AsteroidSurvival] Auto-restarting...");
					_reset();
					_isRunning = true;
					_startTime = performance.now();
					_lastTime = performance.now();
					_gameLoop();
				}
			}, 2000);
		}

		function _win() {
			console.log("[AsteroidSurvival] Victory!");
			_isVictory = true;
			_isRunning = false;

			EventBus.emit(EventBus.Events.MINIGAME_END, {
				success: true,
				score: _score,
				lives: _lives,
				hits: _hits,
				time: performance.now() - _startTime,
			});
		}

		// =========================
		// HUD
		// =========================
		function _updateHUD() {
			StateManager.updateLevelData({
				score: _score,
				targetScore: TARGET_SCORE,
				lives: _lives,
				surviveSecondsToWin: SURVIVE_TO_WIN,
				elapsedSeconds: Math.floor(_elapsedMs / 1000),
				hits: _hits,
			});
		}

		// =========================
		// RENDER
		// =========================
		function _renderBackground() {
			if (_bgImg && _bgImg.complete && _bgImg.naturalWidth > 0) {
				const imgW = _bgImg.naturalWidth;
				const imgH = _bgImg.naturalHeight;
				const canvasW = _canvas.width;
				const canvasH = _canvas.height;
				const scale = Math.max(canvasW / imgW, canvasH / imgH);
				const drawW = imgW * scale;
				const drawH = imgH * scale;
				const dx = (canvasW - drawW) / 2;
				const dy = (canvasH - drawH) / 2;
				_ctx.drawImage(_bgImg, dx, dy, drawW, drawH);
			} else {
				CanvasRenderer.clear(COLORS.bg);
			}
		}

		function _render() {
			_renderBackground();
			_renderStarfield();
			_renderScanGrid();
			_renderAsteroids();
			_renderMoons();
			_renderBoostTrails();
			_renderShip();
			_renderHitEffects();
			_renderHeartAnimations();
			_renderSparkles();
			_renderVirusCollectAnim();
			_renderUI();

			if (_isGameOver) _renderGameOver();
			if (_isPaused) _renderPause();
		}

		function _renderHitEffects() {
			if (!_hitBursts.length) return;
			const now = performance.now();
			for (let i = _hitBursts.length - 1; i >= 0; i--) {
				const h = _hitBursts[i];
				const t = (now - h.start) / h.duration;
				if (t >= 1) {
					_hitBursts.splice(i, 1);
					continue;
				}
				const alpha = 1 - t;
				const radius = 10 + 40 * t;

				_ctx.save();
				_ctx.globalAlpha = 0.4 * alpha;
				_ctx.strokeStyle = COLORS.warning;
				_ctx.lineWidth = 3;
				_ctx.beginPath();
				_ctx.arc(h.x, h.y, radius, 0, Math.PI * 2);
				_ctx.stroke();
				_ctx.restore();
			}
		}

		function _renderBoostTrails() {
			if (!_boostTrails.length) return;
			const now = performance.now();
			const life = 220;
			for (let i = _boostTrails.length - 1; i >= 0; i--) {
				const tr = _boostTrails[i];
				const t = (now - tr.start) / life;
				if (t >= 1) {
					_boostTrails.splice(i, 1);
					continue;
				}
				const alpha = 0.6 * (1 - t);
				const scale = 1 - 0.4 * t;
				const x = Math.floor(tr.x);
				const y = Math.floor(tr.y) + 8;

				_ctx.save();
				_ctx.globalAlpha = alpha;
				_ctx.fillStyle = COLORS.warning;
				_ctx.beginPath();
				_ctx.moveTo(x, y + 16 * scale);
				_ctx.lineTo(x - 6 * scale, y);
				_ctx.lineTo(x + 6 * scale, y);
				_ctx.closePath();
				_ctx.fill();
				_ctx.restore();
			}
		}

		function _renderGameOver() {
			CanvasRenderer.fade(0.7);
			CanvasRenderer.drawText("GAME OVER", _canvas.width / 2, _canvas.height / 2 - 40, {
				color: COLORS.warning,
				size: 24,
				align: "center",
			});
			CanvasRenderer.drawText(
				`Survived: ${Math.floor(_elapsedMs / 1000)}/${SURVIVE_TO_WIN}s`,
				_canvas.width / 2,
				_canvas.height / 2,
				{
					color: COLORS.text,
					size: 12,
					align: "center",
				}
			);
			CanvasRenderer.drawText(`Score: ${_score}`, _canvas.width / 2, _canvas.height / 2 + 25, {
				color: COLORS.dim,
				size: 10,
				align: "center",
			});
		}

		function _renderStarfield() {
			// Simple N64-ish background bands + stars
			// _ctx.fillStyle = COLORS.bgMid;
			// _ctx.fillRect(0, 0, _canvas.width, _canvas.height * 0.55);

			// Stars (deterministic-ish using time)
			const t = _elapsedMs / 1000;
			for (let i = 0; i < 60; i++) {
				const x = (i * 37) % _canvas.width;
				const y = (i * 91) % Math.floor(_canvas.height * 0.6);
				const tw = ((i * 13) % 3) + 1;
				const drift = (t * (10 + (i % 6) * 6)) % _canvas.width;
				_ctx.fillStyle = i % 8 === 0 ? COLORS.warning : COLORS.dim;
				_ctx.fillRect((x - drift + _canvas.width) % _canvas.width, y, tw, 1);
			}
		}

		function _renderScanGrid() {
			// subtle grid lines (N64 menu vibes)
			_ctx.globalAlpha = 0.18;
			_ctx.strokeStyle = COLORS.grid;
			_ctx.lineWidth = 1;

			const step = 40;
			for (let x = 0; x <= _canvas.width; x += step) {
				_ctx.beginPath();
				_ctx.moveTo(x, 0);
				_ctx.lineTo(x, _canvas.height);
				_ctx.stroke();
			}
			for (let y = 0; y <= _canvas.height; y += step) {
				_ctx.beginPath();
				_ctx.moveTo(0, y);
				_ctx.lineTo(_canvas.width, y);
				_ctx.stroke();
			}
			_ctx.globalAlpha = 1;
		}

		function _renderAsteroids() {
			// Draw far -> near for depth
			const sorted = [..._asteroids].sort((a, b) => a.z - b.z);

			for (const a of sorted) {
				const r = a.baseR * (0.5 + a.z * 1.6);

				// shading: slightly brighter when closer
				const c = a.z > 0.7 ? COLORS.asteroidHi : COLORS.asteroid;

				_ctx.save();
				_ctx.translate(a.x, a.y);
				_ctx.rotate(a.rot);

				// irregular rock (cheap polygon)
				_ctx.fillStyle = c;
				_ctx.beginPath();
				_ctx.moveTo(-r, -r * 0.2);
				_ctx.lineTo(-r * 0.3, -r);
				_ctx.lineTo(r * 0.6, -r * 0.6);
				_ctx.lineTo(r, r * 0.1);
				_ctx.lineTo(r * 0.2, r);
				_ctx.lineTo(-r * 0.8, r * 0.6);
				_ctx.closePath();
				_ctx.fill();

				// highlight edge
				_ctx.globalAlpha = 0.35;
				_ctx.strokeStyle = COLORS.text;
				_ctx.lineWidth = 1;
				_ctx.stroke();
				_ctx.globalAlpha = 1;

				_ctx.restore();
			}
		}

		function _renderMoons() {
			for (const m of _moons) {
				if (_moonImg && _moonImg.complete && _moonImg.naturalWidth > 0) {
					_ctx.drawImage(_moonImg, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
				} else {
					_ctx.fillStyle = "#ff3366";
					_ctx.beginPath();
					_ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
					_ctx.fill();
					_ctx.globalAlpha = 0.7;
					_ctx.fillStyle = "#ff85a2";
					_ctx.beginPath();
					_ctx.arc(m.x - 2, m.y - 2, m.r * 0.4, 0, Math.PI * 2);
					_ctx.fill();
					_ctx.globalAlpha = 1;
				}
			}
		}

		function _drawHeart(x, y, progress) {
			const s = 18 * (1 - progress * 0.3);
			const rise = -progress * 50;
			const alpha = 1 - progress;
			if (alpha <= 0) return;
			const hx = x;
			const hy = y + rise;
			_ctx.globalAlpha = alpha;
			_ctx.fillStyle = "#e63946";
			_ctx.beginPath();
			_ctx.moveTo(hx, hy + s * 0.4);
			_ctx.bezierCurveTo(hx - s, hy + s * 0.2, hx - s * 1.1, hy - s * 0.6, hx, hy - s * 0.2);
			_ctx.bezierCurveTo(hx + s * 1.1, hy - s * 0.6, hx + s, hy + s * 0.2, hx, hy + s * 0.4);
			_ctx.fill();
			const sparkleAlpha = alpha * (1 - progress * 0.5);
			_ctx.globalAlpha = sparkleAlpha;
			_ctx.fillStyle = "#ffb3ba";
			const offsets = [
				{ dx: -s * 1.4, dy: -s * 0.3 },
				{ dx: s * 1.4, dy: -s * 0.3 },
				{ dx: -s * 1.1, dy: s * 0.8 },
				{ dx: s * 1.1, dy: s * 0.8 },
				{ dx: 0, dy: -s * 1.2 },
				{ dx: -s * 1.6, dy: s * 0.2 },
				{ dx: s * 1.6, dy: s * 0.2 },
			];
			const sparkleScale = 1 + progress * 0.5;
			offsets.forEach(({ dx, dy }, i) => {
				const sz = (3 + (i % 3)) * sparkleScale * (1 - progress * 0.6);
				_ctx.fillRect(hx + dx - sz / 2, hy + dy - sz / 2, sz, sz);
			});
			_ctx.globalAlpha = 1;
		}

		function _renderHeartAnimations() {
			const now = performance.now();
			const duration = 800;
			for (let i = _heartAnimations.length - 1; i >= 0; i--) {
				const h = _heartAnimations[i];
				const elapsed = now - h.startTime;
				if (elapsed >= duration) {
					_heartAnimations.splice(i, 1);
					continue;
				}
				_drawHeart(h.x, h.y, elapsed / duration);
			}
		}

		// Tetris-style virus collect animation (sparkles + big throbbing emoji)
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
				const elapsed = performance.now() - _virusCollectAnim.startMs;
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
			const now = performance.now();
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

		function _renderShip() {
			const now = performance.now();
			const inv = now < SHIP.invincibleUntil;

			// flicker when invincible
			if (inv && Math.floor((SHIP.invincibleUntil - now) / 80) % 2 === 0) return;

			const x = Math.floor(SHIP.x);
			const y = Math.floor(SHIP.y);

			// Dark blue shadow beneath ship
			_ctx.save();
			_ctx.globalAlpha = 0.35;
			_ctx.fillStyle = "#1a1a3e";
			_ctx.beginPath();
			_ctx.ellipse(x, y + 18, 18, 6, 0, 0, Math.PI * 2);
			_ctx.fill();
			_ctx.restore();

			// Ship sprite (car)
			const w = 40;
			const h = 60;
			if (_shipImg && _shipImg.complete && _shipImg.naturalWidth > 0) {
				_ctx.drawImage(_shipImg, x - w / 2, y - h / 2, w, h);
			} else {
				// Fallback: original triangle ship
				_ctx.fillStyle = COLORS.ship;
				_ctx.beginPath();
				_ctx.moveTo(x, y - 14);
				_ctx.lineTo(x - 10, y + 10);
				_ctx.lineTo(x + 10, y + 10);
				_ctx.closePath();
				_ctx.fill();

				_ctx.fillStyle = COLORS.shipAccent;
				_ctx.fillRect(x - 2, y - 6, 4, 8);
			}

			// Boost effect
			const boosting = performance.now() < _boostUntil;
			if (boosting) {
				_ctx.globalAlpha = 0.8;
				_ctx.fillStyle = COLORS.warning;
				_ctx.fillRect(x - 2, y + 10, 4, 10);
				_ctx.globalAlpha = 1;
			}
		}

		function _renderUI() {
			// Minimal in-canvas UI (your HUD exists; this is just feedback)
			CanvasRenderer.drawText("LIVES", 20, 20, {
				color: COLORS.dim,
				size: 10,
				align: "left",
			});

			for (let i = 0; i < START_LIVES; i++) {
				const c = i < _lives ? COLORS.warning : COLORS.grid;
				CanvasRenderer.drawRect(20 + i * 18, 34, 14, 10, c);
			}

			const sec = Math.floor(_elapsedMs / 1000);
			CanvasRenderer.drawText(`SURVIVE ${sec}/${SURVIVE_TO_WIN}`, 20, 62, {
				color: COLORS.text,
				size: 10,
				align: "left",
			});

			// Controls hint
			CanvasRenderer.drawText("ARROWS/WASD: MOVE", _canvas.width - 20, 20, {
				color: COLORS.dim,
				size: 8,
				align: "right",
			});
			CanvasRenderer.drawText("A/SPACE: BOOST", _canvas.width - 20, 34, {
				color: COLORS.dim,
				size: 8,
				align: "right",
			});
		}

		function _renderPause() {
			CanvasRenderer.fade(0.55);
			CanvasRenderer.drawText("PAUSED", _canvas.width / 2, _canvas.height / 2, {
				color: COLORS.warning,
				size: 24,
				align: "center",
			});
		}

		// =========================
		// LIFECYCLE
		// =========================
		function pause() {
			console.log("[AsteroidSurvival] Paused");
			_isPaused = true;
		}

		function resume() {
			console.log("[AsteroidSurvival] Resumed");
			_isPaused = false;
			_lastTime = performance.now();
		}

		function stop() {
			console.log("[AsteroidSurvival] Stopped");
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
			console.log("[AsteroidSurvival] Destroyed");
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
				isRunning: _isRunning,
				isPaused: _isPaused,
				isGameOver: _isGameOver,
				isVictory: _isVictory,
				score: _score,
				lives: _lives,
				hits: _hits,
				elapsedMs: _elapsedMs,
			}),
		};
	}

	function lerp(a, b, t) {
		return a + (b - a) * t;
	}

	// Register game with your engine
	GameLoader.registerGame("asteroid-survival", createAsteroidSurvivalGame);
	console.log("[AsteroidSurvival] Game module loaded");
})();
