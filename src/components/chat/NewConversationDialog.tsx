import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Users, User, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABELS: Record<string, string> = {
  admin: "أدمن", sales: "مبيعات", followup: "متابعة", execution: "تنفيذ",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-destructive/10 text-destructive",
  sales: "bg-primary/10 text-primary",
  followup: "bg-emerald-500/10 text-emerald-600",
  execution: "bg-orange-500/10 text-orange-600",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onCreated: (conversationId: string) => void;
}

export function NewConversationDialog({ open, onOpenChange, userId, onCreated }: Props) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ["chat-all-users"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("users")
        .select("id, name, role, auth_id")
        .order("name");
      return (data ?? []).filter((u: any) => u.auth_id && u.auth_id !== userId);
    },
    enabled: open,
  });

  const filtered = (users ?? []).filter((u: any) =>
    u.name?.includes(search) || ROLE_LABELS[u.role]?.includes(search)
  );

  const toggleUser = (authId: string) => {
    setSelectedIds((prev) =>
      prev.includes(authId)
        ? prev.filter((id) => id !== authId)
        : [...prev, authId]
    );
  };

  const isGroup = selectedIds.length > 1;

  const handleCreate = async () => {
    if (!selectedIds.length) {
      toast.error("اختر شخص واحد على الأقل");
      return;
    }
    if (isGroup && !groupName.trim()) {
      toast.error("أدخل اسم المجموعة");
      return;
    }

    setCreating(true);
    try {
      // Check if 1:1 conversation already exists
      if (!isGroup) {
        const otherId = selectedIds[0];
        const { data: myConvs } = await (supabase as any)
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", userId);

        if (myConvs?.length) {
          const myConvIds = myConvs.map((c: any) => c.conversation_id);
          const { data: otherConvs } = await (supabase as any)
            .from("conversation_members")
            .select("conversation_id")
            .eq("user_id", otherId)
            .in("conversation_id", myConvIds);

          if (otherConvs?.length) {
            // Check if any are 1:1 (not group)
            for (const oc of otherConvs) {
              const { data: conv } = await (supabase as any)
                .from("conversations")
                .select("id, is_group")
                .eq("id", oc.conversation_id)
                .eq("is_group", false)
                .single();
              if (conv) {
                onCreated(conv.id);
                setCreating(false);
                reset();
                return;
              }
            }
          }
        }
      }

      // Create conversation
      const { data: conv, error: convErr } = await (supabase as any)
        .from("conversations")
        .insert({
          is_group: isGroup,
          name: isGroup ? groupName.trim() : null,
          created_by: userId,
        })
        .select("id")
        .single();

      if (convErr) throw convErr;

      // Add members (creator + selected)
      const members = [userId, ...selectedIds].map((uid) => ({
        conversation_id: conv.id,
        user_id: uid,
      }));

      const { error: memErr } = await (supabase as any)
        .from("conversation_members")
        .insert(members);

      if (memErr) throw memErr;

      onCreated(conv.id);
      reset();
    } catch (err: any) {
      toast.error("فشل إنشاء المحادثة: " + (err.message || ""));
    }
    setCreating(false);
  };

  const reset = () => {
    setSelectedIds([]);
    setGroupName("");
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-cairo text-right">محادثة جديدة</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ابحث عن مستخدم..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 font-cairo"
            />
          </div>

          {/* Selected tags */}
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedIds.map((id) => {
                const u = (users ?? []).find((u: any) => u.auth_id === id);
                return (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="font-cairo gap-1 cursor-pointer hover:bg-destructive/10"
                    onClick={() => toggleUser(id)}
                  >
                    {u?.name ?? "مستخدم"} ✕
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Group name */}
          {isGroup && (
            <div className="space-y-1">
              <Label className="font-cairo text-xs">اسم المجموعة *</Label>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="مثال: فريق المبيعات"
                className="font-cairo"
              />
            </div>
          )}

          {/* Users list */}
          <ScrollArea className="flex-1 min-h-0 max-h-60 border rounded-lg">
            {isLoading ? (
              <div className="p-4 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
            ) : !filtered.length ? (
              <p className="text-center text-muted-foreground font-cairo py-6 text-sm">لا يوجد مستخدمين</p>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((u: any) => (
                  <button
                    key={u.auth_id}
                    onClick={() => toggleUser(u.auth_id)}
                    className={`w-full flex items-center gap-3 p-3 text-right transition-colors hover:bg-muted/50 ${
                      selectedIds.includes(u.auth_id) ? "bg-primary/5" : ""
                    }`}
                  >
                    <Checkbox checked={selectedIds.includes(u.auth_id)} className="shrink-0" />
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="font-cairo font-bold text-sm text-muted-foreground">{u.name?.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-cairo text-sm font-medium text-foreground truncate">{u.name}</p>
                    </div>
                    <Badge variant="outline" className={`font-cairo text-[10px] ${ROLE_COLORS[u.role] ?? ""}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="flex gap-2 pt-3 border-t">
          <Button
            onClick={handleCreate}
            disabled={creating || !selectedIds.length}
            className="flex-1 font-cairo gap-2"
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            {isGroup ? <Users className="h-4 w-4" /> : <User className="h-4 w-4" />}
            {isGroup ? "إنشاء مجموعة" : "بدء محادثة"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-cairo">
            إلغاء
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
