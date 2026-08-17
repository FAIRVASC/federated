// =============================================================
// SQL_LinReg_master.js
// PL/v8 function body for the SQL MASTER
// =============================================================

const cols_sql = x_cols.map(c => "'" + c + "'").join(",");
let slave_results = [];

// Query workers sequentially/parallelly
for (const s of slaves) {
    const conninfo = "host=" + s + " dbname=postgres user=worker_user password=worker";

    const sql = `
        SELECT result_json 
        FROM dblink(
            '${conninfo}',
            $dblink$
                SELECT sql_linreg_slave(
                    '${tbl_name}',
                    '${y_col}',
                    ARRAY[${cols_sql}]::text[]
                )
            $dblink$
        ) AS t(result_json text);
    `;

    const r = plv8.execute(sql)[0];
    if (r && r.result_json) {
        slave_results.push(JSON.parse(r.result_json));
    }
}

// Compute the OLS solution
const res = linreg_master_update(slave_results);

// We return the aggregated statistical block as JSON so the R script 
// can parse and format it exactly identical to the SPARQL flow.
return JSON.stringify(res);