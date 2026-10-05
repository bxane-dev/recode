import { createClient } from "@supabase/supabase-js";

const DEFAULT_URL = "https://qmhbkpqpaixxddasosqy.supabase.co";
const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_NSInj3ZZw2HMAHWqX_sp7A_2OWy2l66";

const url = import.meta.env.VITE_RECODE_SUPABASE_URL || DEFAULT_URL;
const publishableKey =
  import.meta.env.VITE_RECODE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY;

export const recodeSupabase = createClient(url, publishableKey);
