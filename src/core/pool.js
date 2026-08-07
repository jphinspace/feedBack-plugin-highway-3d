/**
 * Creates a reusable pool of Three.js objects under `parent`.
 * @param {object} parent - the Object3D new objects are added to
 * @param {() => object} mk - creates a new pool object
 */
export function pool(parent, mk) {
    const a = [];
    let n = 0;
    return {
        /** Returns the next available object, growing the pool if needed. */
        get() {
            if (n < a.length) {
                const o = a[n++];
                o.visible = true;
                if (o.center && o.center.isVector2) o.center.set(0.5, 0.5);
                return o;
            }
            const o = mk(); parent.add(o); a.push(o); n++; return o;
        },
        /** Hides every in-use object and marks the pool as fully available. */
        reset() { for (let i = 0; i < n; i++) a[i].visible = false; n = 0; },
        /** Pre-allocates up to `cap` hidden objects so later `get()` calls don't allocate. */
        warm(cap) {
            const targetLen = Math.max(0, cap | 0);
            while (a.length < targetLen) { const o = mk(); o.visible = false; parent.add(o); a.push(o); }
            return this;
        },
    };
}
