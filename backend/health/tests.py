from django.test import SimpleTestCase

from .importers import resolve_employee_field_mapping


class BilingualJobTitleMappingTests(SimpleTestCase):
    def test_bilingual_columns_map_to_one_job_with_two_translations(self):
        headers = ["Name", "مسمى الوظيفي", "Job Title", "National ID"]
        mapping, _ = resolve_employee_field_mapping(headers)

        self.assertEqual(mapping["job_title"], 1)
        self.assertEqual(mapping["job_title_en"], 2)

    def test_english_only_legacy_column_maps_once(self):
        mapping, _ = resolve_employee_field_mapping(["Name", "Job Title"])

        self.assertEqual(mapping["job_title"], 1)
        self.assertIsNone(mapping["job_title_en"])

    def test_arabic_only_column_maps_to_primary(self):
        mapping, _ = resolve_employee_field_mapping(["Name", "المسمى الوظيفي"])

        self.assertEqual(mapping["job_title"], 1)
        self.assertIsNone(mapping["job_title_en"])

    def test_manual_duplicate_column_assignment_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "multiple employee fields"):
            resolve_employee_field_mapping(
                ["مسمى الوظيفي", "Job Title"],
                {"job_title": 1, "job_title_en": 1},
            )
