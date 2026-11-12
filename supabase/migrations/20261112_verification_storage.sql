-- Seller verification storage: make the private `verification-documents` bucket
-- accept real phone uploads and let each authenticated seller write only under
-- their own `{userId}/` prefix.
--
-- Why this is needed:
--   The bucket was configured by hand, so a legacy 1 MB `file_size_limit` (or a
--   missing owner policy) can make `uploadStudentId` fail with "Could not upload
--   your ID card" even though the client-side check now allows 10 MB. This
--   migration makes the server-side limit match the app and is safe to re-run.
--
-- Apply once in Supabase → SQL Editor. Existing objects and profiles are not
-- touched; only the bucket settings and storage policies are reconciled.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-documents',
  'verification-documents',
  false,
  26214400, -- 25 MB (matches utils/verify.ts video limit)
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Owners may read/write/delete only their own folder. Uploads use
-- `upsert: true`, so the UPDATE policy is required as well as INSERT.
drop policy if exists verification_documents_select_own on storage.objects;
create policy verification_documents_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists verification_documents_insert_own on storage.objects;
create policy verification_documents_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists verification_documents_update_own on storage.objects;
create policy verification_documents_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists verification_documents_delete_own on storage.objects;
create policy verification_documents_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
