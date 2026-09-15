from datetime import date

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import EvidenceAttachment, Initiative, ReferenceDocument


class EvidenceAttachmentApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='evidence-tester', password='test-password')
        self.client.force_authenticate(self.user)
        self.initiative = Initiative.objects.create(name='Test initiative', start_date=date(2026, 9, 15), created_by=self.user)
        self.document = ReferenceDocument.objects.create(title='Test document')
        self.collection_url = reverse('evidence-attachments-list')

    def test_upload_and_preview_png(self):
        upload = SimpleUploadedFile('evidence.png', b'\x89PNG\r\n\x1a\n' + b'test-image-data', content_type='image/png')
        response = self.client.post(self.collection_url, {
            'owner_type': EvidenceAttachment.OwnerType.INITIATIVE,
            'owner_id': self.initiative.pk,
            'file': upload,
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        attachment_id = response.data['id']

        content_response = self.client.get(reverse('evidence-attachments-content', args=[attachment_id]))
        self.assertEqual(content_response.status_code, status.HTTP_200_OK)
        self.assertEqual(content_response['Content-Type'], 'image/png')
        self.assertTrue(bytes(content_response.content).startswith(b'\x89PNG'))

    def test_rejects_unsupported_file_signature(self):
        upload = SimpleUploadedFile('not-image.txt', b'plain text', content_type='text/plain')
        response = self.client.post(self.collection_url, {
            'owner_type': EvidenceAttachment.OwnerType.REFERENCE_DOCUMENT,
            'owner_id': self.document.pk,
            'file': upload,
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(EvidenceAttachment.objects.count(), 0)

    def test_duplicate_file_is_rejected_for_same_owner(self):
        payload = b'%PDF-1.7\nminimal-test-pdf'
        first = SimpleUploadedFile('evidence.pdf', payload, content_type='application/pdf')
        second = SimpleUploadedFile('evidence-copy.pdf', payload, content_type='application/pdf')
        first_response = self.client.post(self.collection_url, {
            'owner_type': EvidenceAttachment.OwnerType.INITIATIVE,
            'owner_id': self.initiative.pk,
            'file': first,
        }, format='multipart')
        second_response = self.client.post(self.collection_url, {
            'owner_type': EvidenceAttachment.OwnerType.INITIATIVE,
            'owner_id': self.initiative.pk,
            'file': second,
        }, format='multipart')
        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(EvidenceAttachment.objects.count(), 1)

    def test_list_is_scoped_to_owner(self):
        EvidenceAttachment.objects.create(
            owner_type=EvidenceAttachment.OwnerType.INITIATIVE,
            initiative=self.initiative,
            file_name='one.pdf',
            content_type='application/pdf',
            byte_size=8,
            file_data=b'%PDF-one',
            checksum_sha256='a' * 64,
            uploaded_by=self.user,
        )
        response = self.client.get(self.collection_url, {
            'owner_type': EvidenceAttachment.OwnerType.INITIATIVE,
            'owner_id': self.initiative.pk,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
