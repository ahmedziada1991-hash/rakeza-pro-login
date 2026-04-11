import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ssuwzsdpzohmfuhvuzmx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzdXd6c2Rwem9obWZ1aHZ1em14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyOTEzNjcsImV4cCI6MjA5MDg2NzM2N30.266UWBIopQo5w349uU3z_SPUJYtEgtxQUXtv95xVh9U";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
