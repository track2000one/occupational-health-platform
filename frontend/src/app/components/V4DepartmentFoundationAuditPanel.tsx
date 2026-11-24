import { useMemo, useState } from 'react';
import { authFetch, getAccessToken } from '../context/AuthContext';
import { V4_PRIVATE_UI } from '../data/v4AffiliationHierarchy';
import {
  Alert, Box, Button, Chip, Divider, Paper, Stack, Typography,
} from '@mui/material';
import { auditDepartmentPaths, V4_DEPARTMENT_SOURCE_ROWS,
  V4_DEPARTMENT_LABELS, type DepartmentNode, type SourcePathReview,
  type DepartmentReviewKind,
} from '../data/v4DepartmentSourceAudit';

const API = (import.meta.env.VITE_API_URL ||
  'https://occupational-health-platform-production.up.railway.app/api').replace(/\/$/, '');
type SectorUnitPreflight = {
  status: string; detail: string; sector_matches: number;
  unit_matches: number; linked: boolean; can_create_link: boolean;
  sector_activated: boolean; source_record_count: number; read_only: boolean;
};
type View = 'missing'|'matched'|'review';
type ReviewFilter = 'all'|Exclude<DepartmentReviewKind,'matchable'>;
const reviewFilterLabels: Record<ReviewFilter,string> = {
  all:'جميع الحالات',
  historic:'مسارات تاريخية',
  sector:'تبعية قطاعات',
  main:'إدارة رئيسية مباشرة',
  incomplete:'مسار ناقص',
  sector_unit:'وحدة تتبع قطاعًا مباشرةً',
};
const viewLabels: Record<View,string> = {
  missing:'مسارات تحتاج مطابقة أو تأسيس',
  matched:'المسارات الموجودة',
  review:'مسارات مصدر تحتاج مراجعة',
};

