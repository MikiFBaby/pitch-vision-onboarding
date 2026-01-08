import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser-side Supabase client for client components
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export function createClientHelper() {
    return createClient(supabaseUrl, supabaseAnonKey)
}
