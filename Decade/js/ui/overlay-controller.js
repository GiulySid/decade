/**
 * overlay-controller.js
 * Controls modal overlays (title, pause, level complete, memory reveal, etc.)
 */

const OverlayController = (function () {
	"use strict";

	// DOM references
	let _system = null;
	let _backdrop = null;
	let _overlays = {};

	// Currently visible overlay
	let _activeOverlay = null;

	// Pending timeline restart info (used by restart confirm overlay)
	let _pendingRestart = null;

	// When name entry → scores flow completes, show webcam next
	let _pendingWebcamAfterScores = false;

	// Last submitted player name (for highlighting in leaderboard)
	let _lastSubmittedName = null;

	// Webcam finale
	let _webcamStream = null;

	// =========================================
	// INITIALIZATION
	// =========================================

	/**
	 * Initialize overlay controller
	 */
	function init() {
		_system = document.getElementById("overlay-system");
		_backdrop = document.getElementById("overlay-backdrop");

		// Cache overlay elements
		_overlays = {
			title: document.getElementById("overlay-title"),
			pause: document.getElementById("overlay-pause"),
			levelComplete: document.getElementById("overlay-level-complete"),
			restartConfirm: document.getElementById("overlay-restart-confirm"),
			memoryReveal: document.getElementById("overlay-memory-reveal"),
			webcamFinale: document.getElementById("overlay-webcam-finale"),
			nameEntry: document.getElementById("overlay-name-entry"),
			scores: document.getElementById("overlay-scores"),
		};

		// Setup button handlers
		_setupButtonHandlers();

		// Setup keyboard handlers
		_setupKeyboardHandlers();

		// Subscribe to events
		EventBus.on(EventBus.Events.UI_OVERLAY_SHOW, (data) => show(data.overlay, data.data));
		EventBus.on(EventBus.Events.UI_OVERLAY_HIDE, hideAll);

		console.log("[OverlayController] Initialized");
	}

	/**
	 * Setup button click handlers
	 * @private
	 */
	function _setupButtonHandlers() {
		// Title screen - Start button
		const btnStart = document.getElementById("btn-start");
		if (btnStart) {
			btnStart.addEventListener("click", _handleStart);
		}

		// Level Complete - Continue button
		const btnContinue = document.getElementById("btn-continue");
		if (btnContinue) {
			btnContinue.addEventListener("click", _handleContinue);
		}

		// Memory Reveal - Next Level button
		const btnNextLevel = document.getElementById("btn-next-level");
		if (btnNextLevel) {
			btnNextLevel.addEventListener("click", _handleNextLevel);
		}

		// Pause menu buttons
		const btnResume = document.getElementById("btn-resume");
		if (btnResume) {
			btnResume.addEventListener("click", _handleResume);
		}

		const btnRestartLevel = document.getElementById("btn-restart-level");
		if (btnRestartLevel) {
			btnRestartLevel.addEventListener("click", _handleRestartLevel);
		}

		const btnMainMenu = document.getElementById("btn-main-menu");
		if (btnMainMenu) {
			btnMainMenu.addEventListener("click", _handleMainMenu);
		}

		// Restart confirm (timeline navigation) buttons
		const btnRestartConfirm = document.getElementById("btn-restart-confirm");
		if (btnRestartConfirm) {
			btnRestartConfirm.addEventListener("click", _handleRestartConfirm);
		}

		const btnRestartCancel = document.getElementById("btn-restart-cancel");
		if (btnRestartCancel) {
			btnRestartCancel.addEventListener("click", _handleRestartCancel);
		}

		const btnScores = document.getElementById("btn-scores");
		if (btnScores) {
			btnScores.addEventListener("click", _handleScoresFromPause);
		}

		const btnScoresClose = document.getElementById("btn-scores-close");
		if (btnScoresClose) {
			btnScoresClose.addEventListener("click", _handleScoresClose);
		}

		const btnSaveScore = document.getElementById("btn-save-score");
		if (btnSaveScore) {
			btnSaveScore.addEventListener("click", _handleNameEntrySubmit);
		}

		const btnSkipScore = document.getElementById("btn-skip-score");
		if (btnSkipScore) {
			btnSkipScore.addEventListener("click", _handleSkipScore);
		}

		const btnPlayAgain = document.getElementById("btn-play-again");
		if (btnPlayAgain) {
			btnPlayAgain.addEventListener("click", _handleWebcamPlayAgain);
		}

		const btnRetryCamera = document.getElementById("btn-retry-camera");
		if (btnRetryCamera) {
			btnRetryCamera.addEventListener("click", _handleWebcamRetry);
		}

		// Backdrop pointerdown (close overlay when user taps backdrop; use pointerdown not click
		// so that releasing the virtual controller Escape button over the backdrop doesn't trigger resume)
		if (_backdrop) {
			_backdrop.addEventListener("pointerdown", _handleBackdropClick);
		}
	}

	/**
	 * Setup keyboard handlers
	 * @private
	 */
	function _setupKeyboardHandlers() {
		document.addEventListener("keydown", (e) => {
			// Start game with Space/Enter on title screen
			if (_activeOverlay === "title" && (e.code === "Space" || e.code === "Enter")) {
				e.preventDefault();
				_handleStart();
				return;
			}

			// CONTINUE (Level Complete) with Enter
			if (_activeOverlay === "levelComplete" && e.code === "Enter") {
				e.preventDefault();
				_handleContinue();
				return;
			}

			// NEXT CHAPTER (Memory Reveal) with Enter
			if (_activeOverlay === "memoryReveal" && e.code === "Enter") {
				e.preventDefault();
				_handleNextLevel();
				return;
			}

			// RESTART (Restart Confirm) with Enter / cancel with Escape
			if (_activeOverlay === "restartConfirm" && e.code === "Enter") {
				e.preventDefault();
				_handleRestartConfirm();
				return;
			}

			if (_activeOverlay === "restartConfirm" && e.code === "Escape") {
				e.preventDefault();
				_handleRestartCancel();
				return;
			}

			// Score overlay (after game complete): Enter to save & continue
			if (_activeOverlay === "nameEntry" && e.code === "Enter") {
				e.preventDefault();
				_handleNameEntrySubmit();
				return;
			}

			// Pause/unpause with Escape
			if (e.code === "Escape") {
				e.preventDefault();

				if (_activeOverlay === "webcamFinale") {
					_handleWebcamPlayAgain();
					return;
				}

				const phase = StateManager.getPhase();

				if (phase === StateManager.GamePhase.PLAYING) {
					LevelManager.pause();
				} else if (phase === StateManager.GamePhase.PAUSED) {
					console.log("[OverlayController] _handleResume 123");
					_handleResume();
				}
			}
		});
	}

	// =========================================
	// SHOW/HIDE METHODS
	// =========================================

	/**
	 * Show an overlay
	 * @param {string} overlayName - Overlay identifier
	 * @param {Object} [data] - Data to populate overlay
	 */
	function show(overlayName, data = {}) {
		const overlay = _overlays[overlayName];

		if (!overlay) {
			console.error(`[OverlayController] Unknown overlay: ${overlayName}`);
			return;
		}

		// Hide any currently active overlay
		if (_activeOverlay && _activeOverlay !== overlayName) {
			_hide(_activeOverlay);
		}

		// Activate overlay system
		_system.classList.add("overlay-system--active");
		_system.setAttribute("aria-hidden", "false");

		// Show specific overlay
		overlay.classList.add("overlay--visible");
		_activeOverlay = overlayName;

		// Update state
		StateManager.setActiveOverlay(overlayName);

		// Populate overlay with data
		_populateOverlay(overlayName, data);

		if (overlayName === "webcamFinale") {
			_initWebcamFinale();
		}

		console.log(`[OverlayController] Showing: ${overlayName}`);
	}

	/**
	 * Hide a specific overlay
	 * @param {string} overlayName - Overlay to hide
	 * @private
	 */
	function _hide(overlayName) {
		if (overlayName === "webcamFinale") {
			_stopWebcam();
		}
		const overlay = _overlays[overlayName];
		if (overlay) {
			overlay.classList.remove("overlay--visible");
		}
	}

	/**
	 * Hide all overlays
	 */
	function hideAll() {
		Object.keys(_overlays).forEach((name) => {
			_hide(name);
		});

		_system.classList.remove("overlay-system--active");
		_system.setAttribute("aria-hidden", "true");
		_activeOverlay = null;

		StateManager.setActiveOverlay(null);
	}

	/**
	 * Get current active overlay
	 * @returns {string|null}
	 */
	function getActive() {
		return _activeOverlay;
	}

	// =========================================
	// SPECIFIC OVERLAY METHODS
	// =========================================

	/**
	 * Show title screen
	 */
	function showTitle() {
		show("title");
		StateManager.setPhase(StateManager.GamePhase.TITLE);
	}

	/**
	 * Show pause menu
	 */
	function showPause() {
		show("pause");
	}

	/**
	 * Show level complete overlay
	 * @param {Object} data - Level completion data
	 */
	function showLevelComplete(data) {
		show("levelComplete", data);
	}

	/**
	 * Show restart confirm overlay (used by timeline navigation)
	 * @param {Object} data
	 * @param {number} data.level
	 * @param {string} [data.title]
	 * @param {number|string} [data.year]
	 */
	function showRestartConfirm(data) {
		let wasPlaying = false;
		if (typeof StateManager !== "undefined" && StateManager.getPhase && StateManager.GamePhase) {
			wasPlaying = StateManager.getPhase() === StateManager.GamePhase.PLAYING;
		}

		// Remember what overlay we replaced (so Cancel can restore it)
		const previousOverlay = _activeOverlay;

		// Pause gameplay/timer first (but we'll swap pause overlay for our confirm)
		if (wasPlaying && typeof LevelManager !== "undefined" && LevelManager.pause) {
			LevelManager.pause();
		}

		_pendingRestart = { ...(data || {}), wasPlaying, previousOverlay };
		show("restartConfirm", _pendingRestart);
	}

	/**
	 * Show memory reveal overlay
	 * @param {Object} data - Memory data
	 */
	function showMemoryReveal(data) {
		show("memoryReveal", data);
	}

	/**
	 * Show name entry overlay (before leaderboard, when game ends)
	 * After submit, shows scores overlay, then CONTINUE leads to webcam finale
	 */
	function showNameEntryForScore() {
		_pendingWebcamAfterScores = true;
		show("nameEntry");
	}

	/**
	 * Show webcam finale overlay (after Level 10 complete)
	 */
	function showWebcamFinale() {
		show("webcamFinale");
	}

	// =========================================
	// OVERLAY POPULATION
	// =========================================

	/**
	 * Populate overlay with data
	 * @param {string} overlayName - Overlay name
	 * @param {Object} data - Data to display
	 * @private
	 */
	function _populateOverlay(overlayName, data) {
		switch (overlayName) {
			case "levelComplete":
				_populateLevelComplete(data);
				break;
			case "restartConfirm":
				_populateRestartConfirm(data);
				break;
			case "memoryReveal":
				_populateMemoryReveal(data);
				break;
			case "webcamFinale":
				/* Webcam init done in _initWebcamFinale after show */
				break;
			case "nameEntry":
				_populateNameEntry(data);
				break;
			case "scores":
				_populateScores(data);
				break;
			// Other overlays don't need dynamic population
		}
	}

	/**
	 * Populate level complete overlay
	 * @private
	 */
	function _populateLevelComplete(data) {
		const scoreEl = document.getElementById("complete-score");
		const timeEl = document.getElementById("complete-time");

		if (scoreEl) {
			scoreEl.textContent = String(data.score || 0).padStart(4, "0");
		}

		if (timeEl && data.time) {
			const seconds = Math.floor(data.time / 1000);
			const minutes = Math.floor(seconds / 60);
			const secs = seconds % 60;
			timeEl.textContent = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
		}
	}

	/**
	 * Populate restart confirm overlay
	 * @private
	 */
	function _populateRestartConfirm(data) {
		const levelEl = document.getElementById("restart-level-label");
		const yearEl = document.getElementById("restart-year-label");

		const levelNum = data && data.level != null ? data.level : StateManager.getCurrentLevel();
		let year = data && data.year != null ? data.year : "";

		// Fallback: derive year from LevelConfig when not provided
		if (!year && typeof LevelConfig !== "undefined" && LevelConfig.getLevel) {
			const cfg = LevelConfig.getLevel(levelNum);
			year = cfg && cfg.year ? cfg.year : "";
		}

		if (levelEl) {
			levelEl.textContent = String(levelNum);
		}
		if (yearEl) {
			yearEl.textContent = year ? String(year) : "—";
		}
	}

	/**
	 * Populate score overlay (ranking only; name comes from login sessionStorage)
	 * @private
	 */
	function _populateNameEntry(data) {
		const playingAsEl = document.getElementById("name-entry-playing-as");
		const yourScoreEl = document.getElementById("name-entry-your-score");
		const errorEl = document.getElementById("name-entry-error");
		const skipBtn = document.getElementById("btn-skip-score");
		const saveBtn = document.getElementById("btn-save-score");
		const tbody = document.getElementById("name-entry-scores-body");
		const name = (typeof sessionStorage !== "undefined" && sessionStorage.getItem("decade_player_name")) || "";
		const displayName = String(name)
			.trim()
			.toUpperCase()
			.replace(/[^A-Z0-9_]/g, "")
			.slice(0, 10);
		if (playingAsEl) {
			if (displayName.length >= 3) {
				playingAsEl.textContent = "Playing as: " + displayName;
				playingAsEl.hidden = false;
			} else {
				playingAsEl.hidden = true;
			}
		}
		const finalScore = typeof StateManager.getFinalScore === "function" ? StateManager.getFinalScore() : 0;
		if (yourScoreEl) {
			yourScoreEl.textContent = "Your score: " + String(finalScore).padStart(4, "0");
		}
		if (errorEl) {
			errorEl.hidden = true;
			errorEl.textContent = "";
		}
		if (skipBtn) skipBtn.style.display = "none";
		if (saveBtn) saveBtn.style.display = "";
		if (tbody) tbody.innerHTML = "";
		_renderScoresTable(tbody, displayName.length >= 3 ? displayName : null);
	}

	/**
	 * Render scores into a tbody element
	 * @private
	 */
	async function _renderScoresTable(tbody, highlightName) {
		if (!tbody) return;
		try {
			const res = await ScoresAPI.fetchScores();
			const scores = (res && res.scores) || [];
			scores.slice(0, 100).forEach((entry, idx) => {
				const tr = document.createElement("tr");
				if (highlightName && String(entry.name).toUpperCase() === String(highlightName).toUpperCase()) {
					tr.classList.add("scores-table__row--current");
				}
				const items = [];
				const c = entry.collectibles || {};
				for (let i = 0; i < (c.era1 || 0); i++) items.push("💾");
				for (let i = 0; i < (c.era2 || 0); i++) items.push("🦠");
				for (let i = 0; i < (c.era3 || 0); i++) items.push("🌰");
				tr.innerHTML = `
					<td>${idx + 1}</td>
					<td>${String(entry.name || "---").slice(0, 10)}</td>
					<td>${String(entry.score || 0)}</td>
					<td class="scores-table__items">${items.join("") || "—"}</td>
				`;
				tbody.appendChild(tr);
			});
			if (scores.length === 0) {
				const tr = document.createElement("tr");
				tr.innerHTML = '<td colspan="4" class="scores-table__empty">No scores yet.</td>';
				tbody.appendChild(tr);
			}
		} catch (_) {}
	}

	/**
	 * Populate scores overlay (fetch from API and render table)
	 * @private
	 */
	async function _populateScores(data) {
		const tbody = document.getElementById("scores-table-body");
		const errorEl = document.getElementById("scores-error");
		const closeBtn = document.getElementById("btn-scores-close");
		const fromGameEnd = !!(data && data.fromGameEnd);

		if (closeBtn) {
			closeBtn.textContent = fromGameEnd ? "CONTINUE" : "CLOSE";
		}
		if (errorEl) errorEl.hidden = true;
		if (tbody) tbody.innerHTML = "";

		try {
			const res = await ScoresAPI.fetchScores();
			const scores = (res && res.scores) || [];
			const highlightName = (data && data.highlightName) || _lastSubmittedName;

			scores.slice(0, 100).forEach((entry, idx) => {
				const tr = document.createElement("tr");
				if (highlightName && String(entry.name).toUpperCase() === String(highlightName).toUpperCase()) {
					tr.classList.add("scores-table__row--current");
				}
				const rank = idx + 1;
				const items = [];
				const c = entry.collectibles || {};
				const era1 = Math.max(0, c.era1 || 0);
				const era2 = Math.max(0, c.era2 || 0);
				const era3 = Math.max(0, c.era3 || 0);
				for (let i = 0; i < era1; i++) items.push("💾");
				for (let i = 0; i < era2; i++) items.push("🦠");
				for (let i = 0; i < era3; i++) items.push("🌰");
				tr.innerHTML = `
					<td>${rank}</td>
					<td>${String(entry.name || "---").slice(0, 10)}</td>
					<td>${String(entry.score || 0)}</td>
					<td class="scores-table__items">${items.join("") || "—"}</td>
				`;
				tbody.appendChild(tr);
			});

			if (scores.length === 0 && tbody) {
				const tr = document.createElement("tr");
				tr.innerHTML = '<td colspan="4" class="scores-table__empty">No scores yet. Be the first!</td>';
				tbody.appendChild(tr);
			}
		} catch (err) {
			if (errorEl) {
				errorEl.textContent = "Scores unavailable offline";
				errorEl.hidden = false;
			}
		}
	}

	/**
	 * Populate memory reveal overlay
	 * When data.evolution is present, show Pokémon-style evolution animation inside reveal__media
	 * @private
	 */
	function _populateMemoryReveal(data) {
		const yearEl = document.getElementById("reveal-year");
		const messageEl = document.getElementById("reveal-message");
		const mediaEl = document.getElementById("reveal-media");

		if (yearEl) {
			yearEl.textContent = data.year || "2016";
		}

		if (messageEl && data.memory) {
			messageEl.textContent = data.memory.text || "A special memory...";
		}

		if (!mediaEl) return;

		// Evolution: pulse (from) → flash + alternate visibility → replace → pulse (to). No evolution for bonus levels.
		if (data.evolution && data.evolution.fromLevel != null && data.evolution.toLevel != null) {
			const fromCfg = LevelConfig.getSpriteForLevel(data.evolution.fromLevel);
			const toCfg = LevelConfig.getSpriteForLevel(data.evolution.toLevel);
			if (fromCfg && toCfg) {
				mediaEl.innerHTML = "";
				const stage = document.createElement("div");
				stage.className = "evolution__stage";
				const imgFrom = document.createElement("img");
				imgFrom.className = "evolution__sprite evolution__sprite--from";
				imgFrom.alt = `Year ${fromCfg.year || data.evolution.fromLevel}`;
				const imgTo = document.createElement("img");
				imgTo.className = "evolution__sprite evolution__sprite--to";
				imgTo.alt = `Year ${toCfg.year || data.evolution.toLevel}`;
				const flash = document.createElement("div");
				flash.className = "evolution__flash";
				stage.appendChild(imgFrom);
				stage.appendChild(imgTo);
				stage.appendChild(flash);
				mediaEl.appendChild(stage);
				imgFrom.src = fromCfg.src;
				imgTo.src = toCfg.src;
				// Initial state: from visible at scale 1, to hidden
				imgFrom.style.opacity = "1";
				imgFrom.style.transform = "scale(1)";
				imgFrom.style.transition = "transform 0.2s ease-out";
				imgTo.style.opacity = "0";
				imgTo.style.transform = "scale(1)";
				imgTo.style.transition = "transform 0.2s ease-out, opacity 0.15s ease";
				imgTo.style.visibility = "hidden";
				flash.style.transition = "opacity 0.08s ease";
				flash.style.opacity = "0";

				function pulseScale(el, fromS, peakS, toS, durationMs) {
					return new Promise((resolve) => {
						const half = durationMs / 2;
						el.style.transition = `transform ${half}ms ease-out`;
						el.style.transform = `scale(${peakS})`;
						setTimeout(() => {
							el.style.transform = `scale(${toS})`;
							setTimeout(resolve, half);
						}, half);
					});
				}

				async function runEvolutionAnimation() {
					// 1) Pulse "from" sprite: scale 1 → 1.15 → 1, repeat 2–3 times, slightly faster each time
					const fromPulseDurations = [400, 320, 280];
					for (let i = 0; i < fromPulseDurations.length; i++) {
						await pulseScale(imgFrom, 1, 1.15, 1, fromPulseDurations[i]);
					}
					// 2) White flash: opacity 0 → 1 → 0; during flash alternate visibility slowly
					const alternateInterval = 700; // slow alternation (ms between each sprite swap)
					const flashDuration = 3200; // total flash phase so we get several slow alternations
					flash.style.opacity = "1";
					let showFrom = true; // start with "from" visible, first tick will show "to"
					const alternateId = setInterval(() => {
						showFrom = !showFrom;
						imgFrom.style.visibility = showFrom ? "visible" : "hidden";
						imgFrom.style.opacity = showFrom ? "1" : "0";
						imgTo.style.visibility = showFrom ? "hidden" : "visible";
						imgTo.style.opacity = showFrom ? "0" : "1";
					}, alternateInterval);
					await new Promise((r) => setTimeout(r, 400)); // hold full flash
					flash.style.opacity = "0";
					await new Promise((r) => setTimeout(r, flashDuration - 400)); // fade out and keep alternating
					clearInterval(alternateId);
					// 3) Replace: hide old, show new
					imgFrom.style.opacity = "0";
					imgFrom.style.visibility = "hidden";
					imgTo.style.opacity = "1";
					imgTo.style.visibility = "visible";
					imgTo.style.transform = "scale(1)";
					await new Promise((r) => setTimeout(r, 80));
					// 3b) Flash again right before "to" pulse (0 → 1 → 0)
					flash.style.opacity = "1";
					await new Promise((r) => setTimeout(r, 400));
					flash.style.opacity = "0";
					await new Promise((r) => setTimeout(r, 120));
					// 4) Pulse "to" sprite: scale 1 → 1.2 → 1, repeat 2 times
					for (let i = 0; i < 2; i++) {
						await pulseScale(imgTo, 1, 1.2, 1, 350);
					}
					// 5) Sparkles after animation ended
					const sparkleCount = 12;
					const radiusPct = 32; // % from center
					for (let i = 0; i < sparkleCount; i++) {
						const sparkle = document.createElement("span");
						sparkle.className = "evolution__sparkle";
						const angle = (i / sparkleCount) * Math.PI * 2 - Math.PI / 2;
						const x = 50 + radiusPct * Math.cos(angle);
						const y = 50 + radiusPct * Math.sin(angle);
						sparkle.style.left = x + "%";
						sparkle.style.top = y + "%";
						sparkle.style.animationDelay = i * 80 + "ms";
						stage.appendChild(sparkle);
					}
				}

				function startEvolution() {
					runEvolutionAnimation();
				}
				if (imgFrom.complete && imgFrom.naturalWidth) {
					startEvolution();
				} else {
					imgFrom.onload = startEvolution;
					imgFrom.onerror = startEvolution;
				}
				return;
			}
		}
		mediaEl.innerHTML = "";
	}

	// =========================================
	// EVENT HANDLERS
	// =========================================

	function _handleStart() {
		console.log("[OverlayController] Start game");
		hideAll();

		// Load first unlocked level (or continue from saved)
		const state = Storage.getGameState();
		const completed = state.completedLevels || [];
		const isFreshStart = (state.currentLevel === 1 || !state.currentLevel) && completed.length === 0;
		let levelToLoad = isFreshStart ? 0 : state.currentLevel || 1;

		// If bonus is pending (Level 4 completed, all 💾 collected, Level 5 still locked),
		// resume directly into bonus level 4.5.
		try {
			if (
				!isFreshStart &&
				levelToLoad === 4 &&
				completed.includes(4) &&
				typeof Storage.getCollectibles === "function" &&
				typeof Storage.isLevelUnlocked === "function" &&
				!Storage.isLevelUnlocked(5)
			) {
				const col = Storage.getCollectibles();
				const era1 = col && col.era1 ? col.era1 : {};
				const all = [1, 2, 3, 4].every((k) => era1[k] === true);
				if (all) levelToLoad = 4.5;
			}
		} catch (_) {
			// non-fatal
		}

		// If bonus is pending (Level 7 completed, all 🦠 collected, Level 8 still locked),
		// resume directly into bonus level 7.5.
		try {
			if (
				!isFreshStart &&
				levelToLoad === 7 &&
				completed.includes(7) &&
				typeof Storage.getCollectibles === "function" &&
				typeof Storage.isLevelUnlocked === "function" &&
				!Storage.isLevelUnlocked(8)
			) {
				const col = Storage.getCollectibles();
				const era2 = col && col.era2 ? col.era2 : {};
				const all = [5, 6, 7].every((k) => era2[k] === true);
				if (all) levelToLoad = 7.5;
			}
		} catch (_) {
			// non-fatal
		}

		// If final bonus is pending (Level 10 completed, all 🌰 collected),
		// resume directly into bonus level 10.5.
		try {
			if (
				!isFreshStart &&
				levelToLoad === 10 &&
				completed.includes(10) &&
				typeof Storage.getCollectibles === "function"
			) {
				const col = Storage.getCollectibles();
				const era3 = col && col.era3 ? col.era3 : {};
				const all = [8, 9, 10].every((k) => era3[k] === true);
				if (all) levelToLoad = 10.5;
			}
		} catch (_) {
			// non-fatal
		}

		LevelManager.loadLevel(levelToLoad);

		// Small delay before starting
		setTimeout(() => {
			LevelManager.startLevel();
		}, 300);
	}

	function _handleContinue() {
		console.log("[OverlayController] Continue to memory reveal");
		hideAll();
		LevelManager.showMemoryReveal();
	}

	function _handleNextLevel() {
		console.log("[OverlayController] Next level");
		hideAll();
		LevelManager.nextLevel();

		// Start after loading
		setTimeout(() => {
			LevelManager.startLevel();
		}, 300);
	}

	function _handleResume() {
		console.log("[OverlayController] Resume");
		LevelManager.resume();
	}

	function _handleRestartLevel() {
		console.log("[OverlayController] Restart level");
		hideAll();

		// Also clear the collectible for this level on restart
		if (typeof StateManager !== "undefined" && StateManager.clearCollectibleForLevel) {
			StateManager.clearCollectibleForLevel(StateManager.getCurrentLevel());
		}
		LevelManager.restartLevel();

		setTimeout(() => {
			LevelManager.startLevel();
		}, 300);
	}

	function _handleRestartConfirm() {
		const levelNum =
			_pendingRestart && _pendingRestart.level != null ? _pendingRestart.level : StateManager.getCurrentLevel();

		console.log(`[OverlayController] Restart confirm → level ${levelNum}`);
		hideAll();

		// Clear collectible for that level (user-requested behavior when replaying)
		if (typeof StateManager !== "undefined" && StateManager.clearCollectibleForLevel) {
			StateManager.clearCollectibleForLevel(levelNum);
		}

		_pendingRestart = null;

		(async () => {
			await LevelManager.loadLevel(levelNum);
			setTimeout(() => {
				LevelManager.startLevel();
			}, 300);
		})();
	}

	function _handleRestartCancel() {
		console.log("[OverlayController] Restart cancel");
		const wasPlaying = !!(_pendingRestart && _pendingRestart.wasPlaying);
		const previousOverlay =
			_pendingRestart && _pendingRestart.previousOverlay ? _pendingRestart.previousOverlay : null;
		_pendingRestart = null;

		// If we paused just for the confirm dialog, resume gameplay
		if (wasPlaying && typeof LevelManager !== "undefined" && LevelManager.resume) {
			hideAll();
			LevelManager.resume();
			return;
		}

		// Otherwise restore the previous overlay (e.g. Title screen / Pause menu)
		if (previousOverlay === "title") {
			showTitle();
			return;
		}

		if (previousOverlay === "pause") {
			showPause();
			return;
		}

		if (previousOverlay === "levelComplete") {
			const ld = typeof StateManager !== "undefined" && StateManager.getLevelData ? StateManager.getLevelData() : {};
			showLevelComplete({ score: ld.score || 0, time: ld.elapsedTime || 0 });
			return;
		}

		if (previousOverlay === "memoryReveal") {
			const levelNum =
				typeof StateManager !== "undefined" && StateManager.getCurrentLevel ? StateManager.getCurrentLevel() : 1;
			const cfg = typeof LevelConfig !== "undefined" && LevelConfig.getLevel ? LevelConfig.getLevel(levelNum) : null;
			showMemoryReveal({ year: cfg && cfg.year ? cfg.year : "", memory: cfg && cfg.memory ? cfg.memory : null });
			return;
		}

		// Default: just close everything
		hideAll();
	}

	function _handleMainMenu() {
		console.log("[OverlayController] Main menu");
		LevelManager.unloadCurrentGame();
		showTitle();
	}

	function _handleBackdropClick() {
		// Only close on backdrop tap for pause menu
		if (_activeOverlay === "pause") {
			_handleResume();
		}
	}

	async function _handleNameEntrySubmit() {
		const errorEl = document.getElementById("name-entry-error");
		const saveBtn = document.getElementById("btn-save-score");
		const skipBtn = document.getElementById("btn-skip-score");
		const rawName = (typeof sessionStorage !== "undefined" && sessionStorage.getItem("decade_player_name")) || "";
		const name = String(rawName)
			.trim()
			.toUpperCase()
			.replace(/[^A-Z0-9_]/g, "")
			.slice(0, 10);
		const finalName = name.length >= 3 ? name : "ANON";

		if (errorEl) {
			errorEl.hidden = true;
			errorEl.textContent = "";
		}

		const score = typeof StateManager.getFinalScore === "function" ? StateManager.getFinalScore() : 0;
		const collectibles =
			typeof StateManager.getCollectiblesSummary === "function"
				? StateManager.getCollectiblesSummary()
				: { era1: 0, era2: 0, era3: 0 };
		const bonusUnlocked =
			typeof StateManager.getUnlockedBonuses === "function" ? StateManager.getUnlockedBonuses() : [];

		const payload = { name: finalName, score, collectibles, bonusUnlocked };
		try {
			try {
				await ScoresAPI.updateScore(payload);
			} catch (updateErr) {
				if (updateErr && updateErr.message && updateErr.message.includes("Name not found")) {
					await ScoresAPI.submitScore(payload);
				} else {
					throw updateErr;
				}
			}
			_lastSubmittedName = finalName;
			_pendingWebcamAfterScores = true;
			show("scores", { fromGameEnd: true, highlightName: finalName });
		} catch (err) {
			if (errorEl) {
				errorEl.textContent = err && err.message ? err.message : "Scores unavailable offline";
				errorEl.hidden = false;
			}
			if (skipBtn) skipBtn.style.display = "inline-block";
			if (saveBtn) saveBtn.style.display = "none";
		}
	}

	function _handleSkipScore() {
		_pendingWebcamAfterScores = true;
		show("webcamFinale");
	}

	async function _handleScoresFromPause() {
		_pendingWebcamAfterScores = false;
		show("scores", { fromGameEnd: false });
	}

	function _handleScoresClose() {
		if (_pendingWebcamAfterScores) {
			_pendingWebcamAfterScores = false;
			show("webcamFinale");
		} else if (_activeOverlay === "scores") {
			showPause();
		} else {
			hideAll();
		}
	}

	// =========================================
	// WEBCAM FINALE
	// =========================================

	function _initWebcamFinale() {
		const video = document.getElementById("webcamVideo");
		const statusEl = document.getElementById("webcamStatus");
		const retryBtn = document.getElementById("btn-retry-camera");
		const fallback = document.getElementById("webcam-frame-fallback");
		const cardBody = document.getElementById("webcam-card-body");
		if (retryBtn) retryBtn.style.display = "none";
		if (fallback) {
			fallback.hidden = true;
			fallback.style.display = "none";
		}
		if (statusEl) {
			statusEl.textContent = "";
			statusEl.hidden = true;
		}
		if (video) {
			video.srcObject = null;
			video.style.display = "none";
		}
		if (cardBody) cardBody.hidden = false;
		_requestWebcam();
	}

	function _requestWebcam() {
		const video = document.getElementById("webcamVideo");
		const statusEl = document.getElementById("webcamStatus");
		const retryBtn = document.getElementById("btn-retry-camera");

		_stopWebcam();

		const cardBody = document.getElementById("webcam-card-body");

		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			if (statusEl) {
				statusEl.textContent = "Camera not supported in this browser.";
				statusEl.hidden = false;
			}
			if (cardBody) cardBody.hidden = false;
			if (retryBtn) retryBtn.style.display = "none";
			const fallbackEl = document.getElementById("webcam-frame-fallback");
			if (fallbackEl) {
				fallbackEl.hidden = true;
				fallbackEl.style.display = "none";
			}
			return;
		}

		const fallback = document.getElementById("webcam-frame-fallback");

		navigator.mediaDevices
			.getUserMedia({ video: { facingMode: "user" }, audio: false })
			.then((stream) => {
				_webcamStream = stream;
				if (video) {
					video.srcObject = stream;
					video.style.display = "block";
				}
				if (statusEl) {
					statusEl.textContent = "";
					statusEl.hidden = true;
				}
				if (cardBody) cardBody.hidden = true;
				if (retryBtn) retryBtn.style.display = "none";
				if (fallback) {
					fallback.hidden = true;
					fallback.style.display = "none";
				}
			})
			.catch((err) => {
				_webcamStream = null;
				if (statusEl) {
					statusEl.textContent =
						err.name === "NotAllowedError"
							? "Camera access was denied. You can still play again."
							: "Could not access camera. You can still play again.";
					statusEl.hidden = false;
				}
				if (cardBody) cardBody.hidden = false;
				if (video) video.style.display = "none";
				if (retryBtn) retryBtn.style.display = "inline-block";
				if (fallback) {
					fallback.hidden = false;
					fallback.style.display = "flex";
				}
			});
	}

	function _stopWebcam() {
		if (_webcamStream) {
			_webcamStream.getTracks().forEach((t) => t.stop());
			_webcamStream = null;
		}
		const video = document.getElementById("webcamVideo");
		if (video) {
			video.srcObject = null;
		}
	}

	function _handleWebcamPlayAgain() {
		_stopWebcam();
		hideAll();
		// Keep decade_player_name (and auth) so user stays "logged in"; state/score/collectibles reset below
		if (typeof StateManager !== "undefined" && StateManager.resetAllProgress) {
			StateManager.resetAllProgress();
		} else if (typeof StateManager !== "undefined" && StateManager.reset) {
			StateManager.reset();
		}
		if (typeof LevelManager !== "undefined" && LevelManager.unloadCurrentGame) {
			LevelManager.unloadCurrentGame();
		}
		if (typeof TimelineController !== "undefined" && TimelineController.init) {
			TimelineController.init();
		}
		if (typeof TimelineSpriteController !== "undefined" && TimelineSpriteController.init) {
			TimelineSpriteController.init();
		}
		showTitle();
	}

	function _handleWebcamRetry() {
		_requestWebcam();
	}

	/**
	 * Show webcam finale overlay (after Level 10 complete)
	 */
	function showWebcamFinale() {
		show("webcamFinale");
	}

	/**
	 * Show scores overlay (from pause menu or after name submission)
	 * @param {Object} [data] - { fromGameEnd, highlightName }
	 */
	function showScores(data = {}) {
		show("scores", data);
	}

	// Public API
	return {
		init,
		show,
		hideAll,
		getActive,
		showTitle,
		showPause,
		showLevelComplete,
		showRestartConfirm,
		showMemoryReveal,
		showNameEntryForScore,
		showWebcamFinale,
		showScores,
	};
})();

// Make available globally
window.OverlayController = OverlayController;
