// =============================================================
// SPARQL_LinReg_slave.js
// =============================================================
function sparql_linreg_slave(xConcat, yConcat) {
    if (!xConcat || xConcat.trim() === "") {
        return JSON.stringify({ XTX: [], XTY: [], n: 0, ysum: 0.0, yty: 0.0 });
    }

    var rawX = xConcat.split("|");
    var rawY = yConcat.split("|");
    var xMatrix = [];
    var yVals = [];

    for (var i = 0; i < rawX.length; i++) {
        var r = rawX[i].trim();
        if (r.length > 0) {
            var parts = r.split(" ");
            var xRow = [1.0]; // Fixed intercept
            for (var k = 0; k < parts.length; k++) xRow.push(parseFloat(parts[k]));
            xMatrix.push(xRow);
            yVals.push(parseFloat(rawY[i].trim()));
        }
    }

    var result = linreg_slave_stats(xMatrix, yVals);
    return JSON.stringify(result);
}