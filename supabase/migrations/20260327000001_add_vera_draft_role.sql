-- Add 'vera_draft' to case_messages role check constraint
-- Required by Week 4 resolution pipeline (AI-generated draft replies pending operator approval)

alter table case_messages
  drop constraint case_messages_role_check;

alter table case_messages
  add constraint case_messages_role_check
  check (role in ('customer', 'vera', 'vera_draft', 'operator'));
