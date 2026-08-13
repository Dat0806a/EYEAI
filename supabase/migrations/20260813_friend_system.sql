-- Migration: Friend System for LUCKY DREAM - EYEAI
-- Created: 2026-08-13

-- 1. PROFILES TABLE
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) >= 1),
  avatar_url text null,
  created_at timestamptz default now() not null
);

-- Automatic Profile Creation Trigger on auth.users Signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1),
      'Người dùng'
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. FRIEND REQUESTS TABLE
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz default now() not null,
  responded_at timestamptz null,
  constraint friend_requests_no_self_request check (sender_id != receiver_id)
);

-- Unique index to prevent duplicate pending requests (sender -> receiver)
create unique index if not exists idx_friend_requests_pending_pair
on public.friend_requests (sender_id, receiver_id)
where status = 'pending';

-- Performance indexes
create index if not exists idx_friend_requests_sender_id on public.friend_requests (sender_id);
create index if not exists idx_friend_requests_receiver_id on public.friend_requests (receiver_id);
create index if not exists idx_friend_requests_status on public.friend_requests (status);

-- 3. FRIENDSHIPS TABLE
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now() not null,
  constraint friendships_user_order check (user_a < user_b),
  constraint friendships_unique_pair unique (user_a, user_b)
);

-- Performance indexes
create index if not exists idx_friendships_user_a on public.friendships (user_a);
create index if not exists idx_friendships_user_b on public.friendships (user_b);

-- 4. ROW LEVEL SECURITY (RLS)
alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

-- Profiles Policies
drop policy if exists "Authenticated users can select public profiles" on public.profiles;
create policy "Authenticated users can select public profiles"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Friend Requests Policies
drop policy if exists "Users can view relevant friend requests" on public.friend_requests;
create policy "Users can view relevant friend requests"
on public.friend_requests for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "Users can send friend requests as sender" on public.friend_requests;
create policy "Users can send friend requests as sender"
on public.friend_requests for insert
to authenticated
with check (auth.uid() = sender_id);

drop policy if exists "Sender or receiver can update friend requests" on public.friend_requests;
create policy "Sender or receiver can update friend requests"
on public.friend_requests for update
to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Friendships Policies
drop policy if exists "Users can view their own friendships" on public.friendships;
create policy "Users can view their own friendships"
on public.friendships for select
to authenticated
using (auth.uid() = user_a or auth.uid() = user_b);

-- 5. RPC FUNCTIONS FOR ATOMIC OPERATIONS & EFFICIENT QUERIES

