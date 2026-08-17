// =============================================================
// SQL_naive_LogReg_master.js
// PL/v8 function body for the SQL MASTER
// =============================================================

const p = x_cols.length + 1;
let beta = Array(p).fill(0.0);
let final_obj = null;
const tol = 1e-6;

const terms = ["(Intercept)"].concat(x_cols);
const cols_sql = x_cols.map(c => "'" + c + "'").join(",");

for (let iter = 1; iter <= n_iter; iter++) {
    const beta_sql = `ARRAY[${beta.join(",")}]::float8[]`;
    let slave_results = [];

    for (const s of slaves) {
        const conninfo = "host=" + s + " dbname=postgres user=worker_user password=worker";

        const sql = `
            SELECT result_json 
            FROM dblink(
                '${conninfo}',
                $dblink$
                    SELECT sql_logreg_slave(
                        '${tbl_name}',
                        '${y_col}',
                        ARRAY[${cols_sql}]::text[],
                        ${beta_sql}
                    )
                $dblink$
            ) AS t(result_json text);
        `;

        const r = plv8.execute(sql)[0];
        if (r && r.result_json) {
            slave_results.push(JSON.parse(r.result_json));
        }
    }

    const res = logreg_master_update(slave_results);
    final_obj = res;
    
    let max_delta = 0.0;
    for (let i = 0; i < p; i++) {
        beta[i] += res.delta[i];
        if (Math.abs(res.delta[i]) > max_delta) max_delta = Math.abs(res.delta[i]);
    }

    plv8.elog(INFO, `Iter ${iter}: LL=${res.LL}, Max Delta=${max_delta}`);

    if (max_delta < tol || iter === n_iter) {
        // Calcolo delle statistiche finali per l'output
        for (let i = 0; i < p; i++) {
            const se = Math.sqrt(res.H_inv[i][i]);
            const z_stat = beta[i] / se;
            
            // Standard Normal CDF approximation per p-value
            const p_val = 2 * (1 - jStat_normal_cdf(Math.abs(z_stat)));

            plv8.return_next({
                iteration: iter,
                term: terms[i],
                estimate: beta[i],
                std_error: se,
                z_value: z_stat,
                p_value: p_val,
                log_likelihood: res.LL
            });
        }
        break;
    }
}
return;

// Helper: Approx normal CDF for PLv8
function jStat_normal_cdf(x) {
    var t = 1 / (1 + 0.231641888 * Math.abs(x));
    var d = 0.3989422804 * Math.exp(-x * x / 2);
    var p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x > 0 ? 1 - p : p;
}