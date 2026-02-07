-- Remove role distinctions from operator_games table
-- All operators in a game now have equal permissions

-- Drop the existing constraint that enforced specific role values
alter table operator_games drop constraint if exists operator_games_role_check;

-- Update the role column to a simple 'operator' value for all entries
update operator_games set role = 'operator' where role in ('creator', 'collaborator', 'owner');

-- Since we want equal permissions, we could drop the column entirely, 
-- but keeping it as 'operator' for backward compatibility and potential future use
alter table operator_games alter column role set default 'operator';

-- Add a new constraint that only allows 'operator' role
alter table operator_games add constraint operator_games_role_check 
    check (role in ('operator'));