export function V4DepartmentFoundationAuditPanel({
  units, canManage, onOpenPath,
}: {
  units: DepartmentNode[];
  canManage: boolean;
  onOpenPath: (path:string[]) => void;
}) {
  const audit = useMemo(()=>auditDepartmentPaths(units),[units]);
  const [view,setView]=useState<View>('missing');
  const [reviewFilter,setReviewFilter]=useState<ReviewFilter>('all');
  const [showAll,setShowAll]=useState(false);
  const [sectorUnitCheck,setSectorUnitCheck]=useState<SectorUnitPreflight|null>(null);
  const [sectorUnitError,setSectorUnitError]=useState('');
  const [sectorUnitBusy,setSectorUnitBusy]=useState(false);
  async function checkSectorUnitLink() {
    if(!V4_PRIVATE_UI || !canManage || sectorUnitBusy)return;
    setSectorUnitBusy(true);
    setSectorUnitCheck(null);
    setSectorUnitError('');
    try {
      const token=getAccessToken();
      if(!token)throw new Error('يلزم تسجيل الدخول للمسؤول.');
      const response=await authFetch(
        API+'/organization-units/sector-direct-unit-preflight/',
        {headers:{Authorization:'Bearer '+token}},
      );
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.detail||'تعذر فحص الربط التنظيمي');
      setSectorUnitCheck(data as SectorUnitPreflight);
    }catch(error){
      setSectorUnitError(error instanceof Error?error.message:'تعذر فحص الربط');
    }finally{setSectorUnitBusy(false);}
  }
  const reviewRows = reviewFilter === 'all' ? audit.review
    : audit.review.filter(row=>row.reviewKind===reviewFilter);
  const rows = view === 'missing' ? audit.missing
    : view === 'matched' ? audit.matched : reviewRows;
  const visible = showAll ? rows : rows.slice(0,8);
  const weightedSourceCount = V4_DEPARTMENT_SOURCE_ROWS.reduce(
    (n,r)=>n+r.sourceEmployees,0);
  // Do not compress null levels. A subunit with missing department MUST stay
  // labeled as a subunit, never as a sub-administration.
  const titleBySourceLevel = (item:SourcePathReview) =>
    V4_DEPARTMENT_LABELS[item.sourceLevel] || 'مسار تنظيمي';
  const displayPath = (item:SourcePathReview) => {
    if(item.reviewKind==='sector_unit'){
      return [item.levels[0],item.sector ? 'القطاع الاستشاري: '+item.sector : '',
        item.levels[3]].filter(Boolean).join(' ← ');
    }
    if(item.reviewKind==='incomplete'){
      return item.levels.map((part,i)=>part ||
        (i<item.sourceLevel ? '['+V4_DEPARTMENT_LABELS[i]+': غير محددة]' : ''))
        .filter(Boolean).join(' ← ');
    }
    if(item.reviewKind==='sector') {
      return [...item.path,item.sector ? 'القطاع الاستشاري: '+item.sector : null,
        item.service ? 'الخدمة: '+item.service : null].filter(Boolean).join(' ← ');
    }
    return item.path.join(' ← ');
  };

  const renderRow=(item:SourcePathReview,index:number)=>(
    <Paper key={item.key+'-'+item.status+'-'+index} variant="outlined"
      sx={{p:1.5,borderRadius:2.5}}>
      <Stack direction={{xs:'column',md:'row'}} gap={1.5}
        alignItems={{xs:'stretch',md:'center'}} justifyContent="space-between">
        <Box sx={{minWidth:0,flex:1}}>
          <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center" sx={{mb:0.5}}>
            <Chip size="small" label={titleBySourceLevel(item)} variant="outlined"/>
            {view === 'review' && <Chip size="small"
              color={item.reviewKind==='historic' ? 'default' :
                item.reviewKind==='incomplete' ? 'warning' : 'info'}
              label={reviewFilterLabels[item.reviewKind as ReviewFilter]} variant="outlined"/>}
            <Chip size="small" label={item.sourceEmployees+' في ملف المصدر'} variant="outlined"/>
            {item.rowCount>1 && <Chip size="small"
              label={item.rowCount+' تصنيفات للخدمة نفسها'} variant="outlined"/>}
          </Stack>
          <Typography variant="body2" fontWeight={800} sx={{overflowWrap:'anywhere'}}>
            {displayPath(item)}
          </Typography>
          {view === 'review' &&
            <Typography variant="caption" color="text.secondary">{item.note}</Typography>}
        </Box>
        {view === 'missing' && canManage &&
          <Button size="small" variant="outlined" onClick={()=>onOpenPath(item.path)}>
            فتح مسار التأسيس للمراجعة
          </Button>}
        {item.reviewKind==='sector_unit' && canManage && V4_PRIVATE_UI &&
          <Button size="small" variant="outlined" disabled={sectorUnitBusy}
            onClick={()=>void checkSectorUnitLink()}>
            {sectorUnitBusy?'جارٍ فحص الربط…':'فحص الارتباط الحالي — دون حفظ'}
          </Button>}
      </Stack>
    </Paper>
  );

  return <Paper variant="outlined" sx={{p:{xs:1.5,md:2.5},mb:2.5,borderRadius:3}}>
    <Stack gap={1.5}>
      <Box>
        <Typography variant="h6" fontWeight={900}>
          مطابقة الهيكل التنظيمي مع ملف Excel — مراجعة قبل التفعيل
        </Typography>
        <Typography variant="body2" color="text.secondary">
          المرجع: «الأقسام_الهيكلة_جميع_الحقول_معبأة_للاستيراد» — ورقة «المسميات الموحدة».
          البيانات المعروضة تجميعات تنظيمية دون أسماء موظفين أو أرقام هويات.
        </Typography>
      </Box>
      <Alert severity="info">
        نعالج أربعة مستويات تنظيمية فقط: الإدارة الرئيسية، الإدارة الفرعية، القسم،
        الوحدة الفرعية. القطاع الاستشاري والخدمة ونطاق تقديمها والفئة والتخصص
        حقول تصنيف منفصلة، وليست أقسامًا إضافية.
      </Alert>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Chip label={V4_DEPARTMENT_SOURCE_ROWS.length+' تجميعًا من Excel'} />
        <Chip label={weightedSourceCount+' سجلًا في المصدر'} variant="outlined" />
        <Chip color="success" variant="outlined"
          label={audit.matched.length+' مسارًا مطابقًا'}/>
        <Chip color="warning" variant="outlined"
          label={audit.missing.length+' مسارًا يحتاج تأسيسًا/مطابقة'}/>
        <Chip color="info" variant="outlined"
          label={audit.review.length+' مسارًا يحتاج مراجعة المصدر'}/>
        <Chip label={units.length+' سجلًا تنظيميًا حاليًا'} variant="outlined"/>
      </Stack>
      {audit.broken.length>0 && <Alert severity="warning">
        يوجد {audit.broken.length} سجلًا بتنظيم غير مكتمل (جهة أعلى مفقودة أو
        ارتباط دائري). لا يُنصح بتفعيلها حتى تُراجع ارتباطاتها.
      </Alert>}
      <Alert severity="warning" variant="outlined">
        لا تعني المطابقة اكتمال الاعتماد، ولا تعني عدم المطابقة أن السجل محذوف.
        المقارنة تعتمد على الاسم والتسلسل الكامل، ولا تضيف أو تُعدّل موظفين.
        المسارات التاريخية «التشغيل» محفوظة للمراجعة وفق الاستبعاد السابق.
      </Alert>
      <Divider/>
      <Stack direction="row" gap={1} flexWrap="wrap">
        {(['missing','matched','review'] as View[]).map(item=>
          <Button key={item} size="small"
            variant={view===item?'contained':'outlined'}
            onClick={()=>{setView(item);setShowAll(false);}}>
            {viewLabels[item]} ({item==='missing'?audit.missing.length:
              item==='matched'?audit.matched.length:audit.review.length})
          </Button>)}
      </Stack>
      {view==='review' && <>
        <Alert severity="info" variant="outlined">
          المسارات العشرة ليست عشرة أقسام ناقصة. صنّفنا حالات المصدر إلى
          تبعية قطاعات، إدارة مباشرة، مسارات تاريخية، ووحدة الفحص الشامل التي
          تأكدت تبعيتها المباشرة للقطاع الشرقي الاستشاري 1.
          تأكيد التبعية لا يعني إنشاء علاقة في قاعدة البيانات أو ربط الموظفين تلقائيًا.
          الأعداد تشير إلى صفوف مرجعية في Excel لا إلى أقسام جديدة.
        </Alert>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          {(['all','sector','sector_unit','main','incomplete','historic'] as ReviewFilter[]).map(kind=>
            <Button key={kind} size="small"
              variant={reviewFilter===kind?'contained':'outlined'}
              onClick={()=>{setReviewFilter(kind);setShowAll(false);}}>
              {reviewFilterLabels[kind]} ({kind==='all'?audit.review.length:
                audit.review.filter(row=>row.reviewKind===kind).length})
            </Button>)}
        </Stack>
      </>}
      <Stack gap={1}>
        {visible.map(renderRow)}
        {rows.length===0 &&
          <Alert severity="success">لا توجد عناصر ضمن هذا التصنيف.</Alert>}
      </Stack>
      {view==='review' && sectorUnitError &&
        <Alert severity="error">{sectorUnitError}</Alert>}
      {view==='review' && sectorUnitCheck &&
        <Alert severity={sectorUnitCheck.linked?'success':
            sectorUnitCheck.can_create_link?'info':'warning'}>
          <Typography variant="body2" fontWeight={800}>
            نتيجة فحص سجل الجهات — للقراءة فقط
          </Typography>
          <Typography variant="body2">{sectorUnitCheck.detail}</Typography>
          <Typography variant="caption">
            عدد سجلات القطاع: {sectorUnitCheck.sector_matches}،
            عدد سجلات الوحدة: {sectorUnitCheck.unit_matches}،
            سجلات المصدر المرجعية: {sectorUnitCheck.source_record_count}.
            لم يُنشأ أي ربط أو يُعدّل أي موظف.
          </Typography>
        </Alert>}
      {rows.length>8 && <Button variant="text" onClick={()=>setShowAll(v=>!v)}>
        {showAll ? 'عرض العناصر الأولى فقط' : 'عرض جميع العناصر ('+rows.length+')'}
      </Button>}
      <Typography variant="caption" color="text.secondary">
        المصدر مرجعي تشغيلي، وليس قرارًا باعتماد الهيكل. استخدم «فتح مسار التأسيس
        للمراجعة» لتعبئة التسلسل المقترح دون حفظ تلقائي.
      </Typography>
    </Stack>
  </Paper>;
}
