// =============================================================
// naive_Poisson_slave.js
// Shared math for the SLAVE NODE (SPARQL & SQL)
// =============================================================

function poisson_slave_stats(xMatrix, yVals, beta) {
    var p = beta.length;
    var XTWX = [];
    for (var i = 0; i < p; i++) {
        var r = [];
        for (var j = 0; j < p; j++) r.push(0.0);
        XTWX.push(r);
    }
    
    var XTWZ = [];
    for (var i = 0; i < p; i++) XTWZ.push(0.0);
    var nobs = 0;

    for (var n = 0; n < xMatrix.length; n++) {
        var x = xMatrix[n];
        var y = yVals[n];

        if (isNaN(y)) continue;

        var eta = 0.0;
        for (var i = 0; i < p; i++) eta += beta[i] * x[i];

        var mu = Math.exp(eta);

        // Clamping per stabilità numerica
        if (mu > 1e10 || mu < 1e-10) continue;

        var w = mu;
        var z = eta + (y - mu) / mu;

        for (var i = 0; i < p; i++) {
            XTWZ[i] += w * x[i] * z;
            for (var j = 0; j < p; j++) {
                XTWX[i][j] += w * x[i] * x[j];
            }
        }
        nobs++;
    }

    return {
        xtwx: XTWX,
        xtwz: XTWZ,
        n: nobs
    };
}