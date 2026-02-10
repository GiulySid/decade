/**
 * pacman.js (BONUS level 4.5)
 * Minimal Pac-Man–inspired bonus mini-game.
 *
 * - Arrow keys / WASD: move
 * - Collect pellets to reach targetScore (config.targetScore)
 * - Avoid ghost (one simple AI)
 * - Debug skip: '*' (NumpadMultiply or Shift+8)
 * - On death: show TRY AGAIN and auto-restart after ~2500ms
 *
 * Pattern: IIFE + GameLoader.registerGame('pacman', factoryFn)
 */

(function () {
	"use strict";

	const GAME_ID = "pacman";

	function createPacman(levelConfig) {
		const cfg = (levelConfig && levelConfig.config) || {};

		const TARGET_SCORE = cfg.targetScore ?? 2500;
		const MOVE_INTERVAL_MS = Math.max(80, Math.floor(140 - (cfg.difficulty ?? 1.8) * 12)); // ~120ms default
		const GHOST_INTERVAL_MS = Math.max(90, Math.floor(170 - (cfg.difficulty ?? 1.8) * 10));

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

		// Gameplay state
		let _score = 0;
		let _attempts = 0;
		let _status = "PLAYING"; // PLAYING | DEAD | CLEAR

		// Grid / map
		const COLS = 21;
		const ROWS = 15;
		const CELL = 28;
		const GRID_W = COLS * CELL;
		const GRID_H = ROWS * CELL;
		const OFF_X = Math.floor((_canvas.width - GRID_W) / 2);
		const OFF_Y = Math.floor((_canvas.height - GRID_H) / 2) + 10;

		// Map legend: '#' wall, '.' pellet, 'c' cherry (+100), ' ' empty, '=' tunnel openings (wrap)
		const MAP = [
			"#####################",
			"#.........#.........#",
			"#.###.###.#.###.###.#",
			"#.#...#.c. ...#...#.#",
			"#.###.#.#######.#.###",
			"#.....#....#....#...#",
			"#####.###  #  ###.###",
			" ......c........ ... ", // Tunnel row: wrap left<->right (space at 0 and 20)
			"###.###  #  ###.#####",
			"#...#....#....#.c...#",
			"###.#.#######.#.###.#",
			"#.#...#... ...#...#.#",
			"#.###.###c#.###.###.#",
			"#.........#.........#",
			"#####################",
		].map((row) => row.padEnd(COLS, " ").slice(0, COLS));

		let _walls = null; // boolean[ROWS][COLS]
		let _pellets = null; // boolean[ROWS][COLS]
		let _pelletCount = 0;
		let _cherries = null; // { x, y }[] - active cherry positions
		const _heartAnimations = []; // { x, y, startTime } - floating hearts

		const player = {
			x: 1,
			y: 1,
			dir: { x: 1, y: 0 },
			nextDir: { x: 1, y: 0 },
			moveAcc: 0,
		};

		const ghost = {
			x: COLS - 2,
			y: ROWS - 2,
			dir: { x: -1, y: 0 },
			moveAcc: 0,
		};

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

		const TUNNEL_ROW = 7; // Row where wrap-left/right works (Pac-Man tunnel)

		function _isWall(x, y) {
			if (y < 0 || y >= ROWS) return true;
			if (x < 0 || x >= COLS) return true;
			return !!_walls[y][x];
		}

		function _resetMap() {
			_walls = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false));
			_pellets = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false));
			_pelletCount = 0;

			_cherries = [];

			for (let y = 0; y < ROWS; y++) {
				for (let x = 0; x < COLS; x++) {
					const c = MAP[y][x];
					if (c === "#") {
						_walls[y][x] = true;
					} else if (c === "c") {
						_cherries.push({ x, y });
						// Cherry tiles: no pellets (cherry gives +100)
					} else if (c === ".") {
						_pellets[y][x] = true;
						_pelletCount++;
					} else {
						// Also sprinkle pellets in empty lanes for a fuller board
						if (c === " " && !(x === 1 && y === 1) && !(x === COLS - 2 && y === ROWS - 2)) {
							if ((x + y) % 3 !== 0) {
								_pellets[y][x] = true;
								_pelletCount++;
							}
						}
					}
				}
			}

			// Ensure spawn tiles are walkable and pellet-free
			_pellets[player.y][player.x] = false;
			_pellets[ghost.y][ghost.x] = false;
		}

		function _resetRound() {
			_score = 0;
			_attempts = 0;
			_status = "PLAYING";
			_heartAnimations.length = 0;

			player.x = 1;
			player.y = 1;
			player.dir = { x: 1, y: 0 };
			player.nextDir = { x: 1, y: 0 };
			player.moveAcc = 0;

			ghost.x = COLS - 2;
			ghost.y = ROWS - 2;
			ghost.dir = { x: -1, y: 0 };
			ghost.moveAcc = 0;

			_resetMap();
			_syncHud();
		}

		function _syncHud() {
			if (typeof StateManager === "undefined") return;
			StateManager.updateLevelData({
				score: _score,
				attempts: _attempts,
				status: _status,
				targetScore: TARGET_SCORE,
			});
		}

		function _grantPoints(points) {
			_score += points;
			if (typeof StateManager !== "undefined" && StateManager.addScore) {
				StateManager.addScore(points);
			}
			_syncHud();
		}

		function _dirFromKeys() {
			const left = _keys.ArrowLeft || _keys.KeyA;
			const right = _keys.ArrowRight || _keys.KeyD;
			const up = _keys.ArrowUp || _keys.KeyW;
			const down = _keys.ArrowDown || _keys.KeyS;

			if (left) return { x: -1, y: 0 };
			if (right) return { x: 1, y: 0 };
			if (up) return { x: 0, y: -1 };
			if (down) return { x: 0, y: 1 };
			return null;
		}

		function _trySetNextDir(d) {
			if (!d) return;
			player.nextDir = d;
		}

		function _moveEntity(ent, dir) {
			let nx = ent.x + dir.x;
			const ny = ent.y + dir.y;

			// Pac-Man tunnel wrap (player only, on tunnel row)
			if (ent === player && ny === TUNNEL_ROW && dir.x !== 0) {
				if (nx >= COLS) nx = 0;
				else if (nx < 0) nx = COLS - 1;
			}

			if (_isWall(nx, ny)) return false;
			ent.x = nx;
			ent.y = ny;
			ent.dir = { x: dir.x, y: dir.y };
			return true;
		}

		function _playerStep() {
			// Prefer turning if possible
			if (!_isWall(player.x + player.nextDir.x, player.y + player.nextDir.y)) {
				_moveEntity(player, player.nextDir);
			} else {
				_moveEntity(player, player.dir);
			}

			// Pellet pickup
			if (_pellets[player.y][player.x]) {
				_pellets[player.y][player.x] = false;
				_pelletCount--;
				_grantPoints(10);
			}

			// Cherry pickup (+100, heart animation)
			const cherryIdx = _cherries.findIndex((c) => c.x === player.x && c.y === player.y);
			if (cherryIdx >= 0) {
				_cherries.splice(cherryIdx, 1);
				_grantPoints(100);
				_heartAnimations.push({
					x: OFF_X + player.x * CELL + CELL / 2,
					y: OFF_Y + player.y * CELL + CELL / 2,
					startTime: _now(),
				});
			}
		}

		function _ghostChooseDir() {
			// Candidate dirs (no reverse unless forced)
			const dirs = [
				{ x: 1, y: 0 },
				{ x: -1, y: 0 },
				{ x: 0, y: 1 },
				{ x: 0, y: -1 },
			];

			const reverse = { x: -ghost.dir.x, y: -ghost.dir.y };

			const candidates = dirs.filter((d) => {
				if (d.x === reverse.x && d.y === reverse.y) return false;
				return !_isWall(ghost.x + d.x, ghost.y + d.y);
			});

			// If dead-end, allow reverse
			const usable = candidates.length ? candidates : dirs.filter((d) => !_isWall(ghost.x + d.x, ghost.y + d.y));
			if (!usable.length) return ghost.dir;

			// Small "chase" bias: pick direction that reduces manhattan distance with probability
			const chaseBias = 0.6;
			if (Math.random() < chaseBias) {
				let best = usable[0];
				let bestDist = Infinity;
				for (const d of usable) {
					const dx = ghost.x + d.x - player.x;
					const dy = ghost.y + d.y - player.y;
					const dist = Math.abs(dx) + Math.abs(dy);
					if (dist < bestDist) {
						bestDist = dist;
						best = d;
					}
				}
				return best;
			}

			// Otherwise random
			return usable[Math.floor(Math.random() * usable.length)];
		}

		function _ghostStep() {
			const d = _ghostChooseDir();
			_moveEntity(ghost, d);
		}

		function _checkCollisions() {
			if (player.x === ghost.x && player.y === ghost.y) {
				_die();
				return;
			}

			if (_score >= TARGET_SCORE || _pelletCount <= 0) {
				_win();
			}
		}

		function _die() {
			if (_status !== "PLAYING") return;
			_status = "DEAD";
			_attempts++;
			_syncHud();

			_setTimeout(() => {
				if (!_running) return;
				_status = "PLAYING";
				player.x = 1;
				player.y = 1;
				player.dir = { x: 1, y: 0 };
				player.nextDir = { x: 1, y: 0 };
				player.moveAcc = 0;

				ghost.x = COLS - 2;
				ghost.y = ROWS - 2;
				ghost.dir = { x: -1, y: 0 };
				ghost.moveAcc = 0;

				_syncHud();
			}, 2500);
		}

		function _win() {
			if (_status !== "PLAYING") return;
			_status = "CLEAR";
			_syncHud();

			// Slight delay for "CLEAR!" feel
			_setTimeout(() => {
				if (!_running) return;
				EventBus.emit(EventBus.Events.MINIGAME_END, {
					success: true,
					score: _score,
				});
			}, 900);
		}

		function _drawBoard() {
			// Backdrop
			CanvasRenderer.clear("#05050a");

			// Frame
			CanvasRenderer.drawRect(OFF_X - 8, OFF_Y - 8, GRID_W + 16, GRID_H + 16, "#0f1a33");
			CanvasRenderer.drawRect(OFF_X - 6, OFF_Y - 6, GRID_W + 12, GRID_H + 12, "#070b18");

			// Walls + pellets
			for (let y = 0; y < ROWS; y++) {
				for (let x = 0; x < COLS; x++) {
					const px = OFF_X + x * CELL;
					const py = OFF_Y + y * CELL;

					if (_walls[y][x]) {
						CanvasRenderer.drawRect(px, py, CELL, CELL, "#1d4bd6");
						CanvasRenderer.setAlpha(0.18);
						CanvasRenderer.drawRect(px + 2, py + 2, CELL - 4, CELL - 4, "#6aa2ff");
						CanvasRenderer.setAlpha(1);
					} else if (_pellets[y][x]) {
						const cx = px + CELL / 2;
						const cy = py + CELL / 2;
						CanvasRenderer.drawRect(Math.floor(cx - 2), Math.floor(cy - 2), 4, 4, "#ffd166");
					}
				}
			}
		}

		function _drawPacman(cx, cy, dir) {
			const r = 10;
			const mouthAngle = Math.PI / 3; // 60 degrees
			let startAng, endAng, anticlockwise;
			if (dir.x === 1 && dir.y === 0) {
				// Right: mouth on right; body = long arc. Clockwise from 30° to -30° traces the body
				startAng = mouthAngle / 2;
				endAng = -mouthAngle / 2;
				anticlockwise = false;
			} else if (dir.x === -1 && dir.y === 0) {
				startAng = Math.PI - mouthAngle / 2;
				endAng = Math.PI + mouthAngle / 2;
				anticlockwise = true;
			} else if (dir.x === 0 && dir.y === -1) {
				startAng = -Math.PI / 2 - mouthAngle / 2;
				endAng = -Math.PI / 2 + mouthAngle / 2;
				anticlockwise = true;
			} else {
				startAng = Math.PI / 2 - mouthAngle / 2;
				endAng = Math.PI / 2 + mouthAngle / 2;
				anticlockwise = true;
			}
			_ctx.fillStyle = "#ffcc00";
			_ctx.beginPath();
			_ctx.moveTo(cx, cy);
			_ctx.lineTo(cx + r * Math.cos(startAng), cy + r * Math.sin(startAng));
			_ctx.arc(cx, cy, r, startAng, endAng, anticlockwise);
			_ctx.closePath();
			_ctx.fill();
			// Inner highlight for depth
			CanvasRenderer.setAlpha(0.15);
			_ctx.fillStyle = "#fff6b0";
			_ctx.fill();
			CanvasRenderer.setAlpha(1);
		}

		function _drawCherry(gx, gy) {
			const cx = gx * CELL + OFF_X + CELL / 2;
			const cy = gy * CELL + OFF_Y + CELL / 2;
			// Two cherries + stem
			CanvasRenderer.drawCircle(cx - 4, cy + 2, 5, "#dc2626");
			CanvasRenderer.drawCircle(cx + 4, cy + 2, 5, "#dc2626");
			CanvasRenderer.setAlpha(0.85);
			CanvasRenderer.drawCircle(cx - 4, cy + 2, 3, "#ef4444");
			CanvasRenderer.drawCircle(cx + 4, cy + 2, 3, "#ef4444");
			CanvasRenderer.setAlpha(1);
			_ctx.strokeStyle = "#166534";
			_ctx.lineWidth = 2;
			_ctx.beginPath();
			_ctx.moveTo(cx - 3, cy - 4);
			_ctx.quadraticCurveTo(cx, cy - 12, cx + 3, cy - 4);
			_ctx.stroke();
		}

		function _drawHeart(x, y, progress) {
			const s = 18 * (1 - progress * 0.3);
			const rise = -progress * 50;
			const alpha = 1 - progress;
			if (alpha <= 0) return;
			const hx = x;
			const hy = y + rise;
			// Heart
			CanvasRenderer.setAlpha(alpha);
			_ctx.fillStyle = "#e63946";
			_ctx.beginPath();
			_ctx.moveTo(hx, hy + s * 0.4);
			_ctx.bezierCurveTo(hx - s, hy + s * 0.2, hx - s * 1.1, hy - s * 0.6, hx, hy - s * 0.2);
			_ctx.bezierCurveTo(hx + s * 1.1, hy - s * 0.6, hx + s, hy + s * 0.2, hx, hy + s * 0.4);
			_ctx.fill();
			// Sparkles around the heart
			const sparkleAlpha = alpha * (1 - progress * 0.5);
			CanvasRenderer.setAlpha(sparkleAlpha);
			_ctx.fillStyle = "#ffb3ba";
			const sparkleOffsets = [
				{ dx: -s * 1.4, dy: -s * 0.3 },
				{ dx: s * 1.4, dy: -s * 0.3 },
				{ dx: -s * 1.1, dy: s * 0.8 },
				{ dx: s * 1.1, dy: s * 0.8 },
				{ dx: 0, dy: -s * 1.2 },
				{ dx: -s * 1.6, dy: s * 0.2 },
				{ dx: s * 1.6, dy: s * 0.2 },
			];
			const sparkleScale = 1 + progress * 0.5;
			sparkleOffsets.forEach(({ dx, dy }, i) => {
				const sz = (3 + (i % 3)) * sparkleScale * (1 - progress * 0.6);
				const px = hx + dx;
				const py = hy + dy;
				CanvasRenderer.drawRect(Math.floor(px - sz / 2), Math.floor(py - sz / 2), sz, sz, "#ffb3ba");
			});
			CanvasRenderer.setAlpha(1);
		}

		function _drawGhost(cx, cy, dir) {
			const r = 10;
			const waveH = 5;
			const baseY = cy + 8;

			// Body: round dome top + wavy bottom (3 semicircular dips)
			_ctx.fillStyle = "#ff4da6";
			_ctx.beginPath();
			_ctx.arc(cx, cy - 2, r, Math.PI, 0); // Top semicircle
			_ctx.lineTo(cx - r, cy + 2);
			// Wave 1: left dip
			_ctx.quadraticCurveTo(cx - r - 2, baseY, cx - r + 7, baseY);
			// Wave 2: middle dip
			_ctx.quadraticCurveTo(cx, baseY - waveH, cx + 7, baseY);
			// Wave 3: right dip
			_ctx.quadraticCurveTo(cx + r + 2, baseY, cx + r, cy + 2);
			_ctx.closePath();
			_ctx.fill();

			// White eyes
			const eyeOffX = dir.x !== 0 ? dir.x * 3 : 0;
			const eyeOffY = dir.y !== 0 ? dir.y * 2 : 0;
			CanvasRenderer.drawCircle(cx - 4, cy - 4, 5, "#ffffff");
			CanvasRenderer.drawCircle(cx + 4, cy - 4, 5, "#ffffff");
			// Pupils (black, looking in movement direction)
			CanvasRenderer.drawCircle(cx - 4 + eyeOffX, cy - 4 + eyeOffY, 2, "#1a1a2e");
			CanvasRenderer.drawCircle(cx + 4 + eyeOffX, cy - 4 + eyeOffY, 2, "#1a1a2e");
		}

		function _drawEntities() {
			const px = OFF_X + player.x * CELL + CELL / 2;
			const py = OFF_Y + player.y * CELL + CELL / 2;
			_drawPacman(px, py, player.dir);

			// Cherries
			if (_cherries) {
				_cherries.forEach((c) => _drawCherry(c.x, c.y));
			}

			// Heart animations (float up, fade out)
			const now = _now();
			const heartDuration = 800;
			for (let i = _heartAnimations.length - 1; i >= 0; i--) {
				const h = _heartAnimations[i];
				const elapsed = now - h.startTime;
				if (elapsed >= heartDuration) {
					_heartAnimations.splice(i, 1);
					continue;
				}
				_drawHeart(h.x, h.y, elapsed / heartDuration);
			}

			// Ghost (classic shape: round top, wavy bottom, white eyes)
			const gx = OFF_X + ghost.x * CELL + CELL / 2;
			const gy = OFF_Y + ghost.y * CELL + CELL / 2;
			_drawGhost(gx, gy, ghost.dir);
		}

		function _drawUI() {
			// Letterbox bars for arcade vibe
			CanvasRenderer.drawRect(0, 0, _canvas.width, 26, "#000000");
			CanvasRenderer.drawRect(0, _canvas.height - 26, _canvas.width, 26, "#000000");

			const txt = `BONUS • TARGET ${String(TARGET_SCORE).padStart(4, "0")}`;
			CanvasRenderer.drawText(txt, 12, 18, { align: "left", size: 10, color: "#ffffff" });
			CanvasRenderer.drawText(`SCORE ${String(_score).padStart(4, "0")}`, _canvas.width - 12, 18, {
				align: "right",
				size: 10,
				color: "#ffffff",
			});

			if (_status === "DEAD") {
				CanvasRenderer.drawText("TRY AGAIN", _canvas.width / 2, _canvas.height / 2, {
					align: "center",
					size: 18,
					color: "#ff4d4d",
				});
			} else if (_status === "CLEAR") {
				CanvasRenderer.drawText("CLEAR!", _canvas.width / 2, _canvas.height / 2, {
					align: "center",
					size: 20,
					color: "#a8ff7a",
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

			if (_status === "PLAYING") {
				const nd = _dirFromKeys();
				if (nd) _trySetNextDir(nd);

				player.moveAcc += dtMs;
				ghost.moveAcc += dtMs;

				while (player.moveAcc >= MOVE_INTERVAL_MS) {
					player.moveAcc -= MOVE_INTERVAL_MS;
					_playerStep();
					_checkCollisions();
					if (_status !== "PLAYING") break;
				}

				while (_status === "PLAYING" && ghost.moveAcc >= GHOST_INTERVAL_MS) {
					ghost.moveAcc -= GHOST_INTERVAL_MS;
					_ghostStep();
					_checkCollisions();
					if (_status !== "PLAYING") break;
				}
			}

			_drawBoard();
			_drawEntities();
			_drawUI();
		}

		function _bindInput() {
			_keyDownHandler = (e) => {
				if (!_running || _paused) return;

				// Debug skip: '*' (numpad multiply or shift+8)
				if (e.code === "NumpadMultiply" || (e.code === "Digit8" && e.shiftKey)) {
					e.preventDefault();
					_score = Math.max(_score, TARGET_SCORE);
					_win();
					return;
				}

				_keys[e.code] = true;

				if (
					["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyW", "KeyA", "KeyS", "KeyD", "Space"].includes(
						e.code
					)
				) {
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
				_resetRound();
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
					score: _score,
					attempts: _attempts,
					status: _status,
					targetScore: TARGET_SCORE,
				};
			},
		};

		return api;
	}

	GameLoader.registerGame(GAME_ID, createPacman);
})();
