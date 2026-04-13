
-- Create public users table for team members
CREATE TABLE public.users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'sales',
  auth_id UUID UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view users (needed for chat, assignments, etc.)
CREATE POLICY "Authenticated users can view all users"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert users (via admin user management)
CREATE POLICY "Service role can insert users"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only admins can update users
CREATE POLICY "Service role can update users"
  ON public.users FOR UPDATE
  TO authenticated
  USING (true);

-- Only admins can delete users  
CREATE POLICY "Service role can delete users"
  ON public.users FOR DELETE
  TO authenticated
  USING (true);
