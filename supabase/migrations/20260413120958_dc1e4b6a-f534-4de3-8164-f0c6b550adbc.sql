CREATE OR REPLACE VIEW public.messages_view AS
SELECT *, content AS message
FROM public.messages;