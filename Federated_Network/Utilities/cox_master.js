// =============================================================
// cox_master.js
// Shared math for the MASTER NODE (SPARQL & SQL) - ES5 Pure
// =============================================================

/**
 * Combina i vettori dei tempi locali estratti dai nodi slave,
 * rimuove i duplicati e restituisce un array ordinato dei tempi globali.
 */
function aggregate_global_times(slave_times) {
    var unique = {};
    for (var i = 0; i < slave_times.length; i++) {
        var arr = slave_times[i];
        for (var j = 0; j < arr.length; j++) {
            unique[arr[j]] = true;
        }
    }
    var res = [];
    for (var k in unique) {
        res.push(parseFloat(k));
    }
    res.sort(function(a, b) { return a - b; });
    return res;
}

/**
 * Esegue l'inversione di una matrice quadrata usando l'eliminazione di Gauss-Jordan.
 * Richiesto in puro ES5 per non dipendere da librerie esterne nel DB o in Fuseki.
 */
function invertMatrix(M) {
    var n = M.length;
    var A = [];
    for (var i = 0; i < n; i++) {
        A.push([]);
        for (var j = 0; j < n; j++) {
            A[i].push(M[i][j]);
        }
        for (var j = 0; j < n; j++) {
            A[i].push(i === j ? 1.0 : 0.0);
        }
    }
    
    for (var i = 0; i < n; i++) {
        var maxEl = Math.abs(A[i][i]);
        var maxRow = i;
        for (var k = i + 1; k < n; k++) {
            if (Math.abs(A[k][i]) > maxEl) {
                maxEl = Math.abs(A[k][i]);
                maxRow = k;
            }
        }
        var tmp = A[maxRow];
        A[maxRow] = A[i];
        A[i] = tmp;

        var pivot = A[i][i];
        if (Math.abs(pivot) < 1e-12) return null; // Matrice singolare
        
        for (var j = i; j < 2 * n; j++) {
            A[i][j] /= pivot;
        }
        for (var k = 0; k < n; k++) {
            if (k !== i) {
                var c = A[k][i];
                for (var j = i; j < 2 * n; j++) {
                    A[k][j] -= c * A[i][j];
                }
            }
        }
    }
    
    var inv = [];
    for (var i = 0; i < n; i++) {
        inv.push([]);
        for (var j = 0; j < n; j++) {
            inv[i].push(A[i][j + n]);
        }
    }
    return inv;
}

/**
 * Aggrega le statistiche parziali calcolate dagli slave (S0, S1, S2)
 * e calcola il passo di aggiornamento (delta) di Newton-Raphson.
 */
function master_update_cox(slave_results, p) {
    var num_times = slave_results[0].length;
    var U = []; for (var i = 0; i < p; i++) U.push(0.0);
    var I_mat = [];
    for (var i = 0; i < p; i++) {
        var row = [];
        for (var j = 0; j < p; j++) row.push(0.0);
        I_mat.push(row);
    }

    // Ciclo su ogni istante temporale globale k
    for (var k = 0; k < num_times; k++) {
        var global_S0 = 0.0;
        var global_S1 = []; for (var i = 0; i < p; i++) global_S1.push(0.0);
        var global_S2 = [];
        for (var i = 0; i < p; i++) {
            var row = [];
            for (var j = 0; j < p; j++) row.push(0.0);
            global_S2.push(row);
        }
        var global_event_sum = []; for (var i = 0; i < p; i++) global_event_sum.push(0.0);
        var global_count_events = 0;

        // Aggrega le metriche sommandole tra tutti gli slave s
        for (var s = 0; s < slave_results.length; s++) {
            var res = slave_results[s][k];
            global_S0 += res.S0;
            global_count_events += res.count_events;
            for (var i = 0; i < p; i++) {
                global_S1[i] += res.S1[i];
                global_event_sum[i] += res.event_sum[i];
                for (var j = 0; j < p; j++) {
                    global_S2[i][j] += res.S2[i][j];
                }
            }
        }

        // Calcola il gradiente e l'Hessiano se ci sono eventi in questo istante temporale
        if (global_S0 > 0 && global_count_events > 0) {
            var e_avg = [];
            for (var i = 0; i < p; i++) {
                e_avg.push(global_S1[i] / global_S0);
            }

            for (var i = 0; i < p; i++) {
                U[i] += global_event_sum[i] - global_count_events * e_avg[i];
            }

            for (var i = 0; i < p; i++) {
                for (var j = 0; j < p; j++) {
                    var hess_contrib = (global_S2[i][j] / global_S0) - (e_avg[i] * e_avg[j]);
                    I_mat[i][j] += global_count_events * hess_contrib;
                }
            }
        }
    }

    // Risoluzione del sistema lineare: delta = I^(-1) * U
    var cov = invertMatrix(I_mat);
    var delta = [];
    if (cov === null) {
        for (var i = 0; i < p; i++) delta.push(0.0);
        cov = I_mat; 
    } else {
        for (var i = 0; i < p; i++) {
            var sum = 0.0;
            for (var j = 0; j < p; j++) {
                sum += cov[i][j] * U[j];
            }
            delta.push(sum);
        }
    }

    return { delta: delta, cov: cov };
}