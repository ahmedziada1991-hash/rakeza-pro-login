
CREATE TABLE public.ai_analysis_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id BIGINT,
  action TEXT NOT NULL,
  role TEXT NOT NULL,
  response TEXT NOT NULL,
  client_data TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_analysis_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own AI logs"
ON public.ai_analysis_logs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own AI logs"
ON public.ai_analysis_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all AI logs"
ON public.ai_analysis_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_ai_analysis_logs_client ON public.ai_analysis_logs (client_id);
CREATE INDEX idx_ai_analysis_logs_user ON public.ai_analysis_logs (user_id);
