-- Run the shared product image worker every two minutes. Each invocation is
-- capped at two products, and the queue claim enforces 100 provider attempts
-- per UTC day across all invocations.
--
-- Required Vault secrets:
--   suppro_refresh_product_images_url
--   suppro_refresh_product_images_server_credential
--
-- Inspect:
--   select jobid, jobname, schedule, active
--   from cron.job where jobname = 'suppro-refresh-product-images';
-- Pause:
--   update cron.job set active = false
--   where jobname = 'suppro-refresh-product-images';
-- Resume:
--   update cron.job set active = true
--   where jobname = 'suppro-refresh-product-images';
-- Unschedule:
--   select cron.unschedule(jobid)
--   from cron.job where jobname = 'suppro-refresh-product-images';

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if (
    select pg_catalog.count(distinct secret.name)
    from vault.secrets as secret
    where secret.name in (
      'suppro_refresh_product_images_url',
      'suppro_refresh_product_images_server_credential'
    )
  ) <> 2 then
    raise exception using
      errcode = '22023',
      message = 'required product image refresh Vault secrets are missing';
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
    where job.jobname = 'suppro-refresh-product-images'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'suppro-refresh-product-images',
  '*/2 * * * *',
  $scheduled_request$
    with scheduler_secrets as (
      select
        max(secret.decrypted_secret) filter (
          where secret.name = 'suppro_refresh_product_images_url'
        ) as function_url,
        max(secret.decrypted_secret) filter (
          where secret.name = 'suppro_refresh_product_images_server_credential'
        ) as server_credential
      from vault.decrypted_secrets as secret
      where secret.name in (
        'suppro_refresh_product_images_url',
        'suppro_refresh_product_images_server_credential'
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
        'limit', 2,
        'dailyLimit', 100
      ),
      timeout_milliseconds := 120000
    )
    from scheduler_secrets
    where scheduler_secrets.function_url is not null
      and scheduler_secrets.server_credential is not null;
  $scheduled_request$
);
