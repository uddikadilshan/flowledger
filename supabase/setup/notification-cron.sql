-- Run only after notification migration is applied, as a privileged database administrator.
create extension if not exists pg_cron;
select cron.schedule('flowledger-notification-cycle','*/15 * * * *','select private.run_notification_cycle();');
