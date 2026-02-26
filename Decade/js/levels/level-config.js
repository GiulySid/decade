/**
 * level-config.js
 * Configuration for all 10 levels
 * Defines year, era, mini-game, and memory content for each level
 */

const LevelConfig = (function () {
	"use strict";

	// =========================================
	// SPRITE CONFIGURATION
	// Individual sprite images per year
	// =========================================

	const _spriteConfig = {
		// Base path for sprite images
		basePath: "Decade/assets/sprites/",

		// Fixed display size for all sprites
		displayWidth: 40,
		displayHeight: 40,

		// Sprite file mapping by year
		// Set to null if no sprite exists for that year
		sprites: {
			2016: "2016.png",
			2017: "2017.png",
			2018: "2018.png",
			2019: "2019.png",
			2020: "2020.png",
			2021: "2021.png",
			2022: "2022.png",
			2023: "2023.png",
			2024: "2024.png",
			2025: "2025.png",
			2026: "2025.png" /* Level 10 (year 2026) reuses 2025 sprite */,
		},
	};

	// =========================================
	// LEVEL DEFINITIONS
	// =========================================

	const _levels = [
		// ===== INTRO CUTSCENE (pre-Level 1) =====
		{
			level: 0,
			year: 2015,
			era: "snes",
			title: "The Beginning",
			gameId: "intro-cutscene",
			gameType: "cutscene",
			description: "A campus. A meeting. The start.",
			memory: { text: "", image: "" },
			config: {
				stepPx: 22,
				stepHoldIntervalMs: 140,
				stepSpriteMs: 120,
				meetingZone: { x: 440, y: 300, w: 90, h: 120 },
				simoneStartX: 40,
				giuliaStartX: 900,
				groundY: 550,
			},
		},

		// ===== ERA: SNES (Levels 1-4) =====
		{
			level: 1,
			year: 2016,
			era: "snes",
			title: "Start",
			gameId: "tetris",
			gameType: "tetris",
			description: "Where it all started...",
			memory: {
				text: "Life dropped a new block. COMBO! Two lines cleared.",
				image: "Decade/assets/images/memories/2016.jpg", // TODO: Add image
			},
			config: {
				difficulty: 1,
				linesToClear: 10, // Win condition for tetris
				timeLimit: 0, // No time limit for tetris
			},
		},
		{
			level: 2,
			year: 2017,
			era: "snes",
			title: "Exploration",
			gameId: "bomberman",
			gameType: "bomberman",
			description: "Building something together...",
			memory: {
				text: "Clearing blocks by day. Building dreams by night.",
				image: "Decade/assets/images/memories/2017.jpg",
			},
			config: {
				difficulty: 1.2,
				blocksToDestroy: 10, // Win condition for bomberman
				timeLimit: 0, // No time limit
			},
		},
		{
			level: 3,
			year: 2018,
			era: "snes",
			title: "Run & Gun",
			gameId: "contra3",
			gameType: "shooter",
			description: "Finding our rhythm...",
			memory: {
				text: "Run. Shoot. Survive.",
				image: "Decade/assets/images/memories/2018.jpg",
			},
			config: {
				difficulty: 1.4,
				killsToWin: 25,
				timeLimit: 0,
			},
		},

		{
			level: 4,
			year: 2019,
			era: "snes",
			title: "Adventures",
			gameId: "final-fight",
			gameType: "beat-em-up",
			description: "Learning to fight together...",
			memory: {
				text: "Final boss: IKEA.",
				image: "Decade/assets/images/memories/2019.jpg",
			},
			config: {
				difficulty: 1.6,
				enemiesToWin: 12,
				maxEnemiesOnScreen: 3,
				stageLength: 1800,
				timeLimit: 0,
			},
		},

		// ===== BONUS (Unlocked by collecting all 💾 in Levels 1-4) =====
		// Note: This is intentionally NOT a timeline node; it’s an interstitial level.
		{
			level: 4.5,
			year: 2019,
			era: "snes",
			title: "BONUS: Arcade",
			gameId: "pacman",
			gameType: "bonus",
			description: "Bonus unlocked!",
			memory: { text: "", image: "" },
			config: {
				difficulty: 1.8,
				targetScore: 2500,
				timeLimit: 0,
			},
		},

		// ===== ERA: N64 (Levels 5-7) =====
		{
			level: 5,
			year: 2020,
			era: "n64",
			title: "The Storm",
			gameId: "asteroid-survival",
			gameType: "survival",
			description: "Weathering challenges together...",
			memory: {
				text: "World paused. We didn’t.",
				image: "Decade/assets/images/memories/2020.jpg",
			},
			config: {
				difficulty: 1.8,

				// Win condition: survive for N seconds
				timeLimit: 75,

				// Tuning for Asteroid Survival
				surviveSecondsToWin: 60,
				lives: 3,
				asteroidSpawnRate: 650, // ms (baseline; difficulty scales it)
				asteroidSpeedMin: 120, // px/s (baseline)
				asteroidSpeedMax: 360, // px/s (baseline)
				maxAsteroids: 18,

				// Keep the existing "targetScore" pattern (optional; used for HUD/score feel)
				targetScore: 900,
			},
		},
		{
			level: 6,
			year: 2021,
			era: "n64",
			title: "The Storm",
			gameId: "kirby-64",
			gameType: "platformer",
			description: "Weathering challenges together...",
			memory: {
				text: "New world unlocked.",
				image: "Decade/assets/images/memories/2020.jpg",
			},
			config: {
				difficulty: 1.8,

				// Kirby 64 win condition (simple + clear)
				starsToWin: 25,

				// Light stage progression (virtual length)
				stageLength: 2600,

				// Keep your existing generic fields (HUD/overlays may rely on them)
				targetScore: 900,
				timeLimit: 75,
			},
		},
		{
			level: 7,
			year: 2022,
			era: "n64",
			title: "Super Mario 64",
			gameId: "super-mario-64",
			gameType: "platformer-3d-lite",
			description: "Learning to jump higher together...",
			memory: {
				text: "Every challenge felt lighter when we jumped together.",
				image: "Decade/assets/images/memories/2021.jpg",
			},
			config: {
				difficulty: 2.0,

				// Core Mario-style win condition
				starsToWin: 5, // collect 5 stars to finish the level

				// Stage tuning
				stageLength: 3200, // longer than Kirby
				timeLimit: 90,

				// Player tuning
				lives: 3,

				// Scoring
				targetScore: 1200,
			},
		},

		// ===== BONUS (Unlocked by collecting all 🦠 in Levels 5-7) =====
		// Note: This is intentionally NOT a timeline node; it’s an interstitial level.
		{
			level: 7.5,
			year: 2022,
			era: "n64",
			title: "BONUS: Space Invaders",
			gameId: "space-invaders",
			gameType: "bonus",
			description: "Bonus unlocked!",
			memory: { text: "", image: "" },
			config: {
				difficulty: 2.0,
				wavesToWin: 2,
				lives: 3,
				timeLimit: 0,
			},
		},

		// ===== ERA: PS2 (Levels 8-10) =====
		{
			level: 8,
			year: 2023,
			era: "ps2",
			title: "Dreams",
			gameId: "metal-gear-3d",
			gameType: "stealth-3d",
			description: "Reaching for the stars...",
			memory: {
				text: "Expansion pack installed.",
				image: "Decade/assets/images/memories/2023.jpg",
			},
			config: {
				difficulty: 2.4,
				guardCount: 3,
				playerSpeed: 3.2,
				runMultiplier: 1.6,
				guardSpeed: 2.4,
				visionRange: 7.5,
				visionAngleDeg: 75,
				alertRisePerSec: 20,
				alertDecayPerSec: 16,
				timeLimit: 90,
			},
		},
		{
			level: 9,
			year: 2024,
			era: "ps2",
			title: "Tekken",
			gameId: "tekken",
			gameType: "fighter",
			description: "Fighting for what matters...",
			memory: {
				text: "Strength unlocked.",
				image: "Decade/assets/images/memories/2024.jpg",
			},
			config: {
				difficulty: 2.6,
				targetScore: 200,
				timeLimit: 60,
				roundsToWin: 2,
				maxRounds: 3,
				p1MaxHp: 100,
				p2MaxHp: 100,
				walkSpeed: 220,
				jumpVel: 700,
				gravity: 1400,
				aiAggression: 0.55,
			},
		},
		{
			level: 10,
			year: 2026,
			era: "ps2",
			title: "Forever",
			gameId: "super-monkey-ball",
			gameType: "tilt-3d",
			description: "Roll to the goal. Don't fall.",
			memory: {
				text: "Don’t fall.",
				image: "Decade/assets/images/memories/2025.jpg",
			},
			config: {
				difficulty: 3.0,
				timeLimit: 75,
				maxTiltDeg: 14,
				gravity: 14.0,
				friction: 0.985,
				ballRadius: 0.6,
				stageWidth: 44,
				stageLength: 24,
				goalRadius: 1,
			},
		},

		// ===== BONUS (Unlocked by collecting all 🌰 in Levels 8-10) =====
		// Note: This is intentionally NOT a timeline node; it’s an interstitial level.
		{
			level: 10.5,
			year: 2025,
			era: "ps2",
			title: "BONUS: Arkanoid",
			gameId: "arkanoid",
			gameType: "bonus",
			description: "Bonus unlocked!",
			memory: { text: "", image: "" },
			config: {
				difficulty: 2.4,
				lives: 3,
				timeLimit: 0,
				paddleSpeed: 520,
				ballSpeed: 320,
				ballSpeedMax: 520,
				brickRows: 6,
				brickCols: 10,
				powerupChance: 0.18,
			},
		},
	];

	// =========================================
	// GETTERS
	// =========================================

	/**
	 * Get configuration for a specific level
	 * @param {number} levelNum - Level number (0-10)
	 * @returns {Object|null} Level configuration
	 */
	function getLevel(levelNum) {
		// Levels are keyed by their `level` field (supports Level 0 intro).
		return _levels.find((lvl) => lvl.level === levelNum) || null;
	}

	/**
	 * Get all levels
	 * @returns {Object[]} Array of all level configs
	 */
	function getAllLevels() {
		return [..._levels];
	}

	/**
	 * Get levels by era
	 * @param {string} era - Era identifier ('snes', 'n64', 'ps2')
	 * @returns {Object[]} Levels in that era
	 */
	function getLevelsByEra(era) {
		return _levels.filter((level) => level.era === era);
	}

	/**
	 * Get year for a level
	 * @param {number} levelNum - Level number
	 * @returns {number} Year
	 */
	function getYear(levelNum) {
		const level = getLevel(levelNum);
		return level ? level.year : null;
	}

	/**
	 * Get era for a level
	 * @param {number} levelNum - Level number
	 * @returns {string} Era identifier
	 */
	function getEra(levelNum) {
		const level = getLevel(levelNum);
		return level ? level.era : "snes";
	}

	/**
	 * Get total number of levels
	 * @returns {number}
	 */
	function getTotalLevels() {
		return _levels.length;
	}

	// =========================================
	// SPRITE GETTERS
	// =========================================

	/**
	 * Get sprite info for a specific level
	 * @param {number} levelNum - Level number (1-10)
	 * @returns {Object|null} Sprite info with path, dimensions, era
	 */
	function getSpriteForLevel(levelNum) {
		const level = getLevel(levelNum);
		if (!level) return null;

		const year = level.year;
		const era = level.era;
		const spriteFile = _spriteConfig.sprites[year];

		// No sprite for this year
		if (!spriteFile) {
			return null;
		}

		return {
			src: _spriteConfig.basePath + spriteFile,
			width: _spriteConfig.displayWidth,
			height: _spriteConfig.displayHeight,
			era: era,
			year: year,
		};
	}

	/**
	 * Get all sprite paths (for preloading)
	 * @returns {string[]} Array of sprite image paths
	 */
	function getAllSpritePaths() {
		const paths = [];
		Object.entries(_spriteConfig.sprites).forEach(([year, file]) => {
			if (file) {
				paths.push(_spriteConfig.basePath + file);
			}
		});
		return paths;
	}

	// Public API
	return {
		getLevel,
		getAllLevels,
		getLevelsByEra,
		getYear,
		getEra,
		getTotalLevels,
		getSpriteForLevel,
		getAllSpritePaths,
	};
})();

// Make available globally
window.LevelConfig = LevelConfig;
