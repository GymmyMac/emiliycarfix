import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { differenceInDays, format } from 'date-fns';
import { Satellite, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const UPLOAD_KEYS = [
  'competitor_last_upload_repco',
  'competitor_last_upload_supercheapauto',
  'competitor_last_upload_tinkr',
];

export default function CompetitorRefreshBanner() {
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const dismissed = sessionStorage.getItem('competitor_banner_dismissed');
    if (dismissed) return;

    (async () => {
      const { data } = await supabase
        .from('app_config')
        .select('key, value')
        .in('key', UPLOAD_KEYS);

      const uploads: Record<string, string | null> = {};
      UPLOAD_KEYS.forEach(k => { uploads[k] = null; });
      data?.forEach((row: { key: string; value: string }) => {
        uploads[row.key] = row.value;
      });

      // Find competitors that are overdue (>35 days or never uploaded)
      const overdue: string[] = [];
      const labels: Record<string, string> = {
        competitor_last_upload_repco: 'Repco',
        competitor_last_upload_supercheapauto: 'Super Cheap Auto',
        competitor_last_upload_tinkr: 'Tinkr',
      };

      let oldestUpload: Date | null = null;

      for (const key of UPLOAD_KEYS) {
        const val = uploads[key];
        if (!val) {
          overdue.push(labels[key]);
        } else {
          const uploadDate = new Date(val);
          const days = differenceInDays(new Date(), uploadDate);
          if (days > 35) {
            overdue.push(labels[key]);
          }
          if (!oldestUpload || uploadDate < oldestUpload) {
            oldestUpload = uploadDate;
          }
        }
      }

      if (overdue.length > 0) {
        const lastDate = oldestUpload ? format(oldestUpload, 'd MMMM yyyy') : 'Never';
        const names = overdue.join(', ');
        setMessage(
          `Competitor data is due for refresh (${names}). Last upload: ${lastDate}. Upload this month's keyword exports to keep Emily's targeting sharp.`
        );
        setShow(true);
      }
    })();
  }, []);

  if (!show) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
      <Satellite size={18} className="text-amber-500 shrink-0" />
      <span className="flex-1">
        <strong>{message}</strong>
      </span>
      <Button size="sm" variant="outline" onClick={() => navigate('/competitor-intelligence')} className="shrink-0 text-xs">
        Go to Competitor Intelligence →
      </Button>
      <button onClick={() => { setShow(false); sessionStorage.setItem('competitor_banner_dismissed', '1'); }} className="text-muted-foreground hover:text-foreground shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}
