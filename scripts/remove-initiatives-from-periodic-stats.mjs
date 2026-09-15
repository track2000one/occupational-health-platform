import fs from 'node:fs';

const frontendPath = 'frontend/src/app/pages/PeriodicStatisticsPage.tsx';
const backendPath = 'backend/periodic_stats/views.py';

let frontend = fs.readFileSync(frontendPath, 'utf8');
let backend = fs.readFileSync(backendPath, 'utf8');

function replaceRequired(text, search, replacement, label) {
  const matched = typeof search === 'string' ? text.includes(search) : search.test(text);
  if (!matched) throw new Error(`Patch target not found: ${label}`);
  return text.replace(search, replacement);
}

// Frontend: remove initiative-only imports and types while preserving document attachments.
for (const line of [
  '  FormControlLabel,\n',
  '  IconButton,\n',
  '  Switch,\n',
  '  Add as DeleteIcon,\n',
]) {
  frontend = replaceRequired(frontend, line, '', `frontend import ${line.trim()}`);
}
frontend = replaceRequired(frontend, '    initiatives_quarter: number;\n', '', 'initiative KPI type');
frontend = replaceRequired(
  frontend,
  /type InitiativeActivity[\s\S]*?type ReferenceDocument = \{/,
  'type ReferenceDocument = {',
  'initiative TypeScript models',
);
frontend = replaceRequired(
  frontend,
  /function statusLabel[\s\S]*?\n}\n\nfunction statusColor[\s\S]*?\n}\n\nexport function PeriodicStatisticsPage/,
  'export function PeriodicStatisticsPage',
  'initiative status helpers',
);
frontend = replaceRequired(frontend, "  const today = now.toISOString().slice(0, 10);\n", '', 'initiative-only today value');
frontend = replaceRequired(frontend, "  const [initiatives, setInitiatives] = useState<Initiative[]>([]);\n", '', 'initiative state');
frontend = replaceRequired(frontend, "  const [savingInitiative, setSavingInitiative] = useState(false);\n", '', 'initiative saving state');
frontend = replaceRequired(frontend, "  const [initiativeDraftFiles, setInitiativeDraftFiles] = useState<File[]>([]);\n", '', 'initiative file state');
frontend = replaceRequired(
  frontend,
  /  const \[initiativeForm, setInitiativeForm\] = useState\([\s\S]*?\n  \}\);\n  const \[documentForm,/,
  '  const [documentForm,',
  'initiative form state',
);
frontend = replaceRequired(frontend, "      fetchCollection<Initiative>(`/periodic-statistics/initiatives/?year=${year}`),\n", '', 'initiative data fetch');
frontend = replaceRequired(
  frontend,
  '    ]).then(([summaryPayload, workforceRows, initiativeRows, documentRows, dailyRows]) => {',
  '    ]).then(([summaryPayload, workforceRows, documentRows, dailyRows]) => {',
  'initiative result destructuring',
);
frontend = replaceRequired(frontend, '      setInitiatives(initiativeRows);\n', '', 'initiative result state assignment');
frontend = replaceRequired(
  frontend,
  "  const selectedQuarterInitiatives = useMemo(() => initiatives.filter(item => item.quarter === quarter), [initiatives, quarter]);\n",
  '',
  'initiative quarter memo',
);
frontend = replaceRequired(
  frontend,
  /  function updateActivity[\s\S]*?\n  async function addDocument\(\) \{/,
  '  async function addDocument() {',
  'initiative actions',
);
frontend = replaceRequired(
  frontend,
  "          <Typography variant=\"body2\" color=\"text.secondary\">{isRtl ? 'تسجيل يومي وتجميع شهري وربع سنوي وسنوي مع المبادرات والامتثال والمرفقات الداعمة' : 'Daily, monthly, quarterly and annual statistics with initiatives, compliance and evidence'}</Typography>",
  "          <Typography variant=\"body2\" color=\"text.secondary\">{isRtl ? 'تسجيل يومي وتجميع شهري وربع سنوي وسنوي مع متابعة القوى العاملة وامتثال الوثائق' : 'Daily, monthly, quarterly and annual statistics with workforce targets and document compliance'}</Typography>",
  'statistics subtitle',
);
frontend = replaceRequired(frontend, "      <Tab label={isRtl ? 'المبادرات' : 'Initiatives'} />\n", '', 'initiatives tab');
frontend = replaceRequired(
  frontend,
  "        <KpiCard title={isRtl ? 'مبادرات الربع' : 'Quarter initiatives'} value={summary.totals.initiatives_quarter} accent=\"#D97706\" />",
  "        <KpiCard title={isRtl ? 'المستهدف السنوي' : 'Annual target'} value={summary.totals.annual_target} accent=\"#D97706\" />",
  'initiative dashboard KPI',
);
frontend = replaceRequired(
  frontend,
  /\n    \{tab === 6 && <Stack spacing=\{2\.5\}>[\s\S]*?\n    \{tab === 7 && <Stack spacing=\{2\.5\}>/,
  '\n    {tab === 6 && <Stack spacing={2.5}>',
  'initiative tab content and reference tab index',
);

if (/\bInitiative\b|\binitiatives\b|\binitiative\b/i.test(frontend)) {
  throw new Error('Frontend still contains initiative-specific code after patch.');
}
if (!frontend.includes("{tab === 6 && <Stack spacing={2.5}>") || frontend.includes('{tab === 7')) {
  throw new Error('Reference tab index was not normalized to 6.');
}
if (!frontend.includes("'المستهدف السنوي'")) {
  throw new Error('Annual target KPI was not added.');
}

// Backend: keep Initiative models/endpoints/data intact, but remove initiatives from the statistics summary/reporting contract.
backend = replaceRequired(
  backend,
  /\n        quarter_start_month = \(\(quarter - 1\) \* 3\) \+ 1\n        initiatives_count = Initiative\.objects\.filter\([\s\S]*?\n        \)\.count\(\)\n/,
  '\n',
  'summary initiative count query',
);
backend = replaceRequired(backend, "                'initiatives_quarter': initiatives_count,\n", '', 'summary initiative total');
if (backend.includes('initiatives_quarter') || backend.includes('initiatives_count')) {
  throw new Error('Summary still references initiatives.');
}
if (!backend.includes('class InitiativeViewSet')) {
  throw new Error('Initiative backend preservation check failed.');
}

fs.writeFileSync(frontendPath, frontend);
fs.writeFileSync(backendPath, backend);
console.log('Initiatives removed from periodic statistics UI/reporting; backend records and APIs preserved.');
