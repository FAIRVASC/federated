#!/bin/bash
#for SQL define both FAIRVASC_APP_PASSWORD and FAIRVASC_WORKER_PASSWORD using "export FAIRVASC_APP_PASSWORD='fairvasc'" before running this script"
#for SPARQL run DataPreparation.R before running this
set -e

FRAMEWORK=$1
NETWORK_NAME="Fairvasc"

if [ -z "$FRAMEWORK" ]; then
  echo " Error: Please specify the framework."
  echo "Usage: sh setup.sh SQL   -or-   sh setup.sh SPARQL"
  exit 1
fi

echo "▸ Cleaning up old containers..."
docker rm -f master slave1 slave2 2>/dev/null || true
docker network inspect $NETWORK_NAME >/dev/null 2>&1 || docker network create $NETWORK_NAME

if [ "$FRAMEWORK" = "SQL" ]; then
  echo -e "\n=== Booting SQL (PostgreSQL PL/v8) Environment ==="

  if [ -z "$FAIRVASC_APP_PASSWORD" ]; then
    echo " Error: environment variable FAIRVASC_APP_PASSWORD is not set."
    echo "  This is the password for the restricted 'fairvasc_app' role that"
    echo "  clients (run_model()) use to authenticate to the master. Export it"
    echo "  before running this script, e.g.:"
    echo "    export FAIRVASC_APP_PASSWORD='choose-a-strong-password'"
    exit 1
  fi

  if [ -z "$FAIRVASC_WORKER_PASSWORD" ]; then
    echo " Error: environment variable FAIRVASC_WORKER_PASSWORD is not set."
    echo "  This is the password for the 'worker_user' role on each slave,"
    echo "  used by the master to authenticate when it queries the slaves."
    echo "  Export it before running this script, e.g.:"
    echo "    export FAIRVASC_WORKER_PASSWORD='choose-another-strong-password'"
    exit 1
  fi

  IMAGE="sibedge/postgres-plv8"
  docker pull $IMAGE

  docker run -d --name master --network $NETWORK_NAME -p 5432:5432 -e POSTGRES_PASSWORD=password $IMAGE
  until docker exec master pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
  docker exec master psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS plv8;"
  docker exec master psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS dblink;"

  echo "▸ Creating restricted application role on master (fairvasc_app)..."
  docker exec master psql -U postgres -c "CREATE ROLE fairvasc_app WITH LOGIN PASSWORD '$FAIRVASC_APP_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE;"

  for i in 1 2; do
    PORT=$((5432 + i))
    echo "▸ Starting Slave $i Node (Port $PORT)..."
    docker run -d --name slave$i --network $NETWORK_NAME -p $PORT:5432 -e POSTGRES_PASSWORD=slv$i $IMAGE
    until docker exec slave$i pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
    docker exec slave$i psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS plv8;"
    docker exec slave$i psql -U postgres -c "CREATE ROLE worker_user WITH LOGIN PASSWORD '$FAIRVASC_WORKER_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE;"
  done
  echo -e "\n SQL Network is ready!"

elif [ "$FRAMEWORK" = "SPARQL" ]; then
  echo -e "\n=== Booting SPARQL (Apache Jena Fuseki) Environment ==="
  FUSEKI_DIR="./fuseki-2.0"

  echo "▸ Bundling JavaScript files for Fuseki..."
  cat Federated_Network/utilities/*_master.js Federated_Network/SPARQL/*_master.js > fuseki_master_bundle.js 2>/dev/null || true
  cat Federated_Network/utilities/*_slave.js Federated_Network/SPARQL/*_slave.js > fuseki_slave_bundle.js 2>/dev/null || true

  echo "▸ Building Fuseki Image..."
  cd "$FUSEKI_DIR" && docker build -t fuseki . && cd ..

  start_fuseki() {
    docker run -d --name "$1" --network $NETWORK_NAME -p "$2:3030" -v "$(pwd)/$3:/jsfuncs.js" fuseki --update --set arq:js-library=/jsfuncs.js --mem /fv
  }

  start_fuseki master 3030 fuseki_master_bundle.js
  start_fuseki slave1 3031 fuseki_slave_bundle.js
  start_fuseki slave2 3032 fuseki_slave_bundle.js
  sleep 5

  echo "▸ Uploading TTL datasets to Slaves..."
  for i in 1 2; do
    if [ -f "slave${i}.ttl" ]; then
      curl -sf -X POST -H "Content-Type: text/turtle" --data-binary "@slave${i}.ttl" "http://localhost:303${i}/fv/data"
    fi
    if [ -f "cox_slave${i}.ttl" ]; then
      curl -sf -X POST -H "Content-Type: text/turtle" --data-binary "@cox_slave${i}.ttl" "http://localhost:303${i}/fv/data"
    fi
  done
  echo -e "\n SPARQL Network is ready!"
fi