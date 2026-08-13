-- Migration: Human ↔ Human Realtime Chat & WebRTC Calls
-- Created: 2026-08-13

-- 1. CONVERSATIONS TABLE (Direct 1:1)
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint conversations_user_order check (user_a < user_b),
  constraint conversations_unique_pair unique (user_a, user_b)
);

create index if not exists idx_conversations_user_a on public.conversations (user_a);
create index if not exists idx_conversations_user_b on public.conversations (user_b);

-- 2. MESSAGES TABLE
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) >= 1),
  created_at timestamptz default now() not null,
  edited_at timestamptz null
);

create index if not exists idx_messages_conversation_created on public.messages (conversation_id, created_at asc);

-- 3. CALLS METADATA TABLE
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid null references public.conversations(id) on delete cascade,
  type text not null check (type in ('voice', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'declined', 'cancelled', 'ended', 'failed', 'missed')),
  created_at timestamptz default now() not null,
  answered_at timestamptz null,
  ended_at timestamptz null
);

create index if not exists idx_calls_caller on public.calls (caller_id);
create index if not exists idx_calls_callee on public.calls (callee_id);

-- 4. ROW LEVEL SECURITY (RLS)
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.calls enable row level security;

-- Conversations RLS Policies
drop policy if exists "Participants can view direct conversations" on public.conversations;
create policy "Participants can view direct conversations"
on public.conversations for select
to authenticated
using (auth.uid() = user_a or auth.uid() = user_b);

-- Messages RLS Policies
drop policy if exists "Participants can view messages" on public.messages;
create policy "Participants can view messages"
on public.messages for select
to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
  )
);

drop policy if exists "Participants can insert messages" on public.messages;
create policy "Participants can insert messages"
on public.messages for insert
to authenticated
with check (
  auth.uid() = sender_id
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
  )
);

-- Calls RLS Policies
drop policy if exists "Participants can view calls" on public.calls;
create policy "Participants can view calls"
on public.calls for select
to authenticated
using (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists "Friends can initiate calls" on public.calls;
create policy "Friends can initiate calls"
on public.calls for insert
to authenticated
with check (
  auth.uid() = caller_id
  and exists (
    select 1 from public.friendships f
    where f.user_a = least(caller_id, callee_id)
      and f.user_b = greatest(caller_id, callee_id)
  )
);

drop policy if exists "Participants can update calls" on public.calls;
create policy "Participants can update calls"
on public.calls for update
to authenticated
using (auth.uid() = caller_id or auth.uid() = callee_id);

-- 5. RPC FUNCTIONS FOR ATOMIC OPERATIONS & SECURITY

-- Atomic Get or Create Direct Conversation
create or replace function public.get_or_create_direct_conversation(p_friend_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_a uuid;
  v_user_b uuid;
  v_conv_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_user_id = p_friend_id then
    raise exception 'Cannot create conversation with yourself';
  end if;

  v_user_a := least(v_user_id, p_friend_id);
  v_user_b := greatest(v_user_id, p_friend_id);

  -- 1. Check if users are accepted friends
  if not exists (
    select 1 from public.friendships
    where user_a = v_user_a and user_b = v_user_b
  ) then
    raise exception 'Users are not friends';
  end if;

  -- 2. Select existing conversation
  select id into v_conv_id
  from public.conversations
  where user_a = v_user_a and user_b = v_user_b;

  -- 3. Create conversation if not exists
  if v_conv_id is null then
    insert into public.conversations (user_a, user_b)
    values (v_user_a, v_user_b)
    on conflict (user_a, user_b) do nothing
    returning id into v_conv_id;

    if v_conv_id is null then
      select id into v_conv_id
      from public.conversations
      where user_a = v_user_a and user_b = v_user_b;
    end if;
  end if;

  return json_build_object('success', true, 'conversation_id', v_conv_id);
end;
$$;

-- Atomic Send Chat Message
create or replace function public.send_chat_message(p_conversation_id uuid, p_content text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_trimmed text := trim(p_content);
  v_msg_id uuid;
  v_created_at timestamptz;
begin
  if v_sender_id is null then
    raise exception 'Not authenticated';
  end if;

  if char_length(v_trimmed) < 1 then
    raise exception 'Message content cannot be empty';
  end if;

  -- Verify sender belongs to conversation
  if not exists (
    select 1 from public.conversations
    where id = p_conversation_id
      and (user_a = v_sender_id or user_b = v_sender_id)
  ) then
    raise exception 'Unauthorized to send message in this conversation';
  end if;

  insert into public.messages (conversation_id, sender_id, content)
  values (p_conversation_id, v_sender_id, v_trimmed)
  returning id, created_at into v_msg_id, v_created_at;

  update public.conversations
  set updated_at = now()
  where id = p_conversation_id;

  return json_build_object(
    'id', v_msg_id,
    'conversation_id', p_conversation_id,
    'sender_id', v_sender_id,
    'content', v_trimmed,
    'created_at', v_created_at
  );
end;
$$;

-- Query Conversation Messages
create or replace function public.get_conversation_messages(p_conversation_id uuid, p_limit int default 50)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  created_at timestamptz,
  edited_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  -- Verify participant
  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ) then
    return;
  end if;

  return query
  select m.id, m.conversation_id, m.sender_id, m.content, m.created_at, m.edited_at
  from public.messages m
  where m.conversation_id = p_conversation_id
  order by m.created_at asc
  limit p_limit;
end;
$$;

-- Enable Realtime for messages & calls
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.calls;
