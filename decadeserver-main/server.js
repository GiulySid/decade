/**
 * Decade - Single lightweight server
 * Serves the game + scores API from one folder. No extra deps.
 * Run: node server.js  →  open http://localhost:3000
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const SCORES_PATH = process.env.SCORES_PATH || path.join(ROOT, "Decade", "data", "scores.json");
const MAX_ENTRIES = 100;

const MIMES = {
	".html": "text/html",
	".css": "text/css",
	".js": "application/javascript",
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".ico": "image/x-icon",
	".svg": "image/svg+xml",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

// ---- Scores (file-based) ----
function ensureScoresFile() {
	const dir = path.dirname(SCORES_PATH);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	if (!fs.existsSync(SCORES_PATH)) {
		fs.writeFileSync(SCORES_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), scores: [] }, null, 2));
	}
}

function readScores() {
	ensureScoresFile();
	return JSON.parse(fs.readFileSync(SCORES_PATH, "utf8"));
}

function writeScores(data) {
	ensureScoresFile();
	data.updatedAt = new Date().toISOString();
	fs.writeFileSync(SCORES_PATH, JSON.stringify(data, null, 2));
}

function sortScores(scores) {
	return scores.sort((a, b) => {
		if (a.score !== b.score) return b.score - a.score;
		const ta = (a.collectibles?.era1 || 0) + (a.collectibles?.era2 || 0) + (a.collectibles?.era3 || 0);
		const tb = (b.collectibles?.era1 || 0) + (b.collectibles?.era2 || 0) + (b.collectibles?.era3 || 0);
		if (ta !== tb) return tb - ta;
		const da = a.date ? new Date(a.date).getTime() : 0;
		const db = b.date ? new Date(b.date).getTime() : 0;
		return da - db;
	});
}

function parseBody(req) {
	return new Promise((resolve) => {
		let b = "";
		req.on("data", (c) => (b += c));
		req.on("end", () => {
			try {
				resolve(b ? JSON.parse(b) : {});
			} catch {
				resolve({});
			}
		});
	});
}

// ---- Static file serving ----
function serveFile(filePath, res) {
	const ext = path.extname(filePath);
	const mime = MIMES[ext] || "application/octet-stream";
	fs.readFile(filePath, (err, data) => {
		if (err) {
			res.writeHead(404);
			res.end("Not found");
			return;
		}
		res.setHeader("Content-Type", mime);
		res.writeHead(200);
		res.end(data);
	});
}

const server = http.createServer(async (req, res) => {
	const url = req.url.split("?")[0];
	// CORS
	//res.setHeader("Access-Control-Allow-Origin", "https://decadex.it"); // oppure "https://www.decadex.it"
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
	res.setHeader("Access-Control-Allow-Origin", "*");
	// Scores API
	if (url === "/scores" || url === "/scores/") {
		res.setHeader("Content-Type", "application/json");
		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}
		if (req.method === "GET") {
			try {
				res.writeHead(200);
				res.end(JSON.stringify(readScores()));
			} catch (e) {
				res.writeHead(500);
				res.end(JSON.stringify({ error: "Failed to read scores" }));
			}
			return;
		}
		if (req.method === "PUT") {
			try {
				const body = await parseBody(req);
				const name = (typeof body.name === "string" ? body.name : "")
					.trim()
					.toUpperCase()
					.replace(/[^A-Z0-9_]/g, "");
				if (name.length < 3 || name.length > 10) {
					res.writeHead(400);
					res.end(JSON.stringify({ error: "Name must be 3–10 chars (A–Z, 0–9, _)" }));
					return;
				}
				const score = typeof body.score === "number" ? Math.floor(body.score) : Number(body.score) || 0;
				const collectibles =
					body.collectibles && typeof body.collectibles === "object"
						? {
								era1: Math.max(0, parseInt(body.collectibles.era1, 10) || 0),
								era2: Math.max(0, parseInt(body.collectibles.era2, 10) || 0),
								era3: Math.max(0, parseInt(body.collectibles.era3, 10) || 0),
						  }
						: { era1: 0, era2: 0, era3: 0 };
				const bonusUnlocked = Array.isArray(body.bonusUnlocked)
					? body.bonusUnlocked.filter((b) => typeof b === "string")
					: [];
				const data = readScores();
				const idx = data.scores.findIndex((e) => String(e.name || "").toUpperCase() === name);
				if (idx === -1) {
					res.writeHead(404);
					res.end(JSON.stringify({ error: "Name not found" }));
					return;
				}
				data.scores[idx] = {
					...data.scores[idx],
					score,
					collectibles,
					bonusUnlocked,
					date: new Date().toISOString().slice(0, 10),
				};
				data.scores = sortScores(data.scores).slice(0, MAX_ENTRIES);
				writeScores(data);
				res.writeHead(200);
				res.end(JSON.stringify(data));
			} catch (e) {
				res.writeHead(500);
				res.end(JSON.stringify({ error: "Failed to update score" }));
			}
			return;
		}
		if (req.method === "POST") {
			try {
				const body = await parseBody(req);
				const name = (typeof body.name === "string" ? body.name : "")
					.trim()
					.toUpperCase()
					.replace(/[^A-Z0-9_]/g, "");
				if (name.length < 3 || name.length > 10) {
					res.writeHead(400);
					res.end(JSON.stringify({ error: "Name must be 3–10 chars (A–Z, 0–9, _)" }));
					return;
				}
				const score = typeof body.score === "number" ? Math.floor(body.score) : Number(body.score) || 0;
				const collectibles =
					body.collectibles && typeof body.collectibles === "object"
						? {
								era1: Math.max(0, parseInt(body.collectibles.era1, 10) || 0),
								era2: Math.max(0, parseInt(body.collectibles.era2, 10) || 0),
								era3: Math.max(0, parseInt(body.collectibles.era3, 10) || 0),
						  }
						: { era1: 0, era2: 0, era3: 0 };
				const bonusUnlocked = Array.isArray(body.bonusUnlocked)
					? body.bonusUnlocked.filter((b) => typeof b === "string")
					: [];
				const data = readScores();
				const nameExists = data.scores.some((e) => String(e.name || "").toUpperCase() === name);
				if (nameExists) {
					res.writeHead(400);
					res.end(JSON.stringify({ error: "Name already taken" }));
					return;
				}
				data.scores.push({ name, score, collectibles, bonusUnlocked, date: new Date().toISOString().slice(0, 10) });
				data.scores = sortScores(data.scores).slice(0, MAX_ENTRIES);
				writeScores(data);
				res.writeHead(200);
				res.end(JSON.stringify(data));
			} catch (e) {
				res.writeHead(500);
				res.end(JSON.stringify({ error: "Failed to save score" }));
			}
			return;
		}
	}

	// Static files: / → login.html, /index.html → index.html, /Decade/... → files
	let filePath = path.join(ROOT, url === "/" ? "login.html" : url.replace(/^\//, ""));
	const resolved = path.resolve(filePath);
	if (!resolved.startsWith(path.resolve(ROOT))) {
		res.writeHead(403);
		res.end("Forbidden");
		return;
	}
	if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
		serveFile(filePath, res);
		return;
	}
	res.writeHead(404);
	res.end("Not found");
});

ensureScoresFile();

const PORTS = [PORT, 3001, 8080, 8081].filter((p, i, a) => a.indexOf(p) === i);

function tryListen(idx) {
	const p = PORTS[idx] ?? PORTS[0];
	function onError(err) {
		if (err.code === "EADDRINUSE" && idx < PORTS.length - 1) {
			tryListen(idx + 1);
		} else {
			console.error(`[Decade] Port ${p} in use. Try: PORT=8080 node server.js`);
			process.exit(1);
		}
	}
	server.once("error", onError);
	server.listen(p, () => {
		server.removeListener("error", onError);
		console.log(`[Decade] Game + scores at http://localhost:${p}`);
		console.log(`         Open this URL to play. Scores saved in Decade/data/scores.json`);
	});
}
tryListen(0);
