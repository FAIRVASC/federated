// =============================================================
// naive_LogReg_master.js
// Shared math for the MASTER NODE (SPARQL & SQL) - ES5 Pure
// =============================================================

function logreg_master_update(slave_results) {
    if (slave_results.length === 0) throw new Error("No data received from slaves.");

    var p = slave_results[0].G.length;
    var i, j, k;
    
    var H = [];
    for (i = 0; i < p; i++) {
        var r = [];
        for (j = 0; j < p; j++) r.push(0.0);
        H.push(r);
    }
    var G = [];
    for (i = 0; i < p; i++) G.push(0.0);
    
    var LL = 0.0;
    var n_total = 0;
    var sum_y = 0.0;

    for (k = 0; k < slave_results.length; k++) {
        var data = slave_results[k];
        LL += data.LL;
        n_total += data.n;
        sum_y += data.sum_y;
        for (i = 0; i < p; i++) {
            G[i] += data.G[i];
            for (j = 0; j < p; j++) {
                H[i][j] += data.H[i][j];
            }
        }
    }

    var ridge = 1e-6;
    for (i = 0; i < p; i++) H[i][i] += ridge;

    var alpha = 0.3;
    var raw_delta = _solve(H, G);
    var delta = [];
    for (i = 0; i < p; i++) delta.push(alpha * raw_delta[i]);

    var H_inv = _inverse(H);

    return {
        delta: delta,
        H_inv: H_inv,
        LL: LL,
        n: n_total,
        sum_y: sum_y
    };
}