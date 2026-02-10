/**
 * super-monkey-ball.js
 * Level 10 — PS2-era Super Monkey Ball–inspired 3D tilt game
 * Roll the ball to the goal; avoid falling off.
 * Uses Three.js (CDN), custom physics, no external engine.
 */

(function () {
	"use strict";

	function loadThreeJS() {
		if (window.THREE) return Promise.resolve();
		const existing = document.querySelector('script[src*="three"]');
		if (existing) {
			return new Promise((resolve, reject) => {
				let n = 0;
				const t = setInterval(() => {
					if (window.THREE) {
						clearInterval(t);
						resolve();
						return;
					}
					if (++n >= 200) {
						clearInterval(t);
						reject(new Error("Timeout waiting for Three.js"));
					}
				}, 50);
			});
		}
		return new Promise((resolve, reject) => {
			const s = document.createElement("script");
			s.src = "https://unpkg.com/three@0.160.0/build/three.min.js";
			s.onload = () => (window.THREE ? resolve() : reject(new Error("Three.js failed to load")));
			s.onerror = () => reject(new Error("Three.js script failed"));
			document.head.appendChild(s);
		});
	}

	function createSuperMonkeyBallGame(config) {
		const cfg = config.config || {};
		const TIME_LIMIT = (cfg.timeLimit ?? 75) * 1000;
		const MAX_TILT_DEG = cfg.maxTiltDeg ?? 14;
		const GRAVITY = cfg.gravity ?? 14;
		const FRICTION = cfg.friction ?? 0.985;
		const BALL_RADIUS = cfg.ballRadius ?? 0.6;
		const STAGE_WIDTH = cfg.stageWidth ?? 16;
		const STAGE_LENGTH = cfg.stageLength ?? 24;
		const GOAL_RADIUS = cfg.goalRadius ?? 1.3;
		const BRAKE_FACTOR = 0.4;

		const GOAL_X = -20;
		const GOAL_Z = STAGE_LENGTH - 2;
		const START_X = 0;
		const START_Z = 2;
		const HALF_W = STAGE_WIDTH / 2;

		const OBSTACLES = [
			{ x: -3, z: 6, w: 1.5, h: 1.5 },
			{ x: 3, z: 8, w: 1.5, h: 1.5, lightBlue: true },
			{ x: 0, z: 11, w: 2, h: 1 },
			{ x: -4, z: 14, w: 1.2, h: 2, lightBlue: true },
			{ x: 4, z: 14, w: 1.2, h: 2 },
			{ x: 0, z: 17, w: 3, h: 1, lightBlue: true },
			{ x: -2.5, z: 19, w: 1, h: 1.5 },
			{ x: 2.5, z: 19, w: 1, h: 1.5 },
			{ x: -18, z: 5, w: 1.2, h: 1.2, lightBlue: true },
			{ x: 18, z: 6, w: 1.2, h: 1.5 },
			{ x: -14, z: 8, w: 1.5, h: 1, lightBlue: true },
			{ x: 12, z: 10, w: 1, h: 1.5 },
			{ x: -20, z: 11, w: 1.2, h: 1.2 },
			{ x: 20, z: 12, w: 1.2, h: 1.2, lightBlue: true },
			{ x: -16, z: 14, w: 1.5, h: 1.5 },
			{ x: 15, z: 15, w: 1.2, h: 1.2 },
			{ x: -10, z: 16, w: 1.5, h: 1, lightBlue: true },
			{ x: 8, z: 17, w: 1.2, h: 1.5 },
			{ x: -8, z: 18, w: 1, h: 1.5 },
			{ x: 10, z: 19, w: 1.5, h: 1 },
			{ x: -6, z: 20, w: 1.2, h: 1.2 },
			{ x: 6, z: 20, w: 1.2, h: 1.2 },
		];

		const PINK_GOAL_X = 20;
		const ACORN_RADIUS = 0.35;

		const BLACK_HOLES = [
			{ x: -10, z: 6, r: 0.9 },
			{ x: -5, z: 9, r: 0.9 },
			{ x: 5, z: 11, r: 0.9 },
			{ x: 10, z: 13, r: 0.9 },
			{ x: 0, z: 15, r: 0.9 },
			{ x: -8, z: 17, r: 0.9 },
			{ x: 15, z: 18, r: 0.9 },
			{ x: 20, z: 20, r: 0.9 },
		];

		let _isRunning = false;
		let _isPaused = false;
		let _isGameOver = false;
		let _isVictory = false;
		let _animationId = null;
		let _lastTime = 0;
		let _gameStartTime = 0;
		let _initPromise = null;

		const _ctx2D = CanvasRenderer.getContext();
		const _canvas2D = CanvasRenderer.getCanvas();
		let _webglCanvas = null;
		let _container = null;

		let _scene, _camera, _renderer, _stageGroup, _ballMesh, _goalMesh, _pinkGoalMesh;
		let _obsGeom = null,
			_obsMat = null,
			_obsMatBlue = null;
		const _obstacleMeshes = [];
		let _holeGeom = null,
			_holeMat = null;
		const _holeMeshes = [];
		let _acornGeom = null,
			_acornMat = null;
		let _tiltX = 0,
			_tiltZ = 0;
		const _maxTilt = (MAX_TILT_DEG * Math.PI) / 180;
		const _tiltSpeed = 1.8;

		let _ballX = START_X;
		let _ballZ = START_Z;
		let _velX = 0,
			_velZ = 0;
		let _attempts = 0;
		let _status = "PLAYING";
		let _overlayPhase = null;
		let _overlayTimer = 0;
		let _clearPhase = null;
		let _pinkGoalHit = false;
		const _acorns = [];
		const _acornMeshes = [];
		let _acornsCollected = 0;
		let _acornAwarded = false;
		let _acornCollectAnim = null;
		const _sparkles = [];
		let _foundTextLeftMs = 0;
		const ACORN_ANIM_TOTAL_MS = 1400;

		const _keys = {};

		function _createWebGLCanvas() {
			const parent = _canvas2D.parentNode;
			if (!parent) return false;
			_container = parent;
			_webglCanvas = document.createElement("canvas");
			_webglCanvas.className = "webgl-layer";
			_webglCanvas.width = _canvas2D.width || 800;
			_webglCanvas.height = _canvas2D.height || 480;
			_webglCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:1;";
			_canvas2D.style.position = "relative";
			_canvas2D.style.zIndex = "2";
			parent.appendChild(_webglCanvas);
			return true;
		}

		function _initThreeJS() {
			const THREE = window.THREE;
			const W = _webglCanvas.width;
			const H = _webglCanvas.height;

			_scene = new THREE.Scene();
			_scene.fog = new THREE.FogExp2(0x5cb85c, 0.012);
			_scene.background = new THREE.Color(0x5cb85c);

			_camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 200);
			_camera.position.set(0, 28, 14);
			_camera.lookAt(0, 0, STAGE_LENGTH / 2);

			_renderer = new THREE.WebGLRenderer({ canvas: _webglCanvas, antialias: false, alpha: false });
			_renderer.setSize(Math.floor(W / 2), Math.floor(H / 2), false);
			_renderer.setPixelRatio(1);
			_webglCanvas.style.width = "100%";
			_webglCanvas.style.height = "100%";
			_webglCanvas.style.imageRendering = "pixelated";
			_webglCanvas.style.background = "#5cb85c";
			_renderer.setClearColor(0x5cb85c, 1);
			_renderer.toneMapping = THREE.NoToneMapping;
			_renderer.toneMappingExposure = 1;

			const amb = new THREE.AmbientLight(0xffffff, 1.0);
			_scene.add(amb);
			const dir = new THREE.DirectionalLight(0xffffff, 2.0);
			dir.position.set(12, 25, 10);
			_scene.add(dir);
			const fill = new THREE.DirectionalLight(0xffffff, 0.8);
			fill.position.set(-8, 15, -5);
			_scene.add(fill);

			_stageGroup = new THREE.Group();
			_scene.add(_stageGroup);

			const stageGeom = new THREE.BoxGeometry(STAGE_WIDTH, 0.4, STAGE_LENGTH);
			const stageMat = new THREE.MeshStandardMaterial({
				color: 0xcbbd93,
				metalness: 0.3,
				roughness: 0.6,
			});
			const stageMesh = new THREE.Mesh(stageGeom, stageMat);
			stageMesh.position.set(0, -0.2, STAGE_LENGTH / 2);
			_stageGroup.add(stageMesh);

			const ballGeom = new THREE.SphereGeometry(BALL_RADIUS, 24, 24);
			const ballMat = new THREE.MeshStandardMaterial({
				color: 0xff9933,
				metalness: 0.4,
				roughness: 0.35,
				transparent: false,
			});
			_ballMesh = new THREE.Mesh(ballGeom, ballMat);
			_stageGroup.add(_ballMesh);

			const goalGeom = new THREE.CylinderGeometry(GOAL_RADIUS, GOAL_RADIUS, 0.2, 24);
			const goalMat = new THREE.MeshStandardMaterial({
				color: 0xf2c14e,
				emissive: 0xf2c14e,
				metalness: 0.9,
				roughness: 0.7,
				emissiveIntensity: 0.5,
			});
			_goalMesh = new THREE.Mesh(goalGeom, goalMat);
			_goalMesh.position.set(GOAL_X, 0.1, GOAL_Z);
			_stageGroup.add(_goalMesh);

			const pinkGoalMat = new THREE.MeshStandardMaterial({
				color: 0xff69b4,
				emissive: 0xff69b4,
				metalness: 0.9,
				roughness: 0.7,
				emissiveIntensity: 0.5,
			});
			_pinkGoalMesh = new THREE.Mesh(goalGeom.clone(), pinkGoalMat);
			_pinkGoalMesh.position.set(PINK_GOAL_X, 0.1, GOAL_Z);
			_stageGroup.add(_pinkGoalMesh);

			_obsGeom = new THREE.BoxGeometry(1, 0.6, 1);
			_obsMat = new THREE.MeshStandardMaterial({
				color: 0x6b3510,
				metalness: 0.05,
				roughness: 0.85,
				transparent: false,
			});
			_obsMatBlue = new THREE.MeshStandardMaterial({
				color: 0x87ceeb,
				metalness: 0.1,
				roughness: 0.8,
				transparent: false,
			});
			for (const o of OBSTACLES) {
				const mat = o.lightBlue ? _obsMatBlue : _obsMat;
				const m = new THREE.Mesh(_obsGeom, mat);
				m.position.set(o.x, 0.3, o.z);
				m.scale.set(o.w, 1, o.h);
				_stageGroup.add(m);
				_obstacleMeshes.push(m);
			}

			_holeGeom = new THREE.CylinderGeometry(1, 1, 0.15, 24);
			_holeMat = new THREE.MeshStandardMaterial({
				color: 0x0a0a0a,
				emissive: 0x0a0a0a,
				metalness: 0.9,
				roughness: 0.2,
			});
			for (const h of BLACK_HOLES) {
				const m = new THREE.Mesh(_holeGeom, _holeMat);
				m.position.set(h.x, 0.08, h.z);
				m.scale.set(h.r, 1, h.r);
				_stageGroup.add(m);
				_holeMeshes.push(m);
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
		const _sparkleColors = ["#ffeb3b", "#ff9800", "#ffc107", "#fff59d"];
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
		function _triggerAcornCollectAnim(fromX, fromY) {
			const letterboxHeight = 40;
			const padding = 20;
			const toX = padding + 50;
			const toY = letterboxHeight + padding + 30;
			const now = performance.now();
			_acornCollectAnim = {
				fromX,
				fromY,
				toX,
				toY,
				startMs: now,
				durationMs: 1100,
				active: true,
			};
			_acornAnimEndMs = now + ACORN_ANIM_TOTAL_MS;
			_spawnSparkleBurst(fromX, fromY, 28);
			_foundTextLeftMs = 500;
		}
		function _updateAcornCollectEffects(dtMs) {
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
			if (_acornCollectAnim && _acornCollectAnim.active) {
				const elapsed = performance.now() - _acornCollectAnim.startMs;
				if (elapsed >= _acornCollectAnim.durationMs) {
					_acornCollectAnim.active = false;
					_acornCollectAnim = null;
					_sparkles.length = 0;
					_foundTextLeftMs = 0;
				}
			}
			if (_foundTextLeftMs > 0) _foundTextLeftMs = Math.max(0, _foundTextLeftMs - dtMs);
		}
		function _renderAcornCollectAnim() {
			if (!_acornCollectAnim || !_acornCollectAnim.active) return;
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
			_ctx2D.save();
			_ctx2D.globalAlpha = alpha;
			_ctx2D.textAlign = "center";
			_ctx2D.textBaseline = "middle";
			const sizePx = Math.max(10, Math.round(72 * scale));
			_ctx2D.font = `bold ${sizePx}px Arial, sans-serif`;
			_ctx2D.fillStyle = "#ffffff";
			_ctx2D.fillText("🌰", Math.round(x), Math.round(y));
			_ctx2D.restore();
			if (_foundTextLeftMs > 0) {
				const t2 = Math.min(1, _foundTextLeftMs / 400);
				_ctx2D.save();
				_ctx2D.globalAlpha = t2;
				CanvasRenderer.drawText("FOUND 🌰!", _acornCollectAnim.fromX, _acornCollectAnim.fromY + 54, {
					color: "#f4f1de",
					size: 16,
					align: "center",
				});
				_ctx2D.restore();
			}
		}
		function _renderSparkles() {
			for (const p of _sparkles) {
				const a = Math.min(1, Math.max(0, p.lifeMs / p.maxLifeMs));
				_ctx2D.save();
				_ctx2D.globalAlpha = a;
				_ctx2D.fillStyle = p.color;
				const px = Math.round(p.x);
				const py = Math.round(p.y);
				const s = p.size;
				_ctx2D.fillRect(px, py, s, s);
				_ctx2D.restore();
			}
		}

		function _closestAABB(ax, az, bw, bh, px, pz) {
			const hw = bw / 2,
				hh = bh / 2;
			const cx = Math.max(ax - hw, Math.min(ax + hw, px));
			const cy = Math.max(az - hh, Math.min(az + hh, pz));
			const dx = px - cx,
				dz = pz - cy;
			const d = Math.sqrt(dx * dx + dz * dz) || 1e-6;
			return { cx, cy, dx, dy: dz, d, nx: dx / d, nz: dz / d };
		}

		function _resolveObstacles() {
			for (const o of OBSTACLES) {
				const { d, nx, nz } = _closestAABB(o.x, o.z, o.w, o.h, _ballX, _ballZ);
				if (d >= BALL_RADIUS) continue;
				const pen = BALL_RADIUS - d;
				_ballX += nx * pen;
				_ballZ += nz * pen;
				const vn = _velX * nx + _velZ * nz;
				if (vn < 0) {
					_velX -= 2 * vn * nx;
					_velZ -= 2 * vn * nz;
				}
			}
		}

		function _update(dt) {
			if (_isPaused || _isGameOver || _isVictory) return;
			const dtS = Math.min(dt / 1000, 0.05);

			const ax = GRAVITY * Math.sin(_tiltZ);
			const az = GRAVITY * Math.sin(_tiltX);
			_velX += ax * dtS;
			_velZ += az * dtS;
			if (_keys["Space"]) {
				_velX *= BRAKE_FACTOR;
				_velZ *= BRAKE_FACTOR;
			}
			_velX *= FRICTION;
			_velZ *= FRICTION;
			_ballX += _velX * dtS;
			_ballZ += _velZ * dtS;
			_resolveObstacles();

			for (const h of BLACK_HOLES) {
				const dx = _ballX - h.x;
				const dz = _ballZ - h.z;
				const dist = Math.sqrt(dx * dx + dz * dz);
				if (dist < h.r + BALL_RADIUS) {
					_status = "FALL OUT";
					_isGameOver = true;
					_overlayPhase = "fall";
					_overlayTimer = 0;
					_attempts++;
					_updateStateManager();
					return;
				}
			}

			if (_ballX < -HALF_W || _ballX > HALF_W || _ballZ < 0 || _ballZ > STAGE_LENGTH) {
				_status = "FALL OUT";
				_isGameOver = true;
				_overlayPhase = "fall";
				_overlayTimer = 0;
				_attempts++;
				_updateStateManager();
				return;
			}

			const gdx = _ballX - GOAL_X;
			const gdz = _ballZ - GOAL_Z;
			const dist = Math.sqrt(gdx * gdx + gdz * gdz);
			if (dist <= GOAL_RADIUS) {
				_status = "CLEAR";
				_isVictory = true;
				_overlayPhase = "clear";
				_overlayTimer = 0;
				_clearPhase = "show";
				_updateStateManager();
				return;
			}

			const pgdx = _ballX - PINK_GOAL_X;
			const pgdz = _ballZ - GOAL_Z;
			const pdist = Math.sqrt(pgdx * pgdx + pgdz * pgdz);
			if (pdist <= GOAL_RADIUS && !_pinkGoalHit) {
				_pinkGoalHit = true;
				const acornPositions = [
					{ x: 0, z: 10 },
					{ x: -6, z: 14 },
					{ x: 6, z: 17 },
				];
				if (!_acornGeom) {
					_acornGeom = new THREE.SphereGeometry(ACORN_RADIUS, 12, 12);
					_acornMat = new THREE.MeshStandardMaterial({
						color: 0x8b4513,
						metalness: 0.2,
						roughness: 0.7,
					});
				}
				for (const pos of acornPositions) {
					_acorns.push({ x: pos.x, z: pos.z, collected: false });
					const m = new THREE.Mesh(_acornGeom, _acornMat);
					m.position.set(pos.x, ACORN_RADIUS, pos.z);
					_stageGroup.add(m);
					_acornMeshes.push(m);
				}
			}

			for (let i = 0; i < _acorns.length; i++) {
				const a = _acorns[i];
				if (a.collected) continue;
				const adx = _ballX - a.x;
				const adz = _ballZ - a.z;
				const adist = Math.sqrt(adx * adx + adz * adz);
				if (adist < ACORN_RADIUS + BALL_RADIUS) {
					a.collected = true;
					_acornsCollected++;
					if (_acornMeshes[i]) {
						_stageGroup.remove(_acornMeshes[i]);
						_acornMeshes[i] = null;
					}
					if (_acornsCollected > 0 && !_acornAwarded) {
						_acornAwarded = true;
						try {
							if (typeof StateManager !== "undefined" && StateManager.collectItem) {
								StateManager.collectItem({ eraKey: "era3", level: 10, itemId: "acorn" });
							}
						} catch (_) {}
						const cx = _canvas2D.width / 2;
						const cy = _canvas2D.height / 2;
						_triggerAcornCollectAnim(cx, cy);
					}
				}
			}

			_stageGroup.rotation.x = _tiltX;
			_stageGroup.rotation.z = -_tiltZ;
			_ballMesh.position.set(_ballX, BALL_RADIUS, _ballZ);
		}

		function _updateStateManager() {
			if (typeof StateManager === "undefined") return;
			const elapsed = Date.now() - _gameStartTime;
			const timeLeft = Math.max(0, TIME_LIMIT - elapsed);
			const speed = Math.sqrt(_velX * _velX + _velZ * _velZ);
			const gdx = _ballX - GOAL_X;
			const gdz = _ballZ - GOAL_Z;
			const dist = Math.sqrt(gdx * gdx + gdz * gdz);
			StateManager.updateLevelData({
				timeLeft,
				timeElapsed: elapsed,
				attempts: _attempts,
				speed: Math.round(speed * 10) / 10,
				distanceToGoal: Math.round(dist * 10) / 10,
				status: _status,
			});
		}

		function _loop(now) {
			_animationId = requestAnimationFrame(_loop);
			const dt = _lastTime ? now - _lastTime : 0;
			_lastTime = now;

			_applyTiltFromInput();
			if (!_isPaused) {
				_update(dt);
				_updateStateManager();
			}

			if (_overlayPhase === "clear") {
				_overlayTimer += dt;
				if (_clearPhase === "show" && _overlayTimer >= 900) {
					if (typeof EventBus !== "undefined") {
						EventBus.emit(EventBus.Events.MINIGAME_END, {
							success: true,
							isFinalLevel: true,
							time: Date.now() - _gameStartTime,
							attempts: _attempts,
						});
					}
					_overlayPhase = null;
					_render();
					return;
				}
			} else if (_overlayPhase === "fall") {
				_overlayTimer += dt;
				if (_overlayTimer >= 2400) {
					_overlayPhase = null;
					_resetAndRestart();
				}
			}

			_updateAcornCollectEffects(dt);

			_render();
		}

		function _resetAndRestart() {
			_isGameOver = false;
			_overlayPhase = null;
			_overlayTimer = 0;
			_ballX = START_X;
			_ballZ = START_Z;
			_velX = _velZ = 0;
			_tiltX = _tiltZ = 0;
			_gameStartTime = Date.now();
			_status = "PLAYING";
			_lastTime = 0;
			_pinkGoalHit = false;
			for (const m of _acornMeshes) {
				if (m) _stageGroup.remove(m);
			}
			_acorns.length = 0;
			_acornMeshes.length = 0;
			_acornsCollected = 0;
			_updateStateManager();
		}

		function _render() {
			const THREE = window.THREE;
			if (!THREE || !_renderer || !_scene) return;

			_renderer.render(_scene, _camera);

			_ctx2D.save();
			_ctx2D.clearRect(0, 0, _canvas2D.width, _canvas2D.height);

			const L = 40;
			_ctx2D.fillStyle = "#000";
			_ctx2D.fillRect(0, 0, _canvas2D.width, L);
			_ctx2D.fillRect(0, _canvas2D.height - L, _canvas2D.width, L);

			const pad = 12;
			const topY = L + pad;
			_ctx2D.font = '10px "Press Start 2P"';
			_ctx2D.fillStyle = "#e0e8f0";
			_ctx2D.textAlign = "left";
			const elapsed = Math.floor((Date.now() - _gameStartTime) / 1000);
			const mm = Math.floor(elapsed / 60);
			const ss = elapsed % 60;
			_ctx2D.fillText(`TIME ${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`, pad, topY);
			_ctx2D.fillText(`ATT ${_attempts}`, pad, topY + 16);
			const spd = Math.sqrt(_velX * _velX + _velZ * _velZ);
			_ctx2D.fillText(`SPD ${spd.toFixed(1)}`, pad, topY + 32);
			const gdx = _ballX - GOAL_X;
			const gdz = _ballZ - GOAL_Z;
			const d = Math.sqrt(gdx * gdx + gdz * gdz);
			_ctx2D.fillText(`GOAL ${d.toFixed(1)}`, pad, topY + 48);

			if (_overlayPhase === "clear") {
				CanvasRenderer.setAlpha(0.9);
				_ctx2D.fillStyle = "#1a1a2e";
				_ctx2D.fillRect(200, 180, 400, 120);
				_ctx2D.fillStyle = "#22aa44";
				_ctx2D.font = '24px "Press Start 2P"';
				_ctx2D.textAlign = "center";
				_ctx2D.fillText("CLEAR!", 400, 235);
				_ctx2D.fillText("WELL DONE", 400, 265);
				CanvasRenderer.setAlpha(1);
			} else if (_overlayPhase === "fall") {
				CanvasRenderer.fade(Math.min(1, _overlayTimer / 800) * 0.7);
				_ctx2D.fillStyle = "#e0e8f0";
				_ctx2D.font = '20px "Press Start 2P"';
				_ctx2D.textAlign = "center";
				_ctx2D.fillText("FALL OUT!", 400, 220);
				_ctx2D.fillText("TRY AGAIN", 400, 260);
			}

			_renderSparkles();
			_renderAcornCollectAnim();

			_ctx2D.restore();
		}

		function _handleKeyDown(e) {
			_keys[e.code] = true;
			// if (e.code === 'Escape') return;
			if (e.code === "NumpadMultiply" || (e.code === "Digit8" && e.shiftKey)) {
				e.preventDefault();
				if (!_isVictory && !_isGameOver) {
					_status = "CLEAR";
					_isVictory = true;
					_overlayPhase = "clear";
					_overlayTimer = 0;
					_clearPhase = "show";
					_updateStateManager();
				}
				return;
			}
			if (
				["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS", "Space"].includes(
					e.code
				)
			) {
				e.preventDefault();
			}
		}

		function _handleKeyUp(e) {
			_keys[e.code] = false;
		}

		function _applyTiltFromInput() {
			if (_isPaused || _isGameOver || _isVictory) return;
			const d = 0.016 * _tiltSpeed;
			if (_keys["ArrowRight"] || _keys["KeyD"]) _tiltZ = Math.min(_maxTilt, _tiltZ + d);
			if (_keys["ArrowLeft"] || _keys["KeyA"]) _tiltZ = Math.max(-_maxTilt, _tiltZ - d);
			if (_keys["ArrowUp"] || _keys["KeyW"]) _tiltX = Math.min(_maxTilt, _tiltX + d);
			if (_keys["ArrowDown"] || _keys["KeyS"]) _tiltX = Math.max(-_maxTilt, _tiltX - d);
		}

		function _tick(now) {
			_applyTiltFromInput();
			_gameLoop(now);
		}

		const game = {
			async init() {
				await loadThreeJS();
				if (!_createWebGLCanvas()) return;
				_initThreeJS();
				_ballX = START_X;
				_ballZ = START_Z;
				_velX = _velZ = 0;
				_tiltX = _tiltZ = 0;
				_attempts = 0;
				_status = "PLAYING";
				_gameStartTime = Date.now();
				_updateStateManager();
			},
			async start() {
				if (_initPromise) await _initPromise;
				_isRunning = true;
				_isPaused = false;
				_isGameOver = false;
				_isVictory = false;
				_overlayPhase = null;
				_overlayTimer = 0;
				_clearPhase = null;
				_lastTime = 0;
				_gameStartTime = Date.now();
				_ballX = START_X;
				_ballZ = START_Z;
				_velX = _velZ = 0;
				_tiltX = _tiltZ = 0;
				_pinkGoalHit = false;
				_acorns.length = 0;
				_acornMeshes.length = 0;
				_acornsCollected = 0;
				_acornAwarded = false;
				_acornCollectAnim = null;
				_sparkles.length = 0;
				_updateStateManager();
				window.addEventListener("keydown", _handleKeyDown);
				window.addEventListener("keyup", _handleKeyUp);
				_animationId = requestAnimationFrame(_loop);
			},
			pause() {
				_isPaused = true;
			},
			resume() {
				_isPaused = false;
				_lastTime = 0;
			},
			stop() {
				_isRunning = false;
				if (_animationId) cancelAnimationFrame(_animationId);
				_animationId = null;
				window.removeEventListener("keydown", _handleKeyDown);
				window.removeEventListener("keyup", _handleKeyUp);
			},
			async destroy() {
				game.stop();
				if (_webglCanvas && _container) {
					_webglCanvas.remove();
					_webglCanvas = null;
				}
				const THREE = window.THREE;
				if (THREE) {
					if (_scene) {
						_scene.traverse((o) => {
							if (o.geometry && o.geometry !== _obsGeom && o.geometry !== _holeGeom && o.geometry !== _acornGeom)
								o.geometry.dispose();
							if (
								o.material &&
								o.material !== _obsMat &&
								o.material !== _obsMatBlue &&
								o.material !== _holeMat &&
								o.material !== _acornMat
							) {
								if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
								else o.material.dispose();
							}
						});
					}
					if (_obsGeom) {
						_obsGeom.dispose();
						_obsGeom = null;
					}
					if (_obsMat) {
						_obsMat.dispose();
						_obsMat = null;
					}
				}
				_scene = _camera = _renderer = _stageGroup = _ballMesh = _goalMesh = null;
				_obstacleMeshes.length = 0;
			},
			getState() {
				return {
					status: _status,
					attempts: _attempts,
					ballX: _ballX,
					ballZ: _ballZ,
					velocity: Math.sqrt(_velX * _velX + _velZ * _velZ),
				};
			},
		};

		if (typeof LevelManager !== "undefined") LevelManager.setCurrentGame(game);
		return game;
	}

	if (typeof GameLoader !== "undefined") {
		GameLoader.registerGame("super-monkey-ball", createSuperMonkeyBallGame);
	}
})();
