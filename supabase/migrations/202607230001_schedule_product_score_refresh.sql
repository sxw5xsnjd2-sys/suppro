-- Schedule the bounded product score refresh worker daily at 03:00 UTC.
-- Requires 202607220003_add_product_score_refresh_workflows.sql and these
-- Supabase Vault secrets to exist before this migration is applied:
--   suppro_refresh_product_scores_url
--   suppro_refresh_product_scores_server_credential
--
-- The URL secret must contain the full refresh-product-scores Edge Function URL.
-- The credential secret must match the worker's INTERNAL_SERVICE_ROLE_KEY or
-- SUPABASE_SERVICE_ROLE_KEY. No secret value is stored in migration history.
--
-- Operations:
--   Inspect:
--     select jobid, jobname, schedule, active
--     from cron.job where jobname = 'suppro-refresh-product-scores';
--   Pause:
--     update cron.job set active = false
--     where jobname = 'suppro-refresh-product-scores';
--   Resume:
--     update cron.job set active = true
--     where jobname = 'suppro-refresh-product-scores';
--   Unschedule:
--     select cron.unschedule(jobid)
--     from cron.job where jobname = 'suppro-refresh-product-scores';
--
-- Rollback: run the Unschedule statement above. Queue/cache schema and data are
-- intentionally unaffected.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if (
    select pg_catalog.count(distinct secret.name)
    from vault.secrets as secret
    where secret.name in (
      'suppro_refresh_product_scores_url',
      'suppro_refresh_product_scores_server_credential'
    )
  ) <> 2 then
    raise exception using
      errcode = '22023',
      message = 'required product score refresh Vault secrets are missing';
  end if;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select job.jobid
    from cron.job as job
    where job.jobname = 'suppro-refresh-product-scores'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'suppro-refresh-product-scores',
  '0 3 * * *',
  $scheduled_request$
    with scheduler_secrets as (
      select
        max(secret.decrypted_secret) filter (
          where secret.name = 'suppro_refresh_product_scores_url'
        ) as function_url,
        max(secret.decrypted_secret) filter (
          where secret.name = 'suppro_refresh_product_scores_server_credential'
        ) as server_credential
      from vault.decrypted_secrets as secret
      where secret.name in (
        'suppro_refresh_product_scores_url',
        'suppro_refresh_product_scores_server_credential'
      )
    )
    select net.http_post(
      url := scheduler_secrets.function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || scheduler_secrets.server_credential,
        'apikey', scheduler_secrets.server_credential
      ),
      body := jsonb_build_object(
        'limit', 25,
        'write', true
      ),
      timeout_milliseconds := 120000
    )
    from scheduler_secrets
    where scheduler_secrets.function_url is not null
      and scheduler_secrets.server_credential is not null;
  $scheduled_request$
);
