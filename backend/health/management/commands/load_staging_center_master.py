"""Import 25 source-approved-for-review center *names* into isolated Staging.

Names and sectors arrive only through private Railway variables (not public GitHub).
Never infer building ownership, locality, manager, or a regulatory approval.
Every organizational mapping remains a draft until superuser review.
"""
import base64
from hashlib import sha256
import json
import os
import re
import zlib

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from health.models import (
    AuditLog, HealthCenter, OrganizationUnit, OrganizationUnitApprovalLog,
)

PROJECT_ID = 'cf4b2162-5236-4f92-b010-165f505fe2c2'
PAYLOAD = 'OHP_CENTER_MASTER_ZLIB_B64'
FINGERPRINT = 'OHP_CENTER_MASTER_SHA256'
EXPECTED_SECTOR_SIZES = (7, 6, 6, 6)
MAX_COMPRESSED = 12000
MAX_UNCOMPRESSED = 30000


def normalized_name(value):
    """Normalize spelling for exact matching, without conflating different centers."""
    val = re.sub(r'[\u064b-\u065f\u0670\u0640]', '', str(value).strip())
    val = re.sub(r'[أإآٱ]', 'ا', val)
    val = val.replace('ى', 'ي').replace('ة', 'ه')
    val = re.sub(r'\s+', ' ', val).strip().casefold()
    # Accept only explicit generic "health center" title variants as aliases.
    # Exact place names remain distinct: بدر != بدر الغربي.
    val = re.sub(r'^(?:مركز صحي|المركز الصحي|مركز)\s+', '', val)
    return re.sub(r'\s+الصحي$', '', val).strip()


def parse_source(payload, fingerprint):
    if (not payload or len(payload) > MAX_COMPRESSED
            or not re.fullmatch(r'[A-Za-z0-9+/=]+', payload)):
        raise CommandError('Missing or oversized center reference payload.')
    if not re.fullmatch(r'[0-9a-f]{64}', fingerprint or ''):
        raise CommandError('Invalid center reference fingerprint.')
    try:
        encoded = base64.b64decode(payload, validate=True)
        decompressor = zlib.decompressobj()
        raw = decompressor.decompress(encoded, MAX_UNCOMPRESSED + 1)
        if not decompressor.eof or decompressor.unconsumed_tail or decompressor.unused_data:
            raise ValueError('Incomplete center source.')
        if len(raw) > MAX_UNCOMPRESSED or sha256(raw).hexdigest() != fingerprint:
            raise ValueError('Center source exceeded limit or fingerprint changed.')
        records = json.loads(raw.decode('utf-8'))
    except (ValueError, UnicodeError, zlib.error) as exc:
        raise CommandError('Invalid center source data.') from exc

    if not isinstance(records, list) or len(records) != 25:
        raise CommandError('The reviewed source must contain exactly 25 centers.')
    seen_names = set()
    sizes = []
    previous_sector = None
    for index, item in enumerate(records, 1):
        if not isinstance(item, dict) or set(item) != {
            'code', 'name', 'sector', 'source_rows', 'source_path',
        }:
            raise CommandError('Unexpected center source fields.')
        if item['code'] != f'TMP-C{index:03}':
            raise CommandError('Unexpected center source reference.')
        if not isinstance(item['name'], str) or not 1 <= len(item['name']) <= 150:
            raise CommandError('Invalid center display name.')
        if not isinstance(item['sector'], str) or not 3 <= len(item['sector']) <= 220:
            raise CommandError('Invalid sector name.')
        if any(not isinstance(item[key], str) for key in ('source_rows', 'source_path')):
            raise CommandError('Invalid source metadata.')
        if len(item['source_rows']) > 255 or len(item['source_path']) > 2000:
            raise CommandError('Source metadata is too large.')
        key = normalized_name(item['name'])
        if not key or key in seen_names:
            raise CommandError('Duplicate or empty center display name.')
        seen_names.add(key)
        if previous_sector != item['sector']:
            sizes.append(0)
            previous_sector = item['sector']
        sizes[-1] += 1
    if tuple(sizes) != EXPECTED_SECTOR_SIZES:
        raise CommandError('Center-to-sector distribution differs from reviewed mapping.')
    return records


