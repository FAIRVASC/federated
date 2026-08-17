// =============================================================
// SQL_cox_master.js
// =============================================================

const p = x_cols.length;
let beta = Array(p).fill(0.0);
const x_cols_pg = "{" + x_cols.join(",") + "}";
const cols_sql_arr = x_cols.map(c => "'" + c + "'").join(",");

// --- PHASE 1: DISCOVER GLOBAL EVENT TIMES ---
let slave_times = [];
for (const s of slaves) {
    const conninfo = "host=" + s + " dbname=postgres user=worker_user password=worker";
    const sql_discovery = `
        SELECT result_json FROM dblink(
            '${conninfo}',
            $dblink$
                SELECT sql_cox_slave(
                    '${tbl_name}', '${time_col}', '${event_col}',
                    ARRAY[${cols_sql_arr}]::text[], ARRAY[]::float8[], ARRAY[]::float8[]
                )
            $dblink$
        ) AS t(result_json text);
    `;
    const query_result = plv8.execute(sql_discovery)[0];
    if (query_result && query_result.result_json) {
        slave_times.push(JSON.parse(query_result.result_json));
    }
}

let global_times = aggregate_global_times(slave_times);
const global_times_pg = "{" + global_times.join(",") + "}";

// --- PHASE 2: NEWTON-RAPHSON LOOP ---
let cov_final = null;

for (let iter = 1; iter <= max_iter; iter++) {
    const beta_pg = "{" + beta.join(",") + "}";
    let slave_results = [];

    for (const s of slaves) {
        const conninfo = "host=" + s + " dbname=postgres user=worker_user password=worker";
        const sql_nr = `
            SELECT result_json FROM dblink(
                '${conninfo}',
                $dblink$
                    SELECT sql_cox_slave(
                        '${tbl_name}', '${time_col}', '${event_col}',
                        ARRAY[${cols_sql_arr}]::text[], '${beta_pg}'::float8[], '${global_times_pg}'::float8[]
                    )
                $dblink$
            ) AS t(result_json text);
        `;
        const r = plv8.execute(sql_nr)[0];
        if (r && r.result_json) {
            slave_results.push(JSON.parse(r.result_json));
        }
    }

    const res = master_update_cox(slave_results, p);
    
    let diff = 0;
    for (let i = 0; i < p; i++) {
        beta[i] += res.delta[i];
        diff += Math.abs(res.delta[i]);
    }
    
    cov_final = res.cov;
    if (diff < tol) break;
}

return JSON.stringify({ beta: beta, cov: cov_final });