/**
 * timeline-controller.js
 * Controls the timeline navigation at the bottom of the screen
 * Shows level progression through the decade (2016-2026)
 */

const TimelineController = (function () {
	"use strict";

	// DOM references
	let _trackElement = null;
	let _progressElement = null;
	let _nodeElements = [];

	// =========================================
	// INITIALIZATION
	// =========================================

	/**
	 * Initialize timeline controller
	 */
	function init() {
		_trackElement = document.querySelector(".timeline__track");
		_progressElement = document.getElementById("timeline-progress");

		if (!_trackElement) {
			console.error("[TimelineController] Track element not found");
			return;
		}

		// Generate timeline nodes
		_generateNodes();

		// Subscribe to events
		EventBus.on(EventBus.Events.UI_TIMELINE_UPDATE, _handleUpdate);
		EventBus.on(EventBus.Events.LEVEL_COMPLETE, _handleLevelComplete);
		EventBus.on(EventBus.Events.LEVEL_UNLOCK, _handleLevelUnlock);

		// Initial render
		_render();

		console.log("[TimelineController] Initialized");
	}

	/**
	 * Generate the 10 timeline nodes
	 * @private
	 */
	function _generateNodes() {
		// Clear existing
		_trackElement.innerHTML = "";
		_nodeElements = [];

		// Years for each level
		const years = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

		for (let i = 0; i < 10; i++) {
			const levelNum = i + 1;
			const year = years[i];

			const node = document.createElement("button");
			node.className = "timeline__node timeline__node--locked";
			node.dataset.level = levelNum;
			node.setAttribute("aria-label", `Level ${levelNum}: ${year}`);

			node.innerHTML = `
                <span class="timeline__node-year">${year}</span>
                <span class="timeline__node-dot"></span>
                <img class="timeline__node-sprite" src="" alt="" style="display: none;" />
            `;

			// Click handler
			node.addEventListener("click", () => _handleNodeClick(levelNum));

			_trackElement.appendChild(node);
			_nodeElements.push(node);
		}
	}

	// =========================================
	// RENDERING
	// =========================================

	/**
	 * Render the timeline based on current state
	 * @private
	 */
	function _render() {
		const rawCurrentLevel = StateManager.getCurrentLevel();
		// Bonus levels should keep the previous node highlighted.
		const currentLevel =
			rawCurrentLevel === 4.5 ? 4 : rawCurrentLevel === 7.5 ? 7 : rawCurrentLevel === 10.5 ? 10 : rawCurrentLevel;
		const completedLevels = StateManager.getCompletedLevels();
		const unlocks = Storage.getUnlocks();

		_nodeElements.forEach((node, index) => {
			const levelNum = index + 1;
			const spriteImg = node.querySelector(".timeline__node-sprite");
			const dot = node.querySelector(".timeline__node-dot");

			// Remove all state classes
			node.classList.remove(
				"timeline__node--locked",
				"timeline__node--available",
				"timeline__node--current",
				"timeline__node--completed"
			);

			// Determine state and handle sprites
			if (completedLevels.includes(levelNum)) {
				node.classList.add("timeline__node--completed");
				node.disabled = false;

				// Show static sprite for completed levels
				_showNodeSprite(levelNum, spriteImg, dot);
			} else if (levelNum === currentLevel) {
				node.classList.add("timeline__node--current");
				node.disabled = false;

				// Current level sprite is handled by TimelineSpriteController
				// Hide the static sprite, dot is hidden by has-sprite class
				if (spriteImg) spriteImg.style.display = "none";
			} else if (unlocks.levels.includes(levelNum)) {
				node.classList.add("timeline__node--available");
				node.disabled = false;

				// Hide sprite, show dot
				if (spriteImg) spriteImg.style.display = "none";
				if (dot) dot.style.display = "";
			} else {
				node.classList.add("timeline__node--locked");
				node.disabled = true;

				// Hide sprite, show dot
				if (spriteImg) spriteImg.style.display = "none";
				if (dot) dot.style.display = "";
			}
		});

		// Update progress bar
		_updateProgressBar(completedLevels.length);
	}

	/**
	 * Show static sprite on a completed node
	 * @private
	 */
	function _showNodeSprite(levelNum, spriteImg, dot) {
		if (!spriteImg) return;

		const spriteConfig = LevelConfig.getSpriteForLevel(levelNum);

		if (spriteConfig && spriteConfig.src) {
			spriteImg.src = spriteConfig.src;
			spriteImg.style.display = "block";
			spriteImg.style.width = `${spriteConfig.width}px`;
			spriteImg.style.height = `${spriteConfig.height}px`;

			// Hide the dot
			if (dot) dot.style.display = "none";
		} else {
			// No sprite for this level, show dot
			spriteImg.style.display = "none";
			if (dot) dot.style.display = "";
		}
	}

	/**
	 * Update the progress bar width
	 * @param {number} completedCount - Number of completed levels
	 * @private
	 */
	function _updateProgressBar(completedCount) {
		if (!_progressElement) return;

		// Calculate percentage (0-9 levels = 0-100%)
		const percentage = (completedCount / 9) * 100;
		_progressElement.style.width = `${percentage}%`;
	}

	// =========================================
	// NODE UPDATES
	// =========================================

	/**
	 * Set a node's state
	 * @param {number} levelNum - Level number (1-10)
	 * @param {string} state - State: 'locked', 'available', 'current', 'completed'
	 */
	function setNodeState(levelNum, state) {
		const node = _nodeElements[levelNum - 1];
		if (!node) return;

		// Remove all state classes
		node.classList.remove(
			"timeline__node--locked",
			"timeline__node--available",
			"timeline__node--current",
			"timeline__node--completed"
		);

		// Add new state
		node.classList.add(`timeline__node--${state}`);
		node.disabled = state === "locked";
	}

	/**
	 * Mark a level as current
	 * @param {number} levelNum - Level number
	 */
	function setCurrentLevel(levelNum) {
		if (levelNum === 4.5) levelNum = 4;
		if (levelNum === 7.5) levelNum = 7;
		if (levelNum === 10.5) levelNum = 10;
		_nodeElements.forEach((node, index) => {
			const num = index + 1;

			if (num === levelNum) {
				// Only set current if not already completed
				if (!node.classList.contains("timeline__node--completed")) {
					node.classList.remove("timeline__node--available", "timeline__node--locked");
					node.classList.add("timeline__node--current");
				}
			} else if (node.classList.contains("timeline__node--current")) {
				// Demote previous current to available
				node.classList.remove("timeline__node--current");
				node.classList.add("timeline__node--available");
			}
		});
	}

	// =========================================
	// EVENT HANDLERS
	// =========================================

	/**
	 * Handle node click
	 * @param {number} levelNum - Clicked level number
	 * @private
	 */
	function _handleNodeClick(levelNum) {
		// Check if level is accessible
		if (!Storage.isLevelUnlocked(levelNum)) {
			console.log(`[TimelineController] Level ${levelNum} is locked`);
			return;
		}

		// Don't reload current level if playing
		const phase = StateManager.getPhase();
		const currentLevelRaw = StateManager.getCurrentLevel();
		const currentLevel =
			currentLevelRaw === 4.5 ? 4 : currentLevelRaw === 7.5 ? 7 : currentLevelRaw === 10.5 ? 10 : currentLevelRaw;
		if (phase === StateManager.GamePhase.PLAYING && levelNum === currentLevel) {
			return;
		}

		// Confirm restart via overlay (level-complete style)
		const cfg = typeof LevelConfig !== "undefined" && LevelConfig.getLevel ? LevelConfig.getLevel(levelNum) : null;
		const year = cfg && cfg.year ? cfg.year : "";
		const title = cfg && cfg.title ? cfg.title : `Level ${levelNum}`;

		if (typeof OverlayController !== "undefined" && OverlayController.showRestartConfirm) {
			OverlayController.showRestartConfirm({ level: levelNum, title, year });
			return;
		}

		// Fallback (if overlay system not available)
		const ok = window.confirm(`Restart ${title}${year ? ` (${year})` : ""}?`);
		if (!ok) return;
		(async () => {
			await LevelManager.loadLevel(levelNum);
			setTimeout(() => LevelManager.startLevel(), 300);
		})();
	}

	function _handleUpdate(data) {
		if (data.currentLevel) {
			setCurrentLevel(data.currentLevel);
		}
		_render();
	}

	function _handleLevelComplete(data) {
		setNodeState(data.level, "completed");
		_updateProgressBar(StateManager.getCompletedLevels().length);
	}

	function _handleLevelUnlock(data) {
		setNodeState(data.level, "available");
	}

	// =========================================
	// NODE ACCESS
	// =========================================

	/**
	 * Get DOM element for a specific node
	 * @param {number} levelNum - Level number (1-10)
	 * @returns {HTMLElement|null} Node DOM element
	 */
	function getNodeElement(levelNum) {
		return _nodeElements[levelNum - 1] || null;
	}

	/**
	 * Get all node elements
	 * @returns {HTMLElement[]} Array of node elements
	 */
	function getAllNodeElements() {
		return [..._nodeElements];
	}

	// =========================================
	// VISIBILITY
	// =========================================

	/**
	 * Show the timeline
	 */
	function show() {
		const timeline = document.getElementById("timeline");
		if (timeline) {
			timeline.style.display = "flex";
		}
	}

	/**
	 * Hide the timeline
	 */
	function hide() {
		const timeline = document.getElementById("timeline");
		if (timeline) {
			timeline.style.display = "none";
		}
	}

	// Public API
	return {
		init,
		setNodeState,
		setCurrentLevel,
		getNodeElement,
		getAllNodeElements,
		show,
		hide,
	};
})();

// Make available globally
window.TimelineController = TimelineController;