class Command(BaseCommand):
    help = 'Import 25 reviewed names as Staging master centers, retain approval gate.'

    def handle(self, *args, **kwargs):
        if (os.environ.get('STAGING_MODE', '').lower() != 'true'
                or os.environ.get('RAILWAY_PROJECT_ID') != PROJECT_ID):
            raise CommandError('The center source loader only runs in the isolated Staging project.')
        records = parse_source(
            os.environ.get(PAYLOAD, ''), os.environ.get(FINGERPRINT, ''),
        )
        created_count = reused_count = linked_count = 0
        with transaction.atomic():
            units = {
                row.code: row for row in OrganizationUnit.objects
                .select_for_update().select_related('parent', 'health_center')
                .filter(code__in=[entry['code'] for entry in records])
            }
            if len(units) != len(records):
                raise CommandError('A reviewed organizational center is missing. No centers were imported.')
            for item in records:
                unit = units[item['code']]
                if (unit.kind != 'center'
                        or normalized_name(unit.name) != normalized_name(item['name'])
                        or not unit.parent
                        or normalized_name(unit.parent.name) != normalized_name(item['sector'])):
                    raise CommandError('Source center hierarchy differs from staging proposals.')

            # Build the exact-name lookup once. No fuzzy matching and no edits to
            # previously saved employees, center master metadata, or QA entries.
            existing_centers = list(HealthCenter.objects.select_for_update().all())
            for item in records:
                unit = units[item['code']]
                source_code = 'OHP-REF-C' + item['code'][-3:]
                matching = [center for center in existing_centers
                            if any(normalized_name(label) == normalized_name(item['name'])
                                   for label in (center.name, center.name_ar) if label)]
                coded = [center for center in existing_centers if center.code == source_code]
                unique = {center.pk: center for center in matching + coded}
                if len(unique) > 1:
                    raise CommandError('Ambiguous center name or source reference; manual review required.')
                if unique:
                    center = next(iter(unique.values()))
                    if center.code == source_code and normalized_name(center.name) != normalized_name(item['name']):
                        raise CommandError('Source reference points to a different health center.')
                    reused_count += 1
                else:
                    center = HealthCenter.objects.create(
                        name=item['name'],
                        name_ar=item['name'],
                        name_en='',
                        code=source_code,
                        # No location, manager, building type or official
                        # accreditation has been confirmed in source workbook.
                        region='', city='', district='',
                        building_type=HealthCenter.BuildingType.UNKNOWN,
                        manager_name='',
                        is_active=True,
                        notes='مركز وارد في ملف المطابقة التنظيمية؛ البيانات المكانية والمدير ونوع المبنى بانتظار التحقق. '
                              'الرمز المرجعي: ' + item['code'],
                    )
                    existing_centers.append(center)
                    created_count += 1
                if unit.health_center_id and unit.health_center_id != center.pk:
                    raise CommandError('Existing organizational mapping differs from the reviewed source.')
                if not unit.health_center_id:
                    unit.health_center = center
                    unit.save(update_fields=['health_center', 'updated_at'])
                    # This is a proposed name-to-name match, NOT approval.
                    OrganizationUnitApprovalLog.objects.create(
                        unit=unit, action='source-center-map',
                        approval_reference='', user=None,
                    )
                    linked_count += 1

            AuditLog.objects.create(
                user='staging-center-reference', action='import_center_master_drafts',
                model_name='HealthCenter', record_id='25-reviewed-centers',
            )
        self.stdout.write(self.style.SUCCESS(
            'Staging center references reconciled: '
            f'{created_count} created, {reused_count} reused, '
            f'{linked_count} organizational matches. '
            'No approvals or employee records were changed.'
        ))
, '', val).strip()


def parse_source(payload, fingerprint):
    if (not payload or len(payload) > MAX_COMPRESSED
            or not re.fullmatch(r'[A-Za-z0-9+/=]+', payload)):
        raise CommandError('Missing or oversized center reference payload.')
    if not re.fullmatch(r'[0-9a-f]{64}', fingerprint or ''):
        raise CommandError('Invalid center reference fingerprint.')
    try:
        encoded = base64.b64decode(payload, validate=True)
        decompressor = zlib.decompressobj()
        raw = decompressor.decompress(encoded, MAX_UNCOMPRESSED + 1)
        if not decompressor.eof or decompressor.unconsumed_tail or decompressor.unused_data:
            raise ValueError('Incomplete center source.')
        if len(raw) > MAX_UNCOMPRESSED or sha256(raw).hexdigest() != fingerprint:
            raise ValueError('Center source exceeded limit or fingerprint changed.')
        records = json.loads(raw.decode('utf-8'))
    except (ValueError, UnicodeError, zlib.error) as exc:
        raise CommandError('Invalid center source data.') from exc

    if not isinstance(records, list) or len(records) != 25:
        raise CommandError('The reviewed source must contain exactly 25 centers.')
    seen_names = set()
    sizes = []
    previous_sector = None
    for index, item in enumerate(records, 1):
        if not isinstance(item, dict) or set(item) != {
            'code', 'name', 'sector', 'source_rows', 'source_path',
        }:
            raise CommandError('Unexpected center source fields.')
        if item['code'] != f'TMP-C{index:03}':
            raise CommandError('Unexpected center source reference.')
        if not isinstance(item['name'], str) or not 1 <= len(item['name']) <= 150:
            raise CommandError('Invalid center display name.')
        if not isinstance(item['sector'], str) or not 3 <= len(item['sector']) <= 220:
            raise CommandError('Invalid sector name.')
        if any(not isinstance(item[key], str) for key in ('source_rows', 'source_path')):
            raise CommandError('Invalid source metadata.')
        if len(item['source_rows']) > 255 or len(item['source_path']) > 2000:
            raise CommandError('Source metadata is too large.')
        key = normalized_name(item['name'])
        if not key or key in seen_names:
            raise CommandError('Duplicate or empty center display name.')
        seen_names.add(key)
        if previous_sector != item['sector']:
            sizes.append(0)
            previous_sector = item['sector']
        sizes[-1] += 1
    if tuple(sizes) != EXPECTED_SECTOR_SIZES:
        raise CommandError('Center-to-sector distribution differs from reviewed mapping.')
    return records


