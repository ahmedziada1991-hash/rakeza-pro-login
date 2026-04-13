import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ConversationList } from "./ConversationList";
import { ChatArea } from "./ChatArea";
import { NewConversationDialog } from "./NewConversationDialog";
import { Button } from "@/components/ui/button";
import { MessageCircle, Plus, Home } from "lucide-react";

export function ChatPage() {
  const { user } = useAuth();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  if (!user) return null;

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setMobileShowChat(true);
  };

  const handleBack = () => {
    setMobileShowChat(false);
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex border-t border-border overflow-hidden bg-card" dir="rtl">
      {/* Conversations List - hidden on mobile when chat is open */}
      <div className={`w-full md:w-80 lg:w-96 border-l border-border flex flex-col shrink-0 ${mobileShowChat ? "hidden md:flex" : "flex"}`}>
        <div className="p-3 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h2 className="font-cairo font-bold text-foreground">المحادثات</h2>
          </div>
          <Button size="sm" variant="outline" className="font-cairo gap-1" onClick={() => setNewDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            جديدة
          </Button>
        </div>
        <ConversationList
          userId={user.id}
          selectedId={selectedConversationId}
          onSelect={handleSelectConversation}
        />
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col min-w-0 ${!mobileShowChat ? "hidden md:flex" : "flex"}`}>
        {selectedConversationId ? (
          <ChatArea
            conversationId={selectedConversationId}
            userId={user.id}
            onBack={handleBack}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <MessageCircle className="h-16 w-16 text-muted-foreground/30 mx-auto" />
              <p className="font-cairo text-muted-foreground">اختر محادثة أو ابدأ محادثة جديدة</p>
            </div>
          </div>
        )}
      </div>

      <NewConversationDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        userId={user.id}
        onCreated={(id) => {
          setSelectedConversationId(id);
          setMobileShowChat(true);
          setNewDialogOpen(false);
        }}
      />
    </div>
  );
}
