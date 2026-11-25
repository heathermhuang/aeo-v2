#!/usr/bin/env python3
"""Deliver Caddy's local crawler spool in bounded, acknowledged batches."""
import datetime as dt
import fcntl
import hashlib
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import uuid

SPOOL = "aeo-crawler-access.log"
MAX_BATCH = 200
MAX_LINE = 4096
LOGGER = "http.log.access.aeo_crawler_origin"


def normalize(line):
    row = json.loads(line)
    if row.get("logger") != LOGGER or {"request", "resp_headers", "user_id"} & row.keys():
        raise ValueError("Unexpected origin log format")
    ip = str(ipaddress.ip_address(row["ip"]))
    if "%" in ip:
        raise ValueError("Unexpected scoped address")
    path, method, ua = (row[key] for key in ("path", "method", "ua"))
    status, size, timestamp = (row[key] for key in ("status", "size", "ts"))
    if path not in ("/", "/robots.txt") or method not in ("GET", "HEAD"):
        raise ValueError("Unexpected origin request")
    if not re.fullmatch(r"[ -~]{1,500}", ua):
        raise ValueError("Invalid user agent")
    if type(status) is not int or not 100 <= status <= 599:
        raise ValueError("Invalid response status")
    if type(size) is not int or not 0 <= size < 2**53:
        raise ValueError("Invalid response size")
    if type(timestamp) not in (int, float) or not math.isfinite(timestamp):
        raise ValueError("Invalid timestamp")
    time = dt.datetime.fromtimestamp(timestamp, dt.timezone.utc)
    return {"time": time.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "ip": ip, "path": path, "method": method, "status": status,
            "bytes": size, "userAgent": ua}


def collect(directory, previous, submit):
    positions = previous.get("positions", {})
    cursors = {}
    records = []
    rejected = 0
    active = directory / SPOOL
    paths = [*sorted(directory.glob("aeo-crawler-access-*-*.log")), active]
    for path in paths:
        try:
            source = path.open("rb")
        except FileNotFoundError:
            # Caddy may rotate between listing and opening. Read it on the next pass.
            continue
        with source:
            info = os.fstat(source.fileno())
            first = source.readline(MAX_LINE + 1)
            if len(first) > MAX_LINE:
                raise ValueError("Origin log line exceeded its bound")
            if not first.endswith(b"\n"):
                continue
            key = f"{info.st_dev}:{info.st_ino}:{hashlib.sha256(first).hexdigest()}"
            if key in cursors:
                continue
            offset = positions.get(key, {}).get("offset", 0)
            if offset > info.st_size:
                raise ValueError("Origin spool was truncated")
            source.seek(offset)
            while len(records) + rejected < MAX_BATCH:
                start = source.tell()
                line = source.readline(MAX_LINE + 1)
                if len(line) > MAX_LINE:
                    raise ValueError("Origin log line exceeded its bound")
                if not line.endswith(b"\n"):
                    source.seek(start)
                    break
                try:
                    records.append(normalize(line))
                except (ValueError, TypeError, KeyError, AttributeError, OverflowError):
                    rejected += 1
            cursors[key] = {"offset": source.tell(), "size": info.st_size}

    gaps = sum(1 for key, cursor in positions.items()
               if key not in cursors and cursor["offset"] < cursor["size"])
    receipt = submit(records) if records else None
    if records and (not receipt or receipt["accepted"] != len(records) or receipt["rejected"] != 0):
        raise ValueError("Origin import did not acknowledge every submitted row")
    times = [record["time"] for record in records]
    if previous.get("lastEventAt"):
        times.append(previous["lastEventAt"])
    return {
        "positions": cursors,
        "lastSuccessAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "lastImport": receipt or previous.get("lastImport"),
        "lastEventAt": max(times, default=None),
        "rejectedLines": previous.get("rejectedLines", 0) + rejected,
        "rotationGaps": previous.get("rotationGaps", 0) + gaps,
    }


def atomic_write(path, state):
    with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as result:
        json.dump(state, result)
        result.flush()
        os.fsync(result.fileno())
    os.replace(result.name, path)


def main():
    os.umask(0o077)
    if len(sys.argv) != 4:
        raise ValueError("Expected state directory, AEO site and verified owner")
    state_dir = Path(sys.argv[1])
    site, owner = (str(uuid.UUID(value)) for value in sys.argv[2:])
    with (state_dir / "collector.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        mount = subprocess.check_output(
            ["docker", "inspect", "--format",
             '{{range .Mounts}}{{if and (eq .Destination "/data") (eq .Type "volume")}}{{.Source}}{{end}}{{end}}',
             "aeo-v2-staging-ingress-1"], text=True, timeout=10).strip()
        directory = Path(mount)
        if not mount or not directory.is_absolute() or not (directory / SPOOL).exists():
            raise ValueError("Origin spool is unavailable")
        path = state_dir / "state.json"
        previous = json.loads(path.read_text()) if path.exists() else {}
        result = collect(directory, previous, lambda records: json.loads(subprocess.run(
            ["docker", "compose", "-f", "compose.yml", "-f", "compose.production.yml",
             "exec", "-T", "app", "node", "dist/aeo-origin-crawl.mjs", site, owner],
            input=json.dumps(records), text=True, check=True, timeout=40,
            capture_output=True,
        ).stdout))
        atomic_write(path, result)
        changed = {key: result[key] for key in ("lastEventAt", "rejectedLines", "rotationGaps")
                   if result[key] != previous.get(key)}
        if result["lastImport"] != previous.get("lastImport"):
            changed["lastImport"] = result["lastImport"]
        if changed:
            print(json.dumps(changed))
        if result["rotationGaps"] > previous.get("rotationGaps", 0):
            raise ValueError("Origin spool lost unread rotated data")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError, IndexError) as error:
        # Input and subprocess output may contain the temporary full address.
        print(f"AEO origin collector failed ({type(error).__name__})", file=sys.stderr)
        sys.exit(1)
