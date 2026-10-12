-- Review proofs (Plan 2, Task 10): a private Storage bucket for proof files and the function that records one.
-- Files are uploaded by the app's server with the service role (after stripping image metadata); there are no
-- storage policies, so browsers can never list or read the bucket. Only the admin sees proofs, through
-- 60-second signed URLs. Re-runnable.

-- The local stack has no Storage service (no storage schema), so the bucket is created only where it exists.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('review-proofs', 'review-proofs', false, 10485760,
            array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do update set
      public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- Records an uploaded proof against the caller's own review, while the review can still be edited.
create or replace function public.add_review_proof(p_review uuid, p_path text, p_mime text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reviews;
  v_id uuid;
begin
  select * into r from public.reviews where id = p_review;
  if r.id is null or r.reviewer_id is distinct from auth.uid() then
    raise exception 'not_your_review';
  end if;
  if r.status = 'removed' or r.created_at <= now() - interval '14 days' then
    raise exception 'edit_window_closed';
  end if;
  if p_path is null or left(p_path, char_length(p_review::text) + 1) <> p_review::text || '/'
     or p_path like '%..%' or char_length(p_path) > 200 then
    raise exception 'bad_proof_path';
  end if;
  if p_mime is null or p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'bad_proof_type';
  end if;
  begin
    insert into public.review_proofs (review_id, storage_path, mime_type)
    values (p_review, p_path, p_mime)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'proof_exists';
  end;
  return v_id;
end;
$$;
revoke execute on function public.add_review_proof(uuid, text, text) from public, anon, authenticated;
grant execute on function public.add_review_proof(uuid, text, text) to authenticated;
