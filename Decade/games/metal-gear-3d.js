/**
 * metal-gear-3d.js
 * PS2-era 3D stealth mini-game for Level 8 (2023)
 * Uses Three.js for 3D rendering with WebGL canvas
 *
 * Win condition: Collect keycard and extract
 * Lose condition: Alert meter reaches 100
 */

(function () {
	"use strict";

	// Three.js will be loaded dynamically
	let THREE = null;
	let threeJsLoaded = false;

	/**
	 * Load Three.js from local file
	 * @returns {Promise} Resolves when Three.js is loaded
	 */
	function loadThreeJS() {
		if (threeJsLoaded && window.THREE) {
			THREE = window.THREE;
			return Promise.resolve();
		}

		return new Promise((resolve, reject) => {
			// Check if already loading
			const existingScript = document.querySelector('script[src*="three"]');
			if (existingScript) {
				console.log("[MetalGear3D] Three.js script already loading, waiting...");
				let attempts = 0;
				const maxAttempts = 200; // 10 seconds max wait
				const checkInterval = setInterval(() => {
					attempts++;
					if (window.THREE) {
						THREE = window.THREE;
						threeJsLoaded = true;
						clearInterval(checkInterval);
						console.log("[MetalGear3D] Three.js loaded (was already loading)");
						resolve();
					} else if (attempts >= maxAttempts) {
						clearInterval(checkInterval);
						console.error("[MetalGear3D] Timeout waiting for Three.js");
						reject(new Error("Timeout waiting for Three.js"));
					}
				}, 50);
				return;
			}

			console.log("[MetalGear3D] Loading Three.js from local file...");
			const script = document.createElement("script");
			script.src = "Decade/js/vendor/three.min.js";
			script.onload = () => {
				if (window.THREE) {
					THREE = window.THREE;
					threeJsLoaded = true;
					console.log("[MetalGear3D] Three.js loaded successfully");
					resolve();
				} else {
					console.error("[MetalGear3D] Three.js script loaded but window.THREE is undefined");
					reject(new Error("Three.js loaded but not available"));
				}
			};
			script.onerror = (error) => {
				console.error("[MetalGear3D] Failed to load Three.js script:", error);
				reject(new Error("Failed to load Three.js"));
			};
			document.head.appendChild(script);
		});
	}

	/**
	 * Metal Gear 3D game factory
	 * @param {Object} config - Level configuration
	 * @returns {Object} Game instance
	 */
	function createMetalGear3DGame(config) {
		const cfg = config.config || {};

		// =========================================
		// CONFIG
		// =========================================

		const DIFFICULTY = cfg.difficulty || 2.2;
		const GUARD_COUNT = cfg.guardCount || 3;
		const PLAYER_SPEED = cfg.playerSpeed || 3.2;
		const RUN_MULTIPLIER = cfg.runMultiplier || 1.6;
		const GUARD_SPEED = cfg.guardSpeed || 2.4;
		const VISION_RANGE = cfg.visionRange || 7.5;
		const VISION_ANGLE_DEG = cfg.visionAngleDeg || 75;
		const ALERT_RISE_PER_SEC = cfg.alertRisePerSec || 55;
		const ALERT_DECAY_PER_SEC = cfg.alertDecayPerSec || 16;
		const TIME_LIMIT = cfg.timeLimit || 90;

		// =========================================
		// STATE
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
		const _ctx2D = CanvasRenderer.getContext();
		const _canvas2D = CanvasRenderer.getCanvas();
		let _webglCanvas = null;
		let _webglContainer = null;

		// Initialization state
		let _isInitializing = false;
		let _initPromise = null;
		let _renderLogShown = false;

		// Three.js objects
		let _scene = null;
		let _camera = null;
		let _renderer = null;
		let _clock = null;

		// Game objects
		let _player = null;
		let _playerMesh = null;
		let _guards = [];
		let _guardMeshes = [];
		let _walls = [];
		let _wallMeshes = [];
		let _keycard = null;
		let _keycardMesh = null;
		let _silverKeycard = null;
		let _silverKeycardMesh = null;
		let _extractionZone = null;
		let _extractionZoneMesh = null;
		let _silverTrunk = null;
		let _silverTrunkMesh = null;
		let _centerTrunk = null;
		let _centerTrunkMesh = null;
		let _floor = null;
		let _hasGoldenKey = false;
		let _hasSilverKey = false;
		let _acornCollected = false;
		let _acornCollectAnim = null;
		let _foundTextLeftMs = 0;
		const _sparkles = [];
		const _sparkleColors = ["#ffffff", "#a8e6cf", "#ffd0df", "#fff1a8"];

		// Game state
		let _alert = 0;
		let _objective = "FIND KEYCARD";
		let _playerPos = { x: 0, y: 0, z: 0 };
		let _playerVelocity = { x: 0, z: 0 };
		let _cameraTarget = { x: 0, z: 0 };
		let _lastInteractTime = 0;
		const INTERACT_COOLDOWN = 300; // ms

		// Input
		const _keys = {};
		let _debugSkip = false;

		// Map bounds
		const MAP_SIZE = 30;
		const MAP_MIN = -MAP_SIZE / 2;
		const MAP_MAX = MAP_SIZE / 2;

		// Colors (PS2 palette)
		const COLORS = {
			floor: 0x1a1a2e,
			wall: 0xcccccc, // White-ish walls
			player: 0x4a9fff,
			guard: 0xff0000, // Bright red for enemies
			keycard: 0xf2c14e,
			keycardSilver: 0xc0c0c0,
			extraction: 0x00ff00,
			fog: 0x0a0a1a, // Dark background
			ambient: 0x2a2a3a,
			background: 0x0a0a1a, // Same as fog for solid background
		};

		// =========================================
		// INITIALIZATION
		// =========================================

		function init() {
			console.log("[MetalGear3D] Initializing...");

			if (_isInitializing && _initPromise) {
				console.log("[MetalGear3D] Already initializing, returning existing promise");
				return _initPromise;
			}

			_isInitializing = true;

			// Create WebGL canvas first
			if (!_createWebGLCanvas()) {
				console.error("[MetalGear3D] Failed to create WebGL canvas");
				_renderError("Failed to create 3D canvas");
				_isInitializing = false;
				return;
			}

			// Show loading message on 2D canvas
			_renderLoading();

			// Load Three.js and initialize
			_initPromise = loadThreeJS()
				.then(() => {
					if (!window.THREE) {
						console.error("[MetalGear3D] Three.js not available after load");
						_renderError("Failed to load 3D engine");
						_isInitializing = false;
						throw new Error("Three.js not available");
					}
					console.log("[MetalGear3D] Initializing Three.js scene...");
					_initThreeJS();
					_resetGame();
					_isInitializing = false;
					console.log(
						"[MetalGear3D] Initialization complete - Scene:",
						!!_scene,
						"Camera:",
						!!_camera,
						"Renderer:",
						!!_renderer
					);
				})
				.catch((err) => {
					console.error("[MetalGear3D] Failed to initialize:", err);
					_renderError("Failed to initialize game");
					_isInitializing = false;
					throw err;
				});

			return _initPromise;
		}

		function _renderLoading() {
			CanvasRenderer.clear("#000000");
			CanvasRenderer.drawText("LOADING 3D ENGINE...", _canvas2D.width / 2, _canvas2D.height / 2, {
				color: "#ffffff",
				size: 14,
				align: "center",
			});
		}

		function _renderError(message) {
			CanvasRenderer.clear("#000000");
			CanvasRenderer.drawText("ERROR", _canvas2D.width / 2, _canvas2D.height / 2 - 20, {
				color: "#ff0000",
				size: 16,
				align: "center",
			});
			CanvasRenderer.drawText(message, _canvas2D.width / 2, _canvas2D.height / 2 + 10, {
				color: "#ffffff",
				size: 10,
				align: "center",
			});
		}

		function _createWebGLCanvas() {
			// Remove existing WebGL canvas if any
			const existing = document.querySelector(".webgl-layer");
			if (existing) {
				existing.remove();
			}

			// Find the canvas container
			const canvasContainer = _canvas2D.parentElement;
			if (!canvasContainer) {
				console.error("[MetalGear3D] Canvas container not found. Canvas2D:", _canvas2D);
				return false;
			}

			// Create WebGL canvas
			_webglCanvas = document.createElement("canvas");
			_webglCanvas.className = "webgl-layer";
			// Match 2D canvas dimensions (default to 800x480 if not set)
			_webglCanvas.width = _canvas2D.width || 800;
			_webglCanvas.height = _canvas2D.height || 480;
			_webglCanvas.style.cssText =
				"position:absolute; inset:0; width:100%; height:100%; z-index:1; pointer-events:none; opacity:1; background:#0a0a1a;";

			// Ensure 2D canvas is on top
			_canvas2D.style.position = "relative";
			_canvas2D.style.zIndex = "2";

			canvasContainer.appendChild(_webglCanvas);
			_webglContainer = canvasContainer;

			console.log("[MetalGear3D] WebGL canvas created:", _webglCanvas.width, "x", _webglCanvas.height);
			return true;
		}

		function _initThreeJS() {
			if (!window.THREE) {
				console.error("[MetalGear3D] window.THREE not available");
				return;
			}

			// Use window.THREE directly
			const THREE = window.THREE;

			// Scene
			_scene = new THREE.Scene();
			// Use regular fog instead of exponential for more consistent visibility
			_scene.fog = new THREE.Fog(COLORS.fog, 15, 50); // Near: 15, Far: 50

			// Camera (tilted top-down)
			const width = _webglCanvas.width || 800;
			const height = _webglCanvas.height || 480;
			const aspect = width / height;
			_camera = new THREE.PerspectiveCamera(65, aspect, 0.1, 100);
			// Position camera at an angle (tilted top-down view)
			// Camera is offset back and up, looking down at the center of map
			// Will be repositioned to follow player in _createPlayer()
			_camera.position.set(0, 20, 15);
			_camera.lookAt(0, 0, 0);

			// Renderer - OPAQUE with solid background
			_renderer = new THREE.WebGLRenderer({
				canvas: _webglCanvas,
				antialias: false,
				alpha: false, // Opaque background - no transparency
				preserveDrawingBuffer: false,
			});
			// Match canvas size and use low pixel ratio for PS2 feel
			_renderer.setSize(width, height, false);
			_renderer.setPixelRatio(0.75); // PS2 low-res feel
			// Set clear color to dark background (fully opaque)
			_renderer.setClearColor(COLORS.fog, 1.0); // Solid opaque background
			// Ensure we clear the canvas on each render
			_renderer.autoClear = true;

			// Lighting - brighter for better visibility
			const ambientLight = new THREE.AmbientLight(COLORS.ambient, 1.5); // Even brighter
			_scene.add(ambientLight);

			const directionalLight = new THREE.DirectionalLight(0xffffff, 1.8); // Even brighter
			directionalLight.position.set(10, 20, 10);
			directionalLight.castShadow = false;
			_scene.add(directionalLight);

			// Add a second directional light from opposite side for better visibility
			const directionalLight2 = new THREE.DirectionalLight(0xffffff, 1.0);
			directionalLight2.position.set(-10, 15, -10);
			directionalLight2.castShadow = false;
			_scene.add(directionalLight2);

			// Clock
			_clock = new THREE.Clock();

			console.log(
				"[MetalGear3D] Three.js initialized - Scene:",
				!!_scene,
				"Camera:",
				!!_camera,
				"Renderer:",
				!!_renderer
			);
		}

		function _resetGame() {
			if (!window.THREE || !_scene) return;

			const THREE = window.THREE;

			// Clear existing objects
			_clearScene();

			_alert = 0;
			_hasGoldenKey = false;
			_hasSilverKey = false;
			_acornCollected = false;
			_acornCollectAnim = null;
			_foundTextLeftMs = 0;
			_sparkles.length = 0;
			_objective = "FIND KEYCARD";
			_isGameOver = false;
			_isVictory = false;
			_lastInteractTime = 0;

			// Build map
			_buildMap();

			// Create player
			_createPlayer();

			// Create guards
			_createGuards();

			// Create keycard
			_createKeycard();

			// Create extraction zone
			_createExtractionZone();

			_updateHUD();
		}

		function _clearScene() {
			if (!_scene) return;

			// Remove all non-light objects (iterate backwards - we're mutating children)
			// This removes Groups (player, guards, keycard) entirely, not just their mesh children
			const disposeMesh = (obj) => {
				if (obj.isMesh) {
					if (obj.geometry) obj.geometry.dispose();
					if (obj.material) obj.material.dispose();
				}
				if (obj.children && obj.children.length) {
					obj.children.slice().forEach(disposeMesh);
				}
			};
			for (let i = _scene.children.length - 1; i >= 0; i--) {
				const obj = _scene.children[i];
				if (!obj.isLight) {
					disposeMesh(obj);
					_scene.remove(obj);
				}
			}

			_playerMesh = null;
			_guards = [];
			_guardMeshes = [];
			_walls = [];
			_wallMeshes = [];
			_keycardMesh = null;
			_keycard = null;
			_silverTrunkMesh = null;
			_silverTrunk = null;
			_centerTrunkMesh = null;
			_centerTrunk = null;
			_extractionZoneMesh = null;
			_extractionZone = null;
			_floor = null;
		}

		function _buildMap() {
			if (!window.THREE || !_scene) return;
			const THREE = window.THREE;

			// Floor - make it more visible with brighter color and emissive
			const floorGeometry = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE);
			const floorMaterial = new THREE.MeshStandardMaterial({
				color: 0x3a3a5a, // Brighter floor color for visibility (was 0x1a1a2e)
				emissive: 0x2a2a3a, // Brighter emissive glow
				emissiveIntensity: 0.5, // Stronger glow for visibility
			});
			_floor = new THREE.Mesh(floorGeometry, floorMaterial);
			_floor.rotation.x = -Math.PI / 2;
			_floor.position.y = 0;
			_floor.receiveShadow = false;
			_scene.add(_floor);

			// Walls (simple facility layout)
			const wallHeight = 3;
			const wallThickness = 0.5;
			const wallMaterial = new THREE.MeshStandardMaterial({
				color: COLORS.wall,
				emissive: COLORS.wall,
				emissiveIntensity: 0.5,
			});

			// Outer walls
			const outerWalls = [
				{ x: 0, z: MAP_MAX, w: MAP_SIZE, h: wallThickness }, // North
				{ x: 0, z: MAP_MIN, w: MAP_SIZE, h: wallThickness }, // South
				{ x: MAP_MAX, z: 0, w: wallThickness, h: MAP_SIZE }, // East
				{ x: MAP_MIN, z: 0, w: wallThickness, h: MAP_SIZE }, // West
			];

			// Inner walls (corridors/rooms)
			const innerWalls = [
				{ x: -8, z: 0, w: wallThickness, h: 12 },
				{ x: 8, z: 0, w: wallThickness, h: 12 },
				{ x: 0, z: -8, w: 12, h: wallThickness },
				{ x: 0, z: 8, w: 12, h: wallThickness },
				{ x: -5, z: 5, w: 6, h: wallThickness },
				{ x: 5, z: -5, w: 6, h: wallThickness },
			];

			[...outerWalls, ...innerWalls].forEach((wall) => {
				const geometry = new THREE.BoxGeometry(wall.w, wallHeight, wall.h);
				const mesh = new THREE.Mesh(geometry, wallMaterial);
				mesh.position.set(wall.x, wallHeight / 2, wall.z);
				_scene.add(mesh);

				// Store for collision
				_walls.push({
					x: wall.x - wall.w / 2,
					z: wall.z - wall.h / 2,
					w: wall.w,
					h: wall.h,
				});
				_wallMeshes.push(mesh);
			});
		}

		function _createPlayer() {
			if (!window.THREE || !_scene) return;
			const THREE = window.THREE;

			// Create a simple stick figure person using a Group
			const playerGroup = new THREE.Group();
			const material = new THREE.MeshStandardMaterial({
				color: COLORS.player,
				emissive: COLORS.player,
				emissiveIntensity: 0.5,
			});

			// Head (sphere)
			const headGeometry = new THREE.SphereGeometry(0.15, 8, 8);
			const headMesh = new THREE.Mesh(headGeometry, material);
			headMesh.position.set(0, 0.9, 0);
			playerGroup.add(headMesh);

			// Body (cylinder)
			const bodyGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8);
			const bodyMesh = new THREE.Mesh(bodyGeometry, material);
			bodyMesh.position.set(0, 0.3, 0);
			playerGroup.add(bodyMesh);

			// Left arm
			const armGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6);
			const leftArmMesh = new THREE.Mesh(armGeometry, material);
			leftArmMesh.position.set(-0.25, 0.4, 0);
			leftArmMesh.rotation.z = Math.PI / 4;
			playerGroup.add(leftArmMesh);

			// Right arm
			const rightArmMesh = new THREE.Mesh(armGeometry, material);
			rightArmMesh.position.set(0.25, 0.4, 0);
			rightArmMesh.rotation.z = -Math.PI / 4;
			playerGroup.add(rightArmMesh);

			// Left leg
			const legGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6);
			const leftLegMesh = new THREE.Mesh(legGeometry, material);
			leftLegMesh.position.set(-0.1, -0.15, 0);
			playerGroup.add(leftLegMesh);

			// Right leg
			const rightLegMesh = new THREE.Mesh(legGeometry, material);
			rightLegMesh.position.set(0.1, -0.15, 0);
			playerGroup.add(rightLegMesh);

			_playerMesh = playerGroup;
			_playerMesh.position.set(-10, 0.6, -10);
			_scene.add(_playerMesh);

			_playerPos = { x: -10, y: 0.6, z: -10 };
			_cameraTarget = { x: -10, z: -10 };

			// Set initial camera position to look at player (tilted top-down view)
			if (_camera) {
				// Camera positioned above and behind player for tilted view
				_camera.position.set(_playerPos.x, 20, _playerPos.z + 15);
				_camera.lookAt(_playerPos.x, 0, _playerPos.z);
			}
		}

		function _createGuards() {
			if (!window.THREE || !_scene) return;
			const THREE = window.THREE;

			_guards = [];
			_guardMeshes = [];

			// Use cylinder for guards
			const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 8);
			const material = new THREE.MeshStandardMaterial({
				color: COLORS.guard,
				emissive: COLORS.guard,
				emissiveIntensity: 0.5,
			});

			// Guard spawn positions and patrol waypoints
			const guardConfigs = [
				{
					pos: { x: 10, z: 10 },
					waypoints: [
						{ x: 10, z: 10 },
						{ x: 10, z: 5 },
						{ x: 5, z: 5 },
						{ x: 5, z: 10 },
					],
				},
				{
					pos: { x: -10, z: 10 },
					waypoints: [
						{ x: -10, z: 10 },
						{ x: -5, z: 10 },
						{ x: -5, z: 5 },
						{ x: -10, z: 5 },
					],
				},
				{
					pos: { x: 0, z: 0 },
					waypoints: [
						{ x: 0, z: 0 },
						{ x: 5, z: 0 },
						{ x: 5, z: -5 },
						{ x: 0, z: -5 },
					],
				},
			];

			for (let i = 0; i < Math.min(GUARD_COUNT, guardConfigs.length); i++) {
				const config = guardConfigs[i];

				// Create a devil-like character using a Group
				const devilGroup = new THREE.Group();
				const guardMaterial = new THREE.MeshStandardMaterial({
					color: COLORS.guard,
					emissive: COLORS.guard,
					emissiveIntensity: 0.5,
				});

				// Body (cylinder)
				const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.4, 1.0, 8);
				const bodyMesh = new THREE.Mesh(bodyGeometry, guardMaterial);
				bodyMesh.position.set(0, 0.5, 0);
				devilGroup.add(bodyMesh);

				// Head (sphere)
				const headGeometry = new THREE.SphereGeometry(0.2, 8, 8);
				const headMesh = new THREE.Mesh(headGeometry, guardMaterial);
				headMesh.position.set(0, 1.1, 0);
				devilGroup.add(headMesh);

				// Left horn (cone)
				const hornGeometry = new THREE.ConeGeometry(0.08, 0.5, 6);
				const leftHornMesh = new THREE.Mesh(hornGeometry, guardMaterial);
				leftHornMesh.position.set(-0.12, 1.3, 0);
				leftHornMesh.rotation.z = -0.3;
				devilGroup.add(leftHornMesh);

				// Right horn (cone)
				const rightHornMesh = new THREE.Mesh(hornGeometry, guardMaterial);
				rightHornMesh.position.set(0.12, 1.3, 0);
				rightHornMesh.rotation.z = 0.3;
				devilGroup.add(rightHornMesh);

				// Tail (small cylinder, curved)
				const tailGeometry = new THREE.CylinderGeometry(0.06, 0.08, 0.4, 6);
				const tailMesh = new THREE.Mesh(tailGeometry, guardMaterial);
				tailMesh.position.set(0, 0.2, -0.3);
				tailMesh.rotation.x = Math.PI / 6; // Slight upward curve
				devilGroup.add(tailMesh);

				devilGroup.position.set(config.pos.x, 0.75, config.pos.z);
				_scene.add(devilGroup);

				_guards.push({
					x: config.pos.x,
					z: config.pos.z,
					waypoints: config.waypoints,
					waypointIndex: 0,
					facing: 0,
					alertLevel: 0,
				});
				_guardMeshes.push(devilGroup);
			}
		}

		function _createKeycard() {
			if (!window.THREE || !_scene) return;
			const THREE = window.THREE;

			// Create a key-like shape using a Group
			const keyGroup = new THREE.Group();
			const material = new THREE.MeshStandardMaterial({
				color: COLORS.keycard,
				emissive: COLORS.keycard,
				emissiveIntensity: 0.5,
			});

			// Key handle (circular head)
			const handleGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16);
			const handleMesh = new THREE.Mesh(handleGeometry, material);
			handleMesh.rotation.x = Math.PI / 2; // Rotate to lay flat
			handleMesh.position.set(0, 0.05, 0);
			keyGroup.add(handleMesh);

			// Key shaft (rectangular body)
			const shaftGeometry = new THREE.BoxGeometry(0.08, 0.1, 0.6);
			const shaftMesh = new THREE.Mesh(shaftGeometry, material);
			shaftMesh.position.set(0, 0.05, -0.3); // Positioned below handle
			keyGroup.add(shaftMesh);

			// Key teeth (small notches at the end)
			const teethGeometry = new THREE.BoxGeometry(0.12, 0.1, 0.15);
			const teethMesh = new THREE.Mesh(teethGeometry, material);
			teethMesh.position.set(0, 0.05, -0.675); // At the end of the shaft
			keyGroup.add(teethMesh);

			// Position and rotate the entire key
			keyGroup.position.set(8, 0.5, 8);
			keyGroup.rotation.y = Math.PI / 4;
			_keycardMesh = keyGroup;
			_scene.add(_keycardMesh);

			_keycard = { x: 8, z: 8, collected: false };
		}

		function _createSilverKeycard() {
			if (!window.THREE || !_scene) return;
			const THREE = window.THREE;

			// Bottom-left corner (negative X = left, positive Z = bottom in view; opposite to door at -12,-12)
			_silverKeycard = { x: -13, z: 13, collected: false };
			const keyGroup = new THREE.Group();
			const material = new THREE.MeshStandardMaterial({
				color: COLORS.keycardSilver,
				emissive: COLORS.keycardSilver,
				emissiveIntensity: 0.5,
			});

			const handleGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16);
			const handleMesh = new THREE.Mesh(handleGeometry, material);
			handleMesh.rotation.x = Math.PI / 2;
			handleMesh.position.set(0, 0.05, 0);
			keyGroup.add(handleMesh);

			const shaftGeometry = new THREE.BoxGeometry(0.08, 0.1, 0.6);
			const shaftMesh = new THREE.Mesh(shaftGeometry, material);
			shaftMesh.position.set(0, 0.05, -0.3);
			keyGroup.add(shaftMesh);

			const teethGeometry = new THREE.BoxGeometry(0.12, 0.1, 0.15);
			const teethMesh = new THREE.Mesh(teethGeometry, material);
			teethMesh.position.set(0, 0.05, -0.675);
			keyGroup.add(teethMesh);

			keyGroup.position.set(_silverKeycard.x, 0.5, _silverKeycard.z);
			keyGroup.rotation.y = Math.PI / 4;
			_silverKeycardMesh = keyGroup;
			_scene.add(_silverKeycardMesh);
		}

		function _createExtractionZone() {
			if (!window.THREE || !_scene) return;
			const THREE = window.THREE;

			// Extraction zone data
			_extractionZone = { x: -12, z: -12, radius: 2 };

			// Create visual marker in 3D (brown door/rectangle)
			// Make it look like a door - vertical rectangle
			const doorWidth = 2.5;
			const doorHeight = 3.5;
			const doorDepth = 0.8;
			const geometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
			const material = new THREE.MeshStandardMaterial({
				color: 0x8b4513, // Brown color (saddle brown)
				emissive: 0x4a2c1a, // Dark brown emissive for slight glow
				emissiveIntensity: 0.9,
			});
			_extractionZoneMesh = new THREE.Mesh(geometry, material);
			_extractionZoneMesh.position.set(_extractionZone.x, doorHeight / 2, _extractionZone.z);
			_extractionZoneMesh.rotation.y = Math.PI / 4; // Rotate 45 degrees to the right
			_scene.add(_extractionZoneMesh);

			// Add a pulsing animation effect (subtle)
			_extractionZoneMesh.userData.pulsePhase = 0;

			console.log("[MetalGear3D] Extraction zone (door) created at:", _extractionZone.x, _extractionZone.z);
		}

		function _createSilverTrunk() {
			if (!window.THREE || !_scene) return;
			const THREE = window.THREE;

			_silverTrunk = { x: 12, z: 12, radius: 2, opened: false };
			const trunkW = 1.8;
			const trunkH = 1.2;
			const trunkD = 1.2;
			const geometry = new THREE.BoxGeometry(trunkW, trunkH, trunkD);
			const material = new THREE.MeshStandardMaterial({
				color: 0xc0c0c0,
				emissive: 0x808080,
				emissiveIntensity: 0.4,
			});
			_silverTrunkMesh = new THREE.Mesh(geometry, material);
			_silverTrunkMesh.position.set(_silverTrunk.x, trunkH / 2, _silverTrunk.z);
			_silverTrunkMesh.rotation.y = Math.PI / 4;
			_scene.add(_silverTrunkMesh);
		}

		function _createCenterTrunk() {
			if (!window.THREE || !_scene) return;
			const THREE = window.THREE;

			_centerTrunk = { x: 0, z: 0, radius: 2, opened: false };
			const trunkW = 1.8;
			const trunkH = 1.2;
			const trunkD = 1.2;
			const geometry = new THREE.BoxGeometry(trunkW, trunkH, trunkD);
			const material = new THREE.MeshStandardMaterial({
				color: 0x8b4513,
				emissive: 0x4a2c1a,
				emissiveIntensity: 0.4,
			});
			_centerTrunkMesh = new THREE.Mesh(geometry, material);
			_centerTrunkMesh.position.set(_centerTrunk.x, trunkH / 2, _centerTrunk.z);
			_centerTrunkMesh.rotation.y = Math.PI / 4;
			_scene.add(_centerTrunkMesh);
		}

		function _spawnEnemyFromTrunk(x, z) {
			if (!window.THREE || !_scene) return;
			const THREE = window.THREE;

			const devilGroup = new THREE.Group();
			const guardMaterial = new THREE.MeshStandardMaterial({
				color: COLORS.guard,
				emissive: COLORS.guard,
				emissiveIntensity: 0.5,
			});

			const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.4, 1.0, 8);
			const bodyMesh = new THREE.Mesh(bodyGeometry, guardMaterial);
			bodyMesh.position.set(0, 0.5, 0);
			devilGroup.add(bodyMesh);

			const headGeometry = new THREE.SphereGeometry(0.2, 8, 8);
			const headMesh = new THREE.Mesh(headGeometry, guardMaterial);
			headMesh.position.set(0, 1.1, 0);
			devilGroup.add(headMesh);

			const hornGeometry = new THREE.ConeGeometry(0.08, 0.5, 6);
			const leftHornMesh = new THREE.Mesh(hornGeometry, guardMaterial);
			leftHornMesh.position.set(-0.12, 1.3, 0);
			leftHornMesh.rotation.z = -0.3;
			devilGroup.add(leftHornMesh);
			const rightHornMesh = new THREE.Mesh(hornGeometry, guardMaterial);
			rightHornMesh.position.set(0.12, 1.3, 0);
			rightHornMesh.rotation.z = 0.3;
			devilGroup.add(rightHornMesh);

			const tailGeometry = new THREE.CylinderGeometry(0.06, 0.08, 0.4, 6);
			const tailMesh = new THREE.Mesh(tailGeometry, guardMaterial);
			tailMesh.position.set(0, 0.2, -0.3);
			tailMesh.rotation.x = Math.PI / 6;
			devilGroup.add(tailMesh);

			devilGroup.position.set(x, 0.75, z);
			_scene.add(devilGroup);

			_guards.push({
				x,
				z,
				waypoints: [{ x, z }],
				waypointIndex: 0,
				facing: 0,
				alertLevel: 0,
			});
			_guardMeshes.push(devilGroup);
		}

		// =========================================
		// COLLISION & DETECTION
		// =========================================

		function _checkWallCollision(x, z, radius = 0.5) {
			for (const wall of _walls) {
				// AABB collision
				if (
					x + radius > wall.x &&
					x - radius < wall.x + wall.w &&
					z + radius > wall.z &&
					z - radius < wall.z + wall.h
				) {
					return true;
				}
			}
			return false;
		}

		function _checkLineOfSight(guardX, guardZ, targetX, targetZ) {
			// Simple 2D line-of-sight check
			const dx = targetX - guardX;
			const dz = targetZ - guardZ;
			const dist = Math.sqrt(dx * dx + dz * dz);
			const steps = Math.ceil(dist * 2);

			for (let i = 1; i < steps; i++) {
				const t = i / steps;
				const checkX = guardX + dx * t;
				const checkZ = guardZ + dz * t;

				if (_checkWallCollision(checkX, checkZ, 0.3)) {
					return false;
				}
			}
			return true;
		}

		function _checkGuardVision(guard, guardIndex) {
			const dx = _playerPos.x - guard.x;
			const dz = _playerPos.z - guard.z;
			const dist = Math.sqrt(dx * dx + dz * dz);

			// Range check
			if (dist > VISION_RANGE) return false;

			// Angle check (vision cone)
			const angleToPlayer = Math.atan2(dx, dz);
			const angleDiff = Math.abs(angleToPlayer - guard.facing);
			const normalizedAngle = Math.abs(((angleDiff + Math.PI) % (2 * Math.PI)) - Math.PI);

			if (normalizedAngle > (VISION_ANGLE_DEG * Math.PI) / 180 / 2) {
				return false;
			}

			// Line of sight check
			return _checkLineOfSight(guard.x, guard.z, _playerPos.x, _playerPos.z);
		}

		// =========================================
		// INPUT
		// =========================================

		function _handleKeyDown(e) {
			if (_isPaused || _isGameOver || _isVictory) return;

			_keys[e.code] = true;

			// Debug skip (score 0 so overlay shows 0000)
			if (e.code === "NumpadMultiply" || (e.code === "Digit8" && e.shiftKey)) {
				_debugSkip = true;
				_triggerWin();
				e.preventDefault();
			}

			if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight"].includes(e.code)) {
				e.preventDefault();
			}
		}

		function _handleKeyUp(e) {
			_keys[e.code] = false;
		}

		// =========================================
		// GAMEPLAY
		// =========================================

		function _updatePlayer(dt) {
			let dx = 0;
			let dz = 0;

			if (_keys["ArrowLeft"] || _keys["KeyA"]) dx -= 1;
			if (_keys["ArrowRight"] || _keys["KeyD"]) dx += 1;
			if (_keys["ArrowUp"] || _keys["KeyW"]) dz -= 1;
			if (_keys["ArrowDown"] || _keys["KeyS"]) dz += 1;

			// Normalize diagonal
			if (dx !== 0 && dz !== 0) {
				dx *= 0.707;
				dz *= 0.707;
			}

			const running = _keys["ShiftLeft"] || _keys["ShiftRight"];
			const speed = PLAYER_SPEED * (running ? RUN_MULTIPLIER : 1) * (dt / 1000);

			const newX = _playerPos.x + dx * speed;
			const newZ = _playerPos.z + dz * speed;

			// Wall collision
			if (!_checkWallCollision(newX, _playerPos.z, 0.4)) {
				_playerPos.x = newX;
			}
			if (!_checkWallCollision(_playerPos.x, newZ, 0.4)) {
				_playerPos.z = newZ;
			}

			// Clamp to map bounds
			_playerPos.x = Math.max(MAP_MIN + 1, Math.min(MAP_MAX - 1, _playerPos.x));
			_playerPos.z = Math.max(MAP_MIN + 1, Math.min(MAP_MAX - 1, _playerPos.z));

			// Update mesh
			if (_playerMesh) {
				_playerMesh.position.set(_playerPos.x, _playerPos.y, _playerPos.z);
			}

			// Camera follow (lerp)
			_cameraTarget.x += (_playerPos.x - _cameraTarget.x) * 0.1;
			_cameraTarget.z += (_playerPos.z - _cameraTarget.z) * 0.1;

			// Interact
			if (_keys["Space"]) {
				_tryInteract();
			}
		}

		function _tryInteract() {
			const now = performance.now();
			if (now - _lastInteractTime < INTERACT_COOLDOWN) return;
			_lastInteractTime = now;

			// Golden key pickup (same position as before)
			if (!_hasGoldenKey && _keycard) {
				const dx = _playerPos.x - _keycard.x;
				const dz = _playerPos.z - _keycard.z;
				const dist = Math.sqrt(dx * dx + dz * dz);
				if (dist < 1.5) {
					_hasGoldenKey = true;
					_objective = "EXTRACT";
					if (_keycardMesh) {
						_scene.remove(_keycardMesh);
						_keycardMesh = null;
					}
					_createSilverKeycard();
					_updateHUD();
				}
			}

			// Silver key pickup (appears in bottom left after golden key collected)
			if (_hasGoldenKey && !_hasSilverKey && _silverKeycard) {
				const dx = _playerPos.x - _silverKeycard.x;
				const dz = _playerPos.z - _silverKeycard.z;
				const dist = Math.sqrt(dx * dx + dz * dz);
				if (dist < 1.5) {
					_hasSilverKey = true;
					_objective = "OPEN SILVER TRUNK";
					if (_silverKeycardMesh) {
						_scene.remove(_silverKeycardMesh);
						_silverKeycardMesh = null;
					}
					_createSilverTrunk();
					_createCenterTrunk();
					_updateHUD();
				}
			}

			// Center trunk - opens to release an enemy!
			if (_hasSilverKey && _centerTrunk && !_centerTrunk.opened) {
				const dx = _playerPos.x - _centerTrunk.x;
				const dz = _playerPos.z - _centerTrunk.z;
				const dist = Math.sqrt(dx * dx + dz * dz);
				if (dist < _centerTrunk.radius) {
					_centerTrunk.opened = true;
					_spawnEnemyFromTrunk(_centerTrunk.x, _centerTrunk.z);
					if (_centerTrunkMesh) {
						_scene.remove(_centerTrunkMesh);
						_centerTrunkMesh = null;
					}
					_updateHUD();
				}
			}

			// Brown door - only with golden key
			if (_hasGoldenKey && _extractionZone) {
				const dx = _playerPos.x - _extractionZone.x;
				const dz = _playerPos.z - _extractionZone.z;
				const dist = Math.sqrt(dx * dx + dz * dz);
				if (dist < _extractionZone.radius) {
					_triggerWin();
				}
			}

			// Silver trunk - only with silver key
			if (_hasSilverKey && _silverTrunk && !_silverTrunk.opened) {
				const dx = _playerPos.x - _silverTrunk.x;
				const dz = _playerPos.z - _silverTrunk.z;
				const dist = Math.sqrt(dx * dx + dz * dz);
				if (dist < _silverTrunk.radius) {
					_silverTrunk.opened = true;
					_acornCollected = true;
					if (typeof StateManager !== "undefined" && StateManager.collectItem) {
						const lvl = StateManager.getCurrentLevel ? StateManager.getCurrentLevel() : 8;
						StateManager.collectItem({ eraKey: "era3", level: lvl, itemId: "acorn" });
					}
					if (window.THREE && _camera) {
						const v = new window.THREE.Vector3(_silverTrunk.x, 0.6, _silverTrunk.z);
						v.project(_camera);
						const sx = ((v.x + 1) / 2) * _canvas2D.width;
						const sy = ((-v.y + 1) / 2) * _canvas2D.height;
						_triggerAcornCollectAnim(sx, sy);
					} else {
						_triggerAcornCollectAnim(_canvas2D.width / 2, _canvas2D.height / 2);
					}
					if (_silverTrunkMesh) {
						_scene.remove(_silverTrunkMesh);
						_silverTrunkMesh = null;
					}
					_updateHUD();
				}
			}
		}

		function _lerpHex(a, b, t) {
			const ar = (a >> 16) & 0xff;
			const ag = (a >> 8) & 0xff;
			const ab = a & 0xff;
			const br = (b >> 16) & 0xff;
			const bg = (b >> 8) & 0xff;
			const bb = b & 0xff;
			const r = Math.round(ar + (br - ar) * t);
			const g = Math.round(ag + (bg - ag) * t);
			const bl = Math.round(ab + (bb - ab) * t);
			return (r << 16) | (g << 8) | bl;
		}

		function _triggerAcornCollectAnim(fromX, fromY) {
			_acornCollectAnim = {
				fromX,
				fromY,
				toX: 80,
				toY: 45,
				startMs: performance.now(),
				durationMs: 1100,
				active: true,
			};
			_spawnSparkleBurst(fromX, fromY, 28);
			_foundTextLeftMs = 500;
		}

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
				}
			}
			if (_foundTextLeftMs > 0) _foundTextLeftMs = Math.max(0, _foundTextLeftMs - dtMs);
		}
		function _renderSparkles() {
			if (!_sparkles.length) return;
			for (let i = 0; i < _sparkles.length; i++) {
				const p = _sparkles[i];
				const a = _clampV(p.lifeMs / p.maxLifeMs, 0, 1);
				_ctx2D.save();
				_ctx2D.globalAlpha = Math.min(1, a);
				_ctx2D.fillStyle = p.color;
				const px = Math.round(p.x);
				const py = Math.round(p.y);
				const s = p.size;
				_ctx2D.fillRect(px, py, 1 * s, 1 * s);
				_ctx2D.fillRect(px - 1 * s, py, 1 * s, 1 * s);
				_ctx2D.fillRect(px + 1 * s, py, 1 * s, 1 * s);
				_ctx2D.fillRect(px, py - 1 * s, 1 * s, 1 * s);
				_ctx2D.fillRect(px, py + 1 * s, 1 * s, 1 * s);
				_ctx2D.restore();
			}
		}
		function _renderAcornCollectAnim() {
			if (!_acornCollectAnim || !_acornCollectAnim.active) return;
			const elapsed = performance.now() - _acornCollectAnim.startMs;
			const duration = _acornCollectAnim.durationMs;
			const phaseA = 350;
			const phaseB = duration - phaseA;
			let x = _acornCollectAnim.fromX;
			let y = _acornCollectAnim.fromY;
			let scale = 1;
			let alpha = 1;
			if (elapsed <= phaseA) {
				const t = _clampV(elapsed / phaseA, 0, 1);
				scale = 0.6 + (1.15 - 0.6) * _easeOutElastic(t);
			} else {
				const t = _clampV((elapsed - phaseA) / phaseB, 0, 1);
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
				const t = _clampV(_foundTextLeftMs / 400, 0, 1);
				_ctx2D.save();
				_ctx2D.globalAlpha = Math.min(1, t);
				CanvasRenderer.drawText("FOUND 🌰!", _acornCollectAnim.fromX, _acornCollectAnim.fromY + 54, {
					color: "#f4f1de",
					size: 16,
					align: "center",
				});
				_ctx2D.restore();
			}
		}

		function _updateGuards(dt) {
			const dtS = dt / 1000;

			_guards.forEach((guard, i) => {
				const mesh = _guardMeshes[i];
				if (!mesh) return;

				// Follow player instead of patrolling
				const dx = _playerPos.x - guard.x;
				const dz = _playerPos.z - guard.z;
				const dist = Math.sqrt(dx * dx + dz * dz);

				if (dist > 0.3) {
					// Move toward player
					const speed = GUARD_SPEED * dtS;
					const moveX = guard.x + (dx / dist) * speed;
					const moveZ = guard.z + (dz / dist) * speed;

					// Check wall collision before moving
					if (!_checkWallCollision(moveX, guard.z, 0.5)) {
						guard.x = moveX;
					}
					if (!_checkWallCollision(guard.x, moveZ, 0.5)) {
						guard.z = moveZ;
					}

					// Face the player
					guard.facing = Math.atan2(dx, dz);
				}

				// Update mesh
				mesh.position.set(guard.x, 0.75, guard.z);
				mesh.rotation.y = guard.facing;

				// Vision check
				if (_checkGuardVision(guard, i)) {
					guard.alertLevel = Math.min(100, guard.alertLevel + ALERT_RISE_PER_SEC * dtS);
				} else {
					guard.alertLevel = Math.max(0, guard.alertLevel - ALERT_DECAY_PER_SEC * dtS);
				}
			});

			// Update global alert (max of all guards)
			_alert = Math.max(..._guards.map((g) => g.alertLevel), 0);

			if (_alert >= 100) {
				_triggerGameOver();
			}
		}

		function _updateCamera(dt) {
			if (!_camera) return;

			// Smooth follow player position (keep Y constant for tilted view)
			// Camera maintains its angle but follows player X/Z
			const targetX = _playerPos.x;
			const targetZ = _playerPos.z + 15; // Offset Z to maintain viewing angle (camera behind player)
			_camera.position.x += (targetX - _camera.position.x) * 0.05;
			_camera.position.z += (targetZ - _camera.position.z) * 0.05;
			// Keep Y constant for consistent viewing angle
			_camera.position.y = 20;

			// Look at player position
			_camera.lookAt(_playerPos.x, 0, _playerPos.z);
		}

		// =========================================
		// GAME END
		// =========================================

		function _triggerGameOver() {
			console.log("[MetalGear3D] Game Over - Alert!");
			_isGameOver = true;

			_restartTimeout = setTimeout(() => {
				if (_isGameOver) {
					console.log("[MetalGear3D] Auto-restarting...");
					_resetGame();
					_isRunning = true;
					_gameStartTime = performance.now();
					_lastTime = performance.now();
					_gameLoop();
				}
			}, 2500);
		}

		function _triggerWin() {
			console.log("[MetalGear3D] Mission Complete!");
			_isVictory = true;
			_isRunning = false;

			const skip = _debugSkip;
			_debugSkip = false;
			const score = skip ? 0 : Math.floor(10000 - _alert * 50);
			const time = skip ? 0 : performance.now() - _gameStartTime;

			setTimeout(() => {
				EventBus.emit(EventBus.Events.MINIGAME_END, {
					success: true,
					score,
					alert: _alert,
					time,
				});
			}, 900);
		}

		// =========================================
		// GAME LOOP
		// =========================================

		function start() {
			console.log("[MetalGear3D] Starting game...");
			console.log(
				"[MetalGear3D] THREE available:",
				!!window.THREE,
				"Scene:",
				!!_scene,
				"Renderer:",
				!!_renderer,
				"Camera:",
				!!_camera
			);

			// Start game loop immediately (will show loading screen)
			_isRunning = true;
			_isPaused = false;
			_gameStartTime = performance.now();
			_lastTime = performance.now();

			window.addEventListener("keydown", _handleKeyDown);
			window.addEventListener("keyup", _handleKeyUp);

			// Start game loop (will render loading if Three.js not ready)
			_gameLoop();

			// Wait for initialization if not complete
			if (!window.THREE || !_scene || !_renderer || !_camera) {
				console.log("[MetalGear3D] Three.js not ready, waiting for initialization...");
				console.log(
					"[MetalGear3D] Status - THREE:",
					!!window.THREE,
					"Scene:",
					!!_scene,
					"Renderer:",
					!!_renderer,
					"Camera:",
					!!_camera
				);

				// If init() is still running, wait for it
				if (_isInitializing && _initPromise) {
					console.log("[MetalGear3D] Waiting for init() to complete...");
					_initPromise
						.then(() => {
							console.log("[MetalGear3D] Init complete, game should be ready");
						})
						.catch((err) => {
							console.error("[MetalGear3D] Init failed:", err);
						});
				} else {
					// Init() might not have been called, or it failed - try to initialize now
					console.log("[MetalGear3D] Init not in progress, starting initialization...");
					init()
						.then(() => {
							console.log("[MetalGear3D] Initialization complete from start()");
						})
						.catch((err) => {
							console.error("[MetalGear3D] Initialization failed from start():", err);
						});
				}
			} else {
				console.log("[MetalGear3D] Three.js already initialized");
			}
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
			// Don't update if Three.js not ready
			if (!window.THREE || !_scene || !_playerMesh) {
				return;
			}

			const elapsed = (performance.now() - _gameStartTime) / 1000;

			// Time limit check
			if (TIME_LIMIT > 0 && elapsed >= TIME_LIMIT) {
				_triggerGameOver();
				return;
			}

			_updatePlayer(dt);
			_updateGuards(dt);
			_updateCamera(dt);

			// Rotate golden key if not collected
			if (_keycardMesh && !_hasGoldenKey) {
				_keycardMesh.rotation.y += 0.02;
			}
			// Rotate silver key if visible and not collected
			if (_silverKeycardMesh && !_hasSilverKey) {
				_silverKeycardMesh.rotation.y += 0.02;
			}

			// Animate extraction zone (subtle pulsing glow)
			if (_extractionZoneMesh) {
				_extractionZoneMesh.userData.pulsePhase = (_extractionZoneMesh.userData.pulsePhase || 0) + dt * 0.002; // Slow pulse
				const pulse = Math.sin(_extractionZoneMesh.userData.pulsePhase) * 0.1 + 0.3;
				_extractionZoneMesh.material.emissiveIntensity = pulse;
			}

			_updateAcornCollectEffects(dt);
			_updateHUD();
		}

		function _updateHUD() {
			StateManager.updateLevelData({
				alert: Math.floor(_alert),
				objective: _objective,
				hasKeycard: _hasGoldenKey,
				timeLeft: Math.max(0, TIME_LIMIT - (performance.now() - _gameStartTime) / 1000),
				score: Math.floor(10000 - _alert * 50),
			});
		}

		// =========================================
		// RENDERING
		// =========================================

		function _render() {
			// Render 3D scene
			const hasAll = _renderer && _scene && _camera && window.THREE;

			// Debug: log render state (only once)
			if (!_renderLogShown) {
				console.log(
					"[MetalGear3D] Render check - THREE:",
					!!window.THREE,
					"Scene:",
					!!_scene,
					"Renderer:",
					!!_renderer,
					"Camera:",
					!!_camera,
					"HasAll:",
					hasAll
				);
				_renderLogShown = true;
			}

			if (hasAll) {
				try {
					// Clear and render the 3D scene (ensures background is drawn)
					_renderer.clear();
					_renderer.render(_scene, _camera);
					// Render 2D overlay (HUD, letterbox, etc.) - transparent so 3D shows through
					_render2DOverlay();
				} catch (error) {
					console.error("[MetalGear3D] Render error:", error);
					_renderLoading();
					_render2DOverlay();
				}
			} else {
				// Still loading - show loading screen
				_renderLoading();
				_render2DOverlay();
			}
		}

		function _render2DOverlay() {
			// Clear 2D canvas with transparent to show 3D scene behind
			// Only draw HUD elements, not a full black background
			_ctx2D.clearRect(0, 0, _canvas2D.width, _canvas2D.height);

			// Minimal letterbox (removed full black bars to avoid covering game area)
			const letterboxHeight = 0;

			// If game not initialized, only show letterbox
			if (!window.THREE || !_scene || !_renderer || !_camera) {
				return;
			}

			// HUD - Alert bar (left)
			const alertBarX = 20;
			const alertBarY = letterboxHeight + 20;
			const alertBarW = 200;
			const alertBarH = 20;

			CanvasRenderer.drawText("ALERT", alertBarX, alertBarY, {
				color: "#ff4444",
				size: 10,
				align: "left",
			});

			// Alert bar background
			CanvasRenderer.drawRect(alertBarX, alertBarY + 16, alertBarW, alertBarH, "#333333");

			// Alert bar fill
			const alertFill = (_alert / 100) * alertBarW;
			const alertColor = _alert < 50 ? "#ffaa00" : "#ff0000";
			CanvasRenderer.drawRect(alertBarX, alertBarY + 16, alertFill, alertBarH, alertColor);

			// Alert percentage
			CanvasRenderer.drawText(`${Math.floor(_alert)}%`, alertBarX + alertBarW + 10, alertBarY + 18, {
				color: alertColor,
				size: 12,
				align: "left",
			});

			// Keys status
			CanvasRenderer.drawText("GOLD KEY", alertBarX, alertBarY + 50, {
				color: "#888888",
				size: 10,
				align: "left",
			});
			CanvasRenderer.drawText(_hasGoldenKey ? "YES" : "NO", alertBarX, alertBarY + 66, {
				color: _hasGoldenKey ? "#00ff00" : "#ff0000",
				size: 14,
				align: "left",
			});
			CanvasRenderer.drawText("SILVER KEY", alertBarX, alertBarY + 90, {
				color: "#888888",
				size: 10,
				align: "left",
			});
			CanvasRenderer.drawText(_hasSilverKey ? "YES" : "NO", alertBarX, alertBarY + 106, {
				color: _hasSilverKey ? "#00ff00" : "#ff0000",
				size: 14,
				align: "left",
			});

			// Objective (right)
			const objX = _canvas2D.width - 20;
			CanvasRenderer.drawText("OBJECTIVE", objX, alertBarY, {
				color: "#888888",
				size: 10,
				align: "right",
			});
			CanvasRenderer.drawText(_objective, objX, alertBarY + 16, {
				color: "#f2c14e",
				size: 12,
				align: "right",
			});

			// Mini radar (top-right)
			const radarX = _canvas2D.width - 120;
			const radarY = letterboxHeight + 20;
			const radarSize = 100;
			const radarScale = radarSize / MAP_SIZE;

			// Radar background
			CanvasRenderer.drawRect(radarX, radarY, radarSize, radarSize, "#000000");
			CanvasRenderer.drawRectOutline(radarX, radarY, radarSize, radarSize, "#00ff00", 2);

			// Radar center (map center at 0,0)
			const centerX = radarX + radarSize / 2;
			const centerY = radarY + radarSize / 2;

			// Draw walls on radar (simplified)
			_ctx2D.strokeStyle = "#444444";
			_ctx2D.lineWidth = 1;
			_walls.forEach((wall) => {
				// Convert world coords to radar coords (0,0 is center of map)
				const sx = centerX + wall.x * radarScale;
				const sy = centerY + wall.z * radarScale;
				_ctx2D.strokeRect(sx, sy, wall.w * radarScale, wall.h * radarScale);
			});

			// Player dot (0,0 is center of radar)
			const playerRadarX = centerX + _playerPos.x * radarScale;
			const playerRadarY = centerY + _playerPos.z * radarScale;
			CanvasRenderer.drawCircle(playerRadarX, playerRadarY, 3, "#4a9fff");

			// Guard dots
			_guards.forEach((guard) => {
				const guardRadarX = centerX + guard.x * radarScale;
				const guardRadarY = centerY + guard.z * radarScale;
				CanvasRenderer.drawCircle(guardRadarX, guardRadarY, 2, "#ff4444");
			});

			// Golden key dot (if not collected)
			if (!_hasGoldenKey && _keycard) {
				const keyRadarX = centerX + _keycard.x * radarScale;
				const keyRadarY = centerY + _keycard.z * radarScale;
				CanvasRenderer.drawCircle(keyRadarX, keyRadarY, 2, "#f2c14e");
			}
			// Silver key dot (if visible and not collected)
			if (_hasGoldenKey && !_hasSilverKey && _silverKeycard) {
				const silverRadarX = centerX + _silverKeycard.x * radarScale;
				const silverRadarY = centerY + _silverKeycard.z * radarScale;
				CanvasRenderer.drawCircle(silverRadarX, silverRadarY, 2, "#c0c0c0");
			}
			// Silver trunk (if visible)
			if (_silverTrunk && !_silverTrunk.opened) {
				const trunkRadarX = centerX + _silverTrunk.x * radarScale;
				const trunkRadarY = centerY + _silverTrunk.z * radarScale;
				CanvasRenderer.drawCircle(trunkRadarX, trunkRadarY, _silverTrunk.radius * radarScale, "#c0c0c0");
			}
			// Center trunk (if visible)
			if (_centerTrunk && !_centerTrunk.opened) {
				const centerTrunkRadarX = centerX + _centerTrunk.x * radarScale;
				const centerTrunkRadarY = centerY + _centerTrunk.z * radarScale;
				CanvasRenderer.drawCircle(
					centerTrunkRadarX,
					centerTrunkRadarY,
					_centerTrunk.radius * radarScale,
					"#8b4513"
				);
			}

			// Extraction zone
			if (_extractionZone) {
				const extRadarX = centerX + _extractionZone.x * radarScale;
				const extRadarY = centerY + _extractionZone.z * radarScale;
				CanvasRenderer.drawCircle(extRadarX, extRadarY, _extractionZone.radius * radarScale, "#00ff00");
			}

			// Acorn collect animation + sparkles
			_renderSparkles();
			_renderAcornCollectAnim();

			// Controls hint
			const hintX = _canvas2D.width / 2 + 30;
			const hintY = 50;
			CanvasRenderer.drawText("ARROWS: MOVE", hintX, hintY, {
				color: "#888888",
				size: 8,
				align: "right",
			});
			// Draw symbol larger and bold with system font (supports Unicode), then rest of text
			const oldFont = _ctx2D.font;
			const oldFillStyle = _ctx2D.fillStyle;
			const oldAlign = _ctx2D.textAlign;
			const oldBaseline = _ctx2D.textBaseline;

			_ctx2D.font = "bold 16px Arial, sans-serif";
			_ctx2D.fillStyle = "#888888";
			_ctx2D.textAlign = "right";
			_ctx2D.textBaseline = "top";
			_ctx2D.fillText("△", hintX - 90, hintY + 10);

			_ctx2D.font = oldFont;
			_ctx2D.fillStyle = oldFillStyle;
			_ctx2D.textAlign = oldAlign;
			_ctx2D.textBaseline = oldBaseline;

			CanvasRenderer.drawText(" /SHIFT: RUN", hintX, hintY + 14, {
				color: "#888888",
				size: 8,
				align: "right",
			});

			_ctx2D.font = "bold 20px Arial, sans-serif";
			_ctx2D.fillStyle = "#888888";
			_ctx2D.textAlign = "right";
			_ctx2D.textBaseline = "top";
			_ctx2D.fillText("○", hintX - 130, hintY + 20);

			_ctx2D.font = oldFont;
			_ctx2D.fillStyle = oldFillStyle;
			_ctx2D.textAlign = oldAlign;
			_ctx2D.textBaseline = oldBaseline;

			CanvasRenderer.drawText(" /SPACE: INTERACT", hintX, hintY + 28, {
				color: "#888888",
				size: 8,
				align: "right",
			});

			// Game over overlay
			if (_isGameOver) {
				CanvasRenderer.fade(0.8);
				CanvasRenderer.drawText("ALERT!", _canvas2D.width / 2, _canvas2D.height / 2 - 40, {
					color: "#ff0000",
					size: 32,
					align: "center",
				});
				CanvasRenderer.drawText("MISSION FAILED", _canvas2D.width / 2, _canvas2D.height / 2, {
					color: "#ffffff",
					size: 20,
					align: "center",
				});
			}

			// Victory overlay
			if (_isVictory) {
				CanvasRenderer.fade(0.5);
				CanvasRenderer.drawText("MISSION COMPLETE", _canvas2D.width / 2, _canvas2D.height / 2, {
					color: "#00ff00",
					size: 24,
					align: "center",
				});
			}

			// Pause overlay
			if (_isPaused) {
				CanvasRenderer.fade(0.5);
				CanvasRenderer.drawText("PAUSED", _canvas2D.width / 2, _canvas2D.height / 2, {
					color: "#f2c14e",
					size: 24,
					align: "center",
				});
			}
		}

		// =========================================
		// LIFECYCLE
		// =========================================

		function pause() {
			console.log("[MetalGear3D] Paused");
			_isPaused = true;
		}

		function resume() {
			console.log("[MetalGear3D] Resumed");
			_isPaused = false;
			_lastTime = performance.now();
		}

		function stop() {
			console.log("[MetalGear3D] Stopped");
			_isRunning = false;
			_isGameOver = false;

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
			console.log("[MetalGear3D] Destroyed");
			stop();

			// Clean up Three.js
			if (_renderer) {
				_renderer.dispose();
				_renderer = null;
			}

			_clearScene();
			_scene = null;
			_camera = null;
			_clock = null;

			// Remove WebGL canvas
			if (_webglCanvas && _webglCanvas.parentNode) {
				_webglCanvas.parentNode.removeChild(_webglCanvas);
			}
			_webglCanvas = null;
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
				alert: _alert,
				hasGoldenKey: _hasGoldenKey,
				hasSilverKey: _hasSilverKey,
				objective: _objective,
			}),
		};
	}

	// =========================================
	// REGISTER GAME
	// =========================================

	try {
		if (typeof GameLoader !== "undefined" && GameLoader.registerGame) {
			GameLoader.registerGame("metal-gear-3d", createMetalGear3DGame);
			console.log("[MetalGear3D] Game module loaded and registered");
		} else {
			console.error("[MetalGear3D] GameLoader not available!");
		}
	} catch (error) {
		console.error("[MetalGear3D] Failed to register game:", error);
	}
})();
