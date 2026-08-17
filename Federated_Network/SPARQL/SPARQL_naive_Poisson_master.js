// =============================================================
// SPARQL_naive_Poisson_master.js
// Communication interface for the MASTER node in SPARQL
// =============================================================

function sparql_poisson_master(slaveDataConcat, betaStr) {
    var raw = slaveDataConcat.split("|||");
    var parts = [];

    for (var i = 0; i < raw.length; i++) {
        var s = raw[i].trim();
        if (s.length > 0) parts.push(JSON.parse(s));
    }

    if (parts.length === 0) throw new Error("Nessun dato ricevuto dagli slave.");

    var bParts = betaStr.split(",");
    var beta = [];
    for (var i = 0; i < bParts.length; i++) beta.push(parseFloat(bParts[i]));
    
    var alpha = 0.3;
    var ridge = 1e-6;

    var res = poisson_master_update(parts, beta, beta.length, alpha, ridge);

    return JSON.stringify({
        beta: res.beta,
        cov: res.cov,
        n: res.n
    });
}