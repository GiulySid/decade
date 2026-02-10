/**
 * input.js
 * Unified input layer: keyboard + virtual (touch).
 * isDown(code) merges both. Virtual controller sets keys and dispatches
 * synthetic KeyboardEvents so existing game listeners work unchanged.
 */

const Input = (function() {
    'use strict';

    const keyboardDown = new Map();
    const virtualDown = new Map();

    let _boundKeyDown = null;
    let _boundKeyUp = null;
    let _boundBlur = null;
    let _boundVisibility = null;

    function _isPlaying() {
        if (typeof StateManager === 'undefined') return false;
        const p = StateManager.getPhase();
        return p === 'playing' || p === 'title';
    }

    function _handleKeyDown(e) {
        keyboardDown.set(e.code, true);
        if (_isPlaying() && ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
            e.preventDefault();
        }
    }

    function _handleKeyUp(e) {
        keyboardDown.set(e.code, false);
    }

    function _handleBlur() {
        clearAll();
    }

    function _handleVisibility() {
        if (document.visibilityState !== 'visible') clearAll();
    }

    function init() {
        if (_boundKeyDown) return;
        _boundKeyDown = _handleKeyDown;
        _boundKeyUp = _handleKeyUp;
        _boundBlur = _handleBlur;
        _boundVisibility = _handleVisibility;
        window.addEventListener('keydown', _boundKeyDown);
        window.addEventListener('keyup', _boundKeyUp);
        window.addEventListener('blur', _boundBlur);
        document.addEventListener('visibilitychange', _boundVisibility);
    }

    function destroy() {
        if (!_boundKeyDown) return;
        window.removeEventListener('keydown', _boundKeyDown);
        window.removeEventListener('keyup', _boundKeyUp);
        window.removeEventListener('blur', _boundBlur);
        document.removeEventListener('visibilitychange', _boundVisibility);
        _boundKeyDown = _boundKeyUp = _boundBlur = _boundVisibility = null;
        clearAll();
    }

    function isDown(code) {
        return !!(keyboardDown.get(code) || virtualDown.get(code));
    }

    function setVirtualDown(code, down) {
        virtualDown.set(code, !!down);
    }

    function clearAll() {
        keyboardDown.clear();
        virtualDown.clear();
    }

    return { init, destroy, isDown, setVirtualDown, clearAll };
})();

window.Input = Input;
