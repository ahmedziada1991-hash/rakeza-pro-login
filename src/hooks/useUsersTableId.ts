import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Resolves the current auth user's row ID in the public `users` table.
 * Tries: auth UUID match → email match → phone match.
 * Returns { usersTableId, userName, isLoading }.
 */
export function useUsersTableId() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["users-table-id", user?.id],
    queryFn: async () => {
      // 1) Try direct ID match (users.id = auth UUID)
      const { data: byId } = await supabase
        .from("users")
        .select("id, name")
        .eq("id", user!.id)
        .maybeSingle();
      if (byId) return byId;

      // 2) Try email match
      if (user!.email) {
        const { data: byEmail } = await supabase
          .from("users")
          .select("id, name")
          .eq("email", user!.email)
          .maybeSingle();
        if (byEmail) return byEmail;
      }

      // 3) Try phone match
      if (user!.phone) {
        const { data: byPhone } = await supabase
          .from("users")
          .select("id, name")
          .eq("phone", user!.phone)
          .maybeSingle();
        if (byPhone) return byPhone;
      }

      return null;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 10, // cache 10 min
  });

  return {
    usersTableId: data?.id ?? null,
    userName: data?.name ?? null,
    isLoading,
  };
}
