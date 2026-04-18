// supabase-config.js
const SUPABASE_URL = 'https://eowtwguyjmjtoubpxcba.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvd3R3Z3V5am1qdG91YnB4Y2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMTkyNzgsImV4cCI6MjA5MTg5NTI3OH0.gu29siKNH4CGcZSsG59IMpy4NfVTu6EZ1r6na5Yb2aw';

// Initialize Supabase client
window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);
