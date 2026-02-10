/**
 * space-invaders.js (BONUS level 7.5)
 * Minimal Space Invaders–inspired bonus mini-game.
 *
 * Controls:
 * - Left/Right or A/D: move
 * - Space: shoot
 *
 * Rules:
 * - Invaders march left/right, drop down on edge
 * - Invaders shoot occasionally
 * - Player has limited lives (config.lives)
 * - Win by clearing all invaders for N waves (config.wavesToWin)
 * - On lose: show GAME OVER, wait ~2500ms, restart
 * - Debug skip: '*' (NumpadMultiply or Shift+8) => instant win
 */

(function () {
	"use strict";

	const GAME_ID = "space-invaders";

	function createSpaceInvaders(levelConfig) {
		const cfg = (levelConfig && levelConfig.config) || {};

		const DIFFICULTY = cfg.difficulty ?? 2.0;
		const WAVES_TO_WIN = cfg.wavesToWin ?? 2;
		const START_LIVES = cfg.lives ?? 3;

		const _ctx = CanvasRenderer.getContext();
		const _canvas = CanvasRenderer.getCanvas();

		let _running = false;
		let _paused = false;
		let _raf = null;
		let _lastTs = 0;

		const _keys = {};
		let _keyDownHandler = null;
		let _keyUpHandler = null;

		const _timeouts = new Set();

		const _enemyDeathAnims = [];
		const _playerHitAnims = [];

		// Game state
		let _status = "PLAYING"; // PLAYING | CLEAR | GAME_OVER | BETWEEN_WAVES
		let _score = 0;
		let _wave = 1;
		let _lives = START_LIVES;

		// World layout
		const PAD = 24;
		const TOP_UI = 44;
		const BOTTOM_UI = 34;
		const PLAY_W = _canvas.width - PAD * 2;
		const PLAY_H = _canvas.height - TOP_UI - BOTTOM_UI;
		const PLAY_X = PAD;
		const PLAY_Y = TOP_UI;

		// Player
		const player = {
			x: PLAY_X + PLAY_W / 2,
			y: PLAY_Y + PLAY_H - 24,
			w: 34,
			h: 16,
			speed: 320, // px/s
			cooldownMs: 0,
		};

		// Bullets
		const bullets = []; // player bullets
		const enemyBullets = []; // invader bullets

		// Invaders
		let invaders = [];
		let invDir = 1; // 1 right, -1 left
		let invSpeed = 42; // px/s baseline (scaled by difficulty / remaining)
		let invStepDown = 18;
		let invMoveAcc = 0;

		// Timing / randomness
		let enemyShootAcc = 0;
		const ENEMY_SHOOT_BASE_MS = Math.max(250, Math.floor(900 - DIFFICULTY * 140));

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

		function _now() {
			return performance.now();
		}

		function _rectsOverlap(a, b) {
			return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
		}

		function _syncHud() {
			if (typeof StateManager === "undefined") return;
			StateManager.updateLevelData({
				score: _score,
				lives: _lives,
				wave: _wave,
				status: _status,
				wavesToWin: WAVES_TO_WIN,
			});
		}

		function _addScore(points) {
			_score += points;
			if (typeof StateManager !== "undefined" && StateManager.addScore) {
				StateManager.addScore(points);
			}
			_syncHud();
		}

		function _spawnWave() {
			invaders = [];
			invDir = 1;
			invMoveAcc = 0;

			// Grid (bigger white enemies)
			const rows = 4;
			const cols = 7;
			const iw = 36;
			const ih = 28;
			const gapX = 10;
			const gapY = 10;

			const totalW = cols * iw + (cols - 1) * gapX;
			const startX = PLAY_X + (PLAY_W - totalW) / 2;
			const startY = PLAY_Y + 22;

			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					const hp = r === 0 ? 3 : r === 3 ? 1 : 2;
					invaders.push({
						x: startX + c * (iw + gapX),
						y: startY + r * (ih + gapY),
						w: iw,
						h: ih,
						row: r,
						hp,
					});
				}
			}

			// Reset bullets
			bullets.length = 0;
			enemyBullets.length = 0;

			// Base speed (difficulty + wave)
			invSpeed = 40 + DIFFICULTY * 10 + (_wave - 1) * 8;
		}

		function _resetMatch() {
			_status = "PLAYING";
			_score = 0;
			_wave = 1;
			_lives = START_LIVES;

			player.x = PLAY_X + PLAY_W / 2;
			player.cooldownMs = 0;

			_enemyDeathAnims.length = 0;
			_playerHitAnims.length = 0;

			_spawnWave();
			_syncHud();
		}

		function _shoot() {
			if (player.cooldownMs > 0) return;
			// Keep at most 2 bullets on screen (classic feel)
			const active = bullets.filter((b) => b.active).length;
			if (active >= 2) return;

			bullets.push({
				x: player.x,
				y: player.y - player.h / 2,
				w: 3,
				h: 10,
				vy: -520, // px/s
				active: true,
			});

			player.cooldownMs = 180;
		}

		function _enemyShoot() {
			if (!invaders.length) return;
			// Pick a random invader (bias to lower rows)
			const sorted = invaders.slice().sort((a, b) => b.y - a.y);
			const pickPool = sorted.slice(0, Math.min(12, sorted.length));
			const shooter = pickPool[Math.floor(Math.random() * pickPool.length)];

			enemyBullets.push({
				x: shooter.x + shooter.w / 2,
				y: shooter.y + shooter.h,
				w: 3,
				h: 10,
				vy: 320 + DIFFICULTY * 40,
				active: true,
			});
		}

		function _update(dtMs) {
			if (_status !== "PLAYING") return;

			const dt = dtMs / 1000;

			// Player movement
			const left = _keys.ArrowLeft || _keys.KeyA;
			const right = _keys.ArrowRight || _keys.KeyD;
			let dx = 0;
			if (left && !right) dx = -1;
			if (right && !left) dx = 1;
			player.x += dx * player.speed * dt;
			player.x = _clamp(player.x, PLAY_X + player.w / 2, PLAY_X + PLAY_W - player.w / 2);

			// Shooting
			if (_keys.Space) _shoot();
			player.cooldownMs = Math.max(0, player.cooldownMs - dtMs);

			// Invader marching (speed increases as fewer remain)
			const remainRatio = invaders.length / Math.max(1, 4 * 7);
			const speedScale = 1 + (1 - remainRatio) * (1.8 + DIFFICULTY * 0.25);
			const vx = invDir * invSpeed * speedScale;

			let minX = Infinity,
				maxX = -Infinity;
			for (const inv of invaders) {
				inv.x += vx * dt;
				minX = Math.min(minX, inv.x);
				maxX = Math.max(maxX, inv.x + inv.w);
			}

			const hitLeft = minX <= PLAY_X + 2;
			const hitRight = maxX >= PLAY_X + PLAY_W - 2;
			if (hitLeft || hitRight) {
				// Undo a bit and step down, reverse dir
				for (const inv of invaders) {
					inv.x -= vx * dt;
					inv.y += invStepDown;
				}
				invDir *= -1;
			}

			// Enemy bullets timing
			enemyShootAcc += dtMs;
			const shootEvery = ENEMY_SHOOT_BASE_MS * _clamp(1 / (0.4 + speedScale * 0.35), 0.35, 1.2);
			while (enemyShootAcc >= shootEvery) {
				enemyShootAcc -= shootEvery;
				if (Math.random() < 0.55) _enemyShoot();
			}

			// Update bullets
			for (const b of bullets) {
				if (!b.active) continue;
				b.y += b.vy * dt;
				if (b.y + b.h < PLAY_Y) b.active = false;
			}
			for (const b of enemyBullets) {
				if (!b.active) continue;
				b.y += b.vy * dt;
				if (b.y > PLAY_Y + PLAY_H + 20) b.active = false;
			}

			// Collisions: player bullets vs invaders
			for (const b of bullets) {
				if (!b.active) continue;
				const br = { x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h };
				for (let i = invaders.length - 1; i >= 0; i--) {
					const inv = invaders[i];
					const ir = { x: inv.x, y: inv.y, w: inv.w, h: inv.h };
					if (_rectsOverlap(br, ir)) {
						b.active = false;
						inv.hp = Math.max(0, (inv.hp || 1) - 1);
						if (inv.hp <= 0) {
							_enemyDeathAnims.push({ x: inv.x + inv.w / 2, y: inv.y + inv.h / 2, start: _now() });
							invaders.splice(i, 1);
							_addScore(50 + (3 - inv.row) * 10);
						}
						break;
					}
				}
			}

			// Collisions: enemy bullets vs player
			const pr = { x: player.x - player.w / 2, y: player.y - player.h / 2, w: player.w, h: player.h };
			for (const b of enemyBullets) {
				if (!b.active) continue;
				const br = { x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h };
				if (_rectsOverlap(br, pr)) {
					b.active = false;
					_playerHitAnims.push({ x: player.x, y: player.y, start: _now() });
					_loseLife();
					break;
				}
			}

			// Lose if invaders reach player line
			const dangerY = player.y - 24;
			for (const inv of invaders) {
				if (inv.y + inv.h >= dangerY) {
					_gameOver();
					break;
				}
			}

			// Win wave
			if (_status === "PLAYING" && invaders.length === 0) {
				if (_wave >= WAVES_TO_WIN) {
					_win();
				} else {
					_betweenWaves();
				}
			}
		}

		function _betweenWaves() {
			if (_status !== "PLAYING") return;
			_status = "BETWEEN_WAVES";
			_syncHud();
			_setTimeout(() => {
				if (!_running) return;
				_wave++;
				_status = "PLAYING";
				_spawnWave();
				_syncHud();
			}, 900);
		}

		function _loseLife() {
			if (_status !== "PLAYING") return;
			_lives--;
			_syncHud();
			if (_lives <= 0) {
				_gameOver();
				return;
			}

			// Brief invulnerability by clearing bullets
			bullets.length = 0;
			enemyBullets.length = 0;
			player.x = PLAY_X + PLAY_W / 2;
			player.cooldownMs = 260;
		}

		function _gameOver() {
			if (_status !== "PLAYING") return;
			_status = "GAME_OVER";
			_syncHud();
			_setTimeout(() => {
				if (!_running) return;
				_resetMatch();
			}, 2500);
		}

		function _win() {
			if (_status !== "PLAYING") return;
			_status = "CLEAR";
			_syncHud();
			_setTimeout(() => {
				if (!_running) return;
				EventBus.emit(EventBus.Events.MINIGAME_END, {
					success: true,
					score: _score,
					wave: _wave,
					livesLeft: _lives,
				});
			}, 900);
		}

		function _draw() {
			// Background + subtle vignette
			CanvasRenderer.clear("#050612");
			CanvasRenderer.setAlpha(0.25);
			CanvasRenderer.drawRect(0, 0, _canvas.width, TOP_UI, "#000000");
			CanvasRenderer.drawRect(0, _canvas.height - BOTTOM_UI, _canvas.width, BOTTOM_UI, "#000000");
			CanvasRenderer.setAlpha(1);

			// Playfield frame
			CanvasRenderer.drawRect(PLAY_X - 6, PLAY_Y - 6, PLAY_W + 12, PLAY_H + 12, "#0a1536");
			CanvasRenderer.drawRect(PLAY_X - 4, PLAY_Y - 4, PLAY_W + 8, PLAY_H + 8, "#000000");

			// Invaders (classic Space Invaders pixel shapes, white)
			const SQUID = [
				// row 0
				[0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0],
				[0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
				[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
				[1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
				[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
				[0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
				[0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
				[1, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1],
			];
			const CRAB = [
				// rows 1, 2
				[0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
				[0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
				[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
				[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
				[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
				[0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0],
				[1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1],
				[0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0],
			];
			const OCTOPUS = [
				// row 3
				[0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
				[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
				[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
				[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
				[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
				[0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0],
				[0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
			];
			const getShape = (row) => (row === 0 ? SQUID : row === 3 ? OCTOPUS : CRAB);
			for (const inv of invaders) {
				const shape = getShape(inv.row);
				const pw = inv.w / 11;
				const ph = inv.h / shape.length;
				const ix = Math.floor(inv.x);
				const iy = Math.floor(inv.y);
				// Distinct row colors per wave
				const wave1Palette = ["#5e6656", "#7b8573", "#a2ad9c", "#d5dfd1"]; // dark → mid → base → very light
				const wave2Palette = ["#5f5069", "#7a6685", "#a79cad", "#d5c9dc"]; // dark → mid → base → very light
				const palette = _wave === 1 ? wave1Palette : _wave === 2 ? wave2Palette : wave2Palette;
				_ctx.fillStyle = palette[inv.row] || "#ffffff";
				for (let sy = 0; sy < shape.length; sy++) {
					for (let sx = 0; sx < 11; sx++) {
						if (shape[sy][sx]) {
							_ctx.fillRect(ix + sx * pw, iy + sy * ph, Math.ceil(pw) + 1, Math.ceil(ph) + 1);
						}
					}
				}
			}

			// Enemy death animation (player hit enemy)
			const now = _now();
			for (let i = _enemyDeathAnims.length - 1; i >= 0; i--) {
				const a = _enemyDeathAnims[i];
				const t = (now - a.start) / 400;
				if (t >= 1) {
					_enemyDeathAnims.splice(i, 1);
					continue;
				}
				const alpha = 1 - t;
				const radius = 4 + t * 14;
				_ctx.save();
				_ctx.globalAlpha = alpha;
				_ctx.fillStyle = "#ffcc00";
				_ctx.beginPath();
				_ctx.arc(a.x, a.y, radius, 0, Math.PI * 2);
				_ctx.fill();
				_ctx.globalAlpha = alpha * 0.7;
				_ctx.fillStyle = "#ffffff";
				_ctx.beginPath();
				_ctx.arc(a.x, a.y, radius * 0.55, 0, Math.PI * 2);
				_ctx.fill();
				_ctx.restore();
			}

			// Player hit animation (enemy hit player)
			for (let i = _playerHitAnims.length - 1; i >= 0; i--) {
				const a = _playerHitAnims[i];
				const t = (now - a.start) / 500;
				if (t >= 1) {
					_playerHitAnims.splice(i, 1);
					continue;
				}
				const alpha = 1 - t;
				const radius = 14 + t * 22;
				_ctx.save();
				_ctx.globalAlpha = alpha;
				_ctx.strokeStyle = "#ff4444";
				_ctx.lineWidth = 4;
				_ctx.beginPath();
				_ctx.arc(a.x, a.y, radius, 0, Math.PI * 2);
				_ctx.stroke();
				_ctx.globalAlpha = alpha * 0.5;
				_ctx.fillStyle = "#ff6666";
				_ctx.beginPath();
				_ctx.arc(a.x, a.y, radius * 0.7, 0, Math.PI * 2);
				_ctx.fill();
				_ctx.restore();
			}

			// Player ship
			const px = Math.floor(player.x - player.w / 2);
			const py = Math.floor(player.y - player.h / 2);
			CanvasRenderer.drawRect(px, py, player.w, player.h, "#ffffff");
			CanvasRenderer.drawRect(px + 10, py - 6, 14, 6, "#ffffff"); // turret
			CanvasRenderer.setAlpha(0.18);
			CanvasRenderer.drawRect(px + 2, py + 2, player.w - 4, player.h - 4, "#9ad7ff");
			CanvasRenderer.setAlpha(1);

			// Bullets
			for (const b of bullets) {
				if (!b.active) continue;
				CanvasRenderer.drawRect(Math.floor(b.x - b.w / 2), Math.floor(b.y - b.h), b.w, b.h, "#ffe66d");
			}
			for (const b of enemyBullets) {
				if (!b.active) continue;
				CanvasRenderer.drawRect(Math.floor(b.x - b.w / 2), Math.floor(b.y - b.h), b.w, b.h, "#ff4d6d");
			}

			// UI text
			CanvasRenderer.drawText(`BONUS`, 12, 18, { align: "left", size: 10, color: "#ffffff" });
			CanvasRenderer.drawText(`WAVE ${_wave}/${WAVES_TO_WIN}`, 12, 34, {
				align: "left",
				size: 10,
				color: "#dddddd",
			});
			CanvasRenderer.drawText(`LIVES ${_lives}`, _canvas.width - 12, 18, {
				align: "right",
				size: 10,
				color: "#ffffff",
			});
			CanvasRenderer.drawText(`SCORE ${String(_score).padStart(4, "0")}`, _canvas.width - 12, 34, {
				align: "right",
				size: 10,
				color: "#dddddd",
			});

			// Controls hint
			CanvasRenderer.drawText(`ARROWS/A-D`, _canvas.width - 12, _canvas.height - 18, {
				align: "right",
				size: 8,
				color: "#cccccc",
			});
			CanvasRenderer.drawText(`SPACE: FIRE`, _canvas.width - 12, _canvas.height - 6, {
				align: "right",
				size: 8,
				color: "#cccccc",
			});

			if (_status === "BETWEEN_WAVES") {
				CanvasRenderer.drawText("READY...", _canvas.width / 2, _canvas.height / 2, {
					align: "center",
					size: 18,
					color: "#ffffff",
				});
			} else if (_status === "CLEAR") {
				CanvasRenderer.drawText("CLEAR!", _canvas.width / 2, _canvas.height / 2, {
					align: "center",
					size: 20,
					color: "#a8ff7a",
				});
			} else if (_status === "GAME_OVER") {
				CanvasRenderer.drawText("GAME OVER", _canvas.width / 2, _canvas.height / 2, {
					align: "center",
					size: 20,
					color: "#ff4d4d",
				});
			}
		}

		function _loop(ts) {
			if (!_running) return;
			_raf = requestAnimationFrame(_loop);
			if (_paused) return;

			const now = ts || _now();
			const dtMs = Math.min(50, Math.max(0, now - (_lastTs || now)));
			_lastTs = now;

			_update(dtMs);
			_draw();
		}

		function _bindInput() {
			_keyDownHandler = (e) => {
				if (!_running || _paused) return;

				// Debug skip: '*' (numpad multiply or shift+8)
				if (e.code === "NumpadMultiply" || (e.code === "Digit8" && e.shiftKey)) {
					e.preventDefault();
					// Force win immediately
					_wave = WAVES_TO_WIN;
					_win();
					return;
				}

				_keys[e.code] = true;
				if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "Space"].includes(e.code)) {
					e.preventDefault();
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
				_resetMatch();
			},

			start() {
				if (_running) return;
				_running = true;
				_paused = false;
				_lastTs = _now();
				_bindInput();
				_raf = requestAnimationFrame(_loop);
			},

			pause() {
				_paused = true;
				if (typeof Input !== "undefined") Input.clearAll();
			},

			resume() {
				_paused = false;
				_lastTs = _now();
			},

			stop() {
				_running = false;
				_paused = false;
				_unbindInput();
				_clearTimeouts();
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
					status: _status,
					score: _score,
					wave: _wave,
					lives: _lives,
				};
			},
		};

		return api;
	}

	GameLoader.registerGame(GAME_ID, createSpaceInvaders);
})();
