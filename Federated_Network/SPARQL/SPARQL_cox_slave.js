// =============================================================
// SPARQL_cox_slave.js
// =============================================================

function sparql_cox_discovery_slave(yTimesConcat, yEventsConcat) {
    yTimesConcat = String(yTimesConcat); yEventsConcat = String(yEventsConcat);
    if (!yTimesConcat || yTimesConcat.trim() === "") return JSON.stringify([]);
    var rawT = yTimesConcat.split(";"); var rawE = yEventsConcat.split(";");
    var yTimes = [], yEvents = [];
    for (var i = 0; i < rawT.length; i++) {
        if (rawT[i].trim().length > 0) {
            yTimes.push(parseFloat(rawT[i].trim()));
            yEvents.push(parseInt(rawE[i].trim()));
        }
    }
    return JSON.stringify(compute_slave_discovery(yTimes, yEvents));
}

function sparql_cox_nr_slave(xConcat, yTimesConcat, yEventsConcat, betaStr, globalTimesStr) {
    xConcat = String(xConcat); yTimesConcat = String(yTimesConcat); yEventsConcat = String(yEventsConcat);
    betaStr = String(betaStr); globalTimesStr = String(globalTimesStr);
    if (!xConcat || xConcat.trim() === "") return JSON.stringify([]);
    var rawX = xConcat.split(";"); var rawT = yTimesConcat.split(";"); var rawE = yEventsConcat.split(";");
    var xMatrix = [], yTimes = [], yEvents = [];
    for (var i = 0; i < rawX.length; i++) {
        var r = rawX[i].trim();
        if (r.length > 0) {
            var parts = r.split(" ");
            var xRow = [];
            for (var k = 0; k < parts.length; k++) xRow.push(parseFloat(parts[k]));
            xMatrix.push(xRow);
            yTimes.push(parseFloat(rawT[i].trim()));
            yEvents.push(parseInt(rawE[i].trim()));
        }
    }
    var p = xMatrix.length > 0 ? xMatrix[0].length : 1;
    var beta = []; var bParts = betaStr.split(",");
    for (var i = 0; i < p; i++) beta.push(parseFloat(bParts[i]));
    var global_times = []; var tParts = globalTimesStr.split(",");
    for (var i = 0; i < tParts.length; i++) {
        if (tParts[i].trim().length > 0) global_times.push(parseFloat(tParts[i]));
    }
    return JSON.stringify(compute_slave_stats(xMatrix, yTimes, yEvents, beta, global_times));
}