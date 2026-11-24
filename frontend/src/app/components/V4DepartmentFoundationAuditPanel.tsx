import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, Paper, Stack, Typography,
} from '@mui/material';
import { auditDepartmentPaths, V4_DEPARTMENT_SOURCE_ROWS,
  V4_DEPARTMENT_LABELS, type DepartmentNode, type SourcePathReview,
} from '../data/v4DepartmentSourceAudit';

type View = 'missing'|'matched'|'review';
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
  const [showAll,setShowAll]=useState(false);
  const rows = view === 'missing' ? audit.missing
    : view === 'matched' ? audit.matched : audit.review;
  const visible = showAll ? rows : rows.slice(0,8);
  const weightedSourceCount = V4_DEPARTMENT_SOURCE_ROWS.reduce(
    (n,r)=>n+r.sourceEmployees,0);
  const titleByDepth = (path: readonly string[]) =>
    V4_DEPARTMENT_LABELS[Math.min(path.length-1,3)] || 'مسار تنظيمي';

  const renderRow=(item:SourcePathReview,index:number)=>(
    <Paper key={item.key+'-'+item.status+'-'+index} variant="outlined"
      sx={{p:1.5,borderRadius:2.5}}>
      <Stack direction={{xs:'column',md:'row'}} gap={1.5}
        alignItems={{xs:'stretch',md:'center'}} justifyContent="space-between">
        <Box sx={{minWidth:0,flex:1}}>
          <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center" sx={{mb:0.5}}>
            <Chip size="small" label={titleByDepth(item.path)} variant="outlined"/>
            <Chip size="small" label={item.sourceEmployees+' في ملف المصدر'} variant="outlined"/>
            {item.rowCount>1 && <Chip size="small"
              label={item.rowCount+' تصنيفات للخدمة نفسها'} variant="outlined"/>}
          </Stack>
          <Typography variant="body2" fontWeight={800} sx={{overflowWrap:'anywhere'}}>
            {item.path.join(' ← ')}
          </Typography>
          {view === 'review' &&
            <Typography variant="caption" color="text.secondary">{item.note}</Typography>}
        </Box>
        {view === 'missing' && canManage &&
          <Button size="small" variant="outlined" onClick={()=>onOpenPath(item.path)}>
            فتح مسار التأسيس للمراجعة
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
      <Stack gap={1}>
        {visible.map(renderRow)}
        {rows.length===0 &&
          <Alert severity="success">لا توجد عناصر ضمن هذا التصنيف.</Alert>}
      </Stack>
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
