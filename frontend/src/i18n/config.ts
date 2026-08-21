import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      // Common
      welcome: 'Welcome',
      login: 'Login',
      logout: 'Logout',
      submit: 'Submit',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      edit: 'Edit',
      view: 'View',
      search: 'Search',
      filter: 'Filter',
      export: 'Export',
      add: 'Add',
      back: 'Back',
      next: 'Next',
      loading: 'Loading...',

      // Auth
      email: 'Email',
      password: 'Password',
      forgotPassword: 'Forgot Password?',
      rememberMe: 'Remember Me',
      loginTitle: 'Occupational Health Management Platform',
      loginSubtitle: 'Sign in to your account',
      employeeId: 'Employee ID',

      // Navigation
      dashboard: 'Dashboard',
      employees: 'Employees',
      medicalProfile: 'Medical Profile',
      labTests: 'Lab Tests',
      vaccinations: 'Vaccinations',
      clinicVisits: 'Clinic Visits',
      occupationalHealth: 'Occupational Health',
      needleStickInjuries: 'Needle Stick Injuries',
      medicalCommittee: 'Medical Committee',
      campaigns: 'Campaigns',
      reports: 'Reports',
      settings: 'Settings',
      users: 'Users',

      // Dashboard
      totalEmployees: 'Total Employees',
      pendingTests: 'Pending Tests',
      completedVaccinations: 'Completed Vaccinations',
      activeInjuries: 'Active Injuries',
      recentActivity: 'Recent Activity',
      upcomingAppointments: 'Upcoming Appointments',

      // Employees
      addEmployee: 'Add Employee',
      employeeList: 'Employee List',
      employeeName: 'Employee Name',
      nationalId: 'National ID',
      mohId: 'MOH ID',
      dateOfBirth: 'Date of Birth',
      mobile: 'Mobile',
      gender: 'Gender',
      male: 'Male',
      female: 'Female',
      maritalStatus: 'Marital Status',
      healthCenter: 'Health Center',
      jobTitle: 'Job Title',
      startDate: 'Start Date',
      yearsOfExperience: 'Years of Experience',

      // Lab Tests
      testType: 'Test Type',
      result: 'Result',
      status: 'Status',
      pending: 'Pending',
      completed: 'Completed',
      missing: 'Missing',
      requestDate: 'Request Date',
      completedDate: 'Completed Date',
      requestedBy: 'Requested By',
      notes: 'Notes',

      // Vaccinations
      vaccineType: 'Vaccine Type',
      doseNumber: 'Dose Number',
      doseDate: 'Dose Date',
      nextDueDate: 'Next Due Date',
      immune: 'Immune',
      notGiven: 'Not Given',
      refused: 'Refused',
      contraindicated: 'Contraindicated',

      // Needle Stick
      exposureDate: 'Exposure Date',
      workplace: 'Workplace',
      injuryMethod: 'Injury Method',
      sourceKnown: 'Source Known',
      sourceName: 'Source Name',
      actionTaken: 'Action Taken',
      followUpRequired: 'Follow-up Required',

      // Medical Committee
      transactionNumber: 'Transaction Number',
      diagnosis: 'Diagnosis',
      recommendation: 'Recommendation',
      decision: 'Decision',
      decisionDate: 'Decision Date',

      // Reports
      coverageReport: 'Coverage Report',
      centerCoverage: 'Center Coverage',
      vaccinationCoverage: 'Vaccination Coverage',
      labCompletion: 'Lab Completion',

      // User Roles
      employee: 'Employee',
      doctor: 'Doctor',
      labOfficer: 'Lab Officer',
      vaccinationOfficer: 'Vaccination Officer',
      medicalCommitteeOfficer: 'Medical Committee Officer',
      manager: 'Manager',
      admin: 'Admin',
    }
  },
  ar: {
    translation: {
      // Common
      welcome: 'مرحباً',
      login: 'تسجيل الدخول',
      logout: 'تسجيل الخروج',
      submit: 'إرسال',
      cancel: 'إلغاء',
      save: 'حفظ',
      delete: 'حذف',
      edit: 'تعديل',
      view: 'عرض',
      search: 'بحث',
      filter: 'تصفية',
      export: 'تصدير',
      add: 'إضافة',
      back: 'رجوع',
      next: 'التالي',
      loading: 'جاري التحميل...',

      // Auth
      email: 'البريد الإلكتروني',
      password: 'كلمة المرور',
      forgotPassword: 'نسيت كلمة المرور؟',
      rememberMe: 'تذكرني',
      loginTitle: 'منصة إدارة الصحة المهنية للموظفين',
      loginSubtitle: 'تسجيل الدخول إلى حسابك',
      employeeId: 'رقم الموظف',

      // Navigation
      dashboard: 'لوحة التحكم',
      employees: 'الموظفون',
      medicalProfile: 'الملف الصحي',
      labTests: 'التحاليل المخبرية',
      vaccinations: 'التطعيمات',
      clinicVisits: 'زيارات العيادة',
      occupationalHealth: 'الصحة المهنية',
      needleStickInjuries: 'إصابات الوخز بالإبر',
      medicalCommittee: 'الهيئة الطبية',
      campaigns: 'الحملات الصحية',
      reports: 'التقارير',
      settings: 'الإعدادات',
      users: 'المستخدمون',

      // Dashboard
      totalEmployees: 'إجمالي الموظفين',
      pendingTests: 'التحاليل المعلقة',
      completedVaccinations: 'التطعيمات المكتملة',
      activeInjuries: 'الإصابات النشطة',
      recentActivity: 'النشاط الأخير',
      upcomingAppointments: 'المواعيد القادمة',

      // Employees
      addEmployee: 'إضافة موظف',
      employeeList: 'قائمة الموظفين',
      employeeName: 'اسم الموظف',
      nationalId: 'رقم الهوية الوطنية',
      mohId: 'رقم وزارة الصحة',
      dateOfBirth: 'تاريخ الميلاد',
      mobile: 'الجوال',
      gender: 'الجنس',
      male: 'ذكر',
      female: 'أنثى',
      maritalStatus: 'الحالة الاجتماعية',
      healthCenter: 'المركز الصحي',
      jobTitle: 'المسمى الوظيفي',
      startDate: 'تاريخ بداية العمل',
      yearsOfExperience: 'سنوات الخبرة',

      // Lab Tests
      testType: 'نوع التحليل',
      result: 'النتيجة',
      status: 'الحالة',
      pending: 'قيد الانتظار',
      completed: 'مكتمل',
      missing: 'ناقص',
      requestDate: 'تاريخ الطلب',
      completedDate: 'تاريخ الإنجاز',
      requestedBy: 'تم الطلب بواسطة',
      notes: 'ملاحظات',

      // Vaccinations
      vaccineType: 'نوع اللقاح',
      doseNumber: 'رقم الجرعة',
      doseDate: 'تاريخ الجرعة',
      nextDueDate: 'موعد الجرعة التالية',
      immune: 'محصن',
      notGiven: 'لم يتم الإعطاء',
      refused: 'رفض',
      contraindicated: 'مانع طبي',

      // Needle Stick
      exposureDate: 'تاريخ الإصابة',
      workplace: 'مكان العمل',
      injuryMethod: 'طريقة الإصابة',
      sourceKnown: 'المصدر معروف',
      sourceName: 'اسم المصدر',
      actionTaken: 'الإجراء المتخذ',
      followUpRequired: 'يتطلب متابعة',

      // Medical Committee
      transactionNumber: 'رقم المعاملة',
      diagnosis: 'التشخيص',
      recommendation: 'التوصية',
      decision: 'القرار',
      decisionDate: 'تاريخ القرار',

      // Reports
      coverageReport: 'تقرير التغطية',
      centerCoverage: 'تغطية المراكز',
      vaccinationCoverage: 'تغطية التطعيمات',
      labCompletion: 'إنجاز التحاليل',

      // User Roles
      employee: 'موظف',
      doctor: 'طبيب',
      labOfficer: 'مسؤول المختبر',
      vaccinationOfficer: 'مسؤول التطعيمات',
      medicalCommitteeOfficer: 'مسؤول الهيئة الطبية',
      manager: 'مدير',
      admin: 'مدير النظام',
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
