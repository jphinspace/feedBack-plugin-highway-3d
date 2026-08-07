// Generic Three.js object-pool factory. Zero closure dependencies -- pure
// function of its own arguments -- so unlike almost everything else still in
// createFactory(), this moved with a plain cut (no factory-of-factory, no
// injected deps). Used by every pool creation site (33+ as of Stage 7).
export function pool(parent, mk) {
    const a = [];
    let n = 0;
    return {
        get() {
            if (n < a.length) {
                const o = a[n++];
                o.visible = true;
                if (o.center && o.center.isVector2) o.center.set(0.5, 0.5);
                return o;
            }
            const o = mk(); parent.add(o); a.push(o); n++; return o;
        },
        reset() { for (let i = 0; i < n; i++) a[i].visible = false; n = 0; },
        // Pre-allocate `cap` slots at construction so the first dense
        // playback frames don't pay the new-Mesh allocation cost
        // mid-RAF (felt as a stall on 7/8-string charts where the
        // visible-note count outruns the lazy-grow path). Lazy growth
        // past `cap` still works -- this is amortisation, not a cap.
        //
        // Coerce `cap` to a non-negative int32: a float would still
        // work but a callsite passing `Infinity` (or `NaN`) would
        // otherwise spin the while-loop until OOM. `cap | 0`
        // truncates floats, clamps Infinity -> 0, and turns NaN -> 0;
        // Math.max(0, ...) keeps negatives out.
        warm(cap) {
            // Local rename to avoid shadowing the pool's outer
            // `n` (the in-use index advanced by get() / reset()).
            const targetLen = Math.max(0, cap | 0);
            while (a.length < targetLen) { const o = mk(); o.visible = false; parent.add(o); a.push(o); }
            return this;
        },
    };
}
