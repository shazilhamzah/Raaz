import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qypmwukyswqodgguckwi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5cG13dWt5c3dxb2RnZ3Vja3dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNzY1NzUsImV4cCI6MjA4NDg1MjU3NX0.abjdochkmda5Jl9TgM9PnqD5QeQbjpevjzhtSzHE3Cw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);