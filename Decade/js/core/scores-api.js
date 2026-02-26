/**
 * scores-api.js
 * Frontend API for Decade arcade scores (file-based backend)
 */

const ScoresAPI = (function () {
	"use strict";

	// Use same origin (works when served by node server) or override via window.DECADE_SCORES_API
	const BASE = "https://decadeserver.onrender.com";

	/**
	 * Fetch leaderboard from backend
	 * @returns {Promise<{ scores: Array, updatedAt: string }>}
	 */
	async function fetchScores() {
		const res = await fetch(BASE + "/scores", { method: "GET" });
		if (!res.ok) throw new Error("Scores unavailable");
		return res.json();
	}

	/**
	 * Submit a score to the leaderboard (insert new entry)
	 * @param {Object} entry
	 * @param {string} entry.name - 3–10 chars, A–Z, 0–9, _
	 * @param {number} entry.score
	 * @param {{ era1: number, era2: number, era3: number }} entry.collectibles
	 * @param {string[]} entry.bonusUnlocked
	 * @returns {Promise<{ scores: Array, updatedAt: string }>}
	 */
	async function submitScore(entry) {
		const res = await fetch(BASE + "/scores", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(entry),
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.error || "Failed to save score");
		}
		return res.json();
	}

	/**
	 * Update an existing score by name (key)
	 * @param {Object} entry - same shape as submitScore
	 * @returns {Promise<{ scores: Array, updatedAt: string }>}
	 * @throws if name not found (404)
	 */
	async function updateScore(entry) {
		const res = await fetch(BASE + "/scores", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(entry),
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.error || "Failed to update score");
		}
		return res.json();
	}

	/**
	 * Check if backend is reachable
	 */
	async function isAvailable() {
		try {
			await fetch(BASE + "/scores", { method: "GET" });
			return true;
		} catch {
			return false;
		}
	}

	return { fetchScores, submitScore, updateScore, isAvailable };
})();

window.ScoresAPI = ScoresAPI;
