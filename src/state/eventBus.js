/**
 * Decoupled event bus for cross-module communication.
 * Allows UI, 3D Engine, and State systems to communicate without circular dependencies.
 */
class EventBus {
    constructor() {
        this.listeners = new Map();
    }

    /**
     * Subscribe to an event.
     * @param {string} event - Event name.
     * @param {Function} callback - Callback function.
     * @returns {Function} Unsubscribe function.
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        return () => this.off(event, callback);
    }

    /**
     * Unsubscribe from an event.
     * @param {string} event - Event name.
     * @param {Function} callback - Callback function to remove.
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    /**
     * Emit an event with data.
     * @param {string} event - Event name.
     * @param {*} [data] - Event payload.
     */
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event handler for "${event}":`, error);
                }
            });
        }
    }
}

export const eventBus = new EventBus();
