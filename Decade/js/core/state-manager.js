/**
 * state-manager.js
 * Central game state management
 * Single source of truth for all runtime game data
 */

const StateManager = (function () {
	"use strict";

	// =========================================
	// GAME STATES
	// =========================================

	const GamePhase = {
		INIT: "init",
		TITLE: "title",
		PLAYING: "playing",
		PAUSED: "paused",
		LEVEL_COMPLETE: "level_complete",
		MEMORY_REVEAL: "memory_reveal",
		GAME_COMPLETE: "game_complete",
	};

	// =========================================
	// PRIVATE STATE
	// =========================================

	let _state = {
		// Current game phase
		phase: GamePhase.INIT,

		// Level state
		currentLevel: 1,
		completedLevels: [],

		// Active level runtime data
		levelData: {
			score: 0,
			startTime: null,
			elapsedTime: 0,
			isActive: false,
		},

		// Global progression
		totalScore: 0,

		// Collectibles / Easter eggs (persistent)
		collectibles: {
			era1: { 1: false, 2: false, 3: false, 4: false }, // 💾 floppy disks
			era2: { 5: false, 6: false, 7: false }, // 🦠 covid years
			era3: { 8: false, 9: false, 10: false }, // 🌰 acorns
		},

		// Current visual era
		currentEra: "snes", // 'snes' | 'n64' | 'ps2'

		// UI state
		ui: {
			activeOverlay: null,
			hudVisible: true,
			timelineVisible: true,
		},
	};

	// =========================================
	// STATE GETTERS
	// =========================================

	/**
	 * Get current game phase
	 * @returns {string}
	 */
	function getPhase() {
		return _state.phase;
	}

	/**
	 * Get current level number
	 * @returns {number}
	 */
	function getCurrentLevel() {
		return _state.currentLevel;
	}

	/**
	 * Get completed levels array
	 * @returns {number[]}
	 */
	function getCompletedLevels() {
		return [..._state.completedLevels];
	}

	/**
	 * Get current level runtime data
	 * @returns {Object}
	 */
	function getLevelData() {
		return { ..._state.levelData };
	}

	/**
	 * Get current era
	 * @returns {string}
	 */
	function getCurrentEra() {
		return _state.currentEra;
	}

	/**
	 * Get full state snapshot (for debugging)
	 * @returns {Object}
	 */
	function getSnapshot() {
		return JSON.parse(JSON.stringify(_state));
	}

	/**
	 * Get final total score (for leaderboard submission)
	 * @returns {number}
	 */
	function getFinalScore() {
		return _state.totalScore || 0;
	}

	/**
	 * Get collectibles summary for leaderboard: { era1, era2, era3 } counts
	 * @returns {{ era1: number, era2: number, era3: number }}
	 */
	function getCollectiblesSummary() {
		return {
			era1: getCollectedCount("era1"),
			era2: getCollectedCount("era2"),
			era3: getCollectedCount("era3"),
		};
	}

	/**
	 * Get list of bonus game IDs the player has unlocked/completed
	 * @returns {string[]} e.g. ["pacman","space-invaders","arkanoid"]
	 */
	function getUnlockedBonuses() {
		const bonusMap = { 4.5: "pacman", 7.5: "space-invaders", 10.5: "arkanoid" };
		return (_state.completedLevels || []).filter((l) => bonusMap[l]).map((l) => bonusMap[l]);
	}

	// =========================================
	// STATE SETTERS
	// =========================================

	/**
	 * Set game phase
	 * @param {string} phase - New phase (from GamePhase)
	 */
	function setPhase(phase) {
		const validPhases = Object.values(GamePhase);

		if (!validPhases.includes(phase)) {
			console.error(`[StateManager] Invalid phase: ${phase}`);
			return;
		}

		const previousPhase = _state.phase;
		_state.phase = phase;

		console.log(`[StateManager] Phase: ${previousPhase} → ${phase}`);
	}

	/**
	 * Set current level
	 * @param {number} levelNum - Level number (0-10). Level 0 is the intro cutscene.
	 */
	function setCurrentLevel(levelNum) {
		// Allow interstitial bonus levels (.5)
		const isBonus = levelNum === 4.5 || levelNum === 7.5 || levelNum === 10.5;
		if (!isBonus && (levelNum < 0 || levelNum > 10)) {
			console.error(`[StateManager] Invalid level: ${levelNum}`);
			return;
		}

		_state.currentLevel = levelNum;

		// Update era based on level
		updateEraForLevel(levelNum);

		// Emit level change event
		EventBus.emit(EventBus.Events.LEVEL_LOAD, { level: levelNum });
	}

	/**
	 * Mark a level as completed
	 * @param {number} levelNum - Level number
	 * @param {number} score - Score achieved
	 * @param {Object} [options]
	 * @param {boolean} [options.skipUnlockNext=false] - Do not unlock the next level
	 * @param {boolean} [options.skipMemory=false] - Do not unlock memory for this level
	 */
	function completeLevel(levelNum, score, options = {}) {
		const { skipUnlockNext = false, skipMemory = false } = options;

		if (!_state.completedLevels.includes(levelNum)) {
			_state.completedLevels.push(levelNum);
			_state.completedLevels.sort((a, b) => a - b);
		}

		// Update total score
		_state.totalScore += score;

		// Save to storage
		Storage.saveGameState({
			currentLevel: _state.currentLevel,
			completedLevels: _state.completedLevels,
			totalScore: _state.totalScore,
		});

		// Unlock next level
		if (!skipUnlockNext && levelNum < 10) {
			Storage.unlockLevel(levelNum + 1);
		}

		// Unlock memory
		if (!skipMemory) {
			Storage.unlockMemory(levelNum);
		}

		// Update best score
		Storage.updateBestScore(levelNum, score);

		// Emit completion event
		EventBus.emit(EventBus.Events.LEVEL_COMPLETE, {
			level: levelNum,
			score: score,
			totalScore: _state.totalScore,
		});
	}

	/**
	 * Update level runtime data
	 * @param {Object} data - Partial level data to merge
	 */
	function updateLevelData(data) {
		_state.levelData = { ..._state.levelData, ...data };
		if (data.score !== undefined) {
			EventBus.emit(EventBus.Events.MINIGAME_SCORE, {
				points: 0,
				levelScore: _state.levelData.score,
				total: _state.totalScore + _state.levelData.score,
			});
		}
	}

	/**
	 * Reset level runtime data (for restart/new level)
	 */
	function resetLevelData() {
		_state.levelData = {
			score: 0,
			startTime: null,
			elapsedTime: 0,
			isActive: false,
		};
	}

	/**
	 * Add score to current level
	 * @param {number} points - Points to add
	 */
	function addScore(points) {
		_state.levelData.score += points;

		EventBus.emit(EventBus.Events.MINIGAME_SCORE, {
			points: points,
			levelScore: _state.levelData.score,
			total: _state.totalScore + _state.levelData.score,
		});
	}

	// =========================================
	// COLLECTIBLES
	// =========================================

	const _collectibleDefs = {
		era1: { levels: [1, 2, 3, 4], icon: "💾", itemId: "floppy" },
		era2: { levels: [5, 6, 7], icon: "🦠", itemId: "virus" },
		era3: { levels: [8, 9, 10], icon: "🌰", itemId: "acorn" },
	};

	function getEraKeyForLevel(levelNum) {
		// Bonus levels inherit the previous era's collectible set
		if (levelNum === 4.5) return "era1";
		if (levelNum === 7.5) return "era2";
		if (levelNum === 10.5) return "era3";
		if (levelNum >= 1 && levelNum <= 4) return "era1";
		if (levelNum >= 5 && levelNum <= 7) return "era2";
		if (levelNum >= 8 && levelNum <= 10) return "era3";
		return null;
	}

	function getEraKeyForCurrentLevel() {
		return getEraKeyForLevel(getCurrentLevel());
	}

	function getCollectibleIconForEraKey(eraKey) {
		return (_collectibleDefs[eraKey] && _collectibleDefs[eraKey].icon) || "";
	}

	function getCollectibleTotalForEraKey(eraKey) {
		return (_collectibleDefs[eraKey] && _collectibleDefs[eraKey].levels.length) || 0;
	}

	function getCollectibleCountForEraKey(eraKey) {
		return getCollectedCount(eraKey);
	}

	function getCollectibles() {
		return JSON.parse(JSON.stringify(_state.collectibles));
	}

	function isCollected(eraKey, levelNum) {
		return !!(_state.collectibles && _state.collectibles[eraKey] && _state.collectibles[eraKey][levelNum]);
	}

	function getCollectedCount(eraKey) {
		const def = _collectibleDefs[eraKey];
		const bucket = (_state.collectibles && _state.collectibles[eraKey]) || {};
		if (!def) return 0;
		return def.levels.filter((lvl) => bucket[lvl] === true).length;
	}

	function hasAllCollected(eraKey) {
		const def = _collectibleDefs[eraKey];
		const bucket = (_state.collectibles && _state.collectibles[eraKey]) || {};
		if (!def) return false;
		return def.levels.every((lvl) => bucket[lvl] === true);
	}

	function collectItem({ eraKey, level, itemId }) {
		if (!eraKey || level == null) return false;
		const def = _collectibleDefs[eraKey];
		if (!def) return false;
		if (!def.levels.includes(level)) return false;

		if (!_state.collectibles) _state.collectibles = {};
		if (!_state.collectibles[eraKey]) _state.collectibles[eraKey] = {};
		if (_state.collectibles[eraKey][level]) return false;

		_state.collectibles[eraKey][level] = true;

		if (typeof Storage !== "undefined" && Storage.saveCollectibles) {
			Storage.saveCollectibles(_state.collectibles);
		}

		const count = getCollectedCount(eraKey);
		const allCollected = hasAllCollected(eraKey);
		const icon = getCollectibleIconForEraKey(eraKey);
		const total = getCollectibleTotalForEraKey(eraKey);

		EventBus.emit(EventBus.Events.COLLECTIBLE_COLLECTED, {
			eraKey,
			level,
			itemId: itemId || def.itemId,
			count,
			total,
			icon,
			allCollected,
		});

		return true;
	}

	/**
	 * Clear a collectible for a specific level (used when replaying/restarting from timeline)
	 * @param {number} levelNum
	 * @returns {boolean} true if state was updated
	 */
	function clearCollectibleForLevel(levelNum) {
		const eraKey = getEraKeyForLevel(levelNum);
		const def = eraKey ? _collectibleDefs[eraKey] : null;
		if (!eraKey || !def) return false;
		if (!def.levels.includes(levelNum)) return false;

		if (!_state.collectibles) _state.collectibles = {};
		if (!_state.collectibles[eraKey]) _state.collectibles[eraKey] = {};

		const wasCollected = _state.collectibles[eraKey][levelNum] === true;
		_state.collectibles[eraKey][levelNum] = false;

		if (typeof Storage !== "undefined" && Storage.saveCollectibles) {
			Storage.saveCollectibles(_state.collectibles);
		}

		return wasCollected;
	}

	function resetCollectibles() {
		const defaults =
			typeof Storage !== "undefined" && Storage.DEFAULTS && Storage.DEFAULTS.collectibles
				? Storage.DEFAULTS.collectibles
				: {
						era1: { 1: false, 2: false, 3: false, 4: false },
						era2: { 5: false, 6: false, 7: false },
						era3: { 8: false, 9: false, 10: false },
				  };

		_state.collectibles = JSON.parse(JSON.stringify(defaults));

		if (typeof Storage !== "undefined" && Storage.saveCollectibles) {
			Storage.saveCollectibles(_state.collectibles);
		}
	}

	// =========================================
	// ERA MANAGEMENT
	// =========================================

	/**
	 * Get era for a given level
	 * @param {number} levelNum - Level number
	 * @returns {string} Era identifier
	 */
	function getEraForLevel(levelNum) {
		if (levelNum === 0) return "snes";
		if (levelNum === 4.5) return "snes";
		if (levelNum === 7.5) return "n64";
		if (levelNum === 10.5) return "ps2";
		if (levelNum >= 1 && levelNum <= 4) return "snes";
		if (levelNum >= 5 && levelNum <= 7) return "n64";
		if (levelNum >= 8 && levelNum <= 10) return "ps2";
		return "snes"; // fallback
	}

	/**
	 * Update era based on current level
	 * @param {number} levelNum - Level number
	 */
	function updateEraForLevel(levelNum) {
		const newEra = getEraForLevel(levelNum);

		if (newEra !== _state.currentEra) {
			const previousEra = _state.currentEra;
			_state.currentEra = newEra;

			// Apply era class to body
			document.body.classList.remove(`era-${previousEra}`);
			document.body.classList.add(`era-${newEra}`);

			EventBus.emit(EventBus.Events.ERA_CHANGE, {
				from: previousEra,
				to: newEra,
			});

			console.log(`[StateManager] Era: ${previousEra} → ${newEra}`);
		}
	}

	/**
	 * Force set era (for testing/overrides)
	 * @param {string} era - Era identifier ('snes', 'n64', 'ps2')
	 */
	function setEra(era) {
		const validEras = ["snes", "n64", "ps2"];

		if (!validEras.includes(era)) {
			console.error(`[StateManager] Invalid era: ${era}`);
			return;
		}

		const previousEra = _state.currentEra;
		_state.currentEra = era;

		document.body.classList.remove(`era-${previousEra}`);
		document.body.classList.add(`era-${era}`);

		EventBus.emit(EventBus.Events.ERA_CHANGE, {
			from: previousEra,
			to: era,
		});
	}

	// =========================================
	// UI STATE
	// =========================================

	/**
	 * Set active overlay
	 * @param {string|null} overlayId - Overlay ID or null to clear
	 */
	function setActiveOverlay(overlayId) {
		_state.ui.activeOverlay = overlayId;
	}

	/**
	 * Get active overlay
	 * @returns {string|null}
	 */
	function getActiveOverlay() {
		return _state.ui.activeOverlay;
	}

	// =========================================
	// INITIALIZATION
	// =========================================

	/**
	 * Initialize state from storage
	 */
	function init() {
		// Load saved state
		const savedState = Storage.getGameState();

		_state.currentLevel = savedState.currentLevel || 1;
		_state.completedLevels = savedState.completedLevels || [];
		_state.totalScore = savedState.totalScore || 0;

		// Load collectibles (persistent)
		if (typeof Storage !== "undefined" && Storage.getCollectibles) {
			_state.collectibles = Storage.getCollectibles();
		}

		// Set initial era
		updateEraForLevel(_state.currentLevel);

		// Set initial phase
		_state.phase = GamePhase.TITLE;

		console.log("[StateManager] Initialized:", getSnapshot());

		EventBus.emit(EventBus.Events.STATE_LOAD, getSnapshot());

		// Optional: allow games to emit COLLECTIBLE_FOUND
		EventBus.on(EventBus.Events.COLLECTIBLE_FOUND, (data) => {
			if (!data) return;
			collectItem(data);
		});
	}

	/**
	 * Reset all state to defaults
	 */
	function reset() {
		_state = {
			phase: GamePhase.TITLE,
			currentLevel: 1,
			completedLevels: [],
			levelData: {
				score: 0,
				startTime: null,
				elapsedTime: 0,
				isActive: false,
			},
			totalScore: 0,
			collectibles: {
				era1: { 1: false, 2: false, 3: false, 4: false },
				era2: { 5: false, 6: false, 7: false },
				era3: { 8: false, 9: false, 10: false },
			},
			currentEra: "snes",
			ui: {
				activeOverlay: null,
				hudVisible: true,
				timelineVisible: true,
			},
		};

		updateEraForLevel(1);

		EventBus.emit(EventBus.Events.STATE_RESET);
	}

	/**
	 * Clear persisted progress and reset in-memory state (e.g. for "Play Again").
	 */
	function resetAllProgress() {
		if (typeof Storage !== "undefined" && Storage.clearAll) {
			Storage.clearAll(true);
		}
		reset();
	}

	// Public API
	return {
		// Constants
		GamePhase,

		// Getters
		getPhase,
		getCurrentLevel,
		getCompletedLevels,
		getLevelData,
		getCurrentEra,
		getEraForLevel,
		getActiveOverlay,
		getSnapshot,
		getFinalScore,
		getCollectiblesSummary,
		getUnlockedBonuses,

		// Setters
		setPhase,
		setCurrentLevel,
		completeLevel,
		updateLevelData,
		resetLevelData,
		addScore,
		// Collectibles
		getCollectibles,
		getEraKeyForLevel,
		getEraKeyForCurrentLevel,
		getCollectibleIconForEraKey,
		getCollectibleTotalForEraKey,
		getCollectibleCountForEraKey,
		isCollected,
		getCollectedCount,
		hasAllCollected,
		collectItem,
		clearCollectibleForLevel,
		resetCollectibles,
		setEra,
		setActiveOverlay,

		// Lifecycle
		init,
		reset,
		resetAllProgress,
	};
})();

// Make available globally
window.StateManager = StateManager;
