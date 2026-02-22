import { createClient } from '@supabase/supabase-js';

// แทนที่ 'URL_จริง' และ 'KEY_จริง' ด้วยค่าจาก Supabase ของคุณ (ก๊อปปี้มาวางในเครื่องหมายคำพูด)
const supabaseUrl = 'https://fpcpydkenqkuscevyvao.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwY3B5ZGtlbnFrdXNjZXZ5dmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MDUyNjYsImV4cCI6MjA4NzE4MTI2Nn0.7wf6zU5DzxXOji-zVhhfKSJixbDHCVKONNQoAP_NxoA'; // ใส่คีย์ยาวๆ ของคุณให้ครบ

export const supabase = createClient(supabaseUrl, supabaseKey);