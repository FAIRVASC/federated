// =============================================================
// LinReg_master.js
// Shared math for the MASTER NODE (SPARQL & SQL) - ES5 Pure
// =============================================================

function linreg_master_update(slave_results) {
    if (slave_results.length === 0) throw new Error("No data received from slaves.");

    // Initialize with the first slave's components
    var XTX = slave_results[0].XTX;
    var XTY = slave_results[0].XTY;
    var n = slave_results[0].n;
    var ysum = slave_results[0].ysum;
    var yty = slave_results[0].yty;

    // Aggregate remaining slaves
    for (var i = 1; i < slave_results.length; i++) {
        var data = slave_results[i];
        matAdd(XTX, data.XTX);
        vecAdd(XTY, data.XTY);
        n += data.n;
        ysum += data.ysum;
        yty += data.yty;
    }

    var p = XTY.length;
    var df_residual = n - p;
    var df_model = p - 1;

    if (df_residual <= 0) throw new Error("Residual DF <= 0. Too many parameters.");

    // Solve OLS
    var beta = _solve(XTX, XTY);
    var XTXinv = _inverse(XTX);

    // Calculate RSS (Residual Sum of Squares)
    var rss = yty;
    for (var i = 0; i < p; i++) rss -= beta[i] * XTY[i];
    if (rss < 0) rss = 0.0;

    // Calculate TSS (Total Sum of Squares)
    var tss = yty - (ysum * ysum) / n;
    var s2 = rss / df_residual;

    // Standard Errors & t-statistics
    var se = [];
    var t_stat = [];
    for (var i = 0; i < p; i++) {
        se.push(Math.sqrt(s2 * XTXinv[i][i]));
        t_stat.push(beta[i] / se[i]);
    }

    var r2 = 1.0 - (rss / tss);
    var adj_r2 = 1.0 - (1.0 - r2) * (n - 1) / df_residual;
    var f_stat = (r2 / df_model) / ((1.0 - r2) / df_residual);

    return {
        beta: beta,
        se: se,
        t_stat: t_stat,
        n: n,
        rss: rss,
        tss: tss,
        r2: r2,
        adj_r2: adj_r2,
        f_stat: f_stat,
        df_model: df_model,
        df_residual: df_residual
    };
}