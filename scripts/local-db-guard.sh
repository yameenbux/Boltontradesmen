#!/usr/bin/env bash
# Sourced: assert_local_db refuses non-local SUPABASE_DB_URL unless ALLOW_NONLOCAL_DB_RESET=1.
assert_local_db() {
# Safety: this drops schema public, so only run against a local database unless
# explicitly overridden. Hosts come from the URL authority and any ?host= param
# (libpq lets the latter win); an empty host means a local Unix socket.
db_hosts="$(node -e '
  try {
    const u = new URL(process.argv[1]);
    if (!/^postgres(ql)?:$/.test(u.protocol)) throw 0;
    const hosts = [u.hostname, ...u.searchParams.getAll("host")]
      .flatMap((h) => h.split(","))
      .map((h) => decodeURIComponent(h).replace(/^\[|\]$/g, ""));
    if (!u.hostname && !u.searchParams.has("host") && process.env.PGHOST) hosts.push(...process.env.PGHOST.split(","));
    console.log(hosts.join(" "));
  } catch { process.exit(1); }
' "$SUPABASE_DB_URL")" || db_hosts="<unparseable>"
if [ "${ALLOW_NONLOCAL_DB_RESET:-}" != 1 ]; then
  for h in $db_hosts; do
    case "$h" in
      127.0.0.1|localhost|::1|/*) ;;
      *)
        echo "[db-reset] refusing to reset non-local database host '$h' (SUPABASE_DB_URL)." >&2
        echo "[db-reset] Only 127.0.0.1, localhost and ::1 are allowed; set ALLOW_NONLOCAL_DB_RESET=1 to override." >&2
        exit 2
        ;;
    esac
  done
fi
}
