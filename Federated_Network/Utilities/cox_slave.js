// =============================================================
// cox_slave.js
// Shared math for the SLAVE NODE (SPARQL & SQL) - ES5 Pure
// =============================================================

function zeros(n, m) {
    var arr = [];
    for (var i = 0; i < n; i++) {
        var row = [];
        for (var j = 0; j < m; j++) row.push(0.0);
        arr.push(row);
    }
    return arr;
}

// Phase 1: Discover local event times
function compute_slave_discovery(yTimes, yEvents) {
    var unique_times = {};
    for (var i = 0; i < yTimes.length; i++) {
        if (yEvents[i] === 1) {
            unique_times[yTimes[i]] = true;
        }
    }
    var times = [];
    for (var t in unique_times) {
        times.push(parseFloat(t));
    }
    times.sort(function(a, b) { return a - b; });
    return times;
}

// Phase 2: Compute risk sets and partial likelihood derivatives
function compute_slave_stats(xMatrix, yTimes, yEvents, beta, global_times) {
    var p = beta.length;
    var data = [];
    var i, j, r, c;

    for (i = 0; i < xMatrix.length; i++) {
        var eta = 0.0;
        for (j = 0; j < p; j++) eta += beta[j] * xMatrix[i][j];
        
        // Clamp risk to avoid Infinity/NaN errors in calculation
        var risk = Math.exp(Math.max(-50, Math.min(50, eta)));
        data.push({t: yTimes[i], e: yEvents[i], z: xMatrix[i], risk: risk});
    }

    // Sort by time ascending
    data.sort(function(a, b) { return a.t - b.t; });

    var results = [];
    for (var k = 0; k < global_times.length; k++) {
        var t = global_times[k];
        var S0 = 0.0;
        var S1 = [];      for (i = 0; i < p; i++) S1.push(0.0);
        var S2 = zeros(p, p);
        var event_sum = []; for (i = 0; i < p; i++) event_sum.push(0.0);
        var count_events = 0;

        for (i = 0; i < data.length; i++) {
            var d = data[i];
            
            // Patient is still at risk
            if (d.t >= t) {
                S0 += d.risk;
                for (j = 0; j < p; j++) S1[j] += d.z[j] * d.risk;
                for (r = 0; r < p; r++) {
                    for (c = 0; c < p; c++) {
                        S2[r][c] += (d.z[r] * d.z[c]) * d.risk;
                    }
                }
            }
            // Patient experiences the event at exact time 't'
            if (d.t === t && d.e === 1) {
                count_events++;
                for (j = 0; j < p; j++) event_sum[j] += d.z[j];
            }
        }
        results.push({ time: t, S0: S0, S1: S1, S2: S2, event_sum: event_sum, count_events: count_events });
    }
    return results;
}