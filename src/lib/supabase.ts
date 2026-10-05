import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_RECODE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_RECODE_SUPABASE_PUBLISHABLE_KEY;

export const recodeSupabase =
  url && publishableKey ? createClient(url, publishableKey) : null;
