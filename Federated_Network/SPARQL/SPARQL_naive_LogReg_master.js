function sparql_logreg_master(slaveDataConcat) {
    var raw = slaveDataConcat.split("|||");
    var parts = [];
    
    for (var i = 0; i < raw.length; i++) {
        var s = raw[i].trim();
        if (s.length > 0) parts.push(JSON.parse(s));
    }

    var res = logreg_master_update(parts);
    return JSON.stringify(res);
}