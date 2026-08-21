import { Dialog, DialogContent, IconButton, Button, Box } from '@mui/material';
import { Close as CloseIcon, Print as PrintIcon, Download as DownloadIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface PdfPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  htmlContent: string;
  onPrint: () => void;
  onDownload: () => void;
}

export function PdfPreviewDialog({ open, onClose, htmlContent, onPrint, onDownload }: PdfPreviewDialogProps) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          width: '95vw',
          height: '95vh',
          maxWidth: '1400px',
          maxHeight: '900px',
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<PrintIcon />}
            onClick={onPrint}
            sx={{ textTransform: 'none' }}
          >
            {isRtl ? 'طباعة' : 'Print'}
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={<DownloadIcon />}
            onClick={onDownload}
            sx={{ textTransform: 'none' }}
          >
            {isRtl ? 'تنزيل PDF' : 'Download PDF'}
          </Button>
        </Box>

        <IconButton onClick={onClose} sx={{ ml: isRtl ? 0 : 'auto', mr: isRtl ? 'auto' : 0 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent
        sx={{
          p: 0,
          overflow: 'auto',
          bgcolor: '#525659',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: '1200px',
            m: 3,
            bgcolor: 'white',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            borderRadius: 1,
          }}
        >
          <div
            dangerouslySetInnerHTML={{ __html: htmlContent }}
            style={{
              padding: '40px',
              direction: isRtl ? 'rtl' : 'ltr',
            }}
          />
        </Box>
      </DialogContent>
    </Dialog>
  );
}
