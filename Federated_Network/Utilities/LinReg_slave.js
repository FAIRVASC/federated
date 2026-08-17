// =============================================================
// LinReg_slave.js
// Shared math for the SLAVE NODE (SPARQL & SQL) - ES5 Pure
// =============================================================

function linreg_slave_stats(xMatrix, yVals) {
    var p = xMatrix.length > 0 ? xMatrix[0].length : 0;
    var i, j, n;
    
    var XTX = [];
    var XTY = [];
    for (i = 0; i < p; i++) {
        var row = [];
        for (j = 0; j < p; j++) row.push(0.0);
        XTX.push(row);
        XTY.push(0.0);
    }
    
    var ysum = 0.0;
    var yty = 0.0;
    var nobs = 0;

    for (n = 0; n < xMatrix.length; n++) {
        var xi = xMatrix[n];
        var yi = yVals[n];
        
        if (isNaN(yi)) continue;

        ysum += yi;
        yty += yi * yi;

        for (i = 0; i < p; i++) {
            XTY[i] += xi[i] * yi;
            for (j = 0; j < p; j++) {
                XTX[i][j] += xi[i] * xi[j];
            }
        }
        nobs++;
    }

    return {
        XTX: XTX,
        XTY: XTY,
        n: nobs,
        ysum: ysum,
        yty: yty
    };
}