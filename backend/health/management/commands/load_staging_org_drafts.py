"""Load only reviewed organizational *drafts* from a staging Railway variable.

No employee, health-center or approved-organization updates; no real names in a
public GitHub repository, logs, or startup configuration. Safe to replay.
"""
import base64
import hashlib
import json
import os
import re
import zlib
from collections import Counter

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from health.models import OrganizationUnit


STAGING_PROJECT_ID = 'cf4b2162-5236-4f92-b010-165f505fe2c2'
PAYLOAD_VARIABLE = 'OHP_ORG_DRAFTS_ZLIB_B64'
DIGEST_VARIABLE = 'OHP_ORG_DRAFTS_SHA256'
EXPECTED_COUNTS = {'sector': 4, 'center': 25, 'unit': 47, 'department': 31}
KINDS = ['sector', 'center', 'unit', 'department']
CODE_PATTERNS = {
    'sector': re.compile(r'^TMP-S-[0-9A-F]{12}$'),
    'center': re.compile(r'^TMP-C[0-9]{3}$'),
    'unit': re.compile(r'^TMP-U[0-9]{3}$'),
    'department': re.compile(r'^TMP-O[0-9]{3}$'),
}


def decode_draft_payload(encoded, expected_digest):
    if not encoded or len(encoded) > 15000 or not re.fullmatch(r'[A-Za-z0-9+/=]+', encoded):
        raise CommandError('Missing or oversized organizational staging payload.')
    if not expected_digest or not re.fullmatch(r'[0-9a-f]{64}', expected_digest):
        raise CommandError('Organizational payload fingerprint is missing.')
    try:
        packed = base64.b64decode(encoded, validate=True)
        decoder = zlib.decompressobj()
        plain = decoder.decompress(packed, 100001)
        if not decoder.eof or decoder.unconsumed_tail or decoder.unused_data or len(plain) > 100000:
            raise ValueError('Invalid compressed payload bounds.')
        if hashlib.sha256(plain).hexdigest() != expected_digest:
            raise ValueError('Checksum mismatch.')
        plans = json.loads(plain.decode('utf-8'))
    except (ValueError, UnicodeError, zlib.error, json.JSONDecodeError) as exc:
        raise CommandError('Invalid or altered staging organization payload.') from exc

    if not isinstance(plans, list) or len(plans) != 107:
        raise CommandError('Unexpected organizational reference count.')
    counts = Counter()
    seen = set()
    by_code = {}
    for item in plans:
        if not isinstance(item, dict) or set(item) != {
            'code', 'name', 'kind', 'parent_code', 'source_path', 'source_sheet', 'source_rows'
        }:
            raise CommandError('Unexpected organizational reference fields.')
        code, name, kind, parent = (item.get('code'), item.get('name'),
                                   item.get('kind'), item.get('parent_code'))
        if kind not in CODE_PATTERNS or not isinstance(code, str) or not CODE_PATTERNS[kind].fullmatch(code):
            raise CommandError('Unexpected organizational reference code.')
        if not isinstance(name, str) or not name.strip() or len(name) > 220:
            raise CommandError('Invalid organization name.')
        if code in seen:
            raise CommandError('Duplicate organizational reference code.')
        seen.add(code)
        counts[kind] += 1
        by_code[code] = item
        for key, limit in [('source_path', 4000), ('source_rows', 255), ('source_sheet', 80)]:
            if not isinstance(item[key], str) or len(item[key]) > limit:
                raise CommandError('Invalid organizational reference metadata.')
        if not isinstance(parent, str):
            raise CommandError('Invalid parent reference.')
    if dict(counts) != EXPECTED_COUNTS:
        raise CommandError('Organizational category counts differ from reviewed workbook.')
    for item in plans:
        parent = item['parent_code']
        if item['kind'] in ('sector', 'department'):
            if parent:
                raise CommandError('Root organization must not have an inferred parent.')
        elif item['kind'] == 'center':
            if parent not in by_code or by_code[parent]['kind'] != 'sector':
                raise CommandError('Unverified health center sector.')
        elif item['kind'] == 'unit':
            if parent not in by_code or by_code[parent]['kind'] != 'center':
                raise CommandError('Unverified unit center.')
    return plans


class Command(BaseCommand):
    help = 'Stage 107 reviewed organization proposals as unapproved drafts, Staging only.'

    def handle(self, *args, **options):
        if (os.getenv('STAGING_MODE', '').lower() != 'true'
                or os.getenv('RAILWAY_PROJECT_ID') != STAGING_PROJECT_ID):
            raise CommandError('Organizational draft load is restricted to isolated Staging.')
        plans = decode_draft_payload(
            os.getenv(PAYLOAD_VARIABLE, ''), os.getenv(DIGEST_VARIABLE, ''),
        )
        with transaction.atomic():
            for item in plans:
                existing = OrganizationUnit.objects.filter(code=item['code']).select_related('parent').first()
                if existing and (
                    existing.name != item['name'] or existing.kind != item['kind']
                    or (existing.parent.code if existing.parent_id else '') != item['parent_code']
                ):
                    raise CommandError('Organizational draft reference conflicts with existing data.')
            created = 0
            # Parents always exist before children; only additive upserts.
            for kind in KINDS:
                for item in (row for row in plans if row['kind'] == kind):
                    parent = (OrganizationUnit.objects.get(code=item['parent_code'])
                              if item['parent_code'] else None)
                    _, new = OrganizationUnit.objects.get_or_create(
                        code=item['code'],
                        defaults={
                            'name': item['name'], 'kind': item['kind'],
                            'parent': parent, 'source_path': item['source_path'],
                            'source_sheet': item['source_sheet'],
                            'source_rows': item['source_rows'],
                            'is_approved': False, 'is_active': True,
                        },
                    )
                    created += bool(new)
        self.stdout.write(self.style.SUCCESS(
            f'Organizational staging drafts loaded: {created} new, '
            f'{len(plans)} proposed. Approvals: unchanged. Employees: unchanged.'))
