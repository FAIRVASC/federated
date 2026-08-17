// =============================================================
// naive_LogReg_slave.js
// Shared math for the SLAVE NODE (SPARQL & SQL) - ES5 Pure
// =============================================================

function logreg_slave_stats(xMatrix, yVals, beta) {
    var p = beta.length;
    var i, j, n;
    
    var H = [];
    for (i = 0; i < p; i++) {
        var row = [];
        for (j = 0; j < p; j++) row.push(0.0);
        H.push(row);
    }
    var G = [];
    for (i = 0; i < p; i++) G.push(0.0);

    var LL = 0.0;
    var sum_y = 0.0;
    var nobs = 0;

    for (n = 0; n < xMatrix.length; n++) {
        var xi = xMatrix[n];
        var yi = yVals[n];
        
        if (isNaN(yi)) continue;

        sum_y += yi;

        var z = 0.0;
        for (j = 0; j < p; j++) z += xi[j] * beta[j];

        // mu = 1 / (1 + e^-z)
        var mu = 1.0 / (1.0 + Math.exp(-z));
        
        // Clamping to avoid log(0)
        if (mu < 1e-15) mu = 1e-15;
        if (mu > 1.0 - 1e-15) mu = 1.0 - 1e-15;

        var w = mu * (1.0 - mu);

        LL += yi * Math.log(mu) + (1.0 - yi) * Math.log(1.0 - mu);

        for (i = 0; i < p; i++) {
            G[i] += xi[i] * (yi - mu);
            for (j = 0; j < p; j++) {
                H[i][j] += xi[i] * xi[j] * w;
            }
        }
        nobs++;
    }

    return {
        H: H,
        G: G,
        LL: LL,
        n: nobs,
        sum_y: sum_y
    };
}