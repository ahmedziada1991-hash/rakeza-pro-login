
CREATE OR REPLACE FUNCTION public.get_user_id_by_auth_id(p_auth_id uuid)
RETURNS integer AS $$
DECLARE
  user_integer_id integer;
BEGIN
  SELECT id INTO user_integer_id
  FROM public.users
  WHERE auth_id = p_auth_id;

  RETURN user_integer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
