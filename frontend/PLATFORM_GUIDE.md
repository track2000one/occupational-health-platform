# Occupational Health Management Platform
## منصة إدارة الصحة المهنية

### Overview / نظرة عامة

This is a comprehensive bilingual (English/Arabic) web application for managing occupational health for employees. The platform is built with React, Material-UI, and includes mock data for demonstration purposes.

هذه منصة ويب شاملة ثنائية اللغة (إنجليزي/عربي) لإدارة الصحة المهنية للموظفين. المنصة مبنية باستخدام React و Material-UI وتحتوي على بيانات تجريبية لأغراض العرض.

---

## ⚠️ Important Security Notice / تنبيه أمان مهم

**THIS IS A FRONTEND PROTOTYPE ONLY - NOT FOR PRODUCTION USE WITH REAL MEDICAL DATA**

This platform contains mock/fake data for demonstration purposes only. It is NOT suitable for storing real patient medical records or personally identifiable information (PII). For a production system handling real medical data, you would need:

- HIPAA-compliant or equivalent medical data regulations
- Encrypted database and secure backend
- Proper access controls and audit logging
- Secure file storage for medical documents
- Data backup and disaster recovery
- Legal compliance review

**هذا نموذج أولي للواجهة فقط - غير مناسب للاستخدام الإنتاجي مع بيانات طبية حقيقية**

---

## Demo Accounts / حسابات تجريبية

Use these credentials to login and explore different user roles:

| Role | Email | Password |
|------|-------|----------|
| Administrator / مدير النظام | admin@health.gov | admin123 |
| Doctor / طبيب | doctor@health.gov | doctor123 |
| Lab Officer / مسؤول المختبر | lab@health.gov | lab123 |
| Vaccination Officer / مسؤول التطعيمات | vaccine@health.gov | vaccine123 |
| Employee / موظف | employee@health.gov | emp123 |
| Manager / مدير | manager@health.gov | manager123 |

---

## Features / المميزات

### ✅ Implemented Modules

1. **Dashboard / لوحة التحكم**
   - Overview statistics and KPIs
   - Recent activity feed
   - Coverage charts and metrics

2. **Employee Management / إدارة الموظفين**
   - Employee list with search and filter
   - Detailed employee profiles
   - Health center assignment
   - Job title and experience tracking

3. **Lab Tests / التحاليل المخبرية**
   - Test request management
   - Status tracking (Pending/Completed/Missing)
   - Result entry and upload
   - Test types: Anti-HBs, HBsAg, HCV, HIV, PPD, Rubella IgG

4. **Vaccinations / التطعيمات**
   - Vaccination record tracking
   - Dose scheduling (1st, 2nd, 3rd doses)
   - Coverage statistics
   - Status: Not Given, Dose 1/2/3, Immune, Refused, Contraindicated
   - Vaccine types: HBV, Influenza, Rubella, PPD

5. **Needle Stick Injuries / إصابات الوخز بالإبر**
   - Incident reporting
   - Exposure tracking
   - Source patient information
   - Lab results for employee and source
   - Follow-up management
   - Status workflow: New → Under Review → Follow-up → Closed

6. **Medical Committee / الهيئة الطبية**
   - Referral management
   - Transaction number tracking
   - Diagnosis and recommendations
   - Decision documentation
   - Status workflow: Draft → Submitted → Under Review → Decision Issued → Closed

7. **Reports & Analytics / التقارير والإحصائيات**
   - Center coverage reports
   - Vaccination coverage analysis
   - Lab completion statistics
   - Monthly activity trends
   - KPI dashboard
   - Export functionality

8. **Bilingual Support / الدعم ثنائي اللغة**
   - Full English/Arabic language support
   - RTL (Right-to-Left) layout for Arabic
   - Easy language switching via UI

9. **Role-Based Access Control / التحكم بالصلاحيات**
   - Different dashboards per user role
   - Navigation filtered by permissions
   - Appropriate data visibility

---

## User Roles & Permissions / الأدوار والصلاحيات

### 1. Employee / الموظف
- View personal health information
- View appointments and vaccinations
- Limited access to own records only

### 2. Doctor / الطبيب
- Access employee records
- Request lab tests
- Record clinic visits
- Refer to medical committee
- Occupational health assessments

