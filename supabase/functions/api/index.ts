import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1"
import { createHandlers } from "./handlers.ts"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const qstashUrl = Deno.env.get("QSTASH_URL") ?? ""
const qstashToken = Deno.env.get("QSTASH_TOKEN") ?? ""

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

const handlers = createHandlers({
  supabase,
  qstash: {
    url: qstashUrl,
    token: qstashToken
  }
})

serve((request) => handlers.handleRequest(request))
