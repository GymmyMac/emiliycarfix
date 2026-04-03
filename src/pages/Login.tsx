import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useEffect } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem('rememberedEmail');
    if (saved) { setEmail(saved); setRememberMe(true); }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); }
    else {
      if (rememberMe) localStorage.setItem('rememberedEmail', email);
      else localStorage.removeItem('rememberedEmail');
      navigate('/dashboard');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground tracking-tight">CARFIX</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to Emily</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4 rounded-lg border border-border bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@carfix.co.nz" required className="h-11 text-base bg-background border-border" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground">Password</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className="h-11 text-base bg-background border-border" />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="remember" checked={rememberMe} onCheckedChange={checked => setRememberMe(checked === true)} />
            <Label htmlFor="remember" className="text-sm font-normal cursor-pointer text-foreground">Remember me</Label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