### 3. Lab Officer / مسؤول المختبر
- View pending lab tests
- Enter test results
- Upload lab reports
- Update test status

### 4. Vaccination Officer / مسؤول التطعيمات
- Record vaccination doses
- Track vaccination schedule
- Monitor coverage rates
- Manage refusals and contraindications

### 5. Medical Committee Officer / مسؤول الهيئة الطبية
- Review referrals
- Issue committee decisions
- Document recommendations
- Track transaction numbers

### 6. Manager / المدير
- View analytics and reports
- Monitor coverage rates
- Access aggregated statistics
- Export reports

### 7. Administrator / مدير النظام
- Full system access
- User management
- System settings
- Audit logs
- All modules

---

## Technology Stack / التقنيات المستخدمة

- **Frontend Framework:** React 18.3.1
- **UI Library:** Material-UI (MUI) 7.3.5
- **Routing:** React Router 7.x
- **Charts:** Recharts 2.15.2
- **Internationalization:** i18next & react-i18next
- **Styling:** Material-UI Theme System
- **Icons:** Material-UI Icons
- **Language:** TypeScript (via JSX)

---

## Mock Data / البيانات التجريبية

The platform includes comprehensive mock data:

- **5 Employees** across 3 health centers
- **5 Lab Tests** with various statuses
- **5 Vaccination Records** with different completion levels
- **3 Clinic Visits** with diagnoses and follow-ups
- **2 Needle Stick Injuries** with complete documentation
- **2 Medical Committee Referrals** at different stages

All data is stored in `/src/app/data/mockData.ts`

---

## Color Scheme / الألوان

The platform uses a professional medical color palette:

- **Primary:** #667eea (Medical Blue)
- **Secondary:** #764ba2 (Purple)
- **Success:** #43e97b (Green)
- **Warning:** #ffd700 (Yellow)
- **Error:** #ff6b6b (Red)
- **Background:** #f5f7fa (Light Gray)

---

## File Structure / هيكل الملفات

```
src/app/
├── components/
│   └── layout/
│       └── DashboardLayout.tsx
├── context/
│   └── AuthContext.tsx
├── data/
│   └── mockData.ts
├── i18n/
│   ├── config.ts
│   └── locales/
│       ├── en.ts
│       └── ar.ts
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── EmployeesPage.tsx
│   ├── LabTestsPage.tsx
│   ├── VaccinationsPage.tsx
│   ├── NeedleStickInjuriesPage.tsx
│   ├── MedicalCommitteePage.tsx
│   └── ReportsPage.tsx
└── App.tsx
```

---

## Next Steps for Production / الخطوات التالية للإنتاج

To convert this prototype to a production-ready system:

1. **Backend Development**
   - Set up secure API server (Django, Node.js, etc.)
   - Implement proper authentication (JWT, OAuth)
   - Create REST APIs for all modules
   - Set up PostgreSQL or enterprise database

2. **Security**
   - HTTPS/SSL certificates
   - Data encryption at rest and in transit
   - Role-based access control (RBAC) enforcement
   - Audit logging for all operations
   - HIPAA compliance review

3. **Database Schema**
   - Implement all tables as specified in requirements
   - Foreign key relationships
   - Indexes for performance
   - Backup and recovery procedures

4. **File Storage**
   - Secure document storage for medical records
   - Lab result attachments
   - Medical committee decisions
   - Access-controlled file retrieval

5. **Additional Features**
   - Email/SMS notifications
   - Appointment scheduling
   - Export to PDF/Excel
   - Print functionality
   - Mobile responsiveness
   - Advanced search and filtering

6. **Testing**
   - Unit tests
   - Integration tests
   - Security testing
   - Performance testing
   - User acceptance testing

7. **Deployment**
   - Production server setup
   - Load balancing
   - CDN for static assets
   - Monitoring and logging
   - Backup automation

---

## Support / الدعم

This is a demonstration prototype. For production deployment, consult with:
- Healthcare IT security specialists
- Medical data compliance experts
- Professional backend developers
- Database administrators

---

## License / الترخيص

This is a demonstration project. Not for production use with real medical data.

---

**Built with ❤️ for Healthcare Professionals**
**مبني بـ ❤️ للعاملين في المجال الصحي**
