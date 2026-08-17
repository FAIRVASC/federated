// =============================================================
// common_math.js
// Shared math for the MASTER NODE (Among different models) - ES5 Pure
// =============================================================

function matAdd(A, B) {
    for (var i = 0; i < A.length; i++) {
        for (var j = 0; j < A[0].length; j++) {
            A[i][j] += B[i][j];
        }
    }
}

function vecAdd(a, b) {
    for (var i = 0; i < a.length; i++) {
        a[i] += b[i];
    }
}

function _solve(A, b) {
    var n = b.length;
    var i, j, k, col, pivotRow, factor, temp;
    var M = [];
    
    for (i = 0; i < n; i++) {
        var row = [];
        for (j = 0; j < n; j++) row.push(A[i][j]);
        row.push(b[i]);
        M.push(row);
    }

    for (col = 0; col < n; col++) {
        pivotRow = col;
        for (i = col + 1; i < n; i++) {
            if (Math.abs(M[i][col]) > Math.abs(M[pivotRow][col])) pivotRow = i;
        }
        
        temp = M[col]; 
        M[col] = M[pivotRow]; 
        M[pivotRow] = temp;

        if (Math.abs(M[col][col]) < 1e-12) {
            throw new Error("Singular X'X matrix: check for collinearity.");
        }
        
        for (i = col + 1; i < n; i++) {
            factor = M[i][col] / M[col][col];
            for (k = col; k <= n; k++) M[i][k] -= factor * M[col][k];
        }
    }

    var x = [];
    for (i = 0; i < n; i++) x.push(0.0);
    
    for (i = n - 1; i >= 0; i--) {
        x[i] = M[i][n];
        for (j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
        x[i] /= M[i][i];
    }
    return x;
}

function _inverse(A) {
    var n = A.length;
    var i, j, col, pivot, factor, temp, maxRow;
    var M = [];
    
    for (i = 0; i < n; i++) {
        var row = [];
        for (j = 0; j < n; j++) row.push(A[i][j]);
        for (j = 0; j < n; j++) row.push(i === j ? 1.0 : 0.0);
        M.push(row);
    }
    
    for (col = 0; col < n; col++) {
        maxRow = col;
        for (i = col + 1; i < n; i++) {
            if (Math.abs(M[i][col]) > Math.abs(M[maxRow][col])) maxRow = i;
        }
        temp = M[col]; M[col] = M[maxRow]; M[maxRow] = temp;

        if (Math.abs(M[col][col]) < 1e-12) {
            throw new Error("Singular X'X: cannot compute standard errors.");
        }

        pivot = M[col][col];
        for (j = 0; j < 2 * n; j++) M[col][j] /= pivot;
        for (i = 0; i < n; i++) {
            if (i !== col) {
                factor = M[i][col];
                for (j = 0; j < 2 * n; j++) M[i][j] -= factor * M[col][j];
            }
        }
    }
    
    var inv = [];
    for (i = 0; i < n; i++) {
        var r = [];
        for (j = n; j < 2 * n; j++) r.push(M[i][j]);
        inv.push(r);
    }
    return inv;
}