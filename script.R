# =============================================================
# UNIFIED FEDERATED LEARNING ORCHESTRATOR
# =============================================================
# This script orchestrates the federated learning process across
# either a PostgreSQL PL/v8 network or an Apache Jena SPARQL network.
# Data preparation is assumed to be completed beforehand.
#
# SQL DEPLOYMENT: differently from SPRQL (where setup.sh creates the functions
# bundle of every JS function for each model during the container build),
# SQL PL/v8  Functions should explicitly be deployed
# using deploy_sql_functions() — called ONCE after container build
# (sh SQL.sh) and after DataPreparation.R. After that,
# run_model(framework = "SQL", model = < every_model>, ...) is working
# exactly like SPARQL.
# =============================================================

setwd('~/Desktop/Federated_Learning/')
readRenviron(".Renviron")

library(httr)
library(jsonlite)
library(RPostgres)

# =============================================================
# 1. GLOBAL CONFIGURATION
# =============================================================

# Choose Framework: "SQL" or "SPARQL"
ACTIVE_FRAMEWORK <- "SQL"  

# Choose Model: "Linear", "Logistic", "Poisson" or "Cox"
ACTIVE_MODEL <- "Linear" 

# Target and Feature configurations
TARGET_COL <- "binary_quality" 

FEATURE_COLS <- c("fixed_acidity", "volatile_acidity", "citric_acid",
                  "residual_sugar", "chlorides", "free_sulfur_dioxide",
                  "total_sulfur_dioxide", "density", "ph", "sulphates", "alcohol")

# SQL Specific Config (Assumes data is already loaded in these tables)
SQL_TABLE_NAME <- "federated_data" 

# Cox Model Config 
COX_FEATURE_COLS   <- c("treatment", "number", "size")
COX_TIME_COL       <- "stop"
COX_EVENT_COL      <- "event"
COX_SQL_TABLE_NAME <- "cox_data"

# IRLS Loop Parameters (for Logistic and Poisson)
MAX_ITER <- 20
TOLERANCE <- 1e-6

# Directory paths
BASE_DIR <- setwd("~/Desktop/Federated_Learning/")
UTIL_DIR <- file.path(BASE_DIR, "Federated_Network", "utilities")
SQL_DIR  <- file.path(BASE_DIR, "Federated_Network", "SQL")

cat(sprintf("\n=== Initializing %s Regression via %s ===\n", ACTIVE_MODEL, ACTIVE_FRAMEWORK))

# =============================================================
# 2. SQL JAVASCRIPT LOADER
# =============================================================

load_sql_js <- function(model) {
  common_math_path <- file.path(UTIL_DIR, "common_math_master.js")
  if (!file.exists(common_math_path)) {
    stop("File common_math_master.js is not in the Utilities directory!")
  }
  common_math_js <- readLines(common_math_path, warn = FALSE)
  
  prefix <- switch(model,
                   "Linear"   = "LinReg",
                   "Logistic" = "naive_LogReg",
                   "Poisson"  = "naive_Poisson",
                   "Cox"      = "cox",
                   stop(sprintf("Unknown model type: '%s'.", model)))
  
  math_master_js <- readLines(file.path(UTIL_DIR, paste0(prefix, "_master.js")), warn = FALSE)
  math_slave_js  <- readLines(file.path(UTIL_DIR, paste0(prefix, "_slave.js")), warn = FALSE)
  sql_master_js  <- readLines(file.path(SQL_DIR, paste0("SQL_", prefix, "_master.js")), warn = FALSE)
  
  sql_slave_js <- ""
  sql_slave_path <- file.path(SQL_DIR, paste0("SQL_", prefix, "_slave.js"))
  if (file.exists(sql_slave_path)) sql_slave_js <- readLines(sql_slave_path, warn = FALSE)
  
  if (length(math_master_js) == 0) {
    stop(sprintf("Failed to load JS files for model '%s'. Check directory structure.", model))
  }
  
  list(common_math_js = common_math_js,
       math_master_js = math_master_js,
       math_slave_js  = math_slave_js,
       sql_master_js  = sql_master_js,
       sql_slave_js   = sql_slave_js)
}

# =============================================================
# 2b. SQL DEPLOYMENT 
# =============================================================