class Command(BaseCommand):
    help = 'Import 25 reviewed names as Staging master centers, retain approval gate.'

    def handle(self, *args, **kwargs):
        if (os.environ.get('STAGING_MODE', '').lower() != 'true'
                or os.environ.get('RAILWAY_PROJECT_ID') != PROJECT_ID):
            raise CommandError('The center source loader only runs in the isolated Staging project.')
        records = parse_source(
            os.environ.get(PAYLOAD, ''), os.environ.get(FINGERPRINT, ''),
        )
        created_count = reused_count = linked_count = 0
        with transaction.atomic():
            units = {
                row.code: row for row in OrganizationUnit.objects
                .select_for_update().select_related('parent', 'health_center')
                .filter(code__in=[entry['code'] for entry in records])
            }
            if len(units) != len(records):
                raise CommandError('A reviewed organizational center is missing. No centers were imported.')
            for item in records:
                unit = units[item['code']]
                if (unit.kind != 'center'
                        or normalized_name(unit.name) != normalized_name(item['name'])
                        or not unit.parent
                        or normalized_name(unit.parent.name) != normalized_name(item['sector'])):
                    raise CommandError('Source center hierarchy differs from staging proposals.')

            # Build the exact-name lookup once. No fuzzy matching and no edits to
            # previously saved employees, center master metadata, or QA entries.
            existing_centers = list(HealthCenter.objects.select_for_update().all())
            for item in records:
                unit = units[item['code']]
                source_code = 'OHP-REF-C' + item['code'][-3:]
                matching = [center for center in existing_centers
                            if any(normalized_name(label) == normalized_name(item['name'])
                                   for label in (center.name, center.name_ar) if label)]
                coded = [center for center in existing_centers if center.code == source_code]
                unique = {center.pk: center for center in matching + coded}
                if len(unique) > 1:
                    raise CommandError('Ambiguous center name or source reference; manual review required.')
                if unique:
                    center = next(iter(unique.values()))
                    if center.code == source_code and normalized_name(center.name) != normalized_name(item['name']):
                        raise CommandError('Source reference points to a different health center.')
                    reused_count += 1
                else:
                    center = HealthCenter.objects.create(
                        name=item['name'],
                        name_ar=item['name'],
                        name_en='',
                        code=source_code,
                        # No location, manager, building type or official
                        # accreditation has been confirmed in source workbook.
                        region='', city='', district='',
                        building_type=HealthCenter.BuildingType.UNKNOWN,
                        manager_name='',
                        is_active=True,
                        notes='مركز وارد في ملف المطابقة التنظيمية؛ البيانات المكانية والمدير ونوع المبنى بانتظار التحقق. '
                              'الرمز المرجعي: ' + item['code'],
                    )
                    existing_centers.append(center)
                    created_count += 1
                if unit.health_center_id and unit.health_center_id != center.pk:
                    raise CommandError('Existing organizational mapping differs from the reviewed source.')
                if not unit.health_center_id:
                    unit.health_center = center
                    unit.save(update_fields=['health_center', 'updated_at'])
                    # This is a proposed name-to-name match, NOT approval.
                    OrganizationUnitApprovalLog.objects.create(
                        unit=unit, action='source-center-map',
                        approval_reference='', user=None,
                    )
                    linked_count += 1

            AuditLog.objects.create(
                user='staging-center-reference', action='import_center_master_drafts',
                model_name='HealthCenter', record_id='25-reviewed-centers',
            )
        self.stdout.write(self.style.SUCCESS(
            'Staging center references reconciled: '
            f'{created_count} created, {reused_count} reused, '
            f'{linked_count} organizational matches. '
            'No approvals or employee records were changed.'
        ))
