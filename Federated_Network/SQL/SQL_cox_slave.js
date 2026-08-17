// =============================================================
// SQL_cox_slave.js
// =============================================================

// This JS file contains the string body that R will inject into PostgreSQL.
// It maps the PL/v8 SQL environment to the ES5 shared logic.
var sql_slave_wrapper = `
(function() {
    const cols = x_columns.map(c => '"' + c + '"').join(",");
    const sql = "SELECT \\"" + time_column + "\\" AS t, \\"" + event_column + "\\" AS e, " + cols + " FROM \\"" + table_name + "\\" WHERE \\"" + time_column + "\\" IS NOT NULL";
    const rows = plv8.execute(sql);
    
    let xMatrix = [], yTimes = [], yEvents = [];
    rows.forEach(r => {
        let z = x_columns.map(c => { let v = Number(r[c]); return Number.isFinite(v) ? v : 0; });
        xMatrix.push(z);
        yTimes.push(Number(r.t));
        yEvents.push(Number(r.e));
    });

    if (!global_times || global_times.length === 0) {
        return JSON.stringify(compute_slave_discovery(yTimes, yEvents));
    } else {
        return JSON.stringify(compute_slave_stats(xMatrix, yTimes, yEvents, beta, global_times));
    }
})();
`;