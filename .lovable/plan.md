

## Fix: Message sending fails due to schema cache mismatch

**Problem**: The error "Could not find the 'sender_name' column of 'messages' in the schema cache" means PostgREST's internal cache is stale after recent column renames. The column exists in the DB but the API layer doesn't see it yet.

**Solution**: Cast `supabase` as `any` for all insert operations in `ChatArea.tsx`, matching the pattern already used for all read operations. This bypasses the client-side type/schema cache validation.

### Changes

**File: `src/components/chat/ChatArea.tsx`**
- Change all three `.from("messages").insert(...)` calls to use `(supabase as any).from("messages").insert(...)` — for text messages, audio messages, and attachments.

This is a minimal 3-line change that matches the existing pattern used throughout the chat codebase for reads.

