let _nextInstanceId = 0;

/** Returns a new id, monotonically increasing across all renderer instances. */
export function nextInstanceId() {
    return ++_nextInstanceId;
}
