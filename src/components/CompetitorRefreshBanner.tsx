import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { Satellite, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CompetitorRefreshBanner() {
  const [show, setShow] = useState(false);
  const [lastMonth, setLastMonth] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const dismissed = sessionStorage.getItem('competitor_banner_dismissed');
    if (dismissed) return;

    (async () => {
      const { data } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'competitor_upload_month')
        .maybeSingle();

      const currentMonth = format(new Date(), 'yyyy-MM');
      const uploadMonth = data?.value || '';

      if (uploadMonth !== currentMonth) {
        setLastMonth(uploadMonth);
        setShow(true);
      }
    })();
  }, []);

  if (!show) return null;

  const displayMonth = lastMonth
    ? format(new Date(lastMonth + '-01'), 'MMMM yyyy')
    : 'Unknown';

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
      <Satellite size={18} className="text-amber-500 shrink-0" />
      <span className="flex-1">
        <strong>Competitor data is due for refresh.</strong> Last loaded: {displayMonth}. Upload this month's keyword exports to keep Emily's targeting sharp.
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
