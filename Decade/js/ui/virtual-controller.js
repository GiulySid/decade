/**
 * virtual-controller.js
 * On-screen virtual controller for mobile (overlay style).
 * Injects input via Input.setVirtualDown + synthetic KeyboardEvents so games work unchanged.
 */

const VirtualController = (function () {
	"use strict";

	const CODE_TO_KEY = {
		ArrowLeft: "ArrowLeft",
		ArrowRight: "ArrowRight",
		ArrowUp: "ArrowUp",
		ArrowDown: "ArrowDown",
		Space: " ",
		KeyX: "x",
		KeyZ: "z",
		KeyW: "w",
		KeyA: "a",
		KeyS: "s",
		KeyD: "d",
		ShiftLeft: "Shift",
		Enter: "Enter",
		Escape: "Escape",
		NumpadMultiply: "*",
	};

	let _container = null;
	let _era = "snes";
	let _renderedEra = null;
	let _observer = null;
	let _listeners = [];
	let _blocked = false;

	function _isMobile() {
		return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;
	}

	function _isLandscape() {
		return window.matchMedia("(orientation: landscape)").matches || window.innerWidth > window.innerHeight;
	}

	function _isGameplayPhase() {
		if (typeof StateManager === "undefined") return false;
		const phase = StateManager.getPhase();
		return phase === StateManager.GamePhase.PLAYING || phase === StateManager.GamePhase.PAUSED;
	}

	function _dispatchSynthetic(code, type) {
		const key = CODE_TO_KEY[code] ?? code;
		const e = new KeyboardEvent(type === "down" ? "keydown" : "keyup", {
			key,
			code,
			bubbles: true,
			cancelable: true,
		});
		window.dispatchEvent(e);
	}

	function _bindButton(btn) {
		const code = btn.getAttribute("data-code");
		if (!code) return;

		const onDown = (e) => {
			e.preventDefault();
			btn.classList.add("is-pressed");
			try {
				btn.setPointerCapture(e.pointerId);
			} catch (_) {}
			if (typeof Input !== "undefined") Input.setVirtualDown(code, true);
			_dispatchSynthetic(code, "down");
		};

		const onUp = (e) => {
			e.preventDefault();
			btn.classList.remove("is-pressed");
			if (typeof Input !== "undefined") Input.setVirtualDown(code, false);
			_dispatchSynthetic(code, "up");
		};

		btn.addEventListener("pointerdown", onDown);
		btn.addEventListener("pointerup", onUp);
		btn.addEventListener("pointercancel", onUp);
		btn.addEventListener("pointerleave", onUp);
		_listeners.push({ btn, onDown, onUp });
	}

	function _unbindAll() {
		_listeners.forEach(({ btn, onDown, onUp }) => {
			btn.removeEventListener("pointerdown", onDown);
			btn.removeEventListener("pointerup", onUp);
			btn.removeEventListener("pointercancel", onUp);
			btn.removeEventListener("pointerleave", onUp);
		});
		_listeners = [];
	}

	function _attachPointerListeners() {
		_unbindAll();
		if (!_container) return;
		_container.querySelectorAll(".vc-btn[data-code]").forEach(_bindButton);
	}
	function _renderIntroCutScene(era) {
		_container.setAttribute("data-era", era);
		_container.innerHTML = `
            <div class="vc-cluster vc-left">
                <div class="vc-dpad">
                    <button type="button" class="vc-btn vc-btn--dpad up" data-code="ArrowUp" aria-label="Up"></button>
                    <button type="button" class="vc-btn vc-btn--dpad left" data-code="ArrowLeft" aria-label="Left"></button>
                    <button type="button" class="vc-btn vc-btn--dpad right" data-code="ArrowRight" aria-label="Right"></button>
                    <button type="button" class="vc-btn vc-btn--dpad down" data-code="ArrowDown" aria-label="Down"></button>
                </div>
            </div>

            <div class="vc-cluster vc-right">
                <div class="vc-dpad">
                    <button type="button" class="vc-btn vc-btn--dpad up" data-code="KeyW" aria-label="Up"></button>
                    <button type="button" class="vc-btn vc-btn--dpad left" data-code="KeyA" aria-label="Left"></button>
                    <button type="button" class="vc-btn vc-btn--dpad right" data-code="KeyD" aria-label="Right"></button>
                    <button type="button" class="vc-btn vc-btn--dpad down" data-code="KeyS" aria-label="Down"></button>
                </div>
            </div>

            <div class="vc-cluster vc-top-right">
                <button type="button" class="vc-btn vc-btn--small" data-code="NumpadMultiply">>></button>
                <button type="button" class="vc-btn vc-btn--small" data-code="Escape">||</button>
            </div>
        `;
		_attachPointerListeners();
	}
	function _renderSnesN64(era) {
		_container.setAttribute("data-era", era);
		_container.innerHTML = `
            <div class="vc-cluster vc-left">
                <div class="vc-dpad">
                    <button type="button" class="vc-btn vc-btn--dpad up" data-code="ArrowUp" aria-label="Up"></button>
                    <button type="button" class="vc-btn vc-btn--dpad left" data-code="ArrowLeft" aria-label="Left"></button>
                    <button type="button" class="vc-btn vc-btn--dpad right" data-code="ArrowRight" aria-label="Right"></button>
                    <button type="button" class="vc-btn vc-btn--dpad down" data-code="ArrowDown" aria-label="Down"></button>
                </div>
            </div>

            <div class="vc-cluster vc-right">
                <div class="vc-face-grid">
                    <button type="button" class="vc-btn" data-code="KeyZ">X</button>
                    <button type="button" class="vc-btn" data-code="Space">A</button>
                    <button type="button" class="vc-btn" data-code="ShiftLeft">Y</button>
                    <button type="button" class="vc-btn" data-code="KeyX">B</button>
                </div>
            </div>

            <div class="vc-cluster vc-top-right">
                <button type="button" class="vc-btn vc-btn--small" data-code="NumpadMultiply">>></button>
                <button type="button" class="vc-btn vc-btn--small" data-code="Escape">||</button>
            </div>
        `;
		_attachPointerListeners();
	}

	function _renderPs2() {
		_container.setAttribute("data-era", "ps2");
		_container.innerHTML = `
            <div class="vc-cluster vc-left">
                <div class="vc-dpad">
                    <button type="button" class="vc-btn vc-btn--dpad up" data-code="ArrowUp" aria-label="Up"></button>
                    <button type="button" class="vc-btn vc-btn--dpad left" data-code="ArrowLeft" aria-label="Left"></button>
                    <button type="button" class="vc-btn vc-btn--dpad right" data-code="ArrowRight" aria-label="Right"></button>
                    <button type="button" class="vc-btn vc-btn--dpad down" data-code="ArrowDown" aria-label="Down"></button>
                </div>
            </div>

            <div class="vc-cluster vc-right">
                <div class="vc-face-diamond">
                    <button type="button" class="vc-btn triangle" data-code="ShiftLeft">△</button>
                    <button type="button" class="vc-btn circle" data-code="Space">○</button>
                    <button type="button" class="vc-btn cross" data-code="KeyJ">✕</button>
                    <button type="button" class="vc-btn square" data-code="KeyK">□</button>
                </div>
            </div>

            <div class="vc-cluster vc-top-right">
                <button type="button" class="vc-btn vc-btn--small" data-code="NumpadMultiply">>></button>
                <button type="button" class="vc-btn vc-btn--small" data-code="Escape">||</button>
            </div>
        `;
		_attachPointerListeners();
	}

	function _render() {
		if (!_container) return;
		if (_era === "intro") {
			_renderIntroCutScene("snes");
			_renderedEra = "intro";
		} else if (_era === "ps2") {
			_renderPs2();
			_renderedEra = _era;
		} else {
			_renderSnesN64(_era);
			_renderedEra = _era;
		}
	}

	function setEra(era) {
		if (!["snes", "n64", "ps2", "intro"].includes(era)) return;
		_era = era;
		if (typeof Input !== "undefined") Input.clearAll();
		if (_container && !_container.classList.contains("vc-overlay--hidden") && _renderedEra !== _era) {
			_render();
		}
	}

	function setBlocked(blocked) {
		_blocked = !!blocked;
		_updateVisibility();
	}

	function _syncFromBody() {
		if (typeof StateManager !== "undefined" && StateManager.getCurrentLevel && StateManager.getCurrentLevel() === 0) {
			setEra("intro");
			return;
		}
		const body = document.body;
		if (body.classList.contains("era-ps2")) setEra("ps2");
		else if (body.classList.contains("era-n64")) setEra("n64");
		else setEra("snes");
	}

	function _onLevelStart(data) {
		if (typeof LevelConfig === "undefined" || !data || data.level == null) return;
		// Intro cutscene (level 0) uses the custom intro layout; other levels use their era layout
		const levelNum = data.level;
		const era = levelNum === 0 ? "intro" : (LevelConfig.getEra && LevelConfig.getEra(levelNum)) || "snes";
		setEra(era);
		_updateVisibility();
	}

	function _show() {
		if (!_container) return;
		_container.classList.remove("vc-overlay--hidden");
		_container.setAttribute("aria-hidden", "false");
		_syncFromBody();
		if (_renderedEra !== _era) _render();
	}

	function _hide() {
		if (!_container) return;
		_container.classList.add("vc-overlay--hidden");
		_container.setAttribute("aria-hidden", "true");
		_unbindAll();
		if (typeof Input !== "undefined") Input.clearAll();
	}

	function _updateVisibility() {
		const shouldShow = _isMobile() && _isLandscape() && !_blocked && _isGameplayPhase();
		if (shouldShow) _show();
		else _hide();
	}

	function init() {
		_container = document.getElementById("virtual-controller");
		if (!_container) return;

		const viewport = document.getElementById("viewport");
		if (viewport && _container.parentNode !== viewport) {
			viewport.appendChild(_container);
		}

		_container.classList.add("vc-overlay");
		_container.classList.add("vc-overlay--hidden");

		_observer = new MutationObserver(() => _syncFromBody());
		_observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

		if (typeof EventBus !== "undefined") {
			EventBus.on(EventBus.Events.LEVEL_START, _onLevelStart);
		}

		_updateVisibility();
		window.addEventListener("resize", _updateVisibility);
		window.addEventListener("orientationchange", _updateVisibility);
	}

	function destroy() {
		_hide();
		if (_observer) {
			_observer.disconnect();
			_observer = null;
		}
		if (typeof EventBus !== "undefined") {
			EventBus.off(EventBus.Events.LEVEL_START, _onLevelStart);
		}
		window.removeEventListener("resize", _updateVisibility);
		window.removeEventListener("orientationchange", _updateVisibility);
		_container = null;
		_renderedEra = null;
		if (typeof Input !== "undefined") Input.clearAll();
	}

	function onResize() {
		_updateVisibility();
	}

	return { init, destroy, setEra, setBlocked, onResize };
})();

window.VirtualController = VirtualController;
