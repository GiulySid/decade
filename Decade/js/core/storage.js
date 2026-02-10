/**
 * storage.js
 * Storage wrapper for game state persistence
 * Uses sessionStorage for game_state, unlocks, and stats (session-only)
 * Uses localStorage for settings (persistent across sessions)
 */

const Storage = (function () {
	"use strict";

	// Storage key prefix (prevents collisions)
	const STORAGE_PREFIX = "decade_";

	// Storage keys
	const KEYS = {
		GAME_STATE: "game_state",
		SETTINGS: "settings",
		UNLOCKS: "unlocks",
		STATS: "stats",
		COLLECTIBLES: "collectibles",
	};

	// Default values for fresh game
	const DEFAULTS = {
		gameState: {
			currentLevel: 1,
			completedLevels: [],
			totalScore: 0,
			lastPlayed: null,
		},
		settings: {
			musicVolume: 0.7,
			sfxVolume: 0.8,
			scanlines: true,
			// TODO: Add more settings as needed
		},
		unlocks: {
			// Level unlocks (1 is always unlocked)
			levels: [1],
			// Memory content unlocked after completing each level
			memories: [],
			// Special unlockables
			extras: [],
		},
		stats: {
			totalPlayTime: 0,
			levelAttempts: {},
			bestScores: {},
			firstPlayDate: null,
		},
		collectibles: {
			era1: {
				1: false,
				2: false,
				3: false,
				4: false,
			},
			era2: {
				5: false,
				6: false,
				7: false,
			},
			era3: {
				8: false,
				9: false,
				10: false,
			},
		},
	};

	/**
	 * Get prefixed key name
	 * @private
	 */
	function _getKey(key) {
		return STORAGE_PREFIX + key;
	}

	/**
	 * Check if localStorage is available
	 * @returns {boolean}
	 */
	function isAvailable() {
		try {
			const test = "__storage_test__";
			localStorage.setItem(test, test);
			localStorage.removeItem(test);
			return true;
		} catch (e) {
			console.warn("[Storage] localStorage not available");
			return false;
		}
	}

	/**
	 * Check if sessionStorage is available
	 * @returns {boolean}
	 */
	function isSessionAvailable() {
		try {
			const test = "__storage_test__";
			sessionStorage.setItem(test, test);
			sessionStorage.removeItem(test);
			return true;
		} catch (e) {
			console.warn("[Storage] sessionStorage not available");
			return false;
		}
	}

	/**
	 * Determine which storage to use for a given key
	 * @param {string} key - Storage key
	 * @returns {Storage} localStorage or sessionStorage
	 * @private
	 */
	function _getStorage(key) {
		// Use sessionStorage for game_state, unlocks, and stats
		if (key === KEYS.GAME_STATE || key === KEYS.UNLOCKS || key === KEYS.STATS) {
			return sessionStorage;
		}
		// Use localStorage for everything else (settings, etc.)
		return localStorage;
	}

	/**
	 * Save data to storage (localStorage or sessionStorage based on key)
	 * @param {string} key - Storage key (from KEYS)
	 * @param {*} data - Data to store (will be JSON stringified)
	 * @returns {boolean} Success status
	 */
	function save(key, data) {
		const storage = _getStorage(key);
		const isSession = storage === sessionStorage;

		// Check appropriate storage availability
		if (isSession && !isSessionAvailable()) return false;
		if (!isSession && !isAvailable()) return false;

		try {
			const serialized = JSON.stringify(data);
			storage.setItem(_getKey(key), serialized);

			// Emit save event
			EventBus.emit(EventBus.Events.STATE_SAVE, { key, data });

			return true;
		} catch (error) {
			console.error("[Storage] Save failed:", error);
			return false;
		}
	}

	/**
	 * Load data from storage (localStorage or sessionStorage based on key)
	 * @param {string} key - Storage key (from KEYS)
	 * @param {*} defaultValue - Default value if key doesn't exist
	 * @returns {*} Parsed data or default value
	 */
	function load(key, defaultValue = null) {
		const storage = _getStorage(key);
		const isSession = storage === sessionStorage;

		// Check appropriate storage availability
		if (isSession && !isSessionAvailable()) return defaultValue;
		if (!isSession && !isAvailable()) return defaultValue;

		try {
			const serialized = storage.getItem(_getKey(key));

			if (serialized === null) {
				return defaultValue;
			}

			return JSON.parse(serialized);
		} catch (error) {
			console.error("[Storage] Load failed:", error);
			return defaultValue;
		}
	}

	/**
	 * Remove data from storage (localStorage or sessionStorage based on key)
	 * @param {string} key - Storage key to remove
	 */
	function remove(key) {
		const storage = _getStorage(key);
		const isSession = storage === sessionStorage;

		// Check appropriate storage availability
		if (isSession && !isSessionAvailable()) return;
		if (!isSession && !isAvailable()) return;

		try {
			storage.removeItem(_getKey(key));
		} catch (error) {
			console.error("[Storage] Remove failed:", error);
		}
	}

	/**
	 * Clear all game data from storage (both localStorage and sessionStorage)
	 * @param {boolean} confirm - Must be true to actually clear
	 */
	function clearAll(confirm = false) {
		if (!confirm) {
			console.warn("[Storage] clearAll requires confirm=true");
			return;
		}

		// Clear from both storages
		if (isAvailable()) {
			Object.values(KEYS).forEach((key) => {
				if (_getStorage(key) === localStorage) {
					remove(key);
				}
			});
		}

		if (isSessionAvailable()) {
			Object.values(KEYS).forEach((key) => {
				if (_getStorage(key) === sessionStorage) {
					remove(key);
				}
			});
		}

		EventBus.emit(EventBus.Events.STATE_RESET);
		console.log("[Storage] All game data cleared");
	}

	// =========================================
	// CONVENIENCE METHODS
	// High-level methods for common operations
	// =========================================

	/**
	 * Get full game state (with defaults merged)
	 * @returns {Object}
	 */
	function getGameState() {
		const saved = load(KEYS.GAME_STATE, {});
		return { ...DEFAULTS.gameState, ...saved };
	}

	/**
	 * Save game state
	 * @param {Object} state - Partial or full state to save
	 */
	function saveGameState(state) {
		const current = getGameState();
		const updated = { ...current, ...state, lastPlayed: Date.now() };
		save(KEYS.GAME_STATE, updated);
	}

	/**
	 * Get settings (with defaults merged)
	 * @returns {Object}
	 */
	function getSettings() {
		const saved = load(KEYS.SETTINGS, {});
		return { ...DEFAULTS.settings, ...saved };
	}

	/**
	 * Save settings
	 * @param {Object} settings - Settings to save
	 */
	function saveSettings(settings) {
		const current = getSettings();
		save(KEYS.SETTINGS, { ...current, ...settings });
	}

	/**
	 * Get unlocks
	 * @returns {Object}
	 */
	function getUnlocks() {
		const saved = load(KEYS.UNLOCKS, {});
		return {
			levels: saved.levels || [...DEFAULTS.unlocks.levels],
			memories: saved.memories || [...DEFAULTS.unlocks.memories],
			extras: saved.extras || [...DEFAULTS.unlocks.extras],
		};
	}

	/**
	 * Unlock a level
	 * @param {number} levelNum - Level number to unlock
	 */
	function unlockLevel(levelNum) {
		const unlocks = getUnlocks();

		if (!unlocks.levels.includes(levelNum)) {
			unlocks.levels.push(levelNum);
			unlocks.levels.sort((a, b) => a - b);
			save(KEYS.UNLOCKS, unlocks);

			EventBus.emit(EventBus.Events.LEVEL_UNLOCK, { level: levelNum });
		}
	}

	/**
	 * Unlock a memory (post-level reveal)
	 * @param {number} levelNum - Level number whose memory to unlock
	 */
	function unlockMemory(levelNum) {
		const unlocks = getUnlocks();

		if (!unlocks.memories.includes(levelNum)) {
			unlocks.memories.push(levelNum);
			save(KEYS.UNLOCKS, unlocks);
		}
	}

	/**
	 * Check if a level is unlocked
	 * @param {number} levelNum - Level number to check
	 * @returns {boolean}
	 */
	function isLevelUnlocked(levelNum) {
		const unlocks = getUnlocks();
		return unlocks.levels.includes(levelNum);
	}

	/**
	 * Get stats
	 * @returns {Object}
	 */
	function getStats() {
		const saved = load(KEYS.STATS, {});
		return { ...DEFAULTS.stats, ...saved };
	}

	/**
	 * Get collectibles (persistent; stored in localStorage via _getStorage fallback)
	 * @returns {Object}
	 */
	function getCollectibles() {
		const saved = load(KEYS.COLLECTIBLES, {});
		return {
			era1: { ...DEFAULTS.collectibles.era1, ...(saved.era1 || {}) },
			era2: { ...DEFAULTS.collectibles.era2, ...(saved.era2 || {}) },
			era3: { ...DEFAULTS.collectibles.era3, ...(saved.era3 || {}) },
		};
	}

	/**
	 * Save collectibles
	 * @param {Object} collectibles - Partial/full collectibles object
	 */
	function saveCollectibles(collectibles) {
		const current = getCollectibles();
		save(KEYS.COLLECTIBLES, { ...current, ...collectibles });
	}

	/**
	 * Update level best score
	 * @param {number} levelNum - Level number
	 * @param {number} score - Score achieved
	 */
	function updateBestScore(levelNum, score) {
		const stats = getStats();
		const currentBest = stats.bestScores[levelNum] || 0;

		if (score > currentBest) {
			stats.bestScores[levelNum] = score;
			save(KEYS.STATS, stats);
		}
	}

	/**
	 * Clear specific boot keys every refresh/start.
	 * User-requested keys:
	 * - decade_auth
	 * - decade_game_state
	 * - decade_unlocks
	 * - decade_collectibles
	 *
	 * This does NOT clear settings or other keys.
	 */
	function clearBootKeys() {
		// decade_auth is not part of KEYS (login page), remove raw
		try {
			if (isAvailable()) {
				localStorage.removeItem("decade_auth");
			}
		} catch (_) {}
		try {
			if (isSessionAvailable()) {
				sessionStorage.removeItem("decade_auth");
			}
		} catch (_) {}

		// Remove progress keys using our wrapper (handles correct storage)
		try {
			remove(KEYS.GAME_STATE);
		} catch (_) {}
		try {
			remove(KEYS.UNLOCKS);
		} catch (_) {}
		try {
			remove(KEYS.COLLECTIBLES);
		} catch (_) {}
	}

	// Public API
	return {
		// Core methods
		isAvailable,
		isSessionAvailable,
		save,
		load,
		remove,
		clearAll,

		// Convenience methods
		getGameState,
		saveGameState,
		getSettings,
		saveSettings,
		getUnlocks,
		unlockLevel,
		unlockMemory,
		isLevelUnlocked,
		getStats,
		getCollectibles,
		saveCollectibles,
		updateBestScore,
		clearBootKeys,

		// Constants
		KEYS,
		DEFAULTS,
	};
})();

// Make available globally
window.Storage = Storage;
