// =============================================================
// naive_Poisson_master.js
// Shared math for the MASTER NODE (SPARQL & SQL)
// =============================================================

function zeros(n, m) {
    var arr = [];
    for (var i = 0; i < n; i++) {
        var row = [];
        for (var j = 0; j < m; j++) row.push(0.0);
        arr.push(row);
    }
    return arr;
}

function fillVector(n, val) {
    var vec = [];
    for (var i = 0; i < n; i++) vec.push(val);
    return vec;
}

function matVec(A, x) {
    var r = [];
    for (var i = 0; i < A.length; i++) r.push(0.0);
    for (var i = 0; i < A.length; i++)
        for (var j = 0; j < x.length; j++)
            r[i] += A[i][j] * x[j];
    return r;
}

function matInv(A) {
    var n = A.length;
    var M = [];
    var I = zeros(n, n);

    for (var i = 0; i < n; i++) {
        M.push(A[i].slice());
        I[i][i] = 1.0;
    }

    for (var i = 0; i < n; i++) {
        var f = M[i][i];
        if (Math.abs(f) < 1e-12) throw new Error("Singular Hesseian");

        for (var j = 0; j < n; j++) {
            M[i][j] /= f;
            I[i][j] /= f;
        }

        for (var k = 0; k < n; k++) {
            if (k === i) continue;
            var g = M[k][i];
            for (var j = 0; j < n; j++) {
                M[k][j] -= g * M[i][j];
                I[k][j] -= g * I[i][j];
            }
        }
    }
    return I;
}

function poisson_master_update(slave_results, beta_old, p, alpha, ridge) {
    var XTWX = zeros(p, p);
    var XTWZ = fillVector(p, 0.0);
    var n_total = 0;

    for (var k = 0; k < slave_results.length; k++) {
        matAdd(XTWX, slave_results[k].xtwx);
        vecAdd(XTWZ, slave_results[k].xtwz);
        n_total += slave_results[k].n;
    }

    for (var i = 0; i < p; i++) {
        XTWX[i][i] += ridge;
    }

    var inv = matInv(XTWX);
    var beta_new = matVec(inv, XTWZ);

    var beta_final = fillVector(p, 0.0);
    for (var i = 0; i < p; i++) {
        beta_final[i] = alpha * beta_new[i] + (1.0 - alpha) * beta_old[i];
    }

    return { 
        beta: beta_final, 
        cov: inv, 
        n: n_total 
    };
}