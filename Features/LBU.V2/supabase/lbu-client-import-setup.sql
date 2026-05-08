-- Lingkod Bayan client assistance Excel import helpers.
-- Run this once before running the lbu-client-import-parts files.

create or replace function public.lb_import_normalize_client_text(value text)
returns text
language sql
immutable
as $$
    select btrim(
        regexp_replace(
            regexp_replace(
                translate(
                    lower(coalesce(value, '')),
                    'áàäâãåéèëêíìïîñóòöôõúùüûçýÿ',
                    'aaaaaaeeeeiiiinooooouuuucyy'
                ),
                '&',
                ' and ',
                'g'
            ),
            '[^a-z0-9]+',
            ' ',
            'g'
        )
    );
$$;

create or replace function public.lb_import_record_aliases(payload jsonb)
returns text[]
language sql
immutable
as $$
    select array_remove(array[
        public.lb_import_normalize_client_text(payload->>'name'),
        public.lb_import_normalize_client_text(concat_ws(' ', payload->>'firstName', payload->>'middleName', payload->>'lastName')),
        public.lb_import_normalize_client_text(concat_ws(' ', payload->>'lastName', payload->>'firstName', payload->>'middleName'))
    ], '');
$$;

create or replace function public.lb_import_record_has_source_key(payload jsonb, source_key text)
returns boolean
language sql
immutable
as $$
    select coalesce(payload->>'importSourceKey', '') = coalesce(source_key, '')
        or exists (
            select 1
            from jsonb_array_elements(
                case
                    when jsonb_typeof(payload->'history') = 'array' then payload->'history'
                    else '[]'::jsonb
                end
            ) as history_entry(entry)
            where coalesce(history_entry.entry->>'importSourceKey', '') = coalesce(source_key, '')
        );
$$;

create or replace function public.lb_import_fill_missing_fields(target jsonb, source jsonb)
returns jsonb
language plpgsql
as $$
declare
    result jsonb := coalesce(target, '{}'::jsonb);
    source_key text;
    source_value jsonb;
    existing_value jsonb;
