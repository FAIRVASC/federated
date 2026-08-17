function sparql_logreg_slave(xConcat, yConcat, betaStr) {
    if (!xConcat || xConcat.trim() === "") {
        return JSON.stringify({ H: [], G: [], LL: 0.0, n: 0, sum_y: 0.0 });
    }

    var rawX = xConcat.split("|");
    var rawY = yConcat.split("|");
    var xMatrix = [];
    var yVals = [];

    for (var i = 0; i < rawX.length; i++) {
        var r = rawX[i].trim();
        if (r.length > 0) {
            var parts = r.split(" ");
            var xRow = [1.0];
            for (var k = 0; k < parts.length; k++) xRow.push(parseFloat(parts[k]));
            xMatrix.push(xRow);
            yVals.push(parseFloat(rawY[i].trim()));
        }
    }

    var p = xMatrix.length > 0 ? xMatrix[0].length : 1;
    var beta = [];
    if (betaStr && betaStr.trim() !== "") {
        var bParts = betaStr.split(",");
        for (var i = 0; i < p; i++) beta.push(parseFloat(bParts[i]));
    } else {
        for (var i = 0; i < p; i++) beta.push(0.0);
    }

    var result = logreg_slave_stats(xMatrix, yVals, beta);
    return JSON.stringify(result);
}