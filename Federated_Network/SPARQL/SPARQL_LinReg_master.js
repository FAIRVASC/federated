// =============================================================
// SPARQL_LinReg_master.js
// =============================================================
function sparql_linreg_master(slaveDataConcat) {
    var raw = slaveDataConcat.split("|||");
    var parts = [];
    
    for (var i = 0; i < raw.length; i++) {
        var s = raw[i].trim();
        if (s.length > 0) parts.push(JSON.parse(s));
    }

    var res = linreg_master_update(parts);
    return JSON.stringify(res);
}