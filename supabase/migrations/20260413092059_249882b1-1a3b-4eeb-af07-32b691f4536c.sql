
DROP POLICY "Users can add members to conversations they created" ON public.conversation_members;

CREATE POLICY "Users can add members to their conversations"
  ON public.conversation_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = conversation_members.conversation_id
        AND conversations.created_by = auth.uid()
    )
    OR user_id = auth.uid()
  );
