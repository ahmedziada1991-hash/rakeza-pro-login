-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  scheduled_for TIMESTAMP WITH TIME ZONE,
  client_id BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_scheduled_for ON public.notifications(scheduled_for) WHERE is_read = false;
CREATE INDEX idx_notifications_is_read ON public.notifications(user_id, is_read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all notifications"
ON public.notifications FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Add followup columns to call_logs
ALTER TABLE public.call_logs 
  ADD COLUMN IF NOT EXISTS next_followup_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS next_followup_type TEXT;

-- Enable realtime for notifications
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;