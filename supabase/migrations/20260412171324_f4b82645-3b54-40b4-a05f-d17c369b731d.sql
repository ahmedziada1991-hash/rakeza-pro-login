
-- Create call_logs table
CREATE TABLE public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id bigint NOT NULL,
  user_id uuid NOT NULL,
  employee_name text NOT NULL DEFAULT '',
  call_date timestamptz NOT NULL DEFAULT now(),
  call_type text NOT NULL DEFAULT 'call',
  result text NOT NULL DEFAULT '',
  notes text,
  audio_url text,
  duration_minutes integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own call logs"
ON public.call_logs FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own call logs"
ON public.call_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own call logs"
ON public.call_logs FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- Create storage bucket for call recordings
INSERT INTO storage.buckets (id, name, public) VALUES ('call-recordings', 'call-recordings', true);

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload recordings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'call-recordings');

-- Allow public read
CREATE POLICY "Public can read recordings"
ON storage.objects FOR SELECT
USING (bucket_id = 'call-recordings');
