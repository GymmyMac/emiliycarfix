

## Fix: Published site renders blank page

**Root cause**: `createClient` in `src/lib/supabase.ts` crashes when called with an empty anon key. Since the supabase module is imported at the top level of every page, this prevents the entire React app from mounting.

**Solution**: Hardcode the Supabase anon key (same as was done for the URL). The anon key is a publishable/public key — it's safe to include in client-side code and is already visible in network requests.

### Changes

**`src/lib/supabase.ts`** — Replace the env var lookup with the hardcoded anon key:
```typescript
const SUPABASE_ANON_KEY = 'sb_publishable_s701-seEtrM9TFIUaq9G9g_14GiigAU';
```

Remove the `import.meta.env` lookup and the warning `console.warn` block.

After this change, re-publish the site to apply the fix.