deploy_sql_functions <- function() {
  con_m  <- dbConnect(RPostgres::Postgres(), host='127.0.0.1', port=5432, dbname='postgres', user='postgres', password='password')
  con_s1 <- dbConnect(RPostgres::Postgres(), host='127.0.0.1', port=5433, dbname='postgres', user='postgres', password='slv1')
  con_s2 <- dbConnect(RPostgres::Postgres(), host='127.0.0.1', port=5434, dbname='postgres', user='postgres', password='slv2')
  on.exit({
    dbDisconnect(con_m); dbDisconnect(con_s1); dbDisconnect(con_s2)
  }, add = TRUE)
  
  for (model in c("Linear", "Logistic", "Poisson", "Cox")) {
    cat(sprintf("▸ Deploying SQL functions: %s...\n", model))
    js <- load_sql_js(model)
    
    slave_func_name <- switch(model,
                              "Linear"   = "sql_linreg_slave",
                              "Logistic" = "sql_logreg_slave",
                              "Poisson"  = "sql_poisson_slave",
                              "Cox"      = "sql_cox_slave")
    master_func_name <- switch(model,
                               "Linear"   = "sql_linreg_master",
                               "Logistic" = "sql_logreg_master",
                               "Poisson"  = "sql_poisson_master",
                               "Cox"      = "sql_cox_master")
    slave_stats_fn <- switch(model,
                             "Linear"   = "linreg_slave_stats",
                             "Logistic" = "logreg_slave_stats",
                             "Poisson"  = "poisson_slave_stats",
                             "Cox"      = NA)
    
    master_exec_sig <- switch(model,
                              "Cox"      = "text[],text,text,text,text[],int,float8",
                              "Linear"   = "text[],text,text,text[]",
                              "Logistic" = "text[],text,text,text[],int",
                              "Poisson"  = "text[],text,text,text[],int")
    
    if (model == "Cox") {
      sql_slave_body <- paste(
        paste(js$common_math_js, collapse = "\n"),
        paste(js$math_slave_js, collapse = "\n"),
        paste(js$sql_slave_js, collapse = "\n"),
        "return eval(sql_slave_wrapper);",
        sep = "\n"
      )
      master_func <- sprintf(
        "CREATE OR REPLACE FUNCTION %s(slaves text[], tbl_name text, time_col text, event_col text, x_cols text[], max_iter int, tol float8) RETURNS text LANGUAGE plv8 AS $$ %s $$;",
        master_func_name,
        paste(paste(js$common_math_js, collapse = "\n"),
              paste(js$math_master_js, collapse = "\n"),
              paste(js$sql_master_js, collapse = "\n"), sep = "\n")
      )
      slave_func <- sprintf(
        "CREATE OR REPLACE FUNCTION %s(table_name text, time_column text, event_column text, x_columns text[], beta float8[], global_times float8[]) RETURNS text LANGUAGE plv8 SECURITY DEFINER AS $$ %s $$;",
        slave_func_name, sql_slave_body
      )
      exec_sig <- "text,text,text,text[],float8[],float8[]"
      
    } else if (model == "Linear") {
      sql_slave_body <- paste(
        paste(js$math_slave_js, collapse = "\n"),
        sprintf("const sql = `SELECT \"${y_column}\" AS y, ${x_columns.map(c => '\"'+c+'\"').join(',')} FROM ${table_name} WHERE \"${y_column}\" IS NOT NULL`;
     const rows = plv8.execute(sql);
     let xMatrix = [], yVals = [];
     rows.forEach(r => {
       const y = Number(r.y);
       if (!isNaN(y)) { xMatrix.push([1.0].concat(x_columns.map(c => Number(r[c])))); yVals.push(y); }
     });
     const stats = %s(xMatrix, yVals);
     return JSON.stringify(stats);", slave_stats_fn), sep = "\n"
      )
      master_func <- sprintf(
        "CREATE OR REPLACE FUNCTION %s(slaves text[], tbl_name text, y_col text, x_cols text[]) RETURNS text LANGUAGE plv8 AS $$ %s $$;",
        master_func_name,
        paste(paste(js$common_math_js, collapse = "\n"),
              paste(js$math_master_js, collapse = "\n"),
              paste(js$sql_master_js, collapse = "\n"), sep = "\n")
      )
      slave_func <- sprintf("CREATE OR REPLACE FUNCTION %s(table_name text, y_column text, x_columns text[]) RETURNS text LANGUAGE plv8 SECURITY DEFINER AS $$ %s $$;", slave_func_name, sql_slave_body)
      exec_sig <- "text,text,text[]"
      
    } else {
      # Logistic / Poisson
      sql_slave_body <- paste(
        paste(js$math_slave_js, collapse = "\n"),
        sprintf("const sql = `SELECT \"${y_column}\" AS y, ${x_columns.map(c => '\"'+c+'\"').join(',')} FROM ${table_name} WHERE \"${y_column}\" IS NOT NULL`;
     const rows = plv8.execute(sql);
     let xMatrix = [], yVals = [];
     rows.forEach(r => {
       const y = Number(r.y);
       if (!isNaN(y)) { xMatrix.push([1.0].concat(x_columns.map(c => Number(r[c])))); yVals.push(y); }
     });
     const stats = %s(xMatrix, yVals, beta);
     return JSON.stringify(stats);", slave_stats_fn), sep = "\n"
      )
      
      if (model == "Poisson") {
        master_func <- sprintf(
          "CREATE OR REPLACE FUNCTION %s(slaves text[], tbl_name text, y_col text, x_cols text[], n_iter int) RETURNS TABLE(iteration int, term text, estimate float8, std_error float8, z_value float8) LANGUAGE plv8 AS $$ %s $$;",
          master_func_name,
          paste(paste(js$common_math_js, collapse = "\n"),
                paste(js$math_master_js, collapse = "\n"),
                paste(js$sql_master_js, collapse = "\n"), sep = "\n")
        )
      } else {
        master_func <- sprintf(
          "CREATE OR REPLACE FUNCTION %s(slaves text[], tbl_name text, y_col text, x_cols text[], n_iter int) RETURNS TABLE(iteration int, term text, estimate float8, std_error float8, z_value float8, p_value float8, log_likelihood float8) LANGUAGE plv8 AS $$ %s $$;",
          master_func_name,
          paste(paste(js$common_math_js, collapse = "\n"),
                paste(js$math_master_js, collapse = "\n"),
                paste(js$sql_master_js, collapse = "\n"), sep = "\n")
        )
      }
      slave_func <- sprintf("CREATE OR REPLACE FUNCTION %s(table_name text, y_column text, x_columns text[], beta float8[]) RETURNS text LANGUAGE plv8 SECURITY DEFINER AS $$ %s $$;", slave_func_name, sql_slave_body)
      exec_sig <- "text,text,text[],float8[]"
    }
    
    dbExecute(con_m, master_func)
    dbExecute(con_m, sprintf("REVOKE EXECUTE ON FUNCTION %s(%s) FROM PUBLIC;", master_func_name, master_exec_sig))
    dbExecute(con_m, sprintf("GRANT EXECUTE ON FUNCTION %s(%s) TO fairvasc_app;", master_func_name, master_exec_sig))
    
    active_table <- if (model == "Cox") COX_SQL_TABLE_NAME else SQL_TABLE_NAME
    for (con in list(con_s1, con_s2)) {
      dbExecute(con, slave_func)
      dbExecute(con, sprintf("REVOKE EXECUTE ON FUNCTION %s(%s) FROM PUBLIC;", slave_func_name, exec_sig))
      dbExecute(con, sprintf("GRANT EXECUTE ON FUNCTION %s(%s) TO worker_user;", slave_func_name, exec_sig))
      dbExecute(con, sprintf("GRANT SELECT ON %s TO worker_user;", active_table))
    }
  }
  
  cat("All SQL Functions ready on master + slave1 + slave2.\n")
}

# =============================================================
# 3. HELPER: PRINT RESULTS
# =============================================================

print_results <- function(term_names, estimates, std_errors, model_name) {
  # Standard normal approximation for p-values (Wald test)
  z_stats <- estimates / std_errors
  p_vals <- 2 * (1 - pnorm(abs(z_stats)))
  
  coef_mat <- cbind(Estimate = estimates, 
                    `Std. Error` = std_errors, 
                    `z value` = z_stats, 
                    `Pr(>|z|)` = p_vals)
  rownames(coef_mat) <- term_names
  
  cat(sprintf("\nFederated %s Model Output:\n", model_name))
  printCoefmat(coef_mat, P.values = TRUE, has.Pvalue = TRUE, signif.stars = TRUE, digits = 5)
  cat("\n")
}

# =============================================================
# 4. EXECUTION ROUTING
# =============================================================

fv_run_model <- function(framework = ACTIVE_FRAMEWORK,
                      model     = ACTIVE_MODEL,
                      target    = TARGET_COL,
                      features  = if (model == "Cox") COX_FEATURE_COLS else FEATURE_COLS,
                      time_col  = COX_TIME_COL,
                      event_col = COX_EVENT_COL) {
  
  slaves <- c("slave1", "slave2")
  terms <- c("(Intercept)", features)
  p <- length(terms)
  
  # ─────────────────────────────────────────────────────────────
  # A. SQL FRAMEWORK EXECUTION
  # ─────────────────────────────────────────────────────────────
  
  if (framework == "SQL") {
    cat(sprintf("▸ Connecting to SQL master for %s Regression...\n", model))
    
    app_password <- Sys.getenv("FAIRVASC_APP_PASSWORD")
    if (identical(app_password, "")) {
      stop("FAIRVASC_APP_PASSWORD must be set (e.g. in ~/.Renviron) before fv_run_model() is launched.")
    }
    con_m <- dbConnect(RPostgres::Postgres(), host='127.0.0.1', port=5432, dbname='postgres', user='fairvasc_app', password=app_password)
    on.exit(dbDisconnect(con_m), add = TRUE)
    
    master_func_name <- switch(model,
                               "Linear"   = "sql_linreg_master",
                               "Logistic" = "sql_logreg_master",
                               "Poisson"  = "sql_poisson_master",
                               "Cox"      = "sql_cox_master",
                               stop(sprintf("Unknown model type: '%s'.", model)))
    
    cat("▸ Executing Federated Query on Master...\n")
    
    if (model == "Cox") {
      query_str <- paste0(
        "SELECT ", master_func_name, "(ARRAY['slave1', 'slave2'], '", COX_SQL_TABLE_NAME, "', '",
        time_col, "', '", event_col, "', ARRAY['", paste(features, collapse = "','"),
        "'], ", MAX_ITER, ", ", TOLERANCE, ");"
      )
      res_json <- dbGetQuery(con_m, query_str)
      obj <- fromJSON(res_json[1, 1])
      se <- sqrt(diag(matrix(unlist(obj$cov), nrow = length(features), byrow = TRUE)))
      print_results(features, unlist(obj$beta), se, model)
      
    } else if (model == "Linear") {
      query_str <- paste0("SELECT ", master_func_name, "(ARRAY['slave1', 'slave2'], '", SQL_TABLE_NAME, "', '", target, "', ARRAY['", paste(features, collapse = "','"), "']);")
      res_json <- dbGetQuery(con_m, query_str)
      obj <- fromJSON(res_json[1, 1])
      print_results(terms, unlist(obj$beta), unlist(obj$se), model)
      
    } else {
      # Logistic / Poisson
      query_str <- paste0("SELECT * FROM ", master_func_name, "(ARRAY['slave1', 'slave2'], '", SQL_TABLE_NAME, "', '", target, "', ARRAY['", paste(features, collapse = "','"), "'], ", MAX_ITER, ");")
      res <- dbGetQuery(con_m, query_str)
      cat("\n=== SQL Federated Results ===\n")
      print(res)
    }
    
    # ─────────────────────────────────────────────────────────────
    # B. SPARQL FRAMEWORK EXECUTION (invariato)
    # ─────────────────────────────────────────────────────────────
  } else if (framework == "SPARQL") {
    
    master_url <- "http://localhost:3030/fv/query"
    
    if (model == "Linear") {
      cat("▸ Executing One-Shot Federated Linear Regression...\n")
      
      service_blocks <- sapply(slaves, function(s) {
        sprintf('  {SERVICE <http://%s:3030/fv/query> { SELECT (js:sparql_linreg_slave(GROUP_CONCAT(STR(?f); SEPARATOR="|"), GROUP_CONCAT(STR(?y); SEPARATOR="|")) AS ?res) WHERE { ?p <http://example.org/fairvasc#features> ?f . ?p <http://example.org/fairvasc#y> ?y . } }}', s)
      })
      
      query <- paste0('PREFIX js: <http://jena.apache.org/ARQ/jsFunction#>\nSELECT (js:sparql_linreg_master(GROUP_CONCAT(?res; SEPARATOR="|||")) AS ?result)\nWHERE {\n', paste(service_blocks, collapse = "\n  UNION\n"), '\n}')
      
      res <- POST(master_url, body = list(query = query), encode = "form", add_headers("Accept" = "application/sparql-results+json"))
      if (http_error(res)) stop(sprintf("HTTP Error %d. Details: %s", status_code(res), content(res, "text", encoding="UTF-8")))
      
      parsed <- fromJSON(content(res, "text", encoding = "UTF-8"))
      
      if (is.null(parsed$results$bindings$result$value)) {
        stop("ERROR: Jena retrived empty record. Check Docker Logs per JS Exceptions.")
      }
      
      obj <- fromJSON(parsed$results$bindings$result$value)
      
      if (length(obj$beta) == 0) stop("ERROR: Slave nodes retrived 0. Missing Data")
      
      print_results(terms, unlist(obj$beta), unlist(obj$se), model)
      
    } else if (model == "Cox") {
      cat("▸ Executing Federated Cox Proportional Hazards Regression (Discovery + IRLS)...\n")
      
      ns_cox <- "http://example.org/"
      
      disc_blocks <- sapply(slaves, function(s) {
        sprintf('  {SERVICE <http://%s:3030/fv/query> { SELECT (js:sparql_cox_discovery_slave(GROUP_CONCAT(STR(?t); SEPARATOR=";"), GROUP_CONCAT(STR(?e); SEPARATOR=";")) AS ?res) WHERE { ?p <%s%s> ?t ; <%s%s> ?e . } }}',
                s, ns_cox, time_col, ns_cox, event_col)
      })
      
      disc_query <- paste0('PREFIX js: <http://jena.apache.org/ARQ/jsFunction#>\nSELECT (js:sparql_cox_discovery_master(GROUP_CONCAT(?res; SEPARATOR="###")) AS ?result)\nWHERE {\n', paste(disc_blocks, collapse = "\n  UNION\n"), '\n}')
      
      disc_res <- POST(master_url, body = list(query = disc_query), encode = "form", add_headers("Accept" = "application/sparql-results+json"))
      if (http_error(disc_res)) stop(sprintf("HTTP Error %d durante la discovery. Details: %s", status_code(disc_res), content(disc_res, "text", encoding = "UTF-8")))
      
      disc_parsed <- fromJSON(content(disc_res, "text", encoding = "UTF-8"))
      global_times_raw <- disc_parsed$results$bindings$result$value
      if (is.null(global_times_raw) || global_times_raw == "") stop("ERROR: Discovery failed. No time found.")
      
      global_times <- unlist(fromJSON(global_times_raw))
      if (length(global_times) == 0) stop("ERROR: No event found (event = 1) in data.")
      global_times_str <- paste(global_times, collapse = ",")
      cat(sprintf(" Discovery completed: %d unique time events.\n", length(global_times)))
      
      p <- length(features) 
      beta <- rep(0.0, p)
      obj <- NULL
      
      for (iter in 1:MAX_ITER) {
        beta_str <- paste(beta, collapse = ",")
        
        nr_blocks <- sapply(slaves, function(s) {
          feature_triples <- paste(sprintf('<%s%s> ?%s', ns_cox, features, features), collapse = " ; ")
          concat_expr <- paste0('CONCAT(', paste(sprintf('STR(?%s)', features), collapse = ', " ", '), ')')
          sprintf('  {SERVICE <http://%s:3030/fv/query> { SELECT (js:sparql_cox_nr_slave(GROUP_CONCAT(%s; SEPARATOR=";"), GROUP_CONCAT(STR(?t); SEPARATOR=";"), GROUP_CONCAT(STR(?e); SEPARATOR=";"), "%s", "%s") AS ?res) WHERE { ?p %s ; <%s%s> ?t ; <%s%s> ?e . } }}',
                  s, concat_expr, beta_str, global_times_str, feature_triples, ns_cox, time_col, ns_cox, event_col)
        })
        
        nr_query <- paste0('PREFIX js: <http://jena.apache.org/ARQ/jsFunction#>\nSELECT (js:sparql_cox_nr_master(GROUP_CONCAT(?res; SEPARATOR="###"), "', p, '") AS ?result)\nWHERE {\n', paste(nr_blocks, collapse = "\n  UNION\n"), '\n}')
        
        res <- POST(master_url, body = list(query = nr_query), encode = "form", add_headers("Accept" = "application/sparql-results+json"))
        if (http_error(res)) stop(sprintf("HTTP Error %d. Details: %s", status_code(res), content(res, "text", encoding = "UTF-8")))
        
        parsed <- fromJSON(content(res, "text", encoding = "UTF-8"))
        raw_val <- parsed$results$bindings$result$value
        if (is.null(raw_val) || raw_val == "") stop("ERROR: server retrived empty string during iteration")
        
        obj <- fromJSON(raw_val)
        if (length(obj$delta) == 0) stop("ERROR: missing'delta' in master Cox response.")
        
        delta <- unlist(obj$delta)
        beta <- beta + delta
        max_delta <- max(abs(delta))
        
        cat(sprintf("  Iter %2d: Max Delta Beta = %f\n", iter, max_delta))
        if (max_delta < TOLERANCE) {
          cat("Convergence reached!\n")
          break
        }
      }
      
      std_errors <- sqrt(diag(matrix(unlist(obj$cov), nrow = p, byrow = TRUE)))
      print_results(features, beta, std_errors, model)
      
    } else {
      cat(sprintf("▸ Executing Iterative (IRLS) Federated %s Regression...\n", model))
      
      beta <- rep(0.0, p)
      js_master_func <- ifelse(model == "Logistic", "sparql_logreg_master", "sparql_poisson_master")
      js_slave_func  <- ifelse(model == "Logistic", "sparql_logreg_slave", "sparql_poisson_slave")
      
      for (iter in 1:MAX_ITER) {
        beta_str <- paste(beta, collapse = ",")
        
        service_blocks <- sapply(slaves, function(s) {
          sprintf('  {SERVICE <http://%s:3030/fv/query> { SELECT (js:%s(GROUP_CONCAT(STR(?f); SEPARATOR="|"), GROUP_CONCAT(STR(?y); SEPARATOR="|"), "%s") AS ?res) WHERE { ?p <http://example.org/fairvasc#features> ?f . ?p <http://example.org/fairvasc#y> ?y . } }}', s, js_slave_func, beta_str)
        })
        
        master_call <- if (model == "Poisson") {
          sprintf('js:%s(GROUP_CONCAT(?res; SEPARATOR="|||"), "%s")', js_master_func, beta_str)
        } else {
          sprintf('js:%s(GROUP_CONCAT(?res; SEPARATOR="|||"))', js_master_func)
        }
        
        query <- paste0('PREFIX js: <http://jena.apache.org/ARQ/jsFunction#>\nSELECT (', master_call, ' AS ?result)\nWHERE {\n', paste(service_blocks, collapse = "\n  UNION\n"), '\n}')
        res <- POST(master_url, body = list(query = query), encode = "form", add_headers("Accept" = "application/sparql-results+json"))
        
        
        if (http_error(res)) stop(sprintf("HTTP Error %d. Details: %s", status_code(res), content(res, "text", encoding="UTF-8")))
        
        parsed <- fromJSON(content(res, "text", encoding = "UTF-8"))
        raw_val <- parsed$results$bindings$result$value
        
        if (is.null(raw_val) || raw_val == "") stop("ERROR: Empty String. Js function does not exist or crushed.")
        
        obj <- fromJSON(raw_val)
        
        # Blocco di sicurezza pre-calcolo
        if (length(obj$delta) == 0 && length(obj$beta) == 0) {
          stop("ERROR: empty vectors (length = 0). This may happen if no records are in your .TTL files or if those files are only partially aploaded.")
        }
        
        if (model == "Logistic") {
          delta <- unlist(obj$delta)
          beta <- beta + delta
          max_delta <- max(abs(delta))
        } else {
          delta_beta <- unlist(obj$beta) - beta
          max_delta <- max(abs(delta_beta))
          beta <- unlist(obj$beta)
        }
        
        cat(sprintf("  Iter %2d: Max Delta Beta = %f\n", iter, max_delta))
        if (max_delta < TOLERANCE) { 
          cat("✓ Convergence reached!\n")
          break 
        }
      }
      
      if (model == "Poisson") {
        std_errors <- sqrt(diag(matrix(unlist(obj$cov), nrow = p, byrow = TRUE)))
      } else {
        std_errors <- sqrt(diag(matrix(unlist(obj$H_inv), nrow = p, byrow = TRUE)))
      }
      
      print_results(terms, beta, std_errors, model)
    }
  }
}

# =============================================================
# 5. EXECUTE
# =============================================================
deploy_sql_functions()
fv_run_model()
