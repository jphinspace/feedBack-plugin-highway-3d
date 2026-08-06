// Monotonic per-instance id counter, shared across every renderer instance
// (splitscreen creates one per panel). Exposed as a function rather than a
// live-binding `let`, since the increment happens from src/main.js
// (createFactory()) and only the declaring module can reassign its own
// exported `let` -- an importer can read a live binding but never write
// (or `++`) it.
let _nextInstanceId = 0;
export function nextInstanceId() {
    return ++_nextInstanceId;
}
