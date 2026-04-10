import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Resolves the logged-in auth user to the numeric employee row in `users`
 * using `users.auth_id = auth.users.id`.
 */
export function useUsersTableId() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["users-table-id", user?.id],
    queryFn: async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const authUserId = authData.user?.id;
      if (!authUserId) return null;

      const { data: userRow, error } = await supabase
        .from("users")
        .select("id, name")
        .eq("auth_id", authUserId)
        .maybeSingle();

      if (error) throw error;
      return userRow ?? null;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 10,
  });

  return {
    usersTableId: data?.id ?? null,
    userName: data?.name ?? null,
    isLoading,
  };
}
