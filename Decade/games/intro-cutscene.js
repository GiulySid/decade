/**
 * intro-cutscene.js
 * Pre-Level 1 intro cutscene (Level 0).
 *
 * - Background: Decade/assets/sprites/intro_cutscene/Background.png
 * - Characters: Giulia/Simone step + still sprites (dx/sx)
 * - Controls:
 *   - Simone: ArrowLeft / ArrowRight
 *   - Giulia: A / D
 * - Each press (and hold repeat) triggers a discrete step (fixed px)
 * - When both enter meeting zone -> face each other -> fade out -> MINIGAME_END success:true
 * - Debug skip: NumpadMultiply or Shift+Digit8 ('*')
 */

(function () {
	"use strict";

	const GAME_ID = "intro-cutscene";

	function createIntroCutscene(levelConfig) {
		const cfg = (levelConfig && levelConfig.config) || {};

		const _ctx = CanvasRenderer.getContext();
		const _canvas = CanvasRenderer.getCanvas();

		// Asset base (matches current repo layout)
		const ASSET_BASE = "Decade/assets/sprites/intro_cutscene/";

		const STEP_PX = cfg.stepPx ?? 22;
		const HOLD_INTERVAL = cfg.stepHoldIntervalMs ?? 140;
		const STEP_SPRITE_MS = cfg.stepSpriteMs ?? 120;
		const GROUND_Y = cfg.groundY ?? 360;
		const MEETING_ZONE = cfg.meetingZone || { x: 420, y: 330, w: 140, h: 120 };

		const SIMONE_START_X = cfg.simoneStartX ?? 40;
		const GIULIA_START_X = cfg.giuliaStartX ?? 900;

		const INTRO_TEXT_MS = 3000;
		const FADE_MS = 700;
		const SPRITE_DRAW_H = cfg.spriteHeight ?? 126;

		// Meeting moment effect (cute + romantic)
		const MEET_MOMENT_MS = cfg.meetMomentMs ?? 1400; // total moment duration before fade starts
		const SHAKE_DURATION_MS = 450;
		const SHAKE_INTENSITY_START = 8; // px (subtle)
		const FLASH_MS = 120;

		const SPARKLE_BURST_TOTAL = cfg.sparkleCount ?? 28; // 20-35 feels good
		const SPARKLE_SPAWN_MS = 300; // spawn window
		const SPARKLE_LIFE_MS = 700;
		const SPARKLE_GRAVITY = 160; // px/s^2
		const SPARKLE_VX = 40; // px/s range
		const SPARKLE_VY_MIN = -90; // px/s
		const SPARKLE_VY_MAX = -30; // px/s
		const SPARKLE_COLORS = ["#ffffff", "#fff1a8", "#ffd0df"]; // white / pale yellow / pale pink

		let _running = false;
		let _paused = false;
		let _raf = null;
		let _lastTs = 0;

		let _frozen = false;
		let _fadeStart = null;
		let _introStart = 0;

		// Meeting moment runtime
		let _meetingStarted = false;
		let _meetingStart = 0;
		let _meetingPoint = { x: 0, y: 0 };

		let _shakeLeftMs = 0;
		let _shakeIntensity = 0;
		let _flashLeftMs = 0;

		let _sparkles = [];
		let _sparkleSpawnLeft = 0;
		let _sparkleSpawned = 0;
		let _sparkleSpawnAcc = 0;

		const _keys = {};
		let _keyDownHandler = null;
		let _keyUpHandler = null;

		const _timeouts = new Set();

		// Images
		const _imgs = {
			bg: new Image(),
			giulia_step_dx: new Image(),
			giulia_step_sx: new Image(),
			giulia_still_dx: new Image(),
			giulia_still_sx: new Image(),
			simone_step_dx: new Image(),
			simone_step_sx: new Image(),
			simone_still_dx: new Image(),
			simone_still_sx: new Image(),
		};

		let _assetsReady = false;

		function _loadImage(img, src) {
			return new Promise((resolve) => {
				img.onload = () => resolve(true);
				img.onerror = () => resolve(false);
				img.src = src;
			});
		}

		function _setTimeout(fn, ms) {
			const id = setTimeout(() => {
				_timeouts.delete(id);
				fn();
			}, ms);
			_timeouts.add(id);
			return id;
		}

		function _clearTimeouts() {
			_timeouts.forEach((id) => clearTimeout(id));
			_timeouts.clear();
		}

		function _clamp(v, min, max) {
			return Math.max(min, Math.min(max, v));
		}

		function _nowMs() {
			return performance.now();
		}

		function _rectsOverlap(a, b) {
			return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
		}

		function _rand(min, max) {
			return min + Math.random() * (max - min);
		}

		function _randInt(min, max) {
			return Math.floor(_rand(min, max + 1));
		}

		function _spawnSparkle(x, y) {
			const color = SPARKLE_COLORS[_randInt(0, SPARKLE_COLORS.length - 1)];
			const size = _randInt(1, 2); // 1-2 px scale
			_sparkles.push({
				x,
				y,
				vx: _rand(-SPARKLE_VX, SPARKLE_VX),
				vy: _rand(SPARKLE_VY_MIN, SPARKLE_VY_MAX),
				lifeMs: SPARKLE_LIFE_MS,
				maxLifeMs: SPARKLE_LIFE_MS,
				size,
				color,
			});
		}

		function _updateSparkles(dtMs) {
			if (_sparkles.length === 0) return;
			const dt = dtMs / 1000;
			for (let i = _sparkles.length - 1; i >= 0; i--) {
				const p = _sparkles[i];
				p.vy += SPARKLE_GRAVITY * dt;
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				p.lifeMs -= dtMs;
				if (p.lifeMs <= 0) {
					_sparkles.splice(i, 1);
				}
			}
		}

		function _drawSparkle(p) {
			const a = _clamp(p.lifeMs / p.maxLifeMs, 0, 1);
			CanvasRenderer.setAlpha(Math.min(0.9, a));

			const x = Math.round(p.x);
			const y = Math.round(p.y);
			const s = p.size;

			// Tiny pixel cross/star
			CanvasRenderer.drawRect(x, y, 1 * s, 1 * s, p.color);
			CanvasRenderer.drawRect(x - 1 * s, y, 1 * s, 1 * s, p.color);
			CanvasRenderer.drawRect(x + 1 * s, y, 1 * s, 1 * s, p.color);
			CanvasRenderer.drawRect(x, y - 1 * s, 1 * s, 1 * s, p.color);
			CanvasRenderer.drawRect(x, y + 1 * s, 1 * s, 1 * s, p.color);

			CanvasRenderer.setAlpha(1);
		}

		function _renderSparkles() {
			for (let i = 0; i < _sparkles.length; i++) {
				_drawSparkle(_sparkles[i]);
			}
		}

		function _getSprite(char, kind, facing) {
			// kind: 'still' | 'step'
			// facing: 'dx' | 'sx'
			return _imgs[`${char}_${kind}_${facing}`];
		}

		function _spriteW(img) {
			return img && img.complete && img.naturalWidth ? img.naturalWidth : 48;
		}

		function _spriteH(img) {
			return img && img.complete && img.naturalHeight ? img.naturalHeight : 72;
		}

		function _getDrawSize(img, level) {
			const h = _spriteH(img);
			const w = _spriteW(img);
			const baseScale = h > 0 ? SPRITE_DRAW_H / h : 1;
			const scaleFactor = LEVEL_SCALES[level] ?? 1;
			const scale = baseScale * scaleFactor;
			return {
				w: Math.max(1, Math.round(w * scale)),
				h: Math.max(1, Math.round(SPRITE_DRAW_H * scaleFactor)),
			};
		}

		const LEVEL_COUNT = 5; // 0 = biggest (front), 4 = smallest (back)
		const LEVEL_SCALES = [1, 0.9, 0.8, 0.7, 0.6];
		const LEVEL_Y_STEP = 26; // vertical offset per level

		const simone = {
			x: SIMONE_START_X,
			facing: "dx", // right
			stepping: false,
			stepUntil: 0,
			lastStepAt: -Infinity,
			level: 0,
		};

		const giulia = {
			x: GIULIA_START_X,
			facing: "sx", // left
			stepping: false,
			stepUntil: 0,
			lastStepAt: -Infinity,
			level: 0,
		};

		function _getGroundYForChar(charName) {
			const level = (charName === "simone" ? simone.level : giulia.level) || 0;
			return GROUND_Y - level * LEVEL_Y_STEP;
		}

		function _getCharRect(charName) {
			const c = charName === "simone" ? simone : giulia;
			const img = _getSprite(charName, c.stepping ? "step" : "still", c.facing);
			const level = c.level || 0;
			const ds = _getDrawSize(img, level);
			const w = ds.w;
			const h = ds.h;
			const x = c.x;
			const baseY = _getGroundYForChar(charName);
			const y = baseY - h;
			return { x, y, w, h };
		}

		function _stepChar(charName, dir, now) {
			if (_frozen) return;

			const c = charName === "simone" ? simone : giulia;
			if (now - c.lastStepAt < HOLD_INTERVAL) return;

			c.lastStepAt = now;
			c.facing = dir > 0 ? "dx" : "sx";

			const rect = _getCharRect(charName);
			const w = rect.w;
			c.x = _clamp(c.x + dir * STEP_PX, 0, _canvas.width - w);

			c.stepping = true;
			c.stepUntil = now + STEP_SPRITE_MS;
		}

		function _changeCharLevel(charName, delta, now) {
			if (_frozen) return;
			const c = charName === "simone" ? simone : giulia;
			const prev = c.level || 0;
			const next = _clamp(prev + delta, 0, LEVEL_COUNT - 1);
			if (next === prev) return;
			c.level = next;
			// Trigger a small step animation when changing level
			c.stepping = true;
			c.stepUntil = now + STEP_SPRITE_MS;
			c.lastStepAt = now;
		}

		function _handleHeldKeys(now) {
			// Simone: arrows
			if (_keys.ArrowLeft) _stepChar("simone", -1, now);
			else if (_keys.ArrowRight) _stepChar("simone", 1, now);

			// Giulia: A/D (keyboard) and virtual controller face buttons (Z/X/Space)
			if (_keys.KeyA || _keys.KeyZ) _stepChar("giulia", -1, now);
			else if (_keys.KeyD || _keys.KeyX || _keys.Space) _stepChar("giulia", 1, now);
		}

		function _checkMeeting(now) {
			if (_frozen) return;

			const sRect = _getCharRect("simone");
			const gRect = _getCharRect("giulia");
			const zone = MEETING_ZONE;

			const sIn = _rectsOverlap(sRect, zone);
			const gIn = _rectsOverlap(gRect, zone);
			const sameLevel = (simone.level || 0) === (giulia.level || 0);

			if (sIn && gIn && sameLevel) {
				_frozen = true;
				_meetingStarted = true;
				_meetingStart = now;
				_fadeStart = null; // delay fade until after moment

				// Face each other
				if (simone.x <= giulia.x) {
					simone.facing = "dx";
					giulia.facing = "sx";
				} else {
					simone.facing = "sx";
					giulia.facing = "dx";
				}
				simone.stepping = false;
				giulia.stepping = false;

				// Meeting point = midpoint between character centers (use rects)
				const sCx = sRect.x + sRect.w / 2;
				const gCx = gRect.x + gRect.w / 2;
				const sCy = sRect.y + sRect.h * 0.35;
				const gCy = gRect.y + gRect.h * 0.35;
				_meetingPoint.x = Math.round((sCx + gCx) / 2);
				_meetingPoint.y = Math.round((sCy + gCy) / 2);

				// Start effects
				_shakeLeftMs = SHAKE_DURATION_MS;
				_shakeIntensity = SHAKE_INTENSITY_START;
				_flashLeftMs = FLASH_MS;

				_sparkles = [];
				_sparkleSpawnLeft = SPARKLE_SPAWN_MS;
				_sparkleSpawned = 0;
				_sparkleSpawnAcc = 0;
			}
		}

		function _drawBackground() {
			if (_imgs.bg.complete && _imgs.bg.naturalWidth) {
				_ctx.drawImage(_imgs.bg, 0, 0, _canvas.width, _canvas.height);
			} else {
				CanvasRenderer.clear("#0a0a1a");
			}
		}

		function _drawCharacter(charName) {
			const c = charName === "simone" ? simone : giulia;
			const rect = _getCharRect(charName);
			const img = _getSprite(charName, c.stepping ? "step" : "still", c.facing);
			const w = rect.w;
			const h = rect.h;
			const x = rect.x;
			const y = rect.y;

			if (img.complete && img.naturalWidth) {
				_ctx.drawImage(img, Math.floor(x), Math.floor(y), w, h);
			} else {
				// Fallback placeholder
				CanvasRenderer.drawRect(Math.floor(x), Math.floor(y), w, h, charName === "simone" ? "#44aaff" : "#ff66aa");
			}
		}

		function _drawIntroHint(now) {
			if (now - _introStart > INTRO_TEXT_MS) return;
			const y = _canvas.height - 24;
			CanvasRenderer.drawText("INTRO", _canvas.width / 2, y - 12, { align: "center", size: 10, color: "#ffffff" });
			CanvasRenderer.drawText("ARROWS = Simone • A/D = Giulia", _canvas.width / 2, y, {
				align: "center",
				size: 8,
				color: "#dddddd",
			});
		}

		function _drawFade(now) {
			if (_fadeStart == null) return false;
			const t = _clamp((now - _fadeStart) / FADE_MS, 0, 1);
			CanvasRenderer.setAlpha(t);
			CanvasRenderer.drawRect(0, 0, _canvas.width, _canvas.height, "#000000");
			CanvasRenderer.setAlpha(1);
			return t >= 1;
		}

		function _loop(ts) {
			if (!_running) return;
			_raf = requestAnimationFrame(_loop);

			if (_paused) return;

			const now = ts || _nowMs();
			const dtMs = Math.min(50, Math.max(0, now - (_lastTs || now)));
			_lastTs = now;

			// Update stepping state
			if (simone.stepping && now >= simone.stepUntil) simone.stepping = false;
			if (giulia.stepping && now >= giulia.stepUntil) giulia.stepping = false;

			if (!_frozen) {
				_handleHeldKeys(now);
				_checkMeeting(now);
			}

			// Meeting moment updates (shake/flash/sparkles), then start fade
			if (_meetingStarted) {
				if (_shakeLeftMs > 0) _shakeLeftMs = Math.max(0, _shakeLeftMs - dtMs);
				if (_flashLeftMs > 0) _flashLeftMs = Math.max(0, _flashLeftMs - dtMs);

				// Sparkle spawning (burst for first ~300ms)
				if (_sparkleSpawnLeft > 0 && _sparkleSpawned < SPARKLE_BURST_TOTAL) {
					_sparkleSpawnLeft = Math.max(0, _sparkleSpawnLeft - dtMs);
					_sparkleSpawnAcc += dtMs;
					const spawnInterval = Math.max(10, Math.floor(SPARKLE_SPAWN_MS / Math.max(1, SPARKLE_BURST_TOTAL)));
					while (
						_sparkleSpawnAcc >= spawnInterval &&
						_sparkleSpawned < SPARKLE_BURST_TOTAL &&
						_sparkleSpawnLeft > 0
					) {
						_sparkleSpawnAcc -= spawnInterval;
						_spawnSparkle(_meetingPoint.x + _randInt(-10, 10), _meetingPoint.y + _randInt(-6, 6));
						_sparkleSpawned++;
					}
				}

				_updateSparkles(dtMs);

				// Start fade after the moment duration
				if (_fadeStart == null && now - _meetingStart >= MEET_MOMENT_MS) {
					_fadeStart = now;
				}
			}

			// Render
			// Camera shake (pixel-crisp integer translate)
			let ox = 0;
			let oy = 0;
			if (_shakeLeftMs > 0) {
				const t = _shakeLeftMs / SHAKE_DURATION_MS;
				const intensity = _shakeIntensity * t;
				ox = Math.round(_rand(-1, 1) * intensity);
				oy = Math.round(_rand(-1, 1) * intensity);
			}

			_ctx.save();
			_ctx.translate(ox, oy);

			_drawBackground();

			// Optional debug marker for meeting zone (only if debug enabled)
			if (window.DEBUG_EVENTS) {
				CanvasRenderer.setAlpha(0.2);
				CanvasRenderer.drawRect(MEETING_ZONE.x, MEETING_ZONE.y, MEETING_ZONE.w, MEETING_ZONE.h, "#000000");
				CanvasRenderer.setAlpha(1);
			}

			_drawCharacter("simone");
			_drawCharacter("giulia");

			// Sparkles in front of characters
			_renderSparkles();

			_drawIntroHint(now);

			_ctx.restore();

			// Tiny "pop" flash at the start of the moment
			if (_flashLeftMs > 0) {
				const a = (_flashLeftMs / FLASH_MS) * 0.12;
				CanvasRenderer.setAlpha(a);
				CanvasRenderer.drawRect(0, 0, _canvas.width, _canvas.height, "#ffffff");
				CanvasRenderer.setAlpha(1);
			}

			const done = _drawFade(now);
			if (done) {
				_finish();
			}
		}

		function _finish() {
			if (!_running) return;
			_running = false;
			_unbindInput();
			_clearTimeouts();
			if (_raf) cancelAnimationFrame(_raf);
			_raf = null;

			EventBus.emit(EventBus.Events.MINIGAME_END, {
				success: true,
				score: 0,
			});
		}

		function _bindInput() {
			_keyDownHandler = (e) => {
				if (_paused || !_running) return;

				// Debug skip: '*' (numpad multiply or shift+8)
				if (e.code === "NumpadMultiply" || (e.code === "Digit8" && e.shiftKey)) {
					e.preventDefault();
					_fadeStart = _nowMs() - FADE_MS; // instantly finished fade
					_frozen = true;
					return;
				}

				// Block input once meeting starts
				if (_frozen) return;

				_keys[e.code] = true;

				const now = _nowMs();

				// Immediate step / level change on press (Tetris-style mapping)
				switch (e.code) {
					// Simone horizontal (keyboard + d-pad)
					case "ArrowLeft":
						_stepChar("simone", -1, now);
						e.preventDefault();
						break;
					case "ArrowRight":
						_stepChar("simone", 1, now);
						e.preventDefault();
						break;

					// Simone vertical: shrink/grow (walk up/down in background)
					case "ArrowUp":
						_changeCharLevel("simone", +1, now);
						e.preventDefault();
						break;
					case "ArrowDown":
						_changeCharLevel("simone", -1, now);
						e.preventDefault();
						break;

					// Giulia horizontal (keyboard + face buttons)
					case "KeyA":
					case "KeyZ":
						_stepChar("giulia", -1, now);
						e.preventDefault();
						break;
					case "KeyD":
					case "KeyX":
					case "Space":
						_stepChar("giulia", 1, now);
						e.preventDefault();
						break;

					// Giulia vertical via W/S
					case "KeyW":
						_changeCharLevel("giulia", +1, now);
						e.preventDefault();
						break;
					case "KeyS":
						_changeCharLevel("giulia", -1, now);
						e.preventDefault();
						break;
				}
			};

			_keyUpHandler = (e) => {
				_keys[e.code] = false;
			};

			window.addEventListener("keydown", _keyDownHandler);
			window.addEventListener("keyup", _keyUpHandler);
		}

		function _unbindInput() {
			if (_keyDownHandler) window.removeEventListener("keydown", _keyDownHandler);
			if (_keyUpHandler) window.removeEventListener("keyup", _keyUpHandler);
			_keyDownHandler = null;
			_keyUpHandler = null;
			Object.keys(_keys).forEach((k) => {
				_keys[k] = false;
			});
		}

		const api = {
			init() {
				if (_ctx) _ctx.imageSmoothingEnabled = false;

				_assetsReady = false;

				const loads = [
					_loadImage(_imgs.bg, `${ASSET_BASE}Background.png`),
					_loadImage(_imgs.giulia_step_dx, `${ASSET_BASE}Giulia_step_dx.png`),
					_loadImage(_imgs.giulia_step_sx, `${ASSET_BASE}Giulia_step_sx.png`),
					_loadImage(_imgs.giulia_still_dx, `${ASSET_BASE}Giulia_still_dx.png`),
					_loadImage(_imgs.giulia_still_sx, `${ASSET_BASE}Giulia_still_sx.png`),
					_loadImage(_imgs.simone_step_dx, `${ASSET_BASE}Simone_step_dx.png`),
					_loadImage(_imgs.simone_step_sx, `${ASSET_BASE}Simone_step_sx.png`),
					_loadImage(_imgs.simone_still_dx, `${ASSET_BASE}Simone_still_dx.png`),
					_loadImage(_imgs.simone_still_sx, `${ASSET_BASE}Simone_still_sx.png`),
				];

				Promise.all(loads).then(() => {
					_assetsReady = true;
				});

				// Initial render
				CanvasRenderer.clear("#0a0a1a");
			},

			start() {
				if (_running) return;
				_running = true;
				_paused = false;
				_frozen = false;
				_fadeStart = null;
				_introStart = _nowMs();

				_meetingStarted = false;
				_meetingStart = 0;
				_shakeLeftMs = 0;
				_flashLeftMs = 0;
				_sparkles = [];
				_sparkleSpawnLeft = 0;
				_sparkleSpawned = 0;
				_sparkleSpawnAcc = 0;

				simone.x = SIMONE_START_X;
				simone.facing = "dx";
				simone.stepping = false;
				simone.lastStepAt = -Infinity;

				giulia.x = GIULIA_START_X;
				giulia.facing = "sx";
				giulia.stepping = false;
				giulia.lastStepAt = -Infinity;

				_bindInput();
				_lastTs = _nowMs();
				_raf = requestAnimationFrame(_loop);
			},

			pause() {
				_paused = true;
				if (typeof Input !== "undefined") Input.clearAll();
			},

			resume() {
				_paused = false;
				_lastTs = _nowMs();
			},

			stop() {
				_running = false;
				_paused = false;
				_unbindInput();
				_clearTimeouts();
				_sparkles = [];
				_meetingStarted = false;
				_shakeLeftMs = 0;
				_flashLeftMs = 0;
				if (_raf) cancelAnimationFrame(_raf);
				_raf = null;
			},

			destroy() {
				this.stop();
			},

			getState() {
				return {
					running: _running,
					paused: _paused,
					frozen: _frozen,
					assetsReady: _assetsReady,
					simone: { ...simone },
					giulia: { ...giulia },
				};
			},
		};

		return api;
	}

	GameLoader.registerGame(GAME_ID, createIntroCutscene);
})();
