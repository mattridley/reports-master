create table if not exists classes (
  id text primary key,
  year_group text not null,
  subjects_json text,
  subject_teachers_json text,
  subject text not null,
  class_name text not null
);

create table if not exists subjects (
  name text primary key
);

create table if not exists teachers (
  id text primary key,
  name text not null
);

create table if not exists pronoun_sets (
  id text primary key,
  label text not null,
  subject text not null,
  object text not null,
  possessive text not null,
  reflexive text not null,
  is_plural integer not null
);

create table if not exists students (
  id text primary key,
  class_id text not null references classes(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  pronoun_set_id text not null references pronoun_sets(id),
  effort_score text not null,
  attainment_score text not null
);

create table if not exists student_subject_scores (
  student_id text not null references students(id) on delete cascade,
  class_id text not null references classes(id) on delete cascade,
  subject text not null,
  effort_score text not null,
  attainment_score text not null,
  primary key (student_id, class_id, subject)
);

create table if not exists statement_templates (
  id text primary key,
  year_group text not null,
  subject text not null,
  score_type text not null check (score_type in ('effort', 'attainment')),
  score_label text not null,
  statement_text text not null
);

create table if not exists draft_reports (
  id text primary key,
  student_id text not null references students(id) on delete cascade,
  class_id text not null references classes(id) on delete cascade,
  subject text,
  generated_text text not null,
  edited_text text not null,
  mode text not null check (mode in ('rule', 'ai')),
  updated_at text not null
);

create table if not exists score_scales (
  score_type text primary key check (score_type in ('effort', 'attainment')),
  labels_json text not null
);

create table if not exists ai_settings (
  id integer primary key check (id = 1),
  enabled integer not null,
  api_key text not null,
  model text not null
);

create table if not exists export_metadata (
  id text primary key,
  class_id text,
  export_type text not null check (export_type in ('csv', 'pdf')),
  exported_at text not null
);
