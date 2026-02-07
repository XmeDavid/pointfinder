-- Add status field to operators table
alter table operators add column if not exists status text not null default 'active';

-- Add index on status for filtering
create index if not exists idx_operators_status on operators (status);

-- Update existing operators to have active status
update operators set status = 'active' where status is null;