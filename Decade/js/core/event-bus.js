/**
 * event-bus.js
 * Simple pub/sub event system for decoupled communication
 * between game components (HUD, Timeline, Game Engine, etc.)
 */

const EventBus = (function() {
    'use strict';
    
    // Private: event listeners storage
    const _listeners = new Map();
    
    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    function on(event, callback) {
        if (!_listeners.has(event)) {
            _listeners.set(event, new Set());
        }
        
        _listeners.get(event).add(callback);
        
        // Return unsubscribe function
        return () => off(event, callback);
    }
    
    /**
     * Subscribe to an event (one-time only)
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     */
    function once(event, callback) {
        const wrapper = (data) => {
            off(event, wrapper);
            callback(data);
        };
        on(event, wrapper);
    }
    
    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler to remove
     */
    function off(event, callback) {
        if (_listeners.has(event)) {
            _listeners.get(event).delete(callback);
        }
    }
    
    /**
     * Emit an event to all subscribers
     * @param {string} event - Event name
     * @param {*} data - Data to pass to handlers
     */
    function emit(event, data) {
        if (_listeners.has(event)) {
            _listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[EventBus] Error in handler for "${event}":`, error);
                }
            });
        }
        
        // Debug logging (disable in production)
        if (window.DEBUG_EVENTS) {
            console.log(`[EventBus] ${event}`, data);
        }
    }
    
    /**
     * Remove all listeners for an event (or all events)
     * @param {string} [event] - Optional specific event to clear
     */
    function clear(event) {
        if (event) {
            _listeners.delete(event);
        } else {
            _listeners.clear();
        }
    }
    
    // =========================================
    // EVENT NAME CONSTANTS
    // Centralized event names to prevent typos
    // =========================================
    
    const Events = {
        // Game flow
        GAME_INIT: 'game:init',
        GAME_START: 'game:start',
        GAME_PAUSE: 'game:pause',
        GAME_RESUME: 'game:resume',
        GAME_RESET: 'game:reset',
        
        // Level management
        LEVEL_LOAD: 'level:load',
        LEVEL_START: 'level:start',
        LEVEL_COMPLETE: 'level:complete',
        LEVEL_FAIL: 'level:fail',
        LEVEL_UNLOCK: 'level:unlock',
        
        // Mini-game events
        MINIGAME_READY: 'minigame:ready',
        MINIGAME_START: 'minigame:start',
        MINIGAME_END: 'minigame:end',
        MINIGAME_SCORE: 'minigame:score',
        
        // UI events
        UI_OVERLAY_SHOW: 'ui:overlay:show',
        UI_OVERLAY_HIDE: 'ui:overlay:hide',
        UI_HUD_UPDATE: 'ui:hud:update',
        UI_TIMELINE_UPDATE: 'ui:timeline:update',
        
        // Memory/reveal events
        REVEAL_SHOW: 'reveal:show',
        REVEAL_DISMISS: 'reveal:dismiss',
        
        // Collectibles / Easter eggs
        COLLECTIBLE_FOUND: 'collectible:found',
        COLLECTIBLE_COLLECTED: 'collectible:collected',

        // Era/theme changes
        ERA_CHANGE: 'era:change',
        
        // Storage events
        STATE_SAVE: 'state:save',
        STATE_LOAD: 'state:load',
        STATE_RESET: 'state:reset',
        
        // Input events
        INPUT_KEY: 'input:key',
        INPUT_CLICK: 'input:click'
    };
    
    // Public API
    return {
        on,
        once,
        off,
        emit,
        clear,
        Events
    };
})();

// Make available globally
window.EventBus = EventBus;