begin
    for source_key, source_value in
        select key, value from jsonb_each(coalesce(source, '{}'::jsonb))
    loop
        if source_key in ('id', 'history') then
            continue;
        end if;

        if source_value is null or source_value = 'null'::jsonb then
            continue;
        end if;

        if jsonb_typeof(source_value) = 'string' and btrim(source_value #>> '{}') = '' then
            continue;
        end if;

        if jsonb_typeof(source_value) = 'array' and jsonb_array_length(source_value) = 0 then
            continue;
        end if;

        existing_value := result->source_key;
        if existing_value is null
            or existing_value = 'null'::jsonb
            or (jsonb_typeof(existing_value) = 'string' and btrim(existing_value #>> '{}') = '')
            or (jsonb_typeof(existing_value) = 'array' and jsonb_array_length(existing_value) = 0)
        then
            result := jsonb_set(result, array[source_key], source_value, true);
        end if;
    end loop;

    return result;
end;
$$;

create or replace function public.lb_import_lbu_client_records(imported jsonb)
returns table(inserted_clients integer, updated_clients integer, skipped_history_entries integer)
language plpgsql
as $$
declare
    total_history_entries integer := 0;
    inserted_history_entries integer := 0;
    updated_history_entries integer := 0;
begin
    create temp table if not exists lb_client_import_batch (
        seq integer,
        source_key text,
        match_key text,
        aliases jsonb,
        record jsonb,
        history_entry jsonb
    ) on commit drop;

    truncate table lb_client_import_batch;

    insert into lb_client_import_batch (seq, source_key, match_key, aliases, record, history_entry)
    select
        row_data.seq,
        row_data."sourceKey",
        row_data."matchKey",
        row_data.aliases,
        row_data.record,
        row_data."historyEntry"
    from jsonb_to_recordset(coalesce(imported, '[]'::jsonb)) as row_data(
        seq integer,
        "sourceKey" text,
        "matchKey" text,
        aliases jsonb,
        record jsonb,
        "historyEntry" jsonb
    );

    select count(*) into total_history_entries
    from lb_client_import_batch
    where history_entry is not null;

    create temp table if not exists lb_client_import_grouped (
        match_key text,
        first_seq integer,
        aliases text[],
        base_record jsonb,
        all_history jsonb
    ) on commit drop;

    truncate table lb_client_import_grouped;

    insert into lb_client_import_grouped (match_key, first_seq, aliases, base_record, all_history)
    select
        batch.match_key,
        min(batch.seq) as first_seq,
        array(
            select distinct alias_value
            from lb_client_import_batch alias_batch
            cross join lateral jsonb_array_elements_text(alias_batch.aliases) as alias_values(alias_value)
            where alias_batch.match_key = batch.match_key
                and alias_value <> ''
        ) as aliases,
        (array_agg(batch.record order by batch.seq))[1] as base_record,
        jsonb_agg(batch.history_entry order by batch.seq) as all_history
    from lb_client_import_batch batch
    group by batch.match_key;

    create temp table if not exists lb_client_import_matches (
        match_key text primary key,
        record_id bigint
    ) on commit drop;

    truncate table lb_client_import_matches;

    insert into lb_client_import_matches (match_key, record_id)
    select distinct on (grouped.match_key)
        grouped.match_key,
        records.id
    from lb_client_import_grouped grouped
    join public.lb_records records
        on (
            exists (
                select 1
                from unnest(grouped.aliases) as imported_alias(alias_value)
                where imported_alias.alias_value = any(public.lb_import_record_aliases(records.record))
            )
            or exists (
                select 1
                from jsonb_array_elements(grouped.all_history) as history_items(entry)
                where public.lb_import_record_has_source_key(records.record, history_items.entry->>'importSourceKey')
            )
        )
    order by grouped.match_key, records.id;

    create temp table if not exists lb_client_import_updates (
        record_id bigint primary key,
        base_record jsonb,
        new_history jsonb
    ) on commit drop;

    truncate table lb_client_import_updates;

    insert into lb_client_import_updates (record_id, base_record, new_history)
    select
        matches.record_id,
        grouped.base_record,
        coalesce((
            select jsonb_agg(history_items.entry order by history_items.ordinality)
            from jsonb_array_elements(grouped.all_history) with ordinality as history_items(entry, ordinality)
            join public.lb_records target_record on target_record.id = matches.record_id
            where not public.lb_import_record_has_source_key(target_record.record, history_items.entry->>'importSourceKey')
        ), '[]'::jsonb) as new_history
    from lb_client_import_grouped grouped
    join lb_client_import_matches matches on matches.match_key = grouped.match_key;

    select coalesce(sum(jsonb_array_length(new_history)), 0)::integer
    into updated_history_entries
    from lb_client_import_updates;

    update public.lb_records records
    set record = jsonb_set(
            public.lb_import_fill_missing_fields(records.record, updates.base_record),
            '{history}',
            case
                when jsonb_typeof(records.record->'history') = 'array' then records.record->'history'
                else '[]'::jsonb
            end || updates.new_history,
            true
        ),
        updated_at = timezone('utc', now())
    from lb_client_import_updates updates
    where records.id = updates.record_id
        and jsonb_array_length(updates.new_history) > 0;

    get diagnostics updated_clients = row_count;

    select coalesce(sum(jsonb_array_length(grouped.all_history)), 0)::integer
    into inserted_history_entries
    from lb_client_import_grouped grouped
    left join lb_client_import_matches matches on matches.match_key = grouped.match_key
    where matches.record_id is null;

    insert into public.lb_records (record)
    select jsonb_set(
        grouped.base_record,
        '{history}',
        grouped.all_history,
        true
    )
    from lb_client_import_grouped grouped
    left join lb_client_import_matches matches on matches.match_key = grouped.match_key
    where matches.record_id is null;

    get diagnostics inserted_clients = row_count;

    skipped_history_entries := greatest(
        total_history_entries - inserted_history_entries - updated_history_entries,
        0
    );

    return next;
end;
$$;
