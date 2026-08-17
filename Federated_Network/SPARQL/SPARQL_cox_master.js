// =============================================================
// SPARQL_cox_master.js
// =============================================================

function sparql_cox_discovery_master(slaveDataConcat) {
    slaveDataConcat = String(slaveDataConcat);
    var raw = slaveDataConcat.split("###");
    var parts = [];
    for (var i = 0; i < raw.length; i++) {
        var s = raw[i].trim();
        if (s.length > 0) parts.push(JSON.parse(s));  
    }
    return JSON.stringify(aggregate_global_times(parts));
}

function sparql_cox_nr_master(slaveDataConcat, p) {
    slaveDataConcat = String(slaveDataConcat);
    var raw = slaveDataConcat.split("###");
    var parts = [];
    for (var i = 0; i < raw.length; i++) {
        var s = raw[i].trim();
        if (s.length > 0) parts.push(JSON.parse(s));  
    }
    var res = master_update_cox(parts, parseInt(p));
    return JSON.stringify(res);
}