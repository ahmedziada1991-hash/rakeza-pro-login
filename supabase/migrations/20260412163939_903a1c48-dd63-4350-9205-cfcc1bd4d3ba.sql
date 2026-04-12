
CREATE TABLE public.field_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  area TEXT,
  notes TEXT,
  contractor_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.field_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own field locations"
ON public.field_locations FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own field locations"
ON public.field_locations FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
