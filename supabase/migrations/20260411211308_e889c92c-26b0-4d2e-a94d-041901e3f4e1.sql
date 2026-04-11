
CREATE TABLE public.messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name text NOT NULL DEFAULT '',
  receiver_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their messages"
ON public.messages FOR SELECT TO authenticated
USING (
  sender_id = auth.uid()
  OR receiver_id = auth.uid()
  OR receiver_id IS NULL
);

CREATE POLICY "Users can send messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can mark messages as read"
ON public.messages FOR UPDATE TO authenticated
USING (receiver_id = auth.uid() OR receiver_id IS NULL)
WITH CHECK (receiver_id = auth.uid() OR receiver_id IS NULL);

CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_receiver ON public.messages(receiver_id);
CREATE INDEX idx_messages_created ON public.messages(created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
