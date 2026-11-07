#!/usr/bin/env python3
"""Encrypted pg_dump and isolated restore verification for Occupational Health.

Requirements: PostgreSQL CLI client (pg_dump, pg_restore, psql), GnuPG (gpg).
No PostgreSQL credentials, passphrases, or plaintext dumps are written to disk
by this program. The encrypted archive must be copied to approved offsite storage.

NOTE: This does not schedule backups or provide Railway connectivity by itself.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
from urllib.parse import unquote, urlsplit


def database_env(name: str) -> tuple[dict[str, str], tuple[str, str, str]]:
    raw = os.environ.get(name, "")
    parsed = urlsplit(raw)
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname:
        raise ValueError(f"{name} must contain a valid PostgreSQL connection URL")
    dbname = unquote(parsed.path.removeprefix("/"))
    if not dbname or not re.fullmatch(r"[A-Za-z0-9_+.-]+", dbname):
        raise ValueError(f"{name} has a missing or unsupported database name")
    env = os.environ.copy()
    env.update({
        "PGHOST": parsed.hostname,
        "PGPORT": str(parsed.port or 5432),
        "PGDATABASE": dbname,
        "PGUSER": unquote(parsed.username or ""),
        "PGPASSWORD": unquote(parsed.password or ""),
        "PGSSLMODE": env.get("PGSSLMODE", "require"),
        "PGCONNECT_TIMEOUT": "15",
    })
    return env, (parsed.hostname.lower(), str(parsed.port or 5432), dbname)


def run_checked(args: list[str], *, env: dict[str, str], stdout=None) -> subprocess.CompletedProcess:
    outcome = subprocess.run(args, env=env, stdout=stdout, stderr=subprocess.PIPE, check=False)
    if outcome.returncode:
        # Avoid printing database connection details and confidential data in logs.
        raise RuntimeError(f"{args[0]} failed (exit {outcome.returncode}); check connection and local permissions")
    return outcome


def client_major() -> int:
    result = subprocess.run(["pg_dump", "--version"], capture_output=True, text=True, check=True)
    match = re.search(r"(\d+)\.\d+", result.stdout)
    if not match:
        raise RuntimeError("Cannot determine pg_dump major version")
    return int(match.group(1))


def verify_client_compatible(env: dict[str, str]) -> None:
    version = run_checked(["psql", "-X", "-A", "-t", "-c", "SHOW server_version_num"],
                          env=env, stdout=subprocess.PIPE)
    server_major = int(version.stdout.decode().strip()) // 10000
    if client_major() < server_major:
        raise RuntimeError(
            f"pg_dump client is older than server major {server_major}; install PostgreSQL client {server_major}+"
        )


def passphrase_file(path: Path) -> Path:
    if not path.is_file() or not path.stat().st_size:
        raise ValueError("A separate, nonempty passphrase file is required")
    if path.resolve().is_relative_to(Path.cwd().resolve()):
        raise ValueError("Store the passphrase file outside the repository and source directory")
    return path


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while data := handle.read(1024 * 1024):
            digest.update(data)
    return digest.hexdigest()


def backup(args: argparse.Namespace) -> None:
    env, _ = database_env(args.database_url_env)
    verify_client_compatible(env)
    secret_file = passphrase_file(Path(args.passphrase_file))
    dest = Path(args.output_dir).expanduser().resolve()
    if dest.is_relative_to(Path.cwd().resolve()):
        raise ValueError("Backup destination must be outside the repository")
    dest.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archive = dest / f"ohp-{stamp}-{secrets.token_hex(4)}.pgdump.gpg"
    os.umask(0o077)

    try:
        with subprocess.Popen(
            ["pg_dump", "--format=custom", "--no-owner", "--no-acl", "--compress=6"],
            env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        ) as dumper:
            try:
                with subprocess.Popen(
                    ["gpg", "--batch", "--yes", "--pinentry-mode", "loopback",
                     "--passphrase-file", str(secret_file), "--symmetric",
                     "--cipher-algo", "AES256", "--output", str(archive)],
                    stdin=dumper.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                ) as encryptor:
                    if dumper.stdout:
                        dumper.stdout.close()
                    cipher_status = encryptor.wait()
            finally:
                dump_status = dumper.wait()
        if dump_status or cipher_status or not archive.is_file() or archive.stat().st_size == 0:
            raise RuntimeError("Encrypted backup pipeline failed; no usable backup was created")

        digest = checksum(archive)
        manifest = archive.with_suffix(archive.suffix + ".sha256")
        manifest.write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
        print("Encrypted PostgreSQL backup created.")
        print(f"Archive: {archive}")
        print(f"SHA256: {digest}")
        print(f"Verification manifest: {manifest}")
        print("IMPORTANT: Copy archive AND manifest offsite; restore test is still required.")
    except Exception:
        archive.unlink(missing_ok=True)
        archive.with_suffix(archive.suffix + ".sha256").unlink(missing_ok=True)
        raise


def row_count(env: dict[str, str], table: str) -> int:
    statement = f"SELECT count(*) FROM public.{table};"
    out = run_checked(["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", statement],
                      env=env, stdout=subprocess.PIPE)
    return int(out.stdout.decode().strip())


def verify_restore(args: argparse.Namespace) -> None:
    source_env, source_location = database_env(args.database_url_env)
    target_env, target_location = database_env(args.restore_url_env)
    if source_location == target_location:
        raise ValueError("Refusing to restore into source PostgreSQL database")
    if not args.confirm_disposable:
        raise ValueError("Restore requires --confirm-disposable and a fresh isolated database")
    target_tables = run_checked([
        "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c",
        "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public';",
    ], env=target_env, stdout=subprocess.PIPE)
    if int(target_tables.stdout.decode().strip()) != 0:
        raise ValueError("Restore target has existing public tables; refusing to overwrite")

    secret_file = passphrase_file(Path(args.passphrase_file))
    archive = Path(args.archive).expanduser().resolve()
    if not archive.is_file() or archive.stat().st_size == 0:
        raise ValueError("Encrypted archive not found")
    manifest = archive.with_suffix(archive.suffix + ".sha256")
    if not manifest.is_file():
        raise ValueError("Signed-off SHA256 manifest is required")
    recorded = manifest.read_text(encoding="utf-8").strip().split(maxsplit=1)
    if len(recorded) != 2 or recorded[1] != archive.name or recorded[0] != checksum(archive):
        raise ValueError("Encrypted backup SHA256 verification failed")

    with subprocess.Popen([
        "gpg", "--batch", "--yes", "--pinentry-mode", "loopback",
        "--passphrase-file", str(secret_file), "--decrypt", str(archive),
    ], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as decryptor:
        try:
            with subprocess.Popen([
                "pg_restore", "--no-owner", "--no-acl", "--exit-on-error",
                "--dbname", target_location[2],
            ], env=target_env, stdin=decryptor.stdout, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL) as restorer:
                if decryptor.stdout:
                    decryptor.stdout.close()
                restore_status = restorer.wait()
        finally:
            decrypt_status = decryptor.wait()
    if restore_status or decrypt_status:
        raise RuntimeError("Decryption or isolated PostgreSQL restore failed")

    checked = ("health_employee", "health_healthcenter")
    for table in checked:
        expected = row_count(source_env, table)
        found = row_count(target_env, table)
        if expected != found:
            raise RuntimeError(f"Restored row count mismatch for {table}")
    print("Encrypted PostgreSQL restore drill: PASS (employee and health center counts match).")
    print("This drill verifies a disposable restore; it does not schedule future backups.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("backup")
    create.add_argument("--database-url-env", default="DATABASE_URL")
    create.add_argument("--output-dir", required=True)
    create.add_argument("--passphrase-file", required=True)
    restore = commands.add_parser("restore-verify")
    restore.add_argument("--database-url-env", default="DATABASE_URL")
    restore.add_argument("--restore-url-env", default="RESTORE_DATABASE_URL")
    restore.add_argument("--archive", required=True)
    restore.add_argument("--passphrase-file", required=True)
    restore.add_argument("--confirm-disposable", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "backup":
            backup(args)
        else:
            verify_restore(args)
    except (ValueError, RuntimeError, OSError, subprocess.CalledProcessError) as exc:
        print(f"Backup operation blocked or failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