-- Atomic Accept Friend Request
create or replace function public.accept_friend_request(p_request_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_request record;
  v_user_a uuid;
  v_user_b uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_request
  from public.friend_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Friend request not found';
  end if;

  if v_request.receiver_id != auth.uid() then
    raise exception 'Unauthorized to accept this friend request';
  end if;

  if v_request.status != 'pending' then
    raise exception 'Friend request is not pending';
  end if;

  v_user_a := least(v_request.sender_id, v_request.receiver_id);
  v_user_b := greatest(v_request.sender_id, v_request.receiver_id);

  insert into public.friendships (user_a, user_b)
  values (v_user_a, v_user_b)
  on conflict (user_a, user_b) do nothing;

  update public.friend_requests
  set status = 'accepted',
      responded_at = now()
  where id = p_request_id;

  return json_build_object('success', true, 'message', 'Friend request accepted');
end;
$$;

-- Atomic Send Friend Request with Cross-Request Detection & Auto-Accept
create or replace function public.send_friend_request(p_receiver_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_existing_req record;
  v_user_a uuid;
  v_user_b uuid;
  v_new_id uuid;
begin
  if v_sender_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_sender_id = p_receiver_id then
    raise exception 'Cannot send friend request to yourself';
  end if;

  v_user_a := least(v_sender_id, p_receiver_id);
  v_user_b := greatest(v_sender_id, p_receiver_id);

  if exists (select 1 from public.friendships where user_a = v_user_a and user_b = v_user_b) then
    raise exception 'Already friends';
  end if;

  -- Cross-request check: Has receiver sent a pending request to sender?
  select * into v_existing_req
  from public.friend_requests
  where sender_id = p_receiver_id and receiver_id = v_sender_id and status = 'pending';

  if found then
    perform public.accept_friend_request(v_existing_req.id);
    return json_build_object('success', true, 'status', 'accepted', 'message', 'Cross request auto-accepted');
  end if;

  -- Duplicate pending check
  select * into v_existing_req
  from public.friend_requests
  where sender_id = v_sender_id and receiver_id = p_receiver_id and status = 'pending';

  if found then
    return json_build_object('success', true, 'status', 'pending', 'message', 'Friend request already sent');
  end if;

  insert into public.friend_requests (sender_id, receiver_id, status)
  values (v_sender_id, p_receiver_id, 'pending')
  returning id into v_new_id;

  return json_build_object('success', true, 'status', 'pending', 'id', v_new_id, 'message', 'Friend request sent successfully');
end;
$$;

-- Atomic Reject Friend Request
create or replace function public.reject_friend_request(p_request_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_request record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_request from public.friend_requests where id = p_request_id for update;

  if not found then
    raise exception 'Friend request not found';
  end if;

  if v_request.receiver_id != auth.uid() then
    raise exception 'Unauthorized to reject this friend request';
  end if;

  update public.friend_requests
  set status = 'rejected',
      responded_at = now()
  where id = p_request_id;

  return json_build_object('success', true, 'message', 'Friend request rejected');
end;
$$;

-- Cancel Outgoing Request
create or replace function public.cancel_friend_request(p_request_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_request record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_request from public.friend_requests where id = p_request_id for update;

  if not found then
    raise exception 'Friend request not found';
  end if;

  if v_request.sender_id != auth.uid() then
    raise exception 'Unauthorized to cancel this friend request';
  end if;

  update public.friend_requests
  set status = 'cancelled',
      responded_at = now()
  where id = p_request_id;

  return json_build_object('success', true, 'message', 'Friend request cancelled');
end;
$$;

-- Query My Friends with Profile Info (No N+1)
create or replace function public.get_my_friends()
returns table (
  friendship_id uuid,
  friend_id uuid,
  display_name text,
  avatar_url text,
  friendship_created_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  select 
    f.id as friendship_id,
    case when f.user_a = auth.uid() then f.user_b else f.user_a end as friend_id,
    p.display_name,
    p.avatar_url,
    f.created_at as friendship_created_at
  from public.friendships f
  join public.profiles p on p.id = (case when f.user_a = auth.uid() then f.user_b else f.user_a end)
  where f.user_a = auth.uid() or f.user_b = auth.uid()
  order by p.display_name asc;
end;
$$;

-- Search Users with Relationship Status for Current User
create or replace function public.search_users_with_status(p_query text)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  relationship_status text,
  request_id uuid
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or trim(p_query) = '' then
    return;
  end if;

  return query
  select 
    p.id,
    p.display_name,
    p.avatar_url,
    case 
      when exists (
        select 1 from public.friendships f 
        where f.user_a = least(v_user_id, p.id) and f.user_b = greatest(v_user_id, p.id)
      ) then 'friend'
      when exists (
        select 1 from public.friend_requests fr 
        where fr.sender_id = v_user_id and fr.receiver_id = p.id and fr.status = 'pending'
      ) then 'outgoing_pending'
      when exists (
        select 1 from public.friend_requests fr 
        where fr.sender_id = p.id and fr.receiver_id = v_user_id and fr.status = 'pending'
      ) then 'incoming_pending'
      else 'none'
    end as relationship_status,
    (
      select fr.id from public.friend_requests fr 
      where ((fr.sender_id = v_user_id and fr.receiver_id = p.id) or (fr.sender_id = p.id and fr.receiver_id = v_user_id))
        and fr.status = 'pending'
      limit 1
    ) as request_id
  from public.profiles p
  where p.id != v_user_id
    and p.display_name ilike '%' || trim(p_query) || '%'
  limit 20;
end;
$$;

-- Query Incoming Friend Requests with Sender Profiles
create or replace function public.get_incoming_friend_requests()
returns table (
  request_id uuid,
  sender_id uuid,
  display_name text,
  avatar_url text,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  select 
    fr.id as request_id,
    fr.sender_id,
    p.display_name,
    p.avatar_url,
    fr.created_at
  from public.friend_requests fr
  join public.profiles p on p.id = fr.sender_id
  where fr.receiver_id = auth.uid() and fr.status = 'pending'
  order by fr.created_at asc;
end;
$$;
