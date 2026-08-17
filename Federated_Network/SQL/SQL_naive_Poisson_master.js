// =============================================================
// SQL_naive_Poisson_master.js
// PL/v8 function body for the SQL MASTER 
// =============================================================

const p = x_cols.length + 1;
let beta = Array(p).fill(0.0);

const alpha = 0.3;
const ridge = 1e-6;

const terms = ["(Intercept)"].concat(x_cols);
const cols_sql = x_cols.map(c => "'" + c + "'").join(",");

for (let iter = 1; iter <= n_iter; iter++) {
    const beta_sql = `ARRAY[${beta.join(",")}]::float8[]`;
    let slave_results = [];

    // Sequential/Parallel querying of workers via dblink
    for (const s of slaves) {
        const conninfo = "host=" + s + " dbname=postgres user=worker_user password=worker";

        const sql = `
            SELECT result_json
            FROM dblink(
                '${conninfo}',
                $dblink$
                    SELECT sql_poisson_slave(
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
            const stats = JSON.parse(r.result_json);
            slave_results.push({
                xtwx: stats.xtwx,
                xtwz: stats.xtwz,
                n: stats.n
            });
        }
    }

    const res = poisson_master_update(slave_results, beta, p, alpha, ridge);
    beta = res.beta;

    if (iter === n_iter) {
        for (let i = 0; i < p; i++) {
            const se = Math.sqrt(res.cov[i][i]);
            const z = beta[i] / se;

            plv8.return_next({
                iteration: iter,
                term: terms[i],
                estimate: beta[i],
                std_error: se,
                z_value: z
            });
        }
    }
}
return;