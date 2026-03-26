#!/usr/bin/env bash
set -e

SCENARIO=${1:-smoke}
BASE_URL=${2:-""}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$BASE_URL" ]; then
  # Run against local Docker Compose perf stack
  echo "Starting perf stack and running scenario: $SCENARIO"
  docker compose -f "$SCRIPT_DIR/docker-compose.perf.yml" up -d postgres_perf backend_perf
  set +e
  docker compose -f "$SCRIPT_DIR/docker-compose.perf.yml" run --rm \
    -e BASE_URL=http://backend_perf:8000 \
    k6 run "/scripts/scenarios/${SCENARIO}.js" --out "json=/reports/${SCENARIO}-result.json"
  EXIT_CODE=$?
  set -e
  docker compose -f "$SCRIPT_DIR/docker-compose.perf.yml" stop backend_perf
  exit $EXIT_CODE
else
  # Run k6 directly against provided BASE_URL (staging, prod, etc.)
  echo "Running scenario: $SCENARIO against $BASE_URL"
  set +e
  docker run --rm \
    -v "$SCRIPT_DIR:/scripts" \
    -v "$SCRIPT_DIR/reports:/reports" \
    -e "BASE_URL=$BASE_URL" \
    grafana/k6:0.54.0 run "/scripts/scenarios/${SCENARIO}.js" --out "json=/reports/${SCENARIO}-result.json"
  EXIT_CODE=$?
  set -e
  exit $EXIT_CODE
fi
