/**
 * app.js
 * Main application entry point
 * Initializes all modules and starts the game
 */

const App = (function () {
	"use strict";

	// Debug mode flag
	const DEBUG = true;

	// Rotate gate (mobile portrait blocker)
	let _rotateGate = {
		overlay: null,
		pausedByGate: false,
		fullscreenRequested: false,
	};

	// =========================================
	// INITIALIZATION
	// =========================================

	/**
	 * Initialize the application
	 */
	async function init() {
		console.log("========================================");
		console.log("  DECADE - 10 Years Together (2016-2026)");
		console.log("========================================");
		console.log("[App] Initializing...");

		// Enable debug events if in debug mode
		window.DEBUG_EVENTS = DEBUG;

		try {
			// Initialize core modules (order matters!)
			Storage.isAvailable(); // Check storage availability

			// User-requested: wipe auth/progress keys on every refresh/start
			if (typeof Storage !== "undefined" && typeof Storage.clearBootKeys === "function") {
				Storage.clearBootKeys();
			}
			StateManager.init();
			Input.init();

			// Initialize canvas renderer
			CanvasRenderer.init("game-canvas");
			if (typeof CanvasRenderer.resizeToContainer === "function") {
				CanvasRenderer.resizeToContainer("#canvas-container");
			} else {
				console.warn(
					"[App] CanvasRenderer.resizeToContainer not available; skipping resize. Update canvas-renderer.js if layout is broken."
				);
			}

			// Show loading screen while preloading assets
			CanvasRenderer.drawLoadingScreen("LOADING SPRITES...", 20);

			// Preload sprite sheets (async, but don't block if fails)
			console.log("[App] Preloading sprite sheets...");
			await TimelineSpriteController.preloadSprites().catch((err) => {
				console.warn("[App] Sprite preload warning:", err);
			});

			CanvasRenderer.drawLoadingScreen("INITIALIZING...", 60);

			// Initialize game loader
			GameLoader.init();

			// Initialize UI controllers
			HudController.init();
			TimelineController.init();

			// Initialize timeline sprite controller (after TimelineController)
			TimelineSpriteController.init();

			OverlayController.init();
			VirtualController.init();
			_setupOrientationGate();
			_setupFullscreenOnStart();

			// Initialize level manager (depends on UI controllers)
			LevelManager.init();

			// Setup global input handlers
			_setupGlobalInput();

			// Resize canvas on viewport change
			_setupResize();

			// Display loading complete
			CanvasRenderer.drawLoadingScreen("READY", 100);

			// Show title screen
			OverlayController.showTitle();

			console.log("[App] Initialization complete");
			console.log("[App] Press START to begin");

			// Debug: expose modules globally
			if (DEBUG) {
				window.DECADE = {
					App,
					EventBus,
					Input,
					VirtualController,
					Storage,
					StateManager,
					LevelManager,
					GameLoader,
					CanvasRenderer,
					HudController,
					TimelineController,
					TimelineSpriteController,
					OverlayController,
					LevelConfig,
				};
				console.log("[Debug] Modules exposed on window.DECADE");
			}
		} catch (error) {
			console.error("[App] Initialization failed:", error);
			_showError("Failed to initialize game");
		}
	}

	// =========================================
	// GLOBAL INPUT
	// =========================================

	/**
	 * Setup resize / orientation handling for canvas and mobile layout
	 * @private
	 */
	function _setupResize() {
		function onResize() {
			if (typeof CanvasRenderer !== "undefined" && typeof CanvasRenderer.resizeToContainer === "function") {
				CanvasRenderer.resizeToContainer("#canvas-container");
			}
			_vcResize();
			_applyOrientationGate();
		}
		window.addEventListener("resize", onResize);
		window.addEventListener("orientationchange", onResize);
	}

	function _vcResize() {
		if (typeof VirtualController !== "undefined" && VirtualController.onResize) {
			VirtualController.onResize();
		}
	}

	// =========================================
	// ORIENTATION GATE (mobile portrait overlay)
	// =========================================

	function _isMobileDevice() {
		return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;
	}

	function _isLandscapeOrientation() {
		return window.matchMedia("(orientation: landscape)").matches || window.innerWidth > window.innerHeight;
	}

	function _isFullscreen() {
		return !!(
			document.fullscreenElement ||
			document.webkitFullscreenElement ||
			document.mozFullScreenElement ||
			document.msFullscreenElement
		);
	}

	async function _requestFullscreen() {
		if (_isFullscreen()) return;

		const elem = document.documentElement;

		try {
			// Chrome/Edge: Try standard first, then webkit
			if (elem.requestFullscreen) {
				await elem.requestFullscreen();
			} else if (elem.webkitRequestFullscreen) {
				await elem.webkitRequestFullscreen();
			} else if (elem.mozRequestFullScreen) {
				await elem.mozRequestFullScreen();
			} else if (elem.msRequestFullscreen) {
				await elem.msRequestFullscreen();
			} else {
				console.warn("[App] Fullscreen API not supported");
			}
		} catch (err) {
			console.warn("[App] Fullscreen request failed:", err.message || err);
		}
	}

	function _requestFullscreenSync() {
		if (_isFullscreen()) return;

		// Try documentElement first, then body (Chrome sometimes prefers body)
		const elems = [document.documentElement, document.body];

		for (const elem of elems) {
			try {
				// Chrome: Try standard API with options
				if (elem.requestFullscreen) {
					const promise = elem.requestFullscreen({ navigationUI: "hide" });
					if (promise) {
						promise.catch((err) => {
							console.warn("[App] requestFullscreen failed:", err.message || err);
						});
						return;
					}
				}
				// Chrome: Try webkit prefix (older Chrome versions)
				if (elem.webkitRequestFullscreen) {
					elem.webkitRequestFullscreen();
					return;
				}
				// Firefox
				if (elem.mozRequestFullScreen) {
					elem.mozRequestFullScreen();
					return;
				}
				// IE/Edge
				if (elem.msRequestFullscreen) {
					elem.msRequestFullscreen();
					return;
				}
			} catch (err) {
				console.warn("[App] Fullscreen request failed for element:", err.message || err);
				continue;
			}
		}

		console.warn("[App] Fullscreen API not available");
	}

	function _setupOrientationGate() {
		_rotateGate.overlay = document.getElementById("rotate-overlay");
		const btnTry = document.getElementById("rotate-try");

		if (btnTry) {
			btnTry.addEventListener("click", async () => {
				try {
					if (screen.orientation && screen.orientation.lock) {
						await screen.orientation.lock("landscape");
					}
				} catch (_) {
					// iOS and some browsers disallow; ignore silently
				}

				// Request fullscreen on user gesture (required by browsers)
				// Use sync version to ensure it's called directly from the click handler
				if (_isMobileDevice() && _isLandscapeOrientation() && !_isFullscreen()) {
					_requestFullscreenSync();
					_rotateGate.fullscreenRequested = true;
				}

				// Re-evaluate after the user gesture
				_applyOrientationGate();
			});
		}

		// Listen for fullscreen changes
		document.addEventListener("fullscreenchange", _applyOrientationGate);
		document.addEventListener("webkitfullscreenchange", _applyOrientationGate);
		document.addEventListener("mozfullscreenchange", _applyOrientationGate);
		document.addEventListener("MSFullscreenChange", _applyOrientationGate);

		_applyOrientationGate();
	}

	function _setupFullscreenOnStart() {
		// Request fullscreen when level starts (user interaction)
		if (typeof EventBus !== "undefined") {
			EventBus.on(EventBus.Events.LEVEL_START, () => {
				if (
					_isMobileDevice() &&
					_isLandscapeOrientation() &&
					!_isFullscreen() &&
					!_rotateGate.fullscreenRequested
				) {
					// Use sync version - LEVEL_START is triggered by user action (start button)
					_requestFullscreenSync();
					_rotateGate.fullscreenRequested = true;
				}
			});
		}
	}

	function _setRotateOverlayVisible(visible) {
		const overlay = _rotateGate.overlay;
		if (!overlay) return;

		overlay.classList.toggle("hidden", !visible);
		overlay.setAttribute("aria-hidden", visible ? "false" : "true");
	}

	function _applyOrientationGate() {
		const overlay = _rotateGate.overlay;
		if (!overlay) return;

		if (!_isMobileDevice()) {
			_setRotateOverlayVisible(false);
			if (typeof VirtualController !== "undefined" && VirtualController.setBlocked) {
				VirtualController.setBlocked(false);
			}
			_rotateGate.pausedByGate = false;
			return;
		}

		const landscape = _isLandscapeOrientation();

		if (!landscape) {
			_setRotateOverlayVisible(true);

			if (typeof VirtualController !== "undefined" && VirtualController.setBlocked) {
				VirtualController.setBlocked(true);
			}
			if (typeof Input !== "undefined") Input.clearAll();

			// Pause only if we were playing; remember we did it.
			if (
				typeof StateManager !== "undefined" &&
				typeof LevelManager !== "undefined" &&
				StateManager.getPhase() === StateManager.GamePhase.PLAYING
			) {
				LevelManager.pause();
				_rotateGate.pausedByGate = true;
			}
		} else {
			_setRotateOverlayVisible(false);

			if (typeof VirtualController !== "undefined" && VirtualController.setBlocked) {
				VirtualController.setBlocked(false);
			}

			// Note: Fullscreen must be requested from a user gesture handler
			// It will be requested when user clicks "Tap to continue" or starts a level

			// Resume only if we paused due to the rotate gate.
			if (
				_rotateGate.pausedByGate &&
				typeof StateManager !== "undefined" &&
				typeof LevelManager !== "undefined" &&
				StateManager.getPhase() === StateManager.GamePhase.PAUSED
			) {
				LevelManager.resume();
			}
			_rotateGate.pausedByGate = false;
		}
	}

	/**
	 * Setup global input handlers
	 * @private
	 */
	function _setupGlobalInput() {
		document.addEventListener("keydown", (e) => {
			const playing = StateManager.getPhase() === "playing" || StateManager.getPhase() === "title";
			if (
				playing &&
				["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Minus", "NumpadSubtract", "Slash"].includes(
					e.code
				)
			) {
				e.preventDefault();
			}

			// Collectible debug shortcut (minus key) while gameplay is active
			if (
				StateManager.getPhase() === StateManager.GamePhase.PLAYING &&
				(e.code === "Minus" || e.code === "NumpadSubtract" || e.code === "Slash")
			) {
				const lvl = StateManager.getCurrentLevel();
				// Bonus levels have no collectibles
				if (lvl === 4.5 || lvl === 7.5 || lvl === 10.5) return;

				const eraKey = StateManager.getEraKeyForLevel ? StateManager.getEraKeyForLevel(lvl) : null;
				if (!eraKey) return;

				// itemId is optional; StateManager will default per eraKey
				StateManager.collectItem({ eraKey, level: lvl });
			}

			EventBus.emit(EventBus.Events.INPUT_KEY, {
				code: e.code,
				key: e.key,
				type: "down",
			});
		});

		document.addEventListener("keyup", (e) => {
			EventBus.emit(EventBus.Events.INPUT_KEY, {
				code: e.code,
				key: e.key,
				type: "up",
			});
		});

		// Debug key commands
		if (DEBUG) {
			document.addEventListener("keydown", (e) => {
				// Direct level jump (number keys 1-9, 0 for 10) - no modifier needed
				if (!e.ctrlKey && !e.shiftKey && !e.altKey) {
					let targetLevel = null;

					// Check for number keys
					if (e.code.startsWith("Digit")) {
						const digit = parseInt(e.code.replace("Digit", ""));
						if (digit >= 1 && digit <= 9) {
							targetLevel = digit;
						} else if (digit === 0) {
							targetLevel = 10; // 0 key = level 10
						}
					} else if (e.code.startsWith("Numpad")) {
						const numpad = e.code.replace("Numpad", "");
						const digit = parseInt(numpad);
						if (digit >= 1 && digit <= 9) {
							targetLevel = digit;
						} else if (numpad === "0") {
							targetLevel = 10; // Numpad 0 = level 10
						}
					}

					if (targetLevel !== null) {
						e.preventDefault();

						// Mark all previous levels as completed (score 0 so skip doesn't inflate total)
						for (let i = 1; i < targetLevel; i++) {
							// Unlock level and memory
							Storage.unlockLevel(i);
							Storage.unlockMemory(i);

							// Mark as completed if not already
							if (!StateManager.getCompletedLevels().includes(i)) {
								StateManager.completeLevel(i, 0);
							}
						}

						// Unlock the target level if needed
						Storage.unlockLevel(targetLevel);

						// Refresh timeline to show completed levels
						TimelineController.init();
						TimelineSpriteController.init();

						// Load and start the level
						(async () => {
							await LevelManager.loadLevel(targetLevel);
							// Start the level automatically after loading
							LevelManager.startLevel();
							console.log(
								`[Debug] Jumped to level ${targetLevel} and started playing (marked levels 1-${
									targetLevel - 1
								} as completed)`
							);
						})();
						return;
					}
				}

				// Debug commands with Ctrl key
				if (e.ctrlKey) {
					switch (e.code) {
						case "Digit1":
							// Switch to SNES era
							StateManager.setEra("snes");
							console.log("[Debug] Era: SNES");
							break;
						case "Digit2":
							// Switch to N64 era
							StateManager.setEra("n64");
							console.log("[Debug] Era: N64");
							break;
						case "Digit3":
							// Switch to PS2 era
							StateManager.setEra("ps2");
							console.log("[Debug] Era: PS2");
							break;
						case "KeyR":
							// Reset game state
							e.preventDefault();
							Storage.clearAll(true);
							StateManager.reset();
							location.reload();
							break;
						case "KeyD":
							// Dump state to console
							e.preventDefault();
							console.log("[Debug] State:", StateManager.getSnapshot());
							console.log("[Debug] Storage:", {
								gameState: Storage.getGameState(),
								unlocks: Storage.getUnlocks(),
								settings: Storage.getSettings(),
							});
							break;
						case "KeyU":
							// Unlock all levels (debug)
							e.preventDefault();
							for (let i = 1; i <= 10; i++) {
								Storage.unlockLevel(i);
							}
							TimelineController.init(); // Refresh timeline
							TimelineSpriteController.init(); // Re-init sprite
							console.log("[Debug] All levels unlocked");
							break;
						case "ArrowRight":
							// Jump to next level (debug)
							e.preventDefault();
							const nextLevel = Math.min(10, StateManager.getCurrentLevel() + 1);
							Storage.unlockLevel(nextLevel);
							LevelManager.loadLevel(nextLevel);
							console.log(`[Debug] Jumped to level ${nextLevel}`);
							break;
						case "ArrowLeft":
							// Jump to previous level (debug)
							e.preventDefault();
							const prevLevel = Math.max(1, StateManager.getCurrentLevel() - 1);
							LevelManager.loadLevel(prevLevel);
							console.log(`[Debug] Jumped to level ${prevLevel}`);
							break;
					}
				}
			});
		}
	}

	// =========================================
	// ERROR HANDLING
	// =========================================

	/**
	 * Show error message on canvas
	 * @param {string} message - Error message
	 * @private
	 */
	function _showError(message) {
		const ctx = CanvasRenderer.getContext();
		if (!ctx) return;

		CanvasRenderer.clear("#1a0a0a");
		CanvasRenderer.drawText("ERROR", 400, 200, {
			color: "#ff0000",
			size: 24,
			align: "center",
		});
		CanvasRenderer.drawText(message, 400, 260, {
			color: "#ff6666",
			size: 12,
			align: "center",
		});
	}

	// =========================================
	// PUBLIC API
	// =========================================

	return {
		init,
		DEBUG,
	};
})();

// =========================================
// START APPLICATION
// Wait for DOM to be ready
// =========================================

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", App.init);
} else {
	App.init();
}
