/**
 * level-manager.js
 * Handles level loading, transitions, and lifecycle
 * Coordinates between mini-games and memory reveals
 */

const LevelManager = (function () {
	"use strict";

	// Reference to current game instance
	let _currentGame = null;

	// Level timer
	let _timer = null;
	let _startTime = null;

	// =========================================
	// LEVEL LIFECYCLE
	// =========================================

	/**
	 * Load a level (prepare assets, set state)
	 * @param {number} levelNum - Level number to load
	 */
	async function loadLevel(levelNum) {
		console.log(`[LevelManager] Loading level ${levelNum}...`);

		// Validate level number
		const isBonus = levelNum === 4.5 || levelNum === 7.5 || levelNum === 10.5;
		if (!isBonus && (levelNum < 0 || levelNum > 10)) {
			console.error(`[LevelManager] Invalid level: ${levelNum}`);
			return;
		}

		// Check if level is unlocked
		// - Level 0 (intro) is always allowed
		// - Bonus levels 4.5 / 7.5 / 10.5 are interstitial and should not depend on timeline unlocks
		if (
			levelNum !== 0 &&
			levelNum !== 4.5 &&
			levelNum !== 7.5 &&
			levelNum !== 10.5 &&
			!Storage.isLevelUnlocked(levelNum)
		) {
			console.warn(`[LevelManager] Level ${levelNum} is locked`);
			return;
		}

		// Cleanup previous game if any
		if (_currentGame) {
			await unloadCurrentGame();
		}

		// Get level config
		const config = LevelConfig.getLevel(levelNum);

		if (!config) {
			console.error(`[LevelManager] No config for level ${levelNum}`);
			return;
		}

		// Update state
		StateManager.setCurrentLevel(levelNum);
		StateManager.resetLevelData();

		// Persist bonus currentLevel so refresh resumes in the bonus (no special unlock node)
		if (levelNum === 4.5 || levelNum === 7.5 || levelNum === 10.5) {
			Storage.saveGameState({ currentLevel: levelNum });
		}

		// Update HUD
		EventBus.emit(EventBus.Events.UI_HUD_UPDATE, {
			level: levelNum,
			year: config.year,
			score: 0,
		});

		// Update timeline
		if (levelNum !== 0) {
			const timelineLevel = levelNum === 4.5 ? 4 : levelNum === 7.5 ? 7 : levelNum === 10.5 ? 10 : levelNum;
			EventBus.emit(EventBus.Events.UI_TIMELINE_UPDATE, {
				currentLevel: timelineLevel,
				completedLevels: StateManager.getCompletedLevels(),
			});
		}

		// Load the mini-game
		try {
			await GameLoader.loadGame(config.gameId, config);

			EventBus.emit(EventBus.Events.MINIGAME_READY, {
				level: levelNum,
				gameId: config.gameId,
			});

			console.log(`[LevelManager] Level ${levelNum} ready`);
		} catch (error) {
			console.error(`[LevelManager] Failed to load game:`, error);
		}
	}

	/**
	 * Start the current level (begin gameplay)
	 */
	function startLevel() {
		const levelNum = StateManager.getCurrentLevel();
		console.log(`[LevelManager] Starting level ${levelNum}`);

		// Update state
		StateManager.setPhase(StateManager.GamePhase.PLAYING);
		StateManager.updateLevelData({
			startTime: Date.now(),
			isActive: true,
		});

		// Start timer
		_startTime = Date.now();
		_startLevelTimer();

		// Hide overlays, start game
		OverlayController.hideAll();

		// Emit start event
		EventBus.emit(EventBus.Events.LEVEL_START, { level: levelNum });
		EventBus.emit(EventBus.Events.MINIGAME_START, { level: levelNum });

		// Start the game (if loaded)
		if (_currentGame && typeof _currentGame.start === "function") {
			_currentGame.start();
		}
	}

	/**
	 * Complete the current level
	 * @param {number} score - Final score
	 */
	function completeLevel(score) {
		const levelNum = StateManager.getCurrentLevel();
		console.log(`[LevelManager] Level ${levelNum} complete! Score: ${score}`);

		// Stop timer
		_stopLevelTimer();

		const elapsedTime = Date.now() - _startTime;

		// Update state
		StateManager.setPhase(StateManager.GamePhase.LEVEL_COMPLETE);
		StateManager.updateLevelData({
			isActive: false,
			elapsedTime: elapsedTime,
		});

		// Record completion
		// If Level 4 and all Era 1 collected, route to bonus level before unlocking Level 5.
		if (levelNum === 4 && StateManager.hasAllCollected && StateManager.hasAllCollected("era1")) {
			StateManager.completeLevel(levelNum, score, { skipUnlockNext: true });
		} else if (levelNum === 7 && StateManager.hasAllCollected && StateManager.hasAllCollected("era2")) {
			// If Level 7 and all Era 2 collected, route to bonus level before unlocking Level 8.
			StateManager.completeLevel(levelNum, score, { skipUnlockNext: true });
		} else {
			StateManager.completeLevel(levelNum, score);
		}

		// Submit score on level transition (skip final level - name entry handles it)
		if (levelNum >= 1 && levelNum < 10) {
			_submitCurrentScore();
		}

		// Stop the game
		if (_currentGame && typeof _currentGame.stop === "function") {
			_currentGame.stop();
		}

		// Show completion overlay
		OverlayController.showLevelComplete({
			level: levelNum,
			score: score,
			time: elapsedTime,
		});
	}

	/**
	 * Fail the current level
	 * @param {string} reason - Failure reason
	 */
	function failLevel(reason = "Game Over") {
		const levelNum = StateManager.getCurrentLevel();
		console.log(`[LevelManager] Level ${levelNum} failed: ${reason}`);

		// Stop timer
		_stopLevelTimer();

		// Update state
		StateManager.updateLevelData({ isActive: false });

		// Stop the game
		if (_currentGame && typeof _currentGame.stop === "function") {
			_currentGame.stop();
		}

		// Emit fail event
		EventBus.emit(EventBus.Events.LEVEL_FAIL, {
			level: levelNum,
			reason: reason,
		});

		// TODO: Show game over overlay
	}

	/**
	 * Restart the current level
	 */
	function restartLevel() {
		const levelNum = StateManager.getCurrentLevel();
		console.log(`[LevelManager] Restarting level ${levelNum}`);

		loadLevel(levelNum);
	}

	/**
	 * Proceed to next level
	 */
	function nextLevel() {
		const currentLevel = StateManager.getCurrentLevel();

		if (currentLevel >= 10) {
			// Game complete!
			StateManager.setPhase(StateManager.GamePhase.GAME_COMPLETE);
			// TODO: Show game complete celebration
			console.log("[LevelManager] All levels complete!");
			return;
		}

		// Interstitial bonus routing: 4 -> 4.5 -> 5
		if (currentLevel === 4 && StateManager.hasAllCollected && StateManager.hasAllCollected("era1")) {
			loadLevel(4.5);
			return;
		}
		if (currentLevel === 4.5) {
			loadLevel(5);
			return;
		}

		// Interstitial bonus routing: 7 -> 7.5 -> 8
		if (currentLevel === 7 && StateManager.hasAllCollected && StateManager.hasAllCollected("era2")) {
			loadLevel(7.5);
			return;
		}
		if (currentLevel === 7.5) {
			loadLevel(8);
			return;
		}

		loadLevel(currentLevel + 1);
	}

	/**
	 * Show memory reveal for current level
	 */
	function showMemoryReveal() {
		const levelNum = StateManager.getCurrentLevel();
		const config = LevelConfig.getLevel(levelNum);

		// Bonus level has no memory reveal; go straight to next.
		if (levelNum === 4.5 || levelNum === 7.5) {
			nextLevel();
			return;
		}

		StateManager.setPhase(StateManager.GamePhase.MEMORY_REVEAL);

		OverlayController.showMemoryReveal({
			level: levelNum,
			year: config.year,
			memory: config.memory,
		});

		EventBus.emit(EventBus.Events.REVEAL_SHOW, { level: levelNum });
	}

	// =========================================
	// GAME INSTANCE MANAGEMENT
	// =========================================

	/**
	 * Set the current game instance
	 * @param {Object} gameInstance - Game instance from GameLoader
	 */
	function setCurrentGame(gameInstance) {
		_currentGame = gameInstance;
	}

	/**
	 * Get the current game instance
	 * @returns {Object|null}
	 */
	function getCurrentGame() {
		return _currentGame;
	}

	/**
	 * Unload current game
	 */
	async function unloadCurrentGame() {
		if (_currentGame) {
			if (typeof _currentGame.destroy === "function") {
				await _currentGame.destroy();
			}
			_currentGame = null;
		}
	}

	// =========================================
	// TIMER
	// =========================================

	function _startLevelTimer() {
		_timer = setInterval(() => {
			const elapsed = Date.now() - _startTime;
			StateManager.updateLevelData({ elapsedTime: elapsed });

			// TODO: Update HUD timer display
		}, 1000);
	}

	function _stopLevelTimer() {
		if (_timer) {
			clearInterval(_timer);
			_timer = null;
		}
	}

	// =========================================
	// PAUSE / RESUME
	// =========================================

	/**
	 * Pause the current level
	 */
	function pause() {
		if (StateManager.getPhase() !== StateManager.GamePhase.PLAYING) {
			return;
		}

		StateManager.setPhase(StateManager.GamePhase.PAUSED);
		_stopLevelTimer();

		if (_currentGame && typeof _currentGame.pause === "function") {
			_currentGame.pause();
		}

		OverlayController.showPause();

		EventBus.emit(EventBus.Events.GAME_PAUSE);
	}

	/**
	 * Resume the current level
	 */
	function resume() {
		if (StateManager.getPhase() !== StateManager.GamePhase.PAUSED) {
			return;
		}

		StateManager.setPhase(StateManager.GamePhase.PLAYING);
		_startLevelTimer();

		if (_currentGame && typeof _currentGame.resume === "function") {
			_currentGame.resume();
		}

		OverlayController.hideAll();

		EventBus.emit(EventBus.Events.GAME_RESUME);
	}

	// =========================================
	// SCORE SUBMISSION
	// =========================================

	/**
	 * Submit current score to leaderboard (fire-and-forget)
	 * @private
	 */
	function _submitCurrentScore() {
		if (typeof ScoresAPI === "undefined" || !ScoresAPI.submitScore) return;
		const name = (typeof sessionStorage !== "undefined" && sessionStorage.getItem("decade_player_name")) || "ANON";
		const cleanName = String(name)
			.trim()
			.toUpperCase()
			.replace(/[^A-Z0-9_]/g, "");
		const finalName = cleanName.length >= 3 ? cleanName.slice(0, 10) : "ANON";
		const score = typeof StateManager.getFinalScore === "function" ? StateManager.getFinalScore() : 0;
		const collectibles =
			typeof StateManager.getCollectiblesSummary === "function"
				? StateManager.getCollectiblesSummary()
				: { era1: 0, era2: 0, era3: 0 };
		const bonusUnlocked =
			typeof StateManager.getUnlockedBonuses === "function" ? StateManager.getUnlockedBonuses() : [];
		ScoresAPI.submitScore({ name: finalName, score, collectibles, bonusUnlocked }).catch(() => {});
	}

	// =========================================
	// INITIALIZATION
	// =========================================

	/**
	 * Handle Level 10 success: show webcam finale instead of level complete / memory reveal.
	 * @private
	 */
	async function _handleFinalLevelSuccess(score) {
		const levelNum = 10;
		_stopLevelTimer();
		const elapsedTime = _startTime ? Date.now() - _startTime : 0;

		StateManager.updateLevelData({ isActive: false, elapsedTime });
		StateManager.completeLevel(levelNum, score);

		const shouldPlayFinalBonus = StateManager.hasAllCollected && StateManager.hasAllCollected("era3");

		if (_currentGame && typeof _currentGame.stop === "function") {
			_currentGame.stop();
		}

		if (shouldPlayFinalBonus) {
			_submitCurrentScore();
			await unloadCurrentGame();
			await loadLevel(10.5);
			setTimeout(() => {
				startLevel();
			}, 200);
			return;
		}

		StateManager.setPhase(StateManager.GamePhase.GAME_COMPLETE);
		OverlayController.showNameEntryForScore();
	}

	/**
	 * Handle Level 0 success: immediately load and start Level 1 (skip overlays/reveals).
	 * @private
	 */
	async function _handleIntroSuccess() {
		_stopLevelTimer();

		if (_currentGame && typeof _currentGame.stop === "function") {
			_currentGame.stop();
		}
		await unloadCurrentGame();

		// Load Level 1 and start
		await loadLevel(1);
		setTimeout(() => {
			startLevel();
		}, 200);
	}

	/**
	 * Handle bonus (4.5) success: unlock Level 5 and immediately load/start it.
	 * @private
	 */
	async function _handleBonusSuccess(score) {
		_stopLevelTimer();

		if (_currentGame && typeof _currentGame.stop === "function") {
			_currentGame.stop();
		}
		StateManager.completeLevel(4.5, score ?? 0);
		_submitCurrentScore();
		await unloadCurrentGame();

		// Unlock next real level and proceed
		Storage.unlockLevel(5);
		await loadLevel(5);
		setTimeout(() => {
			startLevel();
		}, 200);
	}

	/**
	 * Handle bonus (7.5) success: unlock Level 8 and immediately load/start it.
	 * @private
	 */
	async function _handleBonus2Success(score) {
		_stopLevelTimer();

		if (_currentGame && typeof _currentGame.stop === "function") {
			_currentGame.stop();
		}
		StateManager.completeLevel(7.5, score ?? 0);
		_submitCurrentScore();
		await unloadCurrentGame();

		Storage.unlockLevel(8);
		await loadLevel(8);
		setTimeout(() => {
			startLevel();
		}, 200);
	}

	/**
	 * Handle final bonus (10.5) success: proceed to webcam finale.
	 * @private
	 */
	async function _handleFinalBonusSuccess() {
		_stopLevelTimer();

		if (_currentGame && typeof _currentGame.stop === "function") {
			_currentGame.stop();
		}
		await unloadCurrentGame();

		StateManager.setPhase(StateManager.GamePhase.GAME_COMPLETE);
		OverlayController.showNameEntryForScore();
	}

	/**
	 * Initialize level manager
	 */
	function init() {
		// Listen for game completion from mini-games
		EventBus.on(EventBus.Events.MINIGAME_END, (data) => {
			const levelNum = StateManager.getCurrentLevel();
			const isLastLevel = levelNum === 10;
			const isIntro = levelNum === 0;
			const isBonus = levelNum === 4.5;
			const isBonus2 = levelNum === 7.5;
			const isFinalBonus = levelNum === 10.5;

			if (data.success && isLastLevel) {
				_handleFinalLevelSuccess(data.score ?? StateManager.getLevelData().score ?? 0);
				return;
			}

			if (data.success && isIntro) {
				_handleIntroSuccess();
				return;
			}

			if (data.success && isBonus) {
				_handleBonusSuccess(data.score ?? StateManager.getLevelData().score ?? 0);
				return;
			}

			if (data.success && isBonus2) {
				_handleBonus2Success(data.score ?? StateManager.getLevelData().score ?? 0);
				return;
			}

			if (data.success && isFinalBonus) {
				_handleFinalBonusSuccess();
				return;
			}

			if (data.success) {
				completeLevel(data.score || StateManager.getLevelData().score);
			} else {
				failLevel(data.reason);
			}
		});

		console.log("[LevelManager] Initialized");
	}

	// Public API
	return {
		// Level lifecycle
		loadLevel,
		startLevel,
		completeLevel,
		failLevel,
		restartLevel,
		nextLevel,
		showMemoryReveal,

		// Game management
		setCurrentGame,
		getCurrentGame,
		unloadCurrentGame,

		// Pause/Resume
		pause,
		resume,

		// Init
		init,
	};
})();

// Make available globally
window.LevelManager = LevelManager;
