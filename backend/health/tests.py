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


from openpyxl import Workbook

from .workforce_source_preview import source_columns, preview_workforce_source


class WorkforceRosterPreviewTests(SimpleTestCase):
    SOURCE_HEADERS = [
        "إسم الجهه", "نوع الجهه", "إسم المدير", "رقم الهوية",
        "الإيميل", "رقم الجوال", "رقم الموظف", "رقم هوية الموظف",
        "إسم الموظف", "الجنس", "الجنسية", "العمر", "رقم جوال الموظف",
        "إيميل الموظف", "حال الموظف", "تاريخ التعيين",
        "نوع التوظيف", "المسمى الوظيفى", "البرنامج",
    ]

    def _sheet(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(self.SOURCE_HEADERS)
        sheet.append([
            "مركز اختباري أ", "نوع", "FAKE-MANAGER-PRIVATE",
            "1999999999", "manager.private@example.invalid", "0500000000",
            "A001", "1000000001", "موظف تجريبي واحد", "ذكر", "",
            "", "0500000011", "worker1@example.invalid", "نشط",
            "2020-01-01", "", "فني", "",
        ])
        sheet.append([
            "مركز اختباري ب", "نوع", "FAKE-MANAGER-PRIVATE",
            "1999999999", "manager.private@example.invalid", "0500000000",
            "A002", "1000000002", "موظف تجريبي اثنان", "أنثى", "",
            "", "0500000022", "worker2@example.invalid", "نشط",
            "2021-01-01", "", "طبيب", "",
        ])
        return sheet

    def test_source_column_mapping_uses_employee_identity_not_manager_identity(self):
        detected = source_columns(self.SOURCE_HEADERS)
        self.assertEqual(detected["national_id"], 7)
        self.assertEqual(detected["mobile"], 12)
        self.assertEqual(detected["email"], 13)
        self.assertEqual(detected["name"], 8)
        self.assertEqual(detected["organization"], 0)

    def test_preview_is_aggregate_only_and_does_not_create_employees(self):
        report = preview_workforce_source(
            self._sheet(), "ورقة1", "synthetic.xlsx", existing_ids=["1000000002"]
        )
        self.assertTrue(report["workforce_roster_preview"])
        self.assertEqual(report["summary"]["total_rows"], 2)
        self.assertEqual(report["summary"]["source_verified_rows"], 2)
        self.assertEqual(report["summary"]["valid_rows"], 0)
        self.assertEqual(report["summary"]["pending_center_mapping"], 2)
        self.assertEqual(report["summary"]["existing_identity_matches"], 1)
        self.assertEqual(len(report["organization_groups"]), 2)
        response_text = str(report)
        for sensitive in (
            "1999999999", "FAKE-MANAGER-PRIVATE",
            "manager.private@example.invalid", "0500000000",
            "1000000001", "1000000002", "worker1@example.invalid",
        ):
            self.assertNotIn(sensitive, response_text)

    def test_duplicate_employee_identity_is_counted_not_imported(self):
        sheet = self._sheet()
        sheet.append([
            "مركز اختباري ب", "", "", "", "", "", "A003",
            "1000000001", "موظف مكرر", "", "", "", "", "", "", "", "", "", "",
        ])
        report = preview_workforce_source(sheet, "ورقة1", "synthetic.xlsx")
        self.assertEqual(report["summary"]["total_rows"], 3)
        self.assertEqual(report["summary"]["duplicate_rows"], 1)
        self.assertEqual(report["summary"]["source_verified_rows"], 2)


from io import BytesIO

from django.test import TestCase

from .importers import process_excel_import
from .models import Employee


class WorkforceRosterImportGuardTests(TestCase):
    def _upload(self):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "ورقة1"
        worksheet.append(WorkforceRosterPreviewTests.SOURCE_HEADERS)
        worksheet.append([
            "مركز تجريبي", "", "FAKE MANAGER", "1999999999",
            "manager@example.invalid", "0500000000", "001",
            "1000000001", "موظف تجريبي", "ذكر", "", "", "0500000011",
            "employee@example.invalid", "على رأس العمل",
            "2020-01-01", "", "طبيب", "",
        ])
        data = BytesIO()
        workbook.save(data)
        data.seek(0)
        data.name = "synthetic_roster.xlsx"
        return data

    def test_flexible_preview_returns_aggregate_only(self):
        result = process_excel_import(
            self._upload(), employee_import_mode="flexible", commit=False,
        )
        self.assertTrue(result["workforce_roster_preview"])
        self.assertEqual(result["summary"]["source_verified_rows"], 1)
        self.assertEqual(result["summary"]["valid_rows"], 0)
        self.assertEqual(Employee.objects.count(), 0)

    def test_explicit_commit_rejected_without_any_employee_insert(self):
        for mode in ("flexible", "template", ""):
            with self.subTest(mode=mode):
                with self.assertRaisesRegex(ValueError, "cannot be committed"):
                    process_excel_import(
                        self._upload(), employee_import_mode=mode, commit=True,
                    )
        self.assertEqual(Employee.objects.count(), 0)
