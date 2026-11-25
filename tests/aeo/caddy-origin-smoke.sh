#!/usr/bin/env bash
set -euo pipefail

repo=$(cd "$(dirname "$0")/../.." && pwd)
scratch=$(mktemp -d)
id=
cleanup() {
  if [[ -n "$id" ]]; then docker rm -f "$id" >/dev/null; fi
  rm -f "$scratch/Caddyfile" "$scratch/captured" "$scratch/caddy-output"
  rmdir "$scratch"
}
trap cleanup EXIT
# Preserve the production logger and scope in an isolated site with a deterministic response.
python3 - "$repo/deploy/aeo/Caddyfile" "$scratch/Caddyfile" <<'PY'
from pathlib import Path
import sys
source = Path(sys.argv[1]).read_text()
start = source.index("(aeo_ingress_headers)")
site = source.index("    log aeo_crawler_origin {")
end = source.index("    # Only the edge", site)
Path(sys.argv[2]).write_text(source[:start] + ':8080 {\n' + source[site:end] + '    respond "ok" 200\n}\n')
PY
image=${AEO_CADDY_SMOKE_IMAGE:-caddy:2.11.7-alpine}
id=$(docker run -d --network none --tmpfs /data --tmpfs /config \
  -e AEO_EDGE_ORIGIN_KEY=fixture-edge-value -v "$scratch/Caddyfile:/etc/caddy/Caddyfile:ro" "$image")
for attempt in 1 2 3 4 5; do
  if docker exec "$id" wget -qO /dev/null http://127.0.0.1:8080/; then break; fi
  sleep 1
done
probe() {
  docker exec "$id" wget -qO /dev/null \
    --header "User-Agent: $1" --header "X-Aeo-Origin-Key: $2" \
    --header "X-Aeo-Public-Host: $3" --header 'X-Aeo-Client-IP: 192.0.2.7' \
    --header 'Cookie: fixture-cookie-value' "http://127.0.0.1:8080$4"
}
probe 'AEO-Crawl-Canary/1.0' fixture-edge-value aeo.io '/robots.txt?fixture-query-value'
probe 'AEO-Crawl-Canary/1.0' wrong aeo.io '/?fixture-query-value'
probe 'AEO-Crawl-Canary/1.0' fixture-edge-value staging.aeo.io '/?fixture-query-value'
probe 'OrdinaryBrowser/1.0' fixture-edge-value aeo.io '/?fixture-query-value'
probe 'AEO-Crawl-Canary/1.0' fixture-edge-value aeo.io '/api/secret?fixture-query-value'
docker exec "$id" cat /data/aeo-crawler-access.log > "$scratch/captured"
docker logs "$id" > "$scratch/caddy-output" 2>&1
python3 - "$scratch" <<'PY'
import json, sys
from pathlib import Path
directory = Path(sys.argv[1])
captured = (directory / "captured").read_text()
rows = [json.loads(line) for line in captured.splitlines()]
assert len(rows) == 1
row = rows[0]
assert row["path"] == "/robots.txt" and row["method"] == "GET" and row["status"] == 200
assert row["ip"] == "192.0.2.7" and row["ua"] == "AEO-Crawl-Canary/1.0"
assert not ({"request", "resp_headers", "user_id"} & row.keys())
for marker in ("fixture-query-value", "fixture-cookie-value", "fixture-edge-value", "/api/secret"):
    assert marker not in captured + (directory / "caddy-output").read_text()
print("One eligible request reached the spool. Unmatched requests and sensitive fields were absent from both outputs.")
PY
