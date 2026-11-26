-- Chamado pelo backup-banco.yml depois do upload (psql -v tamanho=N -f este arquivo).
select public.registrar_status('ultimo_backup', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
select public.registrar_status('backups_bytes', :'tamanho');
select public.registrar_status('ultimo_backup_erro', '');
