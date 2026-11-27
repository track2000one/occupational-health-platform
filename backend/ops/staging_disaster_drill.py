#!/usr/bin/env python3
"""Offline, local-only synthetic PostgreSQL disaster recovery rehearsal.
No Railway URLs, no live restore, no plaintext files, no background scheduler.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
from urllib.parse import urlsplit, unquote

import psycopg2
from psycopg2 import sql

SOURCE_NAMES={'occupational_ci','ohp_qa_source'}
TARGET_RE=re.compile(r'(occupational_ci_dr_|ohp_qa_restore_)[a-z0-9_]{1,32}')
MAX_TABLES=500
MAX_MANIFEST=1024*1024

def require(condition,message):
    if not condition:
        raise ValueError(message)

def connection(name,restore=False):
    raw=os.environ.get(name,'')
    u=urlsplit(raw)
    db=unquote(u.path.removeprefix('/'))
    require(u.scheme in ('postgres','postgresql') and u.hostname=='127.0.0.1'
            and not u.query and not u.fragment and u.username and u.password,
            'Only explicitly configured loopback synthetic PostgreSQL URLs are accepted.')
    require(bool(TARGET_RE.fullmatch(db)) if restore else db in SOURCE_NAMES,
            'Database name is not an approved disposable rehearsal name.')
    kw={'host':'127.0.0.1','port':u.port or 5432,'dbname':db,'user':unquote(u.username),
        'password':unquote(u.password),'sslmode':'disable','connect_timeout':10}
    env={k:v for k,v in os.environ.items() if not k.startswith(('PG','DATABASE_URL','RESTORE_DATABASE_URL','OHP_DR_'))}
    env.update(PGHOST=kw['host'],PGPORT=str(kw['port']),PGDATABASE=db,PGUSER=kw['user'],
               PGPASSWORD=kw['password'],PGSSLMODE='disable',PGCONNECT_TIMEOUT='10',PGOPTIONS='-c timezone=UTC')
    return kw,env

def safe_path(path,secret=False):
    p=Path(path).expanduser().resolve()
    repo=Path(__file__).resolve().parents[2]
    require(not p.is_relative_to(repo),'Keys and archives must be outside the repository.')
    if secret:
        require(p.is_file() and 32<=p.stat().st_size<=4096,'Separate high-entropy key file required (32–4096 bytes).')
        require(os.name=='nt' or (p.stat().st_mode & 0o077)==0,'Key file permissions must restrict access to owner.')
    return p

def gpg(secret):
    return ['gpg','--batch','--yes','--pinentry-mode','loopback','--no-symkey-cache','--passphrase-file',str(secret)]

def check(args,**kw):
    result=subprocess.run(args,stderr=subprocess.DEVNULL,check=False,**kw)
    if result.returncode:
        raise RuntimeError(f'{args[0]} failed; operation stopped (exit {result.returncode}).')
    return result

def digest(path):
    h=sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):
            h.update(chunk)
    return h.hexdigest()

def server_major(conn):
    return conn.server_version//10000

def versions(conn):
    out=check(['pg_dump','--version'],stdout=subprocess.PIPE).stdout.decode()
    found=re.search(r'(\d+)\.\d+',out)
    require(found and int(found.group(1))==server_major(conn),'Use the same PostgreSQL major version for the client and server.')

def fingerprints(conn):
    # Scope: ordinary public tables in the Django schema, including binary data and auth.
    with conn.cursor() as c:
        c.execute("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename")
        names=[r[0] for r in c.fetchall()]
    require(0<len(names)<=MAX_TABLES,'Unexpected table inventory.')
    results={}
    for i,name in enumerate(names):
        h=sha256();n=0
        # Stable order; every field is included. Stream only row digests, never plaintext.
        query=sql.SQL("SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h FROM public.{} t ORDER BY h").format(sql.Identifier(name))
        with conn.cursor(name=f'qa_dr_{i}') as c:
            c.itersize=1000
            c.execute(query)
            for (row_hash,) in c:
                n+=1;h.update(row_hash.encode('ascii'));h.update(b'\n')
        results[name]={'rows':n,'sha256':h.hexdigest()}
    return results

def fresh_target(conn):
    # No preexisting user objects in any non-system schema, not merely public tables.
    with conn.cursor() as c:
        c.execute("""SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
            AND n.nspname NOT LIKE 'pg_temp_%'""")
        require(c.fetchone()[0]==0,'Restore database is not empty; refusing to overwrite.')
        c.execute("""SELECT count(*) FROM pg_catalog.pg_namespace
            WHERE nspname NOT IN ('public','pg_catalog','information_schema') AND nspname NOT LIKE 'pg_toast%'
            AND nspname NOT LIKE 'pg_temp_%'""")
        require(c.fetchone()[0]==0,'Restore database has non-default schemas.')
        c.execute("SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'")
        require(c.fetchone()[0]==0,'Restore database has existing functions.')

def encrypt_dump(env,snapshot,secret,archive):
    with subprocess.Popen(['pg_dump','--format=custom','--no-owner','--no-acl','--compress=6','--snapshot='+snapshot],
                          env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL) as dump:
        try:
            with subprocess.Popen(gpg(secret)+['--symmetric','--cipher-algo','AES256','--output',str(archive)],
                                  stdin=dump.stdout,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL) as cipher:
                dump.stdout.close()
                cipher_status=cipher.wait()
        finally:
            dump_status=dump.wait()
    require(dump_status==0 and cipher_status==0 and archive.is_file() and archive.stat().st_size>0,
            'Encrypted dump pipeline failed.')

def backup(args,secret):
    kw,env=connection('OHP_DR_SOURCE_URL')
    dest=safe_path(args.output_dir)
    require(not secret.is_relative_to(dest),'Keep the secret separate from the archive directory.')
    dest.mkdir(mode=0o700,parents=True,exist_ok=True)
    name='ohp-qa-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+secrets.token_hex(4)+'.pgdump.gpg'
    archive=dest/name;manifest=dest/(name+'.manifest.gpg')
    archive_part=dest/(name+'.partial');manifest_part=dest/(name+'.manifest.partial')
    start=time.monotonic()
    conn=psycopg2.connect(**kw)
    try:
        conn.set_session(isolation_level='REPEATABLE READ',readonly=True)
        versions(conn)
        with conn.cursor() as c:
            c.execute("SET LOCAL TIME ZONE 'UTC'")
            c.execute('SELECT pg_export_snapshot()')
            snapshot=c.fetchone()[0]
        tables=fingerprints(conn)
        require('health_employee' in tables and 'health_stagingmedicalattachment' in tables and 'django_migrations' in tables,
                'Expected application schema is absent.')
        encrypt_dump(env,snapshot,secret,archive_part)
        evidence={'version':1,'source_class':'local_synthetic_only','created_utc':datetime.now(timezone.utc).isoformat(),
                  'server_major':server_major(conn),'archive_name':name,'archive_sha256':digest(archive_part),'tables':tables}
        check(gpg(secret)+['--symmetric','--cipher-algo','AES256','--output',str(manifest_part)],
              input=json.dumps(evidence,sort_keys=True).encode(),stdout=subprocess.DEVNULL)
        archive_part.rename(archive);manifest_part.rename(manifest)
        print(f'SYNTHETIC BACKUP PASS | {name} | tables={len(tables)} | encrypted_bytes={archive.stat().st_size} | seconds={time.monotonic()-start:.2f}')
    except Exception:
        for path in (archive,manifest,archive_part,manifest_part):
            path.unlink(missing_ok=True)
        raise
    finally:
        conn.close()

def restore(args,secret):
    kw,env=connection('OHP_DR_TARGET_URL',restore=True)
    require(args.confirm_disposable,'Explicit disposable database confirmation is required.')
    archive=safe_path(args.archive);manifest=archive.with_name(archive.name+'.manifest.gpg')
    require(archive.is_file() and manifest.is_file() and 0<manifest.stat().st_size<=MAX_MANIFEST,
            'Both encrypted archive and encrypted manifest are required.')
    # GPG authentication must pass for BOTH files before any SQL restore.
    raw=check(gpg(secret)+['--decrypt',str(manifest)],stdout=subprocess.PIPE).stdout
    require(len(raw)<=MAX_MANIFEST,'Manifest exceeds allowed size.')
    evidence=json.loads(raw)
    require(evidence.get('version')==1 and evidence.get('source_class')=='local_synthetic_only'
            and evidence.get('archive_name')==archive.name and evidence.get('archive_sha256')==digest(archive),
            'Archive name or cryptographic digest does not match the authenticated manifest.')
    check(gpg(secret)+['--decrypt',str(archive)],stdout=subprocess.DEVNULL)
    start=time.monotonic()
    conn=psycopg2.connect(**kw)
    try:
        versions(conn)
        require(server_major(conn)==evidence['server_major'],'Restore server major differs from backup.')
        fresh_target(conn)
        conn.rollback()
        # No --clean, no --create, no DROP; the restore is all-or-nothing on SQL error.
        with subprocess.Popen(gpg(secret)+['--decrypt',str(archive)],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL) as plain:
            try:
                with subprocess.Popen(['pg_restore','--single-transaction','--exit-on-error','--no-owner','--no-acl','--dbname',kw['dbname']],
                                      env=env,stdin=plain.stdout,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL) as unpack:
                    plain.stdout.close();restore_status=unpack.wait()
            finally:
                plain_status=plain.wait()
        require(restore_status==0 and plain_status==0,'Isolated restore failed; discard this disposable database.')
        conn.set_session(isolation_level='REPEATABLE READ',readonly=True)
        with conn.cursor() as c:c.execute("SET LOCAL TIME ZONE 'UTC'")
        actual=fingerprints(conn)
        require(actual==evidence['tables'],'Restored table inventory or contents differ; discard target.')
        print(f'SYNTHETIC RESTORE PASS | tables={len(actual)} | rows={sum(v["rows"] for v in actual.values())} | seconds={time.monotonic()-start:.2f}')
    finally:
        conn.close()

def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    for command in ('backup','restore-verify'):
        p=sub.add_parser(command)
        p.add_argument('--passphrase-file',required=True)
        p.add_argument('--confirm-synthetic',action='store_true')
        if command=='backup':p.add_argument('--output-dir',required=True)
        else:
            p.add_argument('--archive',required=True)
            p.add_argument('--confirm-disposable',action='store_true')
    args=parser.parse_args()
    try:
        require(args.confirm_synthetic,'Synthetic-only confirmation required.')
        secret=safe_path(args.passphrase_file,secret=True)
        (backup if args.command=='backup' else restore)(args,secret)
    except (ValueError,RuntimeError,OSError,KeyError,TypeError,psycopg2.Error):
        # No connection string, row data, or secrets in errors.
        print('DR operation refused or failed; inspect approved local configuration and discard any failed restore target.',file=sys.stderr)
        return 1
    return 0

if __name__=='__main__':
    raise SystemExit(main())